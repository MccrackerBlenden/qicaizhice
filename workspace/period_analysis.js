/* Period-based financial data ledger and analysis logic.
 * Period flow (P&L/CF) and closing balance-sheet stock MUST NOT be mixed.
 * The legacy annual engine remains untouched. All amounts: CNY 10k (万元).
 */
(function(global){'use strict';
const TYPES=['bs','is','cf'], NAMES={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
const FIELDS={bs:{total_assets:['资产总计','资产合计','总资产','total_assets'],total_liabilities:['负债合计','负债总计','total_liabilities'],total_equity:['所有者权益','所有者权益合计','股东权益合计','total_equity'],cash:['货币资金','现金及现金等价物','cash']},is:{revenue:['营业收入','主营业务收入','revenue'],net_income:['净利润','net_income','net_profit'],cogs:['营业成本','主营业务成本','cogs']},cf:{operating_cf:['经营活动产生的现金流量净额','经营现金流净额','经营活动现金流量净额','operating_cf'],investing_cf:['投资活动产生的现金流量净额','investing_cf'],financing_cf:['筹资活动产生的现金流量净额','financing_cf']}};
const REQUIRED={bs:['total_assets','total_liabilities','total_equity'],is:['revenue','net_income'],cf:['operating_cf']};
const MULTIPLIER={yuan:.0001,wan:1,yi:10000};
const clean=s=>String(s??'').trim().toLowerCase().replace(/[\s_()（）\-—\[\]【】.\/：:]/g,'');
function parsePeriod(text,frequency){
 const s=String(text??'').trim();let y,n,m;
 if(frequency==='month'){
  m=s.match(/^(\d{4})[-\/.](\d{1,2})$/)||s.match(/^(\d{4})年(\d{1,2})月$/);
  if(!m)return null;y=Number(m[1]);n=Number(m[2]);if(n<1||n>12)return null;
  return y>=1990&&y<=2100?`${y}-${String(n).padStart(2,'0')}`:null;
 }
 if(frequency==='quarter'){
  m=s.match(/^(\d{4})[-\s]?Q([1-4])$/i)||s.match(/^(\d{4})年第([1-4一二三四])季度$/);
  if(!m)return null;y=Number(m[1]);n=({'一':1,'二':2,'三':3,'四':4}[m[2]]||Number(m[2]));
  return y>=1990&&y<=2100?`${y}-Q${n}`:null;
 }
 return null;
}
const periodRank=k=>{const m=k.match(/^(\d{4})-(?:Q([1-4])|(\d\d))$/);return m?Number(m[1])*12+(m[2]?Number(m[2])*3:Number(m[3])):-1};
const periodYear=k=>Number(k.slice(0,4));
function previousPeriod(k,frequency){let y=periodYear(k),n=Number(k.split(frequency==='month'?'-':'Q')[1]);if(frequency==='month'){if(n===1){y--;n=12}else n--;return `${y}-${String(n).padStart(2,'0')}`;}if(n===1){y--;n=4}else n--;return `${y}-Q${n}`;}
function previousYear(k){return `${periodYear(k)-1}${k.slice(4)}`;}
const firstOfYear=(k,frequency)=>frequency==='month'?k.endsWith('-01'):k.endsWith('Q1');
function number(s){if(s==null||String(s).trim()==='')return null;let x=String(s).trim().replace(/[，\s]/g,'');if(/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(x)||/^[-+]?(?:\d+|\d*\.\d+)$/.test(x)){const n=Number(x.replace(/,/g,''));return Number.isFinite(n)&&Math.abs(n)<1e12?n:NaN}return NaN;}
function sourceOf(f){return {file:String(f?.name||'').slice(0,180),sheet:String(f?.sheet||'CSV').slice(0,100),sha256:String(f?.sha256||''),unit:f?.unit||'wan'};}
function statement(type,data,frequency,unit,source){
 if(!data||!Array.isArray(data.headers)||!Array.isArray(data.rows))throw Error(NAMES[type]+'缺少可读数据');
 const hs=data.headers,aliases=['期间','会计期间','period','period_end','年月','月份','季度'];const pi=hs.findIndex(h=>aliases.some(a=>clean(h)===clean(a)));
 if(pi<0)throw Error(NAMES[type]+'缺少「期间」列（支持 2025-01 或 2025-Q1）');
 const indices={};for(const [field,words] of Object.entries(FIELDS[type])){
  const ix=hs.findIndex(h=>words.some(w=>clean(w)===clean(h)));
  if(ix>=0)indices[field]=ix;else if(REQUIRED[type].includes(field))throw Error(NAMES[type]+'缺少必需字段：'+words[0]);
 }
 if(data.rows.length>120)throw Error('单张期间表最多120行');
 const result={};for(let i=0;i<data.rows.length;i++){
  const row=data.rows[i],p=parsePeriod(row[pi],frequency),line=i+(data.headerRow||1)+1;
  if(!p)throw Error(`${NAMES[type]}第${line}行期间无效：${String(row[pi]).slice(0,40)}`);
  if(result[p])throw Error(`${NAMES[type]}第${line}行出现重复期间 ${p}`);
  const fields={},origin={};for(const [field,ix] of Object.entries(indices)){
   const value=number(row[ix]);if(Number.isNaN(value))throw Error(`${NAMES[type]}第${line}行／${p}「${hs[ix]}」不是有效金额：${String(row[ix]).slice(0,35)}`);
   if(value===null&&REQUIRED[type].includes(field))throw Error(`${NAMES[type]}第${line}行／${p}缺少「${hs[ix]}」金额`);
   fields[field]=value===null?null:value*MULTIPLIER[unit];origin[field]={header:hs[ix],raw:String(row[ix]??'').slice(0,100)};
  }
  result[p]={fields,origin,source:sourceOf({...source,unit})};
 }
 return result;
}
function validateBook(book){
 if(book===null||book===undefined)return null;
 if(!book||book.schema!=='qcz.period-ledger.v1'||!['month','quarter'].includes(book.frequency)||!['period','ytd'].includes(book.flow_basis)||!book.periods||typeof book.periods!=='object'||Array.isArray(book.periods))throw Error('期间账簿格式无效');
 const entries=Object.entries(book.periods);if(entries.length>120||JSON.stringify(book).length>2_000_000)throw Error('期间账簿超过安全上限');
 for(const [key,record] of entries){if(parsePeriod(key,book.frequency)!==key||!record||typeof record!=='object')throw Error('期间账簿含无效期间');
  for(const type of TYPES){const r=record[type];if(!r||!r.fields||!r.origin||!r.source)throw Error(key+'缺少'+NAMES[type]);
   if(!/^[a-f0-9]{64}$/i.test(r.source.sha256)||!['yuan','wan','yi'].includes(r.source.unit)||typeof r.source.file!=='string'||r.source.file.length>180||typeof r.source.sheet!=='string'||r.source.sheet.length>100)throw Error('期间来源指纹无效');
   for(const f of REQUIRED[type])if(!Number.isFinite(r.fields[f]))throw Error(key+' 缺少必需金额 '+type+'.'+f);
   for(const [f,v] of Object.entries(r.fields))if(!(f in FIELDS[type])||!(v===null||Number.isFinite(v)&&Math.abs(v)<1e15))throw Error('期间字段超出支持范围');
   for(const [f,v] of Object.entries(r.origin))if(!(f in FIELDS[type])||!v||typeof v.header!=='string'||typeof v.raw!=='string'||v.raw.length>100||v.header.length>200)throw Error('期间原始字段映射无效');
  }
  const f=record.bs.fields,delta=f.total_assets-f.total_liabilities-f.total_equity;
  if(Math.abs(delta)>Math.max(.05,Math.abs(f.total_assets)*.0001,Math.abs(f.total_liabilities+f.total_equity)*.0001))throw Error(`${key} 资产不等于负债加权益，差额 ${delta.toFixed(4)} 万元；未接入`);
 }
 return book;
}
function parseThree(datasets,{frequency='month',flow_basis='period',unit='wan',sources={}}={}){
 if(!['month','quarter'].includes(frequency)||!['period','ytd'].includes(flow_basis)||!Object.hasOwn(MULTIPLIER,unit))throw Error('期间频率／金额单位／累计口径无效');
 const statements=Object.fromEntries(TYPES.map(t=>[t,statement(t,datasets[t],frequency,unit,sources[t])]));
 const keys=Object.keys(statements.bs).sort();if(!keys.length)throw Error('尚无有效期间数据');
 for(const t of TYPES)if(JSON.stringify(Object.keys(statements[t]).sort())!==JSON.stringify(keys))throw Error('期间不一致：三表必须覆盖相同月份或季度，不能自动填零');
 const periods={};for(const k of keys)periods[k]=Object.fromEntries(TYPES.map(t=>[t,statements[t][k]]));
 return validateBook({schema:'qcz.period-ledger.v1',frequency,flow_basis,periods});
}
const fieldsEqual=(a,b)=>JSON.stringify(a?.fields||{})===JSON.stringify(b?.fields||{});
function mergeBook(previous,add,allowReplace=false){
 validateBook(add);if(previous){validateBook(previous);if(previous.frequency!==add.frequency||previous.flow_basis!==add.flow_basis)throw Error('现有期间账簿频率或累计口径不同；禁止混合，可先导出并建立单独项目');}
 const combined=previous?JSON.parse(JSON.stringify(previous)):JSON.parse(JSON.stringify(add));
 const added=[],duplicate=[],replacements=[];
 for(const [k,rec] of Object.entries(add.periods)){
  const before=previous?.periods?.[k];if(!before){combined.periods[k]=rec;added.push(k)}
  else if(TYPES.every(t=>fieldsEqual(before[t],rec[t]))){duplicate.push(k);/* preserve original source fingerprint */}
  else{replacements.push(k);if(allowReplace)combined.periods[k]=rec}
 }
 if(replacements.length&&!allowReplace)return {book:previous||null,added,duplicate,replacements,changed:false,needs_confirmation:true};
 return {book:combined,added,duplicate,replacements,changed:added.length+replacements.length>0,needs_confirmation:false};
}
function normalized(book){validateBook(book);const keys=Object.keys(book.periods).sort(),out={};
 for(const k of keys){const r=book.periods[k],f={bs:{...r.bs.fields},is:{},cf:{}},missing=[];
  for(const type of ['is','cf'])for(const [field,current] of Object.entries(r[type].fields)){
   if(current===null){f[type][field]=null;continue}
   if(book.flow_basis==='period'||firstOfYear(k,book.frequency)){f[type][field]=current;continue}
   const prior=book.periods[previousPeriod(k,book.frequency)]?.[type]?.fields?.[field];
   if(!Number.isFinite(prior)){f[type][field]=null;if(REQUIRED[type].includes(field))missing.push(type+'.'+field);continue}
   f[type][field]=current-prior;
  }
  out[k]={period:k,fields:f,missing,source:Object.fromEntries(TYPES.map(t=>[t,r[t].source])),verified:missing.length===0};
 }return out;
}
function rollup(book,rows,frequency,target){
 const y=Number(target.slice(0,4)),q=Number(target.slice(-1));
 let keys;if(frequency==='quarter'&&book.frequency==='month')keys=[1,2,3].map(m=>`${y}-${String((q-1)*3+m).padStart(2,'0')}`);
 else if(frequency==='year'&&book.frequency==='month')keys=Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`);
 else if(frequency==='year'&&book.frequency==='quarter')keys=[1,2,3,4].map(i=>`${y}-Q${i}`);
 else return null;
 const all=keys.every(k=>rows[k]&&rows[k].verified);
 if(!all)return {period:target,available:false,missing:keys.filter(k=>!rows[k]||!rows[k].verified),reason:'缺少完整期间或年初累计转换所需前期数据'};
 const result={period:target,available:true,fields:{is:{},cf:{},bs:{...rows[keys.at(-1)].fields.bs}},months_or_quarters:keys};
 for(const type of ['is','cf'])for(const field of Object.keys(FIELDS[type])){
  const vals=keys.map(k=>rows[k].fields[type][field]);result.fields[type][field]=vals.every(Number.isFinite)?vals.reduce((a,b)=>a+b,0):null;
 }
 return result;
}
function analyze(book,annual=null){if(!book)return {rows:[],quarters:[],years:[],annual_reconcile:[]};const rows=normalized(book),periods=Object.keys(rows).sort();
 const comparisons=(k,type,key)=>{const current=rows[k]?.fields[type]?.[key];const prior=rows[previousPeriod(k,book.frequency)]?.fields[type]?.[key];const last=rows[previousYear(k)]?.fields[type]?.[key];
  const change=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?(a/b-1)*100:null;
  return {prior_change_pct:change(current,prior),yoy_change_pct:change(current,last)};};
 const display=periods.map(k=>{const r=rows[k],b=r.fields.bs,i=r.fields.is,c=r.fields.cf;
  return {period:k,revenue:i.revenue??null,net_income:i.net_income??null,operating_cf:c.operating_cf??null,assets:b.total_assets,liabilities:b.total_liabilities,equity:b.total_equity,net_margin:Number.isFinite(i.net_income)&&i.revenue>0?i.net_income/i.revenue*100:null,leverage:b.total_assets>0?b.total_liabilities/b.total_assets*100:null,...comparisons(k,'is','revenue'),missing:r.missing,usable:Number.isFinite(i.revenue)&&Number.isFinite(i.net_income)&&Number.isFinite(c.operating_cf)};});
 const yrs=[...new Set(periods.map(periodYear))].sort();
 const quarters=book.frequency==='month'?yrs.flatMap(y=>[1,2,3,4].filter(q=>[1,2,3].some(m=>rows[`${y}-${String((q-1)*3+m).padStart(2,'0')}`])).map(q=>rollup(book,rows,'quarter',`${y}-Q${q}`))):[];
 const quarterIndex=new Map(quarters.map(q=>[q.period,q]));
 for(const q of quarters){if(!q.available)continue;
  q.revenue=q.fields.is.revenue;q.net_income=q.fields.is.net_income;q.operating_cf=q.fields.cf.operating_cf;
  q.net_margin=q.revenue>0&&Number.isFinite(q.net_income)?q.net_income/q.revenue*100:null;
  const prior=quarterIndex.get(previousPeriod(q.period,'quarter')),yearAgo=quarterIndex.get(previousYear(q.period));
  q.qoq_change_pct=prior?.available&&prior.revenue>0&&Number.isFinite(q.revenue)?(q.revenue/prior.revenue-1)*100:null;
  q.yoy_change_pct=yearAgo?.available&&yearAgo.revenue>0&&Number.isFinite(q.revenue)?(q.revenue/yearAgo.revenue-1)*100:null;
 }
 const years=yrs.map(y=>rollup(book,rows,'year',String(y)));
 const annual_reconcile=years.filter(x=>x.available&&annual?.tables).map(x=>{const y=periodYear(x.period),year=annual.tables;
  const refs={revenue:year.is?.[y]?.fields?.revenue,net_income:year.is?.[y]?.fields?.net_income,operating_cf:year.cf?.[y]?.fields?.operating_cf,total_assets:year.bs?.[y]?.fields?.total_assets};
  const vals={revenue:x.fields.is.revenue,net_income:x.fields.is.net_income,operating_cf:x.fields.cf.operating_cf,total_assets:x.fields.bs.total_assets};
  const differences=Object.entries(refs).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>({field:k,annual:v,from_periods:vals[k],difference:vals[k]-v,consistent:Number.isFinite(vals[k])&&Math.abs(vals[k]-v)<=Math.max(.05,Math.abs(v)*.0001)}));
  return {year:y,differences};});
 return {frequency:book.frequency,flow_basis:book.flow_basis,rows:display,quarters,years,annual_reconcile};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const fmtPct=v=>Number.isFinite(v)?(v>0?'+':'')+fmt(v)+'%':'不可比';
function view(book,annual,opts={}){const d=analyze(book,annual),latest=d.rows.at(-1);
 const monthly=book?.frequency==='month',kind=monthly?'月':'季';
 const hasAnnual=Boolean(Object.keys(annual?.tables?.bs||{}).length);
 const legacyExports=book?'<button class="ghost-btn" id="period-export" type="button">下载期间分析 CSV ↓</button><button class="ghost-btn" id="period-export-json" type="button">保存期间证据 JSON ↓</button><button class="ghost-btn" id="period-export-html" type="button">期间管理报告 HTML ↓</button>':'';
 const resetButton=book&&hasAnnual?'<button class="ghost-btn" id="period-reset" type="button">更换期间频率 / 清空当前账簿</button>':'';
 const rows=d.rows.map(r=>`<tr><td>${esc(r.period)}</td><td>${fmt(r.revenue)}</td><td>${fmt(r.net_income)}</td><td>${fmt(r.operating_cf)}</td><td>${fmt(r.assets)}</td><td>${Number.isFinite(r.net_margin)?fmt(r.net_margin)+'%':'不可计算'}</td><td>${fmtPct(r.prior_change_pct)}</td><td>${fmtPct(r.yoy_change_pct)}</td><td>${r.usable?'可核算':'缺少前期累计数，暂停部分判断'}</td></tr>`).join('');
 const sums=d.quarters.length?`<h4>季度汇总（完整三个月才能生成）</h4><div class="period-summary-grid">${d.quarters.map(r=>`<div class="period-summary-tile"><strong>${esc(r.period)}</strong><span>${r.available?'营收 '+fmt(r.fields.is.revenue)+' 万元；净利 '+fmt(r.fields.is.net_income)+' 万元；经营现金流 '+fmt(r.fields.cf.operating_cf)+' 万元；环比 '+fmtPct(r.qoq_change_pct)+'；同比 '+fmtPct(r.yoy_change_pct):'数据不完整：'+esc(r.missing.join('、'))}</span></div>`).join('')}</div>`:'';
 const years=d.years.map(r=>`<div class="period-summary-tile"><strong>${esc(r.period)} 年度</strong><span>${r.available?'营收 '+fmt(r.fields.is.revenue)+' 万元；期末资产 '+fmt(r.fields.bs.total_assets)+' 万元':'尚不具备全年完整数据；不生成全年结论'}</span></div>`).join('');
 const reconc=d.annual_reconcile.flatMap(y=>y.differences.filter(x=>!x.consistent).map(x=>`${y.year} 年 ${x.field}：期间汇总 ${fmt(x.from_periods)} vs 年度报表 ${fmt(x.annual)} 万元`));
 return `<section class="panel period-workbench" id="period-workbench"><div class="panel-head"><div class="panel-title">经营期间分析 · ${book?`${d.rows.length} 个${kind}度期间`:'月度 / 季度账簿'}</div><div class="panel-note">年度三表不受影响 · 期间财务数据随财务快照保存 · 来源可追溯</div></div><p class="mini-muted">资产负债表只读取期末余额；利润与经营现金流以单期发生额分析。YTD 年初累计必须以前一期累计差分，资料缺失不补零。仅支持自然年、自然季度与自然月。</p>
 <div class="filter-bar" style="flex-wrap:wrap"><label>分析频率<select id="period-frequency" class="form-select"><option value="month" ${(opts.frequency||book?.frequency||'month')==='month'?'selected':''}>月度</option><option value="quarter" ${(opts.frequency||book?.frequency)==='quarter'?'selected':''}>季度</option></select></label><label>利润表与现金流量表口径<select id="period-basis" class="form-select"><option value="period" ${(opts.flow_basis||book?.flow_basis||'period')==='period'?'selected':''}>单期发生额</option><option value="ytd" ${(opts.flow_basis||book?.flow_basis)==='ytd'?'selected':''}>年初累计数（YTD）</option></select></label><label>原文件金额单位<select id="period-unit" class="form-select"><option value="wan" ${(opts.unit||'wan')==='wan'?'selected':''}>万元</option><option value="yuan" ${opts.unit==='yuan'?'selected':''}>元</option><option value="yi" ${opts.unit==='yi'?'selected':''}>亿元</option></select></label></div>
 <div class="period-import-grid">${TYPES.map(t=>`<label>${NAMES[t]}（CSV / XLSX）<input type="file" class="input-control period-upload" data-type="${t}" accept=".csv,.xlsx"/> <small id="period-name-${t}">${esc(opts.files?.[t]?.file?.name||'尚未选择')}</small></label>`).join('')}</div><div class="action-row"><button class="primary-btn" id="period-import" type="button">${book?"预检并追加期间数据":"预检并创建/更新企业期间数据"}</button><label>模板类型<select class="form-select" id="period-template-type"><option value="bs">资产负债表</option><option value="is">利润表</option><option value="cf">现金流量表</option></select></label><button class="ghost-btn" id="period-example" type="button">下载所选模板 ↓</button>${hasAnnual?legacyExports+resetButton:''}</div>
 <p class="mini-muted" id="period-status">${esc(opts.status|| (book?'已有 '+d.rows.length+' 个期间；重叠金额更正需人工确认，原数据保留在历史快照中。':'先按一个固定频率上传三张同期间报表。原始文件不存储。'))}</p>
 ${latest?`<div class="stat-strip compact-stats"><div class="stat"><div class="stat-label">最近期间</div><div class="stat-val">${esc(latest.period)}</div></div><div class="stat"><div class="stat-label">本期营业收入</div><div class="stat-val">${fmt(latest.revenue)}</div><div class="stat-foot">万元</div></div><div class="stat"><div class="stat-label">本期净利润</div><div class="stat-val">${fmt(latest.net_income)}</div><div class="stat-foot">万元</div></div><div class="stat"><div class="stat-label">营业收入同比</div><div class="stat-val">${fmtPct(latest.yoy_change_pct)}</div><div class="stat-foot">仅同月/同季度可比</div></div></div>`:''}
 ${book?`<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>期间</th><th>营收(万元)</th><th>净利润</th><th>经营现金流</th><th>期末资产</th><th>净利率</th><th>环比</th><th>同比</th><th>口径说明</th></tr></thead><tbody>${rows}</tbody></table></div>${sums}<h4>全年核算</h4><div class="period-summary-grid">${years}</div>${reconc.length?`<div class="info"><strong>期间合计与已上传年度三表存在差异，须核对：</strong>${reconc.slice(0,8).map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:''}<details class="v26-advanced"><summary>查看各期间源文件与 SHA-256</summary><div class="mini-muted">${Object.entries(book.periods).map(([k,r])=>`<p>${esc(k)} · ${TYPES.map(t=>esc(NAMES[t]+'：'+r[t].source.file+' / SHA-256 '+r[t].source.sha256)).join('；')}</p>`).join('')}</div></details>`:''}
 ${book&&!hasAnnual?'<details class="v26-advanced"><summary>技术导出（CSV / 证据 JSON / HTML）</summary><div class="action-row">'+legacyExports+'</div><p class="mini-muted">正式管理 PDF、Excel 与快照归档请使用下方“统一管理报告”；如需切换期间频率，请新建企业期间项目，不清空唯一财务账簿。</p></details>':''}
 <div class="mini-muted">期间数据结果不接入原年度指标、合成企业评分或优化器。来源 SHA-256 随每个期间保存；报告不能代替审计。可以直接使用期间三表创建企业项目；尚无完整年度时不生成年度结论。</div></section>`;
}
function report(book,annual){const d=analyze(book,annual);return {schema:'qcz.period-report.v3.0-G',generated_at:new Date().toISOString(),source_authenticity_verified:false,frequency:book.frequency,flow_basis:book.flow_basis,rows:d.rows,quarters:d.quarters,years:d.years,annual_reconcile:d.annual_reconcile,sources:Object.fromEntries(Object.entries(book.periods).map(([k,r])=>[k,Object.fromEntries(TYPES.map(t=>[t,r[t].source]))])),limitations:['资产负债表为期末时点值，不可跨期间求和','利润表与现金流量表按单期发生额分析；YTD 使用相邻累计差分','缺少单期或比较期，不用零值填补，不计算伪同比','用户上传财务材料真实性未独立认证','仅自然月或自然季度及自然年；未支持自定义财政年度']};}
const api={parsePeriod,previousPeriod,parseThree,validateBook,mergeBook,normalized,rollup,analyze,view,report,FIELDS,REQUIRED,TYPES,NAMES};
global.QZPeriods=api;
})(window);
