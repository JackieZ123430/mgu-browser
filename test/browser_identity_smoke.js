'use strict';
// Actual Chromium headers and navigator identity on an authored loopback page.
// No provider account, DRM module, third-party page or security override.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),cp=require('child_process');
const URL=require('url').URL;
const Browser=process.env.MGU_BROWSER_BACKEND?require(path.join(process.env.MGU_BROWSER_BACKEND,'browser_session')):require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-identity-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:root});
const requests=new Map();let product='';browser.on('version',value=>{product=value;});
const server=http.createServer((request,response)=>{
    requests.set(request.url,{userAgent:request.headers['user-agent'],language:request.headers['accept-language'],brands:request.headers['sec-ch-ua'],platform:request.headers['sec-ch-ua-platform'],mobile:request.headers['sec-ch-ua-mobile']});
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Accept-CH':'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Bitness'});
    response.end('<!doctype html><title>Browser identity fixture</title><h1>Actual Chromium/Linux identity</h1>');
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const expression='(async()=>{const canvas=document.createElement("canvas"),gl=canvas.getContext("webgl");let pixels=null;if(gl){gl.clearColor(.25,.5,.75,1);gl.clear(gl.COLOR_BUFFER_BIT);const p=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);pixels=Array.from(p);}return {title:document.title,url:location.href,secure:isSecureContext,userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,languages:navigator.languages,webdriver:navigator.webdriver,screen:{width:screen.width,height:screen.height},viewport:{width:innerWidth,height:innerHeight},webgl:{supported:!!gl,pixels},hints:navigator.userAgentData&&await navigator.userAgentData.getHighEntropyValues(["architecture","bitness","fullVersionList"])};})()';
async function snapshot(url,session){
    for(let i=0;i<60;i++){
        const result=await browser.pipe.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session||browser.session);
        if(result.result&&result.result.value&&result.result.value.title==='Browser identity fixture'&&result.result.value.url===url)return result.result.value;
        await pause(50);
    }
    throw Error('Authored identity page did not load');
}
function check(value,locale,native){
    const headers=requests.get(new URL(value.url).pathname+new URL(value.url).search);assert(headers,'Actual authored-page request headers exist');
    assert(value.secure);assert(!/HeadlessChrome/.test(value.userAgent));assert(/Chrome\/\d+/.test(value.userAgent));assert(/Linux/.test(value.userAgent));
    assert.equal(value.platform,'Linux x86_64');assert.equal(value.language,locale);
    assert(value.hints&&value.hints.brands.some(item=>item.brand==='Chromium'));assert.equal(value.hints.platform,'Linux');
    assert.equal(value.hints.architecture,'x86');assert.equal(value.hints.bitness,'64');
    assert(value.hints.fullVersionList.some(item=>item.brand==='Chromium'&&item.version===product.split('/')[1]),'Client Hints use the real running engine version');
    assert.equal(headers.userAgent,value.userAgent);assert(headers.brands.includes('"Chromium"'));assert.equal(headers.platform,'"Linux"');assert.equal(headers.mobile,'?0');assert(headers.language.startsWith(locale));
    assert.equal(value.webgl.supported,true,'Normal browser mode retains WebGL');
    assert(value.webgl.pixels[0]>=63&&value.webgl.pixels[0]<=64&&value.webgl.pixels[1]===128&&value.webgl.pixels[2]>=191&&value.webgl.pixels[2]<=192&&value.webgl.pixels[3]===255,'Actual WebGL drawing returns the authored color');
    if(native){
        assert.equal(value.userAgent,native.userAgent);assert.equal(value.webdriver,native.webdriver);
        assert.deepEqual(value.hints,native.hints,'UA-CH including GREASE and engine version stay native');
        assert.equal(headers.brands,requests.get('/native').brands,'Actual network Client Hints stay native');
    }
}
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await browser.setLocale('de-DE');await browser.start('');
    const base='http://127.0.0.1:'+server.address().port,engine=await browser.pipe.send('Browser.getVersion');
    assert(!engine.userAgent.includes('HeadlessChrome'),'The engine actually runs normal browser mode');
    // Attach directly to an unmanaged target: no Browser locale/UA override is
    // installed here. This is the running engine's native identity reference.
    const reference=await browser.pipe.send('Target.createTarget',{url:'about:blank',background:true});
    let native;
    try{
        const attachment=await browser.pipe.send('Target.attachToTarget',{targetId:reference.targetId,flatten:true});
        await browser.pipe.send('Page.enable',{},attachment.sessionId);
        await browser.pipe.send('Page.navigate',{url:base+'/native'},attachment.sessionId);
        native=await snapshot(base+'/native',attachment.sessionId);check(native,'de-DE');assert.equal(native.userAgent,engine.userAgent);
    }finally{await browser.pipe.send('Target.closeTarget',{targetId:reference.targetId});}
    const url=base+'/managed?phase=first';
    await browser.send('Page.navigate',{url});const first=await snapshot(url);check(first,'de-DE',native);
    await browser.newTab('');const secondUrl=base+'/managed?phase=second';await browser.send('Page.navigate',{url:secondUrl});const second=await snapshot(secondUrl);check(second,'de-DE',native);
    await browser.setLocale('en-GB');
    for(const tab of browser.tabs){
        await browser.selectTab(tab.id);const changedUrl=base+'/managed?phase=locale-'+tab.id;
        await browser.send('Page.navigate',{url:changedUrl});check(await snapshot(changedUrl),'en-GB',native);
    }
    const viewport=await browser.resize(1280,480),resized=await snapshot(base+'/managed?phase=locale-'+browser.activeTab);
    // A native window resize changes its content viewport, while screen keeps
    // reporting the actual Ozone display. Neither is a synthetic device screen.
    assert.deepEqual(resized.screen,native.screen,'Window resizing preserves native display metrics');
    assert.deepEqual(resized.viewport,{width:viewport.width,height:viewport.height});
    assert.equal(viewport.pixelWidth,1280);assert.equal(viewport.pixelHeight,480);assert.equal(viewport.zoom,100);
    assert.deepEqual(resized.viewport,{width:1280,height:480});
    console.log('BROWSER_IDENTITY_RESULT '+JSON.stringify({success:true,mode:'normal-chromium-ozone',product,platform:second.platform,language:'en-GB',brands:second.hints.brands,fullVersionList:second.hints.fullVersionList,webdriver:second.webdriver,nativeIdentityPreserved:true,webgl:true,screen:resized.screen,viewport:resized.viewport,tabs:2,sandbox:true,tlsVerification:true}));
}finally{browser.destroy();await browser.closing;if(server.listening)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
