// v3.0-F: opt-in OFFLINE maintenance. Never exports finance data in diagnostics.
import {DatabaseSync, backup as onlineBackup} from 'node:sqlite';
import {mkdir,stat,lstat,chmod,rm,rename,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {storageDirectory,archiveValidation} from './project_store.mjs';
const VERSION='v3.0-F', pattern=/^(?:projects_|safety_)[A-Za-z0-9T._-]+\.sqlite3$/;
const root=storageDirectory(),database=join(root,'projects.sqlite3'),folder=join(root,'backups');
const fail=(m)=>{throw Error(m)};
function checkFile(path,archives=true){
 if(!existsSync(path))fail('项目数据库不存在');
 const db=new DatabaseSync(path,{readOnly:true,timeout:2000});
 try{
  if(db.prepare('PRAGMA user_version').get().user_version!==1)fail('数据库版本不兼容（当前只支持 schema v1）');
  if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')fail('SQLite 完整性检测失败');
  const columns=new Set(db.prepare('PRAGMA table_info(projects)').all().map(x=>x.name));
  for(const c of ['id','display_name','revision','archive_json','checksum_sha256'])if(!columns.has(c))fail('缺少项目表或字段');
  const count=db.prepare('SELECT count(*) as n FROM projects').get().n;
  if(count>200)fail('企业项目数超出兼容范围');
  if(archives)for(const row of db.prepare('SELECT archive_json FROM projects').all())archiveValidation(JSON.parse(row.archive_json));
  return count;
 }finally{db.close()}
}
async function stopped(){
 for(let port=8791;port<=8800;port++){
  try{
   const r=await fetch(`http://127.0.0.1:${port}/__qz/health`,{signal:AbortSignal.timeout(150)});
   const obj=await r.json();if(obj.app==='qicaizhice-preview')fail('检测到企财智策仍在运行。请先停止体验版，再恢复。');
  }catch(e){if(String(e.message||e).includes('仍在运行'))throw e}
 }
}
async function backUp(prefix='projects_'){
 const count=checkFile(database);await mkdir(folder,{recursive:true,mode:0o700});
 const name=prefix+new Date().toISOString().replace(/[:.]/g,'-')+'_'+randomUUID().slice(0,8)+'.sqlite3';
 const dst=join(folder,name),src=new DatabaseSync(database,{readOnly:true,timeout:5000});
 try{await onlineBackup(src,dst);if(checkFile(dst)!==count)fail('备份项目数不一致');try{await chmod(dst,0o600)}catch{}return {name,count}}
 catch(e){await rm(dst,{force:true});throw e}
 finally{src.close()}
}
async function listBackups(){
 if(!existsSync(folder))return [];
 const all=(await readdir(folder)).filter(n=>pattern.test(n)).sort().reverse();
 const ans=[];for(const name of all.slice(0,150)){
  const st=await lstat(join(folder,name));if(st.isFile()&&!st.isSymbolicLink())ans.push({name,size:st.size});
 }return ans;
}
async function restore(filename){
 await stopped();
 if(!pattern.test(filename)||basename(filename)!==filename)fail('只能恢复备份目录内的合法 .sqlite3 文件');
 const backupFile=join(folder,filename);if(!existsSync(backupFile))fail('备份文件不存在');
 const info=await lstat(backupFile);if(!info.isFile()||info.isSymbolicLink())fail('只能恢复普通备份文件，拒绝链接');
 const expected=checkFile(backupFile);
 await mkdir(root,{recursive:true,mode:0o700});
 const stage=join(root,'.restore_'+randomUUID().replaceAll('-','')+'.sqlite3');
 let safety=null;
 const original=new DatabaseSync(backupFile,{readOnly:true,timeout:5000});
 try{
  await onlineBackup(original,stage);
 }finally{original.close()}
 try{
  if(checkFile(stage)!==expected)fail('临时恢复库不完整');
  if(existsSync(database)){
   safety=(await backUp('safety_')).name;
   const active=new DatabaseSync(database,{timeout:2000});
   try{const result=active.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(result.busy!==0)fail('数据库仍被其他进程使用，请停止服务')}finally{active.close()}
  }
  for(const suffix of ['-wal','-shm'])await rm(database+suffix,{force:true});
  await rename(stage,database);
  try{await chmod(database,0o600)}catch{}
  if(checkFile(database)!==expected)fail('恢复后完整性检查失败，请使用自动安全备份回滚');
  return {count:expected,safety};
 }finally{await rm(stage,{force:true})}
}
async function main(){
 const [action,filename,flag,value]=process.argv.slice(2);
 if(!['status','list','backup','restore','restore-index'].includes(action))fail('使用方式：status | list | backup | restore 文件名 --confirm RESTORE');
 if(action==='status'){
  const n=existsSync(database)?checkFile(database):0;
  console.log(`[OK] 企财智策 ${VERSION} 项目数据自检`);
  console.log(`数据库：${existsSync(database)?'完整、兼容':'未创建（新用户正常）'}；企业项目数：${n}`);
  console.log(`可用备份数：${(await listBackups()).length}；本机存储：启用；云同步：不启用`);
  console.log('此诊断不包含企业名称、财务金额和报表正文。');
 }else if(action==='list'){
  console.log('可恢复的本地备份（不会自动恢复）：');const all=await listBackups();
  for(const [i,x] of all.entries())console.log(`${String(i+1).padStart(3)}. ${x.name} (${Math.floor(x.size/1024)} KiB)`);
  if(!all.length)console.log('尚无备份。');
 }else if(action==='backup'){
  const r=await backUp();console.log(`[OK] 一致性备份：${r.name}；项目数：${r.count}`);
  console.log('请将备份另行复制到你控制的安全位置。');
 }else{
  if(flag!=='--confirm'||value!=='RESTORE'||!filename)fail('恢复需要显式 RESTORE 确认');
  let choice=filename;
  if(action==='restore-index'){const entries=await listBackups();if(!/^[1-9]\d{0,2}$/.test(filename||'')||Number(filename)>entries.length)fail('请选择列表中的有效序号');choice=entries[Number(filename)-1].name}
  const r=await restore(choice);console.log(`[OK] 恢复完成；项目数：${r.count}`);
  if(r.safety)console.log('恢复前自动安全备份：'+r.safety);
  console.log('请重新运行软件并核验项目内容。');
 }
}
main().catch(e=>{console.error('[ERROR] '+String(e.message||e).split('\n')[0].slice(0,220));process.exitCode=2});
