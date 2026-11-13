/* Qicaizhice v1.4: auditable source declaration and numerical review. No claim of external verification. */
(function(global){'use strict';
 const META={
  sourceKind:{public:'公开财务披露（上传者声明）',internal:'企业内部财务资料（上传者声明）',thirdparty:'第三方整理（上传者声明）',training:'教学/合成示例',unknown:'来源未说明'},
  basis:{consolidated:'合并财务报表',individual:'单体财务报表',unknown:'合并/单体口径未说明'},
  standard:{cas:'中国企业会计准则（上传者声明）',ifrs:'国际财务报告准则（上传者声明）',usgaap:'美国公认会计准则（上传者声明）',other:'其他会计规范',unknown:'会计准则未说明'},
  revision:{as_filed:'原始披露版本（上传者声明）',restated:'重述/调整版（上传者声明）',unknown:'版本属性未说明'}
 };
 function normalize(meta={}){
  const m={...meta};for(const [field,opts] of Object.entries(META))if(!Object.hasOwn(opts,m[field]))m[field]='unknown';
  m.document=String(m.document||'').trim().slice(0,200);
  m.sourceUrl=String(m.sourceUrl||'').trim().slice(0,500);
  m.sourceDate=String(m.sourceDate||'').trim().slice(0,12);
  m.note=String(m.note||'').trim().slice(0,600);
  m.evidenceName=String(m.evidenceName||'').trim().slice(0,120);
  m.evidenceSha=String(m.evidenceSha||'').match(/^[0-9a-f]{64}$/i)?.[0]||'';
  if(m.sourceUrl){try{const u=new URL(m.sourceUrl);if(!['https:','http:'].includes(u.protocol))m.sourceUrl='';}catch{m.sourceUrl=''}}
  if(m.sourceDate&&!/^\d{4}-\d{2}-\d{2}$/.test(m.sourceDate))m.sourceDate='';
  return m;
 }
 const lab=(type,key)=>META[type]?.[key]||'未知';
 function compare(a,b){if(!Number.isFinite(a)||!Number.isFinite(b))return {status:'NOT_TESTED',residual:null,tolerance:null};
  const residual=a-b,tolerance=Math.max(.05,Math.max(Math.abs(a),Math.abs(b))*.0001);
  return {status:Math.abs(residual)<=tolerance?'PASS':'REVIEW',residual,tolerance};
 }
 function inspect({tables,items,years,source,sourceByYear,metadata}){
  const meta=normalize(metadata),declared=!!(meta.document||meta.sourceUrl||meta.evidenceSha);
  const sourceStatus=meta.sourceKind==='training'?'SYNTHETIC':declared?'DECLARED_UNVERIFIED':'UNDOCUMENTED';
  const output={schema:'qicaizhice-trust-1.4',sourceStatus,sourceStatusText:sourceStatus==='SYNTHETIC'?'教学/合成数据（不得当作真实披露）':sourceStatus==='DECLARED_UNVERIFIED'?'已登记来源线索 · 尚未经独立核实':'来源未充分说明 · 尚未经核实',
    authenticityVerified:false,externalCrosscheck:'NOT_PERFORMED',metadata:meta,
    sources:Object.fromEntries(Object.entries(source||{}).map(([key,s])=>[key,{name:s.label,sha256:s.sha,unit:s.unit,mapping:s.mapping}])),
    years:{},limits:['未自动核对官方公告原文、审计意见、修订版本或报表附注','没有外部事实认证；数值勾稽不能证明数据真实','真实上传数据不会进入合成行业排名、聚类、预测和优化引擎']};
  const ylist=(years||[]).slice().sort((a,b)=>a-b);
  for(const y of ylist){const item=items[y],warn=[],cross=[],F=tables.cf[y]?.fields||{},B=tables.bs[y]?.fields||{},I=tables.is[y]?.fields||{};
   const hasTestedCash=item.checks.some(c=>['cash','cash_change','cash_balance'].includes(c.code)&&c.status==='pass');
   const hasCoreCash=item.checks.some(c=>c.code==='cash'&&c.status==='pass');
   const tested=item.checks.filter(c=>c.status!=='not_tested');
   const failed=item.checks.filter(c=>c.status==='fail');
   if(!hasCoreCash)warn.push('经营/投资/筹资/汇率等现金流组成项未能完整勾稽，不能宣称现金流量表已完整验证');
   if(!Number.isFinite(F.opening_cash)||!Number.isFinite(F.ending_cash))warn.push('缺少期初或期末现金及等价物余额，现金流连续性检查受限');
   if(Number.isFinite(B.current_assets)&&Number.isFinite(B.total_assets)&&B.current_assets>B.total_assets+Math.max(.05,Math.abs(B.total_assets)*.0001))warn.push('流动资产大于资产总计，需确认列报范围、单位和重述口径');
   if(Number.isFinite(B.current_liabilities)&&Number.isFinite(B.total_liabilities)&&B.current_liabilities>B.total_liabilities+Math.max(.05,Math.abs(B.total_liabilities)*.0001))warn.push('流动负债大于负债总计，需确认分类与字段映射');
   if(Number.isFinite(I.revenue)&&I.revenue<=0)warn.push('营业收入非正，常规比率与增长率可能不适用');
   const prev=tables.cf[y-1]?.fields;
   if(prev){const c=compare(F.opening_cash,prev.ending_cash);
    cross.push({code:'cash_rollforward',label:`${y-1}年末现金及等价物 = ${y}年初余额`,...c,
       explanation:c.status==='REVIEW'?'可能是会计重述、期初调整或期间口径不一致；必须回查原报告，不能自动修正':c.status==='NOT_TESTED'?'缺少期初/期末字段':''});
    if(c.status==='REVIEW')warn.push('跨年度现金滚动不一致，需核查重述或报表期间');
   }
   const dataStatus=failed.length||item.blocked?'BLOCKED':(warn.length||item.checks.some(c=>c.status==='not_tested'))?'PARTIAL':'CHECKED';
   const lineage=[];for(const [type,rec] of Object.entries({bs:tables.bs[y],is:tables.is[y],cf:tables.cf[y]})){
    if(!rec)continue;for(const [field,value] of Object.entries(rec.fields||{})){
     const o=rec.origin?.[field]||null;
     lineage.push({year:y,statement:type,field,normalized_value_wan:Number.isFinite(value)?value:null,
       source_column:o?.header||null,source_raw:o?.raw??null,source_file:(sourceByYear?.[type]?.[y]||source[type])?.label||null,
       source_sha256:(sourceByYear?.[type]?.[y]||source[type])?.sha||null,unit:(sourceByYear?.[type]?.[y]||source[type])?.unit||null});
    }
   }
   output.years[y]={dataStatus,dataStatusText:{BLOCKED:'数值不一致：停止本年度分析',PARTIAL:'部分数值可核对：仍有待核项',CHECKED:'指定会计关系数值已通过'}[dataStatus],testedCount:tested.length,notTested:item.checks.filter(c=>c.status==='not_tested').length,warnings:warn,crossYear:cross,lineage};
  }
  return output;
 }
 global.QZTrust={normalize,inspect,compare,lab,META};
})(window);
