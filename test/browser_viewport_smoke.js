'use strict';
// Calibrate rendered physical pixels against CSS hit coordinates, including a
// separate renderer. All pages and the animated playback fixture are local.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session'),PNG=require(backend+'/png_frame');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-viewport-smoke-')),sockets=new Set(),frames=[];
const browser=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:path.join(root,'profiles'),gate:{check:()=>({allowed:true})},viewport:{width:1280,height:720}});
let last=null,frameSequence=0;browser.on('frame',frame=>{last=frame;frameSequence++;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function remove(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isDirectory()&&!s.isSymbolicLink())remove(file);else fs.unlinkSync(file);}fs.rmdirSync(dir);}
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await pause(50);}throw Error(label);}
async function value(expression,session){const r=await browser.pipe.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},session||browser.session,1500);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
function near(frame,x,y,color){if(!frame)return false;const at=(Math.round(y)*frame.width+Math.round(x))*4;return color.every((v,n)=>Math.abs(frame.rgba[at+n]-v)<15);}
const server=http.createServer((request,response)=>{
    response.setHeader('Connection','close');response.setHeader('Content-Type','text/html; charset=utf-8');
    if(request.url==='/frame'){response.end('<body style="margin:0"><button id=hit style="position:absolute;left:20px;top:20px;width:120px;height:80px;border:0;background:rgb(50,70,210)">Child</button><script>window.hits=0;hit.onclick=()=>hits++;</script>');return;}
    response.end('<title>Sharp zoom fixture</title><body style="margin:0;background:white"><h1 style="margin:0">Native zoom calibration</h1><div id=marker style="position:absolute;left:40px;top:40px;width:100px;height:80px;background:rgb(17,153,85)"></div><iframe id=frame style="position:absolute;left:400px;top:100px;width:300px;height:200px" src="http://localhost:'+server.address().port+'/frame"></iframe><canvas id=animation width=320 height=80 style="position:fixed;bottom:0;left:0;width:320px;height:80px"></canvas><script>window.hits=0;marker.onclick=()=>hits++;const ctx=animation.getContext("2d");let tick=0;function paint(){ctx.fillStyle="rgb("+(tick++%255)+",30,90)";ctx.fillRect(0,0,320,80);requestAnimationFrame(paint)}paint();</script>');
});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await browser.start('http://127.0.0.1:'+server.address().port+'/');
    await until(()=>browser.relatedFrames(browser.session).length>0,'Authored cross-site renderer must be owned');const child=browser.relatedFrames(browser.session)[0];await until(async()=>{try{return await value('typeof window.hits==="number"',child.session);}catch(error){if(/Cannot find default execution context|Execution context was destroyed/.test(error.message))return false;throw error;}},'Child fixture must load');
    let nativePaintDifference=0;
    for(const zoom of [100,125,150,125,100]){
        const sequence=frameSequence,viewport=await browser.resize(1280,720,zoom),scale=zoom/100;
        assert.deepEqual(await value('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'),{width:viewport.width,height:viewport.height,dpr:scale});
        await until(()=>last&&frameSequence>=sequence+5&&last.width===1280&&last.height===720&&near(last,130*scale,80*scale,[17,153,85])&&near(last,432*scale,132*scale,[50,70,210]),'Zoom '+zoom+' must paint both physical colors at native resolution');
        await browser.tap(90,80);assert.equal(await value('window.hits'),frames.length+1,'Main-frame hit uses CSS coordinates at '+zoom);await browser.tap(482,162);assert.equal(await value('window.hits',child.session),frames.length+1,'OOPIF hit uses CSS coordinates at '+zoom);
        await value('('+function(){if(!document.getElementById('nested')){const panel=document.createElement('div'),content=document.createElement('div');panel.id='nested';panel.style='position:absolute;left:40px;top:200px;width:200px;height:150px;overflow:auto';content.style='width:800px;height:1000px';content.textContent='Nested scroll fixture';panel.appendChild(content);document.body.appendChild(panel);}document.getElementById('nested').scrollTo(0,0);return true;}.toString()+')()');
        await browser.scroll(120,{x:100,y:250,deltaX:80});await until(async()=>await value('nested.scrollLeft===80&&nested.scrollTop===120'),'Wheel targets the nested CSS position and retains CSS deltas at '+zoom);
        const reference=last,screenshot=await PNG.decode(Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
        assert.equal(screenshot.width,1280);assert.equal(screenshot.height,720);let difference=0,samples=0;
        for(let y=0;y<100;y++)for(let x=0;x<1280;x++){const at=(y*1280+x)*4;for(let c=0;c<3;c++){difference+=Math.abs(screenshot.rgba[at+c]-reference.rgba[at+c]);samples++;}}
        assert(difference/samples<3,'Native zoom preserves painted text and edges without stretching a low-resolution surface');nativePaintDifference=Math.max(nativePaintDifference,difference/samples);
        frames.push({zoom,width:reference.width,height:reference.height,cssWidth:viewport.width,cssHeight:viewport.height});
    }
    await browser.resize(1280,720,125);const shortcutLayout=await value('JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale})');
    for(const shortcut of ['+','-','0','=']){await browser.key(shortcut,{ctrl:true});await pause(100);assert.equal(await value('JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale})'),shortcutLayout,'Injected Ctrl+'+shortcut+' cannot silently invalidate viewport metadata');}
    for(const delta of [120,-120]){await browser.scroll(delta,{x:800,y:100,modifiers:{ctrl:true}});await pause(150);assert.equal(await value('JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale})'),shortcutLayout,'Injected Ctrl+wheel cannot silently invalidate viewport metadata');}
    await value('document.documentElement.requestFullscreen().then(()=>true)');assert.equal(await value('!!document.fullscreenElement'),true);
    for(const dimensions of [[1280,400],[960,540]]){const sequence=frameSequence,v=await browser.resize(dimensions[0],dimensions[1],125);await until(()=>last&&frameSequence>sequence&&last.width===dimensions[0]&&last.height===dimensions[1],'Fullscreen resize preserves physical frame bounds');assert.equal(await value('innerWidth'),v.width);}
    await value('document.exitFullscreen().then(()=>true)');assert.equal(await value('!!document.fullscreenElement'),false);
    const rates=[];
    for(const zoom of [100,150]){await browser.resize(1280,720,zoom);await pause(250);const before=frameSequence,start=Date.now();await pause(2000);rates.push({zoom,fps:(frameSequence-before)*1000/(Date.now()-start)});}
    assert(rates[0].fps>=15&&rates[1].fps>=15,'Animated projection remains live at both zoom levels');assert(rates[1].fps>=rates[0].fps*.7,'Sharp zoom must not materially reduce the existing frame rate');
    const tab=browser.activeTab;await browser.newTab('');assert.equal(browser.viewport.zoom,150);assert.equal(browser.viewport.pixelWidth,1280);await browser.selectTab(tab);assert.equal(browser.viewport.zoom,150);assert.equal(browser.viewport.width,853,'Tab switching preserves physical bounds and logical zoom');
    console.log('BROWSER_VIEWPORT_RESULT '+JSON.stringify({success:true,frames,nativePaintDifference:Math.round(nativePaintDifference*1000)/1000,oopifHit:true,nestedWheel:true,shortcutsPreserveViewport:true,fullscreenResize:true,tabZoomPreserved:true,rates}));
}finally{browser.destroy();await browser.closing;for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));remove(root);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
