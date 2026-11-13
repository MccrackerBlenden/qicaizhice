/* Qicaizhice v2.2 — user-supplied financial observations and audit drilldown.
   Pure transformations of the existing QZUser compute outputs: no new rating, model,
   external industry benchmark, mutation, network call, or durable storage. */
(function(global){'use strict';
const VERSION='qcz.user-insights.v2.2.0';
const FIELD_LABELS={bs:{total_assets:'资产总计',total_liabilities:'负债总计',total_equity:'所有者权益',current_assets:'流动资产',current_liabilities:'流动负债',accounts_receivable:'应收账款',inventory:'存货',cash:'货币资金'},is:{revenue:'营业收入',net_income:'净利润',cogs:'营业成本',gross_profit:'毛利润',rd_expense:'研发费用'},cf:{operating_cf:'经营活动现金流量净额',investing_cf:'投资活动现金流量净额',financing_cf:'筹资活动现金流量净额'}};
const TYPES={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>finite(x)?Math.round(x*1e9)/1e9:null;
const fmt=(n,d=2)=>finite(n)?n.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'未提供';
function gate(P,year,disclosure){
 const row=P?.items?.[year],quality=row?.quality;
 if(!row||!quality)return {blocked:true,state:'UNAVAILABLE',reason:'找不到本年度有效数据'};
 if(row.blocked||quality.dataStatus==='BLOCKED')return {blocked:true,state:'BLOCKED',reason:'本年度会计数值检查未通过，不能输出可靠经营观察'};
 if(Number(disclosure?.review?.byYear?.[year]?.difference||0)>0)return {blocked:true,state:'SOURCE_CONFLICT',reason:'独立披露摘录与上传数据存在数值冲突，经营观察已暂停'};
 return {blocked:false,state:quality.dataStatus==='CHECKED'?'NUMERIC_CHECKED':'PARTIALLY_CHECKED',reason:quality.dataStatus==='CHECKED'?'指定会计数值关系已核对；来源真实性仍未独立认证':'部分会计核查未执行；只能解释具备字段依据的数值关系'};
}
function issues(P,year,disclosure){
 const g=gate(P,year,disclosure),row=P?.items?.[year];if(g.blocked)return [];
 const b=row.fields.bs,i=row.fields.is,f=row.fields.cf,m=row.metricByKey;
 const result=[];
 function push(key,title,description,interpretation,followUp,metrics,inputs,kind='neutral'){
  result.push({id:key,year,title,description,interpretation,followUp,metrics,inputs,kind,rule_version:VERSION});
 }
 if(finite(i.net_income)&&finite(f.operating_cf)){
  if(i.net_income>0&&f.operating_cf<0)push('cash-profit-gap','利润与经营现金流方向背离',`净利润 ${fmt(i.net_income)} 万元，经营现金流 ${fmt(f.operating_cf)} 万元。`,'两项数值符号不同，不能单凭此现象认定回款恶化或舞弊。','结合应收账款、收付款明细和财务报表附注核对。',['cash_earnings','cash_revenue','net_margin'],['is.net_income','cf.operating_cf'],'review');
  else if(i.net_income<0)push('profit-negative','本期净利润为负',`净利润 ${fmt(i.net_income)} 万元；经营现金流 ${fmt(f.operating_cf)} 万元。`,'这仅是当前年度的会计金额，不是对未来盈利的预测。','进一步结合收入、成本及非经常性损益核查。',['net_margin','cash_revenue'],['is.net_income','is.revenue','cf.operating_cf'],'review');
  else if(i.net_income>0&&f.operating_cf>=0)push('cash-profit-positive','利润与经营现金流均为正',`净利润 ${fmt(i.net_income)} 万元，经营现金流 ${fmt(f.operating_cf)} 万元。`,'两项数值均为正，不等于现金回收质量已获得保证。','比较连续年度的现金与利润，并检查应收和存货。',['cash_earnings','cash_revenue','net_margin'],['is.net_income','cf.operating_cf'],'neutral');
 }
 if(m.leverage?.available){
  const ratio=m.leverage.value;push('debt-structure',ratio>=70?'资产负债率达到内部观察线':'资产负债结构值得了解',`本期资产负债率 ${fmt(ratio)}%；${ratio>=70?'达到系统70%内部观察线。':'可查看负债与所有者权益的组成。'}`,'70%是系统展示的可调整观察阈值，不是行业平均值、信用评级或违约预测。','检查债务期限、流动负债和会计主体口径。',['leverage','current_ratio'],['bs.total_assets','bs.total_liabilities','bs.total_equity'],ratio>=70?'review':'neutral');
 }
 if(m.revenue_growth?.available){
  const pct=m.revenue_growth.value;
  push('revenue-year-change',pct<0?'收入较上一年度下降':'收入同比变化',`营业收入同比 ${pct>=0?'+':''}${fmt(pct)}%，比较 ${year-1} 年与 ${year} 年。`,'两期营业收入的算术变化不解释原因，也不代表未来趋势。','继续查看收入、成本和净利润的同口径变化。',['revenue_growth','net_margin'],[`is[${year-1}].revenue`,'is.revenue'],pct<=-10?'review':'neutral');
 }
 if(result.length<3&&m.current_ratio?.available&&m.current_ratio.value<1)push('short-term-liquidity','流动比率低于 1',`流动比率 ${fmt(m.current_ratio.value)} 倍，低于系统观察线 1 倍。`,'它描述流动资产与流动负债的数值关系，不单独判定偿债能力。','进一步核对短期债务到期结构及现金流。',['current_ratio'],['bs.current_assets','bs.current_liabilities'],'review');
 return result.slice(0,3);
}
function lineage(P,year,inputs){
 const out=[],seen=new Set();for(const t of (inputs||[]).flatMap(x=>String(x).match(/(?:bs|is|cf)(?:\[\d{4}\])?\.[a-z_]+/g)||[])){
  const match=/^(bs|is|cf)(?:\[(\d{4})\])?\.([a-z_]+)$/.exec(t);if(!match)continue;
  const [,type,dated,field]=match,yr=dated?Number(dated):year,unique=`${yr}:${type}:${field}`;if(seen.has(unique))continue;seen.add(unique);
  const source=P.source?.[type]||{},row=P.items?.[yr];
  const l=P.governance?.years?.[yr]?.lineage?.find(q=>q.statement===type&&q.field===field);
  out.push({reference:t,year:yr,statement:type,statement_label:TYPES[type],field,field_label:FIELD_LABELS[type]?.[field]||field,
   normalized_value_wan:l?.normalized_value_wan??(finite(row?.fields?.[type]?.[field])?row.fields[type][field]:null),
   original_column:l?.source_column||null,original_value:l?.source_raw??null,source_file:l?.source_file||source.label||null,
   source_sha256:l?.source_sha256||source.sha||null,source_unit:l?.unit||source.unit||null,coverage:l?'LINEAGE_FOUND':'MISSING_OR_UNCHECKED'});
 }
 return out;
}
function metricDetail(P,year,key){
 const m=P?.items?.[year]?.metricByKey?.[key];if(!m)return null;
 const previous=P.items?.[year-1]?.metricByKey?.[key];const valid=!!m.available;
 const history=P.years.filter(y=>y<=year).map(y=>({year:y,value:P.items[y].metricByKey?.[key]?.available?P.items[y].metricByKey[key].value:null}));
 return {kind:'metric',key,title:m.label,year,value:valid?m.value:null,unit:m.unit,formula:m.formula,inputs:m.inputs||[],
  available:valid,note:m.note||(!valid?'字段、分母或会计校验条件不足，不能计算':'数值来自已上传的本地三表'),
  previous_year:year-1,previous_value:previous?.available?previous.value:null,
  delta:(valid&&previous?.available)?round(m.value-previous.value):null,
  history,evidence:lineage(P,year,m.inputs||[])};
}
function issueDetail(P,year,id,disclosure){
 const issue=issues(P,year,disclosure).find(x=>x.id===id);if(!issue)return null;
 return {...issue,kind:'issue',evidence:lineage(P,year,issue.inputs),metric_details:issue.metrics.map(key=>metricDetail(P,year,key)).filter(Boolean)};
}
function bridge(P,year,disclosure){
 const g=gate(P,year,disclosure);if(g.blocked)return {available:false,reason:g.reason};
 const now=P.items?.[year],prev=P.items?.[year-1],previousGate=gate(P,year-1,disclosure);
 if(!prev||!P.years.includes(year-1))return {available:false,reason:'需要相邻两个共同年度的完整三表；不可把跨多年的变化标为同比'};
 if(previousGate.blocked)return {available:false,reason:'上一年度会计核验未通过或原文有冲突，不进行变化桥'};
 const a=prev.fields.is,b=now.fields.is,keys=['revenue','cogs','net_income'];
 if(!keys.every(k=>finite(a[k])&&finite(b[k])))return {available:false,reason:'变化桥需要两年度营业收入、营业成本及净利润；缺失字段不得按 0 处理'};
 const other0=a.revenue-a.cogs-a.net_income,other1=b.revenue-b.cogs-b.net_income;
 const revenue=b.revenue-a.revenue,cogs=-(b.cogs-a.cogs),other=-(other1-other0);
 const total=b.net_income-a.net_income,composed=revenue+cogs+other;
 if(!Number.isFinite(total)||Math.abs(total-composed)>1e-7*Math.max(1,Math.abs(total)))return {available:false,reason:'变化桥数值未闭合，停止显示'};
 return {available:true,year,prior_year:year-1,starting_profit:a.net_income,ending_profit:b.net_income,
  contributions:[{key:'revenue',label:'营业收入增减',amount:round(revenue),inputs:[`is[${year-1}].revenue`,'is.revenue']},{key:'cogs',label:'营业成本变化的反向影响',amount:round(cogs),inputs:[`is[${year-1}].cogs`,'is.cogs']},{key:'others',label:'其他净因素（差额残项）',amount:round(other),inputs:[`is[${year-1}].net_income`,'is.net_income',`is[${year-1}].revenue`,'is.revenue',`is[${year-1}].cogs`,'is.cogs']}],
  delta_profit:round(total),reconciled:true,method:'净利润 = 营业收入 - 营业成本 - 其他净因素；其他净因素是按净利润倒推的会计残项，不代表某一费用科目的真实归因或因果关系',version:VERSION};
}
function analyze(P,year,disclosure){return {version:VERSION,year,gate:gate(P,year,disclosure),issues:issues(P,year,disclosure),bridge:bridge(P,year,disclosure)};}
function evidence(P,year,selection,disclosure){
 const a=analyze(P,year,disclosure),detail=selection?.kind==='metric'?metricDetail(P,year,selection.key):issueDetail(P,year,selection?.key||a.issues[0]?.id,disclosure);
 if(!detail||a.gate.blocked)return null;
 const checks=(P.items[year]?.checks||[]).map(c=>({code:c.code,label:c.label,status:c.status,delta:c.delta??null,reason:c.reason}));
 return {schema:'qcz.user-evidence.v2.2',generated_at:new Date().toISOString(),analysis_version:VERSION,
  entity:P.name,year,currency:'CNY',unit:'万元',mode:'user_upload',status:a.gate,source_status:P.governance.sourceStatus,
  authenticity_verified:false,provenance:P.provenanceByYear?.[year]||P.provenance,checks,disclosure:{method:disclosure?.method||'none',year:disclosure?.review?.byYear?.[year]||null},
  selection:detail,limits:['会计数值检查不能证明文件真实性或审计有效性','未使用合成企业的综合评分、排名、预测和优化模型','部分缺失字段和期初数据无法计算','来源文件SHA-256仅用于字节指纹，不能证明来源权威性']};
}
global.QZInsights={version:VERSION,analyze,gate,issues,metricDetail,issueDetail,lineage,bridge,evidence,fmt,_test:{round}};
})(window);
