// Qicaizhice preview v0.3: local-only, explicit lifecycle management.
import http from 'node:http';
import {readFile, stat, writeFile, rm} from 'node:fs/promises';
import {resolve, extname, sep, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {ProjectStore} from './storage/project_store.mjs';

const ROOT=dirname(fileURLToPath(import.meta.url));
const FIRST_PORT=8791, LAST_PORT=8800;
const instanceId=randomBytes(16).toString('hex');
const stopToken=randomBytes(24).toString('hex');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'};
let runningPort=null, closing=false;
let lastSecRequest=0;
let lastCnRequest=0;
let sessionFile=null;
let projectStore=null;
const sendJSON=(res,code,obj)=>{
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(obj));
};
async function removeOwnSession(){
 if(!sessionFile)return;
 try { const old=JSON.parse(await readFile(sessionFile,'utf8'));
   if(old.instanceId===instanceId && old.pid===process.pid) await rm(sessionFile,{force:true});
 }catch{}
}
function exitServer(){
 if(closing)return; closing=true;
 server.close(async()=>{try{projectStore?.close()}catch{}await removeOwnSession();process.exitCode=0;});
 // Avoid indefinite wait on idle connections; supported by Node >=18.2.
 setTimeout(()=>{try{server.closeAllConnections();}catch{}},1000).unref();
 setTimeout(async()=>{await removeOwnSession();process.exit(0);},3500).unref();
}
const server=http.createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  // v3.0-F: Local single-user project storage. Never treat this as a LAN or cloud API.
  if(pathname==='/api/projects'||pathname.startsWith('/api/projects/')){
    if(!projectStore)return sendJSON(res,503,{ok:false,error:'项目存储不可用，请检查本机 SQLite 运行时'});
    if(req.headers.host!==`127.0.0.1:${runningPort}`)return sendJSON(res,403,{ok:false,error:'仅允许本机访问'});
    if(req.method==='POST'){
      if(req.headers.origin!==`http://127.0.0.1:${runningPort}`||req.headers['x-qz-local-request']!=='1')
        return sendJSON(res,403,{ok:false,error:'仅允许本机页面主动保存'});
    }
    try{
      if(pathname==='/api/projects/status'&&req.method==='GET')return sendJSON(res,200,{ok:true,...projectStore.status()});
      if(pathname==='/api/projects'&&req.method==='GET')return sendJSON(res,200,{ok:true,projects:projectStore.list()});
      const match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/);
      if(match&&req.method==='GET')return sendJSON(res,200,{ok:true,...projectStore.load(match[1])});
      if(pathname==='/api/projects/backup'&&req.method==='POST')return sendJSON(res,200,{ok:true,...await projectStore.backup()});
      if(pathname==='/api/projects'&&req.method==='POST'){
        const max=8*1024*1024+16384;
        if(Number(req.headers['content-length']||0)>max)return sendJSON(res,413,{ok:false,error:'请求超过限制'});
        let size=0;const parts=[];
        for await(const b of req){size+=b.length;if(size>max)return sendJSON(res,413,{ok:false,error:'请求超过限制'});parts.push(b)}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{return sendJSON(res,400,{ok:false,error:'无效JSON'})}
        if(!body||typeof body!=='object')return sendJSON(res,400,{ok:false,error:'请求结构无效'});
        return sendJSON(res,200,{ok:true,...projectStore.save(body)});
      }
      return sendJSON(res,405,{ok:false,error:'不支持该项目操作'});
    }catch(e){return sendJSON(res,e.status||500,{ok:false,error:e.status?e.message:'本机项目操作失败'});}
  }
  if(pathname==='/api/reports/export/pdf'||pathname==='/api/reports/export/xlsx'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'只接受 POST'});
    if(req.headers.host!==`127.0.0.1:${runningPort}`||req.headers.origin!==`http://127.0.0.1:${runningPort}`||req.headers['x-qz-local-request']!=='1')return sendJSON(res,403,{ok:false,error:'仅允许本机工作台导出'});
    const max=1024*1024;let size=0;const items=[];
    for await(const chunk of req){size+=chunk.length;if(size>max)return sendJSON(res,413,{ok:false,error:'报告内容超过1MB'});items.push(chunk)}
    let body;try{body=JSON.parse(Buffer.concat(items).toString('utf8'));if(body?.document?.schema!=='qcz.decision-brief.v2.6')throw Error()}catch{return sendJSON(res,400,{ok:false,error:'报告格式不正确'})}
    const format=pathname.endsWith('/pdf')?'pdf':'xlsx',script=resolve(ROOT,'storage','report_export.py');
    const commands=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
    let failure='本机 Python 不可用';
    for(const [cmd,args] of commands){
      try{
        const output=await new Promise((yes,no)=>{
          const p=spawn(cmd,[...args,script,format],{cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
          const stdout=[],stderr=[];let bytes=0,done=false;
          const timer=setTimeout(()=>{p.kill();finish(Error('导出进程超时'))},40000);
          function finish(err,value){if(done)return;done=true;clearTimeout(timer);err?no(err):yes(value)}
          p.on('error',finish);p.stdout.on('data',d=>{bytes+=d.length;if(bytes>12*1024*1024){p.kill();finish(Error('导出文件过大'))}else stdout.push(d)});
          p.stderr.on('data',d=>{if(Buffer.concat(stderr).length<4096)stderr.push(d)});
          p.on('close',code=>code===0?finish(null,Buffer.concat(stdout)):finish(Error(Buffer.concat(stderr).toString('utf8').slice(0,240)||'文件生成失败')));
          p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify(body));
        });
        if(output.length<100)return sendJSON(res,503,{ok:false,error:'输出文件无效'});
        res.writeHead(200,{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Cache-Control':'no-store','Content-Disposition':`attachment; filename="qcz-report.${format}"`,'Content-Length':output.length,'X-Content-Type-Options':'nosniff'});
        res.end(output);return;
      }catch(e){failure=String(e.message||e).slice(0,220);if(!/ENOENT|not found|spawn/.test(failure))break;}
    }
    return sendJSON(res,503,{ok:false,error:'无法导出'+format.toUpperCase()+'：'+failure});
  }
  if(pathname==='/__qz/health'){
    return sendJSON(res,200,{app:'qicaizhice-preview',version:'Local',pid:process.pid,port:runningPort,instanceId});
  }
  if(pathname==='/__qz/stop'){
    if(req.method!=='POST'||req.headers['x-qz-stop-token']!==stopToken)
      return sendJSON(res,403,{ok:false,error:'Unauthorized'});
    sendJSON(res,200,{ok:true,message:'Shutting down preview server'});
    setImmediate(exitServer);return;
  }
  if(pathname==='/health')return sendJSON(res,200,{ok:true,version:'Local'});

  // v1.9: only approved direct HTTPS disclosure-PDF URLs; no redirects, no proxy, no arbitrary fetch.
  if(pathname==='/api/cn-pdf-integrity'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'仅接受POST'});
    const origin=req.headers.origin;
    if(origin&&origin!==`http://127.0.0.1:${runningPort}`)
      return sendJSON(res,403,{ok:false,error:'禁止跨来源请求'});
    const length=Number(req.headers['content-length']||0);
    if(!Number.isInteger(length)||length<8||length>2048)return sendJSON(res,413,{ok:false,error:'请求体大小不合法'});
    let size=0;const chunks=[];
    for await(const part of req){size+=part.length;if(size>2048)return sendJSON(res,413,{ok:false,error:'请求过大'});chunks.push(part)}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return sendJSON(res,400,{ok:false,error:'无效JSON'})}
    if(!body||typeof body.url!=='string')return sendJSON(res,400,{ok:false,error:'请输入PDF直接链接'});
    if(Date.now()-lastCnRequest<2000)return sendJSON(res,429,{ok:false,error:'官方原件核对至少间隔2秒'});
    lastCnRequest=Date.now();
    const script=resolve(ROOT,'engine','api_cn_pdf_verify.py');
    const commands=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
    if(process.platform==='win32'&&/^[a-zA-Z]:[\\/]/.test(ROOT)){
      const drive=ROOT[0].toLowerCase(),dir=ROOT.slice(2).replaceAll('\\','/');
      commands.push(['wsl.exe',['-e','env','PYTHONDONTWRITEBYTECODE=1','python3',`/mnt/${drive}${dir}/engine/api_cn_pdf_verify.py`]]);
    }
    let lastError='本机Python未找到';
    for(const [cmd,args] of commands){
      try{
        const r=await new Promise((yes,no)=>{
          const child=spawn(cmd,cmd==='wsl.exe'?args:[...args,script],{cwd:ROOT,windowsHide:true,
            env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
          let output='',done=false;
          const timer=setTimeout(()=>{child.kill();finish(new Error('请求超时'))},22000);
          function finish(err,val){if(done)return;done=true;clearTimeout(timer);err?no(err):yes(val)}
          child.on('error',finish);
          child.stdout.on('data',d=>{output+=d.toString();if(output.length>8000){child.kill();finish(new Error('响应异常'))}});
          child.on('close',code=>finish(null,{code,output}));child.stdin.on('error',()=>{});
          child.stdin.end(JSON.stringify({url:body.url}));
        });
        const data=JSON.parse(r.output);
        return sendJSON(res,data.ok?200:422,data);
      }catch(e){lastError=String(e?.message||e)}
    }
    return sendJSON(res,503,{ok:false,error:'本机官方原件核对服务不可用；可继续人工PDF核对',detail:lastError.slice(0,120)});
  }

  // SEC Company Facts: fixed HTTPS SEC endpoint only. No user-entered URL, no private data.
  if(pathname==='/api/sec-companyfacts'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'Only POST supported'});
    const length=Number(req.headers['content-length']||0);
    if(!Number.isInteger(length)||length<4||length>1024)return sendJSON(res,413,{ok:false,error:'SEC request too large'});
    let size=0;const parts=[];
    for await(const part of req){size+=part.length;if(size>1024)return sendJSON(res,413,{ok:false,error:'SEC request too large'});parts.push(part)}
    let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{return sendJSON(res,400,{ok:false,error:'Invalid JSON'})}
    if(!body||!/^\d{1,10}$/.test(String(body.cik||''))||!
       /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(String(body.contact||''))||String(body.contact).length>120)
      return sendJSON(res,400,{ok:false,error:'请输入有效CIK与联系邮箱'});
    if(Date.now()-lastSecRequest<1500)return sendJSON(res,429,{ok:false,error:'请至少间隔1.5秒再请求 SEC 官方数据'});
    lastSecRequest=Date.now();
    const script=resolve(ROOT,'engine','api_sec_fetch.py'),payload=JSON.stringify({cik:body.cik,contact:body.contact});
    const cmds=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
    if(process.platform==='win32'&&/^[a-zA-Z]:[\\/]/.test(ROOT)){
      const drive=ROOT[0].toLowerCase(),dir=ROOT.slice(2).replaceAll('\\','/');
      cmds.push(['wsl.exe',['-e','env','PYTHONDONTWRITEBYTECODE=1','python3',`/mnt/${drive}${dir}/engine/api_sec_fetch.py`]]);
    }
    let last='Python not found';
    for(const [cmd,args] of cmds){
      try{
        const data=await new Promise((yes,no)=>{
          const invoke=cmd==='wsl.exe'?args:[...args,script];
          const child=spawn(cmd,invoke,{cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
          let output='',done=false;
          const timer=setTimeout(()=>{child.kill();finish(new Error('SEC request timeout'))},28000);
          function finish(err,val){if(done)return;done=true;clearTimeout(timer);err?no(err):yes(val)}
          child.on('error',finish);
          child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>19*1024*1024){child.kill();finish(new Error('SEC response too large'))}});
          child.on('close',code=>finish(null,{code,output}));child.stdin.end(payload);
        });
        const result=JSON.parse(data.output);
        return sendJSON(res,result.ok?200:422,result);
      }catch(err){last=String(err?.message||err)}
    }
    return sendJSON(res,503,{ok:false,error:'SEC现场接入需要本机Python与网络。可使用离线JSON导入。',detail:last.slice(0,120)});
  }

  // Local-only PDF candidate extraction; raw bytes remain in memory, no upload to a cloud.
  if(pathname==='/api/pdf-extract'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'Only POST is supported'});
    const length=Number(req.headers['content-length']||0);
    if(!Number.isInteger(length)||length<100||length>15*1024*1024)
      return sendJSON(res,413,{ok:false,error:'PDF must be smaller than 15MB'});
    const range=new URL(req.url,'http://127.0.0.1').searchParams;
    const page=Number(range.get('start')||1),limit=Number(range.get('limit')||30);
    if(!Number.isInteger(page)||page<1||page>3000||!Number.isInteger(limit)||limit<1||limit>30)
      return sendJSON(res,400,{ok:false,error:'Invalid page range'});
    let size=0;const chunks=[];
    for await(const part of req){size+=part.length;if(size>15*1024*1024)return sendJSON(res,413,{ok:false,error:'PDF too large'});chunks.push(part);}
    const bytes=Buffer.concat(chunks);
    if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))
      return sendJSON(res,422,{ok:false,error:'Not a PDF file'});
    const script=resolve(ROOT,'engine','api_pdf_extract.py');
    const cmds=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
    if(process.platform==='win32'&&/^[a-zA-Z]:[\\/]/.test(ROOT)){
      const drive=ROOT[0].toLowerCase(),dir=ROOT.slice(2).replaceAll('\\','/');
      cmds.push(['wsl.exe',['-e','env','PYTHONDONTWRITEBYTECODE=1','python3',`/mnt/${drive}${dir}/engine/api_pdf_extract.py`,String(page),String(limit)]]);
    }
    let last='No Python runtime';
    for(const [cmd,args] of cmds){
      try{
        const result=await new Promise((resolveRun,reject)=>{
          const invoke=cmd==='wsl.exe'?args:[...args,script,String(page),String(limit)];
          const child=spawn(cmd,invoke,{cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
          let output='',error='',done=false;
          const timer=setTimeout(()=>{child.kill();finish(new Error('PDF extraction timeout'))},25000);
          function finish(err,val){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolveRun(val);}
          child.on('error',finish);
          child.stdout.on('data',v=>{output+=v.toString();if(output.length>250000)child.kill()});
          child.stderr.on('data',v=>{error+=v.toString().slice(0,500)});
          child.on('close',code=>finish(null,{code,output,error}));
          child.stdin.on('error',()=>{});child.stdin.end(bytes);
        });
        const data=JSON.parse(result.output);
        return sendJSON(res,data.ok?200:422,data);
      }catch(e){last=String(e?.message||e);}
    }
    return sendJSON(res,503,{ok:false,error:'本地 PDF 解析未启动。请检查 Python 3；手工台账功能仍可使用。',detail:last.slice(0,120)});
  }

  // 静态情景计算: fail-closed actual Python model using an isolated read-only 2021/22 slice.
  if(pathname==='/api/scenario'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'Only POST is supported'});
    let size=0;
    const chunks=[];
    for await(const part of req){
      size+=part.length;
      if(size>8192)return sendJSON(res,413,{ok:false,error:'Request too large'});
      chunks.push(part);
    }
    let body;
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
    catch{return sendJSON(res,400,{ok:false,error:'Invalid JSON'})}
    if(!body||typeof body!=='object'||Array.isArray(body)||!['VPM-071','VPM-101','VPM-203'].includes(body.company)||body.year!==2022)
      return sendJSON(res,400,{ok:false,error:'Only three validated 2022 synthetic enterprises are supported'});
    const payload=JSON.stringify(body);
    const commands=process.platform==='win32'?
      [['python',[]],['py',['-3']]]:
      [['python3',[]],['python',[]]];
    // Optional bridge for Windows machines that have Python only inside WSL2.
    // Standard WSL automount: D:\\... -> /mnt/d/... ; arguments are passed directly, without a shell.
    if(process.platform==='win32'&&/^[a-zA-Z]:[\\/]/.test(ROOT)){
      const drive=ROOT[0].toLowerCase(),wslDir=ROOT.slice(2).replaceAll('\\','/');
      commands.push(['wsl.exe',['-e','env','PYTHONDONTWRITEBYTECODE=1','python3',`/mnt/${drive}${wslDir}/engine/api_scenario.py`]]);
    }
    let lastError='Python not available';
    for(const [executable,args] of commands){
      try{
        const result=await new Promise((resolveRun,rejectRun)=>{
          const child=spawn(executable,executable==='wsl.exe'?args:[...args,resolve(ROOT,'engine','api_scenario.py')],{
            cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
            stdio:['pipe','pipe','pipe']
          });
          let output='',error='',done=false;
          const timer=setTimeout(()=>{child.kill();finish(new Error('calculation timeout'))},35000);
          function finish(e,v){if(done)return;done=true;clearTimeout(timer);e?rejectRun(e):resolveRun(v)}
          child.on('error',finish);
          child.stdout.on('data',part=>{output+=part.toString();if(output.length>180000)child.kill()});
          child.stderr.on('data',part=>{error+=part.toString().slice(0,300)});
          child.on('close',code=>finish(null,{code,output,error}));
          child.stdin.end(payload);
        });
        const message=JSON.parse(result.output);
        return sendJSON(res,message.ok?200:422,message);
      }catch(e){lastError=e.code==='ENOENT'?'Python not found':String(e.message||e);}
    }
    return sendJSON(res,503,{ok:false,missing_python:true,error:'当前Windows环境没有可用的 Python 3，静态情景计算 正式情景计算未启动。可使用快速现金桥预览，或先安装 Python 3.10+。',detail:lastError.slice(0,120)});
  }


  // 有限网格优化: live deterministic finite-grid search with frozen constraints and safe inputs.
  if(pathname==='/api/optimize'){
    if(req.method!=='POST')return sendJSON(res,405,{ok:false,error:'Only POST is supported'});
    const chunks=[]; let size=0;
    for await(const part of req){size+=part.length;if(size>8192)return sendJSON(res,413,{ok:false,error:'Request too large'});chunks.push(part)}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return sendJSON(res,400,{ok:false,error:'Invalid JSON'})}
    if(!body||typeof body!=='object'||Array.isArray(body)||!['VPM-071','VPM-101','VPM-203'].includes(body.company)||body.year!==2022)
      return sendJSON(res,400,{ok:false,error:'Only three validated 2022 synthetic enterprises are supported'});
    const payload=JSON.stringify(body), script=resolve(ROOT,'engine','api_optimize.py');
    const cmds=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
    if(process.platform==='win32'&&/^[a-zA-Z]:[\\/]/.test(ROOT)){
      const drive=ROOT[0].toLowerCase(),wslDir=ROOT.slice(2).replaceAll('\\','/');
      cmds.push(['wsl.exe',['-e','env','PYTHONDONTWRITEBYTECODE=1','python3',`/mnt/${drive}${wslDir}/engine/api_optimize.py`]]);
    }
    let last='Python not available';
    for(const [executable,args] of cmds){
      try{
        const result=await new Promise((accept,reject)=>{
          const child=spawn(executable,executable==='wsl.exe'?args:[...args,script],{
            cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
          let output='',done=false;
          const timer=setTimeout(()=>{child.kill();finish(new Error('Optimization timeout'))},60000);
          function finish(err,val){if(done)return;done=true;clearTimeout(timer);err?reject(err):accept(val)}
          child.on('error',finish);
          child.stdout.on('data',part=>{output+=part.toString();if(output.length>750000)child.kill()});
          child.on('close',code=>finish(null,{code,output}));
          child.stdin.end(payload);
        });
        const message=JSON.parse(result.output);
        return sendJSON(res,message.ok?200:422,message);
      }catch(e){last=e.code==='ENOENT'?'Python not found':String(e.message||e)}
    }
    return sendJSON(res,503,{ok:false,error:'有限网格优化 现场优化无法启动。请核查 Python 3.10+ 环境与依赖。',detail:last.slice(0,120)});
  }

  if(req.method!=='GET'&&req.method!=='HEAD')return sendJSON(res,405,{error:'Method not allowed'});
  let path=pathname;
  if(path==='/')path='/index.html';
  if(/^\/workspace\/[a-z]+$/.test(path))path='/workspace/index.html';
  // Session files contain shutdown secrets. Never expose them over HTTP.
  if(path.startsWith('/engine/')||path.startsWith('/storage/')||path.includes('/.qz_session_')||/\.(bat|cmd|ps1|py|mjs|sqlite3|db|sqlite)$/i.test(path))
    return sendJSON(res,403,{error:'Restricted file'});
  const full=resolve(ROOT,'.'+path);
  if(full!==ROOT&&!full.startsWith(ROOT+sep))return sendJSON(res,403,{error:'Invalid path'});
  const info=await stat(full);if(!info.isFile())throw new Error('Not a file');
  res.writeHead(200,{'Content-Type':MIME[extname(full)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?'':await readFile(full));
 }catch(e){sendJSON(res,404,{error:'Resource not found'});}
});
function openBrowser(url){
 if(process.platform!=='win32'||process.env.QZ_NO_BROWSER==='1')return;
 try {const proc=spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{stdio:'ignore',windowsHide:true,detached:true});
      proc.on('error',e=>console.warn('无法自动打开浏览器：'+e.message));proc.unref();
 }catch(e){console.warn('无法自动打开浏览器：'+e.message);}
}
function listen(port){
 const onError=e=>{
  server.removeListener('listening',onListening);
  if(e.code==='EADDRINUSE'&&port<LAST_PORT){console.log('端口 '+port+' 已占用，尝试 '+(port+1));listen(port+1);return;}
  console.error('启动失败：',e.stack||e.message);process.exitCode=1;
 };
 const onListening=async()=>{
  server.removeListener('error',onError);
  runningPort=port;
  sessionFile=resolve(ROOT,`.qz_session_${port}.json`);
  const data={app:'qicaizhice-preview',version:'Local',pid:process.pid,port,instanceId,token:stopToken,runtime:'node',created:new Date().toISOString()};
  try{await writeFile(sessionFile,JSON.stringify(data,null,2),'utf8')}
  catch(e){console.error('无法写入运行状态文件：'+e.message);server.close();process.exitCode=1;return;}
  const suffix=process.env.QZ_SAFE_MODE==='1'?'?no3d=1':'';
  const url=`http://127.0.0.1:${port}/${suffix}`;
  console.log('========================================================');
  console.log('企财智策本地服务已启动：'+url);
  console.log(projectStore?'本机企业项目库：已就绪（用户数据目录，不在解压目录内）':'本机企业项目库：不可用；原有功能不受影响');
  console.log('工作台：http://127.0.0.1:'+port+'/workspace/journey');
  console.log('请保留启动窗口，正常停止后窗口会自动关闭；关闭浏览器不等于停止服务器。');
  console.log('退出：此窗口 Ctrl+C，或双击“停止体验版.bat”。停止后可删除整个文件夹。');
  console.log('========================================================');
  openBrowser(url);
 };
 server.once('error',onError);
 server.once('listening',onListening);
 try {server.listen(port,'127.0.0.1');}catch(e){onError(e)}
}
process.on('SIGINT',()=>{console.log('\n接收到停止指令...');exitServer()});
process.on('SIGTERM',()=>{console.log('\n接收到终止指令...');exitServer()});
try{projectStore=await ProjectStore.open()}catch(e){console.error('本机项目库初始化失败：'+e.message)}
listen(FIRST_PORT);
