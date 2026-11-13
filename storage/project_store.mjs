// Qicaizhice v3.0-A: single-user, loopback-only project library.
// Independent of the extracted app folder. No cloud sync, no implicit saves.
import {DatabaseSync,backup as onlineBackup} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';

const MAX_ARCHIVE=8*1024*1024, MAX_PROJECTS=200;
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const failure=(code,message)=>Object.assign(new Error(message),{status:code});
export function storageDirectory(){
 const specified=process.env.QZ_DATA_DIR;
 if(specified){if(!isAbsolute(specified))throw failure(500,'QZ_DATA_DIR 必须是绝对路径');return specified;}
 if(process.platform==='win32')return join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'Qicaizhice','Projects');
 return join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'qicaizhice','projects');
}
function validatePeriodLedger(book){
 if(book==null)return;
 if(book.schema!=='qcz.period-ledger.v1'||!['month','quarter'].includes(book.frequency)||!['period','ytd'].includes(book.flow_basis)||!book.periods||typeof book.periods!=='object'||Array.isArray(book.periods))throw failure(422,'期间账簿元信息非法');
 const periods=Object.entries(book.periods);if(periods.length>120||JSON.stringify(book).length>2_000_000)throw failure(422,'期间记录超过限制');
 const required={bs:['total_assets','total_liabilities','total_equity'],is:['revenue','net_income'],cf:['operating_cf']};
 for(const [period,row] of periods){const valid=book.frequency==='month'?/^(19\d\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(period):/^(19\d\d|20\d\d|2100)-Q[1-4]$/.test(period);
  if(!valid||!row)throw failure(422,'期间标识非法');
  for(const type of ['bs','is','cf']){const record=row[type];if(!record||!record.fields||!record.source||!record.origin||!/^[a-f0-9]{64}$/i.test(record.source.sha256||''))throw failure(422,'期间来源或字段缺失');
   if(!['wan','yuan','yi'].includes(record.source.unit)||typeof record.source.file!=='string'||record.source.file.length>180)throw failure(422,'期间来源单位或文件名非法');
   if(required[type].some(k=>!Number.isFinite(record.fields[k])))throw failure(422,'期间必需金额缺失');
   for(const v of Object.values(record.fields))if(v!==null&&(!Number.isFinite(v)||Math.abs(v)>=1e15))throw failure(422,'期间金额非法');
  }
  const b=row.bs.fields,delta=b.total_assets-b.total_liabilities-b.total_equity;
  if(Math.abs(delta)>Math.max(.05,Math.abs(b.total_assets)*.0001,Math.abs(b.total_liabilities+b.total_equity)*.0001))throw failure(422,'期间资产负债表不平');
 }
}
function archiveValidation(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!=='qcz.project-archive.v1')throw failure(422,'非企财智策项目包');
 if(value.remote_sync!==false||value.raw_original_files_included!==false)throw failure(422,'项目包声明不匹配');
 if(!Array.isArray(value.revisions)||value.revisions.length<1||value.revisions.length>25)throw failure(422,'修订版本数量无效');
 if(typeof value.active_id!=='string'||!value.revisions.some(x=>x.id===value.active_id))throw failure(422,'活动版本不存在');
 const {checksum_sha256,...rest}=value;
 if(!/^[a-f0-9]{64}$/.test(checksum_sha256||'')||sha(JSON.stringify(rest))!==checksum_sha256)throw failure(422,'项目包校验失败，请先导出最新项目');
 const ids=new Set();
 for(const r of value.revisions){
  if(!r||typeof r.id!=='string'||r.id.length>100||ids.has(r.id)||!r.payload||typeof r.payload!=='object'||Array.isArray(r.payload)||!/^[a-f0-9]{64}$/.test(r.sha256||'')||sha(JSON.stringify(r.payload))!==r.sha256)throw failure(422,'历史快照校验失败');
  ids.add(r.id);
  const p=r.payload;
  validatePeriodLedger(p?.period_data);
  if(!p||p.schema!=='qcz.project-snapshot.v1'||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!p.tables||!p.source||!p.sourceByYear||!p.provenanceByYear)throw failure(422,'项目快照缺失必要字段');
  const years=['bs','is','cf'].map(t=>Object.keys(p.tables[t]||{}).sort().join(','));
  if((!years[0]&&!(p.period_data&&Object.keys(p.period_data.periods||{}).length))||years.some(y=>y!==years[0]))throw failure(422,'必须包含完整年度三表或有效期间账簿');
  for(const t of ['bs','is','cf'])for(const row of Object.values(p.tables[t])){
   if(!row||!row.fields||typeof row.fields!=='object')throw failure(422,'财务字段无效');
   for(const x of Object.values(row.fields))if(x!==null&&(!Number.isFinite(x)||Math.abs(x)>=1e15))throw failure(422,'财务金额非法');
  }
 }
 const active=value.revisions.find(x=>x.id===value.active_id).payload;
 return {name:active.name,yearCount:Object.keys(active.tables.bs).length,versionCount:value.revisions.length};
}
export class ProjectStore{
 constructor(db,root){this.db=db;this.root=root;}
 static async open(){
  const root=storageDirectory();await mkdir(root,{recursive:true,mode:0o700});
  try{await chmod(root,0o700)}catch{}
  const location=join(root,'projects.sqlite3');
  const db=new DatabaseSync(location,{timeout:5000});
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version>1){db.close();throw failure(500,'项目数据库版本高于当前程序，已拒绝修改；请使用更新版本');}
  db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  if(version===0){db.exec(`BEGIN IMMEDIATE;
   CREATE TABLE IF NOT EXISTS projects(
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>=1),
    year_count INTEGER NOT NULL, version_count INTEGER NOT NULL,
    archive_json TEXT NOT NULL, checksum_sha256 TEXT NOT NULL);
   PRAGMA user_version=1;
   COMMIT;`)}
  try{await chmod(location,0o600)}catch{}
  return new ProjectStore(db,root);
 }
 list(){return this.db.prepare('SELECT id, display_name,created_at,updated_at,revision,year_count,version_count FROM projects ORDER BY updated_at DESC LIMIT 200').all();}
 load(id){
  if(!/^[0-9a-f-]{36}$/.test(String(id)))throw failure(400,'项目编号非法');
  const row=this.db.prepare('SELECT revision,archive_json FROM projects WHERE id=?').get(id);
  if(!row)throw failure(404,'项目不存在');
  const archive=JSON.parse(row.archive_json);archiveValidation(archive);
  return {id,revision:row.revision,archive};
 }
 save({id=null,expected_revision=null,archive}){
  const encoded=JSON.stringify(archive);
  if(Buffer.byteLength(encoded,'utf8')>MAX_ARCHIVE)throw failure(413,'项目包超过8MB');
  const meta=archiveValidation(archive);
  if(id!==null&&!/^[0-9a-f-]{36}$/.test(String(id)))throw failure(400,'项目编号非法');
  if(id!==null&&(!Number.isInteger(expected_revision)||expected_revision<1))throw failure(400,'缺少有效的历史修订号');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const now=new Date().toISOString();let target=id;let rev;
   if(id===null){
    if(this.db.prepare('SELECT count(*) as n FROM projects').get().n>=MAX_PROJECTS)throw failure(409,'本机项目已达200个，请先归档');
    target=randomUUID();rev=1;
    this.db.prepare('INSERT INTO projects(id,display_name,created_at,updated_at,revision,year_count,version_count,archive_json,checksum_sha256) VALUES(?,?,?,?,?,?,?,?,?)')
       .run(target,meta.name,now,now,rev,meta.yearCount,meta.versionCount,encoded,archive.checksum_sha256);
   }else{
    const old=this.db.prepare('SELECT revision FROM projects WHERE id=?').get(id);
    if(!old)throw failure(404,'原项目不存在，已拒绝意外创建新项目');
    if(old.revision!==expected_revision)throw failure(409,'项目已经被另一个窗口修改，请先重新打开或另存项目包，不会覆盖');
    rev=expected_revision+1;
    this.db.prepare('UPDATE projects SET display_name=?,updated_at=?,revision=?,year_count=?,version_count=?,archive_json=?,checksum_sha256=? WHERE id=?')
     .run(meta.name,now,rev,meta.yearCount,meta.versionCount,encoded,archive.checksum_sha256,id);
   }
   this.db.exec('COMMIT');return {id:target,revision:rev,updated_at:now,display_name:meta.name};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async backup(){
  const folder=join(this.root,'backups');await mkdir(folder,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const dest=join(folder,`projects_${stamp}_${randomUUID().slice(0,8)}.sqlite3`);
  await onlineBackup(this.db,dest);try{await chmod(dest,0o600)}catch{}
  return {file_name:dest.split(/[\\/]/).at(-1),backup_directory:folder};
 }
 status(){
  let backups=0;const folder=join(this.root,'backups');
  if(existsSync(folder))backups=readdirSync(folder).filter(n=>/\.sqlite3$/.test(n)).length;
  return {healthy:this.check(),project_count:this.db.prepare('SELECT count(*) as n FROM projects').get().n,backup_count:backups,storage_type:'local-sqlite',cloud_sync:false};
 }
 check(){return this.db.prepare('PRAGMA quick_check').all().every(row=>Object.values(row)[0]==='ok');}
 close(){this.db.close();}
}
export {archiveValidation};
