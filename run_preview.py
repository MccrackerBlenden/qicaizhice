"""Qicaizhice preview v0.3: read-only local server with explicit shutdown."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlsplit, unquote
from datetime import datetime, timezone
import threading, webbrowser, os, json, secrets, socket, subprocess, sys, time, re
from storage.project_store import ProjectStore, StoreError

ROOT = Path(__file__).resolve().parent
# Exact public workspace resources referenced by the current workbench.
WORKSPACE_ASSETS = frozenset([
    'index.html', 'style.css', 'research.js', 'research_robust.js', 'research_joint.js',
    'research_evidence.js', 'report_studio.js', 'diagnostics.js', 'data_governance.js', 'user_insights.js',
    'project_archive.js', 'report_registry.js', 'project_store_client.js', 'import_guard.js', 'period_analysis.js', 'period_ui.js', 'continuity_analysis.js', 'case_workflow.js', 'experience_delivery.js', 'user_financials.js',
    'disclosure_reconcile.js', 'pdf_auto.js', 'sec_edgar.js', 'cn_disclosure.js', 'workflow.js',
    'app.js'
])
START_PORT, LAST_PORT = 8791, 8800
INSTANCE_ID = secrets.token_hex(16)
STOP_TOKEN = secrets.token_hex(24)
ACTIVE_PORT = None
SESSION_FILE = None
SEC_LAST_CALL = 0
CN_LAST_CALL = 0
CN_LOCK = threading.Lock()
SEC_LOCK = threading.Lock()
PROJECT_STORE = None

def clean_session():
    global SESSION_FILE
    if SESSION_FILE and SESSION_FILE.exists():
        try:
            data=json.loads(SESSION_FILE.read_text(encoding='utf-8'))
            if data.get('instanceId')==INSTANCE_ID and data.get('pid')==os.getpid():
                SESSION_FILE.unlink(missing_ok=True)
        except (OSError, json.JSONDecodeError):pass

class Preview(SimpleHTTPRequestHandler):
    def json_response(self, code, payload):
        raw=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def project_api(self):
        path=urlsplit(self.path).path
        if not (path=='/api/projects' or path.startswith('/api/projects/')):return False
        if PROJECT_STORE is None:return self.json_response(503,{'ok':False,'error':'项目数据库尚未就绪'}) or True
        if self.headers.get('Host')!=f'127.0.0.1:{ACTIVE_PORT}':
            self.json_response(403,{'ok':False,'error':'仅允许本机访问'});return True
        if self.command=='POST' and (self.headers.get('Origin')!=f'http://127.0.0.1:{ACTIVE_PORT}' or self.headers.get('X-QZ-Local-Request')!='1'):
            self.json_response(403,{'ok':False,'error':'只允许本地页面主动保存'});return True
        try:
            if self.command=='GET':
                if path=='/api/projects/status':self.json_response(200,{'ok':True,**PROJECT_STORE.status()});return True
                if path=='/api/projects':self.json_response(200,{'ok':True,'projects':PROJECT_STORE.list()});return True
                match=re.fullmatch(r'/api/projects/([0-9a-f-]{36})',path)
                if match:self.json_response(200,{'ok':True,**PROJECT_STORE.load(match.group(1))});return True
            if self.command=='POST':
                if path=='/api/projects/backup':self.json_response(200,{'ok':True,**PROJECT_STORE.backup()});return True
                if path=='/api/projects':
                    length=int(self.headers.get('Content-Length','0'))
                    if length<=0 or length>8*1024*1024+16384:
                        self.json_response(413,{'ok':False,'error':'项目包过大'});return True
                    body=json.loads(self.rfile.read(length))
                    self.json_response(200,{'ok':True,**PROJECT_STORE.save(body)});return True
            self.json_response(405,{'ok':False,'error':'不支持该操作'})
        except StoreError as e:self.json_response(e.status,{'ok':False,'error':str(e)})
        except (ValueError, TypeError, json.JSONDecodeError):self.json_response(400,{'ok':False,'error':'JSON格式不正确'})
        except Exception:self.json_response(500,{'ok':False,'error':'本地项目库操作失败'})
        return True
    def do_POST(self):
        if self.project_api():return
        endpoint=urlsplit(self.path).path
        if endpoint in ('/api/reports/export/pdf','/api/reports/export/xlsx'):
            if (self.headers.get('Host')!=f'127.0.0.1:{ACTIVE_PORT}' or
                self.headers.get('Origin')!=f'http://127.0.0.1:{ACTIVE_PORT}' or
                self.headers.get('X-QZ-Local-Request')!='1'):
                return self.json_response(403,{'ok':False,'error':'仅允许本机工作台发起导出'})
            try:
                from storage.report_export import generate
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1024*1024:return self.json_response(413,{'ok':False,'error':'报告体积超过1MB'})
                data=json.loads(self.rfile.read(length))
                kind=endpoint.rsplit('/',1)[-1]
                output=generate(data,kind)
                if not 100<len(output)<=12*1024*1024:raise ValueError('生成的文件异常')
                self.send_response(200)
                self.send_header('Content-Type','application/pdf' if kind=='pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                self.send_header('Content-Disposition',f'attachment; filename="qcz-report.{kind}"')
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Length',str(len(output)))
                self.end_headers();self.wfile.write(output)
            except (ValueError,RuntimeError,KeyError,TypeError) as e:
                self.json_response(503,{'ok':False,'error':'报告导出未完成：'+str(e)[:180]})
            except Exception:self.json_response(503,{'ok':False,'error':'本地报告服务无法生成文件'})
            return

        if urlsplit(self.path).path=='/api/cn-pdf-integrity':
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://127.0.0.1:{ACTIVE_PORT}':
                return self.json_response(403,{'ok':False,'error':'禁止跨来源请求'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<8 or length>2048:return self.json_response(413,{'ok':False,'error':'请求体大小不合法'})
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict) or not isinstance(data.get('url'),str):
                    return self.json_response(400,{'ok':False,'error':'请输入PDF直接链接'})
                global CN_LAST_CALL
                with CN_LOCK:
                    if time.monotonic()-CN_LAST_CALL<2:
                        return self.json_response(429,{'ok':False,'error':'官方原件核对至少间隔2秒'})
                    CN_LAST_CALL=time.monotonic()
                result=subprocess.run([sys.executable,str(ROOT/'engine'/'api_cn_pdf_verify.py')],
                    input=json.dumps({'url':data['url']}),capture_output=True,text=True,timeout=22,
                    cwd=ROOT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                output=json.loads(result.stdout)
                return self.json_response(200 if output.get('ok') else 422,output)
            except Exception:
                return self.json_response(503,{'ok':False,'error':'在线原件核验未完成，人工证据功能仍可使用'})
        if urlsplit(self.path).path=='/api/sec-companyfacts':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<4 or length>1024:return self.json_response(413,{'ok':False,'error':'请求过大'})
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict):return self.json_response(400,{'ok':False,'error':'无效JSON'})
                global SEC_LAST_CALL
                with SEC_LOCK:
                    if time.monotonic()-SEC_LAST_CALL<1.5:
                        return self.json_response(429,{'ok':False,'error':'请求 SEC 官方数据请间隔至少1.5秒'})
                    SEC_LAST_CALL=time.monotonic()
                result=subprocess.run([sys.executable,str(ROOT/'engine'/'api_sec_fetch.py')],
                    input=json.dumps(request),capture_output=True,text=True,timeout=28,cwd=ROOT,
                    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                data=json.loads(result.stdout)
                return self.json_response(200 if data.get('ok') else 422,data)
            except Exception:
                return self.json_response(503,{'ok':False,'error':'SEC在线请求未完成，请改为离线JSON导入。'})
        if urlsplit(self.path).path=='/api/pdf-extract':
            try:
                from urllib.parse import parse_qs
                q=parse_qs(urlsplit(self.path).query)
                start=int(q.get('start',['1'])[0]); limit=int(q.get('limit',['30'])[0])
                length=int(self.headers.get('Content-Length','0'))
                if length<100 or length>15*1024*1024 or not 1<=start<=3000 or not 1<=limit<=30:
                    return self.json_response(413,{'ok':False,'error':'非法 PDF 大小或页码参数'})
                result=subprocess.run([sys.executable,str(ROOT/'engine'/'api_pdf_extract.py'),str(start),str(limit)],
                    input=self.rfile.read(length),capture_output=True,timeout=25,
                    cwd=ROOT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                data=json.loads(result.stdout.decode('utf-8'))
                return self.json_response(200 if data.get('ok') else 422,data)
            except Exception as e:
                return self.json_response(503,{'ok':False,'error':'本地PDF解析失败，请改用人工核对台账。','detail':str(e)[:120]})
        if urlsplit(self.path).path in ('/api/scenario','/api/optimize'):
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<1 or length>8192:
                    return self.json_response(413,{'ok':False,'error':'Invalid request size'})
                request=json.loads(self.rfile.read(length))
                if (not isinstance(request,dict) or request.get('company') not in ('VPM-071','VPM-101','VPM-203')
                    or request.get('year')!=2022):
                    return self.json_response(400,{'ok':False,'error':'Only validated 2022 synthetic enterprises'})
                is_optimization=urlsplit(self.path).path=='/api/optimize'
                script='api_optimize.py' if is_optimization else 'api_scenario.py'
                result=subprocess.run(
                    [sys.executable,str(ROOT/'engine'/script)],cwd=ROOT,
                    input=json.dumps(request),capture_output=True,text=True,timeout=60 if is_optimization else 25,
                    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                payload=json.loads(result.stdout)
                return self.json_response(200 if payload.get('ok') else 422,payload)
            except (OSError,ValueError,subprocess.TimeoutExpired,json.JSONDecodeError):
                return self.json_response(503,{'ok':False,'error':'计算服务未能完成；请检查安全数据完整性和本地 Python 环境。'})
        if urlsplit(self.path).path!='/__qz/stop' or self.headers.get('X-QZ-Stop-Token')!=STOP_TOKEN:
            self.json_response(403,{'ok':False,'error':'Unauthorized'})
            return
        self.json_response(200, {'ok':True,'message':'Shutting down preview server'})
        threading.Thread(target=self.server.shutdown,daemon=True).start()
    def do_GET(self):
        if self.project_api():return
        pathname=unquote(urlsplit(self.path).path)
        if pathname=='/__qz/health':
            self.json_response(200,{'app':'qicaizhice-preview','version':'Local','pid':os.getpid(),'port':ACTIVE_PORT,'instanceId':INSTANCE_ID})
            return
        if pathname=='/health':
            self.json_response(200,{'ok':True,'version':'Local'})
            return
        if pathname.startswith('/engine/') or pathname.startswith('/storage/') or '/.qz_session_' in pathname or pathname.lower().endswith(('.py','.mjs','.bat','.cmd','.ps1','.sqlite3','.sqlite','.db')):
            self.json_response(403,{'error':'Restricted file'})
            return
        if pathname.startswith('/workspace/'):
            leaf=pathname[len('/workspace/'):]
            if leaf not in WORKSPACE_ASSETS:
                if re.fullmatch(r'[a-z]+',leaf):
                    self.path='/workspace/index.html'  # SPA route, not a JavaScript request.
                else:
                    return self.json_response(404,{'error':'Unknown workspace asset'})
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

def port_free(port):
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as sock:
        try: sock.bind(('127.0.0.1',port));return True
        except OSError:return False

if __name__=='__main__':
    try:PROJECT_STORE=ProjectStore()
    except Exception as e:print('本机项目库未能初始化：',str(e),flush=True)
    port=next((p for p in range(START_PORT,LAST_PORT+1) if port_free(p)),None)
    if port is None:
        print('启动失败：8791—8800 端口均不可用。',flush=True)
        raise SystemExit(1)
    ACTIVE_PORT=port
    SESSION_FILE=ROOT/f'.qz_session_{port}.json'
    handler=partial(Preview,directory=str(ROOT))
    try:
        server=ThreadingHTTPServer(('127.0.0.1',port),handler)
        payload={'app':'qicaizhice-preview','version':'Local','pid':os.getpid(),'port':port,'instanceId':INSTANCE_ID,'token':STOP_TOKEN,'runtime':'python','created':datetime.now(timezone.utc).isoformat()}
        SESSION_FILE.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
        suffix='?no3d=1' if os.getenv('QZ_SAFE_MODE')=='1' else ''
        url=f'http://127.0.0.1:{port}/{suffix}'
        print('========================================================',flush=True)
        print(f'企财智策本地服务已启动：{url}',flush=True)
        print(f'工作台：http://127.0.0.1:{port}/workspace/overview',flush=True)
        print('请保留此黑色窗口。关闭浏览器不会结束服务器。',flush=True)
        print('退出：此窗口 Ctrl+C，或双击“停止体验版.bat”。',flush=True)
        print('========================================================',flush=True)
        if os.getenv('QZ_NO_BROWSER')!='1':
            threading.Timer(0.6,lambda:webbrowser.open(url)).start()
        try:server.serve_forever(poll_interval=0.15)
        except KeyboardInterrupt:print('服务器已停止。',flush=True)
        finally: server.server_close()
    finally:
        if PROJECT_STORE is not None:
            try:PROJECT_STORE.close()
            except Exception:pass
        clean_session()
