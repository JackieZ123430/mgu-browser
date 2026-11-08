'use strict';
// Real native HTTP auth with a 15 MiB upload. Server byte/hash checks prove
// stripping CDP body copies never changes Chromium's original HTTP request.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process');
const Browser=require(path.join(process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),'browser_session'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-auth-large-')),browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:root,viewport:{width:960,height:540}});
const SIZE=15*1024*1024,records=[],errors=[];let authPrompts=0,frames=0,maxHeartbeatGap=0,lastBeat=Date.now(),pending=false,framesDuring=0;
const expected=crypto.createHash('sha256');for(let i=0;i<SIZE/65536;i++)expected.update(Buffer.alloc(65536,120));const digest=expected.digest('hex');
const heartbeat=setInterval(()=>{const now=Date.now();maxHeartbeatGap=Math.max(maxHeartbeatGap,now-lastBeat);lastBeat=now;},20);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
browser.on('frame',()=>{frames++;if(pending)framesDuring++;});browser.on('fault',e=>errors.push(e.message));
browser.on('auth',state=>{if(state&&!state.busy){authPrompts++;browser.authReply(state.id,{username:'owned-large-user',password:'owned-large-fixture'}).catch(e=>errors.push(e.message));}});
const site=http.createServer((request,response)=>{
 if(request.url==='/upload'){
  let bytes=0;const hash=crypto.createHash('sha256');request.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);});request.on('end',()=>{const accepted=request.headers.authorization==='Basic '+Buffer.from('owned-large-user:owned-large-fixture').toString('base64');records.push({bytes,hash:hash.digest('hex'),accepted});if(!accepted){response.writeHead(401,{'WWW-Authenticate':'Basic realm="Owned large POST"'});response.end('Owned authentication required');}else setTimeout(()=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({bytes}));},350);});return;
 }
 response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><title>Owned large authenticated POST</title><canvas id=c width=960 height=540></canvas><script>const g=c.getContext("2d");let i=0;setInterval(()=>{g.fillStyle="hsl("+(i++%360)+",80%,50%)";g.fillRect(0,0,c.width,c.height)},40)</script>');
});
(async()=>{try{await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));await browser.start('http://127.0.0.1:'+site.address().port);await delay(250);const before=frames,began=Date.now();pending=true;
 const result=await browser.send('Runtime.evaluate',{expression:'fetch("/upload",{method:"POST",headers:{"Content-Type":"text/plain"},body:"x".repeat('+SIZE+')}).then(async r=>({status:r.status,data:await r.json()}))',awaitPromise:true,returnByValue:true,userGesture:true},45000);pending=false;
 assert(!result.exceptionDetails);assert.equal(result.result.value.status,200);assert.equal(result.result.value.data.bytes,SIZE);assert.equal(authPrompts,1);assert.equal(records.length,2);assert(records.every(record=>record.bytes===SIZE&&record.hash===digest));assert.equal(records[0].accepted,false);assert.equal(records[1].accepted,true);assert(frames>before&&framesDuring>0,'Projected frames continue during the authenticated transfer');assert.deepEqual(errors,[]);
 console.log('BROWSER_AUTH_UPLOAD_RESULT '+JSON.stringify({success:true,codec:browser.performance.codec,postBytes:SIZE,requests:records.length,allBodyHashesMatch:true,authPrompts,framesBefore:before,framesDuring,wallMs:Date.now()-began,maxHeartbeatGapMs:maxHeartbeatGap,sandbox:true,tlsVerification:true}));
}catch(error){console.error(JSON.stringify({success:false,error:error.message,authPrompts,receivedRequests:records.length,errors}));process.exitCode=1;}finally{clearInterval(heartbeat);browser.destroy();await browser.closing;await new Promise(resolve=>site.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})();
