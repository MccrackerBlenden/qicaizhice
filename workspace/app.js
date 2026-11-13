'use strict';
const ROUTES=[['journey','选择开始方式','从示范企业或自己的材料开始分析'],['overview','诊断总览','总览、状态与财务态势'],['ingest','企业接入','创建项目、企业选择与本地预检'],['governance','数据治理','三表勾稽、完整性与数据来源'],['position','状态定位','冻结评分、六维画像与同行比较'],['attribution','迁移归因','年度差异、指标贡献与解释线索'],['forecast','迁移预测','历史转移基线与能力限制'],['action','行动中心','候选方案筛选、约束取舍与决策记录'],['validation','验证与报告','方案跟踪、证据登记与差异复核'],['research','科研图谱','十三组科研分析、权重扰动与方案稳健性'],['reportstudio','科研报告','自由图表编排、研究配方和证据留存'],['user','用户数据诊断','上传真实三表、字段映射与独立计算'],['sec','SEC披露核验','官方XBRL申报、来源与口径验证'],['cn','A股公告核验','披露原件、更正版本与数值交叉审计']];
let D, A, C='VPM-101', Y=2022, R='overview', PEER='VPM-101', CASE='neutral', METRIC='net_margin', OBJ='score', FILTER={cost:'',debt:'',score:''}, SEL=null, FLASH='', COMPARE=[], ACTIVE_REVIEW=null;

// v0.4 静态情景计算: independent live static counterfactual; never confound with frozen optimization.
const ACTION_FIELDS=[
 ['receivables_collection_rate','加速应收回款','% (0—60)',60,'rate'],
 ['inventory_release_rate','库存释放','% (0—40)',40,'rate'],
 ['selling_expense_reduction_rate','销售费用削减','% (0—25)',25,'rate'],
 ['admin_expense_reduction_rate','管理费用削减','% (0—25)',25,'rate'],
 ['short_term_debt_proceeds','新增短期融资','万元',Infinity,'amount'],
 ['long_term_debt_proceeds','新增长期融资','万元',Infinity,'amount'],
 ['capital_expenditure','新增资本开支','万元',Infinity,'amount'],
 ['incremental_rd_expense','新增费用化研发','万元',Infinity,'amount']
];
let SCENARIO_PLAN=Object.fromEntries(ACTION_FIELDS.map(([key])=>[key,0]));
let SCENARIO_RES=null,SCENARIO_INFO='',SCENARIO_BUSY=false,SCENARIO_CONTEXT='';
let OPT_INPUT={objective:'score',minimum_score_delta:'1',maximum_action_cost:'2000',maximum_debt_ratio:'',minimum_cash_headroom:''};
let OPT_RESULT=null,OPT_INFO='',OPT_BUSY=false,OPT_CONTEXT='',OPT_SELECTED=null;

const currentScenarios=()=>loadLocal('scenarios',[]);
function qczQuickPreview(){
 if(Y!==2022||!D.meta.optimizable.includes(C)){SCENARIO_INFO='超出静态情景计算验证范围，仅支持三家虚构企业2022年。';SCENARIO_RES=null;render();return}
 const r=get(),p=SCENARIO_PLAN,release=(r.accounts_receivable||0)*p.receivables_collection_rate+(r.inventory||0)*p.inventory_release_rate;
 const costs=(r.accounts_receivable||0)*p.receivables_collection_rate*.02+(r.inventory||0)*p.inventory_release_rate*.03;
 SCENARIO_RES={quick:true,company:C,year:Y,effects:{ar_release:(r.accounts_receivable||0)*p.receivables_collection_rate,inventory_release:(r.inventory||0)*p.inventory_release_rate,action_cost:costs},cash_direction:release-costs,
   warning:'浏览器仅粗算回款与库存现金转换及直接成本；不计算税、融资、综合评分和三表勾稽，不能保存为正式方案。'};
 SCENARIO_CONTEXT=C+':'+Y;SCENARIO_INFO='已生成浏览器现金桥方向性预览，不是静态情景计算正式运算。';render()
}
function scenarioInputValidity(){
 for(const [field,label,,max,type] of ACTION_FIELDS){
   const x=Number(SCENARIO_PLAN[field]);
   if(!Number.isFinite(x)||x<0)return `${label}应为非负数`;
   if(type==='rate'&&x>max/100+1e-12)return `${label}不得超过${max}%`;
 }
 return ''
}
async function runLiveScenario(){
 if(SCENARIO_BUSY)return;
 if(Y!==2022||!D.meta.optimizable.includes(C)){SCENARIO_INFO='只有 VPM-071/101/203 的2022基准通过正式情景验证。';SCENARIO_RES=null;render();return}
 const error=scenarioInputValidity();if(error){SCENARIO_INFO=error;SCENARIO_RES=null;render();return}
 const stamp=C+':'+Y;
 SCENARIO_BUSY=true;SCENARIO_INFO='正在运行静态情景计算三表情景引擎……';render();
 try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),28000);
   let resp;
   try{resp=await fetch('/api/scenario',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({company:C,year:2022,plan:SCENARIO_PLAN}),signal:controller.signal})}
   finally{clearTimeout(timer)}
   const out=await resp.json();
   if(stamp!==C+':'+Y)return;
   if(!out.ok){SCENARIO_RES=null;SCENARIO_INFO=out.error||'计算失败，请核查行动约束';return}
   SCENARIO_RES={...out,plan:{...SCENARIO_PLAN},computed:new Date().toISOString()};SCENARIO_CONTEXT=stamp;
   SCENARIO_INFO=`静态情景计算已现场重算完成：${out.financial_checks.filter(x=>x.passed).length}/${out.financial_checks.length}项三表勾稽通过。`;
 }catch(e){SCENARIO_RES=null;SCENARIO_INFO='正式计算不可用：'+(e.name==='AbortError'?'请求超时':e.message)+'。可使用浏览器快速预览，但它不是正式三表引擎。'}
 finally{SCENARIO_BUSY=false;render()}
}
function scenarioResult(){
 const x=SCENARIO_RES;if(!x||SCENARIO_CONTEXT!==C+':'+Y)return msg('请先调整参数并运行情景推演。对每项参数将按真实财务合同计算，无法通过约束的方案会被拒绝。');
 if(x.quick)return panel('现金流方向性预览','纯浏览器局部算术 · 没有正式三表或综合评分',`<div class="stat-strip compact-stats">${strip('释放应收',money(x.effects.ar_release),'万元')}${strip('存货释放',money(x.effects.inventory_release),'万元')}${strip('直接实施成本',money(x.effects.action_cost),'万元')}${strip('粗算现金变化',money(x.cash_direction),'万元')}</div>${msg(h(x.warning),'gold')}`);
 const f=x.numbers;
 const rows=[
  ['营业收入',f.income_statement.revenue],
  ['净利润',f.income_statement.net_income],
  ['经营现金流',f.cash_flow_statement.net_cash_from_operating_activities],
  ['期末现金',f.cash_flow_statement.ending_cash],
  ['应收账款',f.balance_sheet.accounts_receivable],
  ['存货',f.balance_sheet.inventory],
  ['总资产',f.balance_sheet.total_assets],
  ['总负债',f.balance_sheet.total_liabilities],
  ['所有者权益',f.balance_sheet.total_equity]
 ];
 return `<div class="stat-strip compact-stats">${strip('冻结原综合分',fmt(x.baseline_score,3),'固定参数评价模型原参数')}${strip('情景后综合分',fmt(x.scenario_score,3),'指标与评分模型实际重算')}${strip('情景分数变化',signedDiff(x.scenario_score,x.baseline_score,3),'非未来预测')}${strip('三表勾稽',x.financial_checks.filter(z=>z.passed).length+' / '+x.financial_checks.length,'17类会计约束')}</div>
 <div class="grid2 equal">
 ${panel('对照三表核心结果','单位：万元；静态反事实，不代表未来预测',table(['指标','基准','情景','差额'],rows.map(([title,v])=>[title,money(v.before),money(v.after),signedDiff(v.after,v.before,2)])))}
 ${panel('关键传导与经营护栏','经本地情景引擎重新计算',table(['影响项目','数值'],[['应收释放',money(x.effects.ar_release)+' 万元'],['库存释放',money(x.effects.inventory_release)+' 万元'],['直接实施成本',money(x.effects.action_cost)+' 万元'],['税额变化',signedDiff(x.effects.tax_delta,0)+' 万元'],['利润变化',signedDiff(x.effects.net_income_delta,0)+' 万元'],['最低现金',money(x.constraints.minimum_cash)+' 万元'],['资产负债率',pct(x.constraints.debt_to_assets*100)],['利息保障倍数',fmt(x.constraints.interest_coverage,2)+'×']]))}
 </div><div class="info">${h(x.disclaimer)} ${h(x.lag_uncertainty)}</div><div class="action-row"><button class="primary-btn" id="save-live-scenario">保存本次现场试算 →</button><button class="ghost-btn" id="export-live-scenario">导出试算JSON ↓</button></div>`;
}
function scenarioStudio(){
 const allowed=D.meta.optimizable.includes(C)&&Y===2022,base=get();
 const controls=ACTION_FIELDS.map(([key,label,unit,max,type])=>{
   const v=type==='rate'?SCENARIO_PLAN[key]*100:SCENARIO_PLAN[key];
   const limit=Number.isFinite(max)?`max="${max}"`:'';
   const hint=type==='amount'?` <small>上限由引擎按收入约束</small>`:'';
   return `<label>${label} <span class="mini-muted">${unit}</span>${hint}
     <input type="number" class="input-control scenario-input" data-field="${key}" min="0" ${limit} step="${type==='rate'?'1':'100'}" value="${Number(v.toFixed(5))}" ${allowed?'':'disabled'}/></label>`;
 }).join('');
 const scDisabled=allowed?'':'disabled';
 return panel('现场经营情景试算 · 静态情景计算','现场调用财务计算模型 · 非候选方案筛选',
 `<div class="info">修改八类经营动作后，调用独立安全2021/2022三表、原 静态情景计算 情景引擎、27项指标和冻结评分模型现场计算。正式验证仅限三家2022年。<strong>本功能是静态假设财务方案，不预测经营未来。</strong></div>
 <div class="scenario-grid">${controls}</div>
 <div class="action-row"><button class="primary-btn" id="run-live-scenario" ${scDisabled||SCENARIO_BUSY?'disabled':''}>${SCENARIO_BUSY?'正在计算…':'运行 静态情景计算 正式情景计算'}</button><button class="ghost-btn" id="quick-scenario" ${scDisabled}>浏览器现金桥预览</button><button class="ghost-btn" id="scenario-reset" ${SCENARIO_BUSY?'disabled':''}>重置参数</button></div>
 ${SCENARIO_INFO?msg(h(SCENARIO_INFO),'gold'):''}
 <div id="live-scenario-result">${scenarioResult()}</div>`);
}
function saveLiveScenario(){
 const r=SCENARIO_RES;
 if(!r||r.quick||r.company!==C||r.year!==2022||!r.constraints.passed){SCENARIO_INFO='当前没有可保存的正式计算结果。';render();return}
 const item={id:'s'+Date.now(),company:C,year:2022,created:new Date().toISOString(),model:'静态情景计算 live scenario',verified:'runtime_17_checks',plan:{...r.plan},baseline_score:r.baseline_score,scenario_score:r.scenario_score,score_delta:r.score_delta,net_income_delta:r.effects.net_income_delta,action_cost:r.effects.action_cost,ending_cash:r.constraints.ending_cash,debt_to_assets:r.constraints.debt_to_assets,check_pass_count:r.financial_checks.filter(x=>x.passed).length};
 const all=currentScenarios();all.unshift(item);if(saveLocal('scenarios',all.slice(0,40))){SCENARIO_INFO='现场计算快照已保存到07验证工作台；仍不代表已经执行或完成后验验证。';render()}
}
function scenarioHistoryPanel(){
 const rows=currentScenarios();return panel(`静态情景计算 现场试算记录 (${rows.length})`,'保存的是本地静态反事实；与 有限网格优化 冻结候选和真实观察隔离',
 rows.length?table(['企业','时间','分数变化','期末现金','勾稽','操作'],rows.map(v=>[h(v.company),new Date(v.created).toLocaleString('zh-CN'),signedDiff(v.score_delta,0,3),money(v.ending_cash)+' 万元',v.verified==='runtime_17_checks'?`${v.check_pass_count}/17`:'外部导入·需重算',`<button class="tiny-button scenario-restore" data-id="${h(v.id)}">载入参数</button> <button class="tiny-button scenario-delete" data-id="${h(v.id)}">删除</button>`])):msg('没有保存现场情景记录。请先进入06行动中心运行静态情景计算后保存。'))}


// v0.5 有限网格优化 live optimizer: new Python grid execution, NOT a frozen-ledger filter.
const optCtx=()=>`${C}:${Y}:${CASE}`;
function optimizationStudio(){
 const scope=D.meta.optimizable.includes(C)&&Y===2022;
 const result=OPT_RESULT&&OPT_CONTEXT===optCtx()?OPT_RESULT:null;
 const liveRows=result?.top_candidates||[];
 const selected=liveRows.find(x=>x.decision_id===OPT_SELECTED)||liveRows[0]||null;
 window.__activeOptCandidate=selected;
 const field=(name,label,placeholder,step)=>`<label>${label} <input class="input-control opt-input" type="number" data-name="${name}" placeholder="${placeholder}" step="${step}" min="0" value="${h(OPT_INPUT[name])}" ${scope?'':'disabled'}/></label>`;
 const controls=`<div class="filter-bar"><label>现场搜索目标 <select class="form-select opt-input" data-name="objective" ${scope?'':'disabled'}>
 ${[['score','综合得分提升最大'],['cost','实施成本最小'],['cash','现金安全余量最大']].map(([value,label])=>`<option value="${value}" ${OPT_INPUT.objective===value?'selected':''}>${label}</option>`).join('')}</select></label>
 ${field('minimum_score_delta','最低分数提升 / 分','不限制','0.25')}
 ${field('maximum_action_cost','行动成本上限 / 万元','不限制','100')}
 ${field('maximum_debt_ratio','资产负债率上限 / %','不限制','0.5')}
 ${field('minimum_cash_headroom','最低现金护栏余量 / 万元','不限制','100')}</div>`;
 let content= `<div class="info">每次点击都使用安全2021—2022三表，按冻结网格实际评估本企业、本情景的 <strong>1,620 个候选</strong>；原有会计与风险护栏不变。你的附加目标和预算用于对本次搜索结果筛选及排序，<strong>不是无限连续优化或对未来经营的预测</strong>。</div>
 ${controls}<div class="action-row"><button class="primary-btn" id="run-live-optimization" ${scope&&!OPT_BUSY?'':'disabled'}>${OPT_BUSY?'正在执行 有限网格优化 搜索…':'立即运行 有限网格优化 现场优化'}</button><button class="ghost-btn" id="reset-live-optimization" ${OPT_BUSY?'disabled':''}>重置优化条件</button></div>
 ${OPT_INFO?msg(h(OPT_INFO),OPT_RESULT?'blue':'gold'):''}`;
 if(result){
   content+=`<div class="stat-strip compact-stats">${strip('现场评估',fmt(result.evaluated,0),'真实执行候选')}${strip('原约束可行',fmt(result.engine_feasible,0),'财务护栏通过')}${strip('附加条件可行',fmt(result.user_constraints_feasible,0),'你设置的目标')}${strip('Pareto 方案',fmt(result.pareto_count,0),'成本—分数取舍')}</div>`;
   if(selected){
     content+=`<div class="grid2 equal">${panel('现场推荐方案 · 已执行','可在下方切换候选后保存到07工作台',`<div class="stat-strip compact-stats">${strip('评分变化',signedDiff(selected.score_delta,0,3),'分')}${strip('目标综合得分',fmt(selected.overall_after,3),'冻结评分体系')}${strip('行动成本',money(selected.total_action_cost),'万元')}${strip('期末现金余量',money(selected.cash_headroom),'万元')}</div>
       ${table(['经营动作','搜索结果'],[['应收回款',pct(selected.receivables_collection_rate*100)],['库存释放',pct(selected.inventory_release_rate*100)],['销售费用压缩',pct(selected.selling_expense_reduction_rate*100)],['管理费用压缩',pct(selected.admin_expense_reduction_rate*100)],['新增短债 / 收入',pct(selected.short_term_debt_to_revenue*100)],['新增长债 / 收入',pct(selected.long_term_debt_to_revenue*100)],['负债率',pct(selected.debt_to_assets*100)],['会计勾稽',selected.accounting_checks_passed+' / '+selected.accounting_checks_total]])}
       <div class="action-row"><button id="save-live-optimization" class="primary-btn">保存现场搜索方案 → 07</button><button id="export-live-optimization" class="ghost-btn">导出搜索结果 JSON</button></div>`)}
       ${panel('本次搜索 Pareto 前沿',`${result.pareto_count} 项非支配候选，展示至多60项`,pointsGraph(result.pareto||[],selected))}</div>`;
     content+=panel('本轮现场候选 · 前 12 项','以下为本次实际求解的候选，不读取旧方案表',table(['序号','目标得分','分数提升','行动成本 / 万元','负债率','操作'],liveRows.map((x,i)=>[i+1,fmt(x.overall_after,3),signedDiff(x.score_delta,0,3),money(x.total_action_cost),pct(x.debt_to_assets*100),`<button class="tiny-button pick-live-optimization" data-id="${h(x.decision_id)}">${x.decision_id===selected.decision_id?'当前推荐':'查看 / 选定'}</button>`])));
   }else{
     content+=msg('在本次真实搜索的可行候选中，没有方案同时满足新增目标和预算。可以降低最低得分提升或放宽成本/现金限制；冻结财务护栏不会自动放松。','gold');
   }
   content+=`<div class="info">计算版本：${h(result.config_id)} · 耗时 ${fmt(result.elapsed_seconds,2)} 秒 · ${h(result.disclaimer)}</div>`;
 }else if(!scope){content+=msg(`当前 ${h(C)} / ${Y} 年不在 有限网格优化 正式验证范围；仅 VPM-071、101、203 的 2022 年可执行现场搜索。`,'gold')}
 return panel('目标驱动 · 有限网格优化 现场有限网格优化','Python 有限网格求解 · 与既有候选筛选分离',content);
}
async function runLiveOptimization(){
 if(OPT_BUSY)return;
 const stamp=optCtx();
 if(Y!==2022||!D.meta.optimizable.includes(C)){OPT_INFO='此企业或年份不在现场优化验证范围。';OPT_RESULT=null;render();return}
 const request={company:C,year:2022,case:CASE,objective:OPT_INPUT.objective};
 for(const [field,range] of [['minimum_score_delta',100],['maximum_action_cost',1e9],['maximum_debt_ratio',100],['minimum_cash_headroom',1e9]]){
   const raw=String(OPT_INPUT[field]??'').trim();
   if(raw===''){request[field]=null;continue}
   const n=Number(raw);
   if(!Number.isFinite(n)||n<0||n>range){OPT_RESULT=null;OPT_INFO='优化条件非法：'+field+'（请输入允许范围内的非负数字）';render();return}
   request[field]=field==='maximum_debt_ratio'?n/100:n;
 }
 OPT_BUSY=true;OPT_RESULT=null;OPT_SELECTED=null;OPT_INFO='正在现场计算全部冻结网格候选，检查会计护栏与新增目标…';render();
 try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
   let response;
   try{response=await fetch('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal})}
   finally{clearTimeout(timer)}
   const out=await response.json();if(stamp!==optCtx())return;
   if(!out.ok){OPT_INFO=out.error||'优化服务拒绝了当前条件';return}
   if(!out.engine_executed||out.reused_frozen_candidates){OPT_INFO='优化响应来源校验失败，已拒绝显示';return}
   OPT_RESULT=out;OPT_CONTEXT=stamp;OPT_SELECTED=out.recommended?.decision_id||null;
   OPT_INFO=`现场搜索完成：${out.evaluated} 条候选实际计算，${out.engine_feasible} 条通过原约束，${out.user_constraints_feasible} 条满足你的附加条件。`;
 }catch(e){OPT_RESULT=null;OPT_INFO='现场优化失败：'+(e.name==='AbortError'?'计算请求超时':e.message)+'。原有候选筛选和静态情景计算情景不受影响。'}
 finally{OPT_BUSY=false;render()}
}
function saveLiveOptimization(){
 const x=window.__activeOptCandidate,r=OPT_RESULT;
 if(!x||!r||OPT_CONTEXT!==optCtx()||!r.engine_executed){OPT_INFO='没有可保存的现场求解结果';render();return}
 const frozen=A?.candidates?.find(a=>a.company_id===C&&a.case===CASE&&a.decision_id===x.decision_id);
 const numbers=['overall_after','score_delta','total_action_cost','ending_cash','debt_to_assets','cash_headroom'];
 if(!frozen||numbers.some(k=>Math.abs(Number(frozen[k])-Number(x[k]))>0.02)){
    OPT_INFO='现场求解与已审计冻结台账对账不通过；拒绝保存，请检查模型和数据版本。';render();return
 }
 const item={id:'op'+Date.now(),decision_id:x.decision_id,company:C,year:2022,case:CASE,
  score_delta:x.score_delta,overall_after:x.overall_after,cost:x.total_action_cost,debt:x.debt_to_assets,
  ending_cash:x.ending_cash,cash_headroom:x.cash_headroom,
  receivables_collection_rate:x.receivables_collection_rate,inventory_release_rate:x.inventory_release_rate,
  selling_expense_reduction_rate:x.selling_expense_reduction_rate,admin_expense_reduction_rate:x.admin_expense_reduction_rate,
  short_term_debt_to_revenue:x.short_term_debt_to_revenue,long_term_debt_to_revenue:x.long_term_debt_to_revenue,
  created:new Date().toISOString(),source:'有限网格优化 live search (frozen ledger cross-check passed)',schema:4,
  optimization_context:{objective:r.objective,constraints:r.constraints,evaluated:r.evaluated,
     engine_feasible:r.engine_feasible,eligible:r.user_constraints_feasible,config_id:r.config_id}};
 const arr=currentPlans();arr.unshift(item);
 if(saveLocal('plans',arr.slice(0,40))){ACTIVE_REVIEW=item.id;nav('validation')}
}

const $=x=>document.querySelector(x), fmt=(v,n=1)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n}), money=v=>fmt(v,0), pct=v=>fmt(v,1)+'%', h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(id=C,year=Y)=>D.records[id+':'+year]||null;
const strip=(title,value,foot='')=>`<div class="stat"><div class="stat-label">${title}</div><div class="stat-val">${value}</div><div class="stat-foot">${foot}</div></div>`;
const panel=(title,note,inner)=>`<section class="panel"><div class="panel-head"><div class="panel-title">${title}</div><div class="panel-note">${note||''}</div></div>${inner}</section>`;
const msg=(text,type='blue')=>`<div class="info-box ${type==='blue'?'blue':''}">${text}</div>`;
const table=(headers,rows)=>`<div style="overflow-x:auto"><table class="data-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const dims=[['score_profitability','盈利质量'],['score_solvency','偿债能力'],['score_operations','运营效率'],['score_growth','成长动能'],['score_cashflow','现金保障'],['score_research','研发投入']];
const each=(year=Y)=>D.companies.map(c=>get(c.id,year)).filter(x=>x&&x.overall_score!==undefined);
function avg(arr){const z=arr.filter(v=>Number.isFinite(+v));return z.length?z.reduce((a,b)=>a+Number(b),0)/z.length:0}
function spark(vals,w=660,height=238,color='#91e8f3'){
 const clean=vals.map(v=>Number(v)||0),min=Math.min(...clean),max=Math.max(...clean),lo=min-(max-min||8)*.26,hi=max+(max-min||8)*.26;
 const xs=clean.map((v,i)=>42+(w-82)*i/(clean.length-1||1)),ys=clean.map(v=>height-38-(v-lo)/(hi-lo)*(height-76));const coords=xs.map((x,i)=>[x,ys[i]]),line=coords.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
 const grid=[.25,.5,.75].map(t=>`<line x1="42" x2="${w-34}" y1="${height-38-(height-76)*t}" y2="${height-38-(height-76)*t}" stroke="rgba(170,219,229,.10)" stroke-dasharray="3 6"/>`).join('');
 return `<svg class="spark" viewBox="0 0 ${w} ${height}" role="img" aria-label="2020到2022年综合评分趋势"><defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".20"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${line} L${xs.at(-1)} ${height-38} L${xs[0]} ${height-38} Z" fill="url(#trend-fill)"/><path d="${line}" stroke="${color}" stroke-width="2.6" fill="none"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4.7" fill="${color}" stroke="#102638" stroke-width="3"/><text x="${x}" y="${y-15}" font-size="12" text-anchor="middle" fill="#d9edf2">${fmt(clean[i],1)}</text><text x="${x}" y="${height-12}" font-size="12" text-anchor="middle" fill="#8daab9">${2020+i}</text>`).join('')}</svg>`;
}
function radar(row,peer){
 const w=420,cx=210,cy=156,rad=111,angles=[-90,-30,30,90,150,210].map(x=>x*Math.PI/180);
 const poly=(rec,scale)=>angles.map((a,i)=>[cx+rad*scale*(Number(rec[dims[i][0]])||0)/100*Math.cos(a),cy+rad*scale*(Number(rec[dims[i][0]])||0)/100*Math.sin(a)].map(x=>x.toFixed(1)).join(',')).join(' ');
 const circles=[.25,.5,.75,1].map(q=>`<polygon points="${angles.map(a=>`${cx+rad*q*Math.cos(a)},${cy+rad*q*Math.sin(a)}`).join(' ')}" fill="none" stroke="rgba(142,209,223,.16)" stroke-width="1"/>`).join('');
 const axes=angles.map((a,i)=>`<line x1="${cx}" y1="${cy}" x2="${cx+rad*Math.cos(a)}" y2="${cy+rad*Math.sin(a)}" stroke="rgba(142,209,223,.13)"/><text x="${cx+(rad+34)*Math.cos(a)}" y="${cy+(rad+28)*Math.sin(a)+4}" font-size="12" text-anchor="middle" fill="#a2bfcc">${dims[i][1]}</text>`).join('');
 return `<svg class="radar-svg" viewBox="0 0 420 315" role="img" aria-label="六维财务评分雷达图">${circles}${axes}${peer?`<polygon points="${poly(peer,1)}" fill="rgba(215,177,105,.09)" stroke="#d6b267" stroke-width="1.5" stroke-dasharray="5 5"/>`:''}<polygon points="${poly(row,1)}" fill="rgba(84,172,204,.21)" stroke="#91e8f3" stroke-width="2.1"/></svg>`;
}
function meter(label,value){return `<div class="meter"><div class="meter-label">${label}</div><div class="meter-track"><div class="meter-fill" style="width:${Math.max(0,Math.min(100,Number(value)||0))}%"></div></div><div class="meter-val">${fmt(value)}</div></div>`}
function name(id=C){return D.companies.find(x=>x.id===id)?.name||id}
function dimensions(row){return dims.map(([k,label])=>meter(label,row[k])).join('')}
function nav(route){if(!ROUTES.some(x=>x[0]===route))route='overview';R=route; history.pushState(null,'','/workspace/'+route);render()}
function getPath(){const a=location.pathname.match(/^\/workspace\/([^/?]+)/);return a?a[1]:'overview'}
function topTitle(){return ROUTES.find(x=>x[0]===R)||ROUTES[0]}
function overview(){let r=get(),trend=[2020,2021,2022].map(y=>get(C,y)?.overall_score||0),r2021=get(C,Y-1),delta=r&&r2021?r.overall_score-r2021.overall_score:0,rank=r.within_year_rank,coverage=r.valid_weight_coverage;
 return `<div class="stat-strip">${strip('综合评价 / 100',fmt(r.overall_score,2),r2021?`${delta>=0?'+':''}${fmt(delta,2)} vs ${Y-1} · 冻结评分`:'首个评价年度')}${strip('仿真样本年度排名',String(rank)+' / 328',`样本内百分位 ${fmt(r.within_year_percentile)}%`)}${strip('资产规模',money(r.total_assets),`万元 · ${Y} 年`)}${strip('经营现金流',money(r.net_cash_from_operating_activities),`万元 · 安全合成三表`)}</div>
 <div class="hero-panel"><h2>${h(name())} <span class="pill">${h(C)}</span></h2><p>基于 ${Y} 年安全仿真三表与冻结评价参数，形成企业财务画像、仿真群体位置与可追溯证据。本页面不包含真实医药企业排名或未来财务预测。</p><div class="side-meta">STATE PROFILE<br/><span style="color:var(--cyan);font-size:15px">${h(r.state_id||'—')}</span><br/>${h(r.state_name||'')}</div><div class="action-row"><button class="primary-btn go" data-go="position">查看状态定位 →</button><button class="ghost-btn go" data-go="action">查看行动方案 ↗</button><button class="ghost-btn go" data-go="research">科研可视化图谱 ↗</button></div></div>
 <div class="grid2">${panel('年度综合评分轨迹','2020—2022 · 冻结评价',spark(trend)+`<div class="info">得分变化不是企业实际经营改善的因果证据；所有企业均为合成样本。</div>`)}${panel('六维财务状态',`${Y} 年六维评分`,radar(r)+`<div style="display:flex;justify-content:space-around;color:var(--muted);font-size:12px"><span>● 当前企业</span><span>状态：${h(r.state_id)}</span><span>权重覆盖 ${fmt(coverage*100)}%</span></div>`)}</div>
 <div class="grid2 equal">${panel('六维评分分解','冻结模型 · 六项业务维度',dimensions(r))}${panel('分析线索与证据入口','点击继续进入专业工作台',`<div class="trace-line"><div class="trace-num">01</div><div class="trace-text"><strong>基础数据</strong><br/>2019—2022 连续三表，资产负债表恒等式、利润及现金流来源可审计。</div></div><div class="trace-line"><div class="trace-num">02</div><div class="trace-text"><strong>状态与评价</strong><br/>${h(r.state_name)}，当前年度排名 ${rank} / 328。仅代表合成参照范围。</div></div><div class="trace-line"><div class="trace-num">03</div><div class="trace-text"><strong>行动范围</strong><br/>经过正式安全验证的情景/优化目前仅支持 VPM-071、101、203 的 2022 年。</div></div><div class="action-row"><button class="ghost-btn go" data-go="governance">数据治理 →</button><button class="ghost-btn go" data-go="attribution">变化归因 →</button></div>`)}</div>${panel('风险证据快捷入口 · 规则观察','此处只统计可解释的合成报表警戒线，不产生违约评级',`<div class="action-row"><span class="pill gold">本年度触发 ${riskEvidenceFor(r,get(C,Y-1)).filter(x=>x.hit===true).length} 项观察</span><button class="ghost-btn go" data-go="forecast">查看六项证据与年度回放 →</button></div><div class="info">“没有触发”不代表没有风险，历史群体转移不是个体预测。</div>`)}`;
}
function ingest(){return window.QZUser.entry()}
function governance(){let r=get(),rows=D.companies.length;const resid=r.total_assets-r.total_liabilities-r.total_equity,cfres=r.beginning_cash+r.net_change_in_cash-r.ending_cash;
 return `<div class="stat-strip">${strip('仿真企业',rows+' 家','已验证安全数据来源')}${strip('三表联合年度', '4 年','2019—2022 · 1312 企业年度')}${strip('冻结评价记录','984 条','2020—2022')}${strip('关键恒等式偏差',fmt(Math.max(Math.abs(resid),Math.abs(cfres)),2),'单位：万元；舍入容差需考虑')}</div>
 <div class="grid2 equal">${panel('当前企业数据准入预检','${Y} · 三表基础勾稽',`<div class="check-row"><span>资产 = 负债 + 权益</span><span>${Math.abs(resid)<.05?'PASS':'CHECK'}</span></div><div class="check-row"><span>期初现金 + 净变动 = 期末现金</span><span>${Math.abs(cfres)<.05?'PASS':'CHECK'}</span></div><div class="check-row"><span>三类报表均已载入</span><span>PASS</span></div><div class="check-row"><span>来源：独立合成数据</span><span>已标识</span></div><div class="check-row"><span>模型年份不包含 2023</span><span>PASS</span></div>${msg('这些是体验版直接基于所选安全三表计算的基础勾稽展示，并不代替独立的数据质量审查。')}`)}${panel('数据口径与限制','数据来源：本地合成数据',`<div class="overline">SCHEMA & PROVENANCE</div><div class="info"><strong>单位：</strong>CNY_10K（万元）<br/><strong>数据：</strong>328 家自主合成企业四年三表<br/><strong>评分：</strong>2020—2022 冻结 16 项指标综合评价<br/><strong>状态：</strong>S1 / S2 冻结状态模型<br/><strong>限制：</strong>仅提供本项目构造的合成示范数据与配套模型</div>${msg('所有企业名称均为虚构；本系统不能提供真实市场排名、投资或信贷结论。','gold')}`)}</div>`;
}
function position(){let r=get(),peer=get(PEER,Y),ranked=each().sort((a,b)=>b.overall_score-a.overall_score),median=ranked[Math.floor(ranked.length/2)].overall_score;
 return `<div class="stat-strip">${strip('当前综合得分',fmt(r.overall_score,2),'冻结模型得分')}${strip('仿真年度排名',`${r.within_year_rank} / 328`,'仅合成样本')}${strip('参照样本得分中位数',fmt(median,2),'当前年份')}${strip('财务状态',h(r.state_id),h(r.state_name))}</div>
 <div class="filter-bar"><label>对照企业 <select class="form-select" id="peer-select">${D.companies.map(c=>`<option value="${c.id}" ${c.id===PEER?'selected':''}>${h(c.id+' · '+c.name)}</option>`).join('')}</select></label><button class="ghost-btn" id="switch-peer">交换目标与对照 ↔</button></div>
 <div class="grid2">${panel('双企业六维结构对照','青色：目标企业 / 金色虚线：对照企业',radar(r,peer)+`<div class="info">${h(name())} · ${h(name(PEER))}</div>`)}${panel('维度差异（目标企业）','六维值 / 100',dimensions(r)+`<div class="gridline"></div><div class="info">同一年份、同一冻结模型。样本内比较，并非真实行业可比性判断。</div>`)}</div>
 ${metricPanel()}${diagPositionPanel()}${panel('同行评分对照','同一年份下的合成参照',table(['公司','综合得分','合成样本排名','状态'],[[h(name()),fmt(r.overall_score,2),r.within_year_rank,h(r.state_id)],[h(name(PEER)),fmt(peer.overall_score,2),peer.within_year_rank,h(peer.state_id)],['年度中位数',fmt(median,2),'—','—']]))}`;
}
function attribution(){let r=get(),prev=get(C,Y-1),changes=prev?dims.map(([code,label])=>[label,fmt(prev[code]),fmt(r[code]),fmt(r[code]-prev[code])]):[];let drivers=(r.top_contributors||'').split(';').filter(Boolean).map(x=>x.split(':'));
 return `${msg('以下展示经过冻结评价模型计算的得分贡献及年度差异。指标贡献不等于管理行为的因果效果，也不等于企业的实际经营收益。')}
 <div class="grid2 equal">${panel('年度六维变动',prev?`${Y-1} → ${Y} · 分数差异`:'首年无前期评价记录',prev?table(['维度',String(Y-1),String(Y),'差异'],changes):'<div class="info">请选择 2021 或 2022 年度查看相邻年变化。2020 是首个冻结评价年度。</div>')}${panel('主要得分贡献','由评分面板原样读取',`<div class="overline">TOP CONTRIBUTORS</div>${drivers.map(([k,v],i)=>`<div class="trace-line"><div class="trace-num">0${i+1}</div><div class="trace-text">${h(D.weights.find(x=>x.code===k)?.name||k)}<br/><strong style="color:var(--cyan)">+${fmt(v,3)} 分贡献</strong></div></div>`).join('')||'<div class="info">当前无可用贡献记录。</div>'}${msg('贡献基于固定评分参数、标准化处理和权重，并不代表单独增加该指标可获得相同分数。')}`)}</div>
 ${diagAttributionPanel()}${panel('经营归因路径','先解释变化，再设计干预',`<div class="insight-grid"><div class="feature"><div class="n">01 / OBSERVE</div><h3>观察</h3><p>确认实际变动指标与原始三表金额，检查分母和缺失原因。</p></div><div class="feature"><div class="n">02 / EXPLAIN</div><h3>解释</h3><p>结合冻结归一化值、权重及评分贡献解释综合分变化。</p></div><div class="feature"><div class="n">03 / DECIDE</div><h3>决策</h3><p>情景推演是静态反事实，行动约束不等于已证实的经营因果收益。</p><button class="ghost-btn go" data-go="action">进入行动中心</button></div></div>`)}`;
}

// v0.6 deterministic evidence-oriented screening rules. NOT a calibrated default model.
function riskEvidenceFor(row, previous){
 const pctv=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b*100:null;
 const num=k=>{const v=row?.[k];return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v)};
 const debt=pctv(num('total_liabilities'),num('total_assets'));
 const current=pctv(num('total_current_assets'),num('total_current_liabilities'));
 const income=num('net_income'),operating=num('net_cash_from_operating_activities');
 const cashProfit=income!==null&&income>0&&operating!==null?operating/income:null;
 const growth=previous?pctv(num('revenue'),Number(previous.revenue)):null;
 const yoy=growth===null?null:growth-100;
 const mk=(code,title,value,threshold,trigger,unit,source,reason)=>({code,title,value,threshold,hit:value===null?null:Boolean(trigger(value)),unit,source,reason});
 return [
  mk('loss','净利润为负',income,'< 0 万元',v=>v<0,'万元',`利润表 · net_income=${money(income)}`, '盈利能力压力'),
  mk('cash_negative','经营现金流为负',operating,'< 0 万元',v=>v<0,'万元',`现金流量表 · net_cash_from_operating_activities=${money(operating)}`, '经营回款与支付压力'),
  mk('debt','资产负债率偏高',debt,'≥ 70%',v=>v>=70,'%',`资产负债表 · 负债 ${money(num('total_liabilities'))} / 资产 ${money(num('total_assets'))} 万元`,'负债杠杆观察'),
  mk('liquidity','流动资产覆盖不足',current===null?null:current/100,'< 1.0 倍',v=>v<1,'倍',`资产负债表 · 流动资产 ${money(num('total_current_assets'))} / 流动负债 ${money(num('total_current_liabilities'))} 万元`,'短期偿付资源观察'),
  mk('quality','盈利现金转化偏低',cashProfit,'< 0.5 倍（仅净利润>0时）',v=>v<.5,'倍',`利润表净利润 ${money(income)}；经营现金流 ${money(operating)} 万元`,'利润现金匹配观察'),
  mk('sales_down','营业收入同比下降',yoy,'≤ -10%',v=>v<=-10,'%',previous?`利润表 · ${previous.year}年 ${money(previous.revenue)} → ${row.year}年 ${money(row.revenue)} 万元`:'缺少前期数据','收入变化观察')
 ];
}
function riskPanel(){
 const r=get(), prev=get(C,Y-1), rules=riskEvidenceFor(r,prev),hit=rules.filter(x=>x.hit===true).length,covered=rules.filter(x=>x.hit!==null).length;
 const years=[2020,2021,2022].map(y=>{const a=get(C,y),p=get(C,y-1),z=riskEvidenceFor(a,p);return [y,z.filter(x=>x.hit===true).length,`${z.filter(x=>x.hit!==null).length}/6`,z.filter(x=>x.hit===true).map(x=>x.title).join('、')||'无规则触发（不是无风险）']});
 const renderValue=x=>x.value===null?'无法计算':x.unit==='万元'?money(x.value)+' 万元':x.unit==='%'?fmt(x.value,2)+'%':fmt(x.value,3)+' 倍';
 const badge=x=>x.hit===null?`<span class="pill dim">${x.code==='quality'&&Number(r.net_income)<=0?'不适用':'无法判定'}</span>`:x.hit?'<span class="pill gold">触发观察</span>':'<span class="pill">未触发</span>';
 return `<div class="stat-strip compact-stats">${strip('触发的观察规则',hit+' / '+covered,'仅启发式财务观察；非风险评级')}${strip('有效规则覆盖',covered+' / 6','缺失指标明确不判定')}${strip('本年度合成样本',String(Y),'独立合成报表')}${strip('模型预测状态','未启用','不预测违约或迁移概率')}</div>
 <div class="grid2 equal">${panel('六项风险证据规则 · 逐项可追溯','当前企业 / 当前年度 · 原始金额和公式来自合成三表',table(['观察维度','实测值','演示警戒线','结果','取数依据'],rules.map(x=>[h(x.title),renderValue(x),h(x.threshold),badge(x),`<small>${h(x.source)}</small>`]))+`<div class="info">规则阈值为产品透明演示约定，尚未经真实违约/破产样本验证；不同规则存在关联性，不能将命中数转成“风险等级”或概率。</div>`)}${panel('三年观察回放','2020—2022 · 每年按同一套规则重新判定',table(['年度','触发数','有效项','主要观察'],years.map(row=>[row[0],row[1],row[2],h(row[3])]))+`<div class="info">逐年回放是规则复核，而非事后预测准确率。2020年的收入同比使用独立合成2019年数据。</div><div class="action-row"><button class="ghost-btn go" data-go="position">查看原始指标与对标 →</button><button class="ghost-btn go" data-go="attribution">查看评分归因 →</button></div>`)}</div>
 ${msg('限制：当前体验版没有验证 Altman Z′ 所需的留存收益及息税前利润等字段口径，因此不计算 Z′ 或宣称信用风险评分。若未来补全字段，也必须先核验适用行业和模型外部验证。','gold')}`;
}

function forecast(){let r=get();let matrix=(window)=>table(['起点','终点','样本数','次数','平滑转移率'],D.transition.filter(x=>x.window===window).map(x=>[x.start_state,x.target_state,x.start_n,x.count,pct(x.probability*100)]));
 return `<div class="hero-panel"><h2>历史转移可以观察，个体预测仍受限。</h2><p>新模型采用冻结 S1/S2 双状态体系。由于实际状态转换事件过少，复杂预测模型未通过门禁，因此此页面只展示群体历史转移统计，绝不输出貌似精确的个体未来概率。</p><div class="action-row"><span class="pill gold">CONDITIONAL_BASELINES_ONLY</span><span class="pill dim">复杂迁移模型 BLOCKED</span></div></div>
 <div class="stat-strip" style="margin-top:18px">${strip('当前企业历史状态',h(r.state_id),h(r.state_name))}${strip('模型状态种类','2','S1 / S2')}${strip('训练转换事件','20','最少方向事件 6')}${strip('个体迁移预测','未开放','不满足转换事件验证门槛')}</div>
 <div class="grid2 equal">${panel('2020 → 2021','冻结历史训练窗口',matrix('2020->2021'))}${panel('2021 → 2022','验证描述窗口',matrix('2021->2022'))}</div>${riskPanel()}${msg('当前仅开放双状态历史统计；其他预测模型尚未通过本项目的验证，不能生成个体未来概率。')}`;
}

const metricSpecs={
 net_margin:{title:'销售净利率',unit:'%',formula:'净利润 ÷ 营业收入 × 100%',parts:['net_income','revenue'],labels:['净利润','营业收入'],fn:r=>r.revenue?r.net_income/r.revenue*100:null},
 gross_margin:{title:'销售毛利率',unit:'%',formula:'毛利润 ÷ 营业收入 × 100%',parts:['gross_profit','revenue'],labels:['毛利润','营业收入'],fn:r=>r.revenue?r.gross_profit/r.revenue*100:null},
 debt_ratio:{title:'资产负债率',unit:'%',formula:'负债合计 ÷ 资产合计 × 100%',parts:['total_liabilities','total_assets'],labels:['负债合计','资产合计'],fn:r=>r.total_assets?r.total_liabilities/r.total_assets*100:null},
 cash_revenue:{title:'经营现金流收入比',unit:'%',formula:'经营活动现金流净额 ÷ 营业收入 × 100%',parts:['net_cash_from_operating_activities','revenue'],labels:['经营现金流净额','营业收入'],fn:r=>r.revenue?r.net_cash_from_operating_activities/r.revenue*100:null},
 rd_ratio:{title:'研发投入强度',unit:'%',formula:'研发投入 ÷ 营业收入 × 100%',parts:['research_and_development','revenue'],labels:['研发投入','营业收入'],fn:r=>r.revenue?r.research_and_development/r.revenue*100:null}
};
function metricValue(key,row){return row?metricSpecs[key].fn(row):null}
function metricPanel(){const spec=metricSpecs[METRIC],r=get(),peer=get(PEER,Y),v=metricValue(METRIC,r),pv=metricValue(METRIC,peer);
 const vals=D.companies.map(c=>metricValue(METRIC,get(c.id,Y))).filter(x=>x!==null&&Number.isFinite(x)).sort((a,b)=>a-b);
 const med=vals.length?(vals[Math.floor((vals.length-1)/2)]+vals[Math.floor(vals.length/2)])/2:null;
 const d=[2020,2021,2022].map(yr=>metricValue(METRIC,get(C,yr)));
 const trend=spark(d,660,238);
 const raw=spec.parts.map((k,i)=>[spec.labels[i],money(r[k])+' 万元',money(peer[k])+' 万元']);
 return panel('财务指标下钻 · 原始三表取数','当前企业 / 对照企业 / 合成样本中位数',`<div class="filter-bar"><label>选择指标 <select class="form-select" id="metric-select">${Object.entries(metricSpecs).map(([key,t])=>`<option value="${key}" ${METRIC===key?'selected':''}>${t.title}</option>`).join('')}</select></label></div><div class="stat-strip compact-stats">${strip('当前企业',fmt(v,2)+spec.unit,h(C))}${strip('对照企业',fmt(pv,2)+spec.unit,h(PEER))}${strip('合成样本中位数',fmt(med,2)+spec.unit,`${vals.length} 家可计算`)}${strip('差值',fmt(v-pv,2)+' pp','当前 − 对照')}</div><div class="grid2 equal"><div>${trend}<div class="info">${h(C)} 2020—2022 年逐年按同一公式重新计算；这不是综合评分。</div></div><div><div class="overline">计算公式 / INPUT TRACE</div><div class="formula">${spec.formula}</div>${table(['取数字段','当前企业','对照企业'],raw)}<div class="info">分母为零时不计算；单位为万元。百分比指标的企业差值单位为百分点（pp）。</div></div></div>`);
}
function loadLocal(key,fallback){try{return JSON.parse(localStorage.getItem('QICAI_V02_'+key))||fallback}catch(e){return fallback}}
function saveLocal(key,v){try{localStorage.setItem('QICAI_V02_'+key,JSON.stringify(v));return true}catch(e){FLASH='浏览器拒绝本地保存，请检查隐私模式或存储权限。';return false}}
function currentProjects(){return loadLocal('projects',[])}
function currentPlans(){return loadLocal('plans',[])}
function toast(t){FLASH=t;const el=document.querySelector('#notice-banner');if(el){el.textContent=t;el.hidden=false}}
function downloadText(filename,content,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function saveProject(){const title=($('#project-name')?.value||`${name()} · ${Y} 财务分析`).trim().slice(0,80);const p={id:'p'+Date.now(),title,company:C,year:Y,peer:PEER,case:CASE,created:new Date().toISOString(),kind:'browser_snapshot'};const all=currentProjects();all.unshift(p);if(saveLocal('projects',all.slice(0,40))){toast('项目视图已保存到本机浏览器（同一访问地址）。');render()}}
function filterCandidates(){if(!A)return[];const cost=FILTER.cost.trim()===''?Infinity:+FILTER.cost, debt=FILTER.debt.trim()===''?Infinity:+FILTER.debt/100, score=FILTER.score.trim()===''?-Infinity:+FILTER.score;
 return A.candidates.filter(r=>r.company_id===C && r.case===CASE && r.total_action_cost<=cost+1e-8 && r.debt_to_assets<=debt+1e-10 && r.overall_after>=score-1e-8)
}
function rankCandidate(a,b){if(OBJ==='cost')return (a.total_action_cost-b.total_action_cost)||(b.overall_after-a.overall_after);if(OBJ==='cash')return (b.cash_headroom-a.cash_headroom)||(b.overall_after-a.overall_after);return (b.overall_after-a.overall_after)||(a.total_action_cost-b.total_action_cost)}
function choiceDetails(x){if(!x)return msg('当前筛选条件下没有任何满足约束的已验证候选。可以调宽条件，或者切换情景查看原因。','gold');
 return `<div class="stat-strip compact-stats">${strip('筛选目标得分',fmt(x.overall_after,3),'冻结评价体系')}${strip('相对基准变化',fmt(x.score_delta,3),'分')}${strip('实施现金成本',money(x.total_action_cost),'万元')}${strip('现金护栏余量',money(x.cash_headroom),'万元')}</div>`+
 table(['决策动作','既有模型候选值'],[['应收回款比例',pct(x.receivables_collection_rate*100)],['库存释放比例',pct(x.inventory_release_rate*100)],['销售费用下降比例',pct(x.selling_expense_reduction_rate*100)],['管理费用下降比例',pct(x.admin_expense_reduction_rate*100)],['短期融资 / 收入',pct(x.short_term_debt_to_revenue*100)],['长期融资 / 收入',pct(x.long_term_debt_to_revenue*100)],['资产负债率',pct(x.debt_to_assets*100)],['利息保障倍数',fmt(x.interest_coverage,3)],['会计校验项',`${fmt(x.accounting_checks_passed,0)} / ${fmt(x.accounting_checks_total,0)}`],['最大勾稽残差',fmt(x.accounting_max_abs_residual,7)]])+
 `<div class="action-row"><button id="save-candidate" class="primary-btn">保存方案并建立行动台账</button><button id="download-candidate" class="ghost-btn">导出候选 CSV ↓</button></div><div class="info">方案编号 ${h(x.decision_id)}。仅来自已计算并完成会计约束检查的模拟候选，且已通过原约束与会计检查；不代表真实经营可实现性。</div>`
}
function pointsGraph(rows,selected){if(rows.length<1)return msg('没有可以绘制的候选。','gold');
 let subset=rows.length>260?rows.filter((_,i)=>i%Math.ceil(rows.length/260)===0):rows;
 const allCost=rows.map(r=>r.total_action_cost),allScore=rows.map(r=>r.overall_after);
 const cmin=Math.min(...allCost),cmax=Math.max(...allCost),smin=Math.min(...allScore),smax=Math.max(...allScore);
 const sx=r=>50+(r.total_action_cost-cmin)/(cmax-cmin||1)*580,sy=r=>225-(r.overall_after-smin)/(smax-smin||1)*187;
 return `<svg class="candidate-chart" viewBox="0 0 680 275" role="img" aria-label="筛选后候选的成本得分散点图"><line x1="50" y1="225" x2="640" y2="225" stroke="#537687"/><line x1="50" y1="34" x2="50" y2="225" stroke="#537687"/>${[0,.5,1].map(t=>`<line x1="50" x2="640" y1="${225-187*t}" y2="${225-187*t}" stroke="rgba(145,232,243,.1)" stroke-dasharray="3 6"/>`).join('')}${subset.map(r=>`<circle cx="${sx(r).toFixed(1)}" cy="${sy(r).toFixed(1)}" r="2.6" fill="rgba(145,232,243,.50)"/>`).join('')}${selected?`<circle cx="${sx(selected)}" cy="${sy(selected)}" r="7" fill="#dbbd7e" stroke="#081622" stroke-width="2"/>`:''}<text x="50" y="245" class="axis-label">${fmt(cmin,0)}</text><text x="640" y="245" text-anchor="end" class="axis-label">${fmt(cmax,0)} 万元</text><text x="55" y="24" class="axis-label">得分 / 100</text><text x="58" y="45" class="axis-label">${fmt(smax,1)}</text><text x="58" y="219" class="axis-label">${fmt(smin,1)}</text><text x="340" y="265" text-anchor="middle" class="axis-label">行动现金成本</text></svg><div class="info">展示至多约 260 个已验证候选的等间隔抽样点；金色点为当前选定方案。筛选与推荐基于完整候选集，不受绘图抽样影响。</div>`
}
function action(){
 const scope=Boolean(A?.meta?.total_feasible)&&D.meta.optimizable.includes(C)&&Y===2022, company=D.meta.optimizable.includes(C)?C:'VPM-071';
 const q=scope?D.plan_counts.find(x=>x.company_id===C&&x.case===CASE):null;
 const found=scope?filterCandidates().sort(rankCandidate):[];
 const current=found.find(x=>x.decision_id===SEL)||found[0]||null;window.__activeCandidate=current;
 const hint=!scope?msg(A?.meta?.total_feasible?`当前 ${h(C)} / ${Y} 年尚无经过 有限网格优化 正式验证的优化结果。切换至 VPM-071、101、203 的 2022 年，可以操作候选方案工作台。系统不会借用其他企业的数字。`:'候选台账加载失败。请检查 /data/action_candidates.json 是否正常返回，并重新启动体验版。','gold'):'';
 const filters=scope?`<div class="filter-bar"><label>目标优先级 <select class="form-select" id="obj-select"><option value="score" ${OBJ==='score'?'selected':''}>综合得分最大</option><option value="cost" ${OBJ==='cost'?'selected':''}>行动现金成本最小</option><option value="cash" ${OBJ==='cash'?'selected':''}>现金余量最大</option></select></label><label>成本上限 / 万元 <input class="input-control" id="filter-cost" type="number" step="100" min="0" placeholder="不限" value="${h(FILTER.cost)}"/></label><label>负债率上限 / % <input class="input-control" id="filter-debt" type="number" min="0" max="100" step="0.5" placeholder="不限" value="${h(FILTER.debt)}"/></label><label>最低综合得分 <input class="input-control" id="filter-score" type="number" min="0" max="100" step="1" placeholder="不限" value="${h(FILTER.score)}"/></label><button id="reset-filters" class="ghost-btn">重置筛选</button></div>`:'';
 const compareRows=scope?COMPARE.map(id=>A.candidates.find(x=>x.decision_id===id&&x.company_id===C&&x.case===CASE)).filter(x=>x&&x.company_id===C&&x.case===CASE):[];
 const comparePanelV3=scope?panel('多方案对照 · 最多三项','基于已计算候选，不重新运行模型', compareRows.length?table(['方案','冻结评分','实施成本 / 万元','期末现金 / 万元','资产负债率','移除'],compareRows.map((x,i)=>[`方案 ${i+1} · ${h(x.company_id)}`,fmt(x.overall_after,3),money(x.total_action_cost),money(x.ending_cash),pct(x.debt_to_assets*100),`<button class="tiny-button remove-comparison" data-id="${h(x.decision_id)}">移除</button>`]))+`<div class="info">对照方案属于同一企业、同一原搜索情景、同一年份；数字为冻结候选输出。差异属于方案比较，不代表因果效果。</div>`:msg('在下方候选表点击「加入对照」，即可并排比较最多三个方案的成本、评分、现金与负债率。')):'';
 const selectedPanel=scope?panel('当前选定方案','来自已完成计算的合成候选台账',choiceDetails(current)):panel('验证范围限制','不借用其他公司的结果',hint);
 const comparePanel=scope?panel('筛选后的成本—评分分布',`${found.length} 条候选参与筛选`,pointsGraph(found,current)):panel('三个已验证企业','2022 年',table(['企业','当前范围'],D.meta.optimizable.map(x=>[x,`${h(name(x))} · 2022`])));
 const tablePanel=scope?panel('可供比较的候选方案','选取排序前 10 个；点击选择方案',table(['方案','优化后得分','成本 / 万元','负债率','现金余量','操作'],found.slice(0,10).map((x,i)=>[h(x.decision_id.split('|')[0]+` · #${i+1}`),fmt(x.overall_after,2),money(x.total_action_cost),pct(x.debt_to_assets*100),money(x.cash_headroom),`<button class="tiny-button choose-candidate" data-id="${h(x.decision_id)}">${x.decision_id===current?.decision_id?'当前选定':'查看方案'}</button> <button class="tiny-button add-comparison" data-id="${h(x.decision_id)}">加入对照</button>`]))):'';
 return `<div class="hero-panel"><h2>从已验证候选中，选择适合当前约束的方案。</h2><p>基于 有限网格优化 已计算的 14,580 条搜索记录，其中 9,923 条通过原约束检查；这里对已通过约束检查的模拟候选进行筛选和排序，而不是只查看三张预存总结表。<strong>调整条件不会重跑优化器，也不会重新计算新的财务状态</strong>；结果仅取自原约束已通过的候选记录。</p><div class="side-meta">FROZEN SEARCH LEDGER<br/>14,580 EVALUATED<br/>9,923 FEASIBLE</div></div>
 <div class="filter-bar" style="margin-top:18px"><label>验证范围企业 <select class="form-select" id="action-company">${D.meta.optimizable.map(id=>`<option value="${id}" ${id===company?'selected':''}>${h(id+' · '+name(id))}</option>`).join('')}</select></label><label>原搜索情景 <select class="form-select" id="action-case">${[['conservative','保守'],['neutral','中性'],['optimistic','乐观']].map(([k,t])=>`<option value="${k}" ${CASE===k?'selected':''}>${t} · ${k.toUpperCase()}</option>`).join('')}</select></label></div>${hint}
 <div class="stat-strip">${strip('原搜索总候选',fmt(q?.evaluated||0,0),'冻结范围')}${strip('原约束通过',fmt(q?.feasible||0,0),'会计检查与护栏')}${strip('当前筛选后',fmt(scope?found.length:0,0),'在已通过候选中筛选')}${strip('可用范围',scope?'正式验证':'超出范围','仅三企业 2022 年')}</div>
 ${optimizationStudio()}${scenarioStudio()}${filters}<div class="grid2 equal">${selectedPanel}${comparePanel}</div>${comparePanelV3}${tablePanel}
 ${panel('下一步执行核实','方案不是财务结果的因果保证',`<div class="insight-grid"><div class="feature"><div class="n">0—30 DAYS</div><h3>参数核实</h3><p>检查回款率、库存释放率、费用压缩与真实资源约束，确定必要的财务凭证。</p></div><div class="feature"><div class="n">31—90 DAYS</div><h3>过程跟踪</h3><p>以现金支出、回款进展、费用变化和现金余量为 KPI 建立独立跟踪。</p></div><div class="feature"><div class="n">YEARLY REVIEW</div><h3>后验验证</h3><p>下一年度三表需独立登记；原模型不因新增观察自动重训。保存方案后可在 07 工作台查看。</p><button class="ghost-btn go" data-go="validation">查看验证记录 →</button></div></div>`)}`;
}
function currentReviews(){return loadLocal('reviews',[])}
function currentTasks(){return loadLocal('tasks',{})}
function signedDiff(actual,target,precision=2){if(actual===null||actual===undefined||!Number.isFinite(+actual)||target===null||target===undefined||!Number.isFinite(+target))return '—';const n=Number(actual)-Number(target);return `${n>=0?'+':''}${fmt(n,precision)}`}
const milestoneTemplates=[
 ['30','0—30 天','方案核实','确认关键行动参数和财务凭证，建立明确的内部执行责任'],
 ['90','31—90 天','过程跟踪','登记现金支出、回款与债务变化，复核是否触碰约束'],
 ['365','91—365 天','年度复盘','使用后续年度独立财报进行正式后验验证（当前体验版不支持）']
];
function planActions(p){
 const x=A.candidates.find(c=>c.company_id===p.company&&c.case===p.case&&c.decision_id===p.decision_id);
 if(!x)return msg('该计划关联的冻结候选数据不在当前版本中，无法生成行动参数。','gold');
 const specs=[['应收回款',x.receivables_collection_rate,'核验应收账款账龄、回款条件及对应凭证'],['库存释放',x.inventory_release_rate,'核验库存账面价值、实物流转和存货跌价情况'],['销售费用压缩',x.selling_expense_reduction_rate,'核验费用压缩假设与收入保持条件'],['管理费用压缩',x.admin_expense_reduction_rate,'核验费用削减的执行条件及合规性'],['短期融资 / 收入',x.short_term_debt_to_revenue,'核验授信额度、到期负债与实际融资约束'],['长期融资 / 收入',x.long_term_debt_to_revenue,'核验融资期限和现金流支撑情况']];
 const active=specs.filter(([,v])=>Number(v)>1e-10);
 return panel('原候选决策变量与核验任务','根据选定方案的冻结参数生成检查项，不代表执行建议',active.length?table(['行动参数','模拟参数值','执行前核验重点'],active.map(([label,v,note])=>[label,pct(v*100),note])):msg('当前候选为零动作基准方案，无需自动生成额外操作。')+`<div class="info">各参数为 有限网格优化 已验证搜索空间中的候选取值；不保证现实资源可用，也不构成经营承诺。</div>`);
}
function milestonePanel(p){const saved=currentTasks()[p.id]||{};return panel('行动台账 · 30 / 90 / 365 天','当前演示为计划跟踪，责任人和进展需用户自行填写',`<div class="milestones">${milestoneTemplates.map(([key,day,title,description])=>{const t=saved[key]||{};return `<div class="milestone"><div class="milestone-head"><span class="pill">${day}</span><strong>${title}</strong></div><div class="info">${description}</div><div class="filter-bar"><label>执行状态 <select class="form-select task-status" data-step="${key}"><option value="未开始" ${!t.status||t.status==='未开始'?'selected':''}>未开始</option><option value="进行中" ${t.status==='进行中'?'selected':''}>进行中</option><option value="已完成" ${t.status==='已完成'?'selected':''}>已完成</option></select></label><label>内部责任或备注（选填） <input class="input-control task-note" data-step="${key}" maxlength="120" value="${h(t.note||'')}" placeholder="可填部门、成员或工作备注"/></label></div></div>`}).join('')}</div><div class="action-row"><button class="primary-btn" id="save-tasks">保存行动进度</button></div>`)}
function evidencePanel(p){const rows=currentReviews().filter(x=>x.planId===p.id).sort((a,b)=>b.created.localeCompare(a.created));const latest=rows[0];const compared=evidenceComparison(p);const comparison=rows.length?table(['指标','冻结候选输出','最近有效观察','差异','对应日期'],compared.map(x=>[x.label,fmt(x.target,2),x.observed===null?'—':fmt(x.observed,2),x.diff===null?'—':signedDiff(x.observed,x.target,2),h(x.date)]))+msg('每个指标独立选取最近一条非空观察，可能来自不同日期。差异不是后验预测准确率，也未完成真实性审计。'):msg('尚未登记独立观察值。可先录入一条带日期和来源的跟踪记录。');
 return panel('后续观察与证据登记','不会写回冻结数据、模型或原优化结果',`<div class="filter-bar"><label>观察日期 <input class="input-control" type="date" id="review-date" value="${new Date().toISOString().slice(0,10)}"/></label><label>期末现金 / 万元 <input class="input-control" type="number" id="review-cash" min="0" step="0.01" placeholder="可留空"/></label><label>资产负债率 / % <input class="input-control" type="number" id="review-debt" min="0" max="100" step="0.01" placeholder="可留空"/></label><label>行动现金成本 / 万元 <input class="input-control" type="number" id="review-cost" min="0" step="0.01" placeholder="可留空"/></label></div><div class="filter-bar"><label>观察资料来源类型 <select class="form-select" id="review-source"><option value="demo">手工演示记录</option><option value="self_report">用户声明的财务资料（未核验）</option><option value="internal">内部工作记录（未核验）</option></select></label></div><label class="metric-label">证据说明 / 记录来源（必填）<textarea class="review-note" id="review-note" maxlength="500" rows="2" placeholder="例如：手工演示记录、内部核对结果；请勿上传真实保密财报"></textarea></label><div class="action-row"><button id="save-review" class="primary-btn">登记观察值并计算差异</button></div><div id="review-error"></div><div class="gridline"></div><h3 class="subheading">最新登记与方案差异</h3>${comparison}${rows.length?`<div class="gridline"></div>${table(['观察日期','来源说明','现金','负债率','成本','操作'],rows.slice(0,12).map(x=>[h(x.observed),h(x.note),x.cash===null?'—':money(x.cash),x.debt===null?'—':pct(x.debt),x.cost===null?'—':money(x.cost),`<button class="tiny-button delete-review" data-id="${h(x.id)}">删除</button>`]))}`:''}${msg('登记数据由用户手动输入且仅存于本机浏览器，未经来源真实性审核；后续年度正式三表验证仍待接入。')}`)
}

const REVIEW_SOURCE_LABELS={demo:'演示记录（未核验）',self_report:'用户声明财报（未核验）',internal:'内部记录说明（未核验）',legacy:'旧版记录（来源待补）'};
function validIsoDate(x){if(!/^\d{4}-\d{2}-\d{2}$/.test(x||''))return false;const d=new Date(x+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===x}
function evidenceRowsFor(p){return currentReviews().filter(x=>x.planId===p.id&&x.company===p.company).slice().sort((a,b)=>String(a.observed).localeCompare(String(b.observed))||String(a.created).localeCompare(String(b.created)));}
function evidenceComparison(p){
 const entries=evidenceRowsFor(p),specs=[['期末现金 / 万元','cash',p.ending_cash,'万元'],['资产负债率 / %','debt',p.debt*100,'%'],['行动现金成本 / 万元','cost',p.cost,'万元']];
 return specs.map(([label,key,target,unit])=>{
  const valid=entries.filter(x=>x[key]!==null&&x[key]!==undefined&&Number.isFinite(Number(x[key]))),latest=valid.at(-1),observed=latest?Number(latest[key]):null;
  return {label,key,unit,target,observed,date:latest?.observed||'—',source:latest?REVIEW_SOURCE_LABELS[latest.sourceType]||REVIEW_SOURCE_LABELS.legacy:'—',diff:observed===null?null:observed-target};
 });
}
function evidenceAuditPanel(p){
 const entries=evidenceRowsFor(p),compare=evidenceComparison(p),filled=compare.filter(x=>x.observed!==null).length;
 const diffs=compare.map(x=>[x.label,fmt(x.target,2)+(x.unit==='%'?'%':' 万元'),x.observed===null?'—':fmt(x.observed,2)+(x.unit==='%'?'%':' 万元'),x.diff===null?'—':signedDiff(x.observed,x.target,2),h(x.date),h(x.source)]);
 const dates=new Map();for(const x of entries)dates.set(x.observed,(dates.get(x.observed)||0)+1);
 const duplicates=[...dates].filter(([,n])=>n>1).length;
 const warnings=[];
 if(filled<3)warnings.push('仍有未登记的对照指标');
 if(duplicates)warnings.push(`${duplicates} 个观察日期存在多条记录，应核对是否属于不同证据`);
 if(entries.some(x=>!x.sourceType))warnings.push('包含旧版记录，未区分证据来源类型');
 return panel('观察证据审计 · 指标独立取最近有效值','可追溯日期、来源声明与差异；不自动确认真实性',
 `<div class="stat-strip compact-stats">${strip('观察记录',entries.length+' 条','本地浏览器记录')}${strip('对照指标覆盖',filled+' / 3','每项分别取最近有效值')}${strip('正式真实性核验','未执行','只完成数据整理与比较')}</div>
 ${table(['指标','模拟方案值','最近观察值','观察−方案','观察日期','来源类别'],diffs)}
 ${warnings.length?msg(warnings.map(h).join('；'),'gold'):msg('字段覆盖已完成，但用户来源声明没有经过独立审计，仍不能称为后验验证通过。')}
 ${entries.length?table(['观察日期','登记字段','来源声明','来源说明'],entries.slice(-20).reverse().map(v=>[h(v.observed),['cash','debt','cost'].filter(k=>v[k]!==null&&v[k]!==undefined).join(' / '),h(REVIEW_SOURCE_LABELS[v.sourceType]||REVIEW_SOURCE_LABELS.legacy),h(v.note)])):msg('尚无记录，请在上方登记带日期和来源的观察值。')}
 <div class="action-row"><button id="export-evidence-csv" class="ghost-btn">导出当前方案证据 CSV ↓</button></div>
 <div class="info">对照对象是 2022 年冻结财务情景的静态计算值。观察日期不一定与方案计算年度相同，因此差异可能包含时间、外部条件及口径差异；不能从差异推导预测准确率或因果效果。</div>`);
}
function evidenceCSV(p){
 const cols=['记录ID','企业','计算年度','情景','方案编号','方案来源','观察日期','来源类别','证据说明','指标','单位','模拟方案值','手工观察值','观察减模拟','审计状态'];
 const specs=[['cash','期末现金','万元',p.ending_cash],['debt','资产负债率','%',p.debt*100],['cost','行动现金成本','万元',p.cost]];
 const rows=[];
 for(const x of evidenceRowsFor(p))for(const [key,label,unit,target] of specs){if(x[key]===null||x[key]===undefined)continue;
 const actual=Number(x[key]);if(!Number.isFinite(actual))continue;
 rows.push([x.id,p.company,2022,p.case,p.decision_id,p.source||'有限网格优化 frozen candidate',x.observed,REVIEW_SOURCE_LABELS[x.sourceType]||REVIEW_SOURCE_LABELS.legacy,x.note,label,unit,Number(target).toFixed(6),actual.toFixed(6),(actual-target).toFixed(6),'未独立核验']);
 }
 // Prevent spreadsheet formula injection from user supplied text fields.
 const quote=v=>{let t=String(v??'');if(/^[\s]*[=+@-]/.test(t)&&!/^[-+]?\d+(\.\d+)?$/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"'};
 return '\ufeff'+[cols,...rows].map(r=>r.map(quote).join(',')).join('\r\n');
}

function validation(){
 let r=get(),projects=currentProjects(),plans=currentPlans(),reviews=currentReviews();
 if(ACTIVE_REVIEW&&!plans.some(p=>p.id===ACTIVE_REVIEW))ACTIVE_REVIEW=null;
 const selected=plans.find(x=>x.id===ACTIVE_REVIEW)||plans.find(x=>x.company===C)||plans[0]||null;
 const summary=panel('当前项目证据摘要','合成数据模型 安全仿真数据',table(['证据','状态'],[['当前企业',h(name()+' / '+C)],['年份',Y],['冻结综合分',fmt(r.overall_score,3)],['样本内排名',`${r.within_year_rank} / 328`],['冻结财务状态',h(r.state_id)],['2023 受限数据','未包含'],['公开发布权属','待确认 · BLOCKED']])+`<div class="action-row"><button id="export-report" class="primary-btn">导出 Markdown 摘要 ↓</button><button id="print-report" class="ghost-btn">打开可打印报告 ↗</button><button id="export-notebook" class="ghost-btn">备份完整记录 JSON ↓</button></div><div class="filter-bar"><label>恢复 JSON 备份 <input class="input-control" type="file" id="import-notebook" accept=".json,application/json"/></label></div><div class="info">导入只恢复项目、已保存方案、行动状态和人工观察记录。仅接受本工具导出的有限字段，不会执行文件中的代码。</div>`);
 const saved=panel(`已保存行动方案 (${plans.length})`,'选择一条进入验证与行动台账；不等于真实执行',plans.length?table(['时间','企业','情景','模拟评分变化','模拟成本','操作'],plans.map(p=>[new Date(p.created).toLocaleString('zh-CN'),h(p.company),h(p.case),fmt(p.score_delta,2),money(p.cost),`<button class="tiny-button review-plan" data-id="${h(p.id)}">${p.id===selected?.id?'当前方案':'跟踪此方案'}</button> <button class="tiny-button restore-plan" data-id="${h(p.id)}">回到筛选</button> <button class="tiny-button delete-plan" data-id="${h(p.id)}">删除</button>`])):msg('尚未保存方案。请进入 06 行动中心，从已验证候选中选择并保存。'));
 const project=panel(`本地项目视图 (${projects.length})`,'与访问端口有关；支持 JSON 备份恢复',renderProjects());
 window.__selectedReviewPlan=selected?.id||null;
 const selectedCard=selected?panel(`正在跟踪：${h(selected.company)} · ${h(selected.case)}`,'来自 有限网格优化 冻结候选方案；实际结果须独立验证',`<div class="stat-strip compact-stats">${strip('原方案得分',fmt(selected.overall_after,3),'冻结计算')}${strip('原方案行动成本',money(selected.cost),'万元')}${strip('原方案期末现金',money(selected.ending_cash),'万元')}${strip('已录观察',reviews.filter(x=>x.planId===selected.id).length,'条 · 手工登记')}</div><div class="info">原始方案 ${h(selected.decision_id)}。本版只进行人工记录与数值对比，不能自动验证执行效果。</div>`)+(selected.optimization_context?panel('本次现场网格搜索信息','本地计算记录 · 保存不代表实际执行',table(['搜索参数','记录值'],[['搜索引擎',h(selected.source)],['搜索配置',h(selected.optimization_context.config_id)],['搜索目标',h(selected.optimization_context.objective)],['已评估候选',fmt(selected.optimization_context.evaluated,0)],['原约束通过',fmt(selected.optimization_context.engine_feasible,0)],['用户条件通过',fmt(selected.optimization_context.eligible,0)]])): '')+planActions(selected)+milestonePanel(selected)+evidencePanel(selected)+evidenceAuditPanel(selected):panel('开始验证与复盘','需要先保存方案',msg('在 06 行动中心保存一个方案，才可以建立独立的行动台账与后续观察记录。'));
 const loop=panel('独立验证与发布边界','当前版本范围',`<div class="trace-line"><div class="trace-num">01</div><div class="trace-text">冻结数据／模型及原始候选台账保持不变；新观察值只在浏览器记录</div></div><div class="trace-line"><div class="trace-num">02</div><div class="trace-text">方案数字是 2022 三家虚构企业在假设约束下的计算结果，不是企业未来业绩保证</div></div><div class="trace-line"><div class="trace-num">03</div><div class="trace-text">观察证据暂为用户自行登记，没有三表后验校验与真实性认证</div></div>${msg('内部产品体验版，视觉、源码和品牌公开授权尚未通过。禁止作为对外可公开发布的财务判断依据。','gold')}`);
 return `<div class="grid2 equal">${summary}${project}</div>${scenarioHistoryPanel()}${saved}${selectedCard}${loop}`;
}
function renderProjects(){let items=currentProjects();return items.length?table(['项目','企业 / 年份','保存时间','操作'],items.map(p=>[h(p.title),`${h(p.company)} · ${p.year}`,new Date(p.created).toLocaleString('zh-CN'),`<button class="tiny-button restore-project" data-id="${p.id}">打开</button> <button class="tiny-button delete-project" data-id="${p.id}">删除</button>`])):msg('还没有保存的项目视图。选择企业和年度后，可以在 01 企业接入页面保存。')}
async function importNotebook(event){const file=event.target.files?.[0];if(!file)return;if(file.size>1024*1024){FLASH='备份超过 1 MB，请检查文件来源。';render();return}try{const obj=JSON.parse(await file.text());if(!['qicai-preview-v0.2','qicai-preview-v0.3','qicai-preview-v0.4','qicai-preview-v0.5','qicai-preview-v0.6','qicai-preview-v0.7'].includes(obj.version))throw new Error('版本不是本工具可识别的备份');if(!Array.isArray(obj.projects)||!Array.isArray(obj.plans))throw new Error('缺少项目或方案数组');const safeText=(s,n=500)=>String(s??'').slice(0,n);const projects=obj.projects.slice(0,40).filter(p=>typeof p==='object'&&p&&D.companies.some(c=>c.id===p.company)&&[2020,2021,2022].includes(Number(p.year))).map(p=>({id:safeText(p.id,80),title:safeText(p.title,80),company:p.company,year:Number(p.year),peer:D.companies.some(c=>c.id===p.peer)?p.peer:p.company,case:['conservative','neutral','optimistic'].includes(p.case)?p.case:'neutral',created:safeText(p.created,40),kind:'browser_snapshot'}));const plans=obj.plans.slice(0,40).filter(p=>typeof p==='object'&&p&&D.meta.optimizable.includes(p.company)&&Number(p.year)===2022&&A.candidates.some(c=>c.decision_id===p.decision_id&&c.company_id===p.company&&c.case===p.case)).map(p=>{const raw=A.candidates.find(c=>c.decision_id===p.decision_id&&c.company_id===p.company&&c.case===p.case);return {...p,id:safeText(p.id,80),decision_id:raw.decision_id,company:raw.company_id,case:raw.case,year:2022,score_delta:raw.score_delta,overall_after:raw.overall_after,cost:raw.total_action_cost,debt:raw.debt_to_assets,ending_cash:raw.ending_cash,created:safeText(p.created,40),source:'有限网格优化 frozen candidate ledger'}});const allowed=new Set(plans.map(p=>p.id));const reviews=(Array.isArray(obj.reviews)?obj.reviews:[]).slice(0,200).filter(x=>x&&allowed.has(x.planId)&&typeof x.note==='string'&&typeof x.observed==='string').map(x=>({id:safeText(x.id,80),planId:safeText(x.planId,80),company:safeText(x.company,32),observed:safeText(x.observed,10),note:safeText(x.note,500),sourceType:['demo','self_report','internal'].includes(x.sourceType)?x.sourceType:'legacy',cash:x.cash===null||x.cash===undefined?null:Number(x.cash),debt:x.debt===null||x.debt===undefined?null:Number(x.debt),cost:x.cost===null||x.cost===undefined?null:Number(x.cost),created:safeText(x.created,40)})).filter(x=>[x.cash,x.debt,x.cost].every(v=>v===null||(Number.isFinite(v)&&v>=0))&&(x.debt===null||x.debt<=100));const tasks={};for(const [id,entries] of Object.entries(obj.tasks||{})){if(!allowed.has(id)||typeof entries!=='object'||!entries)continue;tasks[id]={};for(const [key] of milestoneTemplates){const item=entries[key]||{};tasks[id][key]={status:['未开始','进行中','已完成'].includes(item.status)?item.status:'未开始',note:safeText(item.note,120)}}}if(!confirm(`将导入 ${projects.length} 个项目、${plans.length} 个方案和 ${reviews.length} 条观察记录，并覆盖当前浏览器中的旧记录。确定继续吗？`))return;saveLocal('projects',projects);saveLocal('plans',plans);saveLocal('reviews',reviews);saveLocal('tasks',tasks);
 const scenarios=(Array.isArray(obj.scenarios)?obj.scenarios:[]).slice(0,40).filter(v=>v&&D.meta.optimizable.includes(v.company)&&Number(v.year)===2022&&typeof v.plan==='object'&&v.plan).map(v=>{
   const plan=Object.fromEntries(ACTION_FIELDS.map(([k])=>[k,Number(v.plan[k])||0]));
   return {id:safeText(v.id,80),company:v.company,year:2022,created:safeText(v.created,40),model:'静态情景计算 imported scenario',verified:'imported_unverified',plan,baseline_score:Number(v.baseline_score)||0,scenario_score:Number(v.scenario_score)||0,score_delta:Number(v.score_delta)||0,net_income_delta:Number(v.net_income_delta)||0,action_cost:Number(v.action_cost)||0,ending_cash:Number(v.ending_cash)||0,debt_to_assets:Number(v.debt_to_assets)||0,check_pass_count:0};
 }).filter(v=>Object.values(v.plan).every(n=>Number.isFinite(n)&&n>=0)&&ACTION_FIELDS.every(([k,, ,max,type])=>type==='amount'||v.plan[k]<=max/100));
 saveLocal('scenarios',scenarios);
 ACTIVE_REVIEW=null;FLASH='备份已恢复；所有冻结方案数字均从当前候选台账重新核对。';render()}catch(e){FLASH='导入失败：'+e.message;render()}}
function saveCandidate(){const x=window.__activeCandidate;if(!x)return;const v={id:'a'+Date.now(),decision_id:x.decision_id,company:x.company_id,year:2022,case:x.case,score_delta:x.score_delta,overall_after:x.overall_after,cost:x.total_action_cost,debt:x.debt_to_assets,ending_cash:x.ending_cash,cash_headroom:x.cash_headroom,receivables_collection_rate:x.receivables_collection_rate,inventory_release_rate:x.inventory_release_rate,selling_expense_reduction_rate:x.selling_expense_reduction_rate,admin_expense_reduction_rate:x.admin_expense_reduction_rate,short_term_debt_to_revenue:x.short_term_debt_to_revenue,long_term_debt_to_revenue:x.long_term_debt_to_revenue,created:new Date().toISOString(),source:'有限网格优化 frozen candidate ledger',schema:3};const arr=currentPlans();arr.unshift(v);if(saveLocal('plans',arr.slice(0,40))){toast('已保存模拟候选方案记录。');render()}}
function printReport(){const r=get();const rows=dims.map(([k,n])=>`<tr><td>${n}</td><td>${fmt(r[k],2)}</td></tr>`).join('');const text=`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>企财智策 · ${h(C)} ${Y} 内部报告</title><style>body{font-family:'Microsoft YaHei',Arial,sans-serif;max-width:850px;margin:55px auto;color:#1a2936;line-height:1.8;padding:0 35px}h1{font-size:28px}h2{font-size:18px;border-bottom:2px solid #294456;padding-bottom:9px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #d6e0e6;padding:9px}td:last-child{text-align:right}.note{background:#f1f5f8;padding:15px;font-size:13px}@media print{button{display:none}}</style><h1>企财智策 · 财务诊断摘要</h1><p>虚构企业：${h(name())}（${h(C)}） · ${Y} 年</p><h2>冻结评价</h2><p>得分 <strong>${fmt(r.overall_score,3)}</strong> / 100；合成样本排名 ${r.within_year_rank} / 328；财务状态 ${h(r.state_id)} ${h(r.state_name)}</p><h2>六维评分</h2><table>${rows}</table><h2>财务原始金额（万元）</h2><table><tr><td>营业收入</td><td>${money(r.revenue)}</td></tr><tr><td>净利润</td><td>${money(r.net_income)}</td></tr><tr><td>资产合计</td><td>${money(r.total_assets)}</td></tr><tr><td>负债合计</td><td>${money(r.total_liabilities)}</td></tr><tr><td>经营现金流</td><td>${money(r.net_cash_from_operating_activities)}</td></tr></table><h2>证据范围与限制</h2><div class="note">来自独立合成2019—2022安全三表和2020—2022冻结评分。不是实际医药企业或行业分布，不能据此做投资决策。复杂迁移预测未通过验证；可用优化范围仅三家2022。此 HTML 可在浏览器中“打印 → 保存为 PDF”；不等于正式证据审核报告。</div><p><button onclick="print()">打印 / 保存为 PDF</button></p></html>`;const blob=new Blob([text],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),20000)}
function exportReport(){let r=get();let content=`# 企财智策 · 合成数据演示分析摘要\n\n> 仿真企业财务分析；不代表真实医药企业或投资建议。\n\n- 企业：${r.company}（${C}）\n- 分析年度：${Y}\n- 综合评分：${fmt(r.overall_score,4)}\n- 328家样本内排名：${r.within_year_rank}\n- 财务状态：${r.state_name}\n- 三表单位：万元\n\n## 六维得分\n${dims.map(([k,n])=>`- ${n}：${fmt(r[k],2)}`).join('\n')}\n\n## 数值来源与边界\n来自本项目的合成2019—2022年财务三表及2020—2022年固定参数评价模型；不输出个体未来预测，情景试算与优化仅支持三家虚构企业的2022年案例。\n`;
 const saved=currentPlans().filter(x=>x.company===C);const observations=currentReviews().filter(x=>saved.some(p=>p.id===x.planId));
 if(saved.length)content+='\n## 已保存候选方案（模型冻结数据）\n'+saved.map(p=>`- ${p.case} / ${p.decision_id} · 方案评分 ${fmt(p.overall_after,3)} · 行动成本 ${money(p.cost)} 万元`).join('\n')+'\n';
 if(observations.length)content+='\n## 人工登记观察（未独立验证）\n'+observations.map(v=>`- ${v.observed} · ${v.note.replace(/[\r\n]+/g,' ')} · 现金 ${v.cash===null?'未填':money(v.cash)} 万元；负债率 ${v.debt===null?'未填':pct(v.debt)}；成本 ${v.cost===null?'未填':money(v.cost)} 万元`).join('\n')+'\n';
 const live=currentScenarios().filter(v=>v.company===C);
 if(live.length)content+='\\n## 静态情景计算 现场情景记录（不是已实现经营结果）\\n'+live.map(v=>`- ${v.created} / 分数变化 ${fmt(v.score_delta,3)} / 期末现金 ${money(v.ending_cash)} 万元 / 来源状态 ${v.verified==='runtime_17_checks'?'本机17项勾稽通过':'外部导入、需要重新核验'}`).join('\\n')+'\\n';
 const rules=riskEvidenceFor(r,get(C,Y-1));content+='\n## 财务观察规则（未校准，非违约预测）\n'+rules.map(x=>`- ${x.title}：${x.hit===null?'口径不足':x.hit?'触发':'未触发'}；阈值 ${x.threshold}；取数 ${x.source}`).join('\n')+'\n';
 content+='\n> 注：观察值由用户自行输入，没有执行真实财报审计或后验模型验证。\n';
 const blob=new Blob([content],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`企财智策_${C}_${Y}_内部演示摘要.md`;a.click();URL.revokeObjectURL(url);
}
const screens={journey:()=>window.QZFlow.view(flowContext()),overview,ingest,governance,position,attribution,forecast,action,validation,research:renderResearchLab,reportstudio:renderReportStudio,user:()=>window.QZUser.render(),sec:()=>window.QZSEC.render(),cn:()=>window.QZCN.render()};
function bindActions(){
 document.querySelectorAll('.opt-input').forEach(el=>el.addEventListener('change',e=>{
    OPT_INPUT[e.target.dataset.name]=e.target.value;
    OPT_RESULT=null;OPT_SELECTED=null;OPT_INFO='条件已改变，请运行现场优化以获得新计算结果。';
 }));
 $('#run-live-optimization')?.addEventListener('click',runLiveOptimization);
 $('#reset-live-optimization')?.addEventListener('click',()=>{
   OPT_INPUT={objective:'score',minimum_score_delta:'1',maximum_action_cost:'2000',maximum_debt_ratio:'',minimum_cash_headroom:''};
   OPT_RESULT=null;OPT_SELECTED=null;OPT_INFO='优化条件已恢复示例默认值。';render();
 });
 document.querySelectorAll('.pick-live-optimization').forEach(el=>el.addEventListener('click',()=>{OPT_SELECTED=el.dataset.id;render()}));
 $('#save-live-optimization')?.addEventListener('click',saveLiveOptimization);
 $('#export-live-optimization')?.addEventListener('click',()=>{
    if(OPT_RESULT&&OPT_CONTEXT===optCtx())downloadText(`企财智策_${C}_${CASE}_有限网格优化_现场搜索.json`,JSON.stringify(OPT_RESULT,null,2),'application/json;charset=utf-8');
 });
 document.querySelectorAll('.scenario-input').forEach(el=>el.addEventListener('change',e=>{
    const k=e.target.dataset.field,meta=ACTION_FIELDS.find(z=>z[0]===k);
    if(!meta)return;const v=e.target.value===''?0:Number(e.target.value);
    SCENARIO_PLAN[k]=meta[4]==='rate'?v/100:v;
    SCENARIO_RES=null;SCENARIO_INFO='参数已修改。点击正式计算以获取新结果。';
 }));
 $('#run-live-scenario')?.addEventListener('click',runLiveScenario);
 $('#quick-scenario')?.addEventListener('click',qczQuickPreview);
 $('#scenario-reset')?.addEventListener('click',()=>{
    SCENARIO_PLAN=Object.fromEntries(ACTION_FIELDS.map(([k])=>[k,0]));
    SCENARIO_RES=null;SCENARIO_INFO='已重置所有动作参数。';render();
 });
 $('#save-live-scenario')?.addEventListener('click',saveLiveScenario);
 $('#export-live-scenario')?.addEventListener('click',()=>{
    const r=SCENARIO_RES;if(!r||r.quick)return;
    downloadText(`企财智策_${C}_静态情景计算_现场试算.json`,JSON.stringify(r,null,2),'application/json;charset=utf-8')
 });
 document.querySelectorAll('.scenario-delete').forEach(el=>el.addEventListener('click',()=>{
    if(!confirm('确定删除该条现场试算记录？'))return;
    saveLocal('scenarios',currentScenarios().filter(v=>v.id!==el.dataset.id));render()
 }));
 document.querySelectorAll('.scenario-restore').forEach(el=>el.addEventListener('click',()=>{
    const x=currentScenarios().find(v=>v.id===el.dataset.id);if(!x)return;
    C=x.company;Y=2022;
    SCENARIO_PLAN=Object.fromEntries(ACTION_FIELDS.map(([k])=>[k,Number(x.plan?.[k])||0]));
    SCENARIO_RES=null;SCENARIO_INFO='已载入上次参数，请点击“运行 静态情景计算 正式情景计算”重新核验。';nav('action')
 }));
 document.querySelectorAll('.go').forEach(el=>el.addEventListener('click',()=>nav(el.dataset.go)));
 $('#export-report')?.addEventListener('click',exportReport);$('#print-report')?.addEventListener('click',printReport);$('#export-notebook')?.addEventListener('click',()=>downloadText('企财智策_v0.7_完整记录备份.json',JSON.stringify({version:'qicai-preview-v0.7',exported:new Date().toISOString(),projects:currentProjects(),plans:currentPlans(),reviews:currentReviews(),tasks:currentTasks(),scenarios:currentScenarios()},null,2),'application/json;charset=utf-8'));
 $('#peer-select')?.addEventListener('change',e=>{PEER=e.target.value;render()});
 $('#switch-peer')?.addEventListener('click',()=>{[C,PEER]=[PEER,C];$('#company-select').value=C;render()});
 $('#metric-select')?.addEventListener('change',e=>{METRIC=e.target.value;render()});
 if(R==='position'||R==='attribution')diagBindEvents();
 $('#action-company')?.addEventListener('change',e=>{C=e.target.value;Y=2022;FILTER={cost:'',debt:'',score:''};SEL=null;COMPARE=[];render()});
 $('#action-case')?.addEventListener('change',e=>{CASE=e.target.value;FILTER={cost:'',debt:'',score:''};SEL=null;COMPARE=[];render()});
 $('#obj-select')?.addEventListener('change',e=>{OBJ=e.target.value;SEL=null;render()});
 [['cost','filter-cost'],['debt','filter-debt'],['score','filter-score']].forEach(([k,id])=>$('#'+id)?.addEventListener('change',e=>{FILTER[k]=e.target.value;SEL=null;render()}));
 $('#reset-filters')?.addEventListener('click',()=>{FILTER={cost:'',debt:'',score:''};SEL=null;render()});
 $('.choose-candidate')&&document.querySelectorAll('.choose-candidate').forEach(el=>el.addEventListener('click',()=>{SEL=el.dataset.id;render()}));
 document.querySelectorAll('.add-comparison').forEach(el=>el.addEventListener('click',()=>{const id=el.dataset.id;if(COMPARE.includes(id)){toast('该方案已经在对照清单中。');render();return}if(COMPARE.length>=3){toast('最多对照三个方案。请先移除一个。');render();return}COMPARE.push(id);render()}));
 document.querySelectorAll('.remove-comparison').forEach(el=>el.addEventListener('click',()=>{COMPARE=COMPARE.filter(id=>id!==el.dataset.id);render()}));
 $('#save-candidate')?.addEventListener('click',saveCandidate);
 $('#download-candidate')?.addEventListener('click',()=>{const x=window.__activeCandidate;if(!x)return;const keys=Object.keys(x);const csv=[keys.join(','),keys.map(k=>`"${String(x[k]??'').replaceAll('"','""')}"`).join(',')].join('\r\n');downloadText(`企财智策_${x.company_id}_${x.case}_已验证候选.csv`, '\ufeff'+csv,'text/csv;charset=utf-8')});
 $('#save-project')?.addEventListener('click',saveProject);
 document.querySelectorAll('.review-plan').forEach(el=>el.addEventListener('click',()=>{ACTIVE_REVIEW=el.dataset.id;render()}));
 $('#save-tasks')?.addEventListener('click',()=>{const p=currentPlans().find(x=>x.id===(ACTIVE_REVIEW||window.__selectedReviewPlan));if(!p)return;const all=currentTasks();const stages={};for(const [key] of milestoneTemplates){const status=document.querySelector(`.task-status[data-step="${key}"]`)?.value||'未开始',note=document.querySelector(`.task-note[data-step="${key}"]`)?.value?.trim().slice(0,120)||'';stages[key]={status,note}}all[p.id]=stages;if(saveLocal('tasks',all)){toast('行动台账已保存；不代表实际工作已经完成。');render()}});
 $('#export-evidence-csv')?.addEventListener('click',()=>{const p=currentPlans().find(x=>x.id===(ACTIVE_REVIEW||window.__selectedReviewPlan));if(p)downloadText(`企财智策_${p.company}_${p.case}_证据审计_v0.6.csv`,evidenceCSV(p),'text/csv;charset=utf-8')});
 $('#save-review')?.addEventListener('click',()=>{const p=currentPlans().find(x=>x.id===(ACTIVE_REVIEW||window.__selectedReviewPlan));if(!p)return;const note=($('#review-note')?.value||'').trim(),observed=$('#review-date')?.value||'';const vals=['cash','debt','cost'].map(k=>$('#review-'+k)?.value.trim()??'');const e=$('#review-error');if(note.length<4||!validIsoDate(observed)||!vals.some(x=>x!=='')){e.textContent='请填写有效日期、至少一项观察值和不少于四个字的证据来源说明。';return}const numbers=vals.map(v=>v===''?null:Number(v));if(numbers.some(v=>v!==null&&(!Number.isFinite(v)||v<0))||(numbers[1]!==null&&numbers[1]>100)){e.textContent='观察值必须为非负数，资产负债率不得超过 100%。';return}const entries=currentReviews();entries.unshift({id:'r'+Date.now(),planId:p.id,company:p.company,observed,sourceType:($('#review-source')?.value||'demo'),note:note.slice(0,500),cash:numbers[0],debt:numbers[1],cost:numbers[2],created:new Date().toISOString()});if(saveLocal('reviews',entries.slice(0,200))){ACTIVE_REVIEW=p.id;toast('独立观察已登记，可查看与原方案的数值差异。');render()}});
 document.querySelectorAll('.delete-review').forEach(el=>el.addEventListener('click',()=>{if(!confirm('确定删除这条人工观察记录？'))return;saveLocal('reviews',currentReviews().filter(x=>x.id!==el.dataset.id));render()}));
 $('#import-notebook')?.addEventListener('change',importNotebook);
 document.querySelectorAll('.restore-project').forEach(el=>el.addEventListener('click',()=>{const p=currentProjects().find(x=>x.id===el.dataset.id);if(!p)return;C=p.company;Y=p.year;PEER=p.peer;CASE=p.case;nav('overview')}));
 document.querySelectorAll('.delete-project').forEach(el=>el.addEventListener('click',()=>{saveLocal('projects',currentProjects().filter(x=>x.id!==el.dataset.id));render()}));
 document.querySelectorAll('.delete-plan').forEach(el=>el.addEventListener('click',()=>{if(!confirm('确认删除该方案？关联的人工观察记录也会被删除。'))return;const id=el.dataset.id;saveLocal('plans',currentPlans().filter(x=>x.id!==id));saveLocal('reviews',currentReviews().filter(x=>x.planId!==id));const tasks=currentTasks();delete tasks[id];saveLocal('tasks',tasks);if(ACTIVE_REVIEW===id)ACTIVE_REVIEW=null;render()}));
 document.querySelectorAll('.restore-plan').forEach(el=>el.addEventListener('click',()=>{const p=currentPlans().find(x=>x.id===el.dataset.id);if(!p)return;C=p.company;Y=2022;CASE=p.case;FILTER={cost:'',debt:'',score:''};SEL=p.decision_id;COMPARE=[];nav('action')}));
 if(R==='research')bindResearchEvents();if(R==='reportstudio')bindReportStudio();if(R==='ingest')window.QZUser.bindEntry();if(R==='user')window.QZUser.bindUser();if(R==='sec')window.QZSEC.bind();if(R==='cn')window.QZCN.bind();if(R==='journey')window.QZFlow.bind(flowContext());window.QZFlow.bindRibbon({nav,render,route:R});

}

function flowContext(){return {D,C,Y,CASE,route:R,get,plans:currentPlans(),user:window.QZUser,riskEvidenceFor,render,nav,exportReport,setCompany:(v)=>{if(D.companies.some(x=>x.id===v))C=v},setYear:(y)=>{if([2020,2021,2022].includes(y))Y=y}}}
function render(){R=getPath();if(!screens[R]){R='overview';history.replaceState(null,'','/workspace/overview')};if(!get(C,Y)) C='VPM-101'; const [key,title,desc]=topTitle();$('#current-nav').textContent=title;$('#screen-title').textContent=title;$('#screen-description').textContent=desc;$('#company-select').value=C;$('#year-select').value=Y;document.querySelector('.toolbar .filters').style.display=['user','ingest','cn','sec','journey'].includes(R)?'none':'';document.querySelector('.header-pill').textContent=R==='journey'?'CHOOSE YOUR START':R==='cn'?'CN · DISCLOSURE EVIDENCE':R==='sec'?'SEC · SOURCE-BOUND XBRL':R==='user'?'USER DATA · PRIVATE SESSION':R==='ingest'?'DATA ONBOARDING · LOCAL':'328 SYNTHETIC ENTITIES';document.querySelector('#report-shortcut').style.display=['user','ingest','cn','sec','journey'].includes(R)?'none':'';document.querySelector('footer').textContent=R==='journey'?'企财智策 / 选择起点 · 用户上传与安全合成数据独立隔离 · 不自动认证数据来源':R==='cn'?'企财智策 / A股披露核验 · 在线PDF字节一致性不等于官方公告主体或最新版本认证':R==='sec'?'企财智策 / SEC 官方结构化 XBRL 研究 · 所有金额 USD · 非审计意见':R==='user'?'企财智策 / 用户数据分析 · 来源未经审计 · 未调用合成评分、预测和优化':R==='ingest'?'企财智策 / 上传用户报表 · 单位与字段映射需核实 · 不调用合成评分、预测和优化':'企财智策 / 本地单用户体验 · 安全合成数据 · 不作为真实财务决策依据';document.querySelector('.content-stamp').innerHTML=R==='journey'?'<span>选择一个适合你的开始方式</span><span>无需先熟悉所有专业模块</span>':R==='cn'?'<span>A股公告原件 · 严格白名单PDF远端哈希对照</span><span>版本差异 · 更正指标依赖 · 逐字段本地对账</span>':R==='sec'?'<span>美国 SEC 官方接口或用户离线 JSON</span><span>单一申报版本 + USD；非审计认证</span>':R==='user'?'<span>用户自主上传 · 会话内存计算 · 单位已统一</span><span>不调用合成数据模型、不提供真实行业排名</span>':R==='ingest'?'<span>用户材料 · 核对三表字段和单位后方可分析</span><span>与合成企业的数据和模型完全隔离</span>':'<span>实验性质 · 2019—2022 安全仿真财报</span><span>冻结评价 2020—2022 · 不代表真实行业</span>';$('#navigation').querySelectorAll('.nav-link').forEach(n=>n.classList.toggle('active',n.dataset.page===R));window.QZFlow.openCurrent(R);try{$('#screen').innerHTML=(R==='journey'?'':window.QZFlow.ribbon(flowContext()))+(FLASH?`<div id="notice-banner" class="notice-banner">${h(FLASH)}</div>`:'')+screens[R]();FLASH='';bindActions()}catch(err){console.error('工作台渲染错误：',err);$('#screen').innerHTML=msg('当前工作台遇到渲染错误：'+h(err.message)+'。请切换左侧其他页面，或关闭体验版重新启动。','gold')}}
async function start(){try{const r=await fetch('/data/preview.json',{cache:'no-store'});if(!r.ok)throw new Error('数据文件返回 HTTP '+r.status);D=await r.json();try{const ar=await fetch('/data/action_candidates.json',{cache:'no-store'});if(!ar.ok)throw new Error(ar.status);A=await ar.json()}catch(e){console.warn('方案台账不可用：'+e.message);A={meta:{},candidates:[]}};if(location.search.includes('mode=demo'))C='VPM-101';R=getPath();window.QZFlow.init(location.search);
 $('#navigation').innerHTML=window.QZFlow.navHTML();
 document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();nav(a.dataset.page)}));
 $('#company-select').innerHTML=D.companies.map(c=>`<option value="${c.id}">${h(c.id+' · '+c.name)}</option>`).join('');
 $('#company-select').addEventListener('change',e=>{C=e.target.value;render()});$('#year-select').addEventListener('change',e=>{Y=Number(e.target.value);render()});$('#report-shortcut').addEventListener('click',exportReport);
 window.addEventListener('popstate',render);$('#loading').hidden=true;$('#app').hidden=false;render();
 }catch(err){$('#loading').innerHTML=`<div style="max-width:600px;text-align:center;line-height:2">无法读取体验数据：${h(err.message)}<br/><small>请使用压缩包内的「启动体验版.bat」运行本地服务器，不能直接双击打开 HTML。</small></div>`}}
start();
