'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('http'),net=require('net'),fs=require('fs'),os=require('os'),path=require('path'),EE=require('events');
const Files=require('../src/browser_files'),{RemoteControl}=require('../src/remote_control');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected file-broker event did not arrive');}
async function fixture(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-remote-files-')),browser=new EE(),calls=[];let allowed=true;
    Object.assign(browser,Files,{options:{profileRoot:root,fileRoot:path.join(root,'files')},gate:{check:()=>({allowed})},requireAllowed(){if(!allowed)throw Error('Browser hidden');},
        tabs:[{id:'tab',session:'session'}],activeTab:'tab',session:'session',pageGeneration:1,epoch:1,child:true,viewport:{width:960,height:540},text:async text=>{calls.push({method:'text',text});},
        pipe:{send:async(method,params)=>{calls.push({method,params});if(method==='DOM.describeNode')return {node:{attributes:['accept','.txt']}};
            if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame',url:'http://fixture.example/upload'}}};return {};}}});
    await browser.initializeFiles(browser.pipe);
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const remote=new RemoteControl({browser,port,host:'127.0.0.1',interfaces:()=>({test:[{family:'IPv4',address:'127.0.0.1',internal:false}]})});
    const session=await remote.start(),token=session.url.split('/r/')[1];
    function request(method,target,body,headers){return new Promise((resolve,reject)=>{
        const data=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
        const req=http.request({host:'127.0.0.1',port,path:target,method,headers:Object.assign({'Connection':'close'},data?{'Content-Length':data.length}:{},headers||{})},res=>{
            const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
        });req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('Fixture HTTP timeout')));req.end(data);
    });}
    async function chooser(){browser.fileEvent({method:'Page.fileChooserOpened',sessionId:'session',params:{backendNodeId:42,frameId:'frame',mode:'selectSingle'}});await until(()=>browser.fileStatus().chooser);return browser.fileStatus().chooser;}
    return {root,browser,calls,remote,port,token,request,chooser,headers:{'X-Remote-Token':token},setAllowed:value=>{allowed=value;},
        async close(){browser.stopFiles();remote.destroy();await turn();fs.rmSync(root,{recursive:true,force:true});}};
}
test('Actual phone HTTP transfers require authentication, stream opaque downloads and explicitly select staged upload bytes',async()=>{
    const f=await fixture(),b=f.browser;
    try{
        const chooser=await f.chooser(),content=Buffer.from('Übertragen vom Handy\n'),upload='/api/upload?chooser='+chooser.id;
        const metadata={'X-File-Name':encodeURIComponent('phone note.txt'),'Content-Type':'text/plain'};
        assert.equal((await f.request('POST',upload,content,metadata)).status,401);
        assert.equal((await f.request('POST',upload,content,Object.assign({},metadata,f.headers,{Origin:'http://other.example'}))).status,403);
        assert.equal(b.fileStatus().chooser.files.length,0);
        const uploaded=await f.request('POST',upload,content,Object.assign({},metadata,f.headers));assert.equal(uploaded.status,200);
        const file=JSON.parse(uploaded.body).file;assert.equal(file.name,'phone note.txt');assert.equal(file.size,content.length);
        assert(!uploaded.body.includes(Buffer.from(f.root)),'Private filesystem paths do not cross HTTP');
        assert(!f.calls.some(call=>call.method==='DOM.setFileInputFiles'),'Staging does not expose a file to the page');
        const selected=await f.request('POST','/api/action',{op:'chooseFiles',chooserId:chooser.id,stagedIds:[file.id]},f.headers);assert.equal(selected.status,200);
        const selection=f.calls.find(call=>call.method==='DOM.setFileInputFiles');assert(selection);assert.deepEqual(fs.readFileSync(selection.params.files[0]),content);
        const guid='12345678-1111-2222-3333-123456789012';
        b.fileEvent({method:'Browser.downloadWillBegin',params:{guid,frameId:'frame',suggestedFilename:'report.txt'}});await turn();await turn();
        fs.writeFileSync(path.join(f.root,'files/downloads',guid),'downloaded phone fixture');
        b.fileEvent({method:'Browser.downloadProgress',params:{guid,state:'completed',totalBytes:24,receivedBytes:24}});
        await until(()=>b.fileStatus().downloads.some(item=>item.state==='completed'));const download=b.fileStatus().downloads.find(item=>item.state==='completed');
        assert.equal((await f.request('GET','/api/download?id='+download.id)).status,401);
        assert.equal((await f.request('GET','/api/download?id=..%2F..%2Fetc%2Fpasswd',undefined,f.headers)).status,409);
        const received=await f.request('GET','/api/download?id='+download.id,undefined,f.headers);
        assert.equal(received.status,200);assert.equal(received.body.toString(),'downloaded phone fixture');assert.equal(received.headers['content-type'],'application/octet-stream');assert.match(received.headers['content-disposition'],/report\.txt/);
        f.setAllowed(false);assert.equal((await f.request('GET','/api/download?id='+download.id,undefined,f.headers)).status,409);
    }finally{await f.close();}
});
function partialRequest(f,target,body,headers){
    let request;const response=new Promise(resolve=>{
        request=http.request({host:'127.0.0.1',port:f.port,path:target,method:'POST',headers:Object.assign({'Connection':'close','Content-Length':body.length},headers||{})},res=>{const chunks=[];res.on('data',part=>chunks.push(part));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});
        request.on('error',error=>resolve({error:error.code||error.message}));request.setTimeout(2000,()=>request.destroy(Error('Fixture HTTP timeout')));
    });
    request.write(body.slice(0,1));return {request,response,finish:()=>request.end(body.slice(1))};
}
test('Revoking the phone session invalidates an already-authenticated partial action body',async()=>{
    const f=await fixture();
    try{
        const accepted=new Promise(resolve=>f.remote.server.once('request',resolve)),body=Buffer.from(JSON.stringify({op:'text',text:'late action'}));
        const pending=partialRequest(f,'/api/action',body,f.headers);await accepted;f.remote.stop('user');pending.finish();const result=await pending.response;
        assert(!f.calls.some(call=>call.method==='text'),'No action can finish authentication using a revoked session');
        assert(result.error||result.status===401||result.status===403||result.status===404);
    }finally{await f.close();}
});
test('Revoking the phone session aborts a partial upload before bytes become available for selection',async()=>{
    const f=await fixture();
    try{
        const chooser=await f.chooser(),body=Buffer.from('uncompleted file payload');
        const pending=partialRequest(f,'/api/upload?chooser='+chooser.id,body,Object.assign({},f.headers,{'X-File-Name':'partial.txt','Content-Type':'text/plain'}));
        await until(()=>f.browser.fileBroker.activeUploads.size===1);f.remote.stop('user');pending.finish();const result=await pending.response;await turn();
        assert.equal(f.browser.fileBroker.activeUploads.size,0);assert.equal(f.browser.fileStatus().chooser.files.length,0,'Revocation cannot stage late file bytes');
        assert(!f.calls.some(call=>call.method==='DOM.setFileInputFiles'));assert(result.error||result.status!==200);
    }finally{await f.close();}
});
