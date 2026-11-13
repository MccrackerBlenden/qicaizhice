'use strict';
/* v1.3 real user three-statement diagnostics. No user data enters synthetic models or localStorage. */
const QZU=(()=>{
 const types={balance:'资产负债表',income:'利润表',cash:'现金流量表'};
 const fields={
  balance:[
   ['year','会计年度',['fiscal_year','year','年份','年度','报告年度','报告期','会计年度','财年'],true],
   ['company','企业/证券标识',['company_id','company','企业名称','公司名称','证券代码','股票代码','企业代码','企业'],false],
   ['total_assets','资产总计',['total_assets','资产总计','总资产','资产合计','资产总额'],true],
   ['total_liabilities','负债合计',['total_liabilities','负债合计','总负债','负债总计','负债总额'],true],
   ['total_equity','所有者权益合计',['total_equity','所有者权益合计','股东权益合计','权益合计','归属于股东的权益','所有者权益总计'],true],
   ['current_assets','流动资产合计',['current_assets','流动资产合计','流动资产总计'],false],
   ['current_liabilities','流动负债合计',['current_liabilities','流动负债合计','流动负债总计'],false],
   ['accounts_receivable','应收账款',['accounts_receivable','应收账款','应收账款净额'],false],
   ['inventory','存货',['inventory','存货','存货净额'],false],
   ['cash','货币资金',['cash','货币资金','现金及现金等价物','cash_and_cash_equivalents'],false]],
  income:[
   ['year','会计年度',['fiscal_year','year','年份','年度','报告年度','报告期','会计年度','财年'],true],
   ['company','企业/证券标识',['company_id','company','企业名称','公司名称','证券代码','股票代码','企业代码','企业'],false],
   ['revenue','营业收入',['revenue','营业收入','营业总收入','主营业务收入','销售收入'],true],
   ['cost','营业成本',['operating_cost','cost_of_goods_sold','营业成本','主营业务成本'],false],
   ['net_income','净利润',['net_income','净利润','归属于母公司股东的净利润','本期净利润'],true],
   ['operating_profit','营业利润',['operating_profit','营业利润'],false],
   ['rd_expense','研发费用',['rd_expense','研发费用','研发投入费用化金额'],false]],
  cash:[
   ['year','会计年度',['fiscal_year','year','年份','年度','报告年度','报告期','会计年度','财年'],true],
   ['company','企业/证券标识',['company_id','company','企业名称','公司名称','证券代码','股票代码','企业代码','企业'],false],
   ['operating_cash','经营活动现金流量净额',['net_cash_from_operating_activities','operating_cash_flow','经营活动产生的现金流量净额','经营现金流量净额','经营活动现金流量净额'],true],
   ['investing_cash','投资活动现金流量净额',['net_cash_from_investing_activities','投资活动产生的现金流量净额','投资现金流量净额'],false],
   ['financing_cash','筹资活动现金流量净额',['net_cash_from_financing_activities','筹资活动产生的现金流量净额','筹资现金流量净额'],false],
   ['begin_cash','期初现金余额',['beginning_cash','期初现金及现金等价物余额','现金及现金等价物期初余额','期初现金余额'],false],
   ['end_cash','期末现金余额',['ending_cash','期末现金及现金等价物余额','现金及现金等价物期末余额','期末现金余额'],false],
   ['net_change','现金及现金等价物净增加额',['net_change_in_cash','现金及现金等价物净增加额','现金净增加额'],false],
   ['exchange','汇率变动影响',['effect_of_exchange_rate_changes','汇率变动对现金及现金等价物的影响','汇率变动影响'],false]]
 };
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s??'').trim().toLowerCase().replace(/[\s_（）()\-·]/g,'').replace(/(人民币|万元|单位|元)$/g,'');
 const fmt=(x,n=2)=>x===null||x===undefined||!Number.isFinite(x)?'—':Number(x).toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n});
 const pct=x=>x===null||!Number.isFinite(x)?'—':fmt(x*100,2)+'%';
 let data={}, sources={},map={},unit={balance:1,income:1,cash:1},company='',title='用户上传企业',year=null, notice='',fileDigests=[],question='profit';
 function match(headers,aliases){for(const a of aliases){const index=headers.find(x=>norm(x)===norm(a));if(index)return index}return '';}
 function presets(){const keys=Object.keys(data);for(const t of Object.keys(types)){
   const words=t==='balance'?['资产负债','balance']:t==='income'?['利润','income','profit']:['现金流量','cashflow','cash_flow','现金流'];
   sources[t]=keys.find(x=>words.some(w=>x.toLowerCase().includes(w.toLowerCase())))||keys[Object.keys(types).indexOf(t)]||keys[0]||'';
   map[t]={};updateMap(t);
 }}
 function updateMap(t){const headers=data[sources[t]]?.headers||[];for(const [k,lab,aliases] of fields[t]){
   if(!headers.includes(map[t]?.[k]))map[t][k]=match(headers,aliases);
 }}
 function yearsIn(t){const d=data[sources[t]],ym=map[t]?.year;if(!d||!ym)return [];
  return [...new Set(d.rows.map(r=>parseYear(r[ym])).filter(Boolean))].sort((a,b)=>a-b);
 }
 function parseYear(v){const s=String(v??'').trim();const direct=s.match(/^(20\d{2})(?:年度|年)?$/);
   if(direct)return Number(direct[1]);
   const date=s.match(/^(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)(?:[ T]00:00:00)?$/) || s.match(/^(20\d{2})年([01]?\d)月([0-3]?\d)日$/);
   if(date)return Number(date[2])===12&&Number(date[3])===31?Number(date[1]):null;
   const x=Number(s);if(Number.isFinite(x)&&x>38000&&x<80000){const d=new Date(Date.UTC(1899,11,30)+x*86400000);return d.getUTCMonth()===11&&d.getUTCDate()===31?d.getUTCFullYear():null;}
   return null;
 }
 function number(v){if(v===null||v===undefined||String(v).trim()==='')return null;
   let s=String(v).trim().replace(/[，,\s]/g,'').replace(/[￥¥]/g,'');let negative=false;
   if(/^\(.+\)$/.test(s)){s=s.slice(1,-1);negative=true}
   if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d{1,3})?$/.test(s))return null;
   const x=Number(s);return Number.isFinite(x)&&Math.abs(x)<=1e15?(negative?-x:x):null;
 }
 function companyOptions(){const first=data[sources.balance],col=map.balance?.company;
   return first&&col?[...new Set(first.rows.map(r=>r[col]).filter(x=>x&&String(x).trim()))].slice(0,500):[];}
 function rowsFor(t,y){const d=data[sources[t]],ym=map[t]?.year;if(!d||!ym)return [];
  let rows=d.rows.filter(r=>parseYear(r[ym])===y);const id=map[t]?.company;
  if(company&&id)rows=rows.filter(r=>String(r[id]).trim()===company);
  return rows;
 }
 function value(t,key,row){const c=map[t]?.[key];if(!c)return null;return number(row?.[c])===null?null:number(row[c])*unit[t]}
 function read(y){const res={year:y,values:{},input:{},checks:[],issues:[],supported:true};
   for(const t of Object.keys(types)){
     const rows=rowsFor(t,y);if(rows.length!==1){res.issues.push({level:'block',msg:`${types[t]} ${y} 年匹配 ${rows.length} 条记录（需要恰好1条），请核对年份、企业及重复行。`});res.supported=false;continue;}
     for(const [k,label,,required] of fields[t]){if(['year','company'].includes(k))continue;
       const raw=rows[0][map[t]?.[k]];const v=value(t,k,rows[0]);res.values[k]=v;
       if(map[t]?.[k])res.input[k]={source:types[t],column:map[t][k],original:raw,unit:unit[t]};
       if(required&&v===null){res.issues.push({level:'block',msg:`${types[t]}缺少 ${label}：请检查字段映射、空值和金额格式。`});res.supported=false;}
     }
   }
   const v=res.values;
   if(Number.isFinite(v.total_assets)&&v.total_assets<=0){res.issues.push({level:'block',msg:'资产总计必须为正值。'});res.supported=false;}
   if(Number.isFinite(v.total_liabilities)&&v.total_liabilities<0){res.issues.push({level:'block',msg:'负债合计为负数，请核对原表与金额符号。'});res.supported=false;}
   const check=(code,label,a,b,ready)=>{
     if(!ready){res.checks.push({code,label,status:'UNKNOWN',residual:null});return}
     const delta=a-b,base=Math.max(Math.abs(a),Math.abs(b)),tol=Math.max(.02,base*0.00001),pass=Math.abs(delta)<=tol;
     res.checks.push({code,label,status:pass?'PASS':'FAIL',residual:delta,tolerance:tol});
     if(!pass){res.issues.push({level:'block',msg:`${label}不平衡：残差 ${fmt(delta,4)} 万元，超过容差 ${fmt(tol,4)} 万元。`});res.supported=false;}
   };
   check('balance','资产 = 负债 + 权益',v.total_assets,(v.total_liabilities??0)+(v.total_equity??0),[v.total_assets,v.total_liabilities,v.total_equity].every(Number.isFinite));
   check('cash','期初现金 + 净变动 = 期末现金',(v.begin_cash??0)+(v.net_change??0),v.end_cash,[v.begin_cash,v.net_change,v.end_cash].every(Number.isFinite));
   check('flows','经营 + 投资 + 筹资 + 汇率影响 = 净变动',(v.operating_cash??0)+(v.investing_cash??0)+(v.financing_cash??0)+(v.exchange??0),v.net_change,[v.operating_cash,v.investing_cash,v.financing_cash,v.exchange,v.net_change].every(Number.isFinite));
   return res;
 }
 const divide=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:null;
 const defs=[
  ['gross_margin','销售毛利率','(营业收入－营业成本)/营业收入','percent',v=>divide(v.revenue-v.cost,v.revenue),['revenue','cost']],
  ['net_margin','销售净利率','净利润/营业收入','percent',v=>divide(v.net_income,v.revenue),['net_income','revenue']],
  ['leverage','资产负债率','负债合计/资产总计','percent',v=>divide(v.total_liabilities,v.total_assets),['total_liabilities','total_assets']],
  ['current_ratio','流动比率','流动资产/流动负债','ratio',v=>divide(v.current_assets,v.current_liabilities),['current_assets','current_liabilities']],
  ['roa_close','期末资产收益率（非平均资产ROA）','净利润/期末资产','percent',v=>divide(v.net_income,v.total_assets),['net_income','total_assets']],
  ['cfo_revenue','经营现金流收入比','经营现金流/营业收入','percent',v=>divide(v.operating_cash,v.revenue),['operating_cash','revenue']],
  ['cfo_income','经营现金流净利润比','经营现金流/净利润','ratio',v=>divide(v.operating_cash,v.net_income),['operating_cash','net_income']],
  ['rd_intensity','研发费用率','研发费用/营业收入','percent',v=>divide(v.rd_expense,v.revenue),['rd_expense','revenue']],
  ['roe','平均权益收益率ROE','净利润 / [(期初权益+期末权益)/2]','percent',(v,prev)=>divide(v.net_income,Number.isFinite(prev?.total_equity)?(v.total_equity+prev.total_equity)/2:null),['net_income','total_equity','prior_equity']],
  ['revenue_growth','营业收入同比增长','(本期收入－上年收入)/|上年收入|','percent',(v,prev)=>divide(v.revenue-prev?.revenue,Math.abs(prev?.revenue)),['revenue','prior_revenue']]
 ];
 function evaluate(y){const current=read(y),pr=read(y-1);const cur=current.values,prev=pr.supported?pr.values:null;
   const metrics=defs.map(([id,label,formula,typ,fn,need])=>{
     const missing=need.filter(k=>k==='prior_equity'? !Number.isFinite(prev?.total_equity):k==='prior_revenue'?!Number.isFinite(prev?.revenue):!Number.isFinite(cur[k]));
     let val=missing.length?null:fn(cur,prev);
     if(!Number.isFinite(val))val=null;
     return {id,label,formula,typ,value:val,reason:missing.length?`缺少 ${missing.join('、')} 或前期数据`:val===null?'分母为0或结果无效':''};
   });
   return {year:y,company:company||title,gate:current.supported?'PASS':'BLOCKED',checks:current.checks,issues:current.issues,metrics,values:cur,input:current.input};
 }
 function years(){let all=Object.keys(types).map(yearsIn);return all[0].filter(y=>all.every(a=>a.includes(y)));}
 function selectBox(id,selected,choices){return `<select class="form-select" data-u="${esc(id)}"><option value="">— 不映射 —</option>${choices.map(x=>`<option value="${esc(x)}" ${selected===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`}
 function badge(v){return `<span class="pill ${v==='FAIL'||v==='BLOCKED'?'gold':''}">${esc(v)}</span>`}
 function analysis(){const yrs=years();if(!yrs.length)return null;year=yrs.includes(year)?year:yrs[yrs.length-1];return evaluate(year)}
 function csvCells(row){return row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s) && !/^-?\d+(?:\.\d+)?$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')}
 const download=(name,content,type='text/plain;charset=utf-8')=>{const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)};
 const trend=(ys)=>{const width=660,height=230,m=42;const xs=ys.map((d,i)=>m+i*(width-2*m)/Math.max(1,ys.length-1));
   const values=ys.flatMap(y=>[y.values.revenue,y.values.net_income,y.values.operating_cash]).filter(Number.isFinite);
   if(!values.length)return '<div class="info">没有足够数据绘制年度趋势。</div>';
   const lo=Math.min(0,...values),hi=Math.max(1,...values),scale=v=>height-m-(v-lo)*(height-2*m)/(hi-lo);
   const series=[['revenue','营业收入','#72c9e0'],['net_income','净利润','#d7ad6c'],['operating_cash','经营现金流','#a890e4']];
   return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="上传三表的收入、净利润与经营现金流年度趋势">`+
     `<line x1="${m}" y1="${scale(0)}" x2="${width-m}" y2="${scale(0)}" stroke="#8c99a7" opacity=".6"/>`+
     series.map(([key,label,color])=>{
       const pts=ys.map((r,i)=>Number.isFinite(r.values[key])?`${xs[i]},${scale(r.values[key])}`:null).filter(Boolean);
       return `<polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="2.5" fill="none"/>`+
         ys.map((r,i)=>Number.isFinite(r.values[key])?`<circle cx="${xs[i]}" cy="${scale(r.values[key])}" r="3.8" fill="${color}"><title>${r.year} ${label} ${fmt(r.values[key])} 万元</title></circle>`:'').join('');
     }).join('')+ys.map((r,i)=>`<text x="${xs[i]}" y="${height-13}" text-anchor="middle" fill="#a5b7c5" font-size="12">${r.year}</text>`).join('')+
     `<text x="${m}" y="18" fill="#a5b7c5" font-size="12">金额 / 万元</text></svg>`;
 }
 function answer(out){if(!out)return '需要先导入三张财务报表并完成字段映射。';
   if(out.gate!=='PASS')return '三表关键勾稽或字段完整性尚未通过，暂停生成经营解释。请先查看数据治理中列明的阻断项。';
   const m=Object.fromEntries(out.metrics.map(x=>[x.id,x.value])),v=out.values;
   const show=(key,typ='percent')=>Number.isFinite(m[key])?(typ==='percent'?pct(m[key]):fmt(m[key],2)):'缺少必要字段或分母不适用';
   if(question==='profit')return `本年度营业收入 ${fmt(v.revenue)} 万元、净利润 ${fmt(v.net_income)} 万元，销售净利率 ${show('net_margin')}，销售毛利率 ${show('gross_margin')}。净利率按净利润/营业收入计算，毛利率按(收入－成本)/收入计算。仅据财报能够描述盈利结构，无法据此确认利润变动的因果原因，也没有真实行业标准进行优劣评级。`;
   if(question==='solvency')return `本年度资产 ${fmt(v.total_assets)} 万元、负债 ${fmt(v.total_liabilities)} 万元，资产负债率 ${show('leverage')}；流动比率 ${show('current_ratio','ratio')}。前者衡量负债占资产比重，后者为流动资产/流动负债。尚未结合债务期限、行业同行、合同与现金流压力，不产生“安全/不安全”的定量评级。`;
   if(question==='cash')return `本年度经营现金流 ${fmt(v.operating_cash)} 万元、净利润 ${fmt(v.net_income)} 万元，现金流收入比 ${show('cfo_revenue')}，经营现金流/净利润 ${show('cfo_income','ratio')}。现金流与利润差异可能涉及应收、存货和非现金损益等因素，但目前缺乏足够附注，不能把差异直接归因于单一因素。`;
   if(question==='growth')return `本年度营业收入 ${fmt(v.revenue)} 万元，若上年可核对，则同比增长为 ${show('revenue_growth')}。跨年只依据已上传且通过校验的财务年度；同比变化不是下一年的增长预测。`;
   if(question==='quality')return `当前年度会计检查：${out.checks.map(x=>x.label+' '+x.status).join('；')}。UNKNOWN 表示缺少资料而无法判定，不视为通过。用户上传资料尚未经过独立审计。`;
   return '当前问题不在已验证的财务解答范围。';
 }
 function reportHTML(out){const metrics=out.metrics.filter(x=>x.value!==null);const rows=metrics.map(m=>`<tr><td>${esc(m.label)}</td><td>${m.typ==='percent'?pct(m.value):fmt(m.value)}</td><td>${esc(m.formula)}</td></tr>`).join('');
   const checks=out.checks.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(x.status)}</td><td>${fmt(x.residual,4)}</td></tr>`).join('');
   return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>用户三表财务诊断</title><style>body{font-family:Arial,'Microsoft YaHei',sans-serif;max-width:920px;margin:40px auto;line-height:1.7;color:#152536}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{padding:9px;border:1px solid #c5d1d8;text-align:left}h1{color:#184563}.foot{font-size:12px;color:#687786}@media print{body{margin:18mm}}</style></head><body><h1>企财智策｜用户三表诊断报告</h1><p>项目：${esc(out.company)} · 财年 ${out.year} · 单位：万元 · 数据来源：用户本地上传（未独立核验）</p><h2>准入状态：${esc(out.gate)}</h2><p>${esc(out.issues.map(x=>x.msg).join('；')||'关键勾稽通过；不代表完成审计。')}</p><h2>三表勾稽</h2><table><tr><th>项目</th><th>状态</th><th>残差（万元）</th></tr>${checks}</table><h2>当前分析问题</h2><p>${esc(answer(out))}</p><h2>指标计算</h2><table><tr><th>指标</th><th>值</th><th>公式</th></tr>${rows||'<tr><td colspan="3">当前输入不满足完整分析条件</td></tr>'}</table><p class="foot">仅依据上传报表按明确公式计算；不输出冻结综合评分、样本排名、状态迁移概率、个体违约概率或经营优化结果。未知值保持缺失，未经核验来源不得用于投资、授信等高风险决策。报告由浏览器本地生成，不需要联网。</p></body></html>`;
 }
 function show(){const keys=Object.keys(data),out=analysis();
   let html=`<div class="hero-panel"><div class="overline">USER DATA / INDEPENDENT FINANCIAL DIAGNOSTICS / 10</div><h2>用户财报 · 自有数据诊断</h2><p>真正读取用户 CSV / Excel 三表，按字段映射与单位独立重算财务指标、跨期变化和三表勾稽；与 328 家仿真企业的冻结模型严格隔离。</p></div>`;
   html+=`<div class="info"><strong>隐私边界：</strong>文件只在当前浏览器内解析，不发送至云端，不写入浏览器持久存储。刷新页面即清空输入；导出文件由你主动决定。支持单个三表 Excel（不同工作表）或最多三个 CSV/TSV，单文件 ≤ 5 MB。</div>`;
   html+=`<div class="action-row"><label class="ghost-btn" style="cursor:pointer">选择财务文件 <input type="file" id="user-files" accept=".csv,.tsv,.xlsx" multiple style="display:none"/></label><button id="user-clear" class="ghost-btn">清空本次导入</button><button id="user-sample" class="ghost-btn">载入独立教学样例</button></div>`;
   if(notice)html+=`<div class="info">${esc(notice)}</div>`;
   if(!keys.length){
     html+=`<div class="grid2 equal">`+panel('上传前请准备','首行是字段名，每行是一个年度',`<div class="info">资产负债表：年度、资产总计、负债合计、所有者权益合计。<br/>利润表：年度、营业收入、净利润。<br/>现金流量表：年度、经营活动现金流量净额；期初/期末现金和净增额可供额外勾稽。<br/>支持中文/英文字段及用户手动映射。只接受年度或12月31日年度末数据；季度数据不自动当作全年。年度不能重号。</div>`)+panel('分析能力边界','只根据上传企业的真实字段做确定性计算',`<div class="info">已具备：三表准入、10项可解释财务比率、跨年趋势、指标缺失说明、原始字段追踪、CSV/JSON/HTML导出。<br/>不自动套用：仿真企业行业排名、S1/S2 状态、示范企业情景优化、违约概率预测。</div>`)+`</div>`;
     return html;
   }
   const sourceControls=Object.keys(types).map(t=>`<label>${types[t]} <select class="form-select" data-source="${t}">${keys.map(k=>`<option value="${esc(k)}" ${sources[t]===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label><label>金额单位 <select class="form-select" data-unit="${t}">${[['1','万元'],['0.0001','元'],['10000','亿元']].map(([v,n])=>`<option value="${v}" ${unit[t]===+v?'selected':''}>${n}</option>`).join('')}</select></label>`).join('');
   html+=panel('01 · 选择三表与金额单位','用户控制工作表和计量单位，内部统一换算为万元',`<div class="filter-bar"><label>项目名称 <input class="input-control" id="user-title" maxlength="80" value="${esc(title)}"/></label>${sourceControls}</div>`);
   const mapControls=Object.keys(types).map(t=>`<h3 class="subheading">${types[t]} · ${esc(sources[t])} · ${data[sources[t]]?.rows.length||0} 条记录</h3><div class="user-field-grid">${fields[t].map(([k,label,,required])=>`<label>${esc(label)} ${required?'<b style="color:#dfae74">*</b>':''}${selectBox(t+':'+k,map[t]?.[k],data[sources[t]]?.headers||[])}</label>`).join('')}</div>`).join('');
   html+=panel('02 · 字段映射','可以更正自动匹配的字段；未映射或空值绝不补零',mapControls);
   const sels=`<div class="filter-bar"><label>企业标识 <select id="user-company" class="form-select"><option value="">单企业/不筛选</option>${companyOptions().map(x=>`<option value="${esc(x)}" ${x===company?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>分析年度 <select id="user-year" class="form-select">${years().map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('')}</select></label></div><div class="info">含多企业时，请对三表分别映射企业字段，并选定一致的标识。重复记录会阻断分析。</div>`;
   html+=panel('03 · 企业与年份','不同年度必须采用相同字段与单位口径',sels);
   html+=out?results(out):panel('尚未找到共同年度','请检查年度字段映射',`<div class="info">三表至少有一个共同年度；每表该企业、年度需要恰好一条记录。</div>`);
   return html;
 }
 function results(out){const yrs=years(),history=yrs.map(y=>evaluate(y)).filter(r=>r.gate==='PASS'),metrics=out.metrics;
   const v=out.values;
   const quality=out.checks.map(x=>`<div class="check-row"><span>${esc(x.label)}</span><span>${badge(x.status)} ${x.residual===null?'':fmt(x.residual,4)+' 万元'}</span></div>`).join('');
   let html=panel('04 · 三表勾稽与准入判断',out.gate==='PASS'?'关键恒等式通过，不代表审计认证':'存在阻断项，不会输出无条件财务结论',`<div class="stat-strip compact-stats">${strip('数据准入',out.gate,`分析年度 ${year}`)}${strip('共同年度',yrs.length+' 个',yrs.join(' / '))}${strip('可计算指标',metrics.filter(m=>m.value!==null).length+' / '+metrics.length,'缺失的保持空缺')}</div>${quality}${out.issues.length?`<div class="info">${out.issues.map(x=>esc(x.msg)).join('<br/>')}</div>`:'<div class="info">核查完已提供的项目；缺少现金流字段时其校验显示 UNKNOWN，并不当作 PASS。</div>'}`);
   if(out.gate!=='PASS')return html+panel('指标计算已阻断','当前三表存在缺失、重复记录或会计恒等式不平衡',`<div class="info">请修复错误并重新导入，避免以错误报表计算风险、评分或经营建议。</div>`);
   html+=`<div class="stat-strip compact-stats">${[['资产总计',v.total_assets],['负债合计',v.total_liabilities],['营业收入',v.revenue],['净利润',v.net_income],['经营现金流',v.operating_cash]].map(([k,n])=>strip(esc(k),fmt(n),'万元 · 用户上传')).join('')}</div>`;
   const rows=metrics.map(m=>`<tr><td>${esc(m.label)}</td><td>${m.value===null?'—':m.typ==='percent'?pct(m.value):fmt(m.value)}</td><td><small>${esc(m.formula)}</small></td><td>${m.value===null?esc(m.reason):'已计算'}</td></tr>`).join('');
   html+=panel('05 · 用户企业财务比率','按照本次上传数据计算，不使用仿真综合分及行业排名',`<div style="overflow-x:auto"><table class="table"><thead><tr><th>财务指标</th><th>当前值</th><th>计算公式</th><th>计算状态</th></tr></thead><tbody>${rows}</tbody></table></div>`);
   const questions=[['profit','企业盈利能力如何？'],['solvency','资产负债结构与短期偿债如何？'],['cash','现金流与利润是否匹配？'],['growth','营业收入是否增长？'],['quality','财报数据质量是否通过？']];
   html+=panel('06 · 基于上传数据的分析解答','确定性规则解释，每句话有对应的财务数值或明确的未知边界',`<div class="filter-bar"><label>选择研究问题 <select class="form-select" id="user-question">${questions.map(([id,label])=>`<option value="${id}" ${question===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="info">${esc(answer(out))}</div><div class="info">回答不等于经过审计的专业意见，不使用生成式 AI 编造分析结论。</div>`);
   html+=panel('07 · 多年度财务变化','只连接通过准入的年度数据',trend(history)+`<div class="action-row"><span class="pill">青色 营业收入</span><span class="pill gold">金色 净利润</span><span class="pill">紫色 经营现金流</span></div><div class="info">单位万元。趋势是历史描述，不代表预测；未通过勾稽的年份不会画入曲线。</div>`);
   const preview=Object.entries(out.input).map(([k,i])=>[esc(k),esc(i.source+' / '+i.column),esc(i.original),fmt(v[k])]);
   html+=panel('08 · 数值来源与证据追溯','保留原始字段、原始金额和万元换算',table(['标准字段','源报表 / 字段','原始值','标准万元'],preview));
   html+=panel('09 · 结果导出','明确保留数据来源和模型限制',`<div class="action-row"><button class="primary-btn" id="user-export-html">导出 HTML 财务分析报告</button><button class="ghost-btn" id="user-export-json">导出计算证据 JSON</button><button class="ghost-btn" id="user-export-csv">导出指标 CSV</button></div><div class="info">所有数据仅在本次浏览器会话；不自动保存。报告仅反映本次导入的数据，不使用合成企业的评分与排名，也不生成未经验证的预测。</div>`);
   return html;
 }
 async function onFiles(e){const files=Array.from(e.target.files||[]);if(!files.length)return;data={};sources={};map={};year=null;company='';fileDigests=[];notice='正在读取本地财务文件……';render();
   try{const parsed=await QZP.load(files);data=parsed;title=files[0].name.replace(/\.(xlsx|csv|tsv)$/i,'').slice(0,80);year=null;company='';map={};presets();
     fileDigests=[];for(const f of files){try{const digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());fileDigests.push({name:f.name,bytes:f.size,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')})}catch{fileDigests.push({name:f.name,bytes:f.size,sha256:'不可用'})}}
     notice=`已在浏览器中读取 ${files.length} 个文件、${Object.keys(data).length} 张表。请检查自动字段映射和金额单位。`;
   }catch(err){notice='导入失败：'+(err.message||String(err));}
   render();
 }
 function sample(){const rows=[['年份','资产总计','负债合计','所有者权益合计','流动资产合计','流动负债合计','应收账款','存货'],['2021','1000','400','600','450','300','120','90'],['2022','1200','460','740','560','320','150','100']];
   const inc=[['年份','营业收入','营业成本','净利润','研发费用'],['2021','800','580','70','36'],['2022','1000','720','100','45']];
   const cf=[['年份','经营活动产生的现金流量净额','投资活动产生的现金流量净额','筹资活动产生的现金流量净额','汇率变动影响','期初现金余额','期末现金余额','现金净增加额'],['2021','95','-60','-15','0','100','120','20'],['2022','145','-80','-15','0','120','170','50']];
   data={'资产负债表（教学）':QZP.matrix(rows),'利润表（教学）':QZP.matrix(inc),'现金流量表（教学）':QZP.matrix(cf)};map={};title='教学虚构企业（与系统仿真样本无关）';year=2022;company='';fileDigests=[{name:'内置独立教学样例',sha256:'演示配置，不是文件上传'}];presets();notice='已载入独立的教学合成三表，所有金额均为教学示例，不能作为真实企业事实。';render();
 }
 function exportEvidence(){const out=analysis();if(!out||out.gate!=='PASS')return;return {version:'qicz-userfinance-v1.3',created:new Date().toISOString(),label:'用户上传，未核验',project:out.company,year:out.year,amount_unit:'CNY_10K',source_files:fileDigests,mappings:map,units:unit,checks:out.checks,selected_question:question,answer:answer(out),metrics:out.metrics,values:out.values,inputs:out.input,limitations:['不引用原328家合成样本评级','未通过独立审计','不能当作因果预测或投资建议']};}
 function bind(){document.getElementById('user-files')?.addEventListener('change',onFiles);
   document.getElementById('user-clear')?.addEventListener('click',()=>{data={};sources={};map={};year=null;fileDigests=[];notice='已清除本次输入（浏览器未持久化保存）。';render()});
   document.getElementById('user-sample')?.addEventListener('click',sample);
   document.getElementById('user-title')?.addEventListener('change',e=>{title=e.target.value.trim().slice(0,80)||'用户企业';render()});
   document.querySelectorAll('[data-source]').forEach(el=>el.addEventListener('change',e=>{const t=e.target.dataset.source;sources[t]=e.target.value;map[t]={};updateMap(t);company='';year=null;render()}));
   document.querySelectorAll('[data-unit]').forEach(el=>el.addEventListener('change',e=>{unit[e.target.dataset.unit]=+e.target.value;render()}));
   document.querySelectorAll('[data-u]').forEach(el=>el.addEventListener('change',e=>{const [t,k]=e.target.dataset.u.split(':');map[t][k]=e.target.value;year=null;render()}));
   document.getElementById('user-company')?.addEventListener('change',e=>{company=e.target.value;render()});
   document.getElementById('user-year')?.addEventListener('change',e=>{year=Number(e.target.value);render()});
   document.getElementById('user-question')?.addEventListener('change',e=>{question=e.target.value;render()});
   document.getElementById('user-export-html')?.addEventListener('click',()=>{const a=analysis();if(a?.gate==='PASS')download(`企财智策_用户三表诊断_${a.year}.html`,reportHTML(a),'text/html;charset=utf-8')});
   document.getElementById('user-export-json')?.addEventListener('click',()=>{const a=exportEvidence();if(a)download(`企财智策_用户三表证据_${a.year}.json`,JSON.stringify(a,null,2),'application/json;charset=utf-8')});
   document.getElementById('user-export-csv')?.addEventListener('click',()=>{const a=analysis();if(a?.gate!=='PASS')return;const lines=[['指标','计算值','类型','计算公式','原因'],...a.metrics.map(m=>[m.label,m.value,m.typ,m.formula,m.reason])].map(csvCells);download(`企财智策_用户三表指标_${a.year}.csv`,'\ufeff'+lines.join('\r\n'),'text/csv;charset=utf-8')});
 }
 // expose pure inspection to automated regression without altering main application globals.
 return {show,bind,read,evaluate,years,number,parseYear, sample,exportEvidence,answer,fields,diagnostics:()=>({sources,map,unit,company,year,title}),getData:()=>data};
})();
function renderUserFinance(){return QZU.show();}
function bindUserFinance(){return QZU.bind();}
