/* Qicaizhice v2.1 — contextual first-run coaching, never a mandatory wizard.
   No financial calculation, input data or frozen model is changed by this module. */
(function(global){'use strict';
const KEY='qicai_v21_coach';
const GROUPS=[
 ['查看分析依据',[['overview','企业总览'],['governance','三表数据治理'],['position','财务指标与同行'],['attribution','年度变化归因'],['forecast','风险证据']]],
 ['经营决策与跟踪',[['action','经营方案与优化'],['validation','行动跟踪与验证']]],
 ['研究与数据核验',[['ingest','导入我的三张报表'],['user','用户财务诊断'],['cn','A股公告与更正'],['sec','SEC结构化披露'],['research','科研图谱'],['reportstudio','科研报告编排']]]
];
const DEMO_CHAIN={
 overview:{eyebrow:'先看整体，而不是先研究所有指标',title:'这家企业处在什么位置？',note:'先看综合评分、样本内位置、现金流及六维画像。这些数字都来自安全合成数据，不代表真实企业评级。',next:'position',action:'看懂评分依据'},
 position:{eyebrow:'从综合分深入到可以核对的财务事实',title:'哪些指标决定了这个位置？',note:'把企业指标放在同一合成样本中比较，点击公式与原始取数。同行差异并不意味着因果关系。',next:'attribution',action:'看看年度发生了什么变化'},
 attribution:{eyebrow:'识别变化，而不是只看结果',title:'哪些报表项目发生了变化？',note:'查看利润、资产和现金流变化桥。会计恒等式能对账，但不能单独证明经营改善的原因。',next:'forecast',action:'了解风险证据'},
 forecast:{eyebrow:'判断需要重点注意的财务信号',title:'有什么值得进一步核查？',note:'逐项查看风险规则、阈值和跨年回放。它们是透明的观察信号，不是未来违约概率。',next:'action',action:'试一试模拟经营方案'},
 action:{eyebrow:'把理解转化为可检验的经营假设',title:'不同目标下，会有哪些取舍？',note:'VPM-101 / 2022 属于当前支持情景试算与网格优化的虚构案例。可设置成本、得分和现金约束，现场重新运行有限网格搜索。',next:'validation',action:'保存方案并查看如何验证'},
 validation:{eyebrow:'从提出方案到记录后续证据',title:'如何知道方案后来是否有效？',note:'保存方案、记录观察值，并检查差异。人工观察不能冒充已完成的后验验证。',next:'research',action:'进一步探索科研图谱'},
 research:{eyebrow:'已了解主要分析方法',title:'现在可以按研究问题自由探索',note:'研究图谱、稳健性与报告编排已开放。你可以继续探索，也可以退出引导。',next:null,action:''}
};
let state={source:'none',guided:false,seen:[]};
try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');if(v&&['none','demo','upload'].includes(v.source))state={source:v.source,guided:!!v.guided,seen:Array.isArray(v.seen)?v.seen.filter(x=>typeof x==='string').slice(0,50):[]};}catch(_){}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify(state))}catch(_){}}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function navHTML(){return `<a class="nav-link flow-home" data-page="journey" href="/workspace/journey"><span>◆</span><b>我的分析</b></a><div class="flow-side-note">先了解一个案例，再按需要深入</div><div class="flow-side-divider">按需探索 · 所有功能均保留</div>`+GROUPS.map(([name,arr])=>`<details class="flow-tool-group" data-group="${arr.map(x=>x[0]).join(',')}"><summary>${esc(name)}<span>${arr.length}项</span></summary><div class="flow-tool-items">${arr.map(([route,label])=>`<a class="nav-link" href="/workspace/${route}" data-page="${route}"><span>·</span>${esc(label)}</a>`).join('')}</div></details>`).join('');}
function openCurrent(route){document.querySelectorAll('.flow-tool-group').forEach(el=>{if((el.dataset.group||'').split(',').includes(route))el.open=true});}
function setSource(source){if(!['none','demo','upload'].includes(source))return;state={source,guided:source!=='none',seen:[]};save();}
function step(){return state.source==='upload'&&state.seen.includes('ingest')?1:0;}
function setStep(_n){} // compatibility: stages are no longer user-facing or enforced.
function source(){return state.source;}
function init(_query){/* entry selection always belongs to the user, even if legacy links have query params */}
function goWelcome(ctx){ctx.nav('journey');}
function view(ctx){
 const P=ctx.user?.getProject?.();const summary=ctx.get('VPM-101',2022),score=Number.isFinite(Number(summary?.overall_score))?Number(summary.overall_score).toFixed(2):'—';
 const mode=state.source==='demo'?'已选择示范体验':state.source==='upload'?'已选择我的报表':'选择一个开始方式';
 return `<div class="onboard-wrap"><div class="onboard-heading"><div class="eyebrow">QICAI / EXPLORE YOUR OWN WAY</div><h2>先熟悉一个案例，还是直接分析自己的企业？</h2><p>你不需要先学会所有功能。选择一种开始方式，系统会在分析结果旁告诉你下一步能看什么。熟悉以后，可以随时自行探索。</p></div><div class="onboard-options">
 <button type="button" class="onboard-option" data-coach-choice="demo"><span class="onboard-meta">推荐初次体验 · 安全合成案例</span><strong>先用示范企业了解系统</strong><p>从 <b>VPM-101 · 2022 年</b> 开始。先看到诊断结果，随后理解评分、变化、风险和经营方案。</p><div class="onboard-facts"><span>冻结综合分 <b>${score}</b></span><span>已验证情景与优化</span></div><small>这是功能覆盖较全的教学案例，不代表真实企业，也不是统计意义上的行业典型。</small><span class="onboard-option-action">打开示范企业总览 →</span></button>
 <button type="button" class="onboard-option" data-coach-choice="upload"><span class="onboard-meta">已有财务报表 · 自己的材料</span><strong>直接开始我的财务分析</strong><p>上传三份 CSV 或一个三工作表 XLSX。系统先协助核对单位、字段和三表关系，再基于可用数据计算。</p><div class="onboard-facts"><span>保留来源证据</span><span>不套用仿真模型</span></div><small>即使尚无原始 PDF，也可以从财务数据的基础质量检查开始。</small><span class="onboard-option-action">前往导入我的报表 →</span></button>
 </div><div class="onboard-foot"><span>${esc(mode)} · 完整工作台可通过左侧导航展开</span><button type="button" class="ghost-btn" id="coach-explore">我已经熟悉，直接自由探索 ↗</button></div>${P?`<div class="onboard-resume"><span>当前会话中已有用户报表：<b>${esc(P.name||'未命名企业')}</b></span><button type="button" class="ghost-btn" id="coach-resume">继续我的报表分析 →</button></div>`:''}</div>`;
}
function userRibbon(ctx,route){const P=ctx.user?.getProject?.();if(route==='ingest')return {eyebrow:'从自己的财务报表开始',title:'先把三表对应正确',note:'确认年度、金额单位和字段映射，再执行会计检查；缺失值不会被自动当作 0。',next:null,action:'',secondary:'数据解析在本地执行'};
 if(route==='user'){
  if(!P)return {eyebrow:'等待你的数据',title:'先导入三表',note:'需要至少能够映射三个财务报表的数据，才能开始准确的指标解释。',next:'ingest',action:'上传财务报表'};
  const analysis=ctx.user?.getInsights?.();const item=analysis?.issues?.[0];
  return analysis?.gate?.blocked?{eyebrow:'先处理证据冲突',title:'数据尚不满足诊断准入条件',note:analysis.gate.reason+'。先查看本页的校验和来源台账；此时不会推荐优化或风险结论。',next:null,action:''}:
   {eyebrow:'从你的实际数据开始',title:item?item.title:'先了解可用的财务事实',note:item?item.description+' 点击本页的观察卡，展开原始字段、计算公式和导出证据。':'本期字段有限，可以从已计算的指标开始；没有依据的变化不会强行解释。',next:null,action:''};
 }
 if(route==='cn')return {eyebrow:'补充披露证据',title:'核对公告原件和更正版本',note:'公告网址、文件哈希和财务数值匹配是不同层次；未经联网验证的来源不会自动认证。',next:'user',action:'回到财务指标与报告'};
 return null;}
function ribbon(ctx){if(!state.guided||state.source==='none')return '';
 const route=ctx.route||'';if(route==='user'&&ctx.user?.hasProject?.())return ''; // v2.2: issue cards replace duplicate user guidance
 let c=state.source==='demo'?DEMO_CHAIN[route]:userRibbon(ctx,route);
 if(!c)return '';
 const canOptimize=ctx.Y===2022&&ctx.D.meta.optimizable.includes(ctx.C);
 if(state.source==='demo'&&route==='action'&&!canOptimize)c={...c,title:'当前企业没有通过正式优化验证',note:'可以继续查看基础诊断，但不能为该企业借用其他合成企业的优化结果。',next:'overview',action:'返回企业诊断'};
 const next=(c.next&&c.action)?`<button type="button" class="primary-btn" data-coach-next="${c.next}">${esc(c.action)} →</button>`:'';
 return `<section class="coach-ribbon" aria-label="当前页面的使用建议"><div class="coach-copy"><span class="coach-eyebrow">${esc(c.eyebrow)}</span><strong>${esc(c.title)}</strong><p>${esc(c.note)}</p></div><div class="coach-actions">${next}<button type="button" class="ghost-btn" id="coach-finish">自由探索</button></div></section>`;
}
function bind(ctx){document.querySelectorAll('[data-coach-choice]').forEach(btn=>btn.addEventListener('click',()=>{const choice=btn.dataset.coachChoice;setSource(choice);if(choice==='demo'){ctx.setCompany('VPM-101');ctx.setYear(2022);ctx.nav('overview');}else ctx.nav('ingest');}));
 document.getElementById('coach-explore')?.addEventListener('click',()=>{state.guided=false;save();ctx.nav('overview')});
 document.getElementById('coach-resume')?.addEventListener('click',()=>{setSource('upload');ctx.nav('user')});}
function bindRibbon(ctx){document.querySelector('[data-coach-next]')?.addEventListener('click',e=>{const next=e.currentTarget.dataset.coachNext;if(!next)return;state.seen.push(ctx.route||'');save();ctx.nav(next)});
 document.getElementById('coach-finish')?.addEventListener('click',()=>{state.guided=false;save();ctx.render()});}
const api={init,view,ribbon,bind,bindRibbon,navHTML,openCurrent,setSource,setStep,source,step,_test:{getState:()=>({...state})}};
global.QZFlow=api;
})(window);
