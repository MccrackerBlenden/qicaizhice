'use strict';
// v0.7: provenance-aware research figures; all figures computed from existing frozen synthetic data.
let LAB_FIG='ecdf',LAB_PAIR=[0,1],LAB_WINDOW=2020,LAB_PICK=null,LAB_CANDIDATES=[],LAB_CURRENT=null;
const LAB_TABS=[['ecdf','01 · 分布与位置'],['correlation','02 · 相关矩阵'],['flow','03 · 状态迁移流'],['dupont','04 · 杜邦分解'],['pareto','05 · Pareto 前沿'],['weights','06 · 权重稳健性'],['cohorts','07 · 群组异质性'],['preference','08 · 偏好敏感性'],['rankaccept','09 · 联合排名'],['pairspace','10 · 双维稳定域'],['simplex','11 · 三目标区域'],['stress','12 · 扰动来源分解'],['regret','13 · 方案遗憾分析']];
const LAB_PAPERS={
 stress:['交叉情景的排名方差恒等式','平衡两因素有限情景：权重偏好×假设性评分压力；按总方差分解主效应和交互项。','评分压力为人为指定的均匀分布，不能解释为真实测量误差；不能称经验不确定性、置信度或因果归因。','https://doi.org/10.1787/9789264043466-en','OECD / EC-JRC (2008), Handbook on Constructing Composite Indicators'],
 regret:['多目标偏好空间的效用遗憾','对所有已审计可行候选，遍历91组评分、低成本和现金偏好组合，并计算相对于每种偏好最优解的效用差。','效用已归一化、偏好格网为人为设定；遗憾值不是货币损失、企业未来风险或实际偏好概率。','https://doi.org/10.1287/opre.49.3.444.11220','Lahdelma & Salminen (2001), SMAA-2 — method background'],
 ecdf:['经验分布与稳健定位','F_n(x) = (1/n)Σ1(score≤x)；完整展示所选年度328家合成企业，不把样本位置解释为真实行业分位。','样本内描述统计，无置信区间、显著性或现实市场代表性。','https://doi.org/10.1111/cgf.12931','Ko et al. (2016), Computer Graphics Forum'],
 correlation:['多变量关联探索','六维冻结评分的 Pearson 样本相关系数；相关矩阵与被选维度散点使用同一328个企业年度。','六维来自同一评价体系，可能存在共同构造因素；相关不代表因果或独立解释能力。','https://doi.org/10.1016/j.gvc.2020.200013','Steed et al. (2020), Graphics and Visual Computing'],
 flow:['状态分布与历史迁移','逐企业连接相邻年份的 S1/S2 冻结状态，带宽按真实配对记录数确定。','仅为合成样本历史状态描述；不构成未来转移概率或个人企业预测。','https://doi.org/10.1111/cgf.14856','动态图可视化综述, Computer Graphics Forum'],
 dupont:['财务恒等式的变化分解','ROE=净利润/期末权益=净利率×资产周转率×权益乘数。对三个乘数的所有6种替换顺序取平均（Shapley-style）。','期末余额简化口径，不是平均权益ROE；“贡献”是代数分解，不代表管理动作的因果效应。','https://doi.org/10.2308/ISSUES-2023-109','Hoag et al. (2025), Issues in Accounting Education'],
 weights:['六维权重扰动与排名稳健性','从16项冻结指标权重汇总六维权重，对已冻结六维评分重新构造诊断指数，并对某一维度实施单因素权重扰动。','这不是原16指标重新标准化与完整评价重训；排名仅限2020—2022合成同年样本，系模型稳健性情景实验。','https://doi.org/10.1016/j.procs.2024.09.231','Procedia Computer Science (2024), Comparative Sensitivity Analysis in MCDA'],
 cohorts:['企业异质性与组内分布','按合成生成器已声明的四种画像分组，报告各组箱线分位数、极差与样本数；不对人工设定组标签作独立性或显著性因果推断。','合成群组差异源于生成机制；这是一项仿真数据分布诊断，不是医药行业异质性的实证发现。','https://doi.org/10.1002/mcda.70006','Azzini & Munda (2025), Sensitivity and Robustness Analyses'],
 preference:['目标偏好切换与方案稳健性','在给定企业、情景已验算的冻结可行候选上，用成本/得分极差归一化，并遍历41个确定性偏好权重，寻找各权重下最大线性效用的方案。','这是既有候选的偏好后验分析，而非重新执行优化模型、未来概率预测或完整四目标最优；遍历比例不等于概率。','https://doi.org/10.1016/j.dajour.2025.100642','Decision Analytics Journal (2025), Full-Range Weight Sensitivity Analysis'],
 rankaccept:['多维联合权重空间的排名接受度','在六维重构指数中分别为六个维度设置可复现的权重扰动，观察在指定采样假设下名次如何分布。','仅反映所选均匀乘子与固定种子的情景频数，不是原16项模型重训、统计置信区间或现实企业排名概率。','https://doi.org/10.1287/opre.49.3.444.11220','Lahdelma & Salminen (2001), SMAA-2, Operations Research'],
 pairspace:['双因素联合扰动的稳定域','在两个评价维度的权重平面上做确定性格网扫描，并对全部328家合成企业重新排序。','二维区域反映给定重构指数的偏好假设，不能表示抽样不确定性的可信区域或因果影响。','https://doi.org/10.1016/j.asoc.2025.114335','Applied Soft Computing (2026), MCDA robustness framework'],
 simplex:['三目标偏好空间的决策稳定域','在已验算可行方案上，以得分、成本、现金余量的归一化线性效用扫描三角单纯形中的全部偏好格元。','区域比例仅是网格面积近似，不是选择概率；不重新运行优化模型也不改变预设财务约束。','https://doi.org/10.1016/j.ejor.2005.12.037','Tervonen & Lahdelma (2007), Implementing SMAA'],
 pareto:['成本—得分双目标决策','从预先计算并核验的可行候选中，筛出在“成本越小越好、综合分变化越大越好”意义下的非支配点。','仅是选定企业/情景下两个目标的投影；现金/杠杆等其他财务护栏已由原模型验证，但不代表全部多目标最优。','https://www.ijcai.org/proceedings/2023/755','Osika et al. (2023), IJCAI 多目标决策综述']
};
const labFinite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const labNum=(v,d=0)=>labFinite(v)?Number(v):d;
const labFix=(v,n=2)=>Number.isFinite(v)?Number(v).toFixed(n):'—';
const labEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labXY=(x,y,s=1)=>[Number(x).toFixed(s),Number(y).toFixed(s)].join(',');
const labColor={cyan:'#87dceb',gold:'#dfbd7d',muted:'#9eb8c7',grid:'#2c495b',red:'#e5959b',green:'#82d2b8'};
function labSvg(inner,width=1100,height=440,label='科研图谱'){
 return `<svg class="research-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${labEsc(label)}"><title>${labEsc(label)}</title><rect width="${width}" height="${height}" fill="#0b1d2c"/>${inner}</svg>`;
}
function labText(x,y,t,opts={}){const {size=13,color=labColor.muted,anchor='start',weight='400'}=opts;return `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial,'Microsoft YaHei',sans-serif" text-anchor="${anchor}" font-weight="${weight}" fill="${color}">${labEsc(t)}</text>`}
function labScale(n,a,b,x,y){return (n-a)/(b-a||1)*(y-x)+x}
function labNiceRange(min,max){const span=max-min||1;return [Math.min(0,min-span*.08),max+span*.1]}
function labQuantile(arr,p){const s=[...arr].sort((a,b)=>a-b);if(!s.length)return NaN;const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo)}
function labCSV(rows){const encode=v=>{if(v===null||v===undefined)return '""';if(typeof v==='number'&&Number.isFinite(v))return String(v);let str=String(v);if(/^[=+\-@\t\r]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"'};return '\ufeff'+rows.map(r=>r.map(encode).join(',')).join('\r\n')+'\r\n'}
function labFrame(figNo,title,sub,content,foot=''){
 return `${labText(48,37,figNo+' / '+title,{size:19,color:'#eaf6fa',weight:'700'})}${labText(48,60,sub,{size:12})}${content}`
}
function labECDF(){
 const rows=each(Y).filter(x=>labFinite(x.overall_score));const scores=rows.map(x=>+x.overall_score).sort((a,b)=>a-b),N=scores.length,point=get();
 if(!N)return labEmpty('经验分布缺少可用评分');
 const X=x=>labScale(x,0,100,83,1032),F=y=>labScale(y,0,1,372,92);
 let path=`M${X(0)} ${F(0)}`;let prev=0;
 for(let i=0;i<N;){const value=scores[i];let j=i+1;while(j<N&&scores[j]===value)j++;path+=` L${X(value)} ${F(prev/N)} L${X(value)} ${F(j/N)}`;prev=j;i=j}
 path+=` L${X(100)} ${F(1)}`;
 const ticks=[0,20,40,60,80,100].map(v=>`<line x1="${X(v)}" y1="${F(0)}" x2="${X(v)}" y2="${F(1)}" stroke="${labColor.grid}" opacity=".5"/>${labText(X(v),397,v,{anchor:'middle',size:12})}`).join('');
 const ys=[0,.25,.5,.75,1].map(v=>`<line x1="${X(0)}" y1="${F(v)}" x2="${X(100)}" y2="${F(v)}" stroke="${labColor.grid}" opacity=".65"/>${labText(70,F(v)+5,(v*100)+'%',{anchor:'end'})}`).join('');
 const score=+point.overall_score,lessOrEqual=scores.filter(x=>x<=score).length;const pctval=lessOrEqual/N;const quartiles=[.25,.5,.75].map((p,i)=>{const x=labQuantile(scores,p);return `<line x1="${X(x)}" y1="${F(0)}" x2="${X(x)}" y2="${F(1)}" stroke="${labColor.gold}" stroke-width="1.3" stroke-dasharray="5 7" opacity=".5"/>${labText(X(x),85,'Q'+(i+1)+' '+labFix(x,1),{anchor:'middle',size:11,color:labColor.gold})}`}).join('');
 const content=`${ticks}${ys}${quartiles}<path d="${path}" fill="none" stroke="${labColor.cyan}" stroke-width="3" stroke-linejoin="round"/>`+
 `<line x1="${X(score)}" x2="${X(score)}" y1="${F(0)}" y2="${F(pctval)}" stroke="${labColor.gold}" stroke-width="2.2" stroke-dasharray="6 5"/><circle cx="${X(score)}" cy="${F(pctval)}" r="7" stroke="#071724" stroke-width="2" fill="${labColor.gold}"/>${labText(Math.min(980,Math.max(135,X(score)+15)),F(pctval)-14,`选中 ${labFix(score,2)} 分 / Fₙ=${labFix(pctval*100,1)}%`,{size:14,color:labColor.gold,weight:'700'})}`+
 labText(520,416,'综合评价分数 / 100',{anchor:'middle',size:13});
 const svg=labSvg(labFrame('FIG 01','经验累计分布 ECDF',`${Y} 年 · 完整合成样本 n=${N} · 黄色为 ${C}`,content,'统计量来自冻结评价；非真实行业分位、非预测置信区间'),1100,450,'冻结评分经验累计分布');
 return {svg,title:'评分分布与企业相对位置',desc:`当前 ${C} 得分 ${labFix(score,2)}；样本中有 ${lessOrEqual}/${N} 家评分不高于该值。Q1=${labFix(labQuantile(scores,.25),2)}，中位=${labFix(labQuantile(scores,.5),2)}，Q3=${labFix(labQuantile(scores,.75),2)}。`,method:'经验分布函数 Fₙ(x)=样本中分数≤x的个数/n；分位数采用线性插值。',csv:labCSV([['company_id','year','overall_score','state_id'],...rows.map(r=>[r.id,Y,+r.overall_score,r.state_id])]),rows:N};
}
function labPearson(xs,ys){const n=xs.length;if(n<3)return NaN;const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let cov=0,vx=0,vy=0;for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;cov+=dx*dy;vx+=dx*dx;vy+=dy*dy}return vx>1e-12&&vy>1e-12?cov/Math.sqrt(vx*vy):NaN}
function labCorr(){
 const rows=each(Y),cols=dims,full=rows.filter(r=>cols.every(([key])=>labFinite(r[key]))),N=full.length;
 if(!N)return labEmpty('六维评分没有完整数据');
 const topX=146,topY=107,cell=62,scale=Math.min(1,N/328);
 const pairs=[];for(let i=0;i<6;i++)for(let j=0;j<6;j++){const r=labPearson(full.map(x=>Number(x[cols[i][0]])),full.map(x=>Number(x[cols[j][0]])));pairs.push({i,j,r})}
 const heat=pairs.map(({i,j,r})=>{const t=(r+1)/2,red=[200,112,127],neutral=[28,51,70],cyan=[77,164,180];const interp=(a,b,k)=>Math.round(a+(b-a)*k);const rgb=t<.5?red.map((v,k)=>interp(v,neutral[k],t*2)):neutral.map((v,k)=>interp(v,cyan[k],(t-.5)*2));let color=`rgb(${rgb.join(',')})`;return `<rect class="lab-corr-cell" data-i="${i}" data-j="${j}" x="${topX+j*cell}" y="${topY+i*cell}" width="60" height="60" rx="2" fill="${color}" stroke="rgba(166,215,226,.12)"><title>${labEsc(cols[i][1]+' / '+cols[j][1]+': r='+labFix(r,3))}</title></rect>${labText(topX+j*cell+30,topY+i*cell+35,labFix(r,2),{anchor:'middle',size:13,color:'#f3f9fb',weight:'700'})}`}).join('');
 const labels=cols.map(([,name],i)=>labText(topX+i*cell+30,topY-13,name,{anchor:'middle',size:11} )+labText(topX-16,topY+i*cell+35,name,{anchor:'end',size:12})).join('');
 const [pi,pj]=LAB_PAIR;const vx=cols[pi][0],vy=cols[pj][0];const x0=640,x1=1032,y0=408,y1=120;
 const X=v=>labScale(v,0,100,x0,x1), Z=v=>labScale(v,0,100,y0,y1);
 const scatter=full.map(r=>`<circle cx="${X(Number(r[vx]))}" cy="${Z(Number(r[vy]))}" r="2.6" fill="${labColor.cyan}" opacity=".36"><title>${labEsc(r.id)}：${labFix(Number(r[vx]),2)} / ${labFix(Number(r[vy]),2)}</title></circle>`).join('');
 const selected=get(),sx=X(Number(selected[vx])),sy=Z(Number(selected[vy]));
 const grid=[0,25,50,75,100].map(v=>`<line x1="${X(v)}" y1="${y1}" x2="${X(v)}" y2="${y0}" stroke="${labColor.grid}"/>${labText(X(v),428,v,{anchor:'middle',size:11})}<line x1="${x0}" y1="${Z(v)}" x2="${x1}" y2="${Z(v)}" stroke="${labColor.grid}"/>${labText(x0-10,Z(v)+4,v,{anchor:'end',size:11})}`).join('');
 const r=labPearson(full.map(x=>Number(x[vx])),full.map(x=>Number(x[vy])));
 const svg=labSvg(labFrame('FIG 02','六维相关性 · 联动散点',`${Y} 年 · 成对完整样本 n=${N} · 点击左侧矩阵单元切换右侧变量`,`${labels}${heat}${grid}${scatter}<circle cx="${sx}" cy="${sy}" r="7" stroke="#081622" stroke-width="2" fill="${labColor.gold}"/><text x="${x0}" y="${y1-8}" font-size="14" font-family="Arial" fill="${labColor.gold}">r = ${labFix(r,3)}</text>${labText((x0+x1)/2,446,cols[pi][1],{anchor:'middle',size:12})}${labText(x0,97,cols[pj][1]+' (纵轴)',{size:12})}`),1100,475,'六维相关热力图与散点联动');
 return {svg,title:'六维评分之间的样本关联',desc:`选中：${cols[pi][1]} × ${cols[pj][1]}；Pearson r=${labFix(r,3)}，有效样本 ${N}。点击热力图中任一单元，可切换散点横纵维度。`,method:'r = Σ(x−x̄)(y−ȳ) / √[Σ(x−x̄)²·Σ(y−ȳ)²]；不推断显著性或因果性。',csv:labCSV([['company_id','year',...cols.map(x=>x[0])],...full.map(r=>[r.id,Y,...cols.map(x=>Number(r[x[0]]))])]),rows:N};
}
function labFlow(){
 const from=LAB_WINDOW,to=from+1,comps=D.companies,seq=[];
 for(const c of comps){const a=get(c.id,from),b=get(c.id,to);if(a&&b&&['S1','S2'].includes(a.state_id)&&['S1','S2'].includes(b.state_id))seq.push([c.id,a.state_id,b.state_id]);}
 const N=seq.length;if(!N)return labEmpty('没有配对状态数据');
 const st=['S1','S2'],cnt=(a,b)=>seq.filter(x=>x[1]===a&&x[2]===b).length;
 const left=Object.fromEntries(st.map(s=>[s,seq.filter(x=>x[1]===s).length])),right=Object.fromEntries(st.map(s=>[s,seq.filter(x=>x[2]===s).length]));
 const chartTop=117,chartHeight=277,spacing=22,usable=chartHeight-spacing,unit=usable/N;
 const starts={S1:chartTop,S2:chartTop+left.S1*unit+spacing},targets={S1:chartTop,S2:chartTop+right.S1*unit+spacing};
 const colors={S1:'#7ed8e7',S2:'#dabb81'};
 const flows=[];let srcOffset={S1:0,S2:0},tgtOffset={S1:0,S2:0};
 for(const a of st)for(const b of st){const n=cnt(a,b),th=n*unit;if(!n)continue;const ya=starts[a]+srcOffset[a],yb=targets[b]+tgtOffset[b],x0=180,x1=880;srcOffset[a]+=th;tgtOffset[b]+=th;let d=`M${x0},${ya} C430,${ya} 630,${yb} ${x1},${yb} L${x1},${yb+th} C630,${yb+th} 430,${ya+th} ${x0},${ya+th} Z`;flows.push(`<path d="${d}" fill="${colors[a]}" fill-opacity="${a===b?'.42':'.64'}" stroke="${colors[a]}" stroke-opacity=".20"><title>${a}→${b}：${n}/${N}</title></path>`)}
 const bars=st.map(s=>`<rect x="160" y="${starts[s]}" width="20" height="${left[s]*unit}" fill="${colors[s]}"/><rect x="880" y="${targets[s]}" width="20" height="${right[s]*unit}" fill="${colors[s]}"/>${labText(147,starts[s]+left[s]*unit/2,s+' · '+left[s]+'家',{size:14,color:colors[s],anchor:'end',weight:'700'})}${labText(918,targets[s]+right[s]*unit/2,s+' · '+right[s]+'家',{size:14,color:colors[s],weight:'700'})}`).join('');
 const cross=cnt('S1','S2')+cnt('S2','S1');
 const subtitle=`${from} → ${to} · n=${N} 对企业年度 · 变化 ${cross} / ${N} (${labFix(cross/N*100,1)}%)`;
 const svg=labSvg(labFrame('FIG 03','财务状态年度流向 Alluvial',subtitle,flows.join('')+bars+labText(170,425,`${from} 年冻结状态`,{size:13})+labText(882,425,`${to} 年冻结状态`,{size:13}), '连线宽度=配对样本数；S1/S2 仅为合成数据冻结聚类标签'),1100,470,'S1 S2 历史状态流向');
 return {svg,title:'同一家企业在相邻年度的状态变化',desc:`${from}→${to}：S1→S2 有 ${cnt('S1','S2')} 家，S2→S1 有 ${cnt('S2','S1')} 家；稳定 ${N-cross} 家，发生变化 ${cross} 家。`,method:'仅对有两个相邻年份状态的企业做一对一连接。图宽按配对数量成比例编码，不视为未来预测。',csv:labCSV([['company_id','from_year','to_year','from_state','to_state'],...seq.map(v=>[v[0],from,to,v[1],v[2]])]),rows:N};
}
function labDuPont(){
 const a=get(C,Y-1),b=get(C,Y);
 if(!a||!b)return labEmpty('当前年份缺少相邻期三表');
 const factor=r=>[r.net_income/r.revenue,r.revenue/r.total_assets,r.total_assets/r.total_equity];
 for(const r of [a,b])if(!['net_income','revenue','total_assets','total_equity'].every(k=>labFinite(r[k]))||r.revenue<=0||r.total_assets<=0||r.total_equity<=0)return labEmpty('当前企业不满足杜邦分解的分母条件');
 const start=factor(a),end=factor(b),orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],mul=v=>v.reduce((x,y)=>x*y,1),contrib=[0,0,0];
 for(const order of orders){const vals=[...start];for(const idx of order){const before=mul(vals);vals[idx]=end[idx];contrib[idx]+=(mul(vals)-before)/6}}
 const base=mul(start)*100,now=mul(end)*100,delta=contrib.map(x=>x*100),steps=[base,base+delta[0],base+delta[0]+delta[1],now];
 const all=[0,...steps],low=Math.min(...all),high=Math.max(...all),margin=(high-low||1)*.15,min=low-margin,max=high+margin;
 const yy=v=>labScale(v,min,max,384,93),xs=[145,335,525,715,905],bw=92;
 const ticks=[0,.25,.5,.75,1].map(t=>{const value=min+(max-min)*t;return `<line x1="86" x2="1030" y1="${yy(value)}" y2="${yy(value)}" stroke="${labColor.grid}" opacity=".58"/>${labText(77,yy(value)+4,labFix(value,1)+'%',{anchor:'end',size:11})}`}).join('');
 const labels=['上期 ROE','净利率贡献','资产周转贡献','权益乘数贡献','本期 ROE'];
 const vals=[{a:0,b:base,anchor:true},{a:steps[0],b:steps[1],chg:delta[0]},{a:steps[1],b:steps[2],chg:delta[1]},{a:steps[2],b:steps[3],chg:delta[2]},{a:0,b:now,anchor:true}];
 const bars=vals.map((v,i)=>{const top=Math.min(yy(v.a),yy(v.b)),bottom=Math.max(yy(v.a),yy(v.b)),fill=v.anchor?'#557b94':v.chg>=0?labColor.green:labColor.red;const value=v.anchor?labFix(v.b,2)+'%':(v.chg>=0?'+':'')+labFix(v.chg,2)+'pp';return `<rect x="${xs[i]}" y="${top}" width="${bw}" height="${Math.max(2,bottom-top)}" rx="1" fill="${fill}" opacity=".9"/><text x="${xs[i]+bw/2}" y="${Math.max(72,top-10)}" text-anchor="middle" fill="#e5f1f4" font-weight="700" font-size="15">${labEsc(value)}</text>${labText(xs[i]+bw/2,407,labels[i],{anchor:'middle',size:12})}`}).join('');
 const connectors=[0,1,2].map((i)=>`<line x1="${xs[i]+bw}" x2="${xs[i+1]}" y1="${yy(steps[i])}" y2="${yy(steps[i])}" stroke="${labColor.muted}" stroke-dasharray="4 4" opacity=".65"/>`).join('');
 const residual=(base+delta.reduce((x,y)=>x+y,0)-now);
 const svg=labSvg(labFrame('FIG 04','杜邦三因素 · Shapley 平均顺序归因',`${C} · ${Y-1} → ${Y} 年 · 变化 ${labFix(now-base,2)} 个百分点 · 代数闭合残差 ${labFix(residual,8)} pp`,`${ticks}${connectors}${bars}`, '基于期末权益口径的ROE变化桥接；非经营措施的因果效应'),1100,460,'杜邦ROE三因素Shapley变化分解');
 const components=[['净利率',start[0],end[0],delta[0]],['资产周转率',start[1],end[1],delta[1]],['权益乘数',start[2],end[2],delta[2]]];
 return {svg,title:'ROE 变化的代数来源',desc:`ROE ${labFix(base,2)}% → ${labFix(now,2)}%（差额 ${labFix(now-base,2)} pp）。三因素贡献之和与差额的绝对残差 ${labFix(Math.abs(residual),9)} pp。`,method:'六种因子替换顺序平均分摊乘积变化；采用净利润÷期末所有者权益的简化ROE口径，非因果归因。',csv:labCSV([['factor','previous','current','change_contribution_pp'],...components,['ROE_simple',base,now,now-base],['reconciliation_residual_pp',null,null,residual]]),rows:3};
}
function labPareto(){
 const subset=(A?.candidates||[]).filter(x=>x.company_id===C&&x.case===CASE&&labFinite(x.score_delta)&&labFinite(x.total_action_cost));LAB_CANDIDATES=subset;
 if(!subset.length)return labEmpty(`当前 ${C} / ${CASE} 没有经过冻结审计的可行候选。可在页面顶部切换企业；本模块只支持三家 2022 年。`);
 const ordered=[...subset].sort((a,b)=>a.total_action_cost-b.total_action_cost||b.score_delta-a.score_delta);
 let maxSeen=-Infinity,pareto=[];
 for(const x of ordered){if(x.score_delta>maxSeen+1e-9){pareto.push(x);maxSeen=x.score_delta}}
 const N=subset.length,maxCost=Math.max(...subset.map(x=>x.total_action_cost)),minScore=Math.min(...subset.map(x=>x.score_delta)),maxScore=Math.max(...subset.map(x=>x.score_delta));
 const x0=93,x1=1024,y0=378,y1=102,X=c=>labScale(c,0,Math.max(1,maxCost),x0,x1),Yf=s=>labScale(s,Math.min(0,minScore),Math.max(.01,maxScore)+(maxScore-minScore||1)*.08,y0,y1);
 const samples=ordered.filter((r,i)=>i%Math.max(1,Math.ceil(N/320))===0),pick=subset.find(x=>x.decision_id===LAB_PICK)||pareto[Math.min(1,pareto.length-1)]||ordered[0]; LAB_PICK=pick.decision_id;
 const grid=[0,.25,.5,.75,1].map(t=>{const cost=maxCost*t,sc=(Math.min(0,minScore)+(Math.max(.01,maxScore)+(maxScore-minScore||1)*.08-Math.min(0,minScore))*t);return `<line x1="${X(cost)}" x2="${X(cost)}" y1="${y1}" y2="${y0}" stroke="${labColor.grid}"/>${labText(X(cost),404,labFix(cost,0),{anchor:'middle',size:11})}<line x1="${x0}" x2="${x1}" y1="${Yf(sc)}" y2="${Yf(sc)}" stroke="${labColor.grid}"/>${labText(x0-14,Yf(sc)+4,labFix(sc,1),{anchor:'end',size:11})}`}).join('');
 const front=pareto.map((r,i)=>`${i?'L':'M'}${labXY(X(r.total_action_cost),Yf(r.score_delta))}`).join(' ');
 const marks=samples.map(r=>`<circle cx="${X(r.total_action_cost)}" cy="${Yf(r.score_delta)}" r="3.2" fill="${labColor.cyan}" opacity=".43"><title>${labEsc(r.decision_id)}; 成本${labFix(r.total_action_cost,1)}万, 提升${labFix(r.score_delta,3)}分</title></circle>`).join('');
 const frontmarks=pareto.map((r)=>`<circle class="lab-candidate" data-index="${subset.indexOf(r)}" cx="${X(r.total_action_cost)}" cy="${Yf(r.score_delta)}" r="5" fill="${labColor.gold}" stroke="#112a39" stroke-width="1"><title>非支配 · ${labFix(r.total_action_cost,1)}万 / +${labFix(r.score_delta,3)}分，点击查看</title></circle>`).join('');
 const svg=labSvg(labFrame('FIG 05','成本—综合得分变化 Pareto 决策前沿',`${C} / ${CASE} · 2022 · 冻结可行候选 n=${N} · 前沿代表点 ${pareto.length}`,grid+marks+`<path d="${front}" fill="none" stroke="${labColor.gold}" stroke-width="2.6"/>${frontmarks}<circle cx="${X(pick.total_action_cost)}" cy="${Yf(pick.score_delta)}" r="9" fill="none" stroke="#fff" stroke-width="2"/>${labText(560,437,'行动成本 / 万元',{anchor:'middle',size:13})}${labText(93,85,'综合评分变化 / 分',{size:13})}`, '浅青点为最多320个等间距取样；前沿用完整候选集计算，黄点可点击'),1100,465,'成本收益Pareto决策前沿');
 return {svg,title:'方案之间的成本—收益权衡',desc:`${N} 个可行候选中，该二维投影有 ${pareto.length} 个非支配代表点。当前选中方案：成本 ${labFix(pick.total_action_cost,2)} 万元，分数变化 ${labFix(pick.score_delta,3)} 分，现金余量 ${labFix(pick.cash_headroom,2)} 万元。`,method:'非支配定义：不存在另一方案同时成本≤且评分提升≥，并至少一项严格改善。若相同坐标有多个候选，前沿只画一组代表点。',csv:labCSV([['company_id','case','decision_id','total_action_cost_10kCNY','score_delta','cash_headroom_10kCNY','debt_to_assets','frontier_representative'],...subset.map(x=>[x.company_id,x.case,x.decision_id,x.total_action_cost,x.score_delta,x.cash_headroom,x.debt_to_assets,pareto.includes(x)?1:0])]),rows:N,selected:pick};
}
function labEmpty(message){return {title:'图谱暂不可用',desc:message,method:'此处不会使用合成占位数值。',svg:labSvg(labText(85,210,message,{size:18,color:labColor.gold}),1100,440,'无有效数据'),csv:labCSV([['status','reason'],['unsupported',message]]),rows:0}}
function renderResearchLab(){
 const figMaker={ecdf:labECDF,correlation:labCorr,flow:labFlow,dupont:labDuPont,pareto:labPareto,weights:labWeightSensitivity,cohorts:labCohortComparison,preference:labPreferenceSweep,rankaccept:labRankAcceptability,pairspace:labPairStability,simplex:labRobustSimplex,stress:labStressDecomposition,regret:labRegretComparison}[LAB_FIG]||labECDF;
 const fig=figMaker();LAB_CURRENT=fig;
 const paper=LAB_PAPERS[LAB_FIG],scope=['pareto','preference','simplex','regret'].includes(LAB_FIG)?'仅已验证2022年方案 · 当前企业和情景':'328 家虚构企业 · 所选分析年度';
 const tabs=LAB_TABS.map(([id,label])=>`<button type="button" class="lab-tab ${id===LAB_FIG?'active':''}" data-lab-fig="${id}">${label}</button>`).join('');
 const extra=LAB_FIG==='rankaccept'?`<label>联合扰动幅度 <select id="lab-joint-span" class="form-select">${[10,20,30,40,50].map(v=>`<option value="${v}" ${v===LAB_JOINT_SPAN?'selected':''}>每维 ±${v}%</option>`).join('')}</select></label>`:LAB_FIG==='pairspace'?`<label>维度 X <select class="form-select" id="lab-joint-x">${dims.map((d,i)=>`<option value="${i}" ${i===LAB_JOINT_PAIR[0]?'selected':''}>${d[1]}</option>`).join('')}</select></label><label>维度 Y <select class="form-select" id="lab-joint-y">${dims.map((d,i)=>`<option value="${i}" ${i===LAB_JOINT_PAIR[1]?'selected':''}>${d[1]}</option>`).join('')}</select></label><label>范围 <select class="form-select" id="lab-joint-span">${[10,20,30,40,50].map(v=>`<option value="${v}" ${v===LAB_JOINT_SPAN?'selected':''}>±${v}%</option>`).join('')}</select></label>`:LAB_FIG==='stress'?`<label>联合权重幅度 <select id="lab-stress-weight" class="form-select">${[10,20,30,40,50].map(v=>`<option value="${v}" ${v===LAB_JOINT_SPAN?'selected':''}>±${v}%</option>`).join('')}</select></label><label>六维评分假设压力 <select id="lab-stress-noise" class="form-select">${[0,1,2,4,6].map(v=>`<option value="${v}" ${v===LAB_SCORE_STRESS?'selected':''}>±${v} 分</option>`).join('')}</select></label>`:LAB_FIG==='regret'?`<label>候选情景 <select id="lab-case" class="form-select"><option value="conservative" ${CASE==='conservative'?'selected':''}>保守</option><option value="neutral" ${CASE==='neutral'?'selected':''}>中性</option><option value="optimistic" ${CASE==='optimistic'?'selected':''}>乐观</option></select></label>`:LAB_FIG==='weights'?`<label>权重扰动幅度 <select id="lab-weight-span" class="form-select">${[10,20,30,40,50].map(v=>`<option value="${v}" ${LAB_WEIGHT_SPAN===v?'selected':''}>±${v}% · 单因素</option>`).join('')}</select></label>`:LAB_FIG==='flow'?`<label>观察窗口 <select id="lab-flow-year" class="form-select"><option value="2020" ${LAB_WINDOW===2020?'selected':''}>2020 → 2021</option><option value="2021" ${LAB_WINDOW===2021?'selected':''}>2021 → 2022</option></select></label>`:(LAB_FIG==='pareto'||LAB_FIG==='preference'||LAB_FIG==='simplex')?`<label>候选情景 <select id="lab-case" class="form-select"><option value="conservative" ${CASE==='conservative'?'selected':''}>保守</option><option value="neutral" ${CASE==='neutral'?'selected':''}>中性</option><option value="optimistic" ${CASE==='optimistic'?'selected':''}>乐观</option></select></label>`:'';
 return `<div class="lab-hero"><div class="overline">RESEARCH-GRADE VISUAL ANALYTICS / 08</div><h2>研究图谱 · 可解释的财务视觉分析</h2><p>真实来源、可复核的数学口径、交互式图表与矢量导出。十三组图表从现有合成财报和冻结模型计算，不使用论文图片、外部公司数据或推断的置信区间。</p><div class="lab-headline"><span>13 组研究图</span><span>328 家安全仿真企业</span><span>SVG + 数据 CSV 导出</span></div></div>
 <div class="lab-tabs" role="tablist">${tabs}</div>
 <div class="lab-controls">${extra}<span class="pill">${scope}</span><button type="button" class="ghost-btn" id="lab-svg-export">导出高清 SVG ↓</button><button type="button" class="ghost-btn" id="lab-csv-export">下载源数据 CSV ↓</button><button type="button" class="ghost-btn" id="lab-html-report">生成科研分析报告 HTML ↓</button>${LAB_FIG==='regret'&&fig.gridCSV?`<button type="button" class="ghost-btn" id="lab-regret-grid-csv">导出偏好网格 CSV ↓</button>`:''}</div>
 <div class="lab-figure-card"><div class="lab-figure-heading"><span>FIG / ${LAB_TABS.find(x=>x[0]===LAB_FIG)?.[1]}</span><span>QICAI · RESEARCH VISUALIZATION</span></div><div class="lab-figure-stage" id="lab-figure-stage">${fig.svg}</div><div class="lab-figure-caption"><strong>${labEsc(fig.title)}</strong><p>${labEsc(fig.desc)}</p></div></div>
 <div class="grid2 equal">${panel('统计方法与复现口径','每图记录方法而非仅堆视觉样式',`<div class="research-method"><strong>${labEsc(paper[0])}</strong><p>${labEsc(fig.method)}</p><p>${labEsc(paper[1])}</p></div><div class="info">数据源：本地合成财务三表、固定参数的六维评分及经过约束检查的模拟候选方案；图注注明适用样本数。所有结果均来自虚构企业，不代表真实行业表现。</div>`)}${panel('解释边界与研究参考','方法借鉴不等于复现文献实验',`<div class="info">${labEsc(paper[2])}</div><div class="gridline"></div><a href="${paper[3]}" target="_blank" rel="noopener noreferrer" class="lab-paper-link">研究参考：${labEsc(paper[4])} ↗</a><div class="info" style="margin-top:12px">该文献支持图型或分析思路，不为本系统的合成结果背书；全部科研图谱均为本项目独立计算与实现。</div>` )}</div>
 ${['pareto','preference','simplex','regret'].includes(LAB_FIG)&&fig.selected?panel('当前方案的可核查字段','点击黄色前沿点可选择；支持跳转至行动中心',table(['方案','评分提升','成本/万元','现金余量/万元','负债率'],[[labEsc(fig.selected.decision_id.slice(0,36))+'…',labFix(fig.selected.score_delta,3),labFix(fig.selected.total_action_cost,2),labFix(fig.selected.cash_headroom,2),labFix(fig.selected.debt_to_assets*100,2)+'%']])+`<div class="action-row"><button type="button" id="lab-open-action" class="primary-btn">在 06 行动中心查看此方案 →</button></div>`):''}
 ${panel('图表可复现性声明','研究级展示不等于经过同行评审的实验结论',`<div class="info">输出图为与所选企业、年份、情景同步的 SVG 矢量图；配套 CSV 保存计算所依据的合成样本或方案记录。方法与限制见本页和包内 <code>RESEARCH_VISUALIZATION_METHODS.md</code>。研究使用时，应在图注说明“独立合成数据/仅演示方法”，不得改成真实行业实证。</div>`)}`;
}
function bindResearchEvents(){
 document.querySelectorAll('[data-lab-fig]').forEach(el=>el.addEventListener('click',()=>{LAB_FIG=el.dataset.labFig;LAB_PICK=null;render()}));
 document.querySelectorAll('.lab-corr-cell').forEach(el=>el.addEventListener('click',()=>{LAB_PAIR=[Number(el.dataset.i),Number(el.dataset.j)];render()}));
 document.querySelectorAll('.lab-candidate').forEach(el=>el.addEventListener('click',()=>{LAB_PICK=LAB_CANDIDATES[Number(el.dataset.index)]?.decision_id||null;render()}));
 document.getElementById('lab-weight-span')?.addEventListener('change',e=>{LAB_WEIGHT_SPAN=Number(e.target.value);render()});
 document.querySelectorAll('.lab-pref-choice').forEach(el=>el.addEventListener('click',()=>{LAB_PREF_PICK=el.dataset.decision;render()}));
 document.getElementById('lab-joint-span')?.addEventListener('change',e=>{LAB_JOINT_SPAN=Number(e.target.value);render()});
 document.getElementById('lab-joint-x')?.addEventListener('change',e=>{const k=Number(e.target.value);LAB_JOINT_PAIR[0]=k;if(LAB_JOINT_PAIR[1]===k)LAB_JOINT_PAIR[1]=(k+1)%6;render()});
 document.getElementById('lab-joint-y')?.addEventListener('change',e=>{const k=Number(e.target.value);LAB_JOINT_PAIR[1]=k;if(LAB_JOINT_PAIR[0]===k)LAB_JOINT_PAIR[0]=(k+1)%6;render()});
 document.querySelectorAll('.lab-simplex-tile').forEach(el=>el.addEventListener('click',()=>{LAB_SIMPLEX_PICK=LAB_SIMPLEX_CHOICES[Number(el.dataset.labSimplexIdx)]?.decision_id||null;render()}));
 document.getElementById('lab-flow-year')?.addEventListener('change',e=>{LAB_WINDOW=Number(e.target.value);render()});
 document.getElementById('lab-case')?.addEventListener('change',e=>{CASE=e.target.value;LAB_PICK=null;LAB_PREF_PICK=null;render()});
 document.getElementById('lab-stress-weight')?.addEventListener('change',e=>{LAB_JOINT_SPAN=Number(e.target.value);render()});
 document.getElementById('lab-stress-noise')?.addEventListener('change',e=>{LAB_SCORE_STRESS=Number(e.target.value);render()});
 document.getElementById('lab-html-report')?.addEventListener('click',()=>{downloadText(`企财智策_科研证据报告_${C}_${Y}_${CASE}.html`,labResearchReportHTML(),'text/html;charset=utf-8')});
 document.getElementById('lab-regret-grid-csv')?.addEventListener('click',()=>{if(LAB_CURRENT?.gridCSV)downloadText(`企财智策_偏好网格_${C}_${CASE}.csv`,LAB_CURRENT.gridCSV,'text/csv;charset=utf-8')});
 document.getElementById('lab-svg-export')?.addEventListener('click',()=>{
   const svg=LAB_CURRENT?.svg;if(!svg)return;downloadText(`企财智策_科研图_${LAB_FIG}_${C}_${Y}.svg`,svg,'image/svg+xml;charset=utf-8')
 });
 document.getElementById('lab-csv-export')?.addEventListener('click',()=>{if(LAB_CURRENT?.csv)downloadText(`企财智策_科研图_${LAB_FIG}_${C}_${Y}_来源.csv`,LAB_CURRENT.csv,'text/csv;charset=utf-8')});
 document.getElementById('lab-open-action')?.addEventListener('click',()=>{if(!LAB_CURRENT?.selected)return;CASE=LAB_CURRENT.selected.case;SEL=LAB_CURRENT.selected.decision_id;FILTER={cost:'',debt:'',score:''};Y=2022;nav('action')});
}
