'use strict';
// No resize/hover/capture is issued by this fixture before a quiet page's first
// projected picture and first trusted click, including a cold cross-site frame.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-viewport-bootstrap-')),sockets=new Set();
const browser=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:path.join(root,'profiles'),gate:{check:()=>({allowed:true})},viewport:{width:960,height:540}});
let last=null,sequence=0;browser.on('frame',frame=>{last=frame;sequence++;});const stages=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function remove(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isDirectory()&&!s.isSymbolicLink())remove(file);else fs.unlinkSync(file);}fs.rmdirSync(dir);}
async function until(check,message){for(let i=0;i<100;i++){if(await check())return;await pause(50);}throw Error(message);}
async function value(expression,session){const result=await browser.pipe.send('Runtime.evaluate',{expression,returnByValue:true},session||browser.session,1500);if(result.exceptionDetails)throw Error('Authored bootstrap evaluation failed');return result.result.value;}
function color(rgb){if(!last||last.width!==960||last.height!==540)return false;const at=(Math.floor(last.height/2)*last.width+Math.floor(last.width/2))*4;return rgb.every((v,n)=>Math.abs(last.rgba[at+n]-v)<15);}
const button='<button style="position:absolute;left:20px;top:20px;width:150px;height:70px" onpointerdown="window.downTrusted=event.isTrusted" onclick="window.hits=(window.hits||0)+1;window.clickTrusted=event.isTrusted">Cold fixture</button>';
const server=http.createServer((request,response)=>{response.setHeader('Connection','close');response.setHeader('Content-Type','text/html; charset=utf-8');
    if(request.url==='/embedded'){response.end('<body style="margin:0"><iframe style="position:fixed;inset:0;border:0;width:100vw;height:100vh" src="http://localhost:'+server.address().port+'/child"></iframe>');return;}
    response.end('<body style="margin:0;background:'+(request.url==='/child'?'rgb(50,70,210)':'rgb(17,153,85)')+'">'+button);
});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
async function navigate(action,rgb,label){let at;const committed=new Promise(resolve=>browser.once('navigation',()=>{at=sequence;resolve();}));await action();await committed;await until(()=>sequence>at&&color(rgb),label+' must paint without test-side resize or input');stages.push(label);}
async function click(session){await browser.tap(60,50);assert.deepEqual(await value('({hits:window.hits,down:window.downTrusted,click:window.clickTrusted})',session),{hits:1,down:true,click:true},'The first pointer click is delivered once with native trust');}
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    await browser.start(base+'/normal');await until(()=>color([17,153,85]),'Quiet cold start must paint without test-side resize or input');stages.push('cold-normal');await click();
    await navigate(()=>browser.navigate(base+'/embedded'),[50,70,210],'cold-oopif');await until(()=>browser.relatedFrames(browser.session).length>0,'Embedded renderer is owned');await click(browser.relatedFrames(browser.session)[0].session);
    await navigate(()=>browser.reload(),[50,70,210],'identical-reload');await until(()=>browser.relatedFrames(browser.session).length>0,'Reloaded embedded renderer is owned');await click(browser.relatedFrames(browser.session)[0].session);
    await navigate(()=>browser.navigate('http://localhost:'+server.address().port+'/normal'),[17,153,85],'cross-site-main');await click();
    await browser.resize(960,540,125);await navigate(()=>browser.navigate(base+'/embedded'),[50,70,210],'zoomed-oopif');await until(()=>browser.relatedFrames(browser.session).length>0,'Zoomed embedded renderer is owned');await click(browser.relatedFrames(browser.session)[0].session);assert.equal(browser.viewport.zoom,125);assert.equal(browser.viewport.width,768);
    await value('window.__viewportFixtureDescriptors={innerWidth:Object.getOwnPropertyDescriptor(window,"innerWidth"),innerHeight:Object.getOwnPropertyDescriptor(window,"innerHeight"),devicePixelRatio:Object.getOwnPropertyDescriptor(window,"devicePixelRatio")};for(const key of Object.keys(__viewportFixtureDescriptors))Object.defineProperty(window,key,{configurable:true,get:()=>17});true');
    const viewport=await browser.resize(960,540,150);assert.equal(viewport.width,640);assert.equal(viewport.height,360);assert.equal(viewport.zoom,150);await value('Object.defineProperties(window,__viewportFixtureDescriptors);delete window.__viewportFixtureDescriptors;true');
    console.log('BROWSER_VIEWPORT_BOOTSTRAP_RESULT '+JSON.stringify({success:true,stages,noInteractionFirstFrame:true,firstTrustedClick:true,oopif:true,reload:true,crossSite:true,zoomPreserved:true,pageGettersIgnored:true}));
}finally{browser.destroy();await browser.closing;for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));remove(root);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
