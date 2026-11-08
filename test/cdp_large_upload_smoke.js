'use strict';
// Authored loopback uploads only. Hash native HTTP bodies at the server; CDP
// copies are discarded by the transport, never substituted into the request.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto'),cp=require('child_process');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(path.join(backend,'browser_session'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-large-upload-')),browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:root+'/profiles',viewport:{width:960,height:540}});
const sockets=new Set(),errors=[],posts=[],pattern=Buffer.alloc(65536),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));for(let i=0;i<pattern.length;i++)pattern[i]=i&255;
function expected(bytes){const h=crypto.createHash('sha256');for(let at=0;at<bytes;at+=pattern.length)h.update(pattern.slice(0,Math.min(pattern.length,bytes-at)));return h.digest('hex');}
let frames=0,active=false,heartbeat=Date.now(),gap=0,timer;
browser.on('frame',()=>frames++);browser.on('fault',e=>errors.push(e.message));
const server=http.createServer((request,response)=>{
    response.setHeader('Connection','close');
    if(request.method!=='POST'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Native large upload</title><canvas width="320" height="160"></canvas><script>let n=0,c=document.querySelector("canvas").getContext("2d");setInterval(()=>{c.fillStyle="hsl("+(n++%360)+",70%,40%)";c.fillRect(0,0,320,160);},40);</script>');return;}
    const multipart=request.url==='/multipart',bytes=multipart?16*1024*1024:15*1024*1024,hash=crypto.createHash('sha256'),began=Date.now();let size=0,header=Buffer.alloc(0),footer=Buffer.alloc(0),ready=!multipart,failed='';
    const boundary=multipart&&/boundary=([^;]+)/.exec(request.headers['content-type']||'');if(multipart&&!boundary)failed='Multipart boundary missing';
    function consume(data){
        if(failed)return;
        if(!ready){header=Buffer.concat([header,data]);const split=header.indexOf('\r\n\r\n');if(split<0){if(header.length>4096)failed='Multipart headers exceeded bound';return;}
            const text=header.slice(0,split).toString();if(!text.includes('name="file"')||!text.includes('filename="fixture.bin"')||!text.includes('Content-Type: application/octet-stream'))failed='Unexpected multipart file headers';data=header.slice(split+4);header=Buffer.alloc(0);ready=true;}
        const take=Math.min(bytes-size,data.length);if(take>0){hash.update(data.slice(0,take));size+=take;}
        if(take<data.length){footer=Buffer.concat([footer,data.slice(take)]);if(footer.length>1024)failed='Upload exceeded expected byte count';}
    }
    request.on('data',data=>{try{consume(data);}catch(e){failed=e.message;}});
    request.on('end',()=>{const digest=hash.digest('hex');if(multipart&&boundary&&footer.toString()!=='\r\n--'+boundary[1]+'--\r\n'&&footer.toString()!=='\r\n--'+boundary[1]+'--')failed='Unexpected multipart closing boundary';if(size!==bytes||digest!==expected(bytes))failed='Native upload bytes or hash changed';
        const result={bytes:size,sha256:digest,multipart};posts.push(result);response.setHeader('Content-Type','application/json');if(failed){errors.push(failed);response.statusCode=500;}setTimeout(()=>response.end(JSON.stringify(result)),Math.max(0,350-(Date.now()-began)));});
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
async function value(expression){const result=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},20000);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function upload(multipart){const bytes=(multipart?16:15)*1024*1024,before=frames;active=true;const result=await value('(async()=>{const data=new Uint8Array('+bytes+');for(let i=0;i<data.length;i++)data[i]=i&255;let body=data;'+(multipart?'body=new FormData();body.append("file",new Blob([data],{type:"application/octet-stream"}),"fixture.bin");':'')+'const r=await fetch("/'+(multipart?'multipart':'raw')+'",{method:"POST",body});if(!r.ok)throw Error("Fixture upload failed");return r.json();})()');active=false;assert.equal(result.bytes,bytes);assert.equal(result.sha256,expected(bytes));assert(frames>before,'Projected frames continue during a large native upload');return{bytes,sha256:result.sha256,frames:frames-before};}
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await browser.start('http://127.0.0.1:'+server.address().port+'/');await pause(150);
    assert.equal(browser.pipe.maxBytes,12*1024*1024,'The transport packet limit is unchanged');
    let requestEvents=0;browser.pipe.on('event',event=>{if(['Fetch.requestPaused','Fetch.authRequired','Network.requestWillBeSent'].includes(event.method)&&event.params.request&&event.params.request.method==='POST'){requestEvents++;assert(!Object.prototype.hasOwnProperty.call(event.params.request,'postData'));assert(!Object.prototype.hasOwnProperty.call(event.params.request,'postDataEntries'));assert(event.params.request.url.includes('/raw')||event.params.request.url.includes('/multipart'));}});
    timer=setInterval(()=>{const now=Date.now();if(active)gap=Math.max(gap,now-heartbeat);heartbeat=now;},25);
    const raw=await upload(false),multipart=await upload(true);assert.equal(posts.length,2);assert(requestEvents>=2);assert(gap<1500,'The protocol pump remains responsive');assert.equal(browser.pipe.closed,false);assert.deepEqual(errors,[]);
    console.log('CDP_LARGE_UPLOAD_RESULT '+JSON.stringify({success:true,codec:browser.performance.codec,raw,multipart,requestEvents,bodyFieldsAbsent:true,maxPacketBytes:browser.pipe.maxBytes,maxHeartbeatGapMs:gap,sandbox:true,tlsVerification:true}));
}finally{clearInterval(timer);browser.destroy();await browser.closing;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
