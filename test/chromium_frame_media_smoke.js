'use strict';
// Real cross-origin embedded renderer, original VP8/Opus and private ALSA sink.
// No external providers, accounts, protected media, device or permission grants.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),cp=require('child_process'),assert=require('assert');
const Browser=process.env.MGU_BROWSER_BACKEND?require(path.join(process.env.MGU_BROWSER_BACKEND,'browser_session')):require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-frame-media-')),sink=path.join(root,'audio.raw'),config=path.join(root,'alsa.conf'),helper=process.env.MGU_AUDIO_BRIDGE||path.join(root,'audio-bridge');
if(!process.env.MGU_AUDIO_BRIDGE)cp.execFileSync('gcc',['-O2','-Wall','-Wextra','-Werror','-Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2','-Wl,--wrap=__libc_start_main',path.join(__dirname,'../native/audio_bridge.c'),'-Wl,--no-as-needed','-l:libdl.so.2','-Wl,--as-needed','-o',helper]);
fs.writeFileSync(config,'pcm.null { type null }\npcm.fixture { type file slave.pcm null file "'+sink+'" format raw }\n');
const loader=process.env.MGU_AUDIO_LOADER||['/lib64/ld-linux-x86-64.so.2','/lib/ld-linux-x86-64.so.2'].find(file=>fs.existsSync(file));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(root,'profiles'),viewport:{width:960,height:540},vehicleAudio:{binary:helper,loader,gid:process.getgid(),owner:process.getuid(),fixture:{device:'fixture'},helperEnv:Object.assign({ALSA_CONFIG_PATH:config},process.env.MGU_AUDIO_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.MGU_AUDIO_LIBRARY_PATH}:{})}});
let media={},frames=0,visible=0,diagnostics='';const servers=[],sockets=new Set(),stages=[];
browser.on('media',state=>{media=state;});browser.on('diagnostic',value=>{diagnostics=(diagnostics+'\n'+value).slice(-8192);});
browser.on('frame',frame=>{frames++;let count=0;for(let y=2;y<14;y++)for(let x=2;x<14;x++){const at=(Math.floor(frame.height*y/16)*frame.width+Math.floor(frame.width*x/16))*4;if(frame.rgba[at]+frame.rgba[at+1]+frame.rgba[at+2]>80)count++;}if(count>25)visible=frames;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await delay(80);}throw Error(label);}
async function listen(server){servers.push(server);server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));}
async function evaluate(session,expression){const reply=await browser.pipe.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},session,1500);if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails));return reply.result.value;}
let owner,mainTab;
function current(){const frame=browser.relatedFrames(owner).find(item=>item.mainSession===owner);assert(frame,'Verified persistent embedded session required');return frame;}
async function child(expression){const frame=current(),result=await evaluate(frame.session,expression);assert(browser.mediaFrameValid(frame),'Embedded document must stay current');return result;}
async function sync(playing,audible,label){await until(async()=>{await browser.inspectMedia();return media.playing===playing&&media.audible===audible&&!media.activityUnknown;},label+': fresh embedded activity');await browser.audioRoute(media.audible);assert.equal(browser.audioStatus().routeAvailable,audible);}
async function continuity(stage,background){
    const began=Date.now(),before=await child('video.currentTime'),duration=await child('video.duration'),offset=fs.existsSync(sink)?fs.statSync(sink).size:0,frame=frames;
    await delay(700);await browser.inspectMedia();const after=await child('video.currentTime'),advance=after>=before?after-before:after+duration-before,pcm=fs.readFileSync(sink).slice(offset);
    assert(advance>.25,stage+': video clock advances');assert(pcm.length>=48000&&pcm.some(byte=>byte!==0),stage+': actual nonzero native soundtrack');assert.equal(media.audible,true,stage+': owned output remains desired');
    if(!background)await until(()=>visible>frame,stage+': fresh nonblack projected picture');
    stages.push({stage,wallMs:Date.now()-began,clockAdvance:advance,pcmBytes:pcm.length,projected:!background});
}
(async()=>{try{
    const clip=process.env.MGU_FULLSCREEN_TEST_CLIP?fs.readFileSync(process.env.MGU_FULLSCREEN_TEST_CLIP):cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-b:v','180k','-c:a','libopus','-b:a','48k','-f','webm','pipe:1']);
    assert(clip.length>0&&clip.length<3*1024*1024);
    const childPort=await listen(http.createServer((request,response)=>{
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Connection':'close'});
        if(request.url==='/empty'){response.end('<title>Empty embedded page</title><h1>Embedded navigation completed</h1>');return;}
        response.end('<!doctype html><title>Embedded original media</title><style>body{margin:0;background:black}#movie_player{width:100vw;height:100vh;position:relative}video{width:100%;height:100%;object-fit:contain}button{position:absolute;top:12px;z-index:2}#play{left:12px}.ytp-fullscreen-button{left:180px}</style><div id=movie_player class=html5-video-player><video id=video loop src="data:video/webm;base64,'+clip.toString('base64')+'"></video><button id=play>Play</button><button class=ytp-fullscreen-button>Full screen</button></div><script>window.controlClicks=0;video.volume=.2;play.onclick=()=>{window.controlClicks++;video.paused?video.play():video.pause()};document.querySelector(".ytp-fullscreen-button").onclick=()=>movie_player.requestFullscreen();</script>');
    }));
    const port=await listen(http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Connection':'close'});response.end('<!doctype html><title>Cross-origin parent</title><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe allowfullscreen allow="autoplay; fullscreen" src="http://localhost:'+childPort+'/clip"></iframe>');}));
    await browser.start('');owner=browser.session;mainTab=browser.activeTab;
    await browser.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
    await until(async()=>{try{return browser.relatedFrames(owner).length>0&&await child('!!document.getElementById("video")');}catch(ignore){return false;}},'Verified cross-origin frame loads');
    assert.equal(await evaluate(owner,'document.querySelector("iframe").contentDocument===null'),true,'The parent cannot read the child DOM');
    await child('video.play()');await sync(true,true,'cross-origin inline');await continuity('cross-origin-inline');
    await browser.mediaAction('fullscreen');await until(async()=>{await browser.inspectMedia();return media.fullscreen&&media.playerMode&&browser.activeMediaFrame&&browser.activeMediaFrame.session===current().session;},'Cross-origin native fullscreen delegates its own player');
    await browser.resize(1280,480);await continuity('cross-origin-fullscreen');
    await browser.mediaAction('mute');await sync(true,false,'cross-origin muted');const muted=fs.statSync(sink).size;await delay(200);assert.equal(fs.statSync(sink).size,muted);
    await browser.mediaAction('unmute');await sync(true,true,'cross-origin unmuted');await continuity('cross-origin-unmuted');
    await child('if(document.activeElement)document.activeElement.blur();document.querySelectorAll("[data-mgu-media-focus]").forEach(element=>element.removeAttribute("data-mgu-media-focus"));true');
    await browser.focusMediaControl(1);assert.equal(await child('document.querySelector("[data-mgu-media-focus]").id'),'play','Controller focus is inside the actual embedded player');
    await browser.pressMediaControl();assert.equal(await child('window.controlClicks'),1,'Controller targets the embedded player control');await sync(false,false,'Cross-origin controller pause');
    await browser.mediaAction('play');await sync(true,true,'cross-origin resumed');await continuity('cross-origin-resumed');
    await browser.mediaAction('exit');await until(async()=>{await browser.inspectMedia();return !media.fullscreen;},'Parent fullscreen exits');
    await child('window.video=document.getElementById("video");video.remove();document.body.innerHTML="<disney-web-player id=component style=display:block;width:100vw;height:100vh></disney-web-player>";const closed=component.attachShadow({mode:"closed"});video.style.cssText="width:100%;height:100%;object-fit:contain";closed.appendChild(video);window.closedClicks=0;for(let i=0;i<2;i++){const button=document.createElement("button");button.textContent=i?"Full screen":"Pause";button.style.cssText="position:absolute;top:12px;left:"+(12+i*180)+"px";button.onclick=i?()=>document.exitFullscreen():()=>{window.closedClicks++;video.paused?video.play():video.pause()};closed.appendChild(button);}video.play();component.requestFullscreen()');
    await until(async()=>{await browser.inspectMedia();return media.fullscreen&&media.playerMode&&media.customPlayer&&media.hasSiteControls;},'Closed embedded player exposes native accessible controls');
    await sync(true,true,'closed embedded playing');await continuity('cross-origin-closed-shadow');assert.equal(await child('component.shadowRoot===null'),true);
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await child('window.closedClicks'),1,'Accessible media press stays in the verified embedded session');await sync(false,false,'closed embedded AX pause');
    await browser.pressMediaControl();await sync(true,true,'closed embedded AX resume');await continuity('cross-origin-closed-resumed');
    await browser.mediaAction('exit');await until(async()=>{await browser.inspectMedia();return !media.fullscreen;},'Closed embedded fullscreen exits');
    await browser.newTab('');await sync(true,true,'background embedded audio');await continuity('background-embedded-audio',true);
    await child('video.pause();true');await sync(false,false,'background embedded pause');await child('video.play()');await sync(true,true,'background embedded resume');
    const old=current();await child('location.href="/empty";true');await until(async()=>{try{return !browser.mediaFrameValid(old)&&await child('document.title==="Empty embedded page"');}catch(ignore){return false;}},'Embedded navigation invalidates old owner generation');
    await sync(false,false,'navigated embedded silence');assert(!browser.mediaFrameCache.has(old.session)||browser.mediaFrameCache.get(old.session).frame.generation!==old.generation,'Old audibility is not cached as fresh evidence');
    await browser.closeTab(mainTab);await until(()=>!browser.tabs.some(tab=>tab.id===mainTab),'Embedded owner tab closes');await sync(false,false,'closed embedded owner');
    assert(Array.from(browser.mediaFrameCache.values()).every(record=>record.frame.mainSession!==owner),'Closed owner releases embedded media cache');
    console.log('BROWSER_FRAME_MEDIA_RESULT '+JSON.stringify({success:true,sandbox:true,codec:browser.performance.codec,crossOrigin:true,persistentVerifiedSession:true,ownMutePauseFlags:true,childFullscreenControls:true,navigationRetired:true,tabSwitchAudio:true,stages}));
}finally{browser.destroy();await browser.closing;for(const socket of sockets)socket.destroy();await Promise.all(servers.filter(server=>server.listening).map(server=>new Promise(resolve=>server.close(resolve))));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);console.error('Fixture diagnostics:'+diagnostics);process.exitCode=1;});
