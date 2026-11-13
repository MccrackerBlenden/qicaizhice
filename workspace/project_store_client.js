/* v3.0-A: opt-in local SQLite project library. Never sends data to an external URL. */
(function(global){'use strict';
const base='/api/projects';
async function request(path,method='GET',data){
 const opts={method,credentials:'same-origin',cache:'no-store',headers:{'X-QZ-Local-Request':'1'}};
 if(data!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(data)}
 let response;
 try{response=await global.fetch(base+path,opts)}catch{throw Error('无法连接本机项目数据服务；请通过启动体验版.bat打开系统')}
 let result;try{result=await response.json()}catch{throw Error('项目数据服务返回异常，请检查本机服务')}
 if(!response.ok||!result.ok)throw Error(result.error||'项目数据服务操作失败');
 return result;
}
async function list(){return (await request('')).projects}
async function load(id){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('请选择有效的企业项目');return request('/'+id)}
async function save(archive,previous){
 await global.QZProjects.parse(JSON.stringify(archive)); // before any server-side mutation
 const data={archive,id:previous?.id||null,expected_revision:previous?.revision||null};
 return request('','POST',data);
}
async function backup(){return request('/backup','POST')}
async function status(){return request('/status')}
global.QZProjectStore={list,load,save,backup,status};
})(window);
