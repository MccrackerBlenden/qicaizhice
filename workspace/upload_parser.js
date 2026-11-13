'use strict';
/* v1.3 offline in-browser CSV/XLSX reader. No network requests, persistence or executable workbook content. */
const QZP = (() => {
  const MAX_FILE=5*1024*1024, MAX_ROWS=5000, MAX_COLS=180, MAX_EXPANDED=12*1024*1024;
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relns='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const doc=x=>{const xml=new DOMParser().parseFromString(x,'application/xml');if(xml.getElementsByTagName('parsererror').length)throw Error('Excel XML 结构损坏');return xml;};
  const tx=(element,name)=>{const n=element?.getElementsByTagNameNS('*',name)[0];return n?n.textContent:''};
  const all=(element,name)=>Array.from(element.getElementsByTagNameNS('*',name));
  function decode(buffer){try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\ufeff/,'')}
    catch{return new TextDecoder('gb18030').decode(buffer).replace(/^\ufeff/,'')}}
  function csv(source){const first=source.split(/\r?\n/)[0]||'';
    const counts=[',','\t',';'].map(d=>({d,n:first.split(d).length})).sort((a,b)=>b.n-a.n);
    const delimiter=counts[0].n>1?counts[0].d:',';let out=[],row=[],field='',quoted=false;
    for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){
      if(quoted&&source[i+1]==='"'){field+='"';i++} else quoted=!quoted;
    }else if(c===delimiter&&!quoted){row.push(field);field='';}
    else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>String(x).trim()))out.push(row);row=[];
      if(out.length>MAX_ROWS+4)throw Error('表格超过5000行，仅支持中小型财报');}
    else field+=c;}
    if(quoted)throw Error('CSV 引号未闭合');row.push(field);if(row.some(x=>String(x).trim()))out.push(row);
    return matrix(out);
  }
  function matrix(rows){if(!rows.length)throw Error('表格为空');const header=rows[0].map((v,i)=>String(v||'').trim()||`列${i+1}`);
    if(header.length>MAX_COLS)throw Error('字段超过180列');const seen=new Set();for(const x of header){if(seen.has(x))throw Error(`重复列名：${x}`);seen.add(x)}
    const records=rows.slice(1).filter(r=>r.some(x=>String(x??'').trim())).map(r=>Object.fromEntries(header.map((x,i)=>[x,String(r[i]??'').trim()])));
    if(records.length>MAX_ROWS)throw Error('表格最多5000条记录');return {headers:header,rows:records};
  }
  async function unzip(buf){const bytes=new Uint8Array(buf),dv=new DataView(buf);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('Excel 压缩包缺少目录信息');const count=dv.getUint16(end+10,true),off=dv.getUint32(end+16,true);
    if(count>250)throw Error('Excel 内部文件过多');if(off>=bytes.length)throw Error('Excel 目录偏移异常');
    const out={};let pointer=off,expanded=0;
    for(let i=0;i<count;i++){
      if(dv.getUint32(pointer,true)!==0x02014b50)throw Error('Excel 目录结构损坏');
      const flag=dv.getUint16(pointer+8,true),method=dv.getUint16(pointer+10,true),compressed=dv.getUint32(pointer+20,true),original=dv.getUint32(pointer+24,true);
      const nameLen=dv.getUint16(pointer+28,true),extra=dv.getUint16(pointer+30,true),comment=dv.getUint16(pointer+32,true),local=dv.getUint32(pointer+42,true);
      if([original,compressed,local].includes(0xffffffff))throw Error('暂不支持 ZIP64 Excel');
      const name=new TextDecoder().decode(bytes.subarray(pointer+46,pointer+46+nameLen));pointer+=46+nameLen+extra+comment;
      if(!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[\w.-]+\.xml)$/.test(name))continue;
      if(original>8*1024*1024||expanded+original>MAX_EXPANDED)throw Error('Excel 解压数据超出安全上限');
      if((flag&1)!==0)throw Error('不支持加密 Excel');
      if(dv.getUint32(local,true)!==0x04034b50)throw Error('Excel 文件头损坏');
      const pos=local+30+dv.getUint16(local+26,true)+dv.getUint16(local+28,true);
      if(pos+compressed>bytes.length)throw Error('Excel 文件越界');const data=bytes.subarray(pos,pos+compressed);
      let result;if(method===0)result=data;else if(method===8){
        if(typeof DecompressionStream!=='function')throw Error('浏览器不支持本地 Excel 解压，请使用最新版 Chrome 或改用 CSV');
        const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader=stream.getReader(),chunks=[];let received=0;
        try{while(true){const part=await reader.read();if(part.done)break;received+=part.value.length;
          if(received>8*1024*1024||received>original){await reader.cancel();throw Error('Excel 解压数据异常或超出安全上限');}
          chunks.push(part.value);
        }}finally{reader.releaseLock()}
        result=new Uint8Array(received);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}
      } else throw Error('Excel 使用不支持的压缩方式');
      if(result.length!==original)throw Error('Excel 解压长度不一致');expanded+=result.length;out[name]=new TextDecoder().decode(result);
    }
    return out;
  }
  function colIdx(cell){let x=0;for(const char of cell.toUpperCase().match(/^[A-Z]+/)?.[0]||'')x=x*26+char.charCodeAt(0)-64;return x-1}
  function readSheet(xml,strings){let rows=[];
    for(const row of all(xml,'row')){
      const cells=[];for(const cell of all(row,'c')){
        const idx=colIdx(cell.getAttribute('r')||'');if(idx<0||idx>=MAX_COLS)continue;
        const t=cell.getAttribute('t'),v=tx(cell,'v');let value=v;
        if(t==='s')value=strings[Number(v)]||'';
        else if(t==='inlineStr')value=all(cell,'t').map(x=>x.textContent).join('');
        else if(t==='b')value=v==='1'?'TRUE':'FALSE';
        else if(t==='e')value='';
        cells[idx]=String(value);
      }
      if(cells.some(x=>x!==undefined&&x!==''))rows.push(cells.map(x=>x??''));
      if(rows.length>MAX_ROWS+4)throw Error('Excel 工作表超过5000行');
    }
    return matrix(rows);
  }
  async function xlsx(buffer){const entries=await unzip(buffer);
    if(!entries['xl/workbook.xml'])throw Error('缺少 Excel 工作簿定义');const workbook=doc(entries['xl/workbook.xml']);
    const rel=doc(entries['xl/_rels/workbook.xml.rels']||'<Relationships/>');
    const relMap={};for(const node of all(rel,'Relationship')){
      const target=node.getAttribute('Target')||'';if(/\.\.|:/.test(target))continue;
      relMap[node.getAttribute('Id')]=target.replace(/^\/?xl\//,'').replace(/^\//,'');
    }
    const strings=[];if(entries['xl/sharedStrings.xml'])for(const si of all(doc(entries['xl/sharedStrings.xml']),'si'))strings.push(all(si,'t').map(x=>x.textContent).join(''));
    const result={};for(const sh of all(workbook,'sheet').slice(0,20)){
      const id=sh.getAttributeNS(relns,'id')||sh.getAttribute('r:id');const target=relMap[id];
      if(!target)continue;const source=entries['xl/'+target];if(!source)continue;
      const n=(sh.getAttribute('name')||'Sheet').slice(0,60);result[n]=readSheet(doc(source),strings);
    }
    if(!Object.keys(result).length)throw Error('Excel 中没有可读取的工作表');return result;
  }
  async function load(files){if(!files.length||files.length>3)throw Error('请选择1个Excel工作簿或最多3个CSV文件');
    const data={};for(const file of files){if(file.size>MAX_FILE)throw Error(`${file.name} 超过5 MB，拒绝读取`);
      const extension=file.name.split('.').pop().toLowerCase();if(!['xlsx','csv','tsv'].includes(extension))throw Error('仅支持 .xlsx、.csv、.tsv');
      if(extension==='xlsx'){
        if(files.length!==1)throw Error('Excel 工作簿请单独上传（可以含三张工作表）');
        const buf=await file.arrayBuffer();const x=await xlsx(buf);Object.assign(data,x);
      } else{const name=file.name.slice(0,70);if(Object.hasOwn(data,name))throw Error('重复文件名：'+name);const buf=await file.arrayBuffer();data[name]=csv(decode(buf));}
    }
    return data;
  }
  return {load,csv,xlsx,matrix,MAX_FILE};
})();
