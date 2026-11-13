'use strict';
// v0.8: deterministic, auditable investigations on existing frozen synthetic evidence.
// These experiments never mutate the evaluation model or 有限网格优化 frozen optimisation.
let LAB_WEIGHT_SPAN=40, LAB_PREF_PICK=null;
const LAB_DIM_MAP={profitability:'score_profitability',solvency:'score_solvency',operations:'score_operations',growth:'score_growth',cashflow:'score_cashflow',research:'score_research'};
function labWeightBase(){
 const map=Object.fromEntries(Object.keys(LAB_DIM_MAP).map(k=>[k,0]));
 for(const w of (D?.weights||[])){if(Object.hasOwn(map,w.dim))map[w.dim]+=Number(w.weight)||0;}
 const arr=Object.entries(map).map(([dim,w])=>({dim,key:LAB_DIM_MAP[dim],name:dims.find(x=>x[0]===LAB_DIM_MAP[dim])?.[1]||dim,weight:w}));
 const sum=arr.reduce((s,d)=>s+d.weight,0);
 if(sum<=0||arr.some(d=>d.weight<=0))throw Error('六维冻结权重不可用');
 return arr.map(d=>({...d,weight:d.weight/sum}));
}
function labWeightedRows(rows,weightGroups,multiplierIndex=-1,factor=1){
 const weights=weightGroups.map((d,i)=>d.weight*(i===multiplierIndex?factor:1));
 const sum=weights.reduce((a,b)=>a+b,0);
 if(!(sum>0))return [];
 const result=rows.map(r=>({id:r.id,score:weights.reduce((acc,w,i)=>acc+w*Number(r[weightGroups[i].key]),0)/sum}));
 result.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return result.map((r,i)=>({...r,rank:i+1}));
}
function labWeightSensitivity(){
 const groups=labWeightBase(),rows=each(Y).filter(r=>groups.every(g=>labFinite(r[g.key]))),N=rows.length;
 if(N<10)return labEmpty('当前年份没有足够的六维完整评分，无法进行权重扰动实验');
 const base=labWeightedRows(rows,groups),lookup=Object.fromEntries(base.map(x=>[x.id,x]));
 const selected=lookup[C];if(!selected)return labEmpty('当前企业不存在有效重构评分');
 const steps=9,span=LAB_WEIGHT_SPAN/100,results=[],byRow=[];
 for(let i=0;i<groups.length;i++){
   const line=[];
   for(let j=0;j<steps;j++){
     const factor=1+span*(j-4)/4,ranked=labWeightedRows(rows,groups,i,factor);
     const ranks=Object.fromEntries(ranked.map(r=>[r.id,r.rank]));
     const rho=labPearson(base.map(r=>r.rank),base.map(r=>ranks[r.id]));
     const current=ranks[C];
     const item={dimension:groups[i].dim,name:groups[i].name,baseline_weight:groups[i].weight,factor,
       modified_weight:groups[i].weight*factor/(1+groups[i].weight*(factor-1)),
       rank:current,change:current-selected.rank,rho};
     line.push(item);results.push(item);
   }
   byRow.push(line);
 }
 const gridX=225,gridY=138,cw=68,ch=43;
 const labels=[...Array(steps)].map((_,j)=>labText(gridX+j*cw+cw/2,114,`${Math.round(span*100*(j-4)/4)>0?'+':''}${Math.round(span*100*(j-4)/4)}%`,{anchor:'middle',size:12})).join('');
 const maxChange=Math.max(1,...results.map(x=>Math.abs(x.change)));
 const cells=byRow.map((line,i)=>{
   const rowLabel=labText(gridX-17,gridY+i*ch+27,groups[i].name,{anchor:'end',size:13,color:'#d3e6ef'});
   return rowLabel+line.map((v,j)=>{
     // Improvements are cyan, declines are pink; neither represents uncertainty probability.
     const normalized=Math.min(1,Math.abs(v.change)/maxChange);const color=v.change<0?`rgba(77,163,180,${(0.20+0.68*normalized).toFixed(3)})`:v.change>0?`rgba(218,112,124,${(0.20+0.68*normalized).toFixed(3)})`:'rgba(47,73,93,.72)';
     const label=(v.change>0?'+':'')+v.change;
     return `<rect class="lab-weight-cell" x="${gridX+j*cw+2}" y="${gridY+i*ch}" width="${cw-4}" height="${ch-3}" rx="3" fill="${color}" stroke="#547085" stroke-width=".5"><title>${labEsc(groups[i].name)} × ${labFix(v.factor,2)}；排名 ${v.rank}/${N}；变化 ${label}；Spearman ρ=${labFix(v.rho,4)}</title></rect>${labText(gridX+j*cw+cw/2,gridY+i*ch+26,label,{anchor:'middle',size:14,color:'#e8f6fa',weight:'700'})}`;
   }).join('');
 }).join('');
 const nonbase=results.filter(x=>Math.abs(x.factor-1)>1e-8),rhoMin=Math.min(...nonbase.map(x=>x.rho)),allRanks=results.map(x=>x.rank),mn=Math.min(...allRanks),mx=Math.max(...allRanks);
 const svg=labSvg(labFrame('FIG 06','六维评分权重 · 单因素扰动稳定性',`${Y} 年 · ${C} · 合成完整样本 n=${N} · 当前基准重构排名 ${selected.rank}/${N} · 区间 ${mn}—${mx}`,
 `${labels}${cells}<line x1="${gridX+4*cw+cw/2}" y1="128" x2="${gridX+4*cw+cw/2}" y2="${gridY+6*ch+7}" stroke="${labColor.gold}" stroke-width="1.4" stroke-dasharray="4 4"/>
 ${labText(225,426,'色块数字 = 当前企业排名变化；负数表示名次上升；0 为与重构基准一致',{size:12})}
 ${labText(225,453,`六维重构得分 ${labFix(selected.score,4)} / 冻结原综合得分 ${labFix(+get().overall_score,4)}（两者不是同一个完整评分模型）`,{size:12,color:labColor.gold})}`),1100,485,'六维重构指数排名对权重单因素扰动的敏感性矩阵');
 return {title:'企业排序对评价偏好的稳定性',svg,desc:`当单次只修改六维中一维的合计权重，幅度为 ±${LAB_WEIGHT_SPAN}% 时，${C} 的同年重构排名在 ${mn}—${mx}/${N} 之间变化。非基准情景相对重构排名的最小 Spearman ρ=${labFix(rhoMin,4)}。这些值不重新校准16项原始指标。`,method:'从16项冻结权重按六维合计；以已公布的六维得分重构加权指数。每次只改变一维的权重系数，六维归一化，重新对同年328家排序，并计算与重构基准的 Spearman 等级相关。',
 csv:labCSV([['year','selected_company','n','dimension','baseline_dimension_weight','perturbation_multiplier','normalized_dimension_weight','selected_baseline_rank','selected_scenario_rank','rank_change','spearman_rho','reconstructed_baseline_score','frozen_official_score'],...results.map(x=>[Y,C,N,x.dimension,x.baseline_weight,x.factor,x.modified_weight,selected.rank,x.rank,x.change,x.rho,selected.score,Number(get().overall_score)])]),rows:results.length,metrics:{rankMin:mn,rankMax:mx,rhoMin,baseline:selected.rank,N}};
}
function labCohortComparison(){
 const all=each(Y).filter(r=>labFinite(r.overall_score));
 if(!all.length)return labEmpty('合成企业暂无有效综合评分');
 const labels=[...new Set(all.map(r=>r.archetype))];
 const grouped=labels.map(label=>({label,rows:all.filter(r=>r.archetype===label)}));
 const x0=250,x1=1013,X=v=>labScale(v,0,100,x0,x1),lineY=i=>145+i*76;
 const ticks=[0,20,40,60,80,100].map(v=>`<line x1="${X(v)}" y1="110" x2="${X(v)}" y2="${lineY(labels.length-1)+38}" stroke="${labColor.grid}" opacity=".8"/>${labText(X(v),lineY(labels.length-1)+75,v,{anchor:'middle'})}`).join('');
 const allmedian=labQuantile(all.map(r=>Number(r.overall_score)),.5);
 let markings=`<line x1="${X(allmedian)}" x2="${X(allmedian)}" y1="105" y2="${lineY(labels.length-1)+36}" stroke="${labColor.gold}" stroke-dasharray="5 6" stroke-width="1.3" opacity=".9"/>${labText(Math.min(X(allmedian)+8,940),99,`总样本中位数 ${labFix(allmedian,2)}`,{size:12,color:labColor.gold})}`;
 const rowResults=[];
 for(let i=0;i<grouped.length;i++){
   const {label,rows}=grouped[i],scores=rows.map(r=>Number(r.overall_score)),q1=labQuantile(scores,.25),median=labQuantile(scores,.5),q3=labQuantile(scores,.75),mn=Math.min(...scores),mx=Math.max(...scores),y=lineY(i),selected=rows.find(r=>r.id===C);
   markings+=`${labText(x0-24,y+5,label,{anchor:'end',size:14,color:'#e8f2f6',weight:'700'})}${labText(x0-24,y+23,`n=${scores.length}`,{anchor:'end',size:11})}`+
   `<line x1="${X(mn)}" x2="${X(mx)}" y1="${y}" y2="${y}" stroke="#75a8bf" stroke-width="2"/>`+
   `<line x1="${X(mn)}" x2="${X(mn)}" y1="${y-10}" y2="${y+10}" stroke="#75a8bf" stroke-width="2"/><line x1="${X(mx)}" x2="${X(mx)}" y1="${y-10}" y2="${y+10}" stroke="#75a8bf" stroke-width="2"/>`+
   `<rect x="${X(q1)}" y="${y-15}" width="${Math.max(2,X(q3)-X(q1))}" height="30" rx="2" fill="rgba(81,161,180,.56)" stroke="#8fd4de"/><line x1="${X(median)}" x2="${X(median)}" y1="${y-16}" y2="${y+16}" stroke="#f4faff" stroke-width="3"/>${labText(Math.min(x1-20,X(median)+8),y-22,labFix(median,2),{size:12,color:labColor.cyan})}`;
   if(selected)markings+=`<circle cx="${X(Number(selected.overall_score))}" cy="${y}" r="7" fill="${labColor.gold}" stroke="#071724" stroke-width="2"><title>${labEsc(C)}；综合分 ${labFix(Number(selected.overall_score),3)}</title></circle>`;
   rowResults.push({label,n:rows.length,min:mn,q1,median,q3,max:mx});
 }
 const svg=labSvg(labFrame('FIG 07','合成企业画像 · 评分分布异质性',`${Y} 年 · n=${all.length} · 四类预设合成经营画像 · 箱体为 Q1—Q3；横杠为中位数`,ticks+markings+labText(625,lineY(labels.length-1)+103,'冻结综合评分 / 100',{anchor:'middle',size:13})),1100,Math.max(490,lineY(labels.length-1)+130),'合成企业画像分组评分箱线比较');
 const chosen=grouped.find(x=>x.rows.some(r=>r.id===C));
 return {svg,title:'不同仿真经营画像的评分异质性',desc:`${Y} 年共 ${all.length} 家；选中企业 ${C} 属于「${chosen?.label||'未识别'}」。全部样本中位数 ${labFix(allmedian,2)}；图中使用四类预设合成画像及其完整分布。`,method:'按生成器预设的合成画像分组；使用当前年度冻结综合评分，计算每组 min/Q1/中位数/Q3/max。没有进行任何显著性检验、因果识别或独立真实行业代表性宣称。',
 csv:labCSV([['company_id','year','synthetic_archetype','frozen_overall_score','is_current_company'],...all.map(r=>[r.id,Y,r.archetype,+r.overall_score,r.id===C?1:0])]),rows:all.length,metrics:{cohorts:rowResults,allmedian}};
}
function labPreferenceSweep(){
 if(Number(get().year)!==2022)return labEmpty('偏好敏感性仅支持已验证的2022年情景；请在页面顶部切换到2022年。');
 const candidates=(A?.candidates||[]).filter(x=>x.company_id===C&&x.case===CASE&&labFinite(x.total_action_cost)&&labFinite(x.score_delta));
 const n=candidates.length;
 if(!n)return labEmpty(`当前企业 ${C} / ${CASE} 无冻结可行候选；仅三家虚构企业的2022情景已验证。`);
 const costs=candidates.map(x=>Number(x.total_action_cost)),scores=candidates.map(x=>Number(x.score_delta));
 const cmin=Math.min(...costs),cmax=Math.max(...costs),smin=Math.min(...scores),smax=Math.max(...scores),cd=cmax-cmin,sd=smax-smin;
 const choices=[];
 for(let step=0;step<=40;step++){
   const lambda=step/40;
   let winner=null,best=-Infinity;
   for(const x of candidates){
     const sn=sd>1e-10?(Number(x.score_delta)-smin)/sd:1;
     const cn=cd>1e-10?(cmax-Number(x.total_action_cost))/cd:1;
     const utility=lambda*sn+(1-lambda)*cn;
     if(utility>best+1e-12 || (Math.abs(utility-best)<=1e-12 && (!winner || String(x.decision_id)<String(winner.decision_id)))){winner=x;best=utility;}
   }
   choices.push({lambda,choice:winner,utility:best});
 }
 const counts=new Map();for(const row of choices)counts.set(row.choice.decision_id,(counts.get(row.choice.decision_id)||0)+1);
 const unique=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const selected=candidates.find(x=>x.decision_id===LAB_PREF_PICK)||choices[20].choice;LAB_PREF_PICK=selected.decision_id;
 const X=l=>labScale(l,0,1,99,1019),Y=v=>labScale(v,0,1,367,126);
 const axis=[0,.25,.5,.75,1].map(v=>`<line x1="${X(v)}" y1="126" x2="${X(v)}" y2="367" stroke="${labColor.grid}"/><line x1="99" y1="${Y(v)}" x2="1019" y2="${Y(v)}" stroke="${labColor.grid}"/>${labText(X(v),394,labFix(v,2),{anchor:'middle'})}${labText(84,Y(v)+5,labFix(v,2),{anchor:'end'})}`).join('');
 const sn=x=>sd>1e-10?(Number(x.score_delta)-smin)/sd:1,cn=x=>cd>1e-10?(cmax-Number(x.total_action_cost))/cd:1;
 const path=key=>choices.map((row,i)=>`${i?'L':'M'}${labXY(X(row.lambda),Y(key==='score'?sn(row.choice):cn(row.choice)),2)}`).join(' ');
 const marks=choices.map(row=>`<circle class="lab-pref-choice" data-decision="${labEsc(row.choice.decision_id)}" cx="${X(row.lambda)}" cy="${Y(sn(row.choice))}" r="${row.choice.decision_id===selected.decision_id?6:3.7}" fill="${row.choice.decision_id===selected.decision_id?labColor.gold:labColor.cyan}" stroke="#092434" stroke-width="1"><title>偏好 λ=${labFix(row.lambda,3)}；胜出 ${labEsc(row.choice.decision_id)}；得分变化 ${labFix(Number(row.choice.score_delta),3)}；成本 ${labFix(Number(row.choice.total_action_cost),2)}万</title></circle>`).join('');
 const guide=labText(100,88,`得分权重 λ: 0=只关注低成本，1=只关注高得分；权重步长 0.025（41 次）`,{size:12})+labText(100,109,`共 ${unique.length} 个不同胜出方案 · 当前选中 ${labEsc(selected.decision_id).slice(0,22)} · 轮换频率不是概率`,{size:12,color:labColor.gold});
 const legend=labText(99,436,'蓝线/点 = 选中方案归一化得分改善', {size:12,color:labColor.cyan})+labText(560,436,'金线 = 选中方案的归一化低成本偏好值',{size:12,color:labColor.gold})+labText(559,413,'得分权重 λ',{size:13,anchor:'middle'});
 const svg=labSvg(labFrame('FIG 08','行动方案的成本—收益偏好敏感性',`${C} / ${CASE} · 2022年 · 全部冻结可行候选 n=${n} · 41 组确定性偏好权重`,axis+guide+`<path d="${path('score')}" fill="none" stroke="${labColor.cyan}" stroke-width="2.8"/><path d="${path('cost')}" fill="none" stroke="${labColor.gold}" stroke-width="2.2" stroke-dasharray="6 4"/>${marks}${legend}`),1100,465,'成本收益偏好权重扫描与胜出方案切换');
 const high=unique.slice(0,4).map(([id,num])=>`${id.slice(0,13)}…：${num}/41`).join('；');
 return {svg,title:'方案推荐对管理偏好的敏感性',desc:`在 ${n} 个已通过原约束的候选中，遍历41组成本/评分偏好，共 ${unique.length} 个不同方案成为线性效用最优。代表方案的胜出次数：${high}。这是离散权重扫描，不是发生概率。`,method:'用同一候选集合内的最小—最大值分别归一化“得分变化越大越好”和“行动成本越低越好”，对 λ∈{0,.025,...,1} 选取最大加权效用方案，按方案ID处理同效用平局。只检验两项偏好，不改变原优化器的财务约束。',
 csv:labCSV([['company_id','case','n_feasible','score_preference_weight_lambda','cost_preference_weight','winning_decision_id','score_delta','total_action_cost_10kCNY','cash_headroom_10kCNY','normalized_score_benefit','normalized_low_cost_benefit','weighted_utility'],...choices.map(x=>[C,CASE,n,x.lambda,1-x.lambda,x.choice.decision_id,x.choice.score_delta,x.choice.total_action_cost,x.choice.cash_headroom,sn(x.choice),cn(x.choice),x.utility])]),rows:choices.length,selected};
}
