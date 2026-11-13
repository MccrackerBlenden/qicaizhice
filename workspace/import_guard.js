/* 企财智策 v3.0-B：仅在浏览器内进行年度、映射和更正预检，不保存原始文件。 */
(function(global){
'use strict';
const TYPES=['bs','is','cf'];
const NAMES={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
const clean=x=>String(x??'').trim().toLowerCase().replace(/[\s_()（）\-—\[\]【】.\/：:]/g,'');
function suggestMapping(type,headers,previous,autofn){
 const mapping=autofn(type,headers),used=new Set(),prior=previous||{};let reused=0;
 for(const [key,value] of Object.entries(prior)){
  if(!value)continue;const candidate=headers.find(h=>clean(h)===clean(value));
  if(candidate&&!used.has(candidate)){mapping[key]=candidate;used.add(candidate);reused++}
 }
 // Existing mapping values are never reused for a second target field.
 for(const [key,col] of Object.entries(mapping))if(col){if(used.has(col)&&clean(prior[key])!==clean(col))mapping[key]='';else used.add(col)}
 return {mapping,reused};
}
function sameValue(a,b){return a===b||(a==null&&b==null)}
function fieldChanges(oldRow,newRow){
 const old=oldRow?.fields||{},now=newRow?.fields||{};
 return [...new Set([...Object.keys(old),...Object.keys(now)])].filter(k=>!sameValue(old[k],now[k]))
   .map(k=>({key:k,before:old[k]??null,after:now[k]??null}));
}
function plan(tables,previous){
 const decisions={},errors=[],replacements=[],duplicate=[],added=[];
 for(const t of TYPES){if(!tables[t]||typeof tables[t]!=='object')errors.push(`缺少${NAMES[t]}的有效数据`)}
 if(errors.length)return {errors,decisions,replacements,duplicate,added,changed:false};
 const years=Object.fromEntries(TYPES.map(t=>[t,Object.keys(tables[t]).map(Number).sort((a,b)=>a-b)]));
 const union=[...new Set(TYPES.flatMap(t=>years[t]))].sort((a,b)=>a-b);
 if(!union.length)errors.push('三张报表没有有效年度和金额行');
 for(const y of union){const missing=TYPES.filter(t=>!tables[t][y]);if(missing.length)errors.push(`${y}年缺少${missing.map(t=>NAMES[t]).join('、')}，不允许静默忽略该年度`)}
 for(const t of TYPES){decisions[t]={};for(const [year,newRow] of Object.entries(tables[t])){
  const oldRow=previous?.tables?.[t]?.[year];
  if(!oldRow){decisions[t][year]='add';added.push({type:t,year:Number(year)});continue}
  const changes=fieldChanges(oldRow,newRow);
  if(!changes.length){decisions[t][year]='skip';duplicate.push({type:t,year:Number(year)});continue}
  decisions[t][year]='replace';replacements.push({type:t,year:Number(year),changes});
 }}
 return {errors,decisions,replacements,duplicate,added,changed:!!(replacements.length||added.length),years:union};
}
function inspect(uploaded,assay,previous){
 const tables={},errors=[],identities=[],details={};
 for(const t of TYPES){const u=uploaded[t];if(!u){errors.push(`${NAMES[t]}：请选择报表`);continue}
  const check=assay(t,u,u.mapping,u.unit);tables[t]=check.out;errors.push(...check.errors);if(check.identity)identities.push(check.identity);
  details[t]={rows:u.data.rows.length,headers:u.data.headers.length,years:Object.keys(check.out).map(Number).sort((a,b)=>a-b),sample:u.data.rows.slice(0,3),file:u.file.name,mapping:{...u.mapping}};
 }
 if(new Set(identities).size>1)errors.push('三表中的公司名称或代码不一致，请核对是否混用了不同企业的资料');
 const result=errors.length?null:plan(tables,previous);if(result)errors.push(...result.errors);
 return {tables,errors,details,plan:result,ready:!errors.length};
}
global.QZImport={version:'v3.0-B',suggestMapping,plan,inspect,fieldChanges};
})(window);
