'use strict';
// v0.9: joint six-dimensional preference perturbations and robust decision maps.
// These are synthetic-data preference experiments, NOT estimated real-world probabilities.
let LAB_JOINT_SPAN=30, LAB_JOINT_SEED=20261111, LAB_JOINT_PAIR=[0,1];
let LAB_SIMPLEX_PICK=null, LAB_SIMPLEX_CHOICES=[], LAB_SIMPLEX_CONTEXT="";

function labJointRng(seed){
 let t=(seed>>>0);return ()=>{t=(t+0x6D2B79F5)>>>0;let q=Math.imul(t^(t>>>15),1|t);q^=q+Math.imul(q^(q>>>7),61|q);return ((q^(q>>>14))>>>0)/4294967296};
}
function labJointRank(rows,groups,weights){
 const n=weights.reduce((s,x)=>s+x,0);if(!(n>0))throw Error('权重和无效');
 const result=rows.map(r=>({id:r.id,score:weights.reduce((acc,w,j)=>acc+w*Number(r[groups[j].key]),0)/n}));
 result.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return result.map((r,i)=>({...r,rank:i+1}));
}
function labJointData(){
 const g=labWeightBase();const rows=each(Y).filter(r=>g.every(o=>labFinite(r[o.key])));
 if(rows.length<10||!rows.some(r=>r.id===C))return null;
 const base=labJointRank(rows,g,g.map(o=>o.weight));
 return {groups:g,rows,base,baseMap:new Map(base.map(r=>[r.id,r])),N:rows.length};
}
function labRankAcceptability(){
 const info=labJointData();if(!info)return labEmpty('当前企业缺少完整六维评分，联合权重实验无法开展');
 const {groups,rows,base,baseMap,N}=info,draws=512,span=LAB_JOINT_SPAN/100;
 // Restrict the panel to the selected firm and five nearest baseline-rank peers.
 const center=baseMap.get(C).rank;
 const offsets=[0,-65,-25,25,65,115];
 const peers=[C];for(const off of offsets.slice(1)){
   const pos=Math.max(0,Math.min(N-1,center-1+off));
   let idx=pos;while(peers.includes(base[idx].id)&&idx<N-1)idx++;
   if(!peers.includes(base[idx].id))peers.push(base[idx].id);
 }
 for(const entry of base){if(peers.length>=6)break;if(!peers.includes(entry.id))peers.push(entry.id)}
 const rng=labJointRng(LAB_JOINT_SEED+Y*17+LAB_JOINT_SPAN*123);
 const hist=new Map(peers.map(id=>[id,Array(10).fill(0)])),rankSamples=new Map(peers.map(id=>[id,[]]));
 const csv=[['draw_id','year','synthetic_company','company_baseline_rank','sampled_rank','rank_decile',...groups.map(g=>'normalized_weight_'+g.dim)]];
 for(let s=0;s<draws;s++){
   const unnorm=groups.map(g=>g.weight*(1+(rng()*2-1)*span));
   const norm=unnorm.map(w=>w/unnorm.reduce((a,b)=>a+b,0));
   const ranked=labJointRank(rows,groups,norm),lookup=new Map(ranked.map(r=>[r.id,r.rank]));
   for(const id of peers){const rank=lookup.get(id),bin=Math.min(9,Math.floor((rank-1)*10/N));
     hist.get(id)[bin]++;rankSamples.get(id).push(rank);csv.push([s+1,Y,id,baseMap.get(id).rank,rank,bin+1,...norm]);
   }
 }
 const x0=258,y0=137,w=73,h=49;
 const colors=[24,61,76],end=[85,192,204];
 const cells=peers.map((id,r)=>{
   const label=id===C?`★ ${id}`:id;let row=labText(x0-18,y0+r*h+30,label,{anchor:'end',size:14,color:id===C?labColor.gold:'#d8edf4',weight:id===C?'700':'400'});
   return row+hist.get(id).map((count,j)=>{
     const p=count/draws,t=Math.min(1,p*3.5),color=`rgb(${colors.map((v,k)=>Math.round(v+(end[k]-v)*t)).join(',')})`;
     return `<rect x="${x0+j*w}" y="${y0+r*h}" width="${w-2}" height="${h-3}" rx="3" fill="${color}" stroke="#426579" stroke-width="0.5"><title>${labEsc(id)} · 名次十分组 ${j+1} · ${count}/${draws}（${labFix(p*100,1)}%）</title></rect>${labText(x0+j*w+w/2,y0+r*h+28,`${labFix(p*100,1)}%`,{anchor:'middle',size:11,color:p>.01?'#f6fbfd':'#a1b7c4'})}`;
   }).join('');
 }).join('');
 const axis=Array.from({length:10},(_,j)=>labText(x0+j*w+w/2,y0-12,`D${j+1}`,{anchor:'middle',size:12})).join('')+labText(x0+w*5,y0+peers.length*h+32,'排名十分组：D1 为前10%，D10 为后10%',{anchor:'middle',size:13});
 const v=rankSamples.get(C),quant=p=>labQuantile(v,p),top=v.filter(x=>x<=Math.ceil(N*.25)).length;
 const qs=[.05,.5,.95].map(p=>`P${p*100}=${labFix(quant(p),0)}`).join(' / ');
 const captions=labText(258,91,`当前公司 ${C} · 重构基准排名 ${center}/${N} · 抽样排名 ${qs}`,{size:13,color:labColor.gold})+
 labText(258,112,`前25%出现次数 ${top}/${draws} · 每个权重乘子 U[${labFix(1-span,2)},${labFix(1+span,2)}]，归一化后参与排名`,{size:12});
 const svg=labSvg(labFrame('FIG 09','多因素联合权重 · 名次接受度热图',`${Y} 年 · 六维重构指数 · 完整合成企业 n=${N} · ${draws} 次可复现偏好抽样 · 固定种子`,captions+axis+cells),1100,510,'联合权重随机情景的名次分布热图');
 return {svg,title:'联合改变六维权重时，企业排名在多大范围内波动？',
 desc:`当前 ${C} 的重构基准排名 ${center}/${N}。在 ${draws} 组固定种子、均匀乘子情景中，名次 5%/中位/95% 分位为 ${labFix(quant(.05),0)} / ${labFix(quant(.5),0)} / ${labFix(quant(.95),0)}；落在前25%的情景频率为 ${top}/${draws}。仅是指定权重抽样机制下的情景频率，不代表企业未来排名概率或统计置信区间。`,
 method:'六维基准权重来自冻结16指标权重聚合；各维独立抽取均匀乘子 [1−a,1+a]，重新归一化。固定种子伪随机512次，重排328家。热图按名次十分组汇总；P5/P50/P95是模拟名次分布分位，不是置信区间。与原16指标评价模型不同。',
 csv:labCSV(csv),rows:csv.length-1,metrics:{N,draws,center,median:quant(.5),p5:quant(.05),p95:quant(.95),topQuartileRate:top/draws,peers,counts:hist.get(C)}};
}
function labPairStability(){
 const data=labJointData();if(!data)return labEmpty('当前企业的六维重构评分不可用');
 const {rows,groups,base,baseMap,N}=data;
 let [i,j]=LAB_JOINT_PAIR;if(i===j)j=(j+1)%6;
 const span=LAB_JOINT_SPAN/100,n=17,baseRank=baseMap.get(C).rank,values=[],csv=[['company_id','year','dimension_x','dimension_y','multiplier_x','multiplier_y','selected_baseline_rank','selected_scenario_rank','rank_change','spearman_rho']];
 const xx=260,yy=119,cw=39,ch=18;
 for(let yi=0;yi<n;yi++){
   const fy=1+span*(1-2*yi/(n-1)),line=[];
   for(let xi=0;xi<n;xi++){
     const fx=1+span*(2*xi/(n-1)-1),weights=groups.map((g,k)=>g.weight*(k===i?fx:k===j?fy:1));
     const ranked=labJointRank(rows,groups,weights),dict=new Map(ranked.map(r=>[r.id,r.rank]));
     const rank=dict.get(C),diff=rank-baseRank,rho=labPearson(base.map(r=>r.rank),base.map(r=>dict.get(r.id)));
     const item={fx,fy,rank,diff,rho};line.push(item);
     csv.push([C,Y,groups[i].dim,groups[j].dim,fx,fy,baseRank,rank,diff,rho]);
   }
   values.push({cells:line});
 }
 const changes=csv.slice(1).map(r=>r[8]),max=Math.max(1,...changes.map(x=>Math.abs(x)));
 let grid='';for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const d=values[y].cells[x],t=Math.min(.85,Math.abs(d.diff)/max*.85),col=d.diff<=0?[85,171,176]:[205,123,144],baseCol=[27,58,75];
   const color=`rgb(${col.map((v,k)=>Math.round(baseCol[k]*(1-t)+v*t)).join(',')})`;
   grid+=`<rect x="${xx+x*cw}" y="${yy+y*ch}" width="${cw-1}" height="${ch-1}" fill="${color}"><title>${groups[i].name} ×${labFix(d.fx,3)}；${groups[j].name} ×${labFix(d.fy,3)}；排名 ${d.rank}（变化 ${d.diff>0?'+':''}${d.diff}）</title></rect>`;
 }
 const labX=labText(xx+cw*n/2,yy+ch*n+47,groups[i].name+' 权重乘子（横向）',{anchor:'middle',size:14,color:labColor.cyan});
 const labY=labText(xx-4,yy-17,groups[j].name+' 权重乘子（纵向）',{size:14,color:labColor.gold});
 const axis=[0,4,8,12,16].map(v=>labText(xx+(v+.5)*cw,yy+n*ch+22,labFix(1+span*(2*v/16-1),2),{anchor:'middle',size:11})+
 labText(xx-16,yy+v*ch+14,labFix(1+span*(1-2*v/16),2),{anchor:'end',size:11})).join('');
 const baseSquare=`<rect x="${xx+8*cw}" y="${yy+8*ch}" width="${cw-1}" height="${ch-1}" fill="none" stroke="${labColor.gold}" stroke-width="3"/>`;
 const min=Math.min(...csv.slice(1).map(r=>r[7])),mrank=Math.max(...csv.slice(1).map(r=>r[7]));
 const rs=values.map(o=>o.cells).flat(),top=rs.filter(r=>r.rank<baseRank).length,bottom=rs.filter(r=>r.rank>baseRank).length;
 const side=labText(976,165,`重构基准排名`,{anchor:'middle',size:14})+labText(976,207,`${baseRank} / ${N}`,{anchor:'middle',size:28,color:labColor.gold,weight:'700'})+
 labText(976,255,`扰动区间 ${min}—${mrank}`,{anchor:'middle',size:14})+labText(976,298,`提升 ${top}/${n*n} 格`,{anchor:'middle',size:13,color:labColor.cyan})+
 labText(976,330,`下降 ${bottom}/${n*n} 格`,{anchor:'middle',size:13,color:labColor.red});
 const svg=labSvg(labFrame('FIG 10','双维权重联动 · 排名稳定域',`${Y} 年 · ${C} · 17×17 确定性格网 · 黄色边框为两维基准权重`,grid+axis+baseSquare+labX+labY+side),1100,500,'双维权重扰动下企业重构排名稳定域');
 return {svg,title:'同时改变两个经营维度，排名在哪个区域保持稳定？',desc:`二维格网包含 ${n*n} 组权重；所选企业基准重构排名 ${baseRank}/${N}，联合扰动后范围 ${min}—${mrank}。相较基准，${top} 格改善、${bottom} 格下降；这只是确定性的权重实验区域，不是置信区域或出现概率。`,
 method:'每个维度的权重分别乘以[1−a,1+a]内17档系数，其他维度保持原权重后六维统一归一化；每格对328家重新排名。色彩表示目标企业名次变化，改善为蓝青、下降为粉色；黄色是权重不变基点。',
 csv:labCSV(csv),rows:n*n,metrics:{N,baseRank,min,max:mrank,top,bottom,grid:n*n}};
}
function labRobustSimplex(){
 if(Y!==2022)return labEmpty('三目标稳定域仅支持已验算的2022年候选，请切换至2022年。');
 const subset=(A?.candidates||[]).filter(r=>r.company_id===C&&r.case===CASE&&[r.score_delta,r.total_action_cost,r.cash_headroom].every(labFinite));
 if(!subset.length)return labEmpty(`企业 ${C} / ${CASE} 没有已验证可行候选，拒绝生成不存在的最优方案。`);
 const ctx=C+":"+Y+":"+CASE; if(LAB_SIMPLEX_CONTEXT!==ctx){LAB_SIMPLEX_PICK=null;LAB_SIMPLEX_CONTEXT=ctx;}
 const N=subset.length,steps=16;
 const lo={s:Math.min(...subset.map(x=>Number(x.score_delta))),c:Math.min(...subset.map(x=>Number(x.total_action_cost))),h:Math.min(...subset.map(x=>Number(x.cash_headroom)))};
 const hi={s:Math.max(...subset.map(x=>Number(x.score_delta))),c:Math.max(...subset.map(x=>Number(x.total_action_cost))),h:Math.max(...subset.map(x=>Number(x.cash_headroom)))};
 const sd=hi.s-lo.s,cd=hi.c-lo.c,hd=hi.h-lo.h;
 const scored=subset.map((x,index)=>({index,x,s:sd>1e-12?(Number(x.score_delta)-lo.s)/sd:1,c:cd>1e-12?(hi.c-Number(x.total_action_cost))/cd:1,h:hd>1e-12?(Number(x.cash_headroom)-lo.h)/hd:1}));
 const choose=(ws,wc,wh)=>{
   let best=null,u=-Infinity;
   for(const v of scored){const val=ws*v.s+wc*v.c+wh*v.h;
     if(val>u+1e-12||(Math.abs(val-u)<=1e-12&&(!best||String(v.x.decision_id)<String(best.x.decision_id)))){best=v;u=val;}}
   return best;
 };
 const vertex=[[552,114],[225,389],[882,389]],xy=(i,j)=>{
   const ws=i/steps,wc=j/steps,wh=1-ws-wc;
   return [ws*vertex[0][0]+wc*vertex[1][0]+wh*vertex[2][0],ws*vertex[0][1]+wc*vertex[1][1]+wh*vertex[2][1]];
 };
 const data=[],freq=new Map(),selected=choose(1/3,1/3,1/3);
 const makeTile=(verts)=>{
   const ms=verts.reduce((s,v)=>s+v[0],0)/(steps*3),mc=verts.reduce((s,v)=>s+v[1],0)/(steps*3),mh=1-ms-mc;
   const v=choose(ms,mc,mh),idx=v.index;
   freq.set(idx,(freq.get(idx)||0)+1);
   data.push({verts,ms,mc,mh,index:idx,v});
 };
 for(let i=0;i<steps;i++)for(let j=0;j<steps-i;j++){
   makeTile([[i,j],[i+1,j],[i,j+1]]);
   if(i+j<steps-1)makeTile([[i+1,j],[i+1,j+1],[i,j+1]]);
 }
 const order=[...freq.entries()].sort((a,b)=>b[1]-a[1]||String(subset[a[0]].decision_id).localeCompare(String(subset[b[0]].decision_id)));
 const palette=['#64bad3','#e0c187','#9d90d1','#a7d09f','#d28b94','#b6a6db'];
 const colorIndex=new Map(order.map(([idx],i)=>[idx,i]));
 LAB_SIMPLEX_CHOICES=subset;
 const desired=subset.find(x=>x.decision_id===LAB_SIMPLEX_PICK)||selected.x;LAB_SIMPLEX_PICK=desired.decision_id;
 const polys=data.map((item,t)=>{
   const [a,b,c]=item.verts.map(v=>xy(v[0],v[1]));const colorIndexValue=colorIndex.get(item.index);
   const fill=palette[colorIndexValue]||'#425c6c';
   return `<polygon class="lab-simplex-tile" data-lab-simplex-idx="${item.index}" points="${labXY(...a,1)} ${labXY(...b,1)} ${labXY(...c,1)}" fill="${fill}" stroke="#132f43" stroke-width="1.1" opacity="${item.v.x.decision_id===LAB_SIMPLEX_PICK?1:.76}"><title>${labEsc('得分偏好 '+labFix(item.ms,3)+' / 低成本 '+labFix(item.mc,3)+' / 现金余量 '+labFix(item.mh,3)+' · 胜出 '+item.v.x.decision_id)}</title></polygon>`;
 }).join('');
 const outer=`<polygon points="${vertex.map(v=>labXY(...v,1)).join(' ')}" fill="none" stroke="#c7dfe9" stroke-width="2"/>`;
 const ticks=labText(552,83,'得分改善最大 / 权重 1',{anchor:'middle',size:14,color:labColor.cyan})+
 labText(225,421,'低成本最大 / 权重 1',{anchor:'middle',size:14,color:labColor.gold})+
 labText(882,421,'现金余量最大 / 权重 1',{anchor:'middle',size:14,color:labColor.green});
 const center=xy(steps/3,steps/3);const guide=`<circle cx="${center[0]}" cy="${center[1]}" r="8" fill="none" stroke="#fff" stroke-width="2"/><circle cx="${center[0]}" cy="${center[1]}" r="2" fill="#fff"/>`;
 const legend=order.slice(0,4).map(([idx,num],i)=>`<rect x="${240+i*200}" y="451" width="12" height="12" fill="${palette[i]||'#425c6c'}"/>${labText(260+i*200,461,`方案${i+1} · ${num}/${data.length}格`,{size:11,color:'#dce9ed'})}`).join('');
 const csv=[['company_id','case','year','cell_id','weight_score','weight_low_cost','weight_cash_headroom','winning_decision_id','score_delta','total_action_cost_10kCNY','cash_headroom_10kCNY','winner_rank_group'],...data.map((t,i)=>[C,CASE,Y,i+1,t.ms,t.mc,t.mh,t.v.x.decision_id,t.v.x.score_delta,t.v.x.total_action_cost,t.v.x.cash_headroom,colorIndex.get(t.index)+1])];
 const svg=labSvg(labFrame('FIG 11','三目标偏好单纯形 · 推荐稳定区域',`${C} / ${CASE} · ${N} 个已验算候选 · ${steps*steps} 个偏好格元 · 每个格元独立求最大线性效用`,polys+outer+guide+ticks+legend),1100,500,'得分低成本现金三目标偏好下的可行方案稳定区域');
 const other=order.length>4?`，另有 ${order.length-4} 个低覆盖方案`:'';
 return {svg,title:'改变三个管理目标的偏好时，哪一个候选方案会胜出？',desc:`在当前 ${N} 条已验算可行候选与 ${data.length} 个三角形格元中，${order.length} 个方案至少胜出一次${other}。颜色表示每一块偏好区域的最大效用方案，格元占比是所设三角网格的覆盖比例，不是决策成功概率。点击区域可选择对应方案并跳转06行动中心。`,
 method:'对同一情景全部可行方案，分别做得分改善↑、行动成本↓、现金余量↑的组内min-max归一化；在三维非负权重和为1的三角单纯形上用16阶格网剖分，每个三角形重心求 U=w_s·S+w_c·C+w_h·H 最大的方案。同效用按决策ID字典序选定。此为已冻结候选的事后偏好稳定域，不改变财务护栏，不是重新优化或未来概率。',
 csv:labCSV(csv),rows:data.length,selected:desired,metrics:{N,tiles:data.length,winners:order.length,sum:order.reduce((a,b)=>a+b[1],0),top:order.slice(0,4).map(([idx,n])=>({id:subset[idx].decision_id,n}))}};
}
