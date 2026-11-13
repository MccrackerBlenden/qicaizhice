"""v3.0-A SQLite project store for the Python fallback server; no third-party deps."""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
from threading import RLock
from uuid import uuid4
import json, os, re, sqlite3

LIMIT = 8 * 1024 * 1024
LOCK = RLock()

class StoreError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)

def storage_dir():
    custom = os.environ.get('QZ_DATA_DIR')
    if custom:
        root = Path(custom)
        if not root.is_absolute():raise StoreError(500, 'QZ_DATA_DIR 必须是绝对路径')
        return root
    if os.name == 'nt':
        root = Path(os.environ.get('LOCALAPPDATA') or (Path.home()/'AppData'/'Local'))
        return root/'Qicaizhice'/'Projects'
    return Path(os.environ.get('XDG_DATA_HOME') or (Path.home()/'.local'/'share'))/'qicaizhice'/'projects'

def dumps(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def hash_json(obj):return sha256(dumps(obj).encode('utf-8')).hexdigest()
def validate_period_ledger(book):
    if book is None:return
    if not isinstance(book,dict) or book.get('schema')!='qcz.period-ledger.v1' or book.get('frequency') not in ('month','quarter') or book.get('flow_basis') not in ('period','ytd') or not isinstance(book.get('periods'),dict):raise StoreError(422,'期间账簿元信息非法')
    periods=book['periods']
    if len(periods)>120 or len(dumps(book))>2_000_000:raise StoreError(422,'期间账簿超限')
    required={'bs':('total_assets','total_liabilities','total_equity'),'is':('revenue','net_income'),'cf':('operating_cf',)}
    for period,row in periods.items():
        pattern=r'(?:19[0-9]{2}|20[0-9]{2}|2100)-(?:0[1-9]|1[0-2])' if book['frequency']=='month' else r'(?:19[0-9]{2}|20[0-9]{2}|2100)-Q[1-4]'
        if not isinstance(period,str) or not re.fullmatch(pattern,period) or not isinstance(row,dict):raise StoreError(422,'期间标识非法')
        for t,keys in required.items():
            r=row.get(t)
            if not isinstance(r,dict) or not isinstance(r.get('fields'),dict) or not isinstance(r.get('origin'),dict) or not isinstance(r.get('source'),dict):raise StoreError(422,'期间字段缺失')
            src=r['source']
            if not re.fullmatch(r'[a-fA-F0-9]{64}',str(src.get('sha256',''))) or src.get('unit') not in ('yuan','wan','yi') or not isinstance(src.get('file'),str) or len(src['file'])>180:raise StoreError(422,'期间来源无效')
            f=r['fields']
            for k in keys:
                if isinstance(f.get(k),bool) or not isinstance(f.get(k),(int,float)) or not __import__('math').isfinite(f[k]):raise StoreError(422,'期间必需金额缺失')
            for v in f.values():
                if v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not __import__('math').isfinite(v) or abs(v)>=1e15):raise StoreError(422,'期间金额非法')
        b=row['bs']['fields'];delta=b['total_assets']-b['total_liabilities']-b['total_equity']
        if abs(delta)>max(.05,abs(b['total_assets'])*.0001,abs(b['total_liabilities']+b['total_equity'])*.0001):raise StoreError(422,'期间资产负债表不平')

def validate_archive(a):
    if not isinstance(a, dict) or a.get('schema')!='qcz.project-archive.v1':raise StoreError(422,'项目包格式错误')
    if a.get('remote_sync') is not False or a.get('raw_original_files_included') is not False:raise StoreError(422,'项目隐私声明不匹配')
    revs=a.get('revisions')
    if not isinstance(revs,list) or not 1<=len(revs)<=25:raise StoreError(422,'历史版本数量异常')
    if a.get('checksum_sha256')!=hash_json({k:v for k,v in a.items() if k!='checksum_sha256'}):raise StoreError(422,'项目包哈希校验失败')
    ids=set()
    for r in revs:
        if not isinstance(r,dict) or not isinstance(r.get('id'),str) or len(r['id'])>100 or r['id'] in ids or r.get('sha256')!=hash_json(r.get('payload')):raise StoreError(422,'历史快照哈希校验失败')
        ids.add(r['id']);p=r['payload'];tables=p.get('tables',{}) if isinstance(p,dict) else {}
        if isinstance(p,dict):validate_period_ledger(p.get('period_data'))
        if not isinstance(p,dict) or p.get('schema')!='qcz.project-snapshot.v1' or not isinstance(p.get('name'),str) or not 0<len(p['name'].strip())<=80 or not all(k in p for k in ('source','sourceByYear','provenanceByYear')):raise StoreError(422,'财务快照缺少内容')
        if not isinstance(tables,dict) or any(not isinstance(tables.get(t),dict) for t in ('bs','is','cf')):raise StoreError(422,'三表结构非法')
        years=[sorted(tables.get(t,{})) for t in ('bs','is','cf')]
        if (not years[0] and not (p.get('period_data') and p['period_data'].get('periods'))) or not all(y==years[0] for y in years):raise StoreError(422,'必须包含完整年度三表或有效期间账簿')
        for t in ('bs','is','cf'):
            for row in tables[t].values():
                if not isinstance(row,dict) or not isinstance(row.get('fields'),dict):raise StoreError(422,'报表字段异常')
                for n in row['fields'].values():
                    if n is not None and (isinstance(n,bool) or not isinstance(n,(int,float)) or abs(n)>=1e15):raise StoreError(422,'非法财务数字')
    if a.get('active_id') not in ids:raise StoreError(422,'当前版本不存在')
    active=next(x['payload'] for x in revs if x['id']==a['active_id'])
    return {'name':active['name'],'year_count':len(active['tables']['bs']),'version_count':len(revs)}

class ProjectStore:
    def __init__(self):
        self.root=storage_dir();self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        try:os.chmod(self.root,0o700)
        except OSError:pass
        path=self.root/'projects.sqlite3'
        self.db=sqlite3.connect(str(path),timeout=5,check_same_thread=False,isolation_level=None)
        self.db.row_factory=sqlite3.Row
        version=self.db.execute('PRAGMA user_version').fetchone()[0]
        if version>1:raise StoreError(500,'数据库版本高于当前软件')
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA busy_timeout=5000')
        if version==0:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                self.db.execute('''CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,
                 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),
                 year_count INTEGER NOT NULL,version_count INTEGER NOT NULL,archive_json TEXT NOT NULL,checksum_sha256 TEXT NOT NULL)''')
                self.db.execute('PRAGMA user_version=1');self.db.execute('COMMIT')
            except Exception:self.db.execute('ROLLBACK');raise
        try:os.chmod(path,0o600)
        except OSError:pass
    def list(self):
        with LOCK:
            return [dict(r) for r in self.db.execute('SELECT id,display_name,created_at,updated_at,revision,year_count,version_count FROM projects ORDER BY updated_at DESC LIMIT 200').fetchall()]
    def load(self,project_id):
        if not re.fullmatch(r'[0-9a-f-]{36}',project_id):raise StoreError(400,'项目编号无效')
        with LOCK:row=self.db.execute('SELECT revision,archive_json FROM projects WHERE id=?',(project_id,)).fetchone()
        if row is None:raise StoreError(404,'项目不存在')
        archive=json.loads(row['archive_json']);validate_archive(archive)
        return {'id':project_id,'revision':row['revision'],'archive':archive}
    def save(self,body):
        if not isinstance(body,dict):raise StoreError(400,'请求格式错误')
        archive=body.get('archive');meta=validate_archive(archive)
        data=dumps(archive)
        if len(data.encode('utf-8'))>LIMIT:raise StoreError(413,'项目过大')
        project_id=body.get('id');expected=body.get('expected_revision')
        if project_id is not None and (not isinstance(project_id,str) or not re.fullmatch(r'[0-9a-f-]{36}',project_id)):raise StoreError(400,'项目编号错误')
        if project_id is not None and (not isinstance(expected,int) or isinstance(expected,bool) or expected<1):raise StoreError(400,'缺少历史版本号')
        now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        with LOCK:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                if project_id is None:
                    n=self.db.execute('SELECT count(*) FROM projects').fetchone()[0]
                    if n>=200:raise StoreError(409,'最多保存200家企业项目')
                    project_id=str(uuid4());rev=1
                    self.db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?)',(project_id,meta['name'],now,now,rev,meta['year_count'],meta['version_count'],data,archive['checksum_sha256']))
                else:
                    row=self.db.execute('SELECT revision FROM projects WHERE id=?',(project_id,)).fetchone()
                    if row is None:raise StoreError(404,'已保存项目不存在')
                    if row[0]!=expected:raise StoreError(409,'项目已在其他窗口更新，拒绝覆盖')
                    rev=expected+1
                    self.db.execute('UPDATE projects SET display_name=?,updated_at=?,revision=?,year_count=?,version_count=?,archive_json=?,checksum_sha256=? WHERE id=?',(meta['name'],now,rev,meta['year_count'],meta['version_count'],data,archive['checksum_sha256'],project_id))
                self.db.execute('COMMIT')
                return {'id':project_id,'revision':rev,'updated_at':now,'display_name':meta['name']}
            except Exception:self.db.execute('ROLLBACK');raise
    def backup(self):
        folder=self.root/'backups';folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        stamp=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')
        filename=f'projects_{stamp}_{uuid4().hex[:8]}.sqlite3';path=folder/filename
        with LOCK,sqlite3.connect(str(path)) as dest:self.db.backup(dest)
        try:os.chmod(path,0o600)
        except OSError:pass
        return {'file_name':filename,'backup_directory':str(folder)}
    def status(self):
        with LOCK:
            healthy=self.db.execute("PRAGMA quick_check").fetchone()[0]=="ok"
            count=self.db.execute("SELECT count(*) FROM projects").fetchone()[0]
        folder=self.root/"backups"
        backups=sum(1 for p in folder.glob("*.sqlite3") if p.is_file()) if folder.exists() else 0
        return {"healthy":healthy,"project_count":count,"backup_count":backups,"storage_type":"local-sqlite","cloud_sync":False}
    def close(self):
        with LOCK:self.db.close()
