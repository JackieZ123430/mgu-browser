'use strict';
// Optional reproducible benchmark; requires ffmpeg and sandboxed Chromium.
// Generates original VP8 video and transfers real RGBA frames over a local
// Unix socket. No accounts, network media or vehicle connection are used.
// Compare CPU work at equal receiver capacity; this is not a headunit FPS claim.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),net=require('net');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=path.resolve(__dirname,'..'),Browser=require(root+'/src/browser_session'),Channel=require(root+'/src/ipc_protocol'),FrameDelta=require(root+'/src/frame_delta');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-render-pressure-'));
const value=async(b,expression)=>{const r=await b.send('Runtime.evaluate',{expression,awaitPromise:true,userGesture:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const clip=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=960x540:rate=30','-t','12','-an','-c:v','libvpx','-b:v','1200k','-f','webm','pipe:1'],{maxBuffer:5*1024*1024});if(clip.status)throw Error(String(clip.stderr));
async function run(mode){
 let owner,received=0,sent=0,dropped=0,maxPending=0;
 const socketPath=temp+'/'+mode+'.sock',server=net.createServer(s=>{owner=new Channel(s);owner.frameProtocol=2;});
 await new Promise(r=>server.listen(socketPath,r));const reader=net.createConnection(socketPath);await new Promise(r=>reader.once('connect',r));reader.on('data',b=>received+=b.length);
 const sender=FrameDelta.sender({owner:()=>owner,allowed:()=>true,generation:()=>1});
 const browser=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:temp+'/'+mode,gate:{check:()=>({allowed:true})},viewport:{width:1280,height:384},frameReady:mode==='deferred'?()=>sender.canSend():undefined});
 browser.on('frame',f=>{if(sender.send(f))sent++;else dropped++;maxPending=Math.max(maxPending,owner.pending());});
 browser.on('fault',e=>console.error(e.message));
 try{
  await browser.start('');await value(browser,'document.body.style.cssText="margin:0;background:black";document.body.innerHTML="<video id=v loop muted style=width:100vw;height:100vh;object-fit:contain></video>";v.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";v.play().then(()=>true)');
  await pause(1000);reader.pause();let step=0;
  const timer=setInterval(()=>{step=(step+1)%10;if(step===0)reader.pause();if(step===7)reader.resume();},100);
  const before=Object.assign({},browser.performance),cpu=process.cpuUsage(),start=Date.now(),sent0=sent,dropped0=dropped,received0=received;
  await pause(8000);clearInterval(timer);reader.resume();await pause(50);
  const used=process.cpuUsage(cpu),result={mode,codec:browser.performance.codec,wallMs:Date.now()-start,nodeCpuMs:(used.user+used.system)/1000,decodedFrames:browser.performance.frames-before.frames,decodeMs:browser.performance.decodeMs-before.decodeMs,sentFrames:sent-sent0,droppedAfterDecode:dropped-dropped0,receivedBytes:received-received0,maxPendingBytes:maxPending};
  return result;
 }finally{browser.destroy();await browser.closing;reader.destroy();if(owner)owner.socket.destroy();await new Promise(r=>server.close(r));}
}
(async()=>{try{console.log(JSON.stringify({test:'Real 30fps VP8 video, 1280x384 Chromium screencast and Unix RGBA IPC, receiver paused 70% of every second',baseline:await run('baseline'),deferred:await run('deferred')},null,2));}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
