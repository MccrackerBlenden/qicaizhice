/* UI adapter for the existing v3.0 user-finance workspace. No new application shell. */
(function(global){'use strict';
const P=()=>global.QZPeriods;
const clone=x=>JSON.parse(JSON.stringify(x));
let form={frequency:'month',flow_basis:'period',unit:'wan',files:{},status:''};
function sync(book){form={frequency:book?.frequency||'month',flow_basis:book?.flow_basis||'period',unit:'wan',files:{},status:''};}
function render(book,annual){return P().view(book,annual,form)}
const encode=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const csv=rows=>'\ufeff'+rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
function save(name,body,type){const b=new Blob([body],{type}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)}
function template(){const freq=form.frequency,dates=freq==='month'?['2025-01','2025-02','2025-03']:['2025-Q1','2025-Q2'];
 const specs={bs:['资产总计','负债合计','所有者权益合计'],is:['营业收入','净利润','营业成本'],cf:['经营活动产生的现金流量净额']};
 const type=document.getElementById('period-template-type')?.value||'bs',fields=specs[type];if(!fields)throw Error('模板类型无效');
 save('期间_'+P().NAMES[type]+'_模板.csv',csv([['期间',...fields],...dates.map(s=>[s,...fields.map(()=> '')])]),'text/csv;charset=utf-8');
}
function exportData(book,annual,kind){const packet=P().report(book,annual);
 if(kind==='json'){save('企财智策_期间财务分析_证据.json',JSON.stringify(packet,null,2),'application/json;charset=utf-8');return}
 const labels=['期间','收入_万元','净利润_万元','经营现金流_万元','期末资产_万元','期末负债_万元','净利率_百分比','环比_百分比','同比_百分比','有效'];
 const data=[labels,...packet.rows.map(r=>[r.period,r.revenue,r.net_income,r.operating_cf,r.assets,r.liabilities,r.net_margin,r.prior_change_pct,r.yoy_change_pct,r.usable?'是':'否'])];
 if(kind==='csv'){save('企财智策_期间财务分析.csv',csv(data),'text/csv;charset=utf-8');return}
 const header='<thead><tr>'+labels.map(x=>'<th>'+encode(x)+'</th>').join('')+'</tr></thead>';
 const body='<tbody>'+data.slice(1).map(r=>'<tr>'+r.map(x=>'<td>'+encode(x??'缺失/不可比')+'</td>').join('')+'</tr>').join('')+'</tbody>';
 const doc=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>企财智策 · 期间管理报告</title><style>body{max-width:1080px;margin:40px auto;font:14px/1.8 'Microsoft YaHei',sans-serif;color:#203447;padding:0 20px}h1{border-bottom:3px solid #184d67;padding-bottom:15px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccdae2;padding:6px}th{background:#e5eff4}.warn{padding:12px;background:#fff0d7}@media print{body{margin:0}@page{size:A4 landscape}}</style></head><body><h1>企财智策 · 期间经营管理分析</h1><p>频率：${encode(packet.frequency==='month'?'月度':'季度')} · 利润与现金流来源口径：${encode(packet.flow_basis==='ytd'?'年初累计差分':'单期发生额')} · 金额单位：万元 · 生成日期：${encode(packet.generated_at)}</p><p class="warn">仅使用用户上传资料，资产负债为期末余额。缺期、缺少上期累计数时不推算单期金额、季度或同比。不代表审计与财报来源真实性认证。此报告与年度综合报告为不同期间口径。</p><table>${header}${body}</table><h2>季度完整性检查</h2>${packet.quarters.map(q=>`<p>${encode(q.period)}：${q.available?'全部月份齐全，收入 '+q.fields.is.revenue.toFixed(2)+' 万元':'缺少 '+q.missing.join('、')}</p>`).join('')}<h2>年度完整性检查</h2>${packet.years.map(y=>`<p>${encode(y.period)}：${y.available?'全部期间齐全，收入 '+y.fields.is.revenue.toFixed(2)+' 万元':'不完整，禁止自动生成全年数据'}</p>`).join('')}<h2>来源追溯</h2>${Object.entries(packet.sources).map(([k,s])=>`<p>${encode(k)}：${Object.entries(s).map(([t,v])=>encode(t+': '+v.file+' SHA-256 '+v.sha256)).join('；')}</p>`).join('')}<p>报告不含源文件字节，建议与原始报表一并留档。</p><button onclick="window.print()">打印/另存 PDF</button></body></html>`;
 save('企财智策_期间管理报告.html',doc,'text/html;charset=utf-8');
}
async function readFile(file,type){if(file.size>6*1024*1024)throw Error('单个文件不得超过6 MB');
 let data,sheet='CSV';if(/\.csv$/i.test(file.name)){
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());data=global.QZUser._test.parseDelimited(raw);
 }else if(/\.xlsx$/i.test(file.name)){
  const sheets=await global.QZUser._test.unzipXlsx(await file.arrayBuffer());const words={bs:['资产负债','balance'],is:['利润','income'],cf:['现金流','cash']};
  const selected=sheets.find(x=>words[type].some(w=>x.name.toLowerCase().includes(w.toLowerCase())));
  if(!selected)throw Error('未找到'+P().NAMES[type]+'工作表，请重命名对应工作表');
  data=selected.data;sheet=selected.name;
 }else throw Error('仅支持 CSV 或 XLSX');
 const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {data,file:{name:file.name,sha256:hash,sheet}};
}
function bind({getBook,getAnnual,onCommit,refresh}){
 for(const [id,key] of [['period-frequency','frequency'],['period-basis','flow_basis'],['period-unit','unit']])document.getElementById(id)?.addEventListener('change',e=>{form[key]=e.target.value;form.files={};form.status='口径已切换，请重新上传对应期间的三张报表。';refresh()});
 document.querySelectorAll('.period-upload').forEach(el=>el.addEventListener('change',async e=>{const type=e.target.dataset.type,file=e.target.files?.[0];if(!file)return;
  try{form.files[type]=await readFile(file,type);form.status=`已读取 ${Object.keys(form.files).length}/3 张报表，尚未保存。`}
  catch(ex){delete form.files[type];form.status='读取失败：'+ex.message;}refresh();
 }));
 document.querySelector('#period-example')?.addEventListener('click',template);
 document.querySelector('#period-reset')?.addEventListener('click',()=>{try{if(!confirm('将建立新的财务快照并清空当前期间账簿，旧数据仍可在历史版本中恢复。要继续吗？'))return;onCommit(null,'手动清空期间账簿');sync(null);form.status='已建立新快照，旧期间数据仍在历史财务版本中。';refresh()}catch(e){form.status=e.message;refresh()}});
 document.querySelector('#period-import')?.addEventListener('click',()=>{
  try{if(P().TYPES.some(t=>!form.files[t]))throw Error('请先选齐三张报表');
   const inputs=Object.fromEntries(P().TYPES.map(t=>[t,form.files[t].data])),sources=Object.fromEntries(P().TYPES.map(t=>[t,form.files[t].file]));
   const incoming=P().parseThree(inputs,{frequency:form.frequency,flow_basis:form.flow_basis,unit:form.unit,sources});
   let plan=P().mergeBook(getBook(),incoming,false);
   if(plan.needs_confirmation){const warning=plan.replacements.join('、');if(!confirm(`以下期间已有金额发生变化：${warning}。确认将追加历史快照并更新这些期间？原版本仍保留。`)){form.status='已取消更正，原数据完全保留。';refresh();return}plan=P().mergeBook(getBook(),incoming,true);}
   if(!plan.changed){form.status='本次期间数值完全重复，未创建新版本，也未覆盖原来源文件指纹。';refresh();return}
   onCommit(plan.book,`期间报表：新增 ${plan.added.length} 期、更正 ${plan.replacements.length} 期`);
   form.files={};form.status=`期间数据已进入当前企业快照：新增 ${plan.added.length} 期、更正 ${plan.replacements.length} 期。请点击下方「保存当前企业到本机项目库」完成持久保存。`;
  }catch(e){form.status='导入已阻止：'+e.message}refresh();
 });
 const book=getBook();if(book)for(const kind of ['csv','json','html'])document.querySelector('#period-export'+(kind==='csv'?'':kind==='json'?'-json':'-html'))?.addEventListener('click',()=>exportData(book,getAnnual(),kind));
}
global.QZPeriodUI={sync,render,bind,_test:{template,csv}};
})(window);
