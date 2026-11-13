/* Qicaizhice v1.5: independent, LOCAL manual disclosure-ledger reconciliation.
 * A page number or PDF digest is evidence for a CHECK, never proof that a disclosure is official.
 * This module does not fetch the web, parse PDFs, certify filings, or write user data to disk.
 */
(function(global){'use strict';
const UNITS={yuan:0.0001,wan:1,yi:10000};
const BAS={consolidated:'合并报表',individual:'单体报表'};
const TYPES={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
const SHA=/^[a-f0-9]{64}$/i;
const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const KEYFIELDS=[['bs','total_assets'],['bs','total_liabilities'],['bs','total_equity'],['is','revenue'],['is','net_income'],['cf','operating_cf']];
const VALID={
 bs:['total_assets','total_liabilities','total_equity','current_assets','current_liabilities','accounts_receivable','inventory','cash'],
 is:['revenue','net_income','cogs','gross_profit','selling_expense','admin_expense','rd_expense','interest_expense'],
 cf:['operating_cf','investing_cf','financing_cf','fx_effect','opening_cash','ending_cash','net_change_cash']};
function cleanNumber(value){const raw=String(value??'').trim().replace(/[，,\s]/g,'');if(!raw||!NUMBER.test(raw))return null;const v=Number(raw);return Number.isFinite(v)?v:null}
function csvRow(row){return row.map(cell=>{let s=String(cell??'');if(/^[\s]*[=+@]/.test(s)||(/^\s*-/.test(s)&&!NUMBER.test(s.trim())))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(',')}
function toCsv(rows){return '\ufeff'+rows.map(csvRow).join('\r\n')}
function splitCsv(text){ // RFC4180-shaped; BOM, commas and quoted newlines supported
 text=String(text||'').replace(/^\ufeff/,'');let rows=[],row=[],v='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){v+='"';i++}else if(c==='"')q=false;else v+=c;continue}
 if(c==='"'&&v===''){q=true;continue}if(c===','){row.push(v);v='';continue}
 if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))rows.push(row);row=[];v='';continue}v+=c;}
 if(q)throw Error('CSV 引号未闭合');row.push(v);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2||rows.length>2001)throw Error('证据台账必须包含表头和1—2000条记录');
 const header=rows.shift().map(x=>x.trim().replace(/^\ufeff/,''));if(new Set(header).size!==header.length)throw Error('CSV表头重复');
 const required=['year','statement','field','value','unit','page','period_end','basis','source_pdf_sha256'];for(const k of required)if(!header.includes(k))throw Error('核对台账缺少必填列 '+k);
 const out=[];for(const [j,r] of rows.entries()){
  if(r.length!==header.length)throw Error(`CSV 第${j+2}行列数不一致`);
  const o=Object.fromEntries(header.map((k,i)=>[k,String(r[i]??'').trim()]));
  const year=Number(o.year),number=cleanNumber(o.value),page=Number(o.page);
  if(!Number.isInteger(year)||year<1990||year>2100)throw Error(`第${j+2}行年度无效`);
  if(!Object.hasOwn(VALID,o.statement)||!VALID[o.statement].includes(o.field))throw Error(`第${j+2}行不支持的报表或字段 ${o.statement}.${o.field}`);
  if(number===null)throw Error(`第${j+2}行金额无效`);
  if(!Object.hasOwn(UNITS,o.unit))throw Error(`第${j+2}行单位必须是 yuan/wan/yi`);
  if(!Number.isInteger(page)||page<1||page>100000)throw Error(`第${j+2}行来源页码无效`);
  const parts=o.period_end.match(/^(\d{4})-(\d{2})-(\d{2})$/);const date=parts?new Date(Date.UTC(+parts[1],+parts[2]-1,+parts[3])):null;
  if(!parts||date.getUTCFullYear()!==+parts[1]||date.getUTCMonth()+1!==+parts[2]||date.getUTCDate()!==+parts[3])throw Error(`第${j+2}行期间结束日期无效`);
  if(!Object.hasOwn(BAS,o.basis))throw Error(`第${j+2}行合并口径必须为 consolidated/individual`);
  if(!SHA.test(o.source_pdf_sha256))throw Error(`第${j+2}行未提供合法的PDF SHA-256`);
  // Actual financial statements are in CNY. Cross-currency comparisons are prohibited.
  if(o.currency&&o.currency.toUpperCase()!=='CNY')throw Error(`第${j+2}行货币不是 CNY，不能与人民币万元报表比较`);
  const decimals=(o.value.replace(/[，,\s]/g,'').split(/[Ee]/)[0].split('.')[1]||'').length;
  const fact={...o,year,page,valueRaw:o.value,value:number,normalizedWan:number*UNITS[o.unit],
    toleranceWan:Math.max(0.000001,0.5*10**(-Math.min(decimals,12))*UNITS[o.unit]+1e-10),
    source_pdf_sha256:o.source_pdf_sha256.toLowerCase(),line:j+2};
  out.push(fact);
 }
 return out;
}
function reconcile(project,facts){
 if(!project||!Array.isArray(project.years))throw Error('请先完成三表分析');
 if(!Array.isArray(facts))throw Error('证据台账格式错误');
 const meta=project.provenance||{},samePdf=SHA.test(meta.evidenceSha||'');
 const freq=new Map();for(const f of facts){const k=`${f.year}|${f.statement}|${f.field}`;freq.set(k,(freq.get(k)||0)+1)}
 const rows=facts.map(f=>{
  const key=`${f.year}|${f.statement}|${f.field}`, item=project.items[f.year];
  const v=item?.fields?.[f.statement]?.[f.field];const n=Number.isFinite(v)?v:null;
  let status,reason;
  if(freq.get(key)>1){status='DUPLICATE';reason='同一年度、报表、字段存在重复证据，不能自动选择'}
  else if(!item){status='YEAR_MISSING';reason='上传三表没有该共同年度'}
  else if(item.blocked){status='DATA_BLOCKED';reason='原上传报表会计校验未通过，禁止将其判作已核对'}
  else if(!samePdf){status='PDF_NOT_ATTACHED';reason='未在01登记原报告PDF指纹'}
  else if(f.source_pdf_sha256!==meta.evidenceSha.toLowerCase()){status='PDF_HASH_MISMATCH';reason='台账对应的PDF指纹与上传PDF不同'}
  else if(!['consolidated','individual'].includes(meta.basis)){status='BASIS_UNKNOWN';reason='01报表合并/单体口径尚未确认'}
  else if(f.basis!==meta.basis){status='BASIS_MISMATCH';reason='独立核对台账与三表合并口径不一致'}
  else if(f.period_end!==`${f.year}-12-31`){status='PERIOD_UNSUPPORTED';reason='当前年度宽表只支持12月31日年末的原文对比'}
  else if(n===null){status='UPLOAD_FIELD_MISSING';reason='用户上传的同年度字段缺失，不能将缺失当0'}
  else if(Math.abs(n-f.normalizedWan)>f.toleranceWan){status='DIFFERENCE';reason='超出按来源数字精度计算的舍入容差'}
  else {status=meta.sourceKind==='training'?'TRAINING_MATCH':'MATCH';reason=meta.sourceKind==='training'?'教学样例数字相符，不证明任何真实企业披露':'本地上传数值与用户提交的原文摘录在限定精度内相符；尚未认证官方原文'}
  return {...f,uploadedWan:n,deltaWan:n===null?null:n-f.normalizedWan,status,reason};
 });
 const count=status=>rows.filter(x=>x.status===status).length;
 const byYear={};for(const year of project.years){const r=rows.filter(x=>x.year===year);
  const matched=new Set(r.filter(x=>['MATCH','TRAINING_MATCH'].includes(x.status)).map(x=>`${x.statement}.${x.field}`));
  const missing=KEYFIELDS.filter(([t,k])=>!matched.has(`${t}.${k}`)).map(([t,k])=>`${t}.${k}`);
  byYear[year]={matched:r.filter(x=>['MATCH','TRAINING_MATCH'].includes(x.status)).length,difference:r.filter(x=>x.status==='DIFFERENCE').length,issues:r.filter(x=>!['MATCH','TRAINING_MATCH'].includes(x.status)).length,
    requiredKeyMatched:KEYFIELDS.length-missing.length,requiredKeyTotal:KEYFIELDS.length,missingKeyFields:missing};}
 return {schema:'qicai-disclosure-reconcile-1.5',authenticityVerified:false,automaticOfficialVerification:false,
   pdfFingerprintLinked:samePdf,scope:'本地用户提供的原文数字摘录与用户上传财报逐字段对照，不执行PDF数值自动抽取或联网权威来源验证',
   source:{document:meta.document||'',sourceUrl:meta.sourceUrl||'',pdfSha256:meta.evidenceSha||'',basis:meta.basis||'unknown',sourceKind:meta.sourceKind||'unknown'},
   counts:{total:rows.length,match:count('MATCH')+count('TRAINING_MATCH'),difference:count('DIFFERENCE'),unresolved:rows.filter(x=>!['MATCH','TRAINING_MATCH','DIFFERENCE'].includes(x.status)).length},
   byYear,rows};
}
function blankTemplate(){const head=['year','statement','field','value','unit','page','period_end','basis','source_pdf_sha256','currency','note'];
 return toCsv([head,['2022','bs','total_assets','','wan','','2022-12-31','consolidated','','CNY','请从PDF原文人工摘录，并写入原PDF的SHA-256']]);}
const api={splitCsv,reconcile,toCsv,blankTemplate,KEYFIELDS,VALID,UNITS};
global.QZDisclosure=api;
})(window);
