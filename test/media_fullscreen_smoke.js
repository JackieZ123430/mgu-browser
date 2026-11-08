'use strict';
// Real sandboxed engine, original generated moving colour fixture. Provider
// names/classes are only authored DOM fixtures; this is not a live YouTube test.
const assert=require('assert'),cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const Browser=require(process.env.MGU_BROWSER_BACKEND||'../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-fullscreen-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:root,binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',viewport:{width:1280,height:384}});
let lastFrame,frameCount=0,lastMedia;
browser.on('frame',frame=>{lastFrame=frame;frameCount++;});browser.on('media',state=>lastMedia=state);
const value=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const until=async(check,label)=>{for(let i=0;i<80;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(label);};
const coloured=frame=>{if(!frame)return false;let count=0;for(let i=0;i<frame.rgba.length;i+=4)if(Math.max(frame.rgba[i],frame.rgba[i+1],frame.rgba[i+2])-Math.min(frame.rgba[i],frame.rgba[i+1],frame.rgba[i+2])>50)count++;return count>frame.width*frame.height*0.12;};
async function moving(stage,video){
    const before=frameCount,time=await value(video+'.currentTime');
    await until(async()=>frameCount>=before+2&&lastFrame.width===browser.viewport.width&&lastFrame.height===browser.viewport.height&&coloured(lastFrame)&&await value(video+'.currentTime>'+JSON.stringify(time+0.12)),stage+': moving coloured video must survive');
    await browser.inspectMedia();await until(async()=>lastMedia&&lastMedia.playing,stage+': foreground media must remain playing');
}
(async()=>{try{
    let clip;
    if(process.env.MGU_FULLSCREEN_TEST_CLIP)clip=fs.readFileSync(process.env.MGU_FULLSCREEN_TEST_CLIP);
    else{const generated=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','8','-c:v','libvpx','-b:v','180k','-an','-f','webm','pipe:1'],{maxBuffer:3*1024*1024});assert.equal(generated.status,0,String(generated.stderr));clip=generated.stdout;}
    assert(clip.length>0&&clip.length<3*1024*1024,'Bounded original generated fixture');const source='data:video/webm;base64,'+clip.toString('base64');
    await browser.start('');
    // The zero-height intermediate wrapper is legal player layout: its video
    // has explicit dimensions. Old global 100%/absolute fit made it height 0.
    const fixture='<style>body{margin:0;background:#000}#movie_player{position:relative;width:640px;height:360px;background:#000}.html5-video-container{position:absolute;left:0;top:0;width:100%;height:0}video{position:relative;width:640px;height:360px}#movie_player:fullscreen video{width:100vw;height:100vh}button{position:absolute;z-index:2;bottom:5px;right:5px}.play{right:140px}</style><div id=prefix></div><div id=movie_player class=html5-video-player><div class=html5-video-container><video id=video loop muted></video></div><button class=play>Play</button><button class=ytp-fullscreen-button>Full screen</button></div>';
    await value('document.body.innerHTML='+JSON.stringify(fixture)+';prefix.innerHTML="<span></span>".repeat(7000);video.src='+JSON.stringify(source)+';window.nativeFullscreenClicks=0;document.querySelector(".ytp-fullscreen-button").onclick=()=>{window.nativeFullscreenClicks++;movie_player.requestFullscreen();};true');
    await browser.mediaAction('play');await moving('large DOM inline','video');
    await browser.mediaAction('fullscreen');assert.equal(await value('nativeFullscreenClicks'),1,'Browser uses site fullscreen control');assert.equal(await value('document.fullscreenElement.id'),'movie_player');
    await browser.resize(1280,480);await moving('site fullscreen resize','video');
    assert.equal(await value('Math.round(video.getBoundingClientRect().height)'),480,'Nested video keeps the provider viewport geometry');
    assert(lastMedia.fullscreen,'Frontend receives real fullscreen state');assert(lastMedia.hasSiteControls,'Site player controls remain available');
    const screenshot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/mgu-browser-fullscreen-regression.png',Buffer.from(screenshot.data,'base64'));
    await browser.mediaAction('exit');await browser.resize(1280,384);await moving('fullscreen exit','video');assert.equal(await value('!!document.fullscreenElement'),false);
    // Direct website interaction takes exactly the same native player path.
    const button=JSON.parse(await value('JSON.stringify((()=>{const r=document.querySelector(".ytp-fullscreen-button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())'));
    await browser.tap(button.x,button.y);await until(async()=>await value('!!document.fullscreenElement'),'Site fullscreen click');await browser.resize(1280,480);await moving('direct site fullscreen','video');assert.equal(await value('nativeFullscreenClicks'),2);
    await browser.mediaAction('exit');await browser.resize(1280,384);
    // Same-origin iframe fullscreen has an outer iframe and inner fullscreen
    // player; inspectMedia must reach the actual media rather than an empty box.
    await value('document.body.innerHTML="<iframe id=frame allowfullscreen style=width:1000px;height:360px></iframe>";frame.contentDocument.body.innerHTML="<video id=inner muted loop style=width:640px;height:360px></video>";window.frameVideo=frame.contentDocument.querySelector("video");frameVideo.src='+JSON.stringify(source)+';true');
    await browser.mediaAction('play');await browser.mediaAction('fullscreen');await browser.resize(1280,480);await moving('same origin frame fullscreen','frameVideo');assert(lastMedia.fullscreen);await browser.mediaAction('exit');
    // Open shadow component retains its native video and button layout.
    await value('document.body.innerHTML="<div id=host></div>";host.style.cssText="display:block;width:900px;height:480px";const shadow=host.attachShadow({mode:"open"});shadow.innerHTML="<style>video{width:640px;height:360px}:host(:fullscreen) video{width:100vw;height:100vh}</style><video muted loop></video><button>Play</button><button>Full screen</button>";window.shadowVideo=shadow.querySelector("video");shadowVideo.src='+JSON.stringify(source)+';true');
    await browser.mediaAction('play');await browser.mediaAction('fullscreen');await moving('open shadow fullscreen','shadowVideo');assert(lastMedia.fullscreen);await browser.mediaAction('exit');
    // A merged controller packet represents every physical detent, including
    // when the page has no selected media control yet. Press must hit that item.
    await value('document.body.innerHTML="<div id=movie_player><video muted loop style=width:640px;height:360px></video></div>";movie_player.querySelector("video").src='+JSON.stringify(source)+';window.pressedControl=-1;for(let i=0;i<18;i++){const button=document.createElement("button");button.id="control"+i;button.textContent="Control "+i;button.style.cssText="position:static";button.onclick=()=>window.pressedControl=i;movie_player.appendChild(button);}true');
    await browser.mediaAction('play');
    for(const entry of [[16,15],[-16,2]]){
        await value('if(document.activeElement)document.activeElement.blur();document.querySelectorAll("[data-mgu-media-focus]").forEach(e=>e.removeAttribute("data-mgu-media-focus"));window.pressedControl=-1;true');
        await browser.focusMediaControl(entry[0]);assert.equal(await value('document.querySelector("[data-mgu-media-focus]").id'),'control'+entry[1]);
        await browser.pressMediaControl();assert.equal(await value('window.pressedControl'),entry[1],'Merged rotary selection and press stay aligned');
    }
    await value('(()=>{document.body.innerHTML="";const host=document.createElement("disney-web-player");host.style.cssText="display:block;width:100vw;height:100vh";document.body.appendChild(host);const shadow=host.attachShadow({mode:"closed"});window.closedPressed=-1;for(let i=0;i<18;i++){const button=document.createElement("button");button.textContent="Play "+i;button.style.cssText="position:absolute;top:20px;left:"+(i*65)+"px";button.onclick=()=>window.closedPressed=i;shadow.appendChild(button);}return true;})()');
    for(const entry of [[16,15],[-16,2]]){
        browser.focusedMediaControl=null;
        await browser.focusMediaControl(entry[0]);assert.equal(browser.focusedMediaControl.name,'Play '+entry[1]);
        await browser.pressMediaControl();assert.equal(await value('window.closedPressed'),entry[1],'Closed player AX selection preserves merged rotary steps');
    }
    // Fullscreen is also a normal page API for charts, images and games.
    // Its state must not depend on finding an HTML media player.
    const beforeChart=frameCount;
    await value('document.body.innerHTML="<div id=chart style=width:100vw;height:100vh;background:royalblue><label>Chart value<input id=chartValue></label><button id=chartApply>Apply</button></div>";window.chartApplied=0;chartApply.onclick=()=>window.chartApplied++;chart.requestFullscreen()');
    await browser.resize(1280,480);await browser.inspectMedia();
    await until(async()=>{await browser.inspectMedia();return lastMedia&&lastMedia.fullscreen&&!lastMedia.playerMode&&!lastMedia.hasMedia;},'Non-video fullscreen is reported as generic page state');
    await until(async()=>{if(frameCount<=beforeChart||!lastFrame||lastFrame.width!==1280||lastFrame.height!==480)return false;const offset=(240*1280+640)*4;return lastFrame.rgba[offset+2]>160&&lastFrame.rgba[offset+2]>lastFrame.rgba[offset]+50;},'Chart fullscreen has a fresh blue projected image');
    const input=JSON.parse(await value('JSON.stringify((()=>{const r=chartValue.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())'));
    await browser.tap(input.x,input.y);await browser.text('chart input');assert.equal(await value('chartValue.value'),'chart input');
    await browser.focusPage(1);await browser.pressPage();assert.equal(await value('window.chartApplied'),1,'Generic fullscreen keeps ordinary page focus and activation');
    await browser.mediaAction('exit');await until(async()=>{await browser.inspectMedia();return lastMedia&&!lastMedia.fullscreen;},'Generic fullscreen exits normally');
    console.log('Real Chromium fullscreen: large DOM selection, native site button + browser action, nested zero-height wrapper geometry, physical resize/exit, moving nonblack projected colour frames, iframe/shadow media state, retained site controls, merged rotary DOM/closed-shadow AX selection + press, and interactive generic chart fullscreen passed. Live YouTube and vehicle speakers are not qualified.');
}finally{browser.destroy();await browser.closing;const remove=p=>{const stat=fs.lstatSync(p);if(stat.isDirectory()&&!stat.isSymbolicLink()){for(const name of fs.readdirSync(p))remove(path.join(p,name));fs.rmdirSync(p);}else fs.unlinkSync(p);};remove(root);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
