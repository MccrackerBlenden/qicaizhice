/* Qicaizhice v1.6: in-memory PDF candidates, explicit human confirmation.
 * Never claims an official source is authenticated, even when candidate numbers match.
 */
(function(global){'use strict';
let state={busy:false,error:'',result:null,accepted:new Set(),filename:'',sourceUrl:''};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lbl={bs:'资产负债表',is:'利润表',cf:'现金流量表'};
function render(project){
 const n=state.result?.candidates?.length||0, res=state.result;
 const counts=res?.pages?.map(p=>`第 ${p.page} 页：${p.candidates} 个候选 ${p.message?'· '+html(p.message):''}`).join('；')||'';
 const expected=project?.provenance?.evidenceSha||'';
 const shaOK=!!res&&!!expected&&res.pdf_sha256===expected;
 const rows=(res?.candidates||[]).map((c,i)=>{
  const key=c.year+'|'+c.statement+'|'+c.field;
  const coll=res.candidates.filter(x=>x.year+'|'+x.statement+'|'+x.field===key).length;
  return `<tr><td><input data-pdf-check="${i}" type="checkbox" ${state.accepted.has(i)?'checked':''} ${shaOK?'':'disabled'}></td><td>${c.year} · ${html(lbl[c.statement])}<br>${html(c.field)}</td><td>${c.page}</td><td>${html(c.valueRaw)} ${html(c.unit)}</td><td>${html(c.line)}</td><td>${coll>1?'<span class="pill gold">多条候选，必须人工选一条</span>':'<span class="pill">待目视确认</span>'}</td></tr>`;
 }).join('');
 return `<div class="card" style="padding:24px;margin:20px 0;border:1px solid rgba(120,180,205,.32);border-radius:12px;background:rgba(6,30,43,.56)">
 <div class="overline">AUTO-EXTRACT / HUMAN REVIEW · 1.6</div><h3 style="margin:8px 0 5px">原始 PDF 数字候选识别</h3>
 <p class="mini-muted">本地服务只读取 PDF 可选择的文字，不做 OCR、联网认证或自动认定对应报表列。所有候选默认不勾选；须打开 PDF 原页人工核对后才可生成台账。</p>
 <div class="filter-bar"><label>选择 PDF（须与 01 登记的同一文件）<input id="pdf-auto-file" class="input-control" type="file" accept=".pdf,application/pdf"/></label><label>从 PDF 第几页开始<input id="pdf-auto-start" class="input-control" type="number" min="1" max="3000" value="1" style="width:100px"/></label><label>读取页数（最多30）<input id="pdf-auto-limit" class="input-control" type="number" min="1" max="30" value="30" style="width:100px"/></label></div>
 <div class="action-row"><button id="pdf-auto-run" class="primary-btn" ${state.busy?'disabled':''}>${state.busy?'正在解析…':'提取 PDF 候选字段'}</button><button id="pdf-auto-open" class="ghost-btn" ${state.sourceUrl?'':'disabled'}>打开本地 PDF 对照原页 ↗</button><button id="pdf-auto-clear" class="ghost-btn">清空候选</button></div>
 ${state.error?`<div class="info-box gold">${html(state.error)}</div>`:''}
 ${res?`<div class="info-box">已读取第 ${res.scanned_range.join('—')} 页 / 总计 ${res.page_count} 页；识别候选 ${n} 条。<br>源文件：${html(state.filename)}；PDF SHA-256：${html(res.pdf_sha256)}<br>${shaOK?'当前PDF与01登记的文件指纹一致（仅证明文件相同）':'【拒绝核对】PDF指纹与01登记的来源不一致；请返回01登记正确文件并重新分析。'}<br>${counts}</div>`:''}
 ${rows?`<div style="overflow:auto;max-height:530px"><table class="data-table"><thead><tr><th>已核对原文</th><th>年度 / 字段</th><th>页码</th><th>候选金额</th><th>PDF文字项</th><th>歧义提示</th></tr></thead><tbody>${rows}</tbody></table></div><div class="action-row"><button id="pdf-auto-apply" class="primary-btn" ${!shaOK?'disabled':''}>仅使用已勾选候选生成核对台账</button><span class="mini-muted">已人工确认 ${state.accepted.size}/${n}；未选择的字段保持未核验</span></div>`:''}
 <div class="info">跨年多列财报、扫描件、页眉字段不清、金额单位未知及无法唯一定位的数字不会自动通过。如遇漏项请使用下方 v1.5 人工台账补充。原文哈希/数字匹配均不构成交易所官方认证。</div></div>`;
}
function bind(project,apply,refresh){
 document.querySelector('#pdf-auto-run')?.addEventListener('click',async()=>{
  const file=document.querySelector('#pdf-auto-file')?.files?.[0];
  if(!file){state.error='请先选择来源PDF';refresh();return;}
  const start=Number(document.querySelector('#pdf-auto-start')?.value),limit=Number(document.querySelector('#pdf-auto-limit')?.value);
  if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);
  state={busy:true,error:'',result:null,accepted:new Set(),filename:file.name,sourceUrl:URL.createObjectURL(file)};refresh();
  try{
   if(file.size>15*1024*1024||file.size<100||!/\.pdf$/i.test(file.name))throw Error('只支持不超过15MB的 PDF');
   if(!Number.isInteger(start)||start<1||start>3000||!Number.isInteger(limit)||limit<1||limit>30)throw Error('页码或扫描页数不合法');
   const response=await fetch(`/api/pdf-extract?start=${start}&limit=${limit}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:await file.arrayBuffer()});
   const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'解析失败');
   state.result=data;
  }catch(e){state.error=e.message||String(e)}finally{state.busy=false;refresh();}
 });
 document.querySelectorAll('[data-pdf-check]').forEach(el=>el.addEventListener('change',()=>{
  const i=Number(el.dataset.pdfCheck);if(el.checked)state.accepted.add(i);else state.accepted.delete(i);refresh();
 }));
 document.querySelector('#pdf-auto-open')?.addEventListener('click',()=>{if(state.sourceUrl)window.open(state.sourceUrl,'_blank','noopener')});
 document.querySelector('#pdf-auto-clear')?.addEventListener('click',()=>{if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);state={busy:false,error:'',result:null,accepted:new Set(),filename:'',sourceUrl:''};refresh()});
 document.querySelector('#pdf-auto-apply')?.addEventListener('click',()=>{
  try{
   const res=state.result; if(!res||!project?.provenance?.evidenceSha||res.pdf_sha256!==project.provenance.evidenceSha)throw Error('来源 PDF 指纹不匹配');
   if(!state.accepted.size)throw Error('必须先逐条勾选已在PDF原页核对过的项目');
   const items=[...state.accepted].map(i=>res.candidates[i]);
   if(items.some(x=>!x))throw Error('候选索引不存在');
   const seen=new Set();for(const x of items){const k=x.year+'|'+x.statement+'|'+x.field;if(seen.has(k))throw Error('同一字段勾选了多个候选，请只选择正确的原文列：'+k);seen.add(k);}
   const fields=['year','statement','field','value','unit','page','period_end','basis','source_pdf_sha256','currency','note'];
   if(!['consolidated','individual'].includes(project.provenance.basis))throw Error('01 尚未确认合并或单体口径');
   const rows=[fields,...items.map(x=>[x.year,x.statement,x.field,x.valueRaw,x.unit,x.page,x.period_end,project.provenance.basis,res.pdf_sha256,'CNY','PDF文本自动提取候选；人工目视确认，非官方认证'])];
   const facts=global.QZDisclosure.splitCsv(global.QZDisclosure.toCsv(rows));
   apply(facts,res.pdf_sha256,state.filename);
  }catch(e){state.error=e.message||String(e);refresh();}
 });
}
window.QZPdfAuto={render,bind};
})(window);
