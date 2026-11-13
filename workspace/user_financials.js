/* Qicaizhice v1.4: session-only, source-backed user financial statement analysis.
   No uploaded bytes or rows are sent to the server or localStorage. No synthetic model is run on user data. */
(function(global){
'use strict';
const TYPES=['bs','is','cf'];
const TYPE_NAMES={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
const FIELD_SPECS={
 bs:[
 ['year','财政年度','年份|年度|fiscal_year|year',true],
 ['total_assets','资产合计','资产总计|总资产|资产合计|total_assets',true],
 ['total_liabilities','负债合计','负债总计|总负债|负债合计|total_liabilities',true],
 ['total_equity','所有者权益','所有者权益合计|股东权益合计|所有者权益|total_equity',true],
 ['current_assets','流动资产','流动资产合计|流动资产|total_current_assets|current_assets',false],
 ['current_liabilities','流动负债','流动负债合计|流动负债|total_current_liabilities|current_liabilities',false],
 ['accounts_receivable','应收账款','应收账款|accounts_receivable',false],
 ['inventory','存货','存货|inventory',false],
 ['cash','货币资金/现金等价物','货币资金|现金及现金等价物|cash_and_cash_equivalents|cash',false]
 ],
 is:[
 ['year','财政年度','年份|年度|fiscal_year|year',true],
 ['revenue','营业收入','营业收入|主营业务收入|revenue|operating_revenue',true],
 ['net_income','净利润','净利润|net_income|net_profit',true],
 ['cogs','营业成本','营业成本|主营业务成本|cost_of_goods_sold|operating_cost|cogs',false],
 ['gross_profit','毛利润','毛利润|毛利|gross_profit',false],
 ['selling_expense','销售费用','销售费用|selling_expense',false],
 ['admin_expense','管理费用','管理费用|admin_expense|administrative_expenses',false],
 ['rd_expense','研发费用','研发费用|research_and_development|rd_expense',false],
 ['interest_expense','利息费用','利息费用|利息支出|interest_expense',false]
 ],
 cf:[
 ['year','财政年度','年份|年度|fiscal_year|year',true],
 ['operating_cf','经营活动现金流量净额','经营活动产生的现金流量净额|经营现金流净额|net_cash_from_operating_activities|operating_cf',true],
 ['investing_cf','投资活动现金流量净额','投资活动产生的现金流量净额|net_cash_from_investing_activities|investing_cf',false],
 ['financing_cf','筹资活动现金流量净额','筹资活动产生的现金流量净额|net_cash_from_financing_activities|financing_cf',false],
 ['fx_effect','汇率变动影响','汇率变动影响|汇率变动对现金及现金等价物的影响|fx_effect',false],
 ['opening_cash','期初现金余额','期初现金余额|期初现金及现金等价物余额|beginning_cash|opening_cash',false],
 ['ending_cash','期末现金余额','期末现金余额|期末现金及现金等价物余额|ending_cash',false],
 ['net_change_cash','现金净增加额','现金净增加额|现金及现金等价物净增加额|net_change_in_cash|net_change_cash',false]
 ]
};
const UNITS={yuan:0.0001,wan:1,yi:10000};
const unitLabels={yuan:'元',wan:'万元',yi:'亿元'};
let uploaded={}, project=null, errorText='', phase='upload', selectedYear=null, encode='utf8', confirmedSameEntity=false, restatementApproved=false;
let focusChoice=null; // v2.2 issue/metric selection; now retained in optional project archive.
let currentInputs=null, revisions=[], activeRevision=null, reviseMode=false, archiveStatus='', changeSummary=null;
let serverCurrent=null,serverProjects=[],serverSelectedId=null,serverLoaded=false,serverStatus='';
let continuityMetric='net_margin',watchNotes={},watchEditingKey=null,watchStatus='';
let caseRecords={},caseEditingKey=null,caseStatus='';
let startMode='annual',reportScope='annual';
let deliveryParts={findings:true,metrics:true,trends:true,cases:true,sources:true},deliveryStatus='',reportRecords=[],selectedReportId=null;
const snapshotId=()=>('v'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
const cloneJson=v=>JSON.parse(JSON.stringify(v));
const sourceYears=(source,tables)=>Object.fromEntries(TYPES.map(t=>[t,Object.fromEntries(Object.keys(tables[t]||{}).map(y=>[y,cloneJson(source[t])]))]));
const metadataYears=(metadata,tables)=>Object.fromEntries(Object.keys(tables.bs||{}).map(y=>[y,cloneJson(metadata||{})]));
function addRevision(inputs,reason){
 if(revisions.length>=25)throw Error('项目已达25个修订快照，请导出归档后创建新项目；不会静默删除历史');
 const payload={schema:'qcz.project-snapshot.v1',calculation_engine_version:window.QZInsights.version,name:inputs.name,tables:cloneJson(inputs.tables),source:cloneJson(inputs.source),sourceByYear:cloneJson(inputs.sourceByYear),provenanceByYear:cloneJson(inputs.provenanceByYear),provenance:cloneJson(inputs.provenance),period_data:inputs.period_data?cloneJson(inputs.period_data):undefined};
 const item={id:snapshotId(),created_at:new Date().toISOString(),reason,payload};revisions.push(item);activeRevision=item.id;
}
function applySnapshot(payload){
 const P=compute({tables:payload.tables,name:payload.name,source:payload.source,sourceByYear:payload.sourceByYear,provenanceByYear:payload.provenanceByYear,provenance:payload.provenance,period_data:payload.period_data});
 // Compute new results every restore; never accept previously serialized scores.
 currentInputs=cloneJson({tables:payload.tables,name:payload.name,source:payload.source,sourceByYear:payload.sourceByYear,provenanceByYear:payload.provenanceByYear,provenance:payload.provenance,period_data:payload.period_data||null});
 window.QZPeriodUI?.sync(currentInputs.period_data);
 project=P;companyName=payload.name;provenance=cloneJson(payload.provenance);selectedYear=P.years.at(-1)||null;reportScope=P.years.length?'annual':'period';focusChoice=null;
 return P;
}
function createPeriodProject(book,name){
 const checked=window.QZPeriods.validateBook(book),entity=String(name||'').trim();
 if(!entity||entity.length>80)throw Error('请填写不超过80字的企业名称');
 if(project&&!confirm('将切换到新的企业期间项目；请先保存当前工作。确定继续吗？'))return false;
 const tables={bs:{},is:{},cf:{}},source=Object.fromEntries(TYPES.map(t=>[t,{label:'未上传年度报表',sha:'',unit:'wan',mapping:{}}]));
 const inputs={name:entity,tables,source,sourceByYear:{bs:{},is:{},cf:{}},provenanceByYear:{},provenance:window.QZTrust.normalize({sourceKind:'unknown',basis:'unknown',standard:'unknown',revision:'unknown',document:'',sourceUrl:'',sourceDate:'',note:'',evidenceName:'',evidenceSha:''}),period_data:cloneJson(checked)};
 const created=compute(inputs);
 serverCurrent=null;reportRecords=[];selectedReportId=null;revisions=[];activeRevision=null;caseRecords={};watchNotes={};
 addRevision(inputs,'首次期间三表接入');currentInputs=cloneJson(inputs);project=created;companyName=entity;selectedYear=null;
 reportScope='period';window.QZPeriodUI?.sync(checked);archiveStatus='月度/季度企业项目已建立。请在项目管理区主动保存到 SQLite，以便下次继续。';
 global.QZUser.go('user');return true;
}
function discloseState(){return {filename:disclosure.filename,sha256:disclosure.sha256,method:disclosure.method||'none',facts:cloneJson(disclosure.facts||[])}}
function serverPanelHtml(){
 const options=serverProjects.map(p=>`<option value="${esc(p.id)}" ${serverSelectedId===p.id?'selected':''}>${esc(p.display_name)} · ${p.year_count?p.year_count+'年':'期间项目'} · ${p.version_count}个财务快照 · ${esc(p.updated_at.slice(0,16).replace('T',' '))}</option>`).join('');
 return `<section class="panel project-manager" id="server-project-manager"><div class="panel-head"><div class="panel-title">企业项目库 · 可长期继续分析</div><div class="panel-note">本机 SQLite 保存于用户数据目录，不随本压缩包升级清空；仅点击「保存」才写入，不联网同步</div></div>
 <div class="filter-bar"><label>本机已保存项目 <select class="form-select" id="server-project-select" style="min-width:260px"><option value="">${serverLoaded?'请选择一个企业':'点击右侧「查看本机项目」'}</option>${options}</select></label>
 <button class="ghost-btn" id="server-project-refresh">查看本机项目</button><button class="ghost-btn" id="server-project-open">打开所选项目 →</button></div>
 <div class="action-row">${project?'<button class="primary-btn" id="server-project-save">保存当前企业到本机项目库</button>':''}<button class="ghost-btn" id="server-project-backup">备份项目数据库</button><button class="ghost-btn" id="server-project-check">检查数据安全状态</button></div>
 ${project?`<div class="mini-muted">${serverCurrent?'当前企业已关联本机项目；再次保存将建立新的数据库修订号，财务历史快照仍完整保留。':'当前会话尚未关联本机项目；首次点击保存将创建一个新项目。'} 数据库修改不会自动发生。</div>`:''}
 ${serverStatus?`<div class="info" role="status">${esc(serverStatus)}</div>`:''}
 <div class="mini-muted">备份 SQLite 文件仍保存在本机的备份文件夹，请另行复制到安全位置。恢复请先停止软件，再双击解压目录的「项目维护与恢复.bat」；本页面不会直接覆盖数据库。原「导出项目 JSON」仍可跨电脑恢复。</div></section>`;
}
function archiveControls(){
 const active=revisions.find(r=>r.id===activeRevision);return `<section class="panel project-manager" id="project-manager"><div class="panel-head"><div class="panel-title">继续分析这家企业 · 本地项目与修订</div><div class="panel-note">只在你点击时保存；原始 XLSX/CSV/PDF 文件字节不包含在备份中</div></div>
 <div class="action-row"><button class="primary-btn" id="project-export">导出可移植项目包 JSON ↓</button><button class="ghost-btn" id="project-save-local">保存到此浏览器</button><button class="ghost-btn" id="project-load-local">恢复浏览器保存</button><button class="ghost-btn" id="project-revise">${project?.years?.length?'追加年度 / 更正财报':'补充年度三表（可选）'} →</button></div>
 <div class="filter-bar"><label>打开历史财务版本 <select class="form-select" id="project-revision">${revisions.map((v,i)=>`<option value="${esc(v.id)}" ${v.id===activeRevision?'selected':''}>版本 ${i+1} · ${esc(v.reason)} · ${esc(v.created_at.slice(0,16).replace('T',' '))}</option>`).join('')}</select></label><button class="ghost-btn" id="project-restore">查看/恢复所选版本</button></div>
 <div class="mini-muted">当前快照：${esc(active?.id||'尚未记录')} · ${revisions.length} 个财务版本。更正生成新快照，旧报告不会被悄悄改写，应重新核算及导出。SHA-256 只识别字节变化，不保证来源真实性。</div>
 ${changeSummary?.period_changed?`<div class="info">最近一次变更涉及月度/季度期间账簿；原年度财务指标没有因此自动修改。期间报表来源、历史快照及导出报告应以当前版本为准。若为旧版本查看，勿将其当作最新结论。</div>`:changeSummary?`<div class="info">最近一次修订：${esc(changeSummary.years.join('、')||'无')} 年，改变 ${changeSummary.changed_fields} 个原始财务字段；${changeSummary.metric_changes?.length||0} 个年度指标结果发生变化。${changeSummary.metric_changes?.length?`变化指标：${esc(changeSummary.metric_changes.slice(0,7).map(x=>x.year+' '+x.label).join('、'))}${changeSummary.metric_changes.length>7?'等':''}。`:''}此前导出的报告应以原版本为准，当前结果需要重新导出。</div>`:''}
 ${archiveStatus?`<div class="info">${esc(archiveStatus)}</div>`:''}</section>${serverPanelHtml()}`;
}
function importControls(){return `<section class="panel project-manager"><div class="panel-head"><div class="panel-title">恢复以前分析过的企业</div><div class="panel-note">选择自己曾导出的企财智策项目 JSON；导入前检查包完整性并重新计算三表</div></div><div class="filter-bar"><label>项目备份文件 <input class="input-control" type="file" id="project-import" accept=".json,application/json"/></label><button class="ghost-btn" id="project-load-local">从此浏览器恢复</button></div>${archiveStatus?`<div class="info">${esc(archiveStatus)}</div>`:''}<div class="mini-muted">仅导入本系统生成的 qcz.project-archive.v1；不从外部自动同步。请妥善保管本地财务资料及包含标准化金额的备份包。</div></section>${serverPanelHtml()}`} 
async function exportArchive(){if(!currentInputs||!revisions.length)throw Error('没有可保存的财务项目');return window.QZProjects.create(revisions,activeRevision,{year:selectedYear,focus:focusChoice,trend_metric:continuityMetric,watch_notes:watchNotes,case_records:caseRecords,report_records:reportRecords,disclosure:discloseState()})}
async function restoreArchive(contents){
 const pack=await window.QZProjects.parse(contents);
 // Preflight *all* versions and recompute; do not mutate user session until validation succeeds.
 const computed=pack.revisions.map(v=>compute({...v.payload,sourceByYear:v.payload.sourceByYear}));
 if(computed.some((p,i)=>!p.years.length&&!pack.revisions[i].payload.period_data))throw Error('存在既没有完整年度三表、也没有有效期间账簿的版本');
 if(project&&!confirm('导入将切换当前企业项目；请先导出当前项目包。确定继续吗？'))return false;
 serverCurrent=null;revisions=pack.revisions.map(v=>({id:v.id,created_at:v.created_at,reason:v.reason,payload:cloneJson(v.payload)}));activeRevision=pack.active_id;
 const target=revisions.find(v=>v.id===activeRevision);applySnapshot(target.payload);
 const choice=Number(pack.view?.year);if(project.years.includes(choice))selectedYear=choice;
 focusChoice=window.QZProjects._test.normalizeFocus(pack.view?.focus);
 continuityMetric=window.QZContinuity.METRICS.includes(pack.view?.trend_metric)?pack.view.trend_metric:'net_margin';watchNotes=window.QZProjects._test.normalizeWatchNotes(pack.view?.watch_notes);watchEditingKey=null;watchStatus='';caseRecords=window.QZCases.validate(pack.view?.case_records);caseEditingKey=null;caseStatus='';reportRecords=window.QZReports?window.QZReports.valid(pack.view?.report_records):[];selectedReportId=reportRecords.at(-1)?.id||null;
 const d=pack.view?.disclosure||{};disclosure={filename:d.filename||'',sha256:d.sha256||'',facts:d.facts||[],method:d.method||'none',review:null,error:''};
 if(disclosure.facts.length)disclosure.review=window.QZDisclosure.reconcile(project,disclosure.facts);
 archiveStatus='已恢复 '+project.name+' 的 '+revisions.length+' 个财务版本，计算结果已重新生成。';reviseMode=false;uploaded={};changeSummary=null;
 window.QZUser.go('user');return true;
}
function bindServerTools(){
 document.querySelector('#server-project-select')?.addEventListener('change',e=>{serverSelectedId=e.target.value||null});
 document.querySelector('#server-project-refresh')?.addEventListener('click',async()=>{
  try{serverProjects=await window.QZProjectStore.list();serverLoaded=true;
   if(!serverProjects.some(p=>p.id===serverSelectedId))serverSelectedId=serverProjects[0]?.id||null;
   serverStatus=serverProjects.length?`找到 ${serverProjects.length} 个本机企业项目；选择后可直接继续分析。`:'本机暂无已保存项目。可以先上传财报，再保存到项目库。';
  }catch(e){serverStatus='读取本机项目失败：'+e.message}window.QZUser.refresh();
 });
 document.querySelector('#server-project-save')?.addEventListener('click',async()=>{
  try{const pack=await exportArchive();const r=await window.QZProjectStore.save(pack,serverCurrent);
   serverCurrent={id:r.id,revision:r.revision};serverSelectedId=r.id;serverProjects=await window.QZProjectStore.list();serverLoaded=true;
   serverStatus='已写入本机 SQLite · 数据库修订 '+r.revision+'。旧版 JSON 导出与当前财务历史快照仍可使用。';
  }catch(e){serverStatus='本机保存未完成：'+e.message+'；未自动覆盖已保存项目。'}window.QZUser.refresh();
 });
 document.querySelector('#server-project-open')?.addEventListener('click',async()=>{
  if(!serverSelectedId){serverStatus='请先点击查看本机项目，再选择需要打开的企业。';window.QZUser.refresh();return}
  try{const r=await window.QZProjectStore.load(serverSelectedId);const restored=await restoreArchive(JSON.stringify(r.archive));
   if(restored){serverCurrent={id:r.id,revision:r.revision};serverStatus='已从本机项目库恢复 '+project.name+'，财务数值与历史版本已重新计算。';window.QZUser.refresh();}
  }catch(e){serverStatus='打开项目失败：'+e.message;window.QZUser.refresh()}
 });
 document.querySelector('#server-project-check')?.addEventListener('click',async()=>{
  try{const s=await window.QZProjectStore.status();serverStatus=s.healthy?`本机项目库正常：${s.project_count} 个企业项目，${s.backup_count} 份本地备份。备份仍需复制到其他安全位置。`:'项目数据库检查异常；请不要继续修改财务数据，先运行「项目维护与恢复.bat」并保留现有文件。';}
  catch(e){serverStatus='本机数据自检失败：'+e.message+'；请使用离线维护工具检查。'}window.QZUser.refresh();
 });
 document.querySelector('#server-project-backup')?.addEventListener('click',async()=>{
  try{const b=await window.QZProjectStore.backup();serverStatus='数据库一致性备份成功：'+b.backup_directory+' / '+b.file_name+'。请另行复制到外部安全位置。';}
  catch(e){serverStatus='数据库备份失败：'+e.message}window.QZUser.refresh();
 });
}
function bindArchiveTools(){
 bindServerTools();
 document.querySelector('#project-export')?.addEventListener('click',async()=>{try{const pack=await exportArchive();download('企财智策_'+project.name+'_可移植项目_'+pack.active_id+'.json',JSON.stringify(pack,null,2),'application/json;charset=utf-8');archiveStatus='已导出包含标准化三表和历史版本的本地项目包；请另行妥善备份。';}catch(e){archiveStatus=e.message}window.QZUser.refresh()});
 document.querySelector('#project-save-local')?.addEventListener('click',async()=>{try{const a=await exportArchive();await window.QZProjects.saveLocal(a);archiveStatus='已按你的点击保存到本浏览器 IndexedDB；换浏览器或清理站点数据可能丢失，仍建议导出备份。'}catch(e){archiveStatus='保存失败：'+e.message}window.QZUser.refresh()});
 document.querySelector('#project-load-local')?.addEventListener('click',async()=>{try{const v=await window.QZProjects.loadLocal();if(!v)throw Error('该浏览器尚无已保存项目');await restoreArchive(JSON.stringify(v))}catch(e){archiveStatus='恢复失败：'+e.message;window.QZUser.refresh()}});
 document.querySelector('#project-import')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>8*1024*1024||file.size<100||!file.name.toLowerCase().endsWith('.json'))throw Error('只接受8MB以内的项目 JSON 文件');await restoreArchive(await file.text())}catch(ex){archiveStatus='导入未生效：'+ex.message;window.QZUser.refresh()}});
 document.querySelector('#project-revise')?.addEventListener('click',()=>{reviseMode=true;uploaded={};confirmedSameEntity=false;companyName=project.name;provenance=cloneJson(currentInputs.provenance);archiveStatus='本轮导入将按企业年度合并，原数据版本不会覆盖删除。';startMode='annual';window.QZUser.go('ingest')});
 document.querySelector('#project-restore')?.addEventListener('click',()=>{const id=document.querySelector('#project-revision')?.value;if(!id||id===activeRevision)return;const version=revisions.find(v=>v.id===id);if(!version)return;if(!confirm('要查看历史版本吗？当前已导出的报告不会改变，新的分析将以所选版本为基础。'))return;const previous=currentInputs;applySnapshot(version.payload);activeRevision=id;changeSummary=window.QZProjects.diff(previous,currentInputs);archiveStatus='已切换到历史财务快照 '+id+'；请重新查看本年数据与证据。';window.QZUser.refresh()});
}

let disclosure={filename:'',sha256:'',facts:[],review:null,error:''};
let provenance={sourceKind:'unknown',basis:'unknown',standard:'unknown',revision:'unknown',document:'',sourceUrl:'',sourceDate:'',note:'',evidenceName:'',evidenceSha:''};
const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfmt=(x,d=2)=>Number.isFinite(x)?Number(x).toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const val=x=>Number.isFinite(x)?x:null;
const sNum=(x)=>{
 if(x===null||x===undefined)return null;
 if(typeof x==='number')return Number.isFinite(x)?x:NaN;
 let t=String(x).trim();if(!t||/^(--|—|–|N\/A|NA|NULL|无|不适用)$/i.test(t))return null;
 t=t.replace(/[，,\s￥¥]/g,'').replace(/^[（(](.*)[）)]$/,'-$1');
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(t))return NaN;
 const n=Number(t);return Number.isFinite(n)?n:NaN;
};
const norm=x=>String(x??'').trim().toLowerCase().replace(/[\s_()（）\-—\[\]【】.\/]/g,'').replace(/[：:]/g,'');
function headerOffset(rows){
 // Only skip a cover/title row when a later row unambiguously looks like a financial-wide-table header.
 const allAliases=new Set(Object.values(FIELD_SPECS).flatMap(spec=>spec.flatMap(([,label,aliases])=>[label,...aliases.split('|')].map(norm))));
 const years=new Set(FIELD_SPECS.bs[0][2].split('|').map(norm).concat('财政年度'));
 const scores=rows.slice(0,8).map((r,i)=>{const names=r.map(norm).filter(Boolean),n=new Set(names),hits=names.filter(x=>allAliases.has(x)).length;
  return {i,score:hits,qualified:n.size===names.length&&hits>=3&&names.some(x=>years.has(x))};});
 const first=scores[0];if(first?.qualified)return 0;
 const found=scores.slice(1).filter(x=>x.qualified).sort((a,b)=>b.score-a.score||a.i-b.i)[0];
 return found?found.i:0;
}
function parseDelimited(text){
 text=String(text||'').replace(/^\ufeff/,'');let lines=text.split(/\r?\n/).slice(0,8),d=['\t',';',','].sort((a,b)=>Math.max(...lines.map(l=>l.split(b).length))-Math.max(...lines.map(l=>l.split(a).length)))[0];
 const rows=[];let row=[],cur='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cur+='"';i++}else if(c==='"')quoted=false;else cur+=c;continue}
  if(c==='"'&&cur===''){quoted=true;continue}
  if(c===d){row.push(cur.trim());cur='';continue}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur.trim());if(row.some(x=>x!==''))rows.push(row);row=[];cur='';continue}
  cur+=c;
 }
 if(quoted)throw new Error('CSV 引号没有闭合');row.push(cur.trim());if(row.some(x=>x!==''))rows.push(row);
 if(rows.length<2)throw new Error('至少需要表头与一行数据');
 if(rows.length>1001||rows[0].length>150)throw new Error('超过安全读取限制（1000行/150列）');
 const offset=headerOffset(rows),h=rows[offset].map(s=>s.replace(/^\ufeff/,'').trim());if(h.some(x=>!x))throw new Error('表头中有空列名');
 if(new Set(h.map(norm)).size!==h.length)throw new Error('存在重复字段名，请先在原表中重命名');
 return {headers:h,headerRow:offset+1,rows:rows.slice(offset+1).map((r,i)=>{if(r.length>h.length&&r.slice(h.length).some(x=>x!==''))throw new Error(`第${i+offset+2}行的字段数超过表头`);return h.map((_,k)=>r[k]??'')})};
}
const u16=(v,n)=>v.getUint16(n,true),u32=(v,n)=>v.getUint32(n,true);
async function unzipXlsx(buf){
 const data=new Uint8Array(buf),v=new DataView(buf);if(data.length>6*1024*1024)throw new Error('XLSX 超过6MB');
 let e=-1;for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--){if(u32(v,p)===0x06054b50){e=p;break}}
 if(e<0)throw new Error('文件不是有效的 XLSX ZIP');const count=u16(v,e+10),off=u32(v,e+16);if(count>1000)throw new Error('工作簿文件项过多');
 const files=new Map();let pos=off;
 for(let k=0;k<count;k++){
  if(u32(v,pos)!==0x02014b50)throw new Error('XLSX ZIP目录损坏');const method=u16(v,pos+10),size=u32(v,pos+20),raw=u32(v,pos+24),nameLen=u16(v,pos+28),extra=u16(v,pos+30),comment=u16(v,pos+32),local=u32(v,pos+42),name=new TextDecoder().decode(data.slice(pos+46,pos+46+nameLen));
  if(!name.includes('..')&&!name.startsWith('/')&&/^(xl\/|\[Content_Types\])/.test(name))files.set(name,{method,size,raw,local});pos+=46+nameLen+extra+comment;
 }
 async function read(path){const o=files.get(path);if(!o)throw new Error('缺少 '+path);if(o.raw>3*1024*1024)throw new Error('工作表过大');let p=o.local;if(u32(v,p)!==0x04034b50)throw new Error('ZIP入口损坏');p+=30+u16(v,p+26)+u16(v,p+28);let src=data.slice(p,p+o.size);if(o.method===8){if(typeof DecompressionStream!=='function')throw new Error('当前浏览器不支持 XLSX 解压；请另存为CSV上传');try{const ds=new DecompressionStream('deflate-raw');const stream=new Blob([src]).stream().pipeThrough(ds);const result=await new Response(stream).arrayBuffer();if(result.byteLength>3*1024*1024)throw new Error('解压输出超限');src=new Uint8Array(result)}catch(ex){throw new Error('XLSX 解压失败：'+ex.message)}}else if(o.method!==0)throw new Error('不支持此 XLSX 压缩算法');return new TextDecoder('utf-8',{fatal:false}).decode(src)}
 const dom=(s)=>{const x=new DOMParser().parseFromString(s,'application/xml');if(x.querySelector('parsererror'))throw new Error('XLSX XML格式错误');return x};
 const txt=(el,tag)=>{const x=Array.from(el?.getElementsByTagName('*')||[]).find(x=>x.localName===tag);return x?.textContent??''};
 let strings=[];if(files.has('xl/sharedStrings.xml')){let ss=dom(await read('xl/sharedStrings.xml'));strings=Array.from(ss.getElementsByTagName('*')).filter(x=>x.localName==='si').map(si=>Array.from(si.getElementsByTagName('*')).filter(x=>x.localName==='t').map(x=>x.textContent).join(''))}
 const wb=dom(await read('xl/workbook.xml')),relations=dom(await read('xl/_rels/workbook.xml.rels'));
 const rel=new Map(Array.from(relations.getElementsByTagName('*')).filter(x=>x.localName==='Relationship').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 const sheets=[];
 for(const sh of Array.from(wb.getElementsByTagName('*')).filter(x=>x.localName==='sheet').slice(0,25)){
  const id=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const target=rel.get(id);if(!target)continue;
  let path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target;
  path=path.replace(/\\/g,'/').replace(/\/\.\//g,'/');if(!files.has(path))continue;
  const doc=dom(await read(path));let grid=[];
  for(const row of Array.from(doc.getElementsByTagName('*')).filter(x=>x.localName==='row').slice(0,1001)){
   let arr=[];for(const c of Array.from(row.children).filter(x=>x.localName==='c')){
    const addr=c.getAttribute('r')||'',letters=addr.match(/^[A-Z]+/i)?.[0]||'';let col=0;for(const letter of letters.toUpperCase())col=col*26+letter.charCodeAt(0)-64;col--;if(col<0||col>149)continue;
    const ty=c.getAttribute('t'),raw=txt(c,'v');let value=ty==='s'?strings[Number(raw)]||'':ty==='inlineStr'?txt(c,'t'):raw;
    arr[col]=String(value??'');
   }if(arr.some(x=>x&&x.trim()))grid.push(arr);
  }
  if(grid.length>=2){const offset=headerOffset(grid),width=grid[offset].length,headers=Array.from({length:width},(_,i)=>String(grid[offset][i]??'').trim());if(headers.every(Boolean)&&new Set(headers.map(norm)).size===headers.length&&grid.length>offset+1)sheets.push({name:sh.getAttribute('name')||path,data:{headers,headerRow:offset+1,rows:grid.slice(offset+1).map(r=>headers.map((_,i)=>r[i]??''))}})}
 }
 if(!sheets.length)throw new Error('未找到宽表型工作表（第一行必须为字段名）');return sheets;
}
const autoMap=(type,headers)=>Object.fromEntries(FIELD_SPECS[type].map(([key,,alias])=>[key,headers.find(x=>alias.split('|').some(s=>norm(s)===norm(x)))||'']));
function assay(type,info,mapping,unit){const errors=[],out={};const used=Object.values(mapping).filter(Boolean);if(new Set(used).size<used.length)errors.push(TYPE_NAMES[type]+'：一个源字段被映射到多个指标');
 for(const [key,label,,required] of FIELD_SPECS[type])if(required&&!mapping[key])errors.push(TYPE_NAMES[type]+'：缺少必需字段 '+label);
 info.data.rows.forEach((cells,i)=>{
  let yr=sNum(cells[info.data.headers.indexOf(mapping.year)]);if(!Number.isInteger(yr)||yr<1990||yr>2100){errors.push(TYPE_NAMES[type]+`第${i+1+(info.data.headerRow||1)}行：年度必须为1990—2100的整数`);return}
  if(out[yr]){errors.push(`${TYPE_NAMES[type]}第${i+2}行：年度 ${yr} 重复，必须先在源文件去重`);return}
  const rec={year:yr,origin:{},fields:{}};
  for(const [key,label,,required] of FIELD_SPECS[type]){
   if(key==='year')continue;const col=mapping[key],raw=col?cells[info.data.headers.indexOf(col)]:null;const parsed=sNum(raw);
   if(Number.isNaN(parsed)){errors.push(`${TYPE_NAMES[type]}第${i+2}行 / ${yr}年「${label}」（源列：${col||'未映射'}）不是有效数字：${String(raw).slice(0,40)}`);continue}
   if(required&&parsed===null){errors.push(`${TYPE_NAMES[type]}第${i+2}行 / ${yr}年缺少「${label}」（源列：${col||'未映射'}）金额`);continue}
   rec.fields[key]=parsed===null?null:parsed*UNITS[unit];rec.origin[key]=col?{header:col,raw}:null;
  }
  out[yr]=rec;
 });const idCol=info.data.headers.find(x=>['公司名称','企业名称','company_name','company_id','证券代码','股票代码'].some(z=>norm(z)===norm(x))); const ids=idCol?Array.from(new Set(info.data.rows.map(r=>String(r[info.data.headers.indexOf(idCol)]||'').trim()).filter(Boolean))):[];if(ids.length>1)errors.push(TYPE_NAMES[type]+'：同一文件包含多个公司标识，当前仅支持单企业');return {out,errors,identity:ids[0]||null};}
const num=(obj,k)=>val(obj?.[k]);
const div=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(b)>1e-12?a/b:null;
const posdiv=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:null;
const percent=v=>v===null?null:v*100;
function compute(projectData){
 const {tables,name,source,sourceByYear}=projectData;
 const years=Object.keys(tables.bs).map(Number).filter(y=>tables.is[y]&&tables.cf[y]).sort((a,b)=>a-b);
 if(!years.length){if(!projectData.period_data)throw new Error('三张报表没有共同年度，请核对年度映射');window.QZPeriods.validateBook(projectData.period_data);return {name,source,sourceByYear,provenanceByYear:projectData.provenanceByYear||{},years:[],items:{},governance:null,provenance:projectData.provenance};}
 const items={};for(const year of years){
  const B=tables.bs[year].fields,I=tables.is[year].fields,F=tables.cf[year].fields;
  const priorBlocked=items[year-1]?.blocked===true;
  const prev=priorBlocked?null:tables.bs[year-1]?.fields,prevI=priorBlocked?null:tables.is[year-1]?.fields;
  const checks=[],warn=[];const check=(code,label,left,right)=>{
   if(!Number.isFinite(left)||!Number.isFinite(right))return checks.push({code,label,status:'not_tested',delta:null,reason:'必需的组成字段不全'});
   const delta=left-right,tol=Math.max(.05,Math.max(Math.abs(left),Math.abs(right))*.0001),pass=Math.abs(delta)<=tol;
   checks.push({code,label,status:pass?'pass':'fail',delta,tolerance:tol,reason:pass?'会计等式数值通过':'左右两端不一致'});
  };
  check('balance','资产 = 负债 + 所有者权益',B.total_assets,B.total_liabilities+B.total_equity);
  if([F.opening_cash,F.ending_cash,F.operating_cf,F.investing_cf,F.financing_cf,F.fx_effect].every(Number.isFinite))check('cash','期初现金 + 经营 + 投资 + 筹资 + 汇兑 = 期末现金',F.ending_cash,F.opening_cash+F.operating_cf+F.investing_cf+F.financing_cf+F.fx_effect);else checks.push({code:'cash',label:'期初现金 + 经营 + 投资 + 筹资 + 汇兑 = 期末现金',status:'not_tested',delta:null,reason:'现金流要素缺失，未执行完整勾稽'});
  if(Number.isFinite(F.net_change_cash)&&[F.operating_cf,F.investing_cf,F.financing_cf,F.fx_effect].every(Number.isFinite))check('cash_change','现金净增加额 = 经营 + 投资 + 筹资 + 汇兑',F.net_change_cash,F.operating_cf+F.investing_cf+F.financing_cf+F.fx_effect);else checks.push({code:'cash_change',label:'现金净增加额 = 经营 + 投资 + 筹资 + 汇兑',status:'not_tested',delta:null,reason:'现金流要素缺失'});
  if([F.opening_cash,F.ending_cash,F.net_change_cash].every(Number.isFinite))check('cash_balance','期初现金 + 现金净增加额 = 期末现金',F.ending_cash,F.opening_cash+F.net_change_cash);else checks.push({code:'cash_balance',label:'期初现金 + 现金净增加额 = 期末现金',status:'not_tested',delta:null,reason:'期初/期末或净增加额缺失'});
  if(Number.isFinite(I.cogs)&&Number.isFinite(I.gross_profit))check('gross','收入 - 成本 = 毛利',I.revenue-I.cogs,I.gross_profit);
  if(Number.isFinite(B.cash)&&Number.isFinite(F.ending_cash))warn.push('货币资金与现金及现金等价物可能口径不同，未强制按金额相等判定');
  if(![F.investing_cf,F.financing_cf,F.fx_effect].every(Number.isFinite))warn.push('投资/筹资现金流或汇率影响缺失，无法执行完整现金流勾稽；缺失值不按0处理');
  if(!Number.isFinite(F.opening_cash)||!Number.isFinite(F.ending_cash))warn.push('期初/期末现金缺失，无法核对现金期末余额');
  const failed=checks.filter(x=>x.status==='fail');const blocked=failed.length>0;
  const metrics=[];function add(key,label,value,formula,inputs,unit,note=''){
   metrics.push({key,label,value:val(value),formula,inputs,unit,note,available:!blocked&&Number.isFinite(value)});
  }
  const avgAssets=prev?(B.total_assets+prev.total_assets)/2:null,avgEq=prev?(B.total_equity+prev.total_equity)/2:null;
  const avgRec=prev&&Number.isFinite(B.accounts_receivable)&&Number.isFinite(prev.accounts_receivable)?(B.accounts_receivable+prev.accounts_receivable)/2:null;
  const avgInv=prev&&Number.isFinite(B.inventory)&&Number.isFinite(prev.inventory)?(B.inventory+prev.inventory)/2:null;
  const gp=Number.isFinite(I.gross_profit)?I.gross_profit:Number.isFinite(I.cogs)?I.revenue-I.cogs:null;
  add('gross_margin','毛利率',percent(div(gp,I.revenue)),'毛利 ÷ 营业收入 × 100',['is.gross_profit / is.cogs','is.revenue'],'%',!Number.isFinite(gp)?'未提供毛利及营业成本':'');
  add('net_margin','销售净利率',percent(div(I.net_income,I.revenue)),'净利润 ÷ 营业收入 × 100',['is.net_income','is.revenue'],'%');
  add('leverage','资产负债率',percent(div(B.total_liabilities,B.total_assets)),'负债合计 ÷ 资产总计 × 100',['bs.total_liabilities','bs.total_assets'],'%');
  add('current_ratio','流动比率',posdiv(B.current_assets,B.current_liabilities),'流动资产 ÷ 流动负债',['bs.current_assets','bs.current_liabilities'],'倍');
  add('cash_assets','现金资产比',percent(div(B.cash,B.total_assets)),'资产负债表现金 ÷ 总资产 × 100',['bs.cash','bs.total_assets'],'%');
  add('cash_revenue','经营现金流收入比',percent(div(F.operating_cf,I.revenue)),'经营现金流量净额 ÷ 营收 × 100',['cf.operating_cf','is.revenue'],'%');
  add('cash_earnings','净利润现金含量',I.net_income>0?div(F.operating_cf,I.net_income):null,'经营现金流量净额 ÷ 正净利润',['cf.operating_cf','is.net_income'],'倍',I.net_income<=0?'净利润非正，不计算此项':'');
  add('rd_intensity','研发强度',percent(div(I.rd_expense,I.revenue)),'研发费用 ÷ 营收 × 100',['is.rd_expense','is.revenue'],'%');
  add('revenue_growth','营收同比增长率',prevI&&prevI.revenue>0?percent(div(I.revenue-prevI.revenue,prevI.revenue)):null,'(本期营收-上期营收) ÷ 上期正营收 × 100',['is.revenue',`is[${year-1}].revenue`],'%',!prevI?'缺少上一年利润表':prevI.revenue<=0?'上一年营业收入非正，不计算标准同比':'');
  add('asset_turnover','总资产周转率',posdiv(I.revenue,avgAssets),'营收 ÷ 期初期末平均总资产',['is.revenue','bs.total_assets',`bs[${year-1}].total_assets`],'次',!prev?'缺少上一年资产负债表':'');
  add('roe','净资产收益率',percent(posdiv(I.net_income,avgEq)),'净利润 ÷ 期初期末平均净资产 × 100',['is.net_income','bs.total_equity',`bs[${year-1}].total_equity`],'%',!prev?'缺少上一年资产负债表':'');
  add('receivables_turnover','应收账款周转率',posdiv(I.revenue,avgRec),'营收 ÷ 平均应收账款',['is.revenue','bs.accounts_receivable',`bs[${year-1}].accounts_receivable`],'次');
  add('inventory_turnover','存货周转率',posdiv(I.cogs,avgInv),'营业成本 ÷ 平均存货',['is.cogs','bs.inventory',`bs[${year-1}].inventory`],'次',!Number.isFinite(I.cogs)?'缺少营业成本':'');
  const by=Object.fromEntries(metrics.map(x=>[x.key,x]));
  const rules=[];function rule(label,key,trigger,criterion,why){const x=by[key],hit=blocked||!x.available?null:trigger(x.value);rules.push({label,value:!blocked?x.value:null,criterion,hit,why,key});}
  if(!blocked){rules.push({label:'净利润为负',value:I.net_income,criterion:'净利润 < 0',hit:I.net_income<0,why:'盈利能力压力',key:'raw_net_income'});rules.push({label:'经营现金流为负',value:F.operating_cf,criterion:'经营净现金流 < 0',hit:F.operating_cf<0,why:'经营收付压力',key:'raw_operating_cf'});}else{rules.push({label:'净利润为负',hit:null,value:null,criterion:'净利润 < 0',why:'会计校验未通过',key:'raw_net_income'});rules.push({label:'经营现金流为负',hit:null,value:null,criterion:'经营净现金流 < 0',why:'会计校验未通过',key:'raw_operating_cf'})}
  rule('资产负债率偏高','leverage',v=>v>=70,'≥ 70%','内部示范警戒线，非行业风险评级');
  rule('流动比率偏低','current_ratio',v=>v<1,'< 1 倍','短期偿债资源观察');
  rule('盈利现金转化偏低','cash_earnings',v=>v<.5,'< 0.5 倍','仅净利润为正时适用');
  rule('营收同比下降','revenue_growth',v=>v<=-10,'≤ -10%','需要连续上年营收数据');
  items[year]={year,fields:{bs:B,is:I,cf:F},origin:{bs:tables.bs[year].origin,is:tables.is[year].origin,cf:tables.cf[year].origin},checks,warnings:warn,blocked,metrics,metricByKey:by,rules};
 }
 const governance=window.QZTrust.inspect({tables,items,years,source,sourceByYear,metadata:projectData.provenance});
 for(const y of years)items[y].quality=governance.years[y];
 return {name,source,sourceByYear:sourceByYear||sourceYears(source,tables),provenanceByYear:projectData.provenanceByYear||metadataYears(projectData.provenance,tables),years,items,governance,provenance:governance.metadata};
}
function csv(rows){return '\ufeff'+rows.map(r=>r.map(v=>{const raw=String(v??'');const safe=/^[\s]*[=+@]/.test(raw)||(/^\s*-/.test(raw)&&Number.isNaN(sNum(raw)))?'\''+raw:raw;return '"'+safe.replaceAll('"','""')+'"'}).join(',')).join('\r\n')}
function download(name,text,mime='text/plain;charset=utf-8'){const u=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function plot(project,years){const w=700,h=255,pad=48,scale=(v,min,max)=>h-45-(v-min)/(max-min||1)*(h-85);let vals=[];for(const y of years){const row=project.items[y];if(row.blocked)continue;vals.push(row.fields.is.net_income,row.fields.cf.operating_cf)}const min=Math.min(0,...vals),max=Math.max(1,...vals);let marks='';for(const [i,yr] of years.entries()){const r=project.items[yr];const x=72+i*(w-125)/(years.length||1);marks+=`<text x="${x+24}" y="${h-14}" fill="#9bbacc" text-anchor="middle" font-size="12">${yr}</text>`;for(const [j,v] of [r.fields.is.net_income,r.fields.cf.operating_cf].entries()){if(r.blocked)continue;let y=scale(v,min,max),zero=scale(0,min,max);marks+=`<rect x="${x+j*25}" y="${Math.min(zero,y)}" width="22" height="${Math.max(1,Math.abs(y-zero))}" fill="${j?'#c6a76f':'#54bad3'}"><title>${yr}年 ${j?'经营现金流':'净利润'} ${nfmt(v)} 万元</title></rect>`}}
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="净利润与经营现金流金额对照"><line x1="35" y1="${scale(0,min,max)}" x2="${w-35}" y2="${scale(0,min,max)}" stroke="#8ba6b7" opacity=".7"/>${marks}<text x="35" y="20" fill="#91abbc" font-size="12">万元 · 横轴为财政年度</text></svg>`;
}
function observationText(r){
 if(r.blocked)return box('本年度三表校验未通过，因此不能据此形成财务经营诊断；请先核查会计恒等式与金额单位。');
 const a=[];const I=r.fields.is,F=r.fields.cf,B=r.fields.bs,m=r.metricByKey;
 if(I.net_income>0&&F.operating_cf<0)a.push(`净利润为 ${nfmt(I.net_income)} 万元，但经营现金流为 ${nfmt(F.operating_cf)} 万元，现金与利润方向背离。建议先核对应收回款和经营性支付。`);
 else if(I.net_income<0)a.push(`净利润为 ${nfmt(I.net_income)} 万元，当前利润表显示亏损；该判断不等于未来持续亏损的预测。`);
 else if(I.net_income>0&&F.operating_cf>0)a.push(`净利润与经营现金流均为正；仍需结合回款周期、投资现金流与资产结构判断经营质量。`);
 if(m.leverage.available&&m.leverage.value>=70)a.push(`资产负债率 ${nfmt(m.leverage.value)}%，超过本系统演示观察线70%；该线不是行业信用评级标准。`);
 if(m.current_ratio.available&&m.current_ratio.value<1)a.push(`流动比率为 ${nfmt(m.current_ratio.value)} 倍，低于内部观察线 1 倍；应继续检查短期负债到期结构。`);
 if(m.revenue_growth.available)a.push(`收入同比变化为 ${nfmt(m.revenue_growth.value)}%，基于相邻连续年度两期营业收入计算，并非市场预测。`);
 if(!a.length)a.push('目前可用字段不足以支持更多具体结论；请检查是否提供应收、存货、流动负债及连续年度数据。');
 return '<div class="trace-line">'+a.map((x,i)=>`<div class="trace-text"><strong>${i+1}.</strong> ${esc(x)}</div>`).join('')+'</div>';
}
function trustPanel(P,y){
 const g=P.governance,q=g.years[y],m=g.metadata;
 const notes=(q.warnings||[]).map(w=>`<li>${esc(w)}</li>`).join('');
 const cross=q.crossYear||[];
 const checked=disclosure.review?.byYear?.[y];
 return panel('数据可信度审计 · 来源与数值分开判定','报告来源为上传者声明；系统没有联网认证或人工审计，也不会将任何合成样本冒充真实行业事实',
 `<div class="stat-strip compact-stats">${tile('来源状态',esc(g.sourceStatusText),'真实性尚未独立验证')}${tile('本期会计检查',esc(q.dataStatusText),`${q.testedCount}项已核对 / ${q.notTested}项未核对`)}${tile('外部原文摘录对照',checked?`${checked.matched}项相符 / ${checked.difference}项差异`:'未执行',checked?'本地台账 · 非官方来源认证':'不宣称官方认证')}</div>`+
 `<div class="info-box"><strong>来源披露：</strong> ${esc(window.QZTrust.lab('sourceKind',m.sourceKind))} · ${esc(window.QZTrust.lab('basis',m.basis))} · ${esc(window.QZTrust.lab('standard',m.standard))} · ${esc(window.QZTrust.lab('revision',m.revision))}<br>来源文献：${esc(m.document||'未登记')}；公告网址：${m.sourceUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(m.sourceUrl)}">${esc(m.sourceUrl)}</a>`:'未登记'}；来源PDF的SHA-256：<code>${esc(m.evidenceSha||'未附文件')}</code></div>`+
 `<h3 class="subheading">跨期核对</h3>${cross.length?tab(['对账关系','状态','残差（万元）','备注'],cross.map(c=>[esc(c.label),c.status==='PASS'?'通过':c.status==='REVIEW'?'<span class="pill gold">需要回查</span>':'未核对',nfmt(c.residual,4),esc(c.explanation||'')])):box('暂缺可比的上一年度现金流量表，不进行跨年度滚动核验。')}`+
 `<h3 class="subheading">未解决的审计事项</h3>${notes?`<ul class="audit-list">${notes}</ul>`:box('目前未发现本轮规则覆盖范围内的额外疑点；这不证明数据真实。')}`+
 `<div class="action-row"><button class="ghost-btn" id="user-export-lineage">导出逐字段来源证据 CSV ↓</button><button class="ghost-btn" id="user-export-trust">导出完整可信度审计 JSON ↓</button></div>`);
}
function disclosurePanel(P,y){
 const z=disclosure,review=z.review,year=review?.byYear?.[y],current=review?.rows?.filter(x=>x.year===y)||[];
 const a=review?.source;
 const state=year?`该年度 ${year.matched} 项数字相符 / ${year.difference} 项超出舍入容差 / ${year.issues} 项待复核；六个核心字段已覆盖 ${year.requiredKeyMatched}/${year.requiredKeyTotal}`:'尚未执行原文摘录数字对照';
 const sourceNotes=`<div class="info">这里对照的是人工摘录/其他整理得到的 CSV 数字台账，不是从 PDF 自动识别，也未访问证券交易所核实公告真伪；PDF 哈希只能证明文件一致性。金额默认人民币，年度仅支持12月31日结账；必须逐项确认页码与披露版本。</div>`;
 return panel('原始披露数字对照 · v1.5','上传独立核对台账，比较金额、年度、合并口径、PDF指纹和原文页码；差异不得自动修正',
 `<div class="filter-bar"><label>披露原文核对表 CSV（独立摘录）<input id="user-ledger-file" class="input-control" type="file" accept=".csv,text/csv"/></label><button class="ghost-btn" id="user-ledger-template">下载核对台账模板 ↓</button><button class="ghost-btn" id="user-ledger-clear">清除本次台账</button></div>`+
 `<div class="info-box">${esc(state)}${a?`<br>对应 PDF：${esc(a.pdfSha256||'未登记')} · 来源类别：${esc(a.sourceKind)}。${a.sourceKind==='training'?'教学数据不得用于真实行业推断。':''}`:''}</div>`+
 (z.error?`<div class="info-box gold">${esc(z.error)}</div>`:'')+
 `<div class="mini-muted">核对方式：${z.method==='pdf_text_review'?'PDF文本候选提取后人工确认':z.method==='manual_csv'?'独立人工摘录CSV':'未开始'} · 台账文件：${esc(z.filename||'尚未导入')} ${z.sha256?`· 文件SHA-256 ${esc(z.sha256.slice(0,24))}…`:''}</div>`+
 (review?`<h3 class="subheading">${y} 年逐项来源对照</h3>${tab(['报表 / 字段','PDF页码','披露金额（万元）','上传金额（万元）','差额','判断与处理'],current.map(q=>[esc(TYPE_NAMES[q.statement])+' / '+esc(q.field),q.page,nfmt(q.normalizedWan,5),nfmt(q.uploadedWan,5),nfmt(q.deltaWan,5),`<span class="pill ${['MATCH','TRAINING_MATCH'].includes(q.status)?'':'gold'}">${esc(q.status)}</span> ${esc(q.reason)}`]))}<div class="info">未出现在独立台账中的字段均属于未核对；重复记录、PDF指纹不一致与期间/合并口径不一致均不得标记为相符。</div><div class="action-row"><button class="ghost-btn" id="user-ledger-export-csv">导出逐项对账 CSV ↓</button><button class="ghost-btn" id="user-ledger-export-json">导出来源核对证据 JSON ↓</button></div>`:'')+
 sourceNotes+`<div class="info">如果尚未在 01 上传并登记原报告 PDF，需返回 01 重新分析后再导入台账。离线本地校验不等于监管/审计背书。</div>`);
}
// v2.2 user evidence interactions — read existing computed project objects, never recalculate metrics.
function evidenceCurrent(P,y){
 const analysis=window.QZInsights.analyze(P,y,disclosure);
 const f=focusChoice;
 if(f?.kind==='issue'&&analysis.issues.some(q=>q.id===f.key))return f;
 if(f?.kind==='metric'&&P.items[y]?.metricByKey?.[f.key])return f;
 return analysis.issues.length?{kind:'issue',key:analysis.issues[0].id}:
  P.items[y].metrics.find(m=>m.available)?{kind:'metric',key:P.items[y].metrics.find(m=>m.available).key}:null;
}
function evidenceRow(x){
 return `<tr><td>${esc(x.year)} / ${esc(x.statement_label)} · ${esc(x.field_label)}</td><td>${esc(x.original_column||'未映射')}</td><td>${esc(x.original_value??'—')}</td><td>${x.normalized_value_wan===null?'—':nfmt(x.normalized_value_wan,4)}</td><td>${esc(x.source_file||'未登记')}<br><small>SHA-256: ${esc(x.source_sha256||'未提供')}</small></td></tr>`;
}
function insightDetailHtml(P,y,selected){
 if(!selected)return box('当前没有具备充分字段依据的经营观察。可以查看下方会计核查与字段映射，或继续补充财报。');
 const api=window.QZInsights;
 const detail=selected.kind==='issue'?api.issueDetail(P,y,selected.key,disclosure):api.metricDetail(P,y,selected.key);
 if(!detail)return box('此问题在当前年度没有可用证据，请选择其他指标。');
 const m=detail.kind==='metric'?[detail]:detail.metric_details;
 const headline=detail.kind==='issue'?`<p class="insight-reading"><b>实际现象：</b>${esc(detail.description)}</p><p class="insight-reading">${esc(detail.interpretation)}</p><p class="mini-muted"><b>建议核对：</b>${esc(detail.followUp)}</p>`:
  `<div class="insight-main-number">${detail.available?nfmt(detail.value,4)+' '+esc(detail.unit):'不可计算'}</div><div class="info">${esc(detail.note)}${detail.delta!==null?` · 与上一年度变化 ${nfmt(detail.delta,4)} ${esc(detail.unit)}`:' · 缺少可比较且有效的相邻年度，不推算同比'}</div>`;
 const formulas=m.map(v=>[esc(v.title),v.available?nfmt(v.value,4)+' '+esc(v.unit):'不可计算',esc(v.formula),esc(v.note||'来自当前已核验的指标计算对象')]);
 const raw=detail.evidence||[];
 return `<div class="insight-detail-head"><div><span class="overline">EVIDENCE / ${esc(y)}</span><h3>${esc(detail.title)}</h3></div><span class="pill ${P.items[y].quality.dataStatus==='PARTIAL'?'gold':''}">本地计算 · 来源未获独立认证</span></div>
 ${headline}<h4>计算公式及可用性</h4>${tab(['指标','本期结果','已使用的计算定义','适用范围'],formulas.length?formulas:[['原始金额观察','已显示','原始数值直接对照','不包含预测或原因认定']])}
 <h4>原始取数与来源指纹</h4><div class="insight-evidence-scroll"><table class="data-table"><thead><tr><th>年度 / 字段</th><th>原表列名</th><th>上传原值</th><th>标准化万元</th><th>文件及SHA-256</th></tr></thead><tbody>${raw.length?raw.map(evidenceRow).join(''):'<tr><td colspan="5">当前问题未记录可核对的原始输入</td></tr>'}</tbody></table></div>
 <div class="insight-evidence-meta">本期检查：${esc(P.items[y].checks.filter(c=>c.status==='pass').length)}项通过 / ${esc(P.items[y].checks.filter(c=>c.status==='fail').length)}项未通过 / ${esc(P.items[y].checks.filter(c=>c.status==='not_tested').length)}项未执行。${esc(P.governance.sourceStatusText)}。年度来源：${esc((P.provenanceByYear?.[y]||P.provenance).document||'未登记')}。${disclosure.review?.byYear?.[y]?`独立对照：${esc(disclosure.review.byYear[y].matched)}项相符，${esc(disclosure.review.byYear[y].difference)}项差异。`:'未提供独立原文数字台账。'}</div>
 <div class="action-row"><button class="ghost-btn insight-jump" data-target="user-year-bridge">查看年度变化</button><button class="ghost-btn insight-jump" data-target="user-disclosure-check">核对原文</button><button class="ghost-btn insight-jump" data-target="user-export-section">查看完整报告</button></div><div class="action-row"><button class="primary-btn insight-download" data-format="html">导出当前问题 HTML</button><button class="ghost-btn insight-download" data-format="csv">证据 CSV</button><button class="ghost-btn insight-download" data-format="json">完整 JSON</button></div>`;
}
function insightPanel(P,y){
 const analysis=window.QZInsights.analyze(P,y,disclosure);
 if(analysis.gate.blocked)return panel('值得先看 · 数据需要先核实','这一步严格服从本期会计勾稽与独立原文对账',
   `<div class="insight-blocked"><strong>暂不提供经营观察</strong><p>${esc(analysis.gate.reason)}</p><small>可以继续查看下方校验项、字段映射与来源台账，修正数据后重新导入。已暂停的项目不生成证据结论。</small></div>`);
 const selected=focusChoice?evidenceCurrent(P,y):null;
 if(focusChoice&&selected&&focusChoice.key!==selected.key)focusChoice=null;
 const cards=analysis.issues.map((q,i)=>`<button type="button" class="insight-issue ${selected?.kind==='issue'&&selected.key===q.id?'selected':''}" data-issue="${esc(q.id)}"><span class="insight-index">${String(i+1).padStart(2,'0')} · ${q.kind==='review'?'需要核对':'财务观察'}</span><strong>${esc(q.title)}</strong><span>${esc(q.description)}</span><small>点击查看实际取数与计算说明 →</small></button>`).join('');
 return panel('值得先看 · 来自你上传的数据','少量可核对观察，先理解财务现象，再按需展开全部工具；不是风险评级',
 `<div class="insight-quality">${esc(analysis.gate.reason)} · ${esc(P.name)} / ${y} 年</div>
 <div class="insight-issue-grid">${cards||box('尚无可用观察。请查看下方指标与来源，检查字段是否齐全。')}</div>
 <div class="insight-metric-switch"><span>也可以直接查看任一指标的原始取数：</span><label class="insight-select-label">指标<select class="form-select" id="insight-metric"><option value="">选择指标展开…</option>${P.items[y].metrics.map(v=>`<option value="${esc(v.key)}" ${selected?.kind==='metric'&&selected.key===v.key?'selected':''}>${esc(v.label)}${v.available?'':' · 不可计算'}</option>`).join('')}</select></label></div>
 <div class="insight-detail" id="insight-detail-body">${insightDetailHtml(P,y,selected)}</div>`);
}
function bridgePanel(P,y){
 const b=window.QZInsights.bridge(P,y,disclosure);
 if(!b.available)return panel('年度利润变化 · 会计桥','先检查能否获得相邻年度和足够字段，再解释变化',box(esc(b.reason)));
 const max=Math.max(1,...b.contributions.map(x=>Math.abs(x.amount)));
 const cards=b.contributions.map((x,i)=>`<div class="insight-bridge-step"><span class="mini-muted">${String(i+1).padStart(2,'0')} · ${esc(x.label)}</span><strong>${x.amount>0?'+':''}${nfmt(x.amount,2)} <small>万元</small></strong><div class="insight-bridge-track"><span class="${x.amount<0?'down':'up'}" style="width:${Math.max(1,100*Math.abs(x.amount)/max).toFixed(2)}%"></span></div></div>`).join('');
 const start=nfmt(b.starting_profit,2),ending=nfmt(b.ending_profit,2);
 return panel('年度利润变化 · 从结果看到金额桥',`${b.prior_year} → ${b.year} · 用户同口径声明下的会计拆解，非因果归因`,
  `<div class="insight-bridge-summary"><div><span>${b.prior_year} 年净利润</span><strong>${start} 万元</strong></div><span class="insight-bridge-arrow">→</span><div><span>${b.year} 年净利润</span><strong>${ending} 万元</strong></div></div>
  <div class="insight-bridge-grid">${cards}</div><div class="info">本期净利润变化：${b.delta_profit>=0?'+':''}${nfmt(b.delta_profit,2)} 万元；三项贡献与净利润变化相等（会计桥闭合）。${esc(b.method)}。来源真实性与跨期口径仍需人工核验。</div>`);
}
function downloadInsightEvidence(P,y,format){
 const selected=evidenceCurrent(P,y),doc=window.QZInsights.evidence(P,y,selected,disclosure);
 if(!doc)return;
 const tag=`企财智策_${P.name}_${y}_${selected.key}_问题证据_v2.2`;
 if(format==='json'){download(tag+'.json',JSON.stringify(doc,null,2),'application/json;charset=utf-8');return;}
 const detail=doc.selection;
 if(format==='csv'){
  const rows=[['记录类别','年度','项目','数值','单位','原始列/计算公式','源文件','源文件SHA256','状态 / 说明']];
  rows.push(['当前问题',y,detail.title,detail.kind==='metric'?detail.value??'':detail.description||'','',detail.kind==='metric'?detail.formula:detail.interpretation,'','',doc.status.state]);
  for(const e of detail.evidence||[])rows.push(['原始字段',e.year,e.statement_label+' / '+e.field_label,e.normalized_value_wan??'','万元',e.original_column||'',e.source_file||'',e.source_sha256||'',`原值：${e.original_value??'未提供'}；${e.coverage}`]);
  for(const c of doc.checks)rows.push(['会计检查',y,c.label,c.delta??'','万元','', '', '',`${c.status}；${c.reason}`]);
  rows.push(['来源核验',y,'外部真实性认证',false,'','','','','源文件SHA256不代表真实来源证明']);
  download(tag+'.csv',csv(rows),'text/csv;charset=utf-8');return;
 }
 const cells=(heads,rows)=>plainTable(heads,rows),e=detail.evidence||[],metrics=detail.kind==='metric'?[detail]:detail.metric_details||[];
 const report=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(detail.title)} · 企财智策</title><style>body{font:15px/1.75 'Microsoft YaHei',Arial,sans-serif;color:#203545;max-width:1040px;margin:40px auto;padding:15px 28px}h1{font-size:28px}h2{font-size:20px;margin-top:34px;border-bottom:1px solid #bed0da;padding-bottom:8px}table{border-collapse:collapse;width:100%;font-size:12px;table-layout:auto;overflow-wrap:anywhere}th,td{border:1px solid #cad8de;padding:9px;text-align:left}th{background:#eaf3f7}.muted{color:#617582}.warning{background:#fff3d9;padding:14px}small{font-size:12px}</style></head><body><h1>${esc(detail.title)}</h1><p>${esc(P.name)} · ${y} 年 · 用户上传资料 / 金额万元 · ${esc(doc.analysis_version)}</p><p class="warning">${esc(doc.status.reason)}；仅描述已上传文件的有限数值，尚未验证官方来源或真实审计。无任何真实行业评级和预测。</p><h2>主要观察</h2><p>${esc(detail.description||detail.note||'')}</p><p>${esc(detail.interpretation||'')}</p><h2>实际计算与限制</h2>${cells(['指标','数值','公式','说明'],metrics.map(m=>[m.title,m.available?nfmt(m.value,4)+' '+m.unit:'不可计算',m.formula,m.note]))}<h2>原始字段与文件指纹</h2>${cells(['年度','报表','原表列','上传原值','标准化万元','文件SHA256'],e.map(v=>[v.year,v.statement_label+' / '+v.field_label,v.original_column||'未映射',v.original_value??'—',v.normalized_value_wan===null?'—':nfmt(v.normalized_value_wan,4),(v.source_file||'')+' / '+(v.source_sha256||'')]))}<h2>会计核验与原文对照</h2>${cells(['项目','状态','差额万元','说明'],doc.checks.map(c=>[c.label,c.status,c.delta===null?'—':nfmt(c.delta,4),c.reason]))}<p class="muted">原文数字对照：${esc(doc.disclosure.method)}；${esc(doc.disclosure.year?JSON.stringify(doc.disclosure.year):'未提供台账')}。</p><h2>适用边界</h2>${doc.limits.map(t=>`<p>${esc(t)}</p>`).join('')}<p><small>生成于 ${esc(doc.generated_at)}。可同时导出 CSV 与 JSON 复核。</small></p><button onclick="window.print()">打印 / 保存 PDF</button></body></html>`;
 download(tag+'.html',report,'text/html;charset=utf-8');
}
// v2.4 in-place continuity: trend → rule follow-up → version impact → evidence export.
function continuationKey(y,key){return activeRevision+':'+y+':'+key}
function continuationChart(points,label,unit){
 const w=840,h=240,left=65,right=30,top=30,bottom=53;
 const good=points.filter(x=>x.available),values=good.map(x=>x.value);
 if(!good.length)return '<div class="info-box">当前指标没有通过核验的历史数值；不能画出可靠趋势。</div>';
 const lo=Math.min(...values),hi=Math.max(...values),padding=Math.max((hi-lo)*.22,Math.abs(hi)*.035,.08),min=lo-padding,max=hi+padding;
 const x=i=>left+(points.length===1?(w-left-right)/2:i*(w-left-right)/(points.length-1));
 const y=v=>top+(max-v)/(max-min)*(h-top-bottom);
 let grid='';for(let i=0;i<=4;i++){const value=max-(max-min)*i/4,py=y(value);grid+=`<line x1="${left}" x2="${w-right}" y1="${py.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#294958" stroke-dasharray="4 5"/><text x="${left-9}" y="${(py+4).toFixed(1)}" text-anchor="end" font-size="12" fill="#aac1cc">${esc(nfmt(value,1))}</text>`}
 let plot='';for(let i=1;i<points.length;i++){const prev=points[i-1],cur=points[i];if(!prev.available||!cur.available||cur.year!==prev.year+1)continue;plot+=`<line x1="${x(i-1).toFixed(1)}" y1="${y(prev.value).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(cur.value).toFixed(1)}" stroke="#77d8e8" stroke-width="3" stroke-linecap="round"/>`}
 for(let i=0;i<points.length;i++){const p=points[i],xx=x(i);plot+=`<text x="${xx.toFixed(1)}" y="${h-16}" text-anchor="middle" fill="#a7c3d0" font-size="12">${p.year}</text>`;if(p.available)plot+=`<circle cx="${xx.toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="6" fill="#83e0ee" stroke="#0c2536" stroke-width="2"><title>${p.year} · ${label}: ${nfmt(p.value,3)} ${unit}</title></circle>`;else plot+=`<text x="${xx.toFixed(1)}" y="${top+12}" text-anchor="middle" fill="#bca280" font-size="12">不可用</text>`}
 return `<svg class="continuity-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}按年度数值变化；断线表示不相邻、不可计算或未通过核验">${grid}${plot}<text x="${left}" y="14" font-size="12" fill="#adc7d3">${esc(label)} · ${esc(unit)} · 仅连接相邻且有效的年度</text></svg>`;
}
function casePanel(P,y,rows){
 const api=window.QZCases,all=api.report(P,disclosure,caseRecords),stale=all.filter(r=>r.freshness!=='current').length;
 const active=rows.find(r=>r.case_key===caseEditingKey),r=active?.record;
 const cards=rows.map(c=>{const rec=c.record,activeRule=c.hit===null?'当前不可判断':c.hit?'当前触发观察线':'当前未触发观察线';
  const fresh=c.fresh.state==='current'?'':`<span class="case-warning">${esc(c.fresh.label)}</span>`;
  return `<div class="case-row"><div><strong>${esc(c.title)}</strong><small>${esc(activeRule)} · ${esc(c.state_label)}</small></div><div class="case-progress">${rec?esc(api.STATES[rec.state]+' · '+api.ASSESSMENTS[rec.assessment]):'尚未记录人工核验'}${fresh}</div><button class="ghost-btn case-open" data-rule="${esc(c.key)}">${rec?'继续核验 →':'开始核验 →'}</button></div>`;}).join('');
 const editor=active?`<div id="case-editor" class="case-editor"><div class="case-editor-title"><strong>${esc(y)} 年 · ${esc(active.title)}</strong><small>${esc(active.criterion)} · ${esc(active.reason)}</small><small>系统观察和人工判断分开保存；证据未齐不得将异常标记为已消除。</small></div>
 <div class="case-fields"><label>工作进展<select class="form-select" id="case-state">${Object.entries(api.STATES).map(([k,v])=>`<option value="${k}" ${r?.state===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>人工资料判断<select class="form-select" id="case-assessment">${Object.entries(api.ASSESSMENTS).map(([k,v])=>`<option value="${k}" ${(r?.assessment||'unverified')===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div>
 <label>证据定位（不是上传文件）<input class="input-control" id="case-evidence" maxlength="240" value="${esc(r?.evidence||'')}" placeholder="例如：2022年报第75页，现金流量表附注第4项"/></label>
 <label>下一步处理或需补充材料<textarea class="input-control" id="case-action" rows="2" maxlength="300" placeholder="例如：核对期末应收账款结构及回款周期">${esc(r?.action||'')}</textarea></label>
 <div class="case-fields"><label>复核说明<textarea class="input-control" id="case-note" rows="2" maxlength="400" placeholder="仅记录已检查的事实和未解决的限制">${esc(r?.note||'')}</textarea></label><label>下次核对日期（可空）<input class="input-control" id="case-next" type="date" value="${esc(r?.next_check||'')}"/></label></div>
 ${r?`<div class="case-history">历史记录 ${r.history.length} 条，最近更新时间 ${esc(r.updated_at)} · 记录所依赖快照 ${esc(r.reviewed_snapshot)}。${active.fresh.state!=='current'?'财报内容变化后需重新核验并保存。':'当前证据上下文未变动。'}</div>`:''}
 <div id="case-error" class="info" role="alert" hidden></div><div class="action-row"><button class="primary-btn" id="case-save">保存本次人工核验</button><button class="ghost-btn" id="case-cancel">返回问题列表</button><button class="ghost-btn continuity-drill" data-year="${y}" data-metric="${esc(active.metric_key)}">查看原始计算证据 →</button></div></div>`:'';
 return `<div class="case-workflow" id="case-workflow"><div class="continuity-subheading"><h3>问题核验与处理 · 从观察到可追溯记录</h3><small>${all.length} 条已记录 / ${stale} 条因证据变化需重核 · 本年 ${rows.length} 项规则</small></div>
 <p class="case-intro">先点击问题核对原始公式与文件，再填写证据所在位置及下一步行动。后续更正该年度报表、源文件或核对材料时，原有人工记录会提醒重新确认；不会自动宣告问题解决。</p>
 <div class="case-rows">${cards}</div>${editor}${caseStatus?`<div class="info">${esc(caseStatus)}</div>`:''}
 <div class="case-bottom"><span>当前会话维护；手动保存项目时才长期留存。单独导出只包含人工记录，不包含原始文件。</span><button class="ghost-btn" id="case-export-json">单独导出核验记录 JSON</button></div></div>`;
}
function continuityPanel(P,y){
 const api=window.QZContinuity,options=api.metricOptions(P),key=options.some(x=>x.key===continuityMetric)?continuityMetric:options[0]?.key;
 if(!key)return panel('企业持续观察','当前尚无可计算的历史指标',box('请补充足够的财报字段。'));
 const trend=api.trend(P,key,disclosure),tracking=api.monitoring(P,y,disclosure);
 const impact=api.revisionImpact(revisions,activeRevision,P,compute);
 const recent=trend.points.slice(-7),notesCount=Object.keys(watchNotes).length;
 const caseRows=window.QZCases.summarize(P,y,disclosure,caseRecords);
 const select=`<label class="continuity-pick">追踪指标 <select class="form-select" id="continuity-metric">${options.map(o=>`<option value="${esc(o.key)}" ${o.key===key?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;
 const rows=recent.map(p=>[p.year+'年',p.available?nfmt(p.value,3)+' '+esc(trend.unit):'<span class="continuity-muted">不可计算 / 核验阻断</span>',p.comparable?(p.change>=0?'+':'')+nfmt(p.change,3)+' '+esc(trend.unit):'—',p.available?`<button class="ghost-btn continuity-drill" data-year="${p.year}" data-metric="${esc(key)}">查看来源与公式 →</button>`:esc(p.reason)]);
 const follow=tracking.map(t=>{
  const record=watchNotes[continuationKey(y,t.key)],note=record?api.WATCH_STATES[record.status]:'未添加跟进';
  const flag=t.state==='PERSISTENT'||t.state==='NEW'?'watch':t.state==='UNVERIFIED'||t.state==='MISSING'?'unknown':t.state==='NO_LONGER'?'clear':'';
  return `<div class="continuity-track"><div><strong>${esc(t.title)}</strong><small>${esc(t.criterion)} · ${esc(t.reason)}</small></div><div class="continuity-track-state ${flag}"><span>${esc(t.state_label)}</span><small>${t.hit===null?'本期不可判断':t.hit?'本期达到观察线':'本期未达到观察线'}</small></div><div class="continuity-track-actions"><span class="continuity-small">${esc(note)}</span><button class="ghost-btn case-open" data-rule="${esc(t.key)}">核验与处理 →</button><button class="ghost-btn continuity-follow" data-rule="${esc(t.key)}">简要笔记</button><button class="ghost-btn continuity-drill" data-year="${y}" data-metric="${esc(t.metric_key)}">取数证据 →</button></div></div>`;
 }).join('');
 const selected=tracking.find(t=>continuationKey(y,t.key)===watchEditingKey),note=selected?watchNotes[watchEditingKey]:null;
 const editor=selected?`<div class="continuity-editor"><div class="continuity-editor-title">记录人工复核 · ${esc(selected.title)} <small>仅是个人跟进记录，不影响系统数值判定</small></div><label>跟进状态<select class="form-select" id="continuity-watch-state">${Object.entries(api.WATCH_STATES).map(([k,v])=>`<option value="${esc(k)}" ${(note?.status||'todo')===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>核对笔记<textarea class="input-control" id="continuity-watch-note" rows="3" maxlength="300" placeholder="例如：计划核对 2023 年应收款与现金流量表附注">${esc(note?.note||'')}</textarea></label><div class="action-row"><button class="primary-btn" id="continuity-watch-save">保存本条跟进（当前会话）</button><button class="ghost-btn" id="continuity-watch-cancel">取消</button></div></div>`:'';
 const impacted=impact.available?`<div class="continuity-impact"><div class="continuity-impact-top"><strong>${impact.comparing_to_newer?'正在查看较早版本 · 与后续修订比较':'当前快照与上一次修订对比'}</strong><span>${esc(impact.older_id)} → ${esc(impact.newer_id)}</span></div><div class="continuity-impact-stats"><span>${impact.changed_fields} 项原始字段变化</span><span>${impact.source_changes} 项来源/声明变化</span><span>${impact.metric_changes.length} 项既有年度可验证指标变化</span></div>${impact.added_years.length?`<div class="continuity-small">新增年度：${esc(impact.added_years.join('、'))}</div>`:''}${impact.removed_years.length?`<div class="continuity-small">移除年度：${esc(impact.removed_years.join('、'))}</div>`:''}${impact.metric_changes.length?`<div class="continuity-impact-samples">${impact.metric_changes.slice(0,4).map(m=>`<div>${m.year}年 · ${esc(m.label)}　${m.before===null?'不可计算':nfmt(m.before,3)} → ${m.after===null?'不可计算':nfmt(m.after,3)} ${esc(m.unit)}</div>`).join('')}</div>`:''}<div class="info">${impact.report_needs_refresh?(impact.comparing_to_newer?'当前查看的是历史快照，后续版本包含不同数据；不能将当前视图当作最新修订。':'旧版本报告不能代表当前版本；需要重新导出包含最新年度和修订口径的报告。'):'未发现可识别的财务金额或来源差异，但真实性仍待核实。'} ${esc(impact.caution)}</div></div>`:box(esc(impact.reason));
 return `<section class="panel continuity-panel" id="continuity-workbench"><div class="panel-head"><div class="panel-title">企业持续观察 · 趋势、问题与修订影响</div><div class="panel-note">从刚分析过的财务现象出发，按需查看长期变化；全部来自本企业已上传的三表</div></div><div class="continuity-bar"><div><div class="continuity-overline">HISTORICAL FINANCIAL CONTEXT</div><strong>${esc(P.name)} · ${P.years.length} 个已导入年度</strong><p>数据不可用的年份不连线，历史观察线不触发不等于问题已经解决。</p></div>${select}</div>
 ${continuationChart(trend.points,trend.label,trend.unit)}<div class="continuity-table">${tab(['年度','有效数值','与相邻上年变化','下一步'],rows)}</div>
 <div class="continuity-subheading"><h3>重点财务问题 · ${y} 年的持续跟踪</h3><small>6 条内部规则 · 与 ${y-1} 年相邻且可靠时才做变化判定</small></div><div class="continuity-tracks">${follow}</div>${editor}${watchStatus?`<div class="info">${esc(watchStatus)}</div>`:''}
 ${casePanel(P,y,caseRows)}
 <div class="continuity-subheading"><h3>财务修订会改变哪些判断？</h3><small>基于原版本快照重算，不借用合成模型</small></div>${impacted}
 <div class="continuity-footer"><div><strong>把本次连续分析带走</strong><small>包含年度趋势、规则状态、快照差异和人工笔记；不包含原始上传文件。${notesCount?'已有 '+notesCount+' 条手工跟进记录。':''}</small></div><div class="action-row"><button class="primary-btn continuity-export" data-format="html">导出持续分析报告 HTML</button><button class="ghost-btn continuity-export" data-format="csv">数据 CSV</button><button class="ghost-btn continuity-export" data-format="json">完整 JSON</button></div></div><div class="mini-muted">保存人工笔记后，如需跨会话保留，请在下方项目管理区主动点击“保存到此浏览器”或导出项目包 JSON。数据核验通过不代表官方财报真实性得到认证。</div></section>`;
}
function exportContinuity(format){
 if(!project)return;
 const api=window.QZContinuity,doc={schema:'qcz.continuity-report.v2.4',generated_at:new Date().toISOString(),entity:project.name,
  fiscal_year:selectedYear,active_snapshot_id:activeRevision,authenticity_verified:false,trend_unit:'各指标见字段定义',
  trends:Object.fromEntries(api.metricOptions(project).map(o=>[o.key,api.trend(project,o.key,disclosure)])),
  rules_by_year:Object.fromEntries(project.years.map(y=>[y,api.monitoring(project,y,disclosure)])),
  revision:api.revisionImpact(revisions,activeRevision,project,compute),user_followup_notes:api.safeNotes(watchNotes),case_workflow:window.QZCases.report(project,disclosure,caseRecords),
  limits:['仅用于用户上传材料的内部连续数值观察，不构成审计、信用评级或投资建议','年度缺口、会计勾稽阻断及原文冲突时不生成该年度趋势点或风险恢复结论','所谓问题不再触发只表示某项内部阈值条件没有再满足，不代表问题已解决','修订版之间比较未按版本保存独立披露核对材料，真实性与原文一致性需要重新确认','用户人工笔记及问题核验记录不影响自动计算，不属于独立审计证明','财报或来源修订后原人工核验标记为需重新复核，不会自动确认问题解决','仅用户主动导出，不会上云同步']};
 const name='企财智策_'+project.name.replace(/[\\/:*?"<>|]/g,'_')+'_企业持续分析_'+activeRevision;
 if(format==='json'){download(name+'.json',JSON.stringify(doc,null,2),'application/json;charset=utf-8');return;}
 if(format==='csv'){
  const rows=[['类别','年度','代码/指标','名称/内容','数值','单位','变化','核验/状态','当前快照','备注']];
  for(const t of Object.values(doc.trends))for(const p of t.points)rows.push(['年度趋势',p.year,t.key,t.label,p.available?p.value:'',t.unit,p.change??'',p.available?'有效':p.gate,activeRevision,p.reason]);
  for(const [y,rules] of Object.entries(doc.rules_by_year))for(const r of rules)rows.push(['规则跟进',y,r.key,r.title,r.value??'','',r.hit===null?'':r.hit?'触发':'未触发',r.state_label,activeRevision,r.reason]);
  for(const [key,r] of Object.entries(doc.user_followup_notes))rows.push(['人工笔记','','',key,r.note,'','',r.status,activeRevision,r.updated_at]);
  for(const c of doc.case_workflow)rows.push(['问题核验',c.year,c.rule,c.assessment_label,c.evidence,'',c.next_check,c.freshness_label,c.reviewed_snapshot,c.action+' / '+c.note]);
  download(name+'.csv',csv(rows),'text/csv;charset=utf-8');return;
 }
 const current=api.monitoring(project,selectedYear,disclosure),changes=doc.revision;
 const table=(h,rows)=>plainTable(h,rows);
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>企财智策 · ${esc(project.name)} 持续分析</title><style>body{font:15px/1.8 'Microsoft YaHei',Arial,sans-serif;max-width:1060px;padding:20px 30px;margin:30px auto;color:#263744}h1{font-size:28px}h2{font-size:20px;border-bottom:1px solid #b0cbd6;padding-bottom:8px;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #c4d4dd;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#e7f0f5}.caution{background:#fff1db;padding:15px;margin:15px 0;color:#695035}.muted{color:#526779;font-size:12px}@media print{button{display:none}}</style></head><body><h1>企业持续财务分析</h1><p>${esc(project.name)} · 当前视图 ${selectedYear} 年 · 快照 ${esc(activeRevision)} · ${esc(doc.generated_at)}</p><div class="caution">本报告仅反映本地上传三表及内部阈值，不是财务审计、官方来源认证或经营预测。财报更正后旧版结论和报告可能失效。查看所有数值应结合原文件核对。</div><h2>各年度指标趋势</h2>${table(['指标','年度','有效值','单位','相邻上年变化','状态'],Object.values(doc.trends).flatMap(t=>t.points.map(p=>[t.label,p.year,p.available?nfmt(p.value,4):'不可计算',t.unit,p.comparable?nfmt(p.change,4):'—',p.gate])))}<h2>${selectedYear} 年的六项规则跟踪</h2>${table(['规则','阈值','本年度状态','与相邻上年的关系','说明'],current.map(r=>[r.title,r.criterion,r.hit===null?'未判定':r.hit?'达到观察线':'未达到观察线',r.state_label,r.reason]))}<h2>版本变化与报告有效性</h2><p>${changes.available?`对比 ${esc(changes.older_id)} → ${esc(changes.newer_id)}；原始字段变化 ${changes.changed_fields} 项；来源或声明变化 ${changes.source_changes} 项；可验证指标变化 ${changes.metric_changes.length} 项；新增年度 ${esc(changes.added_years.join('、')||'无')}。${changes.report_needs_refresh?'需要按当前快照重新导出结论。':'未发现明显财务金额变化。'}`:esc(changes.reason)}</p><h2>人工跟进笔记（不会影响数值状态）</h2>${table(['快照/年度/规则','状态','备注','更新时间'],Object.entries(doc.user_followup_notes).map(([k,v])=>[k,api.WATCH_STATES[v.status],v.note,v.updated_at]))}<h2>问题核验与处理记录</h2><p>本区为使用者自行填写的人工工作记录，不代表第三方审计或官方真实性认证。数据更正后，旧记录标为需重新核对。</p>${table(['年度/规则','人工判断','证据定位','处理计划','当前有效性','下次核对'],doc.case_workflow.map(c=>[c.year+' / '+c.rule,c.assessment_label,c.evidence,c.action,c.freshness_label,c.next_check]))}<h2>限制与核验</h2>${doc.limits.map(s=>`<p>• ${esc(s)}</p>`).join('')}<button onclick="window.print()">打印 / 保存 PDF</button></body></html>`;
 download(name+'.html',html,'text/html;charset=utf-8');
}
function bindContinuity(){
 document.querySelector('#continuity-metric')?.addEventListener('change',e=>{continuityMetric=e.target.value;global.QZUser.refresh();document.getElementById('continuity-workbench')?.scrollIntoView({block:'start'});});
 document.querySelectorAll('.continuity-drill').forEach(b=>b.addEventListener('click',()=>{const y=Number(b.dataset.year),k=b.dataset.metric;
  if(!project?.years.includes(y)||!window.QZInsights.metricDetail(project,y,k))return;
  selectedYear=y;focusChoice={kind:'metric',key:k};watchEditingKey=null;global.QZUser.refresh();document.getElementById('insight-detail-body')?.scrollIntoView({block:'start',behavior:'smooth'});
 }));
 document.querySelectorAll('.continuity-follow').forEach(b=>b.addEventListener('click',()=>{watchEditingKey=continuationKey(selectedYear,b.dataset.rule);watchStatus='';global.QZUser.refresh();document.querySelector('.continuity-editor')?.scrollIntoView({block:'nearest'});}));
 document.getElementById('continuity-watch-cancel')?.addEventListener('click',()=>{watchEditingKey=null;global.QZUser.refresh();document.getElementById('continuity-workbench')?.scrollIntoView({block:'start'})});
 document.getElementById('continuity-watch-save')?.addEventListener('click',()=>{const status=document.getElementById('continuity-watch-state')?.value,note=document.getElementById('continuity-watch-note')?.value?.trim()||'';
  try{const next={...watchNotes,[watchEditingKey]:{status,note,updated_at:new Date().toISOString()}};watchNotes=window.QZContinuity.safeNotes(next);watchEditingKey=null;watchStatus='已记录在当前项目会话。请在下方项目管理区手动保存到浏览器或导出项目包，以便下次继续跟进。';global.QZUser.refresh();document.getElementById('continuity-workbench')?.scrollIntoView({block:'start'});}catch(err){watchStatus='无法保存跟进：'+err.message;global.QZUser.refresh()}
 });
 // The case editor lives in the same financial context as the observed rule.
 document.querySelectorAll('.case-open').forEach(b=>b.addEventListener('click',()=>{caseEditingKey=window.QZCases.key(selectedYear,b.dataset.rule);caseStatus='';global.QZUser.refresh();document.getElementById('case-editor')?.scrollIntoView({block:'center',behavior:'smooth'})}));
 document.querySelector('#case-cancel')?.addEventListener('click',()=>{caseEditingKey=null;caseStatus='';global.QZUser.refresh();document.getElementById('case-workflow')?.scrollIntoView({block:'nearest'})});
 document.querySelector('#case-save')?.addEventListener('click',()=>{
  try{const [year,rule]=caseEditingKey.split(':');const get=id=>document.getElementById(id)?.value||'';
   caseRecords=window.QZCases.update(caseRecords,project,Number(year),rule,disclosure,{state:get('case-state'),assessment:get('case-assessment'),evidence:get('case-evidence'),action:get('case-action'),note:get('case-note'),next_check:get('case-next')},activeRevision);
   caseEditingKey=null;caseStatus='已记录核验与处理事项（当前会话）。如需下次继续，请导出项目 JSON 或主动保存到浏览器。';
   global.QZUser.refresh();document.getElementById('case-workflow')?.scrollIntoView({block:'start'});
  }catch(ex){caseStatus='未保存：'+ex.message;const warning=document.getElementById('case-error');if(warning){warning.hidden=false;warning.textContent=caseStatus;warning.scrollIntoView({block:'nearest'});}}

 });
 document.querySelector('#case-export-json')?.addEventListener('click',()=>{if(project)download('企财智策_'+project.name+'_问题核验记录.json',JSON.stringify({schema:'qcz.case-report.v2.5',entity:project.name,snapshot:activeRevision,authenticity_verified:false,cases:window.QZCases.report(project,disclosure,caseRecords)},null,2),'application/json;charset=utf-8')});
 document.querySelectorAll('.continuity-export').forEach(b=>b.addEventListener('click',()=>exportContinuity(b.dataset.format)));
}

// v2.6 — non-invasive reading desk and unified presentation of EXISTING evidence.
function deliveryContext(P,y){return window.QZDelivery.describe(P,y,disclosure,caseRecords,activeRevision,revisions.at(-1)?.id)}
function summaryPanel(P,y){
 const s=deliveryContext(P,y),needs=s.counts.needs_recheck;
 const first=s.issue.find(i=>i.kind==='review')||s.issue[0];
 const hint=s.gate.blocked?'本年停止经营解读':s.historical?'当前不是最新财务快照':needs?'历史人工核验须重新确认':s.counts.observations?'优先核对触发项':'以有效数据为依据继续查看';
 const headlineMetrics=s.gate.blocked?'':['net_margin','leverage'].map(k=>P.items[y].metricByKey[k]).filter(m=>m?.available).map(m=>`<span>${esc(m.label)} ${nfmt(m.value,2)} ${esc(m.unit)}</span>`).join('');
 const follow=s.gate.blocked?'<span>经营判断已暂停</span>':`${headlineMetrics}<span>${s.counts.valid_metrics} 项可用比率</span><span>${s.counts.observations} 条阈值触发</span><span>${s.counts.unverified} 条暂无法判断</span>`;
 const primary=first&&!s.gate.blocked?`<button class="primary-btn v26-open-issue" data-issue="${esc(first.id)}">查看这条观察的取数证据 →</button>`:`<button class="primary-btn v26-jump" data-target="${esc(s.target)}">${esc(s.next)} →</button>`;
 return `<section class="v26-brief" id="v26-brief" aria-label="本次分析摘要"><div class="v26-brief-main"><div class="v26-eyebrow">ANALYSIS BRIEF / ${esc(y)} · ${esc(hint)}</div><h2>${esc(s.headline)}</h2><p>${esc(s.body)}</p><div class="v26-facts">${follow}<span>${s.counts.case_records} 条人工核验记录${needs?' · '+needs+' 条待重核':''}</span></div><div class="v26-actions">${primary}<button class="ghost-btn v26-jump" data-target="delivery-report-hub">生成整合报告</button></div></div><div class="v26-brief-side"><span class="v26-side-top">本次判断与数据绑定</span><strong>${esc(P.name)}</strong><div>${y} 年 · ${P.years.length} 个年度 · 当前快照 ${esc((activeRevision||'未记录').slice(0,19))}</div><div class="v26-side-rule">${esc(s.gate.reason)}</div><button class="v26-text-link v26-jump" data-target="project-manager">查看版本与保存位置 ↗</button></div></section>
 <nav class="v26-anchors" aria-label="当前企业分析区快捷导航"><button class="v26-jump" data-target="v26-brief">分析摘要</button><button class="v26-jump" data-target="insight-detail-body">证据详情</button><button class="v26-jump" data-target="continuity-workbench">年度趋势与问题</button><button class="v26-jump" data-target="delivery-report-hub">报告</button><button class="v26-jump" data-target="v26-detailed-tables">底层表格</button><button class="v26-jump" data-target="project-manager">保存与修订</button></nav>`;
}
function reportFreshness(record){
 if(!record)return {code:'missing',label:'尚未选择报告'};
 let current=null;
 try{current=makeReportDocument(record)}catch{}
 return window.QZReports.state(record,activeRevision,revisions.at(-1)?.id,current);
}
function makeReportDocument(report=null){
 const periodOnly=report?.document?.context?.report_scope==='period'||(!report&&reportScope==='period');
 if(periodOnly)return window.QZDelivery.buildPeriod(project,currentInputs?.period_data,activeRevision,revisions.at(-1)?.id,currentInputs);
 const year=report?.document?.context?.fiscal_year||selectedYear;
 return window.QZDelivery.build(project,year,disclosure,caseRecords,activeRevision,revisions.at(-1)?.id,report?.document?.sections||deliveryParts);
}
function periodDeliveryPanel(P){
 const book=currentInputs?.period_data,analysis=window.QZPeriods.analyze(book),latest=analysis.rows.at(-1),preview=window.QZDelivery.buildPeriod(P,book,activeRevision,revisions.at(-1)?.id,currentInputs);
 const existing=reportRecords.map(r=>`<option value="${esc(r.id)}" ${selectedReportId===r.id?'selected':''}>${esc(r.document.context.report_scope==='period'?(r.document.context.focus_period||'期间')+' 期间':'年度 '+r.document.context.fiscal_year)} · ${esc(r.created_at.slice(0,16).replace('T',' '))} · ${esc(r.id.slice(0,8))}</option>`).join('');
 return `<section class="panel v26-report" id="delivery-report-hub"><div class="v26-report-heading"><div><div class="v26-eyebrow">ONE SOURCE · ONE DELIVERABLE</div><h2>本期管理报告 · 直接交付 PDF/Excel</h2><p>无需再拼接期间 CSV、HTML 和年度报告。每份草稿绑定当前期间账簿及财务快照；缺期和未认证来源明确列为限制。</p></div><div class="v26-report-aside"><small>企业财务期间</small><strong>${esc(latest?.period||'尚未上传')}</strong><span>${book.frequency==='month'?'月度':'季度'} · ${book.flow_basis==='ytd'?'年初累计差分':'单期发生额'}</span></div></div>
 ${P.years.length?'<div class="filter-bar"><button class="ghost-btn" id="g1-scope-annual">切换到年度报告</button><button class="primary-btn" id="g1-scope-period">期间报告</button></div>':''}
 <p class="v26-preview-head">${esc(preview.summary.headline)}</p><p>${esc(preview.summary.body)}</p><div class="info">分析、报告和项目归档使用同一个财务快照 ${esc(activeRevision||'')}。本期资料缺失时不生成虚构的同比或全年结论。</div>
 <div class="v30c-report-card"><h3>生成并归档报告</h3><div class="filter-bar"><label>历史报告<select id="v30c-record-select" class="form-select"><option value="">请选择</option>${existing}</select></label><button class="primary-btn" id="v30c-create">生成本期报告草稿</button></div><div class="v30c-report-state">${(()=>{const r=reportRecords.find(x=>x.id===selectedReportId);return r?'报告 '+esc(r.id)+' · '+esc(reportFreshness(r).label):'尚未生成；生成后再下载 PDF/Excel，并主动保存企业项目。';})()}</div><div class="action-row"><button class="ghost-btn" id="v30c-review" ${selectedReportId?'':'disabled'}>登记人工核对</button><button class="primary-btn" id="v30c-export-pdf" ${selectedReportId?'':'disabled'}>下载 PDF</button><button class="ghost-btn" id="v30c-export-xlsx" ${selectedReportId?'':'disabled'}>下载 Excel</button></div></div>
 <div class="v26-report-status" id="delivery-status" role="status">${esc(deliveryStatus||'报告会独立归档，单用户核对不是正式审批。')}</div><div class="action-row"><button class="ghost-btn" id="v26-export-html">备用 HTML</button><button class="ghost-btn" id="v26-export-json">同源 JSON</button><button class="ghost-btn v26-jump" data-target="project-manager">保存企业项目 ↓</button></div></section>`;
}
function deliveryPanel(P,y){
 if(reportScope==='period'&&currentInputs?.period_data)return periodDeliveryPanel(P);
 const api=window.QZDelivery,s=deliveryContext(P,y),chosen=api.pick(deliveryParts),count=Object.values(chosen).filter(Boolean).length;
 return `<section class="panel v26-report" id="delivery-report-hub"><div class="v26-report-heading"><div><div class="v26-eyebrow">ONE SOURCE · ONE DELIVERABLE</div><h2>把本次分析整理成一份报告</h2><p>以当前企业、年度、财务快照为唯一上下文；按需要保留章节。自动写入数据限制、版本标识与来源说明，不借用仿真企业评分。</p></div><div class="v26-report-aside"><small>当前报告上下文</small><strong>${esc(y)} 财务年度</strong><span>${esc((activeRevision||'').slice(0,22))}</span></div></div>
 ${currentInputs?.period_data?`<div class="filter-bar"><button class="primary-btn" id="g1-scope-annual">年度报告</button><button class="ghost-btn" id="g1-scope-period">切换到月度/季度管理报告 →</button></div>`:''}<div class="v26-report-grid"><div class="v26-report-controls"><div class="v26-report-label">报告章节 <span>${count} / 5 个章节</span></div>${Object.entries(api.SECTIONS).map(([key,label],i)=>`<label class="v26-section"><input type="checkbox" class="v26-report-check" data-section="${key}" ${chosen[key]?'checked':''}><span><b>${String(i+1).padStart(2,'0')} / ${esc(label)}</b><small>${esc(({findings:'本年经营观察和六项内部规则',metrics:'公式、数值、核验与缺失限制',trends:'连续期间、非相邻年份不生成同比',cases:'人工判断、证据位置、是否待重核',sources:'文件 SHA-256、披露与适用范围'})[key])}</small></span></label>`).join('')}</div>
 <div class="v26-report-preview"><span class="v26-report-label">交付预览 · 仅显示真实可用内容</span><h3>${esc(P.name)} <small>${y} 年财务分析</small></h3><p class="v26-preview-head">${esc(s.headline)}</p><p>${esc(s.body)}</p><div class="v26-preview-meta">财务状态　${esc(s.gate.state)}<span>·</span>人工记录　${s.counts.case_records}<span>·</span>待重核　${s.counts.needs_recheck}</div><div class="v26-preview-outline">${Object.entries(api.SECTIONS).filter(([k])=>chosen[k]).map(([k,l])=>`<div>${esc(l)} <span>包含</span></div>`).join('')||'<p>请至少选择一个章节再导出。</p>'}</div><small>可先按下方按钮归档报告，再直接生成 PDF/Excel；原 HTML 仍可打印。所有文件在本机生成，不包含原始 Excel 字节。</small></div></div>
 <div class="v30c-report-card"><div class="v30c-report-head"><div><div class="v26-eyebrow">REPORT RECORDS · SNAPSHOT-BOUND</div><h3>管理报告交付与历史归档</h3><p>将本次报告保存为不可修改的快照记录，可登记人工核对；正式导出使用所选记录，而不是页面后来变化的内容。</p></div><span>最多 24 份 · 需主动保存到项目库</span></div><div class="filter-bar"><label>已归档报告 <select id="v30c-record-select" class="form-select"><option value="">请选择报告</option>${reportRecords.map(r=>`<option value="${esc(r.id)}" ${selectedReportId===r.id?'selected':''}>${esc(r.document.context.fiscal_year)} 年 · ${esc(r.created_at.slice(0,16).replace('T',' '))} · ${r.review_state==='reviewed'?'人工已核对':'草稿'} · ${esc(r.id.slice(0,8))}</option>`).join('')}</select></label><button id="v30c-create" class="primary-btn" ${count?'':'disabled'}>生成并归档报告草稿</button></div><div class="v30c-report-state">${(()=>{const r=reportRecords.find(x=>x.id===selectedReportId);if(!r)return '暂无已选报告。生成草稿后可导出 PDF/Excel；关闭软件前请主动保存企业项目。';const f=reportFreshness(r);return '报告编号 '+esc(r.id)+' · '+esc(f.label)+' · '+(r.review_state==='reviewed'?'已登记人工核对':'未人工核对的草稿')+(r.reviewed_at?' · 复核登记 '+esc(r.reviewed_at.slice(0,16)):'')})()}</div><div class="action-row"><button class="ghost-btn" id="v30c-review" ${selectedReportId?'':'disabled'}>登记人工核对</button><button class="primary-btn" id="v30c-export-pdf" ${selectedReportId?'':'disabled'}>下载 PDF 报告</button><button class="ghost-btn" id="v30c-export-xlsx" ${selectedReportId?'':'disabled'}>下载 Excel 工作簿</button></div><div class="mini-muted">草稿与人工核对均不等于企业正式审批或财务审计。历史报告保留原财务快照及指标，不会随当前数据更新；导出会明确标记草稿和版本状态。</div></div>
 <div class="v26-report-bottom"><div class="v26-report-status" id="delivery-status" role="status">${esc(deliveryStatus||'选择章节后，可以生成报告草稿并下载 PDF/Excel，原 HTML/JSON 专项导出仍保留。')}</div><div class="action-row"><button class="primary-btn" id="v26-export-html" ${count?'':'disabled'}>下载整合报告 HTML</button><button class="ghost-btn" id="v26-export-json" ${count?'':'disabled'}>同源数据 JSON</button><button class="ghost-btn v26-jump" data-target="user-export-section">其他专项导出 ↗</button></div></div></section>`;
}
function bindDelivery(){
 document.getElementById('g1-scope-period')?.addEventListener('click',()=>{reportScope='period';global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'})});
 document.getElementById('g1-scope-annual')?.addEventListener('click',()=>{reportScope='annual';global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'})});
 document.querySelectorAll('.v26-jump').forEach(b=>b.addEventListener('click',()=>{const el=document.getElementById(b.dataset.target);if(!el)return;if(el.tagName==='DETAILS')el.open=true;const parent=el.closest('details:not([open])');if(parent)parent.open=true;el.scrollIntoView({block:'start',behavior:'smooth'});if(b.dataset.target==='insight-detail-body'){el.setAttribute('tabindex','-1');el.focus({preventScroll:true})}}));
 document.querySelectorAll('.v26-open-issue').forEach(b=>b.addEventListener('click',()=>{focusChoice={kind:'issue',key:b.dataset.issue};global.QZUser.refresh();document.getElementById('insight-detail-body')?.scrollIntoView({block:'start',behavior:'smooth'})}));
 document.querySelectorAll('.v26-report-check').forEach(el=>el.addEventListener('change',e=>{deliveryParts[e.target.dataset.section]=e.target.checked;global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'})}));
 function exportBrief(type){if(!project)return;try{const data=makeReportDocument();
  if(!Object.values(data.sections).some(Boolean))throw Error('至少选择一个报告章节');
  const file='企财智策_'+project.name.replace(/[\\/:*?"<>|]/g,'_')+'_'+selectedYear+'_整合报告_'+(activeRevision||'current').replace(/[^a-zA-Z0-9_-]/g,'') ;
  if(type==='html')download(file+'.html',window.QZDelivery.printHtml(data),'text/html;charset=utf-8');
  else download(file+'.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');
  deliveryStatus='已生成 '+(type==='html'?'HTML 可打印报告':'JSON 结构化报告')+'。当前版本：'+activeRevision+'；如果更正数据，需重新导出。';
  const status=document.getElementById('delivery-status');if(status)status.textContent=deliveryStatus;
 }catch(err){deliveryStatus='报告未生成：'+err.message;const status=document.getElementById('delivery-status');if(status)status.textContent=deliveryStatus;}}
 document.getElementById('v30c-record-select')?.addEventListener('change',e=>{selectedReportId=e.target.value||null;const chosen=reportRecords.find(x=>x.id===selectedReportId);if(chosen)reportScope=chosen.document.context.report_scope==='period'?'period':'annual';global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'})});
 document.getElementById('v30c-create')?.addEventListener('click',async()=>{
  try{const doc=makeReportDocument();
   const result=await window.QZReports.create(reportRecords,doc);reportRecords=result.records;selectedReportId=result.record.id;
   deliveryStatus='已归档报告草稿 '+selectedReportId+'；这是当前会话记录，请点击「保存当前企业到本机项目库」使其持久保存。';
  }catch(e){deliveryStatus='归档失败：'+e.message}global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'});
 });
 document.getElementById('v30c-review')?.addEventListener('click',()=>{
  try{const record=reportRecords.find(r=>r.id===selectedReportId);if(!record)throw Error('请先选择报告');
   if(!confirm('此操作只是单用户的人工核对登记，不代表正式审批。确定已核对原始金额、来源、会计口径与报告限制吗？'))return;
   const note=prompt('简要记录核对内容（至少8个字），例如：已对照2022年三张源表核对金额与字段。','已逐项核对原始财报、公式及来源限制');
   if(note===null)return;const current=makeReportDocument(record);
   reportRecords=window.QZReports.review(reportRecords,selectedReportId,activeRevision,revisions.at(-1)?.id,note,current);
   deliveryStatus='人工核对已登记；仍需主动保存企业项目；本地登记不等于正式批准。';
  }catch(e){deliveryStatus='无法登记：'+e.message}global.QZUser.refresh();document.getElementById('delivery-report-hub')?.scrollIntoView({block:'start'});
 });
 async function exportRecorded(kind){
  const button=document.getElementById('v30c-export-'+kind);
  try{
   const record=reportRecords.find(r=>r.id===selectedReportId);if(!record)throw Error('请先选择已归档报告');
   await window.QZReports.verify([record]);
   if(!record.document.context.snapshot_id)throw Error('报告缺少财务快照版本');
   if(button){button.disabled=true;button.textContent='正在生成本地文件…'}
   const result=await fetch('/api/reports/export/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-QZ-Local-Request':'1'},body:JSON.stringify({document:record.document,record:{id:record.id,review_state:record.review_state,review_note:record.review_note,version_state:reportFreshness(record).code}})});
   if(!result.ok){let message='本地导出不可用';try{const err=await result.json();message=err.error||message}catch{}throw Error(message)}
   const blob=await result.blob();if(blob.size<100)throw Error('导出文件为空');
   const safe=record.document.context.entity.replace(/[\\/:*?"<>|]/g,'_').slice(0,40);
   const file='企财智策_'+safe+'_'+(record.document.context.focus_period||record.document.context.fiscal_year)+'_'+record.id.slice(0,8)+'.'+kind;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
   deliveryStatus='已导出 '+kind.toUpperCase()+' · 绑定报告 '+record.id+'；请妥善保管。';
  }catch(e){deliveryStatus='报告导出失败：'+e.message+'。仍可使用原 HTML 报告并打印 PDF。'}
  if(button){button.disabled=false;button.textContent=kind==='pdf'?'下载 PDF 报告':'下载 Excel 工作簿'}
  const status=document.getElementById('delivery-status');if(status)status.textContent=deliveryStatus;
 }
 document.getElementById('v30c-export-pdf')?.addEventListener('click',()=>exportRecorded('pdf'));
 document.getElementById('v30c-export-xlsx')?.addEventListener('click',()=>exportRecorded('xlsx'));
 document.getElementById('v26-export-html')?.addEventListener('click',()=>exportBrief('html'));
 document.getElementById('v26-export-json')?.addEventListener('click',()=>exportBrief('json'));
}
function view(){const P=project;const years=P?.years||[],y=years.includes(selectedYear)?selectedYear:years.at(-1),r=P?.items[y];
 if(P&&!years.length&&currentInputs?.period_data){
  reportScope='period';const p=window.QZPeriods.analyze(currentInputs.period_data),last=p.rows.at(-1);
  return `<div class="hero-panel user-hero"><div class="overline">REAL PERIOD FINANCIALS · PERIOD-ONLY PROJECT</div><h2>${esc(P.name)} · 月度/季度经营分析</h2><p>此企业尚未上传年度三表。本页面只依据真实导入的期间财务数据计算，不会虚构年度指标。继续上传、核对、报告、保存均在本项目完成。</p><div class="action-row"><span class="pill">${p.rows.length} 个期间 · ${esc(last?.period||'')}</span><button class="ghost-btn" id="project-jump">保存与历史版本 ↓</button><button class="ghost-btn" id="user-clear">切换企业项目</button></div></div>
  <nav class="v26-anchors"><button class="v26-jump" data-target="period-workbench">期间经营数据</button><button class="v26-jump" data-target="delivery-report-hub">统一管理报告</button><button class="v26-jump" data-target="project-manager">项目保存/恢复</button></nav>
  ${window.QZPeriodUI.render(currentInputs.period_data,currentInputs)}${deliveryPanel(P,null)}${archiveControls()}`;
 }
 const selectYear=P?`<label>报告年度 <select id="user-year" class="form-select">${years.map(yr=>`<option ${yr===y?'selected':''}>${yr}</option>`).join('')}</select></label>`:'';
 const externalDiscrepancy=disclosure.review?.byYear?.[y]?.difference>0;
 const status=P?`<span class="pill ${externalDiscrepancy||r.blocked||r.quality.dataStatus==='PARTIAL'?'gold':''}">${externalDiscrepancy?'原文数字存在差异 · 对外结论待复核':r.blocked?'会计校验未通过 · 禁止提供综合结论':r.quality.dataStatus==='PARTIAL'?'部分核验 · 有待复核项目':'指定会计关系已数值核对'}</span>`:'<span class="pill gold">未接入用户三表</span>';
 return `<div class="hero-panel user-hero"><div class="overline">USER-SUPPLIED FINANCIAL DATA / 10</div><h2>${P?`已接入 ${esc(P.name)} · 独立财务诊断`:'用户财务诊断 · 独立计算与证据链'}</h2><p>三表原始文件仅在当前浏览器内解析；主动保存时，标准化金额与来源记录写入本机项目库；不写入合成样本库，不交给合成企业的评分、聚类、迁移预测和优化模块。每一项结论都能回溯公式、年度及你上传的源字段。</p><div class="action-row">${status}<button class="ghost-btn go" data-go="ingest">重新选择源文件 →</button><button class="ghost-btn" id="user-clear">清空当前上传数据</button>${P?'<button class="ghost-btn" id="project-jump">保存项目 / 追加报表 ↓</button>':''}</div></div>
 ${!P?importControls():''}
 ${!P?`${panel('如何开始','在 01 企业接入选择三份 CSV 或一个三工作表 XLSX',`<div class="action-row"><button class="primary-btn go" data-go="ingest">去上传和映射报表 →</button></div>${box('尚未分析任何用户数据。不会自动借用 328 家合成企业的金额或评分。')}`)}`:
 `<div class="filter-bar">${selectYear}<span class="pill">${esc(P.name)} · ${years.length} 个共同年度</span></div>
 <div class="stat-strip compact-stats">${tile('营业收入',r.blocked?'阻断':nfmt(r.fields.is.revenue),'万元 · 用户输入')}${tile('净利润',r.blocked?'阻断':nfmt(r.fields.is.net_income),'万元')}${tile('经营现金流',r.blocked?'阻断':nfmt(r.fields.cf.operating_cf),'万元')}${tile('有效财务比率',r.blocked?'0':r.metrics.filter(x=>x.available).length,'项 · 未套用合成评分')}</div>
 ${summaryPanel(P,y)}
  ${insightPanel(P,y)}
 ${window.QZPeriodUI?.render(currentInputs?.period_data||null,currentInputs)||''}
 ${continuityPanel(P,y)}
  ${deliveryPanel(P,y)}
 <div id="user-year-bridge">${bridgePanel(P,y)}</div>
  <details class="v26-advanced" id="v26-quick-metrics"><summary><strong>指标速览表</strong><span>保留全部指标入口与公式表格；默认收起，先看上方重点观察即可</span></summary>
  ${panel('财务指标速览','点选指标可查看已有公式的实际取数，不用自己猜列名',tab(['指标','计算结果','计算公式','查看原始取数'],r.metrics.map(x=>[esc(x.label),!r.blocked&&x.available?`${nfmt(x.value,2)} ${esc(x.unit)}`:'不可计算',esc(x.formula),`<button class="ghost-btn insight-metric-link" data-metric="${esc(x.key)}">查看证据 →</button>`])))}
  </details>
  ${trustPanel(P,y)}
 ${window.QZPdfAuto.render(P)}
 <div id="user-disclosure-check">${disclosurePanel(P,y)}</div>
 ${panel('数据准入与勾稽','年度 '+y+' · 已转换为万元，阈值为 max(0.05万元, 两端较大绝对值的0.01%)',tab(['校验等式','结果','差额 / 万元','说明'],r.checks.map(x=>[esc(x.label),x.status==='pass'?'<span class="pill">通过</span>':x.status==='fail'?'<span class="pill gold">不通过</span>':'缺少字段，未验证',nfmt(x.delta,4),esc(x.reason)]))+`${r.warnings.length?box(r.warnings.map(esc).join('；')):''}${r.blocked?box('存在会计等式不一致：本年度的评分、风险与财务比率结论已被阻断。请修正源表后重新导入。'):box('此处仅验证数值和财务结构；不证明报告真实、审计有效或来源可信。')}`)}
  <details class="v26-advanced" id="v26-detailed-tables"><summary><strong>原始指标、规则与字段明细</strong><span>按需展开所有技术性表格，不影响旧版数据核对或导出</span></summary>
  ${panel(externalDiscrepancy?'财务指标试算（原文差异待核对）':'财务指标与公式','无有效分母或期初数据时显示不可计算，不以0替代缺失值',tab(['指标','计算结果','计算公式','来源字段 / 限制'],r.metrics.map(x=>[esc(x.label),!r.blocked&&x.available?`${nfmt(x.value,2)} ${esc(x.unit)}`:'不可计算',esc(x.formula),esc((x.inputs||[]).join(' / ')+(x.note?'；'+x.note:''))])))}
 ${panel('跨年度经营现金与利润对照','同一币种与统一万元口径；缺少年初财报时不计算平均资产类比率',plot(P,years)+`<div class="info">图中仅展示通过会计检查的年度；为用户上传的金额对照，不包含外部行业样本。</div>`)}
 ${panel('透明风险观察','六项规则 · 未经过真实违约事件校准，不推断违约概率或未来业绩',externalDiscrepancy?box('原始披露数字对照发现差异，该年度风险观察暂停公开解读。'):tab(['观察','实测值','内部阈值','状态'],r.rules.map(x=>[esc(x.label),Number.isFinite(x.value)?nfmt(x.value,2):'—',esc(x.criterion),x.hit===null?'无法判定':x.hit?'<span class="pill gold">触发</span>':'未触发']))+box('触发项不是审计结论或投资建议；没有触发也不代表不存在经营风险。'))}
 ${panel('字段映射与取数证明','逐项保留来源字段与上传数值；所有金额已在当前分析口径中转换为万元',tab(['报表','分析字段','原始字段','上传原值','计算口径 / 万元'],TYPES.flatMap(t=>FIELD_SPECS[t].filter(([k])=>k!=='year').map(([k,label])=>[TYPE_NAMES[t],esc(label),esc(r.origin[t][k]?.header||'未提供'),esc(r.origin[t][k]?.raw??'—'),nfmt(r.fields[t][k])]))))}
  </details>
  <div id="user-export-section">${panel('证据来源与分析输出','由用户提供的本地文件计算，不包含合成企业比较或样本预测',tab(['报表','源文件 / 工作表','SHA-256 摘要'],TYPES.map(t=>[TYPE_NAMES[t],esc((P.sourceByYear[t]?.[y]||P.source[t]).label),`<code>${esc((P.sourceByYear[t]?.[y]||P.source[t]).sha.slice(0,24))}…</code>`]))+`<div class="action-row"><button class="primary-btn" id="user-export-html">导出可打印 HTML 财务报告 ↓</button><button class="ghost-btn" id="user-export-csv">导出指标与审计 CSV ↓</button><button class="ghost-btn" id="user-export-json">导出可复核 JSON ↓</button></div><div class="info">报告注明原始文件哈希、映射、公式、年份、验证状态与限制。用户原始行不自动存储或分享；导出文件由你自主保管。</div>`)}</div>
 ${archiveControls()}
 `}`;
}
function tile(title,value,foot){return `<div class="stat"><div class="stat-label">${title}</div><div class="stat-val">${value}</div><div class="stat-foot">${foot}</div></div>`}
function box(s){return `<div class="info-box">${s}</div>`}
function tab(headers,rows){return `<div style="overflow:auto"><table class="data-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function importPreview(){
 if(!TYPES.every(t=>uploaded[t]))return `<div class="info">上传三张报表后，将自动显示字段映射、年度覆盖、取数样例和可能覆盖的既有数据。</div>`;
 const review=window.QZImport.inspect(uploaded,assay,reviseMode?currentInputs:null);
 const status=t=>{const d=review.details[t],m=uploaded[t].mapping;const required=FIELD_SPECS[t].filter(f=>f[3]).map(f=>f[1]+' ← '+(m[f[0]]||'未匹配')).join('；');
  const sample=d.sample.map((row,i)=>`<tr><td>${i+1+(uploaded[t].data.headerRow||1)}</td><td>${esc(row[uploaded[t].data.headers.indexOf(m.year)]||'—')}</td><td>${esc(row.slice(0,3).join(' / ').slice(0,75))}</td></tr>`).join('');
  return `<div class="feature"><h4>${TYPE_NAMES[t]} <small>${d.rows} 行 · ${d.headers} 列</small></h4><p class="mini-muted">年度：${esc(d.years.join('、')||'未识别')}；${esc(uploaded[t].mappingFrom||'映射由当前文件识别')}</p><p class="mini-muted">${esc(required)}</p><table class="data-table"><thead><tr><th>原始行</th><th>年度</th><th>取数预览（前三列）</th></tr></thead><tbody>${sample}</tbody></table></div>`;};
 const plan=review.plan;const planStatus=plan?`<p class="mini-muted">本次计划：新年度报表 ${plan.added.length} 项；重复且数值未变 ${plan.duplicate.length} 项（保留原年度来源）；已有金额更正 ${plan.replacements.length} 项。</p>`:'';
 const replace=plan?.replacements.length?`<div class="info"><strong>本次将修改既有年度，须另行确认：</strong><div class="mini-muted">${plan.replacements.slice(0,12).map(v=>`${v.year}年${TYPE_NAMES[v.type]}：${v.changes.slice(0,4).map(f=>`${FIELD_SPECS[v.type].find(x=>x[0]===f.key)?.[1]||f.key} ${f.before??'空'} → ${f.after??'空'}`).join('、')}`).map(x=>`<p>${esc(x)}</p>`).join('')}${plan.replacements.length>12?'（其余请先检查源文件）':''}</div></div><label class="user-confirm"><input type="checkbox" id="user-restatement" ${restatementApproved?'checked':''}/> 我明确同意用本次文件更正上述已有财务金额，并建立新的历史快照；原版本继续保留。</label>`:'';
 const errors=review.errors.length?`<div class="info-box gold"><strong>导入前必须处理 ${review.errors.length} 项错误：</strong>${review.errors.slice(0,12).map(e=>`<p>${esc(e)}</p>`).join('')}${review.errors.length>12?`<p>另有 ${review.errors.length-12} 项，请检查原始表格。</p>`:''}</div>`:'<div class="info">三表必需字段与年度覆盖已预检。尚未写入任何企业项目；会计勾稽将在确认分析时再次执行。</div>';
 return `<section class="panel" id="user-import-preview"><h3 class="subheading">导入预检 · 字段、年度与修订影响</h3><p class="mini-muted">所有预检在本机浏览器内完成。行号依据解析出的表头位置；若 CSV 含跨行引号字段，请回原文件核对物理行号。</p><div class="insight-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${TYPES.map(status).join('')}</div>${planStatus}${replace}${errors}</section>`;
}
function refreshImportPreview(){const area=document.querySelector('#user-import-preview');if(!area)return;const holder=document.createElement('div');holder.innerHTML=importPreview();area.replaceWith(holder.firstElementChild);document.querySelector('#user-restatement')?.addEventListener('change',e=>{restatementApproved=e.target.checked})}
function entry(){
 if(startMode==='period'&&!reviseMode){
  return `<div class="hero-panel"><div class="overline">PERIOD-FIRST / NO ANNUAL PLACEHOLDER</div><h2>直接从月度或季度财务数据开始</h2><p>无需先上传年度三表。使用真实的三张期间报表创建企业项目，支持追加、更正、归档与正式 PDF/Excel 报告。历史年度分析可以以后再补充。</p><div class="action-row"><button class="primary-btn" id="g1-start-period">月度/季度项目</button><button class="ghost-btn" id="g1-start-annual">改用年度三表</button></div></div>
  <div class="panel" style="padding:18px 22px"><label>企业名称 <input id="period-company" maxlength="80" class="input-control" value="${esc(companyName)}" placeholder="请填写企业名称"/></label></div>
  ${window.QZPeriodUI.render(null,null)}${!project?importControls():''}`;
 }
 let selectors=TYPES.map(t=>{
  const u=uploaded[t],fields=u?.data?.headers||[],map=u?.mapping||{};
  let lines=u?FIELD_SPECS[t].map(([key,label,,required])=>`<label class="map-field">${esc(label)}${required?' *':''}<select class="form-select user-map" data-type="${t}" data-key="${key}"><option value="">— 不映射 —</option>${fields.map(f=>`<option value="${esc(f)}" ${map[key]===f?'selected':''}>${esc(f)}</option>`).join('')}</select></label>`).join(''):'';
  const opts=u?.sheets?.length>1?`<label>工作表<select class="form-select user-sheet" data-type="${t}">${u.sheets.map((s,i)=>`<option value="${i}" ${i===u.sheetIndex?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`:'';
  return `<div class="feature" style="min-width:0"><div class="n">${t.toUpperCase()} · REQUIRED</div><h3>${TYPE_NAMES[t]}</h3><input class="input-control user-file" data-type="${t}" type="file" accept=".csv,.xlsx" style="max-width:100%"/><div class="mini-muted">${u?esc(u.file.name)+' · '+u.data.rows.length+' 行 × '+u.data.headers.length+' 列':'未选择文件'}</div>${opts}<label>文件原始金额单位<select class="form-select user-unit" data-type="${t}">${Object.entries(unitLabels).map(([k,v])=>`<option value="${k}" ${(u?.unit||'wan')===k?'selected':''}>${v}</option>`).join('')}</select></label>${u?`<div class="map-fields">${lines}</div>`:''}</div>`;
 }).join('');
 return `<div class="hero-panel"><div class="action-row"><button class="ghost-btn" id="g1-start-period">按月度/季度开始（无需年度财报）</button><button class="primary-btn" id="g1-start-annual">年度财报</button></div><div class="overline">UPLOAD → MAP → VALIDATE → ANALYZE</div><h2>上传自己的财务数据，得到可复核的分析结果</h2><p>支持三份“每行一个年度”的 CSV（UTF-8 或 GB18030）或 XLSX。若 XLSX 包含三张工作表，也可在三个文件框选择同一工作簿并分别选取工作表。先核对金额单位、历史字段映射和导入预检，再执行三表勾稽。原始数据只在浏览器内存中处理。</p><div class="action-row"><button class="ghost-btn" id="user-examples">下载三表 CSV 填写模板 ↓</button><button class="ghost-btn go" data-go="user">查看用户数据分析工作台 →</button></div></div>${reviseMode&&project?`<div class="info">正在为 ${esc(project.name)} 追加/更正：请上传同一企业、相同会计主体口径的三张年度报表。新年度合并；重叠且金额一致的年度跳过；金额变动须在预检中明确确认，旧版本保留可恢复。再次勾选人工确认后才生效。</div>`:!project?importControls():''}
 <div class="panel" style="padding:18px 22px"><h3 class="subheading">快捷导入：一个包含三张财务报表的 Excel 工作簿</h3><div class="info">选择含“资产负债表、利润表、现金流量表”三个工作表的 .xlsx，可一次匹配三表；也可使用下方三个单独文件入口。</div><input class="user-file" type="file" id="user-workbook" accept=".xlsx" style="max-width:450px"/></div>
 <div class="filter-bar"><label>企业名称<input id="user-company" class="input-control" maxlength="80" value="${esc(companyName)}" placeholder="例如：测试企业A"/></label><label>CSV 文本编码<select id="user-encoding" class="form-select"><option value="utf8" ${encode==='utf8'?'selected':''}>UTF-8</option><option value="gb18030" ${encode==='gb18030'?'selected':''}>GB18030 / GBK</option></select></label></div>
 <div class="insight-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${selectors}</div>
 ${importPreview()}
 <div class="panel" style="padding:18px 22px"><h3 class="subheading">来源证据登记 · 上传者声明（不等于真实性认证）</h3>
 <div class="info">请选择财报来源、报告口径和版本；如有正式报告 PDF，可在本地计算文件 SHA-256。仅登记链接或文件指纹，不会自动把上传表格与公告全文逐字段比对。</div>
 <div class="filter-bar" style="flex-wrap:wrap">
 <label>来源类别<select class="form-select trust-input" data-key="sourceKind">${Object.entries(window.QZTrust.META.sourceKind).map(([k,v])=>`<option value="${k}" ${provenance.sourceKind===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>报表口径<select class="form-select trust-input" data-key="basis">${Object.entries(window.QZTrust.META.basis).map(([k,v])=>`<option value="${k}" ${provenance.basis===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>适用会计准则<select class="form-select trust-input" data-key="standard">${Object.entries(window.QZTrust.META.standard).map(([k,v])=>`<option value="${k}" ${provenance.standard===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>披露版本<select class="form-select trust-input" data-key="revision">${Object.entries(window.QZTrust.META.revision).map(([k,v])=>`<option value="${k}" ${provenance.revision===k?'selected':''}>${v}</option>`).join('')}</select></label></div>
 <div class="filter-bar" style="flex-wrap:wrap"><label>来源文献名<input class="input-control trust-input" data-key="document" maxlength="200" value="${esc(provenance.document)}" placeholder="例如：某公司2024年年度报告"/></label><label>原始披露链接<input class="input-control trust-input" data-key="sourceUrl" maxlength="500" value="${esc(provenance.sourceUrl)}" placeholder="https://...（可留空）"/></label><label>报告披露日期<input class="input-control trust-input" data-key="sourceDate" type="date" value="${esc(provenance.sourceDate)}"/></label></div>
 <div class="filter-bar"><label>本地原报告 PDF（仅计算 SHA-256）<input id="trust-pdf" class="input-control" type="file" accept=".pdf,application/pdf"/></label><span class="mini-muted">${esc(provenance.evidenceName||'未添加来源文件')} ${provenance.evidenceSha?`· SHA-256：${esc(provenance.evidenceSha.slice(0,16))}…`:''}</span></div>
 <label style="display:block">版本差异 / 口径说明<input class="input-control trust-input" data-key="note" maxlength="600" value="${esc(provenance.note)}" placeholder="例如：报表为合并口径，2022年比较数按更正公告重述"/></label>
 <div class="info">当前仅接收完整年度报表。未说明来源时仍允许有限财务计算，但报告必须明确标注“来源未充分说明”。所谓“官方文件”只属用户声明，系统未自行核实。</div></div>
 <label class="user-confirm"><input type="checkbox" id="user-confirm" ${confirmedSameEntity?'checked':''}/> 我已确认三表属于同一企业、同一会计主体/合并口径与年度；并已分别核实金额单位。</label><div class="action-row"><button class="primary-btn" id="user-analyze" ${TYPES.every(t=>uploaded[t])?'':'disabled'}>确认映射、校验并生成分析 →</button><button class="ghost-btn" id="user-clear">清除上传会话</button></div>${errorText?`<div class="info-box gold">${esc(errorText)}</div>`:''}
 ${project?box(`上次分析：${esc(project.name)} · ${project.years.join('、')} · 点击“查看用户数据分析工作台”可查看。`):''}
 ${box('必需：三张表共享至少一个年度；资产=负债+权益；收入、净利润、经营现金流需有数值。上传字段与示范数据的模型权重无关，真实企业不会被赋予合成样本排名、S1/S2 状态或优化方案。')}`;
}
let companyName='用户企业';
async function parseFile(file){if(file.size>6*1024*1024)throw new Error('单个文件不能超过 6MB');if(!/\.(csv|xlsx)$/i.test(file.name))throw new Error('仅接受 .csv / .xlsx，不执行宏或程序');
 const b=await file.arrayBuffer();if(!crypto?.subtle)throw new Error('当前页面不是安全的本地 HTTP 环境，不能计算文件指纹；请通过启动体验版.bat打开');const sha=await crypto.subtle.digest('SHA-256',b).then(z=>Array.from(new Uint8Array(z)).map(x=>x.toString(16).padStart(2,'0')).join(''));
 let sheets;if(/\.xlsx$/i.test(file.name))sheets=await unzipXlsx(b);else sheets=[{name:'CSV',data:parseDelimited(new TextDecoder(encode==='gb18030'?'gb18030':'utf-8').decode(b))}];
 return {file:{name:file.name},sha,sheets};
}
function chooseSheet(type,x,index){const ix=Number(index)||0;const sheet=x.sheets[ix];const previous=(reviseMode?currentInputs?.source?.[type]?.mapping:null);const found=window.QZImport.suggestMapping(type,sheet.data.headers,previous,autoMap);uploaded[type]={...x,data:sheet.data,sheetIndex:ix,mapping:found.mapping,mappingFrom:found.reused?`复用本企业 ${found.reused} 项历史字段映射，其余自动识别`:'按当前模板自动匹配',unit:uploaded[type]?.unit||(reviseMode?currentInputs?.source?.[type]?.unit:null)||'wan'};}
async function bindEntry(){
 document.querySelector('#g1-start-period')?.addEventListener('click',()=>{startMode='period';reviseMode=false;global.QZUser.refresh()});
 document.querySelector('#g1-start-annual')?.addEventListener('click',()=>{startMode='annual';global.QZUser.refresh()});
 if(startMode==='period'&&!reviseMode){
  document.querySelector('#period-company')?.addEventListener('change',e=>{companyName=e.target.value.trim().slice(0,80)});
  window.QZPeriodUI?.bind({getBook:()=>null,getAnnual:()=>null,onCommit:(book)=>createPeriodProject(book,document.querySelector('#period-company')?.value||companyName),refresh:()=>global.QZUser.refresh()});
  bindArchiveTools();return;
 }
 document.querySelector('#user-workbook')?.addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{const p=await parseFile(f);if(p.sheets.length<3)throw new Error('工作簿不足三张可识别的宽表工作表');
  const selection={};for(const t of TYPES){const terms={bs:['资产负债','balance'],is:['利润','income'],cf:['现金流','cash']};const ix=p.sheets.findIndex(sh=>terms[t].some(q=>sh.name.toLowerCase().includes(q.toLowerCase())));if(ix<0)throw new Error('未找到'+TYPE_NAMES[t]+'对应的工作表');selection[t]=ix}
  if(new Set(Object.values(selection)).size!==3)throw new Error('三张表映射到了同一工作表，请手动分别选择');
  for(const t of TYPES)chooseSheet(t,p,selection[t]);confirmedSameEntity=false;restatementApproved=false;errorText='';global.QZUser.refresh();
 }catch(ex){errorText='Excel工作簿导入失败：'+ex.message;global.QZUser.refresh()}
 });document.querySelector('#user-company')?.addEventListener('change',e=>companyName=e.target.value.trim().slice(0,80)||'用户企业');document.querySelector('#user-encoding')?.addEventListener('change',e=>{encode=e.target.value});
 document.querySelectorAll('.user-file').forEach(el=>el.addEventListener('change',async e=>{const t=e.target.dataset.type,f=e.target.files?.[0];if(!f)return;try{errorText='';confirmedSameEntity=false;restatementApproved=false;const x=await parseFile(f);let idx=0;if(x.sheets.length>1){const terms={bs:['资产负债','balance'],is:['利润','income'],cf:['现金流','cash']};idx=Math.max(0,x.sheets.findIndex(s=>terms[t].some(z=>s.name.toLowerCase().includes(z.toLowerCase()))))}chooseSheet(t,x,idx)}catch(ex){delete uploaded[t];errorText=`${TYPE_NAMES[t]}：${ex.message}`}global.QZUser.refresh()}));
 document.querySelectorAll('.user-map').forEach(el=>el.addEventListener('change',e=>{uploaded[e.target.dataset.type].mapping[e.target.dataset.key]=e.target.value;confirmedSameEntity=false;restatementApproved=false;const box=document.querySelector('#user-confirm');if(box)box.checked=false;refreshImportPreview()}));
 document.querySelectorAll('.user-unit').forEach(el=>el.addEventListener('change',e=>{uploaded[e.target.dataset.type].unit=e.target.value;confirmedSameEntity=false;restatementApproved=false;const box=document.querySelector('#user-confirm');if(box)box.checked=false;refreshImportPreview()}));
 document.querySelectorAll('.user-sheet').forEach(el=>el.addEventListener('change',e=>{const t=e.target.dataset.type;confirmedSameEntity=false;restatementApproved=false;chooseSheet(t,uploaded[t],Number(e.target.value));global.QZUser.refresh()}));
 document.querySelectorAll('.trust-input').forEach(el=>el.addEventListener('change',e=>{
 const key=e.target.dataset.key;provenance[key]=e.target.value;confirmedSameEntity=false;const check=document.querySelector('#user-confirm');if(check)check.checked=false;
 }));
 document.querySelector('#trust-pdf')?.addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{if(file.size>15*1024*1024||file.size<8)throw Error('仅支持15MB以内的完整PDF证据文件');
   if(!/\.pdf$/i.test(file.name))throw Error('原始证据必须为PDF');const b=await file.arrayBuffer();
   if(new TextDecoder().decode(b.slice(0,8)).indexOf('%PDF-')!==0||!new TextDecoder().decode(b.slice(-2048)).includes('%%EOF'))throw Error('PDF文件头或结束标记缺失，无法识别完整文件结构');
   const digest=await crypto.subtle.digest('SHA-256',b);provenance.evidenceSha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
   provenance.evidenceName=file.name.slice(0,120);confirmedSameEntity=false;global.QZUser.refresh();
  }catch(ex){errorText='来源PDF登记失败：'+ex.message;global.QZUser.refresh()}
 });
 document.querySelector('#user-restatement')?.addEventListener('change',e=>{restatementApproved=e.target.checked});document.querySelector('#user-confirm')?.addEventListener('change',e=>{confirmedSameEntity=e.target.checked});document.querySelector('#user-analyze')?.addEventListener('click',()=>{try{if(!confirmedSameEntity)throw new Error('请先确认三表为同一企业、相同会计主体与年度口径，并核实金额单位。');companyName=document.querySelector('#user-company')?.value?.trim().slice(0,80)||companyName;const inspected=window.QZImport.inspect(uploaded,assay,reviseMode?currentInputs:null);if(inspected.errors.length)throw new Error(inspected.errors.slice(0,10).join('；')+(inspected.errors.length>10?`（另有 ${inspected.errors.length-10} 项）`:''));const tables=inspected.tables,source={};for(const t of TYPES)source[t]={label:uploaded[t].file.name+' / '+uploaded[t].sheets[uploaded[t].sheetIndex].name,sha:uploaded[t].sha,unit:uploaded[t].unit,mapping:{...uploaded[t].mapping}};const normalized=window.QZTrust.normalize(provenance);
 if(project&&!reviseMode&&!confirm('本次操作将创建全新财务项目并清空当前项目的内存历史。请先导出当前项目备份。仍要继续吗？'))return;
 let nextInputs={tables,source,sourceByYear:sourceYears(source,tables),provenanceByYear:metadataYears(normalized,tables),name:companyName,provenance:normalized};
 if(reviseMode&&currentInputs){
  if(companyName!==currentInputs.name)throw Error('追加/更正必须与当前项目的企业名称完全一致；不同企业请新建独立项目');
  if(project.years.length)for(const k of ['basis','standard'])if(currentInputs.provenance[k]!==normalized[k])throw Error('当前'+k+'口径与原项目不同；请先确认保持相同口径，不自动混合');
  const prior=currentInputs;nextInputs={tables:cloneJson(prior.tables),source:cloneJson(prior.source),sourceByYear:cloneJson(prior.sourceByYear),provenanceByYear:cloneJson(prior.provenanceByYear),name:prior.name,provenance:normalized,period_data:prior.period_data||null};
  if(inspected.plan.replacements.length&&!restatementApproved)throw Error('已有年度的财务金额将发生变化，请先在“导入预检”中逐项查看并勾选同意更正。');
  if(!inspected.plan.changed)throw Error('这三张报表的年度财务数值均与当前项目相同，已阻止重复建立修订快照；旧文件来源保留不变。');
  for(const t of TYPES){let touched=false;for(const yr of Object.keys(tables[t])){if(inspected.plan.decisions[t][yr]==='skip')continue;nextInputs.tables[t][yr]=cloneJson(tables[t][yr]);nextInputs.sourceByYear[t][yr]=cloneJson(source[t]);nextInputs.provenanceByYear[yr]=cloneJson(normalized);touched=true;}if(touched)nextInputs.source[t]=cloneJson(source[t]);}
 }
 const result=compute(nextInputs);
 if(reviseMode&&currentInputs){
  const modified=window.QZProjects.diff(currentInputs,nextInputs);
  if(!modified.changed_fields&&!modified.source_changes)throw Error('没有发现新财务字段、源文件或披露版本变化，取消生成空修订');
  if(modified.years.some(yr=>result.items[yr]?.blocked))throw Error('新增或更正年度会计等式未通过，请修正新文件后重试');
  const metric_changes=[];
  for(const yy of result.years){const old=project?.items?.[yy],now=result.items[yy];
   for(const m of now.metrics){const before=old?.metricByKey?.[m.key];if(!before||before.available!==m.available||before.value!==m.value)metric_changes.push({year:yy,key:m.key,label:m.label,old:before?.value??null,new:m.value});}
  }
  changeSummary={...modified,metric_changes};
  addRevision(nextInputs,(modified.years.join('、')||'来源')+'年财务补充/更正');
 }else{serverCurrent=null;revisions=[];activeRevision=null;reportRecords=[];selectedReportId=null;continuityMetric='net_margin';watchNotes={};watchEditingKey=null;watchStatus='';caseRecords={};caseEditingKey=null;caseStatus='';addRevision(nextInputs,'初始三表接入');changeSummary=null;}
 currentInputs=cloneJson(nextInputs);project=result;selectedYear=project.years.at(-1);reportScope='annual';focusChoice=null;errorText='';archiveStatus='';restatementApproved=false;reviseMode=false;disclosure={filename:'',sha256:'',facts:[],review:null,error:''};window.QZUser.go('user')}catch(e){errorText=e.message;global.QZUser.refresh()}});
 document.querySelector('#user-examples')?.addEventListener('click',()=>{for(const t of TYPES){const fields=FIELD_SPECS[t].map(([k,label])=>label==='财政年度'?'年份':label);download(`${TYPE_NAMES[t]}_填写模板.csv`,csv([fields,[2021,...fields.slice(1).map(()=>'' )],[2022,...fields.slice(1).map(()=>'' )]]),'text/csv;charset=utf-8')}});
 document.querySelector('#user-clear')?.addEventListener('click',()=>{if(!project||confirm('清除当前会话的企业财务项目与所有内存修订？请先导出项目包。'))clear()});bindArchiveTools();
}
function clear(){serverCurrent=null;deliveryParts={findings:true,metrics:true,trends:true,cases:true,sources:true};deliveryStatus='';reportRecords=[];selectedReportId=null;continuityMetric='net_margin';watchNotes={};watchEditingKey=null;watchStatus='';caseRecords={};caseEditingKey=null;caseStatus='';currentInputs=null;revisions=[];activeRevision=null;reviseMode=false;startMode='annual';reportScope='annual';changeSummary=null;archiveStatus='';disclosure={filename:'',sha256:'',facts:[],review:null,error:''};uploaded={};project=null;selectedYear=null;focusChoice=null;confirmedSameEntity=false;restatementApproved=false;errorText='';phase='upload';provenance={sourceKind:'unknown',basis:'unknown',standard:'unknown',revision:'unknown',document:'',sourceUrl:'',sourceDate:'',note:'',evidenceName:'',evidenceSha:''};global.QZUser.refresh()}
function bindUser(){
 function selectEvidence(kind,key){
  const P=project,y=selectedYear;if(!P)return;
  const a=window.QZInsights.analyze(P,y,disclosure);
  if(a.gate.blocked)return;
  focusChoice={kind,key};
  const detail=document.getElementById('insight-detail-body');if(detail)detail.innerHTML=insightDetailHtml(P,y,focusChoice);
  document.querySelectorAll('.insight-issue').forEach(b=>b.classList.toggle('selected',kind==='issue'&&b.dataset.issue===key));
  const picker=document.getElementById('insight-metric');if(picker)picker.value=kind==='metric'?key:'';
  detail?.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 document.querySelectorAll('[data-issue]').forEach(b=>b.addEventListener('click',()=>selectEvidence('issue',b.dataset.issue)));
 document.getElementById('insight-metric')?.addEventListener('change',e=>{if(e.target.value)selectEvidence('metric',e.target.value)});
 document.querySelectorAll('.insight-metric-link').forEach(b=>b.addEventListener('click',()=>selectEvidence('metric',b.dataset.metric)));
 // Delegation is needed because detail HTML is replaced in place on clicks.
 document.getElementById('insight-detail-body')?.addEventListener('click',e=>{
  const jump=e.target.closest('.insight-jump');if(jump){const target=document.getElementById(jump.dataset.target);target?.scrollIntoView({block:'start',behavior:'smooth'});return}
  const b=e.target.closest('.insight-download');if(b&&project)downloadInsightEvidence(project,selectedYear,b.dataset.format);
 });
 window.QZPdfAuto.bind(project,(facts,pdfSha,filename)=>{
  const raw=window.QZDisclosure.toCsv([['year','statement','field','value','unit','page','period_end','basis','source_pdf_sha256','currency','note'],...facts.map(f=>[f.year,f.statement,f.field,f.valueRaw,f.unit,f.page,f.period_end,f.basis,f.source_pdf_sha256,f.currency,f.note])]);
  disclosure={filename:'PDF人工核对_'+filename,sha256:pdfSha,facts,review:window.QZDisclosure.reconcile(project,facts),method:'pdf_text_review',error:''};
  global.QZUser.refresh();
 },()=>global.QZUser.refresh());
 document.querySelector('#user-ledger-file')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;
  try{if(f.size<20||f.size>1024*1024||!f.name.toLowerCase().endsWith('.csv'))throw Error('台账应为1MB以内的 UTF-8 CSV');
   const bytes=await f.arrayBuffer(),rows=global.QZDisclosure.splitCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   const hash=await crypto.subtle.digest('SHA-256',bytes),sha=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
   disclosure={filename:f.name,sha256:sha,facts:rows,review:global.QZDisclosure.reconcile(project,rows),method:'manual_csv',error:''};
  }catch(ex){disclosure={filename:'',sha256:'',facts:[],review:null,error:'核对表未导入：'+ex.message}}global.QZUser.refresh();
 });
 document.querySelector('#user-ledger-template')?.addEventListener('click',()=>download('企财智策_披露数值核对台账_模板.csv',global.QZDisclosure.blankTemplate(),'text/csv;charset=utf-8'));
 document.querySelector('#user-ledger-clear')?.addEventListener('click',()=>{disclosure={filename:'',sha256:'',facts:[],review:null,error:''};global.QZUser.refresh()});
 document.querySelector('#user-ledger-export-json')?.addEventListener('click',()=>{if(disclosure.review)download('企财智策_原文摘录数字对账.json',JSON.stringify({...disclosure.review,ledger_file_sha256:disclosure.sha256},null,2),'application/json;charset=utf-8')});
 document.querySelector('#user-ledger-export-csv')?.addEventListener('click',()=>{if(disclosure.review){const h=['年度','报表','字段','原文页码','原文数值','原文单位','披露金额_万元','上传金额_万元','差额_万元','舍入容差_万元','状态','说明','PDF_SHA256'];const rows=disclosure.review.rows.map(q=>[q.year,q.statement,q.field,q.page,q.valueRaw,q.unit,q.normalizedWan,q.uploadedWan,q.deltaWan,q.toleranceWan,q.status,q.reason,q.source_pdf_sha256]);download('企财智策_原文摘录数字对账.csv',csv([h,...rows]),'text/csv;charset=utf-8')}});
 document.getElementById('project-jump')?.addEventListener('click',()=>document.getElementById('project-manager')?.scrollIntoView({block:'start',behavior:'smooth'}));
 document.querySelector('#user-year')?.addEventListener('change',e=>{selectedYear=Number(e.target.value);focusChoice=null;global.QZUser.refresh()});document.querySelector('#user-clear')?.addEventListener('click',()=>{if(confirm('清空本次上传的三表数据与分析结果？'))clear()});
 document.querySelector('#user-export-trust')?.addEventListener('click',()=>{
 if(!project)return;download(`企财智策_${project.name}_来源与数值审计.json`,JSON.stringify({project:project.name,governance:project.governance,created_by:'qicaizhice-v1.4-local',authenticity_verified:false,disclosure_reconciliation:disclosure.review,review_method:disclosure.method||'none'},null,2),'application/json;charset=utf-8');
 });
 document.querySelector('#user-export-lineage')?.addEventListener('click',()=>{
 if(!project)return;const r=[['年度','报表','计算字段','原始列名','原始数值','标准化万元','源文件/工作表','源文件SHA256','单位键']];
 for(const y of project.years)for(const f of project.governance.years[y].lineage)r.push([y,f.statement,f.field,f.source_column,f.source_raw,f.normalized_value_wan,f.source_file,f.source_sha256,f.unit]);
 download(`企财智策_${project.name}_逐字段来源.csv`,csv(r),'text/csv;charset=utf-8');
 });
 document.querySelector('#user-export-json')?.addEventListener('click',()=>{if(!project)return;const data={schema:'qicai-user-analytics-1.4',governance:project.governance,name:project.name,years:project.years,source:project.source,disclosure_reconciliation:disclosure.review,review_method:disclosure.method||'none',results:Object.fromEntries(project.years.map(y=>[y,{checks:project.items[y].checks,metrics:project.items[y].metrics,rules:project.items[y].rules,blocked:project.items[y].blocked}]))};download(`企财智策_${project.name}_计算证据.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8')});
 document.querySelector('#user-export-csv')?.addEventListener('click',()=>{if(!project)return;const rows=[['年度','指标','值','单位','公式','有效','阻断原因','披露摘录数字对照状态']];for(const yr of project.years){const r=project.items[yr];for(const m of r.metrics)rows.push([yr,m.label,m.available?m.value:'',m.unit,m.formula,m.available?'是':'否',r.blocked?'会计不平':m.note,disclosure.review?.byYear?.[yr]?.difference?'存在原文数值差异·禁止对外研究结论':(disclosure.review?.byYear?.[yr]?.matched?'部分/全部来源数字相符·非真实性认证':'未提供原文数字对照')])}download(`企财智策_${project.name}_指标审计.csv`,csv(rows),'text/csv;charset=utf-8')});
 document.querySelector('#user-export-html')?.addEventListener('click',()=>{if(!project)return;const y=selectedYear&&project.items[selectedYear]?selectedYear:project.years.at(-1),r=project.items[y];const body=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>企财智策 · 用户财务诊断 ${esc(project.name)}</title><style>body{max-width:1020px;margin:45px auto;padding:15px 30px;font:15px/1.75 'Microsoft YaHei',Arial,sans-serif;color:#253443}h1{font-size:27px}h2{border-bottom:1px solid #9cbbc9;padding-bottom:8px;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:7px;border:1px solid #d1dce3;text-align:left}th{background:#eaf0f4}.warn{background:#fff0d8;padding:14px}@media print{button{display:none}}</style><h1>企财智策 · 用户财务诊断</h1><p>${esc(project.name)} · ${y} 年 · 财务金额统一为万元 · 文件在本地浏览器解析</p><p class="warn">${r.blocked?'会计校验未通过，本年度禁止形成财务判断。':'数值勾稽核查不构成财报真实或审计认证。'} 未使用合成样本的排名、模型评分、聚类或优化结果。</p><h2>三表数值检查</h2>${plainTable(['检查','状态','差额 / 万元'],r.checks.map(x=>[x.label,x.status,nfmt(x.delta,4)]))}<h2>财务指标</h2><p>${disclosure.review?.byYear?.[y]?.difference?'【警告】原文摘录数字存在差异，以下数值仅供排错；暂停正式风险结论和对外使用。':'数据仍未获得官方来源自动认证；仅在已声明范围内使用。'}</p>${plainTable(['指标','数值','公式'],r.metrics.map(x=>[x.label,x.available?nfmt(x.value,2)+' '+x.unit:'无法计算',x.formula]))}<h2>风险观察</h2>${disclosure.review?.byYear?.[y]?.difference?'<p>原文数字差异待核对：本期风险解释已停止。</p>':plainTable(['项目','阈值','结果'],r.rules.map(x=>[x.label,x.criterion,x.hit===null?'无法判断':x.hit?'触发':'未触发']))}<h2>来源指纹与映射</h2>${plainTable(['报表','文件/工作表','SHA-256'],TYPES.map(t=>[TYPE_NAMES[t],(project.sourceByYear[t]?.[y]||project.source[t]).label,(project.sourceByYear[t]?.[y]||project.source[t]).sha]))}<h2>来源声明与审计边界</h2><p>${esc(project.governance.sourceStatusText)}；来源：${esc((project.provenanceByYear[y]||project.provenance).document||'未登记')}；披露日期：${esc((project.provenanceByYear[y]||project.provenance).sourceDate||'未提供')}；版本：${esc(window.QZTrust.lab('revision',(project.provenanceByYear[y]||project.provenance).revision))}；披露网址：${esc((project.provenanceByYear[y]||project.provenance).sourceUrl||'未登记')}；本地PDF SHA-256：${esc((project.provenanceByYear[y]||project.provenance).evidenceSha||'未提供')}；合并口径：${esc(window.QZTrust.lab('basis',(project.provenanceByYear[y]||project.provenance).basis))}；准则：${esc(window.QZTrust.lab('standard',(project.provenanceByYear[y]||project.provenance).standard))}；数值状态：${esc(r.quality.dataStatusText)}。</p><p>跨年度现金连续性和缺失项复核仍需结合报告附注与原文人工核对。数值通过不等于外部披露真实性已获认证。</p><h2>独立披露数值摘录对照（若已导入）</h2>${disclosure.review?plainTable(['字段','PDF页码','上传万元','对照万元','状态'],disclosure.review.rows.filter(q=>q.year===y).map(q=>[q.statement+'.'+q.field,q.page,nfmt(q.uploadedWan,4),nfmt(q.normalizedWan,4),q.status])):'<p>未提交独立核对台账；真实性未核实。</p>'}<p>本次核对方式：${disclosure.method==='pdf_text_review'?'PDF本地文本提取候选并经用户逐项目视核对':'用户提交的独立人工数字台账'}。PDF指纹仅证明同一文件，不能证明来自官方；提取的数值不代表经过第三方财务审计。如存在原文差异，应暂停对外使用相关研究结论。</p><h2>本年度原始取数字段</h2>${plainTable(['报表','计算字段','原始列','原始数值','标准化金额（万元）','原文件 SHA-256'],project.governance.years[y].lineage.map(f=>[f.statement,f.field,f.source_column||'未映射',f.source_raw??'—',f.normalized_value_wan===null?'—':nfmt(f.normalized_value_wan,4),f.source_sha256||'—']))}<h2>人工问题核验与跟进</h2><p>以下为本地使用者自行填写的证据位置与处理计划，不是第三方审计或已解决证明。若财报内容有修订，需复核旧记录。</p>${plainTable(['年度/规则','人工判断','证据定位','处理计划','记录与财报版本状态'],window.QZCases.report(project,disclosure,caseRecords).filter(z=>z.year===y).map(z=>[z.year+' / '+z.rule,z.assessment_label,z.evidence,z.action,z.freshness_label]))}<h2>适用范围</h2><p>所有结果只描述用户上传的数据，尚未经审计或第三方真实性验证。仅是明确公式下的财务分析，不是行业排名、信用评级、投资建议或未来经营预测。CSV/XLSX 字段映射与单位由上传者确认；请核对源文件后使用。</p><button onclick="print()">打印 / 保存为PDF</button></html>`;download(`企财智策_${project.name}_${y}_用户财务报告.html`,body,'text/html;charset=utf-8')});
 bindContinuity();
 window.QZPeriodUI?.bind({getBook:()=>currentInputs?.period_data||null,getAnnual:()=>currentInputs,onCommit:attachPeriodBook,refresh:()=>global.QZUser.refresh()});
 bindArchiveTools();
 bindDelivery();
}
function plainTable(headers,rows){return '<table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function attachPeriodBook(book,reason){
 if(!currentInputs||!project)throw Error('请先创建企业项目或直接上传月度/季度三表');
 const clean=book===null?null:window.QZPeriods.validateBook(book);
 if(!clean&&!project.years.length)throw Error('这是只有期间数据的企业项目，不能清空唯一财务账簿；如需重建请新建项目或恢复历史快照。');
 if(revisions.length>=25)throw Error('已经有25个快照，请先导出并归档；期间数据没有写入');
 const old=cloneJson(currentInputs),inputs=cloneJson(currentInputs);inputs.period_data=clean===null?null:cloneJson(clean);
 // The annual engine is deliberately unchanged. Every interim revision receives
 // a complete immutable snapshot, allowing rollback and SQLite-backed export.
 addRevision(inputs,reason);currentInputs=inputs;project=compute(currentInputs);
 changeSummary={years:[],changed_fields:0,source_changes:0,metric_changes:[],period_changed:true};
 archiveStatus='期间数据已生成新财务快照。请主动保存到本机 SQLite 项目库；已有年度分析口径不变。';
 return {previous:old,revision:activeRevision};
}
const api={entry,render:view,bindEntry,bindUser,attachPeriodBook,getPeriodBook:()=>currentInputs?.period_data||null,refresh:()=>{if(typeof global.render==='function')global.render()},go:(r)=>{if(typeof global.nav==='function'){global.nav(r);if(r==='user'&&typeof global.scrollTo==='function')global.scrollTo(0,0)}},hasProject:()=>!!project,getProject:()=>project,getInsights:()=>project?window.QZInsights.analyze(project,selectedYear,disclosure):null,getAnalysisContext:()=>project?{mode:'user_upload',entity:project.name,year:selectedYear,snapshot_id:activeRevision,focus:cloneJson(focusChoice),gate:window.QZInsights.gate(project,selectedYear,disclosure),synthetic_score:false,synthetic_optimization:false}:null,_test:{parseDelimited,sNum,norm,autoMap,assay,compute,unzipXlsx,FIELD_SPECS,importPreview,createPeriodProject,makeReportDocument,getCurrentInputs:()=>currentInputs,getRevisions:()=>revisions,getReportScope:()=>reportScope}};
global.QZUser=api;
})(window);
