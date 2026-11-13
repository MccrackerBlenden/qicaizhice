 'use strict';
// v1.1 Report Studio — configurable, self-contained scientific report with evidence.
// All figures reuse the v1.0 source-backed computation functions. No new model is fitted.
const STUDIO_SCHEMA='qcz-research-recipe-v1.1';
const STUDIO_FINGERPRINTS={"workspace/diagnostics.js":"617ebeaa34c8b8213747d1b217d76492e6a311ecf5d29ecc016ff0ad286f3f13","data/preview.json":"cbb03ecc3848eaf9961e553790967f5a5ac3a5d01f37d15aaf3f06aa7cab0ded","data/action_candidates.json":"3207c9b17efc5572264bcfdafffec8bdc8016686f8548921d1f4ad727efc9db9","engine/api_scenario.py":"f6d964fbce6b7e9f08bfd156ea21238b62d6933a43fb4effbbb10e5c74258164","engine/api_optimize.py":"76503146f83eb87587981a0120849fda90c15d31b32f86b97ca50a2c8b13ec1a","engine/evaluation/core.py":"79e59df24ae1adcf9ba8b4aa6d05b6b15d2d8c8eceeeaf8024b7f756a163812e","engine/optimization/grid_optimizer.py":"d80cca16cbdaa0b4e6beaa588ace0d325afdab3ea43790cbfe46efac9306d168"};
let STUDIO_FIGURES=['ecdf','dupont','weights','rankaccept','stress','regret'];
let STUDIO_TITLE='医药制造企业财务评价与稳健决策研究（合成数据）';
let STUDIO_SUBTITLE='多维财务表现、偏好变化与目标约束方案的可复核分析';
let STUDIO_NOTE='研究关注综合评价的解释性、评价偏好敏感性与经营方案的稳健性。所有企业及财报均为独立生成的合成数据。';
let STUDIO_FORMAT='academic';
let STUDIO_INCLUDE_DIAG=true; // v1.2 optional financial diagnostic trace appendix
let STUDIO_STATUS='';
const STUDIO_MAKERS={ecdf:labECDF,correlation:labCorr,flow:labFlow,dupont:labDuPont,pareto:labPareto,weights:labWeightSensitivity,cohorts:labCohortComparison,preference:labPreferenceSweep,rankaccept:labRankAcceptability,pairspace:labPairStability,simplex:labRobustSimplex,stress:labStressDecomposition,regret:labRegretComparison};
const STUDIO_SCOPES={pareto:1,preference:1,simplex:1,regret:1};
const STUDIO_ORDERS=['academic','defense','technical'];
function studioContext(){
 return {company_id:C,year:Y,case:CASE,comparison_company_id:PEER,figure_order:[...STUDIO_FIGURES],title:STUDIO_TITLE,subtitle:STUDIO_SUBTITLE,note:STUDIO_NOTE,format:STUDIO_FORMAT,include_diagnostic:STUDIO_INCLUDE_DIAG,parameters:{weight_span:LAB_WEIGHT_SPAN,joint_span:LAB_JOINT_SPAN,score_stress:LAB_SCORE_STRESS,flow_from:LAB_WINDOW,correlation_pair:[...LAB_PAIR],joint_pair:[...LAB_JOINT_PAIR]}};
}
function studioRecipe(){return {schema:STUDIO_SCHEMA,data_versions:STUDIO_FINGERPRINTS,context:studioContext(),note:'合成数据研究配方，仅包含设置/哈希，不包含用户上传的财务文件'}}
function studioApplyRecipe(recipe){
 if(!recipe||recipe.schema!==STUDIO_SCHEMA||!recipe.context||!Array.isArray(recipe.context.figure_order))throw Error('不是受支持的 v1.1 研究配方');
 const c=recipe.context;
 const opts=c.figure_order;
 if(!opts.length||opts.length>13||new Set(opts).size!==opts.length||opts.some(id=>!Object.prototype.hasOwnProperty.call(STUDIO_MAKERS,id)))throw Error('图表编号或数量不合法');
 if(!D.companies.some(x=>x.id===c.company_id)||![2020,2021,2022].includes(c.year)||!['neutral','conservative','optimistic'].includes(c.case))throw Error('企业、年份或情景超出安全模型范围');
 if(!STUDIO_ORDERS.includes(c.format))throw Error('报告样式不受支持');
 if([c.title,c.subtitle,c.note].some(v=>typeof v!=='string'||v.length>1000))throw Error('文字字段过长');
 const p=c.parameters;
 if(!p||![10,20,30,40,50].includes(p.weight_span)||![10,20,30,40,50].includes(p.joint_span)||![0,1,2,4,6].includes(p.score_stress)||![2020,2021].includes(p.flow_from)||
  !Array.isArray(p.correlation_pair)||p.correlation_pair.length!==2||p.correlation_pair.some(v=>!Number.isInteger(v)||v<0||v>5)||
  !Array.isArray(p.joint_pair)||p.joint_pair.length!==2||p.joint_pair.some(v=>!Number.isInteger(v)||v<0||v>5)||p.joint_pair[0]===p.joint_pair[1])throw Error('研究扰动或维度配置不合法');
 // The recipe records the source hashes; warn instead of silently assuming matches.
 const mismatches=Object.entries(STUDIO_FINGERPRINTS).filter(([path,digest])=>recipe.data_versions?.[path]!==digest);
 STUDIO_FIGURES=[...opts];STUDIO_TITLE=c.title.slice(0,100);STUDIO_SUBTITLE=c.subtitle.slice(0,180);STUDIO_NOTE=c.note.slice(0,1000);STUDIO_FORMAT=c.format;STUDIO_INCLUDE_DIAG=c.include_diagnostic===undefined?false:!!c.include_diagnostic;
 C=c.company_id;Y=c.year;CASE=c.case;PEER=D.companies.some(x=>x.id===c.comparison_company_id)?c.comparison_company_id:C;
 // Do not carry a selection from a different company/scenario into the action workbench.
 SEL=null;LAB_PICK=null;LAB_PREF_PICK=null;LAB_SIMPLEX_PICK=null;FILTER={cost:'',debt:'',score:''};COMPARE=[];
 LAB_WEIGHT_SPAN=p.weight_span;LAB_JOINT_SPAN=p.joint_span;LAB_SCORE_STRESS=p.score_stress;LAB_WINDOW=p.flow_from;LAB_PAIR=[...p.correlation_pair];LAB_JOINT_PAIR=[...p.joint_pair];
 STUDIO_STATUS=mismatches.length?`已导入配方，但有 ${mismatches.length} 项数据/引擎指纹不一致；请勿将重算结果视为原版本精确复现。`:'配方已恢复；数据和引擎指纹与当前版本匹配。';
}
function studioCollect(){
 const stash={LAB_FIG,LAB_PICK,LAB_PREF_PICK,LAB_SIMPLEX_PICK,LAB_CANDIDATES:[...LAB_CANDIDATES],LAB_CURRENT};
 const result=[];
 try{
  for(const id of STUDIO_FIGURES){
   const f=STUDIO_MAKERS[id]();
   const ref=LAB_PAPERS[id];
   const valid=f&&Number.isFinite(f.rows)&&f.rows>0;
   result.push({id,fig:id,title:LAB_TABS.find(t=>t[0]===id)?.[1]||id,valid,
    svg:valid?f.svg:'',csv:valid?f.csv:'',gridCSV:valid&&f.gridCSV?f.gridCSV:null,
    rows:valid?f.rows:0,result_title:f.title,description:f.desc,method:f.method,
    hypothesis:ref?.[0]||'',method_reference:ref?.[4]||'',reference_url:ref?.[3]||'',scope_note:ref?.[2]||'',
    reason:valid?'':f?.desc||'源数据不满足该图的计算条件'});
  }
 }finally{LAB_FIG=stash.LAB_FIG;LAB_PICK=stash.LAB_PICK;LAB_PREF_PICK=stash.LAB_PREF_PICK;LAB_SIMPLEX_PICK=stash.LAB_SIMPLEX_PICK;LAB_CANDIDATES=stash.LAB_CANDIDATES;LAB_CURRENT=stash.LAB_CURRENT}
 return result;
}
function studioDiagnosticAppendix(){
 if(!STUDIO_INCLUDE_DIAG)return null;
 const r=get(),peer=get(PEER,Y),dist=diagDistribution(Y,DIAG_GROUP,DIAG_METRIC),spec=DIAG_METRICS[DIAG_METRIC],bridge=diagTraceRows();
 return {company:C,comparison_company:PEER,year:Y,group:DIAG_GROUP,group_count:dist.n,metric:DIAG_METRIC,metric_label:spec.label,unit:spec.unit,
  formula:spec.basis,company_value:diagVal(r,DIAG_METRIC),comparison_value:diagVal(peer,DIAG_METRIC),median:dist.q50,q25:dist.q25,q75:dist.q75,
  percent_from_low:diagPercentile(dist.rows,diagVal(r,DIAG_METRIC)),
  raw_fields:spec.parts.map(k=>({field:k,name:DIAG_NAMES[k]||k,selected:r[k],comparison:peer?.[k]??null})),
  csv:diagCsv([['company_id','year','archetype','metric','value','unit'],...dist.rows.map(x=>[x.id,Y,x.archetype,DIAG_METRIC,x.metric,spec.unit])]),
  bridges:bridge?{period:[Y-1,Y],values:bridge.delta,maximum_identity_residual:Math.max(...bridge.residuals.map(Math.abs)),csv:diagCsv([['field','previous_year','current_year','delta_wan_yuan'],...Object.keys(bridge.delta).map(k=>[k,bridge.a[k],bridge.b[k],bridge.delta[k]])])}:null,
  limits:'同类仅是合成生成器画像；群组位置不是实际行业分位，财务代数拆分不构成因果归因。'};
}
function studioEvidence(){const figures=studioCollect();const recipe=studioRecipe();return {schema:'qcz-evidence-bundle-v1.2',generated_at:new Date().toISOString(),recipe,figures:figures.map(({svg,csv,gridCSV,...other})=>({...other,svg,csv,gridCSV})),diagnostic:studioDiagnosticAppendix(),notice:'所有图片、CSV及计算说明在本档案中封存；没有运行实时优化或真实行业实证。'}}
function studioDocument(evidence){
 const cfg=evidence.recipe.context;
 const esc=labEsc;
 const variants={academic:'学术研究报告',defense:'项目答辩报告',technical:'技术复核报告'};
 const lines=evidence.figures.map((f,i)=>f.valid?
 `<section class="figure"><div class="figline"><span>FIG ${String(i+1).padStart(2,'0')} · ${esc(f.title)}</span><span>${esc(cfg.company_id)} · ${esc(cfg.year)}</span></div>
 <h2>${esc(f.result_title)}</h2><div class="art">${f.svg}</div><p class="finding"><strong>分析结论：</strong>${esc(f.description)}</p><p><strong>计算方法：</strong>${esc(f.method)}</p>
 <p class="limitation"><strong>解释边界：</strong>${esc(f.scope_note)}</p><div class="sourcebar">研究数据量：${f.rows} 条 · <button type="button" class="download-csv" data-figure="${esc(f.id)}">下载本图内嵌源数据 CSV</button>${f.gridCSV?` · <button type="button" class="download-grid" data-figure="${esc(f.id)}">下载偏好格网</button>`:''}</div>
 <p class="ref">研究方法参考（非本项目实验验证）：${esc(f.method_reference)} ${f.reference_url?`· <a href="${esc(f.reference_url)}">${esc(f.reference_url)}</a>`:''}</p></section>`:
 `<section class="figure notready"><h2>${esc(f.title)} · 未纳入数值结论</h2><p>${esc(f.reason)}</p><p>该图不支持当前企业／年度／情景；未生成虚构数值。修改研究范围后重新导出。</p></section>`).join('\n');
 // No user-controlled HTML is interpreted; JSON is escaped from script termination.
 const d=evidence.diagnostic;
 const appendix=d?`<section class="figure diagnostic-appendix"><h2>财务诊断证据附录 · ${esc(d.metric_label)}</h2><p>企业 ${esc(d.company)} / 同年对照 ${esc(d.comparison_company)}；${esc(d.group==='same'?'同类合成画像':'全体合成企业')}，有效 n=${d.group_count}。</p>
 <table class="source-table"><tr><td>指标公式</td><td>${esc(d.formula)}</td></tr><tr><td>目标企业</td><td>${esc(diagFmt(d.company_value))} ${esc(d.unit)}</td></tr><tr><td>对照企业</td><td>${esc(diagFmt(d.comparison_value))} ${esc(d.unit)}</td></tr><tr><td>中位数 / Q25 / Q75</td><td>${esc(diagFmt(d.median))} / ${esc(diagFmt(d.q25))} / ${esc(diagFmt(d.q75))}</td></tr><tr><td>由低到高经验位置</td><td>${esc(diagFmt(d.percent_from_low,1))}%（不是优于比例）</td></tr>${d.raw_fields.map(x=>`<tr><td>${esc(x.name)}</td><td>目标 ${esc(diagFmt(x.selected))} / 对照 ${esc(diagFmt(x.comparison))} 万元</td></tr>`).join('')}</table>
 ${d.bridges?`<h3>${d.bridges.period[0]}—${d.bridges.period[1]} 三表金额变化桥</h3><p>营业收入变动 ${esc(diagFmt(d.bridges.values.revenue))} 万元；毛利润变动 ${esc(diagFmt(d.bridges.values.gross))} 万元；净利润变动 ${esc(diagFmt(d.bridges.values.net))} 万元；资产变动 ${esc(diagFmt(d.bridges.values.assets))} 万元。四条会计恒等式最大残差 ${esc(diagFmt(d.bridges.maximum_identity_residual,8))} 万元。</p>`:'<p>首年没有相邻年度冻结比较，本报告不构造假定前期。</p>'}
 <p class="limitation">${esc(d.limits)}</p><div class="sourcebar"><button class="download-diagnostic" data-kind="cohort">下载本群组财务指标 CSV</button> ${d.bridges?'<button class="download-diagnostic" data-kind="bridges">下载年度变化桥 CSV</button>':''}</div></section>`:'';
 const serialized=JSON.stringify(evidence).replace(/</g,'\\u003c').replace(/-->/g,'--\\u003e');
 const src=Object.entries(STUDIO_FINGERPRINTS).map(([p,h])=>`<tr><td>${esc(p)}</td><td class="mono">${esc(h)}</td></tr>`).join('');
 const risk='全体数据仅为独立合成的医药制造企业，不能外推至真实上市公司。六维重构评分与原16指标冻结综合评分不等价。权重与评分扰动频数不是置信区间或未来真实概率；群组差异可能来自生成器设计。仅三家合成企业的2022年候选方案通过预设约束和会计一致性检查；其它范围的行动决策图明确不支持。没有执行模型重新训练、因果推断或实时优化。';
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cfg.title)}</title><style>
 :root{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;color:#1a3040;font-size:13px}*{box-sizing:border-box}body{background:#fff;max-width:1100px;margin:0 auto;padding:40px 45px;line-height:1.76}h1{font-size:30px;line-height:1.3;margin:12px 0}h2{font-size:18px;color:#133b51;border-left:4px solid #4c9ab4;padding-left:12px}h3{font-size:15px}.eyebrow{font-size:12px;color:#638c9e;letter-spacing:.16em;text-transform:uppercase}.sub{color:#557484;font-size:15px}.scope{border-top:3px solid #1b526c;border-bottom:1px solid #cfdae0;padding:19px 0;margin:20px 0 25px;display:flex;flex-wrap:wrap;gap:24px}.scope span{min-width:155px}.scope b{display:block;color:#183949}.abstract{padding:20px 23px;background:#f3f7f9;border-left:4px solid #b48e54}.figure{break-inside:avoid;break-before:page;margin:30px 0 50px;padding-top:8px}.figline{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.04em;color:#50788c;border-bottom:1px solid #d5e1e6;padding:7px 0}.art{background:#0b1d2c;padding:10px;overflow:hidden;margin-top:18px}.art svg{display:block;width:100%;height:auto}.finding{background:#ecf4f7;padding:15px}.limitation{color:#6c512d;background:#fff5e7;padding:12px;border-left:3px solid #c69c62}.sourcebar{font-size:12px;color:#31566c}.sourcebar button{background:#e8f1f5;border:1px solid #a7c5d0;border-radius:4px;padding:5px 8px;color:#16526c;cursor:pointer}.ref{font-size:12px;color:#647d8b;overflow-wrap:anywhere}.notready{break-before:auto;border:1px dashed #bdad8a;padding:20px}.source-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}.source-table td{border-bottom:1px solid #dce6ea;padding:7px;overflow-wrap:anywhere}.mono{font-family:Consolas,monospace;font-size:12px}.foot{font-size:12px;color:#718794;border-top:1px solid #d0dfe5;margin-top:30px;padding-top:15px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.actions button{padding:9px 15px;background:#174963;color:white;border:0;cursor:pointer}a{color:#236d92}main{max-width:100%}
 @page{size:A4;margin:13mm}@media print{body{max-width:none;padding:0}.actions,.sourcebar button{display:none}.figure{break-before:page;break-inside:auto}.figure:first-of-type{break-before:auto}.art{-webkit-print-color-adjust:exact;print-color-adjust:exact}.scope,.abstract{break-inside:avoid}}
 </style></head><body><header><div class="eyebrow">QICAI INTELLIGENCE / REPRODUCIBLE RESEARCH DOSSIER / VERSION 1.2</div><h1>${esc(cfg.title)}</h1><p class="sub">${esc(cfg.subtitle)}</p><div class="scope"><span>报告类型<b>${esc(variants[cfg.format])}</b></span><span>合成企业<b>${esc(cfg.company_id)}</b></span><span>分析年度<b>${esc(cfg.year)}</b></span><span>经营情景<b>${esc(cfg.case)}</b></span><span>图表数量<b>${evidence.figures.length}（有效 ${evidence.figures.filter(x=>x.valid).length}）</b></span></div></header><div class="actions"><button onclick="window.print()">打印 / 保存 PDF</button><button id="download-recipe">下载本报告研究配方 JSON</button></div>
 <main><h2>摘要与研究目标</h2><div class="abstract">${esc(cfg.note)}</div><p>本报告采用本地328家独立合成医药制造企业的2019—2022年安全三表与2020—2022年冻结评价，研究样本及行为均为模拟数据。图形按导出时的企业、年度、情景和参数计算并封存，数据不随系统未来操作自动刷新。导出时间（UTC）：${esc(evidence.generated_at)}。</p><h2>研究图表与计算证据</h2>${lines}${appendix}
 <section><h2>统一解释边界</h2><p class="limitation">${esc(risk)}</p><h2>研究数据和算法指纹（SHA-256）</h2><p>以下值是本报告生成包构建时对本地源文件的指纹，可用于核对该包的文件版本；它们不代表研究质量、外部复现成功或源数据使用许可。</p><table class="source-table">${src}</table><h2>方法来源</h2><p>OECD / EC-JRC (2008), <i>Handbook on Constructing Composite Indicators</i>, <a href="https://doi.org/10.1787/9789264043466-en">DOI</a>； Wilkinson et al. (2016), FAIR Guiding Principles, <a href="https://doi.org/10.1038/sdata.2016.18">DOI</a>； FAIR4RS (2022), <a href="https://doi.org/10.1038/s41597-022-01710-x">DOI</a>。引用为研究透明度和敏感性方法背景，不等同于对本报告合成数据结果的外部认可。</p><p>本报告内嵌可下载的每图 CSV、图形 SVG（直接包含在页面中）、完整配方和方法描述。报告没有访问网络获取实时数值。</p></section></main><footer class="foot">企财智策 · 合成数据研究报告。模型结果不构成真实行业实证、财务审计或投资建议。</footer>
 <script type="application/json" id="qcz-evidence">${serialized}</script><script>
 (()=>{const d=JSON.parse(document.getElementById('qcz-evidence').textContent);
 const save=(name,data,type)=>{const b=new Blob([data],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),200)};
 document.querySelectorAll('[data-figure]').forEach(b=>b.addEventListener('click',()=>{const f=d.figures.find(x=>x.id===b.dataset.figure);if(!f)return;const grid=b.classList.contains('download-grid');save('QICAI_'+f.id+'_'+d.recipe.context.company_id+'_'+d.recipe.context.year+'.csv',grid?f.gridCSV:f.csv,'text/csv;charset=utf-8')}));
 document.querySelectorAll('.download-diagnostic').forEach(b=>b.addEventListener('click',()=>{if(!d.diagnostic)return;const data=b.dataset.kind==='bridges'?d.diagnostic.bridges?.csv:d.diagnostic.csv;if(data)save('QICAI_diagnostic_'+b.dataset.kind+'_'+d.recipe.context.company_id+'.csv',data,'text/csv;charset=utf-8')}));
 document.getElementById('download-recipe').addEventListener('click',()=>save('QICAI_research_recipe_v1.1.json',JSON.stringify(d.recipe,null,2),'application/json;charset=utf-8'));
 })();</script></body></html>`;
}
function renderReportStudio(){
 const rows=STUDIO_FIGURES.map((id,i)=>{
  const tab=LAB_TABS.find(x=>x[0]===id);
  return `<div class="studio-item" data-studio-id="${id}"><span class="studio-number">${String(i+1).padStart(2,'0')}</span><div class="studio-item-body"><b>${labEsc(tab?.[1]||id)}</b><small>${labEsc(STUDIO_SCOPES[id]?'仅2022年已验证候选':'合成财务与冻结评分分析')}</small></div><button type="button" data-studio-up="${id}" aria-label="上移${id}" ${i===0?'disabled':''}>↑</button><button type="button" data-studio-down="${id}" aria-label="下移${id}" ${i===STUDIO_FIGURES.length-1?'disabled':''}>↓</button><button type="button" data-studio-remove="${id}" aria-label="删除${id}">×</button></div>`;
 }).join('');
 const available=LAB_TABS.filter(([id])=>!STUDIO_FIGURES.includes(id)).map(([id,label])=>`<option value="${id}">${labEsc(label)}</option>`).join('');
 const selection=STUDIO_FIGURES.map(id=>`<button type="button" class="studio-fig-pill" data-studio-open="${id}">${labEsc(LAB_TABS.find(x=>x[0]===id)?.[1]||id)} ↗</button>`).join('');
 return `<div class="lab-hero"><div class="overline">REPORT STUDIO / 09 · REPRODUCIBLE SCIENCE</div><h2>科研报告工作台</h2><p>从13组独立计算的科研图中自由选图、调整章节顺序、冻结实验参数，并导出含 SVG、数值 CSV、SHA-256 文件指纹和完整方法边界的离线报告。</p><div class="lab-headline"><span>13 图自由编排</span><span>HTML 一体化证据包</span><span>研究配方导入 / 导出</span></div></div>
 <div class="studio-overview"><div class="studio-stat"><span>已选图表</span><strong>${STUDIO_FIGURES.length} / 13</strong></div><div class="studio-stat"><span>当前合成企业</span><strong>${labEsc(C)}</strong></div><div class="studio-stat"><span>分析年度</span><strong>${Y}</strong></div><div class="studio-stat"><span>情景</span><strong>${labEsc(CASE)}</strong></div></div>
 <div class="grid2 equal"><section class="studio-panel"><div class="studio-panelhead"><h3>01 · 研究表述</h3><small>所有描述将如实保存在报告正文与配方里</small></div>
 <label class="studio-field">报告名称<input id="studio-title" maxlength="100" value="${labEsc(STUDIO_TITLE)}"/></label>
 <label class="studio-field">研究副标题<input id="studio-subtitle" maxlength="180" value="${labEsc(STUDIO_SUBTITLE)}"/></label>
 <label class="studio-field">研究问题 / 摘要<textarea id="studio-note" rows="5" maxlength="1000">${labEsc(STUDIO_NOTE)}</textarea></label>
 <label class="studio-field">报告用途<select id="studio-format" class="form-select"><option value="academic" ${STUDIO_FORMAT==='academic'?'selected':''}>学术研究说明</option><option value="defense" ${STUDIO_FORMAT==='defense'?'selected':''}>项目答辩展示</option><option value="technical" ${STUDIO_FORMAT==='technical'?'selected':''}>技术复核记录</option></select></label>
 <label class="studio-field" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="studio-include-diag" ${STUDIO_INCLUDE_DIAG?'checked':''} style="width:16px;height:16px"/>纳入当前 03/04 工作台的同行对标与三表变化证据附录</label><p class="studio-hint">当前企业、年度在页面顶部切换；经营情景可在 06 行动中心设置，或导入配方自动恢复。报告数据均为虚构企业。</p></section>
 <section class="studio-panel"><div class="studio-panelhead"><h3>02 · 图表编排</h3><small>点击 ↑ ↓ 改变报告顺序，不重算原模型</small></div><div id="studio-items">${rows}</div>
 <div class="studio-add"><select id="studio-add-figure" class="form-select" ${available?'':'disabled'}><option value="">${available?'选择更多研究图':'已选全部13组'}</option>${available}</select><button type="button" class="ghost-btn" id="studio-add-button" ${available?'':'disabled'}>加入报告 +</button></div><div class="studio-openline">${selection}</div></section></div>
 <section class="studio-panel studio-export"><div class="studio-panelhead"><h3>03 · 固化研究证据</h3><small>一次导出，生成可独立保存/打印的研究成果</small></div>
 <p>报告包含所选科研图的完整 SVG、相应 CSV、计算方法、假设限制、图注及数据/算法版本 SHA-256 指纹。无法计算的图会说明“不支持”，而不是生成假的图或结果。</p>
 <div class="studio-toolbar"><button type="button" class="primary-btn" id="studio-export-html">生成完整 HTML 科研报告 ↓</button><button type="button" class="ghost-btn" id="studio-export-evidence">下载完整证据 JSON ↓</button><button type="button" class="ghost-btn" id="studio-export-recipe">导出研究配方 JSON ↓</button><label class="studio-import">导入研究配方 <input id="studio-import-recipe" type="file" accept="application/json,.json"/></label></div>
 <p class="studio-hint">图表以当前企业、年度、情景和敏感性配置计算。与在线系统无关的独立 HTML 在离线环境下仍能查看图像并下载内嵌CSV。</p>${STUDIO_STATUS?`<div class="studio-message" role="status">${labEsc(STUDIO_STATUS)}</div>`:''}</section>`;
}
function bindReportStudio(){
 function syncText(){STUDIO_TITLE=document.querySelector('#studio-title')?.value.slice(0,100)||'';STUDIO_SUBTITLE=document.querySelector('#studio-subtitle')?.value.slice(0,180)||'';STUDIO_NOTE=document.querySelector('#studio-note')?.value.slice(0,1000)||'';STUDIO_FORMAT=document.querySelector('#studio-format')?.value||'academic';STUDIO_INCLUDE_DIAG=!!document.querySelector('#studio-include-diag')?.checked}
 document.querySelector('#studio-include-diag')?.addEventListener('change',e=>{STUDIO_INCLUDE_DIAG=e.target.checked});
 for(const [field,set] of [['studio-title',v=>STUDIO_TITLE=v],['studio-subtitle',v=>STUDIO_SUBTITLE=v],['studio-note',v=>STUDIO_NOTE=v],['studio-format',v=>STUDIO_FORMAT=v]]){
  document.getElementById(field)?.addEventListener('input',e=>set(e.target.value));
 }
 document.querySelectorAll('[data-studio-up],[data-studio-down],[data-studio-remove]').forEach(el=>el.addEventListener('click',()=>{
  syncText();const id=el.dataset.studioUp||el.dataset.studioDown||el.dataset.studioRemove;const at=STUDIO_FIGURES.indexOf(id);if(at<0)return;
  if(el.dataset.studioRemove){if(STUDIO_FIGURES.length===1){STUDIO_STATUS='报告至少需要保留一张研究图。';render();return}STUDIO_FIGURES.splice(at,1)}
  else {const to=at+(el.dataset.studioUp?-1:1);if(to<0||to>=STUDIO_FIGURES.length)return;[STUDIO_FIGURES[at],STUDIO_FIGURES[to]]=[STUDIO_FIGURES[to],STUDIO_FIGURES[at]]}
  STUDIO_STATUS='已更新图表顺序';render();
 }));
 document.getElementById('studio-add-button')?.addEventListener('click',()=>{syncText();const id=document.getElementById('studio-add-figure')?.value;if(!id||!Object.prototype.hasOwnProperty.call(STUDIO_MAKERS,id)||STUDIO_FIGURES.includes(id))return;STUDIO_FIGURES.push(id);STUDIO_STATUS='已增加图表';render()});
 document.querySelectorAll('[data-studio-open]').forEach(el=>el.addEventListener('click',()=>{syncText();LAB_FIG=el.dataset.studioOpen;nav('research')}));
 document.getElementById('studio-export-html')?.addEventListener('click',()=>{syncText();try{const ev=studioEvidence();downloadText(`企财智策_科研报告_v1.2_${C}_${Y}.html`,studioDocument(ev),'text/html;charset=utf-8');STUDIO_STATUS=`已生成报告：${ev.figures.filter(f=>f.valid).length}/${ev.figures.length} 张有有效计算依据；CSV与配方均内嵌。`;render()}catch(e){STUDIO_STATUS='导出失败：'+e.message;render()}});
 document.getElementById('studio-export-evidence')?.addEventListener('click',()=>{syncText();try{downloadText(`企财智策_科研证据_v1.2_${C}_${Y}.json`,JSON.stringify(studioEvidence(),null,2),'application/json;charset=utf-8');STUDIO_STATUS='完整研究证据 JSON 已生成。';render()}catch(e){STUDIO_STATUS='证据导出失败：'+e.message;render()}});
 document.getElementById('studio-export-recipe')?.addEventListener('click',()=>{syncText();downloadText('企财智策_研究配方_v1.1.json',JSON.stringify(studioRecipe(),null,2),'application/json;charset=utf-8');STUDIO_STATUS='研究配方 JSON 已导出；其中不包含合成数值，仅包含参数和数据指纹。';render()});
 document.getElementById('studio-import-recipe')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>65536){STUDIO_STATUS='配方文件超过64KB，已拒绝读取。';render();return}try{const text=await f.text();studioApplyRecipe(JSON.parse(text));render()}catch(err){STUDIO_STATUS='导入失败：'+err.message;render()}});
}
