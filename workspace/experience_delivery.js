/* Qicaizhice v2.6 — one contextual overview and one source-bound deliverable.
   Read-only composition over v2.2-v2.5; never invents ratings, benchmarks or audited conclusions. */
(function(global){'use strict';
const SCHEMA='qcz.decision-brief.v2.6';
const SECTIONS={findings:'当前年度发现',metrics:'指标及会计核查',trends:'连续年度趋势',cases:'人工核验与处理',sources:'来源与有效性说明'};
const keys=Object.keys(SECTIONS);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const fmt=(n,d=2)=>finite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:d}):'不可计算';
const pick=(v)=>Object.fromEntries(keys.map(k=>[k,v?.[k]!==false]));
const short=(s,n=90)=>String(s??'').length>n?String(s).slice(0,n)+'…':String(s??'');
function describe(P,year,disclosure,cases,snapshot,latest){
 if(!P||!P.items?.[year])throw Error('请选择已有的企业和有效财务年度');
 const gate=global.QZInsights.gate(P,year,disclosure),row=P.items[year];
 const rules=global.QZContinuity.monitoring(P,year,disclosure);
 const issue=gate.blocked?[]:global.QZInsights.issues(P,year,disclosure);
 const records=global.QZCases.summarize(P,year,disclosure,cases||{}),dated=records.filter(r=>r.record).length;
 const recheck=records.filter(r=>r.record&&r.fresh.state!=='current').length;
 const attention=rules.filter(r=>r.hit===true).length,unknown=rules.filter(r=>r.hit===null).length;
 const historical=latest&&snapshot!==latest;
 let headline,body,next,target;
 if(gate.blocked){headline='本年度需要先解决数据核验';body=gate.reason+'。为避免误导，暂停本年度经营观察和指标结论。';next='查看来源与核对结果';target='user-disclosure-check';}
 else if(historical){headline='正在查看较早的财务快照';body='后续存在另一份修订版本。当前年度的判断只能对应此快照，不能视为最新报告。';next='核对历史版本';target='project-manager';}
 else if(recheck){headline='部分人工核验需要重新确认';body=`已有 ${recheck} 条人工记录的依赖材料发生变化；旧判断不自动继承到新财务版本。`;next='查看需要重核的事项';target='case-workflow';}
 else if(attention){headline='有值得优先核对的财务观察';body=`${year} 年 ${attention} 条内部阈值被触发；${dated} 条事项有人工记录。阈值不是审计判断或风险评级。`;next='查看问题与处理记录';target='case-workflow';}
 else if(unknown){headline='当前部分规则无法判断';body=`${unknown} 条规则缺少可用数值或相邻年度依据；不应解读为经营情况已经改善。`;next='查看指标与核算依据';target='insight-detail-body';}
 else {headline='当前可进一步查看趋势与证据';body='现有可核算规则未触发内部观察线，但不代表不存在经营风险。可以继续核对历史期间及财报附注。';next='查看连续年度分析';target='continuity-workbench';}
 return {entity:P.name,year,snapshot:snapshot||'',historical:!!historical,gate,headline,body,next,target,issue,
  counts:{observations:attention,unverified:unknown,case_records:dated,needs_recheck:recheck,valid_metrics:gate.blocked?0:row.metrics.filter(m=>m.available).length},
  rules,reviewed:records,version_count:P.years.length};
}
function build(P,year,disclosure,cases,snapshot,latest,selected){
 const s=describe(P,year,disclosure,cases,snapshot,latest),include=pick(selected),row=P.items[year];
 const active=!s.gate.blocked;
 const checks=row.checks.map(c=>({label:c.label,status:c.status,delta:finite(c.delta)?c.delta:null}));
 const metrics=active?row.metrics.map(m=>({key:m.key,label:m.label,available:!!m.available,value:m.available?m.value:null,unit:m.unit,formula:m.formula,note:m.note||''})):[];
 const issues=active?s.issue.map(x=>({id:x.id,title:x.title,description:x.description,interpretation:x.interpretation,follow_up:x.followUp})):[];
 const trends=active?global.QZContinuity.metricOptions(P).map(m=>global.QZContinuity.trend(P,m.key,disclosure)):[];
 const casesAll=global.QZCases.report(P,disclosure,cases||{});
 const revisionRequired=s.historical||s.counts.needs_recheck>0;
 const source=['bs','is','cf'].map(t=>({statement:({bs:'资产负债表',is:'利润表',cf:'现金流量表'})[t],file:P.sourceByYear?.[t]?.[year]?.label||P.source?.[t]?.label||'未登记',sha256:P.sourceByYear?.[t]?.[year]?.sha||P.source?.[t]?.sha||'',unit:P.sourceByYear?.[t]?.[year]?.unit||P.source?.[t]?.unit||''}));
 const statement=P.provenanceByYear?.[year]||P.provenance||{};
 const review=disclosure?.review?.byYear?.[year]||null;
 const limitations=['金额来自用户上传三表，财务数值核对不等于官方来源认证或外部审计','不能借用仿真企业评分、真实行业排名或预测结果','观察线未触发不代表问题解决；不可判断不是正常','人工核验仅是用户记录，财报或来源变化后需要重新核对',revisionRequired?'当前存在历史版本或旧人工证据需复核；不得作为最新结论':'报告与当次快照绑定，财务更正后应重出'];
 return {schema:SCHEMA,generated_at:new Date().toISOString(),context:{entity:P.name,fiscal_year:year,snapshot_id:s.snapshot,historical:s.historical,report_scope:'用户上传三表，非合成模型',currency:'CNY',unit:'万元'},sections:include,status:{code:s.gate.state,blocked:s.gate.blocked,reason:s.gate.reason,authenticity_verified:false,disclosure_difference:Number(review?.difference||0),revision_recheck:revisionRequired},summary:{headline:s.headline,body:s.body,counts:s.counts},findings:{issues,rules:s.rules},financials:{checks,metrics},trends,cases:casesAll,sources:{files:source,statement,disclosure_method:disclosure?.method||'none',disclosure_review:review},limitations};
}
function table(head,rows){return `<table><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>'<tr>'+r.map(x=>`<td>${esc(x)}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${head.length}">无适用数据或尚未登记</td></tr>`}</tbody></table>`;}
function printHtml(d){
 if(!d||d.schema!==SCHEMA)throw Error('只能渲染 v2.6 统一报告');
 const h=d.context,s=d.sections,blocked=d.status.blocked;
 const title=esc(h.entity)+' · '+esc(h.fiscal_year)+' 年企业财务分析';
 const section=(key,name,content)=>s[key]?`<section><h2>${name}</h2>${content}</section>`:'';
 const status=`<div class="notice ${blocked?'bad':''}"><strong>${esc(d.summary.headline)}</strong><p>${esc(d.summary.body)}</p><p>计算状态：${esc(d.status.reason)}。${h.historical?'本次为历史版本，不得视作最新报告。':''}</p></div>`;
 const issues=d.findings.issues.map(q=>`<article><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><small>${esc(q.interpretation)}；待核对：${esc(q.follow_up)}</small></article>`).join('');
 const trendRows=d.trends.flatMap(t=>t.points.map(p=>[t.label,p.year,p.available?fmt(p.value,3):'不可计算',t.unit,p.comparable?fmt(p.change,3):'—',p.available?'可用':p.reason]));
 const caseRows=d.cases.map(r=>[r.year+' / '+r.rule,r.assessment_label,r.freshness_label,r.evidence,r.action,r.next_check]);
 const srcRows=d.sources.files.map(f=>[f.statement,f.file,f.unit||'未登记',f.sha256||'未登记']);
 const raw=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
 :root{font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#263845;background:#f1f5f7}*{box-sizing:border-box}body{max-width:1030px;padding:38px 54px 62px;margin:30px auto;background:white;box-shadow:0 12px 48px #1e3b5120;font-size:14px;line-height:1.75}header{border-bottom:3px solid #143a55;padding-bottom:22px;margin-bottom:25px}header small{display:block;letter-spacing:2px;color:#507589;font-size:12px;font-weight:700}h1{font-size:27px;margin:10px 0}h2{font-size:19px;border-bottom:1px solid #d1e0e7;margin:30px 0 13px;padding-bottom:9px}h3{font-size:15px;margin:0 0 5px}p{margin:7px 0}.meta{color:#637e8d;font-size:12px}.notice{background:#eaf3f6;padding:16px 18px;border-left:4px solid #33849b}.notice.bad{background:#fff2e8;border-color:#c78742}.notice strong{font-size:15px}.notice p{font-size:13px}article{padding:15px;border:1px solid #d6e3e8;margin:11px 0;border-radius:4px}article small{color:#587384}table{width:100%;border-collapse:collapse;font-size:12px;overflow-wrap:anywhere;word-break:break-word}th,td{border:1px solid #d8e3e9;padding:7px 9px;text-align:left;vertical-align:top}th{background:#eff5f8;color:#325469}tr:nth-child(even){background:#f9fbfc}.limits{background:#f4f7f9;padding:15px;border-radius:4px;font-size:12px}footer{border-top:1px solid #dce7ec;padding-top:14px;margin-top:30px;color:#6a8290;font-size:12px}.print-action{border:0;background:#123f57;color:white;padding:10px 16px;border-radius:3px;cursor:pointer}@media print{body{margin:0;max-width:none;padding:5mm 8mm;box-shadow:none}.print-action{display:none}h2,article{break-inside:avoid}thead{display:table-header-group}}@media(max-width:650px){body{padding:20px;margin:0}}
 </style></head><body><header><small>QICAI INTELLIGENCE · SOURCE-BOUND REPORT</small><h1>${title}</h1><div class="meta">财务快照 ${esc(h.snapshot_id)} · 生成 ${esc(d.generated_at)} · 金额单位：万元 · 非审计报告</div></header>${status}
 ${section('findings','01 · 当前财务观察',blocked?'<p>本年度存在数据核验阻断，不输出风险或经营判断。</p>':`${issues||'<p>没有生成可独立复核的重点观察；这不等于企业无风险。</p>'}${table(['内部规则','观察阈值','本期判定','跨期状态'],d.findings.rules.map(r=>[r.title,r.criterion,r.hit===null?'不可判断':r.hit?'达到观察线':'未触发',r.state_label]))}`)}
 ${section('metrics','02 · 指标与数值校验',`${table(['会计勾稽项目','状态','差额（万元）'],d.financials.checks.map(c=>[c.label,c.status,c.delta===null?'未核算':fmt(c.delta,4)]))}${blocked?'<p>本年度指标输出已阻断，暂不展示比率结果。</p>':table(['指标','实测','计算定义 / 适用说明'],d.financials.metrics.map(m=>[m.label,m.available?fmt(m.value,3)+' '+m.unit:'不可计算',m.formula+(m.note?'；'+m.note:'')]))}`)}
 ${section('trends','03 · 历史指标',blocked?'<p>当前年度被阻断。历史趋势不会在此报告中被用作当前经营判断。</p>':table(['指标','年度','值','单位','相邻上年变化','可用性'],trendRows))}
 ${section('cases','04 · 问题处理与证据',`<p class="meta">以下为用户自行填写的资料定位与核验，来源变更可导致旧记录失效；不构成外部审计。</p>${table(['年度/规则','人工判断','证据版本状态','证据定位','下一步计划','下次复查'],caseRows)}`)}
 ${section('sources','05 · 来源、披露与适用范围',`${table(['报表','本年度文件/工作表','单位','SHA-256'],srcRows)}<p>披露来源描述：${esc(short(d.sources.statement.document||'未登记',180))}；对照方法：${esc(d.sources.disclosure_method)}；原文数值冲突：${d.status.disclosure_difference} 项。SHA-256 不能证明来源权威性。</p><div class="limits">${d.limitations.map(x=>`<p>• ${esc(x)}</p>`).join('')}</div>`)}
 <footer>由企财智策在用户浏览器内从当前财务快照生成。未自动上传用户原始文件、未使用仿真企业的排名与预测结果；修改财务数据后请重新生成本报告。</footer><button class="print-action" onclick="window.print()">打印 / 保存 PDF</button></body></html>`;
 return raw;
}
function buildPeriod(P,book,snapshot,latest,annual=null){
 if(!P||!book)throw Error('缺少企业期间数据');
 const packet=global.QZPeriods.report(book,annual);delete packet.generated_at;const tail=packet.rows.at(-1);
 if(!tail)throw Error('期间账簿无有效财务记录');
 const historical=!!(latest&&snapshot!==latest);
 const checked=packet.annual_reconcile.flatMap(x=>x.differences||[]).filter(x=>!x.consistent);const blocked=!tail.usable||checked.length>0;
 const headline=checked.length?'期间合计与年度三表存在差异，结论暂停':blocked?'本期数据不完整，经营判断暂停':'本期经营结果与相邻期间对照';
 const describe=`${tail.period} · 营业收入 ${fmt(tail.revenue)} 万元、净利润 ${fmt(tail.net_income)} 万元；收入环比 ${Number.isFinite(tail.prior_change_pct)?fmt(tail.prior_change_pct)+'%':'不可比'}；同比 ${Number.isFinite(tail.yoy_change_pct)?fmt(tail.yoy_change_pct)+'%':'不可比'}。${checked.length?'期间合计与已上传年度三表存在差异，须先核对。':''}`;
 const files=Object.entries(packet.sources).flatMap(([period,s])=>Object.entries(s).map(([t,f])=>({statement:period+' '+({bs:'资产负债表',is:'利润表',cf:'现金流量表'})[t],file:f.file,unit:f.unit,sha256:f.sha256})));
 return {schema:SCHEMA,generated_at:new Date().toISOString(),context:{entity:P.name,fiscal_year:Number(tail.period.slice(0,4)),snapshot_id:snapshot||'',historical,report_scope:'period',focus_period:tail.period,frequency:book.frequency,currency:'CNY',unit:'万元'},
 sections:{findings:false,metrics:false,trends:false,cases:false,sources:true,periods:true},status:{code:blocked?'PERIOD_INCOMPLETE':'PERIOD_LOCAL',blocked,reason:checked.length?'期间汇总与年度三表未核对一致':blocked?'缺少单期发生额所需上期累计资料':'会计期间数值已按口径计算，来源未独立认证',authenticity_verified:false,revision_recheck:historical},
 summary:{headline,body:describe,counts:{}},findings:{issues:[],rules:[]},financials:{checks:[],metrics:[]},trends:[],cases:[],sources:{files,statement:{document:'用户上传的期间报表'},disclosure_method:'not_verified',disclosure_review:null},period_analysis:packet,
 limitations:[...packet.limitations,'期间分析仅使用已导入的期间账簿；不冒充年度三表、预算或审计结果',historical?'当前为历史财务快照；不得当作最新结论':'来源文件真实性尚未独立核验']};
}
function periodPrintHtml(d){const p=d.period_analysis;const head=['期间','营业收入（万元）','净利润（万元）','经营现金流（万元）','期末资产（万元）','净利率','环比','同比','是否完整'];
 const values=p.rows.map(r=>[r.period,fmt(r.revenue),fmt(r.net_income),fmt(r.operating_cf),fmt(r.assets),Number.isFinite(r.net_margin)?fmt(r.net_margin)+'%':'不可计算',Number.isFinite(r.prior_change_pct)?fmt(r.prior_change_pct)+'%':'不可比',Number.isFinite(r.yoy_change_pct)?fmt(r.yoy_change_pct)+'%':'不可比',r.usable?'是':'缺少必要累计数据']);
 const tx=(h,data)=>`<table><thead><tr>${h.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${data.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>企财智策期间管理报告</title><style>body{font:14px/1.7 'Microsoft YaHei',sans-serif;color:#203447;margin:30px auto;max-width:1050px;padding:20px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #d1dce3;padding:7px}th{background:#eaf0f4}h1{border-bottom:3px solid #16445e}.warn{background:#fff1dc;padding:15px}@media print{@page{size:A4 landscape}button{display:none}}</style><h1>${esc(d.context.entity)} · 经营期间管理报告</h1><p>财务快照 ${esc(d.context.snapshot_id)} · 期间 ${esc(d.context.focus_period)} · ${p.frequency==='month'?'月度':'季度'} · ${p.flow_basis==='ytd'?'YTD差分':'单期发生额'} · 单位：万元</p><p class="warn">${esc(d.summary.body)} ${esc(d.status.reason)}。非审计报告；缺期不补零，不代表年度财报已完整。</p><h2>期间表现与同口径比较</h2>${tx(head,values)}<h2>期间完整性</h2>${tx(['汇总期间','是否可核算','缺少期间'],[...p.quarters,...p.years].map(r=>[r.period,r.available?'可核算':'不可完整核算',r.missing?.join('、')||'—']))}<h2>来源指纹</h2>${tx(['期间/报表','来源文件','SHA256'],d.sources.files.map(f=>[f.statement,f.file,f.sha256]))}<h2>适用边界</h2>${d.limitations.map(x=>'<p>'+esc(x)+'</p>').join('')}<button onclick="window.print()">打印 / 保存 PDF</button></html>`;
}
global.QZDelivery={schema:SCHEMA,SECTIONS,pick,describe,build,buildPeriod,printHtml:(d)=>d?.context?.report_scope==='period'?periodPrintHtml(d):printHtml(d),_test:{esc,fmt}};
})(window);
