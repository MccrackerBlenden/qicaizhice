 'use strict';
// v1.0: two auditable *scenario* investigations and an offline research report.
// Do not interpret elicited preference ranges or hypothetical score perturbations as
// empirical measurement errors, confidence intervals, or true-world probabilities.
let LAB_SCORE_STRESS=2;
const LAB_STRESS_SEED=20261111;
function labStressDecomposition(){
 const d=labJointData();if(!d)return labEmpty('六维评分数据不足，无法执行交叉压力实验');
 const {rows,groups,base,baseMap,N}=d;
 const targetIndex=rows.findIndex(r=>r.id===C);if(targetIndex<0)return labEmpty('当前企业不在完整样本内');
 const W=32,E=16,amplitude=LAB_SCORE_STRESS,span=LAB_JOINT_SPAN/100;
 const rngW=labJointRng(LAB_STRESS_SEED+Y*37+LAB_JOINT_SPAN*71),rngE=labJointRng(LAB_STRESS_SEED+Y*101+amplitude*7919);
 const weights=Array.from({length:W},()=>{
  const u=groups.map(g=>g.weight*(1+(rngW()*2-1)*span));const den=u.reduce((a,b)=>a+b,0);return u.map(x=>x/den);
 });
 // Use the same E independent, hypothetical six-score disturbances for all W weight settings.
 // This fully crossed design permits an *exact finite-grid* main/interaction variance split.
 const noise=Array.from({length:E},()=>rows.map(()=>groups.map(()=>amplitude*(2*rngE()-1))));
 const raw=rows.map(r=>groups.map(g=>Number(r[g.key])));
 const mat=[],csv=[['year','company_id','weight_draw','score_stress_draw','weight_span_pct','score_stress_halfwidth_points','scenario_rank',...groups.map(g=>'normalized_weight_'+g.dim)]];
 for(let wi=0;wi<W;wi++){
   let line=[];
   for(let ei=0;ei<E;ei++){
     const wt=weights[wi],eps=noise[ei],tx=raw[targetIndex];let tScore=0;
     for(let j=0;j<6;j++)tScore+=wt[j]*(tx[j]+eps[targetIndex][j]);
     let rank=1;
     for(let r=0;r<N;r++)if(r!==targetIndex){let score=0;for(let j=0;j<6;j++)score+=wt[j]*(raw[r][j]+eps[r][j]);
       if(score>tScore+1e-10||(Math.abs(score-tScore)<=1e-10&&rows[r].id<C))rank++;
     }
     line.push(rank);csv.push([Y,C,wi+1,ei+1,LAB_JOINT_SPAN,amplitude,rank,...wt]);
   }
   mat.push(line);
 }
 const grand=mat.flat(),mu=grand.reduce((a,b)=>a+b,0)/(W*E),
 rowMean=mat.map(r=>r.reduce((a,b)=>a+b,0)/E),
 colMean=Array.from({length:E},(_,e)=>mat.reduce((a,row)=>a+row[e],0)/W),
 varW=rowMean.reduce((a,v)=>a+(v-mu)**2,0)/W,
 varE=colMean.reduce((a,v)=>a+(v-mu)**2,0)/E,
 varI=mat.reduce((a,row,w)=>a+row.reduce((b,v,e)=>b+(v-rowMean[w]-colMean[e]+mu)**2,0),0)/(W*E),
 total=grand.reduce((a,v)=>a+(v-mu)**2,0)/(W*E),
 parts=[{name:'权重主效应',value:varW,color:'#71bdce'},{name:'评分扰动主效应',value:varE,color:'#dab57c'},{name:'权重 × 评分交互',value:varI,color:'#cc879c'}];
 const x0=320,y0=137,max=total||1,plotW=670;
 let bars='';parts.forEach((p,i)=>{
   let yy=y0+i*80,width=plotW*p.value/max;
   bars+=labText(295,yy+22,p.name,{anchor:'end',size:15,color:'#dcecf3'})+
   `<rect x="${x0}" y="${yy}" width="${plotW}" height="29" rx="3" fill="#193445"/>`+
   `<rect x="${x0}" y="${yy}" width="${Math.max(0,width)}" height="29" rx="3" fill="${p.color}"/>`+
   labText(Math.min(x0+width+11,1020),yy+20,`${labFix(p.value,3)} / ${labFix(total?100*p.value/total:0,1)}%`,{size:13,color:'#f2f8fc'});
 });
 const p5=labQuantile(grand,.05),p50=labQuantile(grand,.5),p95=labQuantile(grand,.95);
 bars+=labText(74,103,`基准重构排名 ${baseMap.get(C).rank}/${N} · 联合情景 P5 / P50 / P95: ${labFix(p5,0)} / ${labFix(p50,0)} / ${labFix(p95,0)}`,{size:14,color:labColor.gold})+
 labText(74,437,`总排名方差=${labFix(total,3)} · 分解残差=${labFix(total-varW-varE-varI,9)} · 32×16=${W*E} 个交叉情景`,{size:13,color:'#b8cfda'})+
 labText(74,460,`±${LAB_JOINT_SPAN}% 偏好乘子；六维得分独立均匀 ±${amplitude} 分为假设性压力，不代表实际测量精度`,{size:12});
 const svg=labSvg(labFrame('FIG 12','两类假设扰动 · 排名方差分解',`${Y} · ${C} · 32组偏好 × 16组假设评分扰动 · 合成样本 n=${N}`,bars),1100,488,'联合压力情景的排名方差来源分解');
 return {svg,title:'排名不稳定主要来自评价偏好，还是人为设定的评分压力？',
 desc:`交叉设计 ${W*E} 个有限情景，排名方差 ${labFix(total,3)}；权重主效应 ${labFix(total?100*varW/total:0,1)}%、假设评分扰动主效应 ${labFix(total?100*varE/total:0,1)}%、交互 ${labFix(total?100*varI/total:0,1)}%。这里的得分压力幅度是实验假设，不是从真实测量误差估计得出。`,
 method:'固定种子生成32组六维权重乘子和16组全体企业六维得分独立均匀压力，完整交叉。对目标公司名次 y_w,e，按平衡双因素方差恒等式 V=Var_w(E_e y)+Var_e(E_w y)+E[(y−行均值−列均值+总均值)²] 分解。全为有限网格描述性方差，非抽样推断、不采用未知真实误差分布。',
 csv:labCSV(csv),rows:W*E,metrics:{N,W,E,amplitude,span:LAB_JOINT_SPAN,mean:mu,p5,p50,p95,total,varW,varE,varI,residual:total-varW-varE-varI,baseRank:baseMap.get(C).rank}};
}
function labRegretComparison(){
 if(Y!==2022)return labEmpty('方案遗憾值比较只支持经过验证的2022年候选，切换至2022年后再试。');
 const subset=(A?.candidates||[]).filter(r=>r.company_id===C&&r.case===CASE&&[r.score_delta,r.total_action_cost,r.cash_headroom].every(labFinite));
 if(!subset.length)return labEmpty(`当前企业 ${C} / ${CASE} 无经过审计的可行候选，不能计算方案稳健性。`);
 const min=(k)=>Math.min(...subset.map(r=>Number(r[k]))),max=(k)=>Math.max(...subset.map(r=>Number(r[k]))),
 smin=min('score_delta'),smax=max('score_delta'),cmin=min('total_action_cost'),cmax=max('total_action_cost'),hmin=min('cash_headroom'),hmax=max('cash_headroom');
 const v=(r,k,low,high,reverse=false)=>high-low>1e-12?(reverse?(high-Number(r[k])):(Number(r[k])-low))/(high-low):1;
 const candidates=subset.map(x=>({x,vals:[v(x,'score_delta',smin,smax),v(x,'total_action_cost',cmin,cmax,true),v(x,'cash_headroom',hmin,hmax)],sum:0,worst:0,wins:0}));
 const L=12,grid=[],weighted=[];
 for(let i=0;i<=L;i++)for(let j=0;j<=L-i;j++){
   const k=L-i-j,w=[i/L,j/L,k/L];let best=-Infinity,winner=null;
   for(const c of candidates){const u=c.vals[0]*w[0]+c.vals[1]*w[1]+c.vals[2]*w[2];if(u>best+1e-12||(Math.abs(u-best)<1e-12&&(!winner||String(c.x.decision_id)<String(winner.x.decision_id)))){best=u;winner=c}}
   winner.wins++;
   for(const c of candidates){const u=c.vals[0]*w[0]+c.vals[1]*w[1]+c.vals[2]*w[2],reg=Math.max(0,best-u);c.sum+=reg;c.worst=Math.max(c.worst,reg)}
   grid.push({w,winner:winner.x.decision_id,best});
 }
 const count=grid.length;for(const c of candidates)c.mean=c.sum/count;
 const ordered=(key,other)=>[...candidates].sort((a,b)=>a[key]-b[key]||a[other]-b[other]||String(a.x.decision_id).localeCompare(String(b.x.decision_id)));
 const maxScore=[...candidates].sort((a,b)=>b.x.score_delta-a.x.score_delta||a.x.total_action_cost-b.x.total_action_cost)[0];
 const minCost=[...candidates].sort((a,b)=>a.x.total_action_cost-b.x.total_action_cost||b.x.score_delta-a.x.score_delta)[0];
 const maxCash=[...candidates].sort((a,b)=>b.x.cash_headroom-a.x.cash_headroom||a.x.total_action_cost-b.x.total_action_cost)[0];
 const chosen=candidates.find(c=>c.x.decision_id===SEL);
 const refs=[['最坏遗憾最小',ordered('worst','mean')[0]],['平均遗憾最小',ordered('mean','worst')[0]],['得分优先基准',maxScore],['低成本基准',minCost],['现金优先基准',maxCash]];
 if(chosen)refs.push(['当前行动中心方案',chosen]);
 const pMax=Math.max(.01,...refs.map(([,r])=>r.worst)),left=306,barW=600,y0=119,h=51;
 const ticks=[0,.25,.5,.75,1].map(fr=>labText(left+barW*fr,y0+refs.length*h+27,labFix(pMax*fr,3),{anchor:'middle',size:11})+`<line x1="${left+barW*fr}" y1="${y0-12}" x2="${left+barW*fr}" y2="${y0+refs.length*h}" stroke="${labColor.grid}" opacity=".7"/>`).join('');
 let bars='';refs.forEach(([name,c],i)=>{const y=y0+i*h;
 bars+=labText(left-20,y+21,name,{anchor:'end',size:13,color:'#e8f4f9'})+
 `<rect x="${left}" y="${y}" width="${barW*c.mean/pMax}" height="12" rx="2" fill="${labColor.cyan}"/><rect x="${left}" y="${y+18}" width="${barW*c.worst/pMax}" height="12" rx="2" fill="${labColor.red}"/>`+
 labText(Math.min(1014,left+barW*c.worst/pMax+8),y+30,labFix(c.worst,3),{size:11,color:'#f5e5e6'});
 });
 bars+=labText(50,85,`企业 ${C} / ${CASE} · 审计可行候选 n=${subset.length} · 权重单纯形 ${count} 格 · 蓝=平均遗憾 / 粉=最坏遗憾`,{size:13,color:labColor.gold})+
 labText(595,y0+refs.length*h+53,'归一化线性效用损失（不是万元、评分点或金融损失）',{anchor:'middle',size:13});
 const svg=labSvg(labFrame('FIG 13','方案稳健性 · 多目标遗憾对照',`2022 · ${C} · ${CASE} · 三目标得分/成本/现金 · 完整审计可行候选集`,ticks+bars),1100,Math.max(490,y0+refs.length*h+83),'多偏好情景下方案平均与最大效用遗憾的对比');
 const csv=labCSV([['company_id','year','case','decision_id','score_delta_points','action_cost_10kCNY','cash_headroom_10kCNY','normalized_score','normalized_low_cost','normalized_cash','mean_utility_regret','max_utility_regret','winning_grid_cells','grid_size'],...candidates.map(c=>[C,2022,CASE,c.x.decision_id,c.x.score_delta,c.x.total_action_cost,c.x.cash_headroom,...c.vals,c.mean,c.worst,c.wins,count])]);
 const gridCSV=labCSV([['weight_score','weight_low_cost','weight_cash','winner_decision_id','best_weighted_utility'],...grid.map(g=>[...g.w,g.winner,g.best])]);
 const recommend=refs[0][1];
 return {svg,title:'管理偏好改变时，哪种行动方案的最坏效用损失较小？',
 desc:`共 ${count} 组固定权重格元、${subset.length} 个经过原始财务护栏验证的候选。最坏遗憾最小方案的平均遗憾 ${labFix(recommend.mean,4)}，最大遗憾 ${labFix(recommend.worst,4)}；每次偏好比较的最优候选均来自同一有限集合。这不是未来亏损预测，也不是对预算/财务结果的经验概率。`,
 method:'对所有已验算可行候选的评分提升(↑)、行动成本(↓)、现金余量(↑)分别按组内最小最大值缩放至[0,1]。按12阶非负整数三元权重格网（和=1；共91格），在每格枚举所有候选求最优效用 U*(w)。每方案遗憾 R_i(w)=U*(w)−U_i(w)，比较其均值与最大值；同效用由方案ID稳定决胜。无统计置信或经验概率解释。',
 csv,gridCSV,rows:candidates.length,selected:{...recommend.x,case:CASE},metrics:{N:subset.length,count,topRegret:recommend.worst,topMean:recommend.mean,selectedId:recommend.x.decision_id,strategies:refs.map(([name,c])=>({name,id:c.x.decision_id,mean:c.mean,worst:c.worst,wins:c.wins}))}};
}
function labResearchReportHTML(){
 const ecdf=labECDF(),stress=labStressDecomposition(),regret=labRegretComparison();
 const selected=get(),now=new Date().toISOString(),safe=s=>labEsc(s);
 const pieces=[['01 · 样本内综合评分分布',ecdf],['12 · 权重与假设评分扰动的排名方差分解',stress],['13 · 多目标方案稳健性',regret]];
 const section=pieces.map(([title,f])=>`<section class="figure"><h2>${safe(title)}</h2><div class="illustration">${f.svg}</div><h3>研究问题和本次结果</h3><p>${safe(f.desc)}</p><h3>方法与计算范围</h3><p>${safe(f.method)}</p><p class="note">可复现源数据：打开应用对应 FIG 页导出 CSV；此报告为当前选择的快照，不包含以后改变参数后的结果。</p></section>`).join('');
 const methods=[['OECD / EC-JRC（2008）','Handbook on Constructing Composite Indicators','https://doi.org/10.1787/9789264043466-en'],['Lahdelma & Salminen（2001）','SMAA-2: Stochastic Multicriteria Acceptability Analysis for Group Decision Making','https://doi.org/10.1287/opre.49.3.444.11220'],['Tervonen & Lahdelma（2007）','Implementing stochastic multicriteria acceptability analysis','https://doi.org/10.1016/j.ejor.2005.12.037']];
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>企财智策 科研证据报告 ${safe(C)} ${Y}</title><style>
 :root{font-family:Arial,'Microsoft YaHei','PingFang SC',sans-serif;color:#162a3b;font-size:13px}*{box-sizing:border-box}body{max-width:1070px;margin:0 auto;padding:42px 45px;background:#fff;line-height:1.7}header{border-bottom:3px solid #274a61;padding-bottom:19px;margin-bottom:24px}h1{font-size:28px;margin:8px 0;color:#10334a}h2{font-size:19px;color:#15384b;border-left:4px solid #4e96ad;padding-left:13px;margin-top:0}h3{font-size:14px;margin-bottom:3px}.eyebrow{color:#598091;font-size:12px;letter-spacing:2px}.subtitle{color:#536c7b}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.facts div{border:1px solid #d9e5ec;padding:13px}.facts b{display:block;color:#153a4f;font-size:16px}.figure{padding-top:15px;margin:0 0 39px;break-before:page}.figure:first-of-type{break-before:auto}.illustration{background:#0b1d2c;padding:8px;margin-top:15px;overflow:hidden}.illustration svg{display:block;width:100%;height:auto}.note,.boundary{padding:13px;background:#f2f6f9;color:#456173}.boundary{border-left:3px solid #d19c65}.methods li{margin:8px 0;overflow-wrap:anywhere}a{color:#126c8f}footer{border-top:1px solid #cad8e0;padding-top:12px;color:#668091;font-size:12px}@page{size:A4;margin:13mm}@media print{body{padding:0;max-width:none}.figure{break-before:page}.illustration{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:#153a4f}}
 </style></head><body><header><div class="eyebrow">QICAI INTELLIGENCE · RESEARCH EVIDENCE · LOCAL REPORT</div><h1>企财智策 · 合成数据科研证据报告</h1><div class="subtitle">基于当前选择的可复核研究图谱｜自动生成 ${safe(now)}｜内部研究演示，不代表真实企业结论</div></header>
 <div class="facts"><div>当前合成企业<b>${safe(C)}</b></div><div>评价年度<b>${safe(Y)}</b></div><div>决策情景<b>${safe(CASE)}</b></div></div>
 <h2>摘要与数据范围</h2><p>本报告基于系统本地 <code>data/preview.json</code> 中328家独立合成企业的2020—2022年冻结评价，以及 <code>data/action_candidates.json</code> 中已通过预设财务约束的2022年候选方案；当前企业为 ${safe(C)}。所选企业在 ${safe(Y)} 年的冻结综合评分为 <strong>${safe(labFix(Number(selected?.overall_score),4))}</strong>。</p>
 <p class="boundary">研究结果只反映合成样本、明确指定的假设与有限偏好格网。评分扰动不是估计的真实测量误差；有限情景频率不是现实概率；没有运行原16指标重新训练、真实企业违约预测或因果识别。非2022年或非三家经验证企业时，方案部分将如实显示“不支持”。</p>
 ${section}<section class="methods"><h2>方法参考与复核路径</h2><ol>${methods.map(r=>`<li>${safe(r[0])}, ${safe(r[1])}. <a href="${r[2]}">${r[2]}</a></li>`).join('')}</ol><p>文献仅作为研究方法背景，不为本项目的合成结果背书。计算脚本位于 <code>workspace/research_evidence.js</code>，相关数值 CSV 可在应用 FIG 01 / 12 / 13 下载，原数据与运行完整性见包内 <code>SHA256SUMS.txt</code>。</p></section>
 <footer>企财智策 · 合成数据研究报告 · 本报告可由浏览器打印为 PDF；未认证为真实财务审计、投稿成果或投资决策建议。</footer></body></html>`;
}
