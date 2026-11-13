"""SEC EDGAR Company Facts retrieval - local, explicit per-request, no caching.
The SEC is authoritative for the transport/source endpoint, not for accounting verification.
Strictly fixed HTTPS origin; user provided contact is used only in SEC User-Agent.
"""
import datetime as dt
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request

ALLOWED = {
  'us-gaap': {
    'Assets','Liabilities','StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'AssetsCurrent','LiabilitiesCurrent','CashAndCashEquivalentsAtCarryingValue',
    'RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet',
    'NetIncomeLoss','CostOfRevenue','CostOfGoodsAndServicesSold',
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInInvestingActivities','NetCashProvidedByUsedInFinancingActivities'
  },
  'ifrs-full': {'Assets','Liabilities','Equity','Revenue','ProfitLoss','CashFlowsFromUsedInOperatingActivities','CurrentAssets','CurrentLiabilities'}
}

def subset(raw):
    facts=raw.get('facts') or {}
    return {'cik':raw['cik'], 'entityName':str(raw.get('entityName',''))[:240],
            'facts':{tax:{tag:body for tag,body in (facts.get(tax) or {}).items() if tag in tags}
                     for tax,tags in ALLOWED.items()}}

def run(body):
    cik=str(body.get('cik','')).strip()
    contact=str(body.get('contact','')).strip()
    if not re.fullmatch(r'\d{1,10}',cik) or int(cik)==0:
        raise ValueError('CIK 应为 1—10 位正整数')
    if not re.fullmatch(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}',contact) or len(contact)>120:
        raise ValueError('使用官方接口前需要有效的联系邮箱（仅作为 SEC 请求 User-Agent）')
    cik=cik.zfill(10)
    url=f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json'
    request=urllib.request.Request(url,headers={'User-Agent':f'Qicaizhice-local-research/1.7 ({contact})',
        'Accept':'application/json','Accept-Encoding':'identity'})
    try:
        with urllib.request.urlopen(request,timeout=18) as response:
            if response.geturl()!=url:raise ValueError('SEC 响应发生了未经授权的重定向')
            if response.status!=200:raise ValueError(f'SEC 返回 HTTP {response.status}')
            blob=response.read(16*1024*1024+1)
            if len(blob)>16*1024*1024:raise ValueError('SEC 响应大于16MB，已停止')
    except urllib.error.HTTPError as ex:
        raise ValueError(f'SEC 返回 HTTP {ex.code}，可能是访问频率或主体编号限制') from ex
    except urllib.error.URLError as ex:
        raise ValueError('当前环境无法访问 SEC 官方 HTTPS 接口；可下载 JSON 后离线导入') from ex
    data=json.loads(blob.decode('utf-8'))
    if int(data.get('cik',0))!=int(cik) or not isinstance(data.get('facts'),dict):
        raise ValueError('官方数据结构或 CIK 校验失败')
    return {'ok':True,'source_status':'SEC_LIVE_ENDPOINT','source_url':url,
        'retrieved_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'raw_response_sha256':hashlib.sha256(blob).hexdigest(),
        'bytes':len(blob),'data':subset(data),
        'scope_note':'仅筛选标准 XBRL 概念；并非原始报告全文或审计证明。'}

def main():
    try:
        req=json.load(sys.stdin)
        if not isinstance(req,dict):raise ValueError('请求必须是 JSON 对象')
        out=run(req)
    except Exception as ex:
        out={'ok':False,'error':str(ex)[:280]}
    sys.stdout.write(json.dumps(out,ensure_ascii=False,separators=(',',':')))

if __name__=='__main__':main()
