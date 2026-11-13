/* Qicaizhice v2.4 — continuity over the existing user-supplied financial calculations.
   All findings are local, deterministic, and gated by original year/source checks.
   No predictive score, industry benchmark, network sync or inferred causality. */
(function(global){'use strict';
const VERSION='qcz.continuity.v2.4.0';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const METRICS=['net_margin','revenue_growth','leverage','current_ratio','cash_revenue','cash_earnings','gross_margin','rd_intensity'];
const STATUS={NEW:'本年开始触发',PERSISTENT:'连续触发',NO_LONGER:'观察线不再触发',NORMAL:'连续未触发',FIRST:'缺少上期比较',UNVERIFIED:'数据不可判断',MISSING:'无可用规则值'};
const WATCH_STATES={todo:'待核对',checking:'核对中',reviewed:'已人工查看'};
function metricOptions(P){const latest=P?.years?.at(-1);return METRICS.filter(k=>P?.years?.some(y=>P.items[y]?.metricByKey?.[k])).map(k=>({key:k,label:P.items[latest]?.metricByKey?.[k]?.label||P.years.map(y=>P.items[y]?.metricByKey?.[k]?.label).find(Boolean)||k}));}
function gate(P,y,d){return global.QZInsights.gate(P,y,d)}
function trend(P,key,d){
 const years=P?.years||[],points=years.map(y=>{
  const g=gate(P,y,d),m=P.items[y]?.metricByKey?.[key],valid=!g.blocked&&!!m?.available&&finite(m.value);
  return {year:y,value:valid?m.value:null,available:valid,unit:m?.unit||'',label:m?.label||key,gate:g.state,reason:g.blocked?g.reason:m?.note||'缺少计算字段或有效分母',source_fingerprints:Object.fromEntries(['bs','is','cf'].map(t=>[t,P.sourceByYear?.[t]?.[y]?.sha||null]))};
 });
 for(let i=0;i<points.length;i++){
  const cur=points[i],prev=points[i-1];cur.comparable=!!(prev&&prev.available&&cur.available&&prev.year===cur.year-1);
  cur.change=cur.comparable?Math.round((cur.value-prev.value)*1e9)/1e9:null;
  cur.previous_year=cur.comparable?prev.year:null;
 }
 return {version:VERSION,key,label:points.at(-1)?.label||key,unit:points.at(-1)?.unit||'',points,valid_years:points.filter(p=>p.available).length,has_gaps:points.some(p=>!p.available)};
}
function monitoring(P,year,d){
 const years=P?.years||[],r=P?.items?.[year];if(!r)return [];
 const previous=years.includes(year-1)?P.items[year-1]:null;
 const curGate=gate(P,year,d),oldGate=previous?gate(P,year-1,d):null;
 return (r.rules||[]).map(rule=>{
  const before=previous?.rules?.find(q=>q.key===rule.key),curGood=!curGate.blocked&&rule.hit!==null&&typeof rule.hit==='boolean';
  const oldGood=!!(oldGate&&!oldGate.blocked&&before&&typeof before.hit==='boolean');
  let state='MISSING';
  if(curGate.blocked)state='UNVERIFIED';
  else if(!curGood)state='MISSING';
  else if(!oldGood)state=previous?'UNVERIFIED':'FIRST';
  else if(rule.hit&&before.hit)state='PERSISTENT';
  else if(rule.hit&&!before.hit)state='NEW';
  else if(!rule.hit&&before.hit)state='NO_LONGER';
  else state='NORMAL';
  return {key:rule.key,title:rule.label,year,criterion:rule.criterion,hit:curGood?rule.hit:null,previous_hit:oldGood?before.hit:null,
   value:curGood&&finite(rule.value)?rule.value:null,state,state_label:STATUS[state],
   previous_year:oldGood?year-1:null,reason:curGate.blocked?curGate.reason:!curGood?'相关字段、分母或本期数值不可用':!oldGood?'无可比的相邻且核验通过的年度':'仅代表内部观察线的年度变化，不是风险已经消除或审计认可',
   metric_key:rule.key==='raw_net_income'?'net_margin':rule.key==='raw_operating_cf'?'cash_revenue':rule.key};
 });
}
function revisionImpact(revisions,activeId,activeP,compute){
 if(!Array.isArray(revisions)||revisions.length<2)return {available:false,reason:'当前只有一个快照；追加或更正报表后，将在这里显示跨版本影响。'};
 const pos=revisions.findIndex(s=>s.id===activeId);if(pos<0)return {available:false,reason:'没有找到当前快照'};
 const peer=pos>0?revisions[pos-1]:revisions[pos+1];const active=revisions[pos];
 const older=pos>0?peer:active,newer=pos>0?active:peer;
 const old=compute(older.payload),now=compute(newer.payload);
 const diff=global.QZProjects.diff(older.payload,newer.payload);
 const overlap=old.years.filter(y=>now.years.includes(y)),added=now.years.filter(y=>!old.years.includes(y)),removed=old.years.filter(y=>!now.years.includes(y));
 const metricChanges=[];
 for(const y of overlap){
  const oldGate=gate(old,y,null),nowGate=gate(now,y,null);
  for(const key of METRICS){
   const a=old.items[y]?.metricByKey?.[key],b=now.items[y]?.metricByKey?.[key];
   const aValid=!oldGate.blocked&&!!a?.available&&finite(a.value),bValid=!nowGate.blocked&&!!b?.available&&finite(b.value);
   if(aValid&&bValid&&Math.abs(a.value-b.value)>1e-8*Math.max(1,Math.abs(a.value),Math.abs(b.value)))metricChanges.push({year:y,key,label:b.label,before:a.value,after:b.value,unit:b.unit,kind:'VALUE_CHANGED'});
   else if(aValid!==bValid)metricChanges.push({year:y,key,label:b?.label||a?.label||key,before:aValid?a.value:null,after:bValid?b.value:null,unit:b?.unit||a?.unit||'',kind:'AVAILABILITY_CHANGED'});
  }
 }
 const changed=diff.changed_fields>0||diff.source_changes>0||added.length>0||removed.length>0||metricChanges.length>0;
 return {available:true,older_id:older.id,newer_id:newer.id,active_id:activeId,comparing_to_newer:pos===0,
  years:diff.years,changed_fields:diff.changed_fields,source_changes:diff.source_changes,added_years:added,removed_years:removed,
  metric_changes:metricChanges,changed,report_needs_refresh:changed,
  caution:'版本对比只复核财务金额、公式、文件来源及声明。历史快照的独立原文对照台账未逐版本归档，不能把数值一致误认为来源已认证。'};
}
function full(P,year,disclosure,revisions,activeId,compute){
 const options=metricOptions(P);return {version:VERSION,entity:P.name,year,trend_options:options,
  monitoring:monitoring(P,year,disclosure),years:P.years.slice(),gates:Object.fromEntries(P.years.map(y=>[y,gate(P,y,disclosure)])),
  revision:revisionImpact(revisions,activeId,P,compute)};
}
function safeNotes(input){
 if(input===undefined||input===null)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('跟进记录不是对象');
 const entries=Object.entries(input);if(entries.length>120)throw Error('跟进记录数量超过上限');
 const out={};for(const [key,v] of entries){
  if(!/^[a-zA-Z0-9._:\-]{1,160}$/.test(key)||!v||!Object.hasOwn(WATCH_STATES,v.status)||typeof v.note!=='string'||v.note.length>300||typeof v.updated_at!=='string'||v.updated_at.length>45)throw Error('跟进记录字段不合法');
  out[key]={status:v.status,note:v.note,updated_at:v.updated_at};
 }return out;
}
global.QZContinuity={version:VERSION,METRICS,STATUS,WATCH_STATES,metricOptions,trend,monitoring,revisionImpact,full,safeNotes};
})(window);
