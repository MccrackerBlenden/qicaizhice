/* Qicaizhice v3.0-C: immutable report records; locally registered review is NOT enterprise approval. */
(function(global){'use strict';
const SCHEMA='qcz.report-record.v1', MAX=24, MAX_BYTES=3*1024*1024;
const clone=x=>JSON.parse(JSON.stringify(x));
const enc=x=>new TextEncoder().encode(JSON.stringify(x));
async function hash(x){const digest=await global.crypto.subtle.digest('SHA-256',enc(x));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}
function valid(records){
 if(records===undefined||records===null)return [];
 if(!Array.isArray(records)||records.length>MAX||enc(records).length>MAX_BYTES)throw Error('报告记录数量或大小超限');
 const seen=new Set();
 return records.map(r=>{
  if(!r||r.schema!==SCHEMA||typeof r.id!=='string'||!/^[0-9a-z-]{10,80}$/i.test(r.id)||seen.has(r.id))throw Error('报告编号或结构非法');
  seen.add(r.id);
  if(!['draft','reviewed'].includes(r.review_state)||typeof r.created_at!=='string'||r.created_at.length>40||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('报告时间、状态或指纹无效');
  if(typeof r.review_note!=='string'||r.review_note.length>300||typeof r.reviewed_at!=='string'||r.reviewed_at.length>40)throw Error('人工登记字段无效');
  if(!r.document||r.document.schema!=='qcz.decision-brief.v2.6'||!r.document.context||typeof r.document.context.entity!=='string'||!r.document.sections||!r.document.status)throw Error('报告正文格式无效');
  if(enc(r.document).length>320*1024)throw Error('单份报告超过320KB上限');
  return clone(r);
 });
}
async function verify(records){const rows=valid(records);for(const r of rows)if(await hash(r.document)!==r.sha256)throw Error('历史报告数据与指纹不符');return rows}
async function create(records,document){
 const list=valid(records);if(!document||document.schema!=='qcz.decision-brief.v2.6'||!Object.values(document.sections||{}).some(Boolean))throw Error('请先选择有效报告章节');
 if(list.length>=MAX)throw Error('最多保存24份报告记录，请先备份项目并归档旧记录');
 const doc=clone(document),sum=await hash(doc),now=new Date().toISOString();
 const rand=global.crypto?.randomUUID?global.crypto.randomUUID():now.replace(/\D/g,'')+Math.random().toString(36).slice(2,10);
 const r={schema:SCHEMA,id:rand.toLowerCase(),created_at:now,sha256:sum,review_state:'draft',review_note:'',reviewed_at:'',document:doc};
 const updated=valid([...list,r]);return {records:updated,record:r};
}
function comparable(d){const value=clone(d);delete value.generated_at;return JSON.stringify(value)}
function state(record,activeSnapshot,latestSnapshot,currentDocument=null){
 if(!record)return {code:'missing',label:'未选报告'};
 const id=record.document.context.snapshot_id;
 if(id!==activeSnapshot)return {code:'other',label:'与当前财务版本不同 · 旧报告'};
 if(id!==latestSnapshot)return {code:'historical',label:'历史财务版本 · 不可当作最新报告'};
 if(record.document.status.blocked||record.document.status.revision_recheck)return {code:'blocked',label:'数据阻断或证据需重新核验'};
 if(currentDocument&&comparable(record.document)!==comparable(currentDocument))return {code:'changed',label:'来源或人工记录已变化 · 请重出报告'};
 return {code:'current',label:'财务版本匹配 · 仍须核对来源真实性'};
}
function review(records,id,active,latest,note,currentDocument=null){
 const data=valid(records),index=data.findIndex(x=>x.id===id);if(index<0)throw Error('所选报告不存在');
 const r=data[index],s=state(r,active,latest,currentDocument);if(s.code!=='current')throw Error('报告已过期或数据不可用，不能登记已核对');
 if(typeof note!=='string'||note.trim().length<8||note.length>300)throw Error('请记录至少8字的核对范围与说明（不超过300字）');
 r.review_state='reviewed';r.review_note=note.trim();r.reviewed_at=new Date().toISOString();return data;
}
global.QZReports={schema:SCHEMA,valid,verify,create,state,review,hash};
})(window);
