/* Qicaizhice v2.3: user-controlled, offline, portable revision archive.
   Explicit export/local save only. Raw uploaded files are never included. */
(function(global){'use strict';
const SCHEMA='qcz.project-archive.v1', SNAP='qcz.project-snapshot.v1';
const TYPES=['bs','is','cf'],MAX_BYTES=8*1024*1024,MAX_VERSIONS=25,MAX_YEARS=80;
function enc(x){return new TextEncoder().encode(x)}
async function sha(s){const bytes=await global.crypto.subtle.digest('SHA-256',enc(s));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
function clone(x){return JSON.parse(JSON.stringify(x))}
function err(message){throw Error('项目包校验失败：'+message)}
function checkPayload(p){
 if(!p||p.schema!==SNAP||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)err('版本格式或企业名称无效');
 if(!p.tables||!p.source||!p.provenance||!p.provenanceByYear||!p.sourceByYear)err('三表、原始指纹或会计口径信息不完整');
 const keys=TYPES.map(t=>Object.keys(p.tables[t]||{}).sort());
 if(keys.some(z=>z.length>MAX_YEARS)||(!keys[0].length&&!(p.period_data&&Object.keys(p.period_data.periods||{}).length)))err('缺少完整年度三表或有效期间账簿');
 if(keys.some(z=>z.join(',')!==keys[0].join(',')))err('三张表的年度不一致');
 for(const yr of keys[0])if(!p.provenanceByYear[yr]||typeof p.provenanceByYear[yr]!=='object')err('缺少年度披露版本元信息');
 for(const t of TYPES){
  const info=p.source[t];if(!info||typeof info.label!=='string'||info.label.length>260||!['yuan','wan','yi'].includes(info.unit)||(!(!keys[0].length&&p.period_data&&info.sha==='')&&!/^[0-9a-f]{64}$/i.test(info.sha)&&info.sha!=='演示配置，不是文件上传'))err('源文件指纹或单位无效');
  for(const yr of keys[0]){
   const y=Number(yr),r=p.tables[t][yr],s=p.sourceByYear[t]?.[yr];
   if(!Number.isInteger(y)||y<1990||y>2100||!r||r.year!==y||!r.fields||!r.origin)err('年度或报表结构错误');
   if(!s||typeof s.label!=='string'||!['yuan','wan','yi'].includes(s.unit)||(!/^[0-9a-f]{64}$/i.test(s.sha)&&s.sha!=='演示配置，不是文件上传'))err('年度来源指纹缺失');
   for(const [field,value] of Object.entries(r.fields))if(!/^[a-z_]{2,45}$/.test(field)||!(value===null||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e15))err('财务数字超限或非有限数值');
   for(const v of Object.values(r.origin))if(v!==null&&(!v||typeof v.header!=='string'||v.header.length>240||!['number','string','undefined'].includes(typeof v.raw)))err('原始列结构异常');
  }
 }
 if(p.period_data!==undefined&&p.period_data!==null){if(!global.QZPeriods)err('需要支持期间账簿的新版本');try{global.QZPeriods.validateBook(p.period_data)}catch(e){err('期间账簿：'+e.message)}}
 if(JSON.stringify(p).length>MAX_BYTES)err('单份快照过大');
 return true;
}
function normalizeWatchNotes(notes){
 if(notes===undefined||notes===null)return {};
 if(!notes||typeof notes!=='object'||Array.isArray(notes))err('跟进记录格式无效');
 const pairs=Object.entries(notes);if(pairs.length>120)err('跟进记录数量超过限制');
 const out={};for(const [key,v] of pairs){
  if(!/^[a-zA-Z0-9._:\-]{1,160}$/.test(key)||!v||!['todo','checking','reviewed'].includes(v.status)||typeof v.note!=='string'||v.note.length>300||typeof v.updated_at!=='string'||v.updated_at.length>45)err('跟进记录包含非法字段');
  out[key]={status:v.status,note:v.note,updated_at:v.updated_at};
 }return out;
}
function normalizeFocus(f){return f&&['issue','metric'].includes(f.kind)&&typeof f.key==='string'&&/^[a-z0-9_-]{1,80}$/.test(f.key)?{kind:f.kind,key:f.key}:null}
async function create(snapshots,activeId,state={}){
 if(!Array.isArray(snapshots)||!snapshots.length||snapshots.length>MAX_VERSIONS)err('版本记录数量无效');
 const entries=[];
 for(const s of snapshots){checkPayload(s.payload);const payload=clone(s.payload);entries.push({id:String(s.id),created_at:String(s.created_at),reason:String(s.reason).slice(0,100),payload,sha256:await sha(JSON.stringify(payload))})}
 if(new Set(entries.map(e=>e.id)).size!==entries.length||!entries.some(e=>e.id===activeId))err('当前版本标识无效');
 const contents={schema:SCHEMA,created_at:new Date().toISOString(),active_id:activeId,view:{year:Number(state.year)||null,focus:normalizeFocus(state.focus),trend_metric:typeof state.trend_metric==='string'&&/^[a-z_]{1,45}$/.test(state.trend_metric)?state.trend_metric:'net_margin',watch_notes:normalizeWatchNotes(state.watch_notes),case_records:state.case_records===undefined?undefined:global.QZCases.validate(state.case_records),disclosure:state.disclosure||null,report_records:state.report_records===undefined?undefined:(global.QZReports?await global.QZReports.verify(state.report_records):[])},revisions:entries,raw_original_files_included:false,remote_sync:false,source_authenticity_verified:false};
 return {...contents,checksum_sha256:await sha(JSON.stringify(contents))};
}
async function parse(text){
 if(typeof text!=='string'||enc(text).length>MAX_BYTES)err('文件过大（最大8MB）');
 let data;try{data=JSON.parse(text)}catch{err('不是有效 JSON 文件')}
 if(!data||data.schema!==SCHEMA||!Array.isArray(data.revisions)||!data.revisions.length||data.revisions.length>MAX_VERSIONS)err('文件架构或版本数量不符');
 const {checksum_sha256,...content}=data;
 if(!/^[a-f0-9]{64}$/.test(checksum_sha256||'')||await sha(JSON.stringify(content))!==checksum_sha256)err('整体指纹与文件内容不匹配，拒绝导入');
 if(data.raw_original_files_included!==false||data.remote_sync!==false)err('文件隐私声明异常');
 if(new Set(data.revisions.map(s=>s.id)).size!==data.revisions.length||!data.revisions.some(s=>s.id===data.active_id))err('当前版本不存在');
 for(const s of data.revisions){checkPayload(s.payload);if(!/^[a-f0-9]{64}$/.test(s.sha256||'')||await sha(JSON.stringify(s.payload))!==s.sha256)err('存在被改动的历史快照');}
 if(data.view?.focus&&!normalizeFocus(data.view.focus))err('分析焦点格式异常');
 if(data.view?.trend_metric&&!/^[a-z_]{1,45}$/.test(data.view.trend_metric))err('趋势指标格式异常');
 normalizeWatchNotes(data.view?.watch_notes);
 if(data.view?.case_records!==undefined){if(!global.QZCases)err('不支持该项目的核验记录格式');try{global.QZCases.validate(data.view.case_records)}catch(e){err('问题核验记录：'+e.message)}}
 if(data.view?.report_records!==undefined){if(!global.QZReports)err('需要新版报告记录模块');try{await global.QZReports.verify(data.view.report_records)}catch(e){err('历史报告校验失败：'+e.message)}}
 if(data.view?.disclosure&&(JSON.stringify(data.view.disclosure).length>800000||!Array.isArray(data.view.disclosure.facts)||data.view.disclosure.facts.length>5000))err('原文对照台账格式或数量异常');
 return data;
}
function openDb(){return new Promise((resolve,reject)=>{
 if(!global.indexedDB)return reject(Error('此浏览器不支持 IndexedDB；请使用项目包导出/导入'));
 const req=global.indexedDB.open('qcz_user_projects_v23',1);
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('projects'))req.result.createObjectStore('projects')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('本地项目数据库无法打开'));
 })}
async function database(action,value){const db=await openDb();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('projects',action==='get'?'readonly':'readwrite'),store=tx.objectStore('projects');
  const req=action==='get'?store.get('current'):action==='delete'?store.delete('current'):store.put(value,'current');
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||Error('本地存储失败'));tx.onerror=()=>reject(tx.error||Error('数据库事务失败'));
 })}finally{db.close()}}
async function saveLocal(archive){await parse(JSON.stringify(archive));await database('put',archive);return true}
async function loadLocal(){const archive=await database('get');return archive?parse(JSON.stringify(archive)):null}
async function clearLocal(){await database('delete')}
function diff(before,after){const changes=[];
 const ys=new Set([...Object.keys(before?.tables?.bs||{}),...Object.keys(after?.tables?.bs||{})]);
 for(const year of [...ys].map(Number).sort((a,b)=>a-b))for(const t of TYPES){
  const left=before?.tables?.[t]?.[year]?.fields||{},right=after?.tables?.[t]?.[year]?.fields||{};
  const keys=new Set([...Object.keys(left),...Object.keys(right)]);
  for(const k of keys){const a=left[k]??null,b=right[k]??null;if(a!==b)changes.push({year,statement:t,field:k,old_value_wan:a,new_value_wan:b});}
 }
 const sourceChanges=[];for(const yr of ys)for(const t of TYPES){const old=before?.sourceByYear?.[t]?.[yr],now=after?.sourceByYear?.[t]?.[yr];
 if(JSON.stringify(old||null)!==JSON.stringify(now||null))sourceChanges.push({year:Number(yr),statement:t,source_before:old?.sha||null,source_after:now?.sha||null});}
 for(const yr of ys){if(JSON.stringify(before?.provenanceByYear?.[yr]||null)!==JSON.stringify(after?.provenanceByYear?.[yr]||null))sourceChanges.push({year:Number(yr),statement:'provenance'});}
 return {changes,years:[...new Set([...changes,...sourceChanges].map(x=>x.year))].sort((a,b)=>a-b),changed_fields:changes.length,source_changes:sourceChanges.length,period_changed:JSON.stringify(before?.period_data||null)!==JSON.stringify(after?.period_data||null)};
}
global.QZProjects={schema:SCHEMA,create,parse,saveLocal,loadLocal,clearLocal,diff,_test:{checkPayload,sha,normalizeFocus,normalizeWatchNotes}};
})(window);
