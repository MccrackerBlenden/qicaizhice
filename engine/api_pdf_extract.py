"""Qicaizhice v1.6. Read-only PDF candidate extraction from local in-memory bytes.

Does NOT authenticate issuer/official provenance, OCR scans, or certify facts.
All candidates require visual confirmation before any reconciliation.
"""
from __future__ import annotations
import sys, io, re, json, hashlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
from pypdf import PdfReader

ALIASES = {
 'bs': {
 'total_assets':['Total assets','资产总计','资产合计'],
 'total_liabilities':['Total liabilities','负债合计','负债总计'],
 'total_equity':['Total equity','所有者权益合计','股东权益合计','所有者权益（或股东权益）合计'],
 'current_assets':['Current assets','流动资产合计'],
 'current_liabilities':['Current liabilities','流动负债合计'],
 'accounts_receivable':['Accounts receivable','应收账款'],
 'inventory':['Inventories','Inventory','存货'],
 'cash':['Cash and cash equivalents','货币资金']},
 'is':{
 'revenue':['Operating revenue','Revenue','营业收入'],
 'net_income':['Net income','净利润'],
 'cogs':['Cost of sales','Operating cost','营业成本'],
 'gross_profit':['Gross profit','毛利润','毛利'],
 'selling_expense':['Selling expense','销售费用'],
 'admin_expense':['Administrative expenses','管理费用'],
 'rd_expense':['R&D expense','Research and development expense','研发费用'],
 'interest_expense':['Interest expense','利息费用']},
 'cf':{
 'operating_cf':['Operating CF','Net cash from operating activities','经营活动产生的现金流量净额'],
 'investing_cf':['Investing CF','投资活动产生的现金流量净额'],
 'financing_cf':['Financing CF','筹资活动产生的现金流量净额'],
 'fx_effect':['FX effect','汇率变动对现金及现金等价物的影响'],
 'opening_cash':['Opening cash','期初现金及现金等价物余额'],
 'ending_cash':['Ending cash','期末现金及现金等价物余额'],
 'net_change_cash':['Net increase','现金及现金等价物净增加额']}
}
STATEMENT_HEADERS={
 'bs':['balance sheet','资产负债表'],
 'is':['income statement','profit statement','利润表'],
 'cf':['cash flow','现金流量表']}
# Only numbers in financial amounts, not text, dates or financial narrative.
VALUE=re.compile(r'^\s*([\(（-]?\s*[+-]?\s*(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?\s*[\)）]?)\s*$')
AMOUNT=re.compile(r'(?:\(\s*|（\s*|-\s*)?\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?(?:\s*\)|）)?|(?:\(\s*|（\s*|-\s*)?\d+(?:\.\d+)?(?:\s*\)|）)?')

def amount(s):
 s=s.strip().replace(',','').replace('，','').replace(' ','')
 if not VALUE.fullmatch(s):return None
 if s[0] in '（(' and s[-1] in ')）':s='-'+s[1:-1]
 try:
  n=float(s)
  return n if abs(n)<1e18 else None
 except ValueError:return None

def normalize_line(line):
 return re.sub(r'\s+',' ',line.strip()).lower()

def head_matches(t,line):
 l=normalize_line(line)
 return [key for key,aliases in ALIASES[t].items() if any(l==a.lower() for a in aliases)]

def get_unit(text):
 low=text.lower()
 if any(s in low for s in ['cny 10,000','单位：万元','单位:万元','人民币万元','金额单位：万元','unit: cny 10,000']):return 'wan'
 if any(s in low for s in ['单位：亿元','单位:亿元','人民币亿元']):return 'yi'
 if any(s in low for s in ['单位：元','单位:元','人民币元','cny yuan','unit: yuan']):return 'yuan'
 return 'unknown'

def extract(pdf:bytes, start:int=1, limit:int=30):
 if len(pdf)<100 or len(pdf)>15*1024*1024 or not pdf.startswith(b'%PDF-'):
  raise ValueError('文件必须为 15MB 以内有效 PDF')
 try: doc=PdfReader(io.BytesIO(pdf),strict=False)
 except Exception as ex:raise ValueError('PDF 无法读取，可能加密或格式损坏') from ex
 if doc.is_encrypted:
  try:
   if doc.decrypt('')==0:raise ValueError('PDF 已加密，请先提供未加密的合法副本')
  except Exception as ex:raise ValueError('PDF 已加密，不能解析') from ex
 total=len(doc.pages)
 if total>3000:raise ValueError('超出支持的页数')
 if not 1<=start<=total:raise ValueError('起始页超出PDF范围')
 stop=min(total,start+max(1,min(limit,30))-1)
 suggestions=[];pages=[];truncated=0
 for p in range(start-1,stop):
  page=doc.pages[p]
  txt=page.extract_text(extraction_mode='plain') or ''
  if len(txt)>100000:txt=txt[:100000];truncated+=1
  # Clean text, but DO NOT merge columns or guess which column is current year.
  lines=[x.strip() for x in txt.splitlines() if x.strip()]
  hdr=' '.join(lines[:17]).lower()
  kinds=[t for t,hs in STATEMENT_HEADERS.items() if any(k in hdr for k in hs)]
  t=kinds[0] if len(kinds)==1 else None
  matches=re.findall(r'20\d{2}[-年/]\d{1,2}[-月/]\d{1,2}',hdr)
  # Restrict to explicit end-year; without full date the year is not trusted.
  yr=int(matches[0][:4]) if matches and all(m[:4]==matches[0][:4] for m in matches) else None
  unit=get_unit(' '.join(lines[:20]))
  detected=0
  if t and yr and unit!='unknown':
   for j,line in enumerate(lines):
    keys=head_matches(t,line)
    if len(keys)!=1:continue
    key=keys[0]
    # Exact single amount on same labeled line (common) or next line (reportlab).
    # If there are >=2 amounts (current/prior year), refuse automatic selection.
    candidates=[]
    for alias in ALIASES[t][key]:
     if line.lower().startswith(alias.lower()):
      rest=line[len(alias):].strip(' ：:　\t')
      if rest:
       n=amount(rest)
       if n is not None:candidates.append((rest,n))
    if not candidates and j+1<len(lines):
     v=amount(lines[j+1]);
     if v is not None:candidates.append((lines[j+1],v))
    if len(candidates)!=1:continue
    raw,v=candidates[0]
    suggestions.append({'statement':t,'field':key,'year':yr,'period_end':f'{yr}-12-31',
      'page':p+1,'value':v,'valueRaw':raw,'unit':unit,'line':line,'label':line,
      'status':'NEEDS_VISUAL_REVIEW','candidate_id':f'{p+1}-{t}-{key}-{len(suggestions)}'})
    detected+=1
  pages.append({'page':p+1,'has_selectable_text':bool(txt.strip()),'characters':len(txt),'statement':t,
    'year':yr,'unit':unit,'candidates':detected,
    'message':'扫描件或文本不可提取，需要 OCR/人工核对' if not txt.strip() else ('缺少明确报表、年度或单位，未自动猜测' if not t or not yr or unit=='unknown' else '')})
 return {'ok':True,'schema':'qicai-local-pdf-candidates-1.6','pdf_sha256':hashlib.sha256(pdf).hexdigest(),
 'page_count':total,'scanned_range':[start,stop],'candidates':suggestions[:200], 'pages':pages,
 'authenticity_verified':False,'automatic_match':False,'ocr_used':False,
 'warning':'所有候选都必须由用户目视核对PDF对应页码、报表期间、单位和列，再选择确认。未读取的页、未识别字段不代表核验通过。'}

if __name__=='__main__':
 try:
  start=int(sys.argv[1]) if len(sys.argv)>1 else 1
  limit=int(sys.argv[2]) if len(sys.argv)>2 else 30
  result=extract(sys.stdin.buffer.read(15*1024*1024+1),start,limit)
  print(json.dumps(result,ensure_ascii=False,separators=(',',':')))
 except Exception as e:
  print(json.dumps({'ok':False,'error':str(e)[:300]},ensure_ascii=False))
