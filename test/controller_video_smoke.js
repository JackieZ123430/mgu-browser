'use strict';
// Real Chromium + Unix IPC controller latency while original 30 fps VP8 video
// plays. No accounts, network video, BMW SDK or vehicle services are involved.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),net=require('net'),assert=require('assert');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src');
const Browser=require(backend+'/browser_session'),Client=require(backend+'/browser_client'),Channel=require(backend+'/ipc_protocol');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-controller-video-')),pause=ms=>new Promise(r=>setTimeout(r,ms));
function remove(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isDirectory()&&!stat.isSymbolicLink())remove(file);else fs.unlinkSync(file);}fs.rmdirSync(dir);}
const browser=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:temp+'/profiles',gate:{check:()=>({allowed:true})},viewport:{width:1280,height:384}});
const sockets=new Set();let focusRequests=0,client;
const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));const channel=new Channel(socket);channel.json({event:'ready'});channel.on('json',async message=>{if(message.op==='state')return;try{let result;if(message.op==='mediaFocus'){focusRequests++;result=await browser.focusMediaControl(message.delta);}else if(message.op==='mediaPress')result=await browser.pressMediaControl();else throw Error('Unexpected fixture operation');channel.json({id:message.id,result:result||{}});}catch(e){channel.json({id:message.id,error:e.message});}});});
const value=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,userGesture:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function run(mode){
 client.cancelController();await value('document.querySelectorAll("[data-mgu-media-focus]").forEach(e=>e.removeAttribute("data-mgu-media-focus"));if(document.activeElement)document.activeElement.blur();window.clicked="";true');
 const videoBefore=JSON.parse(await value('JSON.stringify({time:video.currentTime,decoded:video.getVideoPlaybackQuality().totalVideoFrames})'));
 const before=focusRequests,start=process.hrtime(),work=[];
 for(let i=0;i<16;i++)work.push(mode==='raw'?client.request('mediaFocus',{delta:1}):client.focusMedia(1));
 work.push(mode==='raw'?client.request('mediaPress'):client.pressMedia());await Promise.all(work);
 const elapsed=process.hrtime(start),selected=await value('window.clicked');assert.equal(selected,'control15','Press must activate the final selection made by all16 detents');
 let videoAfter;for(let i=0;i<30;i++){videoAfter=JSON.parse(await value('JSON.stringify({time:video.currentTime,decoded:video.getVideoPlaybackQuality().totalVideoFrames})'));if(videoAfter.time!==videoBefore.time&&videoAfter.decoded>videoBefore.decoded)break;await pause(20);}
 assert(videoAfter.time!==videoBefore.time&&videoAfter.decoded>videoBefore.decoded,'Video must continue decoding through controller activation');
 return {mode,focusRequests:focusRequests-before,burstToActivationMs:elapsed[0]*1000+elapsed[1]/1e6,activated:selected,videoBefore,videoAfter};
}
(async()=>{try{
 const clip=process.env.MGU_FULLSCREEN_TEST_CLIP?{status:0,stdout:fs.readFileSync(process.env.MGU_FULLSCREEN_TEST_CLIP)}:cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','3','-an','-c:v','libvpx','-b:v','700k','-f','webm','pipe:1'],{maxBuffer:2*1024*1024});assert.equal(clip.status,0,String(clip.stderr));
 await browser.start('');await value('document.body.style.cssText="margin:0;background:black";document.body.innerHTML="<div id=player><video id=video muted loop style=width:100vw;height:300px;object-fit:contain></video><div id=controls></div></div>";for(let i=0;i<20;i++){const b=document.createElement("button");b.id="control"+i;b.textContent="Play "+i;b.onclick=()=>window.clicked=b.id;controls.appendChild(b);}video.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";video.play().then(()=>true)');
 await pause(500);await new Promise(r=>server.listen(temp+'/control.sock',r));client=new Client({gate:{check:()=>({allowed:true})},socketPath:temp+'/control.sock'});await new Promise(r=>client.once('ready',r));
 const raw=await run('raw'),coalesced=await run('coalesced'),video=JSON.parse(await value('JSON.stringify({time:video.currentTime,decoded:video.getVideoPlaybackQuality().totalVideoFrames})'));
 assert.equal(raw.focusRequests,16);assert.equal(coalesced.focusRequests,1);assert(video.time>0&&video.decoded>0,'Video must actually decode while controller operations run');
 console.log('CONTROLLER_VIDEO_RESULT '+JSON.stringify({test:'Real Chromium 30fps VP8 + Unix IPC,16 detents then press, no debounce',codec:browser.performance.codec,raw,coalesced,video}));
}finally{if(client)client.destroy();for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(r=>server.close(r));browser.destroy();await browser.closing;remove(temp);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
