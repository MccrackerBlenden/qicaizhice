/* v1.7 SEC public XBRL evidence explorer (separate from synthetic 合成数据模型 models and CNY user uploads).
   No CORS proxy, no silent currency conversion, no automatic authenticity award for uploaded JSON. */
(function(global){
'use strict';
const SPECS=[
 ['assets','总资产','bs',['us-gaap:Assets','ifrs-full:Assets']],
 ['liabilities','总负债','bs',['us-gaap:Liabilities','ifrs-full:Liabilities']],
 ['equity','权益合计','bs',['us-gaap:StockholdersEquity','us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','ifrs-full:Equity']],
 ['current_assets','流动资产','bs',['us-gaap:AssetsCurrent','ifrs-full:CurrentAssets']],
 ['current_liabilities','流动负债','bs',['us-gaap:LiabilitiesCurrent','ifrs-full:CurrentLiabilities']],
 ['cash','现金及现金等价物','bs',['us-gaap:CashAndCashEquivalentsAtCarryingValue']],
 ['revenue','全年营业收入','is',['us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax','us-gaap:Revenues','us-gaap:SalesRevenueNet','ifrs-full:Revenue']],
 ['net_income','全年净利润','is',['us-gaap:NetIncomeLoss','ifrs-full:ProfitLoss']],
 ['cfo','全年经营现金流','cf',['us-gaap:NetCashProvidedByUsedInOperatingActivities','ifrs-full:CashFlowsFromUsedInOperatingActivities']],
 ['cfi','全年投资现金流','cf',['us-gaap:NetCashProvidedByUsedInInvestingActivities']],
 ['cff','全年筹资现金流','cf',['us-gaap:NetCashProvidedByUsedInFinancingActivities']]
];
const TYPES={bs:'时点',is:'年度期间',cf:'年度期间'};
let snapshot=null, origin='none', fileName='', fileSha='', details='', cik='0000320193',contact='', selected='', selections=[], analysis=null, loading=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=(x,d=2)=>Number.isFinite(x)?x.toLocaleString('zh-CN',{maximumFractionDigits:d}):'—';
const csv=(rows)=>'\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(',')).join('\r\n');
const button=(id,label,style='ghost-btn')=>`<button type="button" id="${id}" class="${style}">${label}</button>`;
const ref=(c)=>`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(c).padStart(10,'0')}.json`;
function download(name,text,type){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
function validCompany(obj){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||!Number.isInteger(Number(obj.cik))||Number(obj.cik)<=0||!obj.facts||typeof obj.facts!=='object')throw Error('不是合法的 SEC companyfacts 对象');
 if(!Object.keys(obj.facts).some(x=>['us-gaap','ifrs-full'].includes(x)))throw Error('未找到标准 us-gaap / ifrs-full 概念');
 return obj;
}
function instances(raw){
 const data=validCompany(raw),periods=new Map();
 for(const [taxonomy,tags] of Object.entries(data.facts)){
  if(!['us-gaap','ifrs-full'].includes(taxonomy)||!tags||typeof tags!=='object')continue;
  for(const [tag,concept] of Object.entries(tags)){
   const spec=SPECS.find(x=>x[3].includes(taxonomy+':'+tag));if(!spec)continue;
   for(const r of concept?.units?.USD||[]){
    if(!annual(r,spec[2]))continue;
    const k=r.accn+'|'+r.end, p=periods.get(k)||{accn:r.accn,end:r.end,filed:r.filed||'',form:r.form||'',count:0};
    p.count++;if((r.filed||'')>p.filed)p.filed=r.filed;periods.set(k,p);
   }
  }
 }
 return Array.from(periods.values()).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed)).slice(0,160);
}
function annual(r,kind){
 if(!r||!Number.isFinite(r.val)||!/^\d{4}-\d{2}-\d{2}$/.test(r.end||'')||!/^\d{10}-\d{2}-\d{6}$/.test(r.accn||''))return false;
 if(!['10-K','10-K/A','20-F','20-F/A','40-F','40-F/A'].includes(r.form))return false;
 if(kind==='bs')return !r.start;
 if(!r.start||!/^\d{4}-\d{2}-\d{2}$/.test(r.start))return false;
 const days=(Date.parse(r.end)-Date.parse(r.start))/86400000;
 return days>=329&&days<=390;
}
function factsFor(obj,filing){
 const rows=[];
 for(const [key,label,kind,tags] of SPECS){
   const candidates=[];
   for(const qualified of tags){
     const [tax,tag]=qualified.split(':'),concept=obj?.facts?.[tax]?.[tag];
     for(const r of concept?.units?.USD||[]){
       if(r.accn!==filing.accn||r.end!==filing.end||!annual(r,kind))continue;
       candidates.push({tag:qualified,amount:r.val,start:r.start||'',end:r.end,accn:r.accn,filed:r.filed||'',frame:r.frame||'',form:r.form,unit:'USD'});
     }
   }
   const uniques=new Set(candidates.map(x=>x.amount));
   // No silent choice of overlapping aliases or contradictory duplicate records.
   const status=!candidates.length?'MISSING':uniques.size>1?'CONFLICT':'OK';
   rows.push({key,label,kind,status,amount:status==='OK'?candidates[0].amount:null,original:candidates});
 }
 return rows;
}
function analyze(obj,chosen){
 const periods=instances(obj), f=periods.find(x=>x.accn+'|'+x.end===chosen);
 if(!f)throw Error('选择的申报版本与数据不匹配');
 const rows=factsFor(obj,f),lookup=Object.fromEntries(rows.map(r=>[r.key,r]));
 const a=lookup.assets.amount,l=lookup.liabilities.amount,e=lookup.equity.amount,rev=lookup.revenue.amount,ni=lookup.net_income.amount,oper=lookup.cfo.amount;
 const balance=(a!==null&&l!==null&&e!==null)?a-l-e:null;
 const tol=balance===null?null:Math.max(1,Math.abs(a)*0.000001);
 const math={balance_delta_usd:balance,balance_tolerance_usd:tol,balance_status:balance===null?'UNVERIFIED':Math.abs(balance)<=tol?'PASS':'FAIL',
   net_margin:rev!==null&&ni!==null&&rev!==0?ni/rev*100:null,
   debt_to_assets:a!==null&&l!==null&&a!==0?l/a*100:null,
   operating_cf_to_revenue:rev!==null&&oper!==null&&rev!==0?oper/rev*100:null};
 return {schema:'qicai-sec-xbrl-v1.7',cik:String(obj.cik).padStart(10,'0'),entityName:obj.entityName||'未命名',filing:f,rows,math,
   gate:rows.some(x=>x.status==='CONFLICT')||math.balance_status==='FAIL'?'BLOCKED':(['assets','liabilities','equity','revenue','net_income','cfo'].every(k=>lookup[k]?.status==='OK')&&math.balance_status==='PASS'?'STRUCTURE_PASS':'PARTIAL'),
   limitations:['SEC标准XBRL事实；可能不包含企业自定义taxonomy概念','仅同一申报编号/同一报告终止日期/相同USD口径','全年损益及现金流需要近似12个月期间，期末资产负债为时点值','不与人民币报表直接比较','不是审计证明、不能自动替代PDF或更正公告']};
}
function panel(title,subtitle,body){return `<section class="studio-panel"><div class="studio-panelhead"><h3>${title}</h3><small>${subtitle}</small></div>${body}</section>`}
function draw(){const p=analysis,rows=p?.rows||[],f=p?.filing,m=p?.math;
 let out=`<section class="lab-hero"><div class="eyebrow">SEC EDGAR / SOURCE-BOUND XBRL</div><h2>11 · 权威披露结构化核验</h2><p>直接读取官方结构化 XBRL（或离线导入官方格式 JSON），锁定 CIK、申报编号、结束日期、金额单位与会计标签。禁止跨申报版本拼接数据；异常或缺失会明确显示。</p><div class="lab-headline"><span>SEC Company Facts</span><span>年度 10-K / 20-F / 40-F</span><span>USD 独立口径</span><span>绝不冒充审计认证</span></div></section>`;
 out+=panel('01 · 获取官方结构化数据','在线模式每次明确发起一次SEC请求；离线模式不验证文件来源',
 `<div class="filter-bar"><label>美国 SEC CIK <input class="input-control" id="sec-cik" value="${esc(cik)}" maxlength="10" placeholder="例如 0000320193"></label><label>SEC 访问联系邮箱 <input class="input-control" id="sec-contact" type="email" value="${esc(contact)}" maxlength="120" placeholder="邮箱仅用于官方接口 User-Agent"></label></div><div class="action-row">${button('sec-live','联网获取 SEC Company Facts','primary-btn')}<label class="studio-import">离线导入 companyfacts JSON <input type="file" id="sec-upload" accept=".json,application/json"/></label>${button('sec-clear','清除本次披露数据')}</div><div class="info">官方接口：<a class="lab-paper-link" href="${esc(ref(cik))}" target="_blank" rel="noopener noreferrer">${esc(ref(cik))}</a><br>SEC 官方 API 不支持浏览器直接跨域请求；由本机服务代请求。联系邮箱只传给 SEC，不上传你的私有三表。${loading?' 正在请求官方接口……':''}</div>${details?`<div class="info">${esc(details)}</div>`:''}`);
 if(!snapshot)return out+panel('当前未加载披露数据','本工作台不依赖合成样本，可以独立使用',`<div class="info">如无法联网，可点击官方 JSON 地址下载，再在此处离线导入。离线文件无论写有什么发行人名称，都只能标记为“来源未核实”。</div>`);
 out+=panel('02 · 来源与申报版本','来源标记只代表获取方式，不代表财务内容已审计',
 `<div class="stat-strip compact-stats"><div class="stat"><span class="stat-label">实体</span><strong>${esc(snapshot.entityName)}</strong></div><div class="stat"><span class="stat-label">CIK</span><strong>${esc(String(snapshot.cik).padStart(10,'0'))}</strong></div><div class="stat"><span class="stat-label">来源状态</span><strong>${origin==='live'?'SEC HTTPS 现场获取':'本地 JSON · 未认证'}</strong></div></div><div class="info">${esc(fileName)}${fileSha?' · SHA-256：'+esc(fileSha):''}</div><label>明确选择申报编号及年度报告结束日期 <select class="form-select" id="sec-filing">${selections.map(x=>`<option value="${esc(x.accn+'|'+x.end)}" ${selected===x.accn+'|'+x.end?'selected':''}>${esc(x.end)} · ${esc(x.form)} · ${esc(x.accn)} · filed ${esc(x.filed)} · ${x.count} facts</option>`).join('')}</select></label>`);
 if(!p)return out+panel('本数据未识别到支持的年度申报事实','必须存在可识别的10-K、20-F或40-F事实',`<div class="info">可能是会计概念未覆盖、缺少标准 taxonomy 或报告并非全年数据。没有资格推断缺失数值。</div>`);
 out+=panel('03 · 同一申报版本的财务事实核对','每项只接受USD、对应日期与同一个 accession，冲突不猜测',
 `<div class="stat-strip compact-stats"><div class="stat"><span class="stat-label">通过标签</span><strong>${rows.filter(x=>x.status==='OK').length}/${rows.length}</strong></div><div class="stat"><span class="stat-label">冲突标签</span><strong>${rows.filter(x=>x.status==='CONFLICT').length}</strong></div><div class="stat"><span class="stat-label">资产负债等式</span><strong>${esc(m.balance_status)}</strong></div><div class="stat"><span class="stat-label">审计能力</span><strong>结构化比对</strong></div></div><div class="sec-scroll"><table class="table"><thead><tr><th>项目</th><th>数值（百万 USD）</th><th>状态</th><th>使用标签（含冲突）</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.label)} <small>${esc(TYPES[x.kind])}</small></td><td>${x.amount===null?'—':fmt(x.amount/1e6,3)}</td><td>${esc(x.status)}</td><td><small>${esc(x.original.map(y=>y.tag+(x.status==='CONFLICT'?':'+fmt(y.amount):'')).join(' / ')||'该申报无对应标准标签')}</small></td></tr>`).join('')}</tbody></table></div><div class="info">如标签冲突，先核查不同 XBRL 概念定义与原文；本系统不会擅自用其中一个数值。缺失不会被当作零。</div>`);
 out+=panel('04 · 可追溯的基础分析','只有必要数值完整时计算；独立使用 USD，不直接进入人民币三表模型',
 `<div class="stat-strip compact-stats"><div class="stat"><span class="stat-label">净利率</span><strong>${m.net_margin===null?'未验证':fmt(m.net_margin,2)+'%'}</strong></div><div class="stat"><span class="stat-label">资产负债率</span><strong>${m.debt_to_assets===null?'未验证':fmt(m.debt_to_assets,2)+'%'}</strong></div><div class="stat"><span class="stat-label">经营现金流收入比</span><strong>${m.operating_cf_to_revenue===null?'未验证':fmt(m.operating_cf_to_revenue,2)+'%'}</strong></div></div><div class="info">资产=负债+权益残差 ${m.balance_delta_usd===null?'无法核对':fmt(m.balance_delta_usd,2)+' USD'}；本工作台的准入标签为 ${p.gate}。若需要用作研究证据，应进一步检查原始申报、脚注、更正公告和财务期间。</div><div class="action-row">${button('sec-export-json','导出 XBRL 事实与溯源 JSON','primary-btn')}${button('sec-export-csv','导出逐字段 USD 台账 CSV')}</div>`);
 return out;
}
function refresh(){if(global.render)global.render()}
function hydrate(data,source,name,sha){const snap=validCompany(data);snapshot=snap;origin=source;fileName=name||'';fileSha=sha||'';cik=String(snap.cik).padStart(10,'0');selections=instances(snap);selected=selections[0]?selections[0].accn+'|'+selections[0].end:'';analysis=selected?analyze(snap,selected):null;details=`读取到 ${selections.length} 组可选申报编号/年末；${source==='live'?'来自SEC固定HTTPS域名':'离线文件来源尚未验证'}`;refresh()}
async function bind(){
 document.querySelector('#sec-cik')?.addEventListener('change',e=>{cik=e.target.value.trim()});
 document.querySelector('#sec-contact')?.addEventListener('change',e=>{contact=e.target.value.trim()});
 document.querySelector('#sec-filing')?.addEventListener('change',e=>{selected=e.target.value;analysis=analyze(snapshot,selected);refresh()});
 document.querySelector('#sec-clear')?.addEventListener('click',()=>{snapshot=null;analysis=null;selections=[];selected='';details='已清除 SEC 工作台的本次数据。';origin='none';refresh()});
 document.querySelector('#sec-upload')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{
  if(file.size>16*1024*1024)throw Error('SEC JSON 大于16MB，已拒绝');const buffer=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',buffer),sha=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));hydrate(json.data&&json.source_status?json.data:json,'offline',file.name,sha);
 }catch(err){details='离线文件导入失败：'+String(err.message||err);refresh()}});
 document.querySelector('#sec-live')?.addEventListener('click',async()=>{
  cik=document.querySelector('#sec-cik')?.value.trim()||cik;contact=document.querySelector('#sec-contact')?.value.trim()||contact;
  if(!/^\d{1,10}$/.test(cik)||!contact.includes('@')){details='请填写正确的CIK和联系邮箱。';refresh();return}
  loading=true;details='向 SEC 官方固定接口请求中。';refresh();
  try{const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),25000);let resp;
   try{resp=await fetch('/api/sec-companyfacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cik,contact}),signal:ctl.signal})}finally{clearTimeout(timeout)}
   const result=await resp.json();if(!result.ok)throw Error(result.error||'官方请求失败');
   hydrate(result.data,'live',result.source_url,result.raw_response_sha256);
   details=`官网域名实时返回；接收 ${result.bytes} 字节，响应 SHA256 ${result.raw_response_sha256}。此标记不等于原始财报审计。`;
  }catch(err){details='在线连接失败：'+String(err.name==='AbortError'?'SEC响应超时，可离线导入JSON':err.message||err)}finally{loading=false;refresh()}
 });
 document.querySelector('#sec-export-json')?.addEventListener('click',()=>{if(!analysis)return;download(`SEC_${analysis.cik}_${analysis.filing.end}_证据.json`,JSON.stringify({...analysis,source_type:origin,source_url:ref(analysis.cik),snapshot_sha256:fileSha,generated_at:new Date().toISOString(),not_audit:true},null,2),'application/json;charset=utf-8')});
 document.querySelector('#sec-export-csv')?.addEventListener('click',()=>{if(!analysis)return;const f=analysis.filing;download(`SEC_${analysis.cik}_${f.end}_逐字段.csv`,csv([['cik','entity','accession','end','filed','field','concept','period_start','period_end','value_USD','status'],...analysis.rows.flatMap(x=>x.original.length?x.original.map(y=>[analysis.cik,analysis.entityName,f.accn,f.end,f.filed,x.key,y.tag,y.start,y.end,y.amount,x.status]):[[analysis.cik,analysis.entityName,f.accn,f.end,f.filed,x.key,'','','','',x.status]])]),'text/csv;charset=utf-8')});
}
global.QZSEC={render:draw,bind,_test:{instances,annual,factsFor,analyze,validCompany,hydrate,get:()=>({snapshot,analysis,origin})}};
})(window);
