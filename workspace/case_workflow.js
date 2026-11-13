/* Qicaizhice v2.5 — local issue evidence workflow, not an audit opinion.
 * Every case is tied to year/rule and to the exact source/numeric context reviewed.
 * A restatement changes the context and invalidates the prior manual check. */
(function(global){'use strict';
const VERSION='qcz.case-workflow.v2.5.0';
const STATES={todo:'待核对',checking:'核验中',action:'跟进处理',reviewed:'已人工查看'};
const ASSESSMENTS={unverified:'尚未核验',insufficient:'证据不足',supported:'资料支持该观察',unsupported:'资料暂不支持该观察'};
const RULE_KEY=/^(19\d{2}|20\d{2}|2100):[a-z_]{2,60}$/;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clone=x=>JSON.parse(JSON.stringify(x));
function key(year,rule){const k=String(year)+':'+rule;if(!RULE_KEY.test(k))throw Error('问题标识不合法');return k;}
function validDate(x){if(x==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const d=new Date(x+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===x;}
function validate(records){
 if(records==null)return {};
 if(typeof records!=='object'||Array.isArray(records))throw Error('问题核验记录格式无效');
 const entries=Object.entries(records);if(entries.length>160)throw Error('问题核验记录超过160项');
 const out={};for(const [k,r] of entries){
  if(!RULE_KEY.test(k)||!r||typeof r!=='object'||Array.isArray(r))throw Error('问题核验键或结构无效');
  const {state,assessment,evidence,action,note,next_check,updated_at,reviewed_snapshot,baseline,history}=r;
  if(!own(STATES,state)||!own(ASSESSMENTS,assessment)||typeof evidence!=='string'||evidence.length>240||typeof action!=='string'||action.length>300||typeof note!=='string'||note.length>400||typeof next_check!=='string'||!validDate(next_check)||typeof updated_at!=='string'||updated_at.length>45||typeof reviewed_snapshot!=='string'||reviewed_snapshot.length>120||typeof baseline!=='string'||baseline.length>10000||!Array.isArray(history)||history.length>12)throw Error('问题核验字段超出允许范围');
  if(['supported','unsupported'].includes(assessment)&&!evidence.trim())throw Error('人工核验结论必须注明证据定位');
  const log=history.map(h=>{if(!h||typeof h!=='object'||typeof h.at!=='string'||h.at.length>45||typeof h.snapshot!=='string'||h.snapshot.length>120||!own(STATES,h.state)||!own(ASSESSMENTS,h.assessment)||typeof h.note!=='string'||h.note.length>400)throw Error('核验历史记录字段非法');return {at:h.at,snapshot:h.snapshot,state:h.state,assessment:h.assessment,note:h.note}});
  out[k]={state,assessment,evidence,action,note,next_check,updated_at,reviewed_snapshot,baseline,history:log};
 }
 return out;
}
function signature(P,year,rule,d){
 const y=Number(year),row=P?.items?.[y],r=row?.rules?.find(x=>x.key===rule);
 if(!row||!r)throw Error('所选年度规则不存在');
 const prior=P?.items?.[y-1];
 const values=(obj)=>Object.fromEntries(Object.entries(obj||{}).sort(([a],[b])=>a.localeCompare(b)));
 const source=year=>Object.fromEntries(['bs','is','cf'].map(t=>[t,values(P.sourceByYear?.[t]?.[year]||{})]));
 const currentGate=global.QZInsights.gate(P,y,d);
 const facts=(d?.facts||[]).filter(f=>Number(f.year)===y||Number(f.year)===y-1);
 return JSON.stringify({year:y,rule,rule_value:r.value,rule_hit:r.hit,criterion:r.criterion,gate:currentGate.state,gate_reason:currentGate.reason,
  fields:Object.fromEntries(['bs','is','cf'].map(t=>[t,values(row.fields?.[t])])),prev_fields:prior?Object.fromEntries(['bs','is','cf'].map(t=>[t,values(prior.fields?.[t])])):null,
  sources:source(y),prior_sources:prior?source(y-1):null,provenance:values(P.provenanceByYear?.[y]||{}),prior_provenance:prior?values(P.provenanceByYear?.[y-1]||{}):null,
  ledger:{sha256:d?.sha256||'',method:d?.method||'',current:values(d?.review?.byYear?.[y]||{}),prior:values(d?.review?.byYear?.[y-1]||{}),facts}});
}
function freshness(record,P,y,rule,d){
 if(!record)return {state:'not_recorded',label:'尚无人工核验'};
 try{if(signature(P,y,rule,d)!==record.baseline)return {state:'stale',label:'财报或核对材料已变化 · 需重新核验'};
  const gate=global.QZInsights.gate(P,y,d);if(gate.blocked)return {state:'blocked',label:'当前数值被阻断 · 不能沿用人工结论'};
  return {state:'current',label:'与当前上传材料版本一致 · 仍非审计证明'};
 }catch{return {state:'missing',label:'当前版本已无该规则 · 原记录仅供回顾'};}
}
function update(records,P,year,rule,d,draft,snapshot,now=new Date().toISOString()){
 const old=validate(records),k=key(year,rule),state=draft.state,assessment=draft.assessment;
 if(!own(STATES,state)||!own(ASSESSMENTS,assessment))throw Error('核验状态不合法');
 const evidence=String(draft.evidence||'').trim(),action=String(draft.action||'').trim(),note=String(draft.note||'').trim(),next_check=String(draft.next_check||'');
 if(evidence.length>240||action.length>300||note.length>400||!validDate(next_check))throw Error('文本或下次核对日期不合法');
 if(['supported','unsupported'].includes(assessment)&&!evidence)throw Error('请先填写可复查的证据定位，再保存人工核验结论');
 const gate=global.QZInsights.gate(P,Number(year),d);
 if(gate.blocked&&['supported','unsupported'].includes(assessment))throw Error('当前数据未通过基本校验，不能记录支持/不支持判断');
 const baseline=signature(P,year,rule,d);if(baseline.length>10000)throw Error('财务上下文过大');
 const history=[...(old[k]?.history||[]),{at:now,snapshot:String(snapshot),state,assessment,note}].slice(-12);
 const next={...old,[k]:{state,assessment,evidence,action,note,next_check,updated_at:now,reviewed_snapshot:String(snapshot),baseline,history}};
 return validate(next);
}
function summarize(P,y,d,records){
 const safe=validate(records),rules=global.QZContinuity.monitoring(P,y,d);
 return rules.map(r=>{const k=key(y,r.key),record=safe[k]||null,fresh=freshness(record,P,y,r.key,d);return {...r,case_key:k,record,fresh,needs_action:!record||fresh.state!=='current'||record.assessment==='unverified'||record.assessment==='insufficient'};});
}
function report(P,d,records){
 const safe=validate(records);return Object.entries(safe).map(([k,r])=>{const [year,...other]=k.split(':'),rule=other.join(':');const fresh=freshness(r,P,Number(year),rule,d);return {key:k,year:Number(year),rule,state:r.state,state_label:STATES[r.state],assessment:r.assessment,assessment_label:ASSESSMENTS[r.assessment],evidence:r.evidence,action:r.action,note:r.note,next_check:r.next_check,updated_at:r.updated_at,reviewed_snapshot:r.reviewed_snapshot,freshness:fresh.state,freshness_label:fresh.label,history:clone(r.history)};});
}
global.QZCases={version:VERSION,STATES,ASSESSMENTS,key,validate,signature,freshness,update,summarize,report};
})(window);
