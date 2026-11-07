'use strict';
// Authored blank documents only. No provider, external origin or real profile.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw new Error('Unprivileged isolated Linux fixture required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-offline-engine-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:root,binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',viewport:{width:960,height:540},mediaDisabled:false});
browser.on('diagnostic',text=>{if(/sandbox|FATAL|failed|error/i.test(text))console.error(text.slice(0,600));});
const value=async expression=>(await browser.send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
(async()=>{try{
    await browser.start('');
    await browser.send('Runtime.evaluate',{expression:'document.body.innerHTML="<div id=player><canvas width=320 height=180></canvas><video autoplay muted></video><button id=back>Back</button><button id=play>Play</button><input type=range min=0 max=10 value=2></div>";const p=document.getElementById("player"),v=p.querySelector("video"),c=p.querySelector("canvas");p.style.cssText="position:relative;width:100vw;height:100vh";v.style.cssText="width:100%;height:100%";c.getContext("2d").fillRect(0,0,320,180);v.srcObject=c.captureStream(5);window.clicks={back:0,play:0};const back=document.getElementById("back"),play=document.getElementById("play");for(const [i,e] of Array.from(p.querySelectorAll("button,input")).entries())e.style.cssText="position:absolute;bottom:20px;left:"+(20+i*140)+"px";back.onclick=()=>window.clicks.back++;play.onclick=()=>window.clicks.play++;play.onfocus=()=>back.focus();p.requestFullscreen()',awaitPromise:true,userGesture:true});
    await browser.focusMediaControl(1);await browser.focusMediaControl(1);await browser.pressMediaControl();
    assert.equal(await value('window.clicks.play'),1,'Explicit selected control survives a player restoring DOM focus to Back');assert.equal(await value('window.clicks.back'),0);
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await value('document.querySelector("input").value'),'3','Selected range receives a bounded step');
    await browser.mediaAction('exit');
    await browser.send('Runtime.evaluate',{expression:'document.body.innerHTML="";const host=document.createElement("disney-web-player");host.style.cssText="display:block;width:100vw;height:100vh";document.body.appendChild(host);const shadow=host.attachShadow({mode:"closed"});window.shadowClicks=0;for(let i=0;i<2;i++){const b=document.createElement("button");b.textContent=i?"Full screen":"Play";b.style.cssText="position:absolute;bottom:20px;left:"+(20+i*140)+"px";b.onclick=()=>window.shadowClicks++;shadow.appendChild(b);}host.requestFullscreen()',awaitPromise:true,userGesture:true});
    await browser.focusMediaControl(1);await browser.pressMediaControl();assert.equal(await value('window.shadowClicks'),1,'Closed component controls use browser accessibility node identity');
    await browser.mediaAction('exit');assert.equal(await value('!!document.fullscreenElement'),false);
    console.log('Offline real engine: refocusing-player selection, actual button activation, range adjustment, closed component and fullscreen exit passed');
}finally{browser.destroy();await browser.closing;assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
