/* v1.9 A-share filing evidence registry: offline source provenance and correction lineage.
   Domain recognition is NOT authentication. PDF bytes can be fetched only from a strict host allowlist through the local server.
   Source PDFs and extraction ledgers must be independently checked by the user. */
(function(global){'use strict';
const MAX_PDF=25*1024*1024, MAX_CSV=2*1024*1024;
const KINDS={annual:'年度报告',revision:'更正后年度报告',correction:'财务信息更正公告',audit:'审计报告/专项说明'};
const CHANNELS={cninfo:'巨潮资讯',sse:'上海证券交易所',szse:'深圳证券交易所',bse:'北京证券交易所'};
const OFFICIAL=['https://www.cninfo.com.cn/new/commonUrl?url=disclosure%2Flist%2Fnotice','https://www.sse.com.cn/disclosure/listedinfo/regular/','https://www.szse.cn/disclosure/listed/fixed/index.html'];
const KEY=['bs.total_assets','bs.total_liabilities','bs.total_equity','is.revenue','is.net_income','cf.operating_cf'];
let records=[],selected='',busy=false,notice='',code='',issuer='',year=2022,scope='consolidated',kind='annual',publish='',source='',title='',audit='unknown',revisionOf='',ack=false,confirmedSubject=false;
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=x=>Number.isFinite(x)?Number(x).toLocaleString('zh-CN',{maximumFractionDigits:5}):'—';
const csv=rows=>'\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r\n]/.test(s)&&!/^[-]?\d+(\.\d+)?$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(',')).join('\r\n');
const fingerprint=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
function website(raw){
 if(!raw)return {channel:'NOT_GIVEN',display:'未提供公告链接',url:''};
 let u;try{u=new URL(raw)}catch{return {channel:'INVALID',display:'公告链接格式不正确',url:''}};
 if(u.protocol!=='https:'||u.username||u.password)return {channel:'INVALID',display:'必须使用无账号信息的 HTTPS 地址',url:''};
 const h=u.hostname.toLowerCase().replace(/\.$/,'');
 let site='';if(h==='cninfo.com.cn'||h.endsWith('.cninfo.com.cn'))site='cninfo';
 else if(h==='sse.com.cn'||h.endsWith('.sse.com.cn'))site='sse';
 else if(h==='szse.cn'||h.endsWith('.szse.cn'))site='szse';
 else if(h==='bse.cn'||h.endsWith('.bse.cn'))site='bse';
 return {channel:site?'RECOGNIZED_DOMAIN':'OTHER_DOMAIN',display:site?CHANNELS[site]+' 域名形式（未联网核实）':'非白名单披露域名（未核实）',url:u.href,site};
}
function dateOk(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s}
function validateDraft(d,existing){
 if(!/^\d{6}$/.test(d.code))throw Error('股票代码必须为六位数字（不代表已核实上市主体）');
 if(!d.issuer||d.issuer.length>100)throw Error('请输入公告显示的企业全称（不超过100字）');
 if(!Number.isInteger(+d.year)||+d.year<2000||+d.year>2100)throw Error('报告年度无效');
 if(!Object.hasOwn(KINDS,d.kind))throw Error('公告类型无效');
 if(!['consolidated','individual'].includes(d.scope))throw Error('请选择合并或单体口径');
 if(!dateOk(d.published))throw Error('披露日期无效');
 if(!d.title||d.title.length>180)throw Error('请填写公告标题（不超过180字）');
 const w=website(d.url);if(w.channel==='INVALID')throw Error(w.display);
 if(d.kind==='revision'||d.kind==='correction'){
  const base=existing.find(x=>x.id===d.revisionOf);
  if(!base)throw Error('更正版本必须选择一份已登记的原始/上一版本报告');
  if(base.code!==d.code||base.issuer!==d.issuer||base.year!==+d.year||base.scope!==d.scope)throw Error('更正版本的企业、年度或会计口径与被更正版本不一致');
  if(d.published<base.published)throw Error('更正公告披露日不能早于被更正版本');
 }
 return w;
}
function diff(a,b){
 const k=x=>x.statement+'|'+x.year+'|'+x.field+'|'+x.basis;
 const left=new Map((a||[]).map(x=>[k(x),x])),right=new Map((b||[]).map(x=>[k(x),x]));
 return [...new Set([...left.keys(),...right.keys()])].sort().map(key=>{
  const x=left.get(key),y=right.get(key);let status=!x?'ADDED':!y?'REMOVED':'UNCHANGED',delta=null;
  if(x&&y){delta=y.normalizedWan-x.normalizedWan;const tol=Math.max(x.toleranceWan||0,y.toleranceWan||0,1e-9);if(Math.abs(delta)>tol)status='CHANGED'}
  return {key,status,before:x?.normalizedWan??null,after:y?.normalizedWan??null,delta,oldPage:x?.page||'',newPage:y?.page||''};
 });
}
function remoteCheck(r){
 if(!r?.online?.ok||r.online.url!==r.url||!r.online.sha256)
   return {status:'NOT_VERIFIED',message:'没有完成远端原件字节核对；仅能进行本地摘录与三表对照'};
 if(r.online.sha256.toLowerCase()!==r.sha256.toLowerCase())
   return {status:'REMOTE_BYTES_MISMATCH',message:'远端PDF与本地PDF的SHA-256不同。不得将本地数值匹配视为该公告原件的核验结果'};
 return {status:'REMOTE_BYTES_MATCH',message:'指定官方网址当前返回的PDF与本地文件逐字节一致；仍需核对企业主体、披露版本与是否存在后续更正'};
}
function impacted(changes){
 const map={
  'bs.total_assets':['资产负债率','总资产收益率','资产周转率'],
  'bs.total_liabilities':['资产负债率','流动/长期债务结构'],
  'bs.total_equity':['净资产收益率','权益乘数'],
  'is.revenue':['毛利率','净利率','收入同比','经营现金流收入比'],
  'is.net_income':['净利率','净资产收益率'],
  'is.cogs':['毛利率','成本率'],
  'cf.operating_cf':['经营现金流收入比','经营现金流质量'],
  'bs.current_assets':['流动比率'],
  'bs.current_liabilities':['流动比率']
 };
 return [...new Set((changes||[]).filter(x=>x.status!=='UNCHANGED').flatMap(x=>map[(x.key.split('|')[0]+'.'+x.key.split('|')[2])]||[]))];
}
function reportFor(r,proj,confirm){
 if(!r)return {status:'NO_DOCUMENT',message:'尚未选择公告',review:null};
 if(!proj)return {status:'NO_USER_DATA',message:'请先在01企业接入完成用户三表分析；公告核验不使用328家合成企业的数据',review:null};
 if(!proj.years.includes(r.year))return {status:'PERIOD_MISMATCH',message:'用户三表没有该公告对应的报告年度',review:null};
 if(proj.provenance?.basis!=='unknown'&&proj.provenance?.basis!==r.scope)return {status:'SCOPE_MISMATCH',message:'上传三表的合并/单体口径与公告不一致',review:null};
 if(!confirm)return {status:'SUBJECT_UNCONFIRMED',message:'请人工确认当前公告与上传三表为同一法人/合并主体及相同币种、年度口径',review:null};
 if(!r.facts?.length)return {status:'NO_EXTRACT',message:'当前公告未录入逐字段证据；仅登记PDF不能证明金额一致',review:null};
 const shadow={...proj,provenance:{...proj.provenance,basis:r.scope,evidenceSha:r.sha256,document:r.title,sourceUrl:r.url}};
 const review=global.QZDisclosure.reconcile(shadow,r.facts);
 const yr=review.byYear?.[r.year];const broken=review.rows.some(x=>x.year===r.year&&x.status==='DIFFERENCE');
 const issues=review.rows.filter(x=>x.year===r.year&&!['MATCH','TRAINING_MATCH'].includes(x.status));
 const state=broken?'DIFFERENCE':issues.length?'PARTIAL':yr?.requiredKeyMatched===KEY.length?(proj.provenance?.sourceKind==='training'?'TRAINING_MATCH':'LOCAL_MATCH'):'PARTIAL';
 if(remoteCheck(r).status==='REMOTE_BYTES_MISMATCH')return {status:'REMOTE_BYTES_MISMATCH',review,message:'远端指定PDF与本地PDF文件不一致；本地摘录核对不能作为该远端公告的证据，请先解决版本差异。'};
 return {status:state,review,message:state==='DIFFERENCE'?'披露摘录与上传三表存在数值差异，应暂停将这些字段用于对外结论':state==='LOCAL_MATCH'?'6个关键字段已完成本地匹配；这不是官方来源认证':state==='TRAINING_MATCH'?'6个关键字段与教学合成数据匹配；绝不代表真实上市公司公告':`核对未完成，关键字段覆盖 ${yr?.requiredKeyMatched||0}/${KEY.length}，还有${issues.length}项未匹配/待核查`};
}
function save(filename,content,type){const u=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function block(title,hint,body){return `<section class="studio-panel"><div class="studio-panelhead"><h3>${title}</h3><small>${hint}</small></div>${body}</section>`}
const field=(id,label,value='',type='text',placeholder='')=>`<label class="studio-field">${label}<input id="cn-${id}" type="${type}" value="${escape(value)}" placeholder="${escape(placeholder)}"/></label>`;
function menu(id,label,options,val){return `<label class="studio-field">${label}<select id="cn-${id}" class="form-select">${options.map(([k,v])=>`<option value="${escape(k)}" ${val===k?'selected':''}>${escape(v)}</option>`).join('')}</select></label>`}
function selectedRecord(){return records.find(x=>x.id===selected)}
function syncDraft(){const v=k=>document.querySelector('#cn-'+k)?.value??'';code=v('code');issuer=v('issuer');year=Number(v('year'));scope=v('scope');kind=v('kind');publish=v('published');source=v('url');title=v('title');audit=v('audit');revisionOf=v('previous');ack=!!document.querySelector('#cn-ack')?.checked}
function render(){const r=selectedRecord(),proj=global.QZUser?.getProject?.(),status=reportFor(r,proj,confirmedSubject),rev=records.find(x=>x.id===r?.revisionOf),changes=rev?diff(rev.facts||[],r.facts||[]):[];
 let html=`<section class="lab-hero"><div class="eyebrow">A-SHARE / DISCLOSURE EVIDENCE REGISTER</div><h2>12 · A股公告证据与版本核验</h2><p>登记原始公告、修订与更正版本，记录PDF指纹、报告主体、期间和审计意见，再用独立数值证据台账与用户三表对账。<strong>域名识别、PDF哈希或数值一致，都不代表官方真实性认证。</strong></p><div class="lab-headline"><span>公告原件与更正版本</span><span>人民币/万元独立口径</span><span>源文件 SHA-256</span><span>不接入合成评分模型</span></div></section>`;
 html+=block('01 · 公告原件登记','用户主动上传PDF；浏览器本地计算哈希，不把文件提交给外部网站',`<div class="cn-form-grid">
 ${field('code','股票代码（六位）',code,'text','仅做录入格式核查')}${field('issuer','公告披露企业全称',issuer,'text','与原文一致')}${field('year','报告年度',year,'number')}${field('published','公告披露日期',publish,'date')}${field('title','公告完整标题',title,'text','示例：2022年年度报告')}${field('url','公告来源 HTTPS 链接',source,'url','联网指纹核对需官方 PDF 直接网址，以 .pdf 结尾')}
 ${menu('scope','报表编报主体',[['consolidated','合并报表'],['individual','单体报表']],scope)}${menu('kind','公告类型',Object.entries(KINDS),kind)}${menu('audit','审计意见（仅用户录入）',[['unknown','尚未核实'],['standard','标准无保留意见'],['emphasis','无保留意见（含强调/持续经营事项段）'],['qualified','保留意见'],['disclaimer','无法表示意见'],['adverse','否定意见']],audit)}
 ${menu('previous','被更正的版本',[['','不关联（原始/独立公告）'],...records.map(x=>[x.id,`${x.code} · ${x.year} · ${x.title}`])],revisionOf)}
 </div><label class="studio-field">原始 PDF（最多25MB）<input type="file" id="cn-pdf" accept=".pdf,application/pdf"/></label><label class="user-confirm"><input type="checkbox" id="cn-ack" ${ack?'checked':''}/>我已人工检查报告主体、年度、合并口径和文件内容，并理解系统不会自动认证公告来源。</label><div class="action-row"><button type="button" class="primary-btn" id="cn-register" ${busy?'disabled':''}>登记 PDF 与公告版本</button></div><div class="info">官方检索入口：${OFFICIAL.map((url,i)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${['巨潮资讯公告','上交所定期报告','深交所定期报告'][i]}</a>`).join(' · ')}。公告链接只检查域名形式，不自动下载、不宣称已核实更正公告是否为最新版本。</div>`);
 html+=block(`02 · 公告版本台账（${records.length}）`,'同一企业、同一年度的更正公告与原件分开保存，不覆盖历史记录', records.length?`<div class="sec-scroll"><table class="data-table"><thead><tr><th>版本</th><th>企业 / 年度</th><th>披露日期</th><th>来源</th><th>指纹</th><th>操作</th></tr></thead><tbody>${records.map((x,i)=>`<tr><td>${i+1}. ${escape(KINDS[x.kind])}</td><td>${escape(x.issuer)} / ${x.year}<small>${escape(x.code)} · ${x.scope==='consolidated'?'合并':'单体'}</small></td><td>${escape(x.published)}</td><td>${escape(x.urlInfo.display)}</td><td><code>${escape(x.sha256.slice(0,15))}…</code></td><td><button type="button" class="tiny-button cn-pick" data-id="${escape(x.id)}">${x.id===selected?'已选中':'查看/核对'}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="info">尚未登记公告。可先使用 sample_uploads 中的教学 PDF 演示整个流程；教学文档并非真实上市公司公告。</div>');
 if(r){html+=block('03 · 当前公告的原始证据与逐字段核对','核对需要01用户企业三表，且金额币种均为人民币，禁止自动合并美元SEC数据',`<div class="cn-record"><b>${escape(r.title)}</b><span>${escape(r.code)} · ${r.year} 年 · ${escape(r.published)} · ${escape(r.urlInfo.display)}</span><span>原件：${escape(r.filename)} · SHA-256 <code>${escape(r.sha256)}</code></span><span>审计意见（用户录入）：${escape(r.audit)}；来源状态：未自动认证；更正关联：${escape(rev?.title||'无')}</span></div><div class="cn-online-check"><div class="cn-online-label"><strong>v1.9 · 官方网站 PDF 原件字节核对</strong><span class="pill ${remoteCheck(r).status==='REMOTE_BYTES_MATCH'?'':'gold'}">${escape(remoteCheck(r).status)}</span></div><p>${escape(remoteCheck(r).message)}</p><small>直接获取当前URL的PDF字节并计算SHA-256；禁止非白名单网站、跨域重定向或非PDF内容。本操作需要本机联网，仅传递公告网址，不上传你的财务报表。</small>${r.online?.checkedAt?`<div class="info">核对时间：${escape(r.online.checkedAt)} · 远端SHA-256：${escape(r.online.sha256||'未取得')} · ${r.online.ok?fmt(r.online.bytes)+' 字节':'访问失败：'+escape(r.online.error||'未核实')}</div>`:''}<div class="action-row"><button type="button" class="ghost-btn" id="cn-remote-check" ${busy?'disabled':''}>在线获取原始PDF并对比 SHA-256 ↗</button></div></div><div class="action-row"><button class="ghost-btn" id="cn-open-pdf">打开本地PDF人工核对 ↗</button><button class="ghost-btn" id="cn-csv-template">下载字段摘录模板 CSV ↓</button></div><label class="studio-field">该PDF的原始数值摘录 CSV（可由 v1.6 人工确认后整理）<input type="file" id="cn-csv" accept=".csv,text/csv"/></label><label class="user-confirm"><input id="cn-confirm-subject" type="checkbox" ${confirmedSubject?'checked':''}/>我已核对公告与01用户三表为相同企业/期间/会计口径，且不是使用其他企业或真实/仿真混合数据。</label><div class="info">上传者原始三表：${escape(proj?.name||'尚未导入')}；财务口径：${escape(proj?.provenance?.basis||'无')}；核验结果：<strong>${escape(status.status)}</strong> — ${escape(status.message)}</div>${status.review?`<div class="studio-overview"><div class="studio-stat"><span>核对总字段</span><strong>${status.review.counts.total}</strong></div><div class="studio-stat"><span>相符项</span><strong>${status.review.counts.match}</strong></div><div class="studio-stat"><span>原文差异</span><strong>${status.review.counts.difference}</strong></div><div class="studio-stat"><span>未核实项</span><strong>${status.review.counts.unresolved}</strong></div></div><div class="sec-scroll"><table class="data-table"><thead><tr><th>项目</th><th>页码</th><th>上传值/万元</th><th>原文摘录/万元</th><th>状态</th></tr></thead><tbody>${status.review.rows.filter(x=>x.year===r.year).map(x=>`<tr><td>${escape(x.statement+'.'+x.field)}</td><td>${escape(x.page)}</td><td>${fmt(x.uploadedWan)}</td><td>${fmt(x.normalizedWan)}</td><td>${escape(x.status)}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="action-row"><button class="ghost-btn" id="cn-export-json">导出公告核验 JSON ↓</button><button class="ghost-btn" id="cn-export-csv">导出字段对账 CSV ↓</button><button class="ghost-btn" id="cn-to-user">进入10 用户数据诊断 →</button></div>`);
 if(rev){html+=block('04 · 更正前后数值版本差异','比较的是两份独立来源摘录；更正是否被官方正式采纳仍需查阅原公告',changes.length?`<div class="studio-overview"><div class="studio-stat"><span>可比字段</span><strong>${changes.length}</strong></div><div class="studio-stat"><span>金额已变</span><strong>${changes.filter(x=>x.status==='CHANGED').length}</strong></div><div class="studio-stat"><span>新增字段</span><strong>${changes.filter(x=>x.status==='ADDED').length}</strong></div><div class="studio-stat"><span>删除字段</span><strong>${changes.filter(x=>x.status==='REMOVED').length}</strong></div></div><div class="sec-scroll"><table class="data-table"><thead><tr><th>字段 / 期间 / 口径</th><th>原版万元</th><th>新版本万元</th><th>差额</th><th>状态</th></tr></thead><tbody>${changes.map(x=>`<tr><td>${escape(x.key)}</td><td>${fmt(x.before)}</td><td>${fmt(x.after)}</td><td>${fmt(x.delta)}</td><td>${escape(x.status)}</td></tr>`).join('')}</tbody></table></div><div class="cn-revision-impact"><strong>版本更正后的重新计算提醒</strong><p>${changes.some(x=>x.status!=='UNCHANGED')?'以下指标依赖发生变化的原始字段：'+escape(impacted(changes).join('、')||'未覆盖的指标依赖，需人工判断'):'目前录入的字段未发现超出舍入精度的变化。'}。<strong>仅显示依赖关系，不会擅自改写用户上传数据、历史研究报告或冻结评分。</strong>要得到更正后的正式结论，需重新导入完整的更正后三表并通过数据治理。</p></div><div class="action-row"><button id="cn-export-diff" class="ghost-btn">导出版本差异 CSV ↓</button></div>`:'<div class="info">至少一个版本尚未导入人工核实的数值台账，暂不能判定更正字段范围。</div>')}
 }
 if(notice)html+=`<div class="studio-message">${escape(notice)}</div>`;
 return html;
}
function bind(){const $=sel=>document.querySelector(sel);
 $('#cn-register')?.addEventListener('click',async()=>{if(busy)return;syncDraft();const file=$('#cn-pdf')?.files?.[0];try{
  if(!ack)throw Error('必须先确认已人工检查来源原件和内容');
  const draft={code,issuer:issuer.trim(),year,kind,scope,published:publish,title:title.trim(),url:source.trim(),audit,revisionOf};
  const info=validateDraft(draft,records);
  if(!file||file.size<50||file.size>MAX_PDF)throw Error('请上传 50B—25MB 的 PDF');
  const lead=new Uint8Array(await file.slice(0,5).arrayBuffer());if(String.fromCharCode(...lead)!=='%PDF-')throw Error('文件内容不是标准PDF文件头');
  busy=true;const hash=await fingerprint(file);const key=records.find(x=>x.sha256===hash&&x.code===code&&x.year===year&&x.kind===kind);
  if(key)throw Error('相同PDF/企业/年度/公告类型已登记，不能重复创建');
  const id='cn'+Date.now().toString(36)+'-'+records.length;
  records.push({...draft,id,year:+year,filename:file.name.slice(0,180),size:file.size,sha256:hash,urlInfo:info,file,facts:[],online:null,added:new Date().toISOString()});selected=id;notice=`已登记本地PDF指纹：${hash.slice(0,18)}…；${info.display}。来源真实性仍待人工核实。`;confirmedSubject=false;
 }catch(e){notice=e.message}finally{busy=false;global.QZCN.refresh()}});
 document.querySelectorAll('.cn-pick').forEach(el=>el.addEventListener('click',()=>{selected=el.dataset.id;notice='';confirmedSubject=false;global.QZCN.refresh()}));
 $('#cn-open-pdf')?.addEventListener('click',()=>{const r=selectedRecord();if(!r?.file)return;const u=URL.createObjectURL(r.file);const w=window.open(u,'_blank','noopener,noreferrer');if(!w)notice='弹出窗口被阻止，请允许此页面打开PDF预览';setTimeout(()=>URL.revokeObjectURL(u),60000)});
 $('#cn-csv-template')?.addEventListener('click',()=>save('企财智策_A股公告字段摘录模板.csv',global.QZDisclosure.blankTemplate(),'text/csv;charset=utf-8'));
 $('#cn-remote-check')?.addEventListener('click',async()=>{
  const r=selectedRecord();if(!r||busy)return;
  if(!r.url||!r.urlInfo.site){notice='必须登记可识别的官方直接PDF网址；非官方域名不支持联网查询';global.QZCN.refresh();return}
  busy=true;const currentId=r.id;
  try{
   const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),24000);
   let data;try{
    const response=await fetch('/api/cn-pdf-integrity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:r.url}),signal:ac.signal});
    data=await response.json();
    if(!response.ok||!data.ok)throw Error(data.error||'获取PDF失败');
   }finally{clearTimeout(timeout)}
   if(r.id!==currentId)return;
   r.online={ok:true,url:r.url,canonicalUrl:data.url,sha256:data.sha256,bytes:data.bytes,checkedAt:data.checkedAt,host:data.host};
   notice=remoteCheck(r).message;
  }catch(e){r.online={ok:false,url:r.url,error:String(e.message||e).slice(0,160),checkedAt:new Date().toISOString()};notice='联网未完成：'+r.online.error+'。本地人工审计仍可进行。'}
  finally{busy=false;global.QZCN.refresh()}
 });
 $('#cn-confirm-subject')?.addEventListener('change',e=>{confirmedSubject=e.target.checked;global.QZCN.refresh()});
 $('#cn-csv')?.addEventListener('change',async e=>{const file=e.target.files?.[0],r=selectedRecord();if(!r||!file)return;try{
  if(file.size<20||file.size>MAX_CSV)throw Error('核对CSV文件大小应在20B—2MB');
  const facts=global.QZDisclosure.splitCsv(await file.text());
  if(!facts.length||facts.some(x=>x.source_pdf_sha256!==r.sha256))throw Error('CSV来源PDF SHA-256与当前原件不一致：禁止跨文件借用数据');
  if(facts.some(x=>x.year!==r.year||x.basis!==r.scope))throw Error('CSV年份或编报口径与当前公告不一致');
  const duplicates=new Set();for(const x of facts){const k=x.year+'|'+x.statement+'|'+x.field+'|'+x.basis;if(duplicates.has(k))throw Error('同年度/报表/字段重复，禁止自动选择一个数值');duplicates.add(k)}
  r.facts=facts;r.ledgerName=file.name.slice(0,120);notice=`已导入 ${facts.length} 条与源PDF哈希匹配的摘录。只有另行核实原文位置才可以作为证据使用。`;
 }catch(err){notice=err.message}global.QZCN.refresh()});
 $('#cn-export-json')?.addEventListener('click',()=>{const r=selectedRecord();if(!r)return;const proj=global.QZUser?.getProject?.(),review=reportFor(r,proj,confirmedSubject);const meta=records.map(({file,facts,...m})=>({...m,extractedFieldCount:facts.length}));const payload={schema:'qicai-cn-evidence-1.9',generated:new Date().toISOString(),authenticityVerified:false,officialOnlineChecked:Boolean(r.online?.ok),originalPdfIncluded:false,records:meta,selected:r.id,remoteIntegrity:remoteCheck(r),assessment:review,limitations:['联网PDF仅校验指定官方URL与本地文件的字节一致性，无法自动证明公告主体、最终版本及审计真实性','文件指纹证明本机文件一致，不证明公示来源','核对依赖用户人工摘录和确认，非第三方审计','未自动识别更正公告是否为最终有效版本','不混用美元SEC数据或合成行业模型']};save(`企财智策_${r.code}_${r.year}_公告来源审计.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8')});
 $('#cn-export-csv')?.addEventListener('click',()=>{const r=selectedRecord();if(!r)return;const review=reportFor(r,global.QZUser?.getProject?.(),confirmedSubject).review;const rows=[['字段','PDF页码','上传万元','摘录万元','差额','状态','原件SHA256','公告URL','报告年度']];for(const x of review?.rows||[])if(x.year===r.year)rows.push([x.statement+'.'+x.field,x.page,x.uploadedWan,x.normalizedWan,x.delta,x.status,r.sha256,r.url,r.year]);save(`企财智策_${r.code}_${r.year}_披露字段对账.csv`,csv(rows),'text/csv;charset=utf-8')});
 $('#cn-export-diff')?.addEventListener('click',()=>{const r=selectedRecord(),base=records.find(x=>x.id===r?.revisionOf);if(!base)return;save(`企财智策_${r.code}_${r.year}_更正差异.csv`,csv([['字段','状态','原版万元','更正版万元','差额万元','原页码','新页码'],...diff(base.facts,r.facts).map(x=>[x.key,x.status,x.before,x.after,x.delta,x.oldPage,x.newPage])]),'text/csv;charset=utf-8')});
 $('#cn-to-user')?.addEventListener('click',()=>global.QZUser?.go('user'));
}
const api={render,bind,refresh:()=>{if(typeof global.render==='function')global.render()},_test:{website,dateOk,validateDraft,diff,reportFor,remoteCheck,impacted,KEY}};
global.QZCN=api;
})(window);
