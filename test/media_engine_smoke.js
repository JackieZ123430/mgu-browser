'use strict';
// Real sandboxed Chromium; original generated VP8/Opus fixture, no accounts/network.
const assert=require('assert'),cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw new Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-media-engine-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:root,binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',viewport:{width:960,height:540},mediaDisabled:false});
const value=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const until=async(check,label)=>{for(let i=0;i<60;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error(label);};
(async()=>{try{
    const clip=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-b:v','80k','-c:a','libopus','-b:a','32k','-f','webm','pipe:1'],{maxBuffer:2*1024*1024});
    assert.equal(clip.status,0,'ffmpeg VP8/Opus fixture generation: '+String(clip.stderr));
    await browser.start('');
    await value('document.body.innerHTML="<video id=video muted loop style=width:100%;height:80vh></video>";const v=document.getElementById("video");v.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";v.muted=true;true');
    await browser.mediaAction('play');
    await until(async()=>await value('video.currentTime>0.1&&video.videoWidth===320'),'VP8 video must decode and advance');
    await browser.mediaAction('pause');assert(await value('video.paused'),'Inline pause works outside fullscreen');
    await browser.mediaAction('forward');assert(await value('video.currentTime>9'),'Inline forward seeks 10 seconds');
    await browser.mediaAction('back');assert(await value('video.currentTime<1'),'Inline rewind seeks 10 seconds');
    await browser.mediaAction('unmute');assert.equal(await value('video.muted'),false);
    await browser.mediaAction('mute');assert.equal(await value('video.muted'),true);
    await browser.mediaAction('fullscreen');assert(await value('document.fullscreenElement===video'));
    const fit=JSON.parse(await value('JSON.stringify({fit:getComputedStyle(video).objectFit,width:video.getBoundingClientRect().width,height:video.getBoundingClientRect().height})'));
    assert.equal(fit.fit,'contain');assert.equal(fit.width,960);assert.equal(fit.height,540);
    await browser.mediaAction('exit');assert.equal(await value('!!document.fullscreenElement'),false);
    // Native video controls must remain keyboard-selectable inside a wrapper.
    await value('video.controls=true;true');await browser.focusMediaControl(1);await browser.pressMediaControl();await until(async()=>await value('!video.paused'),'Native play control activates');await browser.mediaAction('pause');await browser.focusMediaControl(2);
    await value('const selectedVideo=document.getElementById("video");selectedVideo.controls=false;const host=document.createElement("div");host.id="player";selectedVideo.replaceWith(host);host.appendChild(selectedVideo);host.insertAdjacentHTML("beforeend",\'<button hidden>Hidden</button><button aria-disabled="true">Disabled</button><button id="play">Play</button><input id="range" type="range" min="0" max="10" value="2"><button id="back">Back</button>\');window.clicks=0;play.onclick=()=>window.clicks++;play.onfocus=()=>back.focus();true');
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await value('window.clicks'),1,'Selected media button survives DOM refocus and skips unavailable controls');
    await value('play.hidden=true;true');await assert.rejects(()=>browser.pressMediaControl(),/auswählen/);assert.equal(await value('window.clicks'),1,'Hiding the selected control cannot activate the refocused button');await value('play.hidden=false;true');
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await value('range.value'),'3');
    // Open component video selection and top-row closed-component controls.
    await value('document.body.innerHTML="<div id=host></div>";const shadow=document.getElementById("host").attachShadow({mode:"open"});shadow.innerHTML="<video muted style=width:700px;height:400px></video>";window.shadowVideo=shadow.querySelector("video");shadowVideo.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";shadowVideo.muted=true;true');
    await browser.mediaAction('play');await until(async()=>await value('shadowVideo.currentTime>0'),'Shadow video plays');await browser.mediaAction('pause');assert(await value('shadowVideo.paused'));
    await value('(()=>{document.body.innerHTML="";const host=document.createElement("disney-web-player");host.style.cssText="display:block;width:100vw;height:100vh";document.body.appendChild(host);const shadow=host.attachShadow({mode:"closed"});window.shadowClicks=0;for(let i=0;i<2;i++){const b=document.createElement("button");b.textContent=i?"Full screen":"Play";b.style.cssText="position:absolute;top:20px;left:"+(20+i*140)+"px";b.onclick=()=>window.shadowClicks++;shadow.appendChild(b);}return true;})()');
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await value('window.shadowClicks'),1,'Closed component top controls can activate via AX');
    await value('(()=>{document.body.innerHTML="<iframe id=frame style=width:800px;height:450px></iframe>";frame.contentDocument.body.innerHTML="<video muted style=width:700px;height:400px></video>";window.frameVideo=frame.contentDocument.querySelector("video");frameVideo.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";frameVideo.muted=true;return true;})()');
    await browser.mediaAction('play');await until(async()=>await value('frameVideo.currentTime>0'),'Same-origin iframe video plays');await browser.mediaAction('pause');assert(await value('frameVideo.paused'));
    await value('(()=>{document.body.innerHTML="<audio id=audio muted loop></audio>";audio.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";audio.muted=true;return true;})()');
    await browser.mediaAction('play');await until(async()=>await value('audio.currentTime>0'),'Audio element plays without a visible rectangle');await browser.mediaAction('pause');assert(await value('audio.paused'));await browser.mediaAction('unmute');assert.equal(await value('audio.muted'),false);
    const mp4=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-c:a','aac','-b:a','64k','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:2*1024*1024});
    assert.equal(mp4.status,0,'ffmpeg H.264/AAC fixture generation: '+String(mp4.stderr));
    await value('(()=>{document.body.innerHTML="<video id=h264 loop style=width:700px;height:400px></video>";h264.src="data:video/mp4;base64,'+mp4.stdout.toString('base64')+'";return true;})()');
    await browser.mediaAction('play');await until(async()=>await value('h264.currentTime>0.2&&h264.getVideoPlaybackQuality().totalVideoFrames>0'),'H.264 video frames must decode');
    await until(async()=>await value('h264.webkitAudioDecodedByteCount>0'),'AAC soundtrack must decode');
    const decoded=JSON.parse(await value('JSON.stringify({frames:h264.getVideoPlaybackQuality().totalVideoFrames,audioBytes:h264.webkitAudioDecodedByteCount})'));assert(decoded.frames>0&&decoded.audioBytes>0);
    await browser.mediaAction('pause');
    console.log('Real Chromium: VP8/Opus and H.264/AAC decoding, inline play/pause/seek/mute, fullscreen/containment/exit, native controls, refocusing/disabled controls, range, shadow/iframe video, audio elements and closed-component controls passed. Speaker output is not proven.');
}finally{browser.destroy();await browser.closing;assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
