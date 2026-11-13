"""Verify bytes at a user-specified, strictly allowlisted Chinese disclosure PDF URL.

This is a single-document byte integrity check, NOT a company/announcement authenticity
or latest-revision certification. No redirects, arbitrary URLs, disk writes or PDF parsing.
"""
import datetime
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

ALLOWED_HOSTS = frozenset({
    'static.cninfo.com.cn',
    'www.cninfo.com.cn',
    'www.sse.com.cn',
    'static.sse.com.cn',
    'www.szse.cn',
    'disc.static.szse.cn',
    'www.bse.cn',
})
MAX_BYTES = 18 * 1024 * 1024

class VerifyError(ValueError):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise VerifyError('服务器要求跳转；为避免重定向到非官方主机，本次核验已停止。请使用直接指向 PDF 的公告原件网址。')


def normalize_url(raw):
    if not isinstance(raw, str) or not raw or len(raw) > 700 or any(ord(c) < 32 for c in raw):
        raise VerifyError('网址不能为空、超过700字符或包含控制字符')
    try:
        parts = urllib.parse.urlsplit(raw)
        host = (parts.hostname or '').lower().rstrip('.')
        port = parts.port
    except ValueError:
        raise VerifyError('公告网址格式无效')
    if parts.scheme != 'https' or port is not None or parts.username is not None or parts.password is not None:
        raise VerifyError('只支持无账号信息、无自定义端口的 HTTPS 官方 PDF 直接链接')
    if host not in ALLOWED_HOSTS:
        raise VerifyError('不在允许的官方披露域名白名单；不会对任意外部或内网地址发起请求')
    if not parts.path.lower().endswith('.pdf'):
        raise VerifyError('请提供直接以 .pdf 结尾的原件链接，而不是公告查询页或跳转链接')
    if parts.fragment:
        raise VerifyError('原件 URL 不能包含锚点')
    return urllib.parse.urlunsplit((parts.scheme, host, parts.path, parts.query, '')), host


def fetch_pdf(raw, opener=None):
    url, host = normalize_url(raw)
    if opener is None:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Qicaizhice-Local-Provenance-Check/1.9 (+local offline research; no indexing)',
        'Accept': 'application/pdf,application/octet-stream;q=0.9',
    }, method='GET')
    try:
        with opener.open(request, timeout=12) as response:
            status = response.getcode()
            if status != 200:
                raise VerifyError('公告站点未返回 HTTP 200，不能据此判定来源一致')
            length_header = response.headers.get('Content-Length', '')
            if length_header and int(length_header) > MAX_BYTES:
                raise VerifyError('远程 PDF 超过 18MB 安全限制，未下载')
            total=0
            digest=hashlib.sha256()
            magic=b''
            while True:
                block=response.read(65536)
                if not block: break
                total += len(block)
                if total > MAX_BYTES: raise VerifyError('远程 PDF 超过 18MB 安全限制，已终止')
                if len(magic)<5:magic=(magic+block)[:5]
                digest.update(block)
            if total < 100 or magic != b'%PDF-':
                raise VerifyError('官方网址未返回有效 PDF 文件内容，不能标记一致')
            return {
                'ok': True,
                'status': 'REMOTE_PDF_FETCHED_NOT_AUTHENTICITY_CERTIFIED',
                'url': url, 'host': host, 'sha256': digest.hexdigest(),
                'bytes': total, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'authenticityCertified': False, 'latestRevisionCertified': False,
                'message': '已取得指定官方域名直接 PDF 的完整字节并计算 SHA-256。尚未验证公告主体、报告版本、最新更正或审计真实性。'
            }
    except VerifyError:
        raise
    except urllib.error.HTTPError as e:
        raise VerifyError('获取原件失败：HTTP '+str(e.code)+'；未建立远端指纹匹配')
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise VerifyError('官方公告原件请求失败；请检查网络访问、网站限制或改用人工核对（'+type(e).__name__+'）')


def main():
    try:
        raw=sys.stdin.buffer.read(2048)
        if not raw or len(raw)>2048:raise VerifyError('请求大小不合法')
        data=json.loads(raw)
        if not isinstance(data,dict):raise VerifyError('仅接受包含 url 的对象')
        result=fetch_pdf(data.get('url'))
    except (VerifyError, ValueError, TypeError, json.JSONDecodeError) as e:
        result={'ok':False,'status':'NOT_VERIFIED','error':str(e)[:220], 'authenticityCertified':False}
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
