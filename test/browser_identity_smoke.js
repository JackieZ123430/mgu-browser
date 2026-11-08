'use strict';
// Actual Chromium headers and navigator identity on an authored loopback page.
// No provider account, DRM module, third-party page or security override.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),cp=require('child_process');
const Browser=process.env.MGU_BROWSER_BACKEND?require(path.join(process.env.MGU_BROWSER_BACKEND,'browser_session')):require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-identity-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:root});
let headers,product='';browser.on('version',value=>{product=value;});
const server=http.createServer((request,response)=>{
    headers={userAgent:request.headers['user-agent'],language:request.headers['accept-language'],brands:request.headers['sec-ch-ua'],platform:request.headers['sec-ch-ua-platform'],mobile:request.headers['sec-ch-ua-mobile']};
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Accept-CH':'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Bitness'});
    response.end('<!doctype html><title>Browser identity fixture</title><h1>Actual Chromium/Linux identity</h1>');
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function snapshot(){
    for(let i=0;i<60;i++){
        const result=await browser.send('Runtime.evaluate',{expression:'(async()=>({title:document.title,secure:isSecureContext,userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,hints:navigator.userAgentData&&await navigator.userAgentData.getHighEntropyValues(["architecture","bitness","fullVersionList"])}))()',awaitPromise:true,returnByValue:true});
        if(result.result&&result.result.value&&result.result.value.title==='Browser identity fixture')return result.result.value;
        await pause(50);
    }
    throw Error('Authored identity page did not load');
}
function check(value){
    assert(value.secure);assert(!/HeadlessChrome/.test(value.userAgent));assert(/Chrome\/\d+/.test(value.userAgent));assert(/Linux/.test(value.userAgent));
    assert.equal(value.platform,'Linux x86_64');assert.equal(value.language,'de-DE');
    assert(value.hints&&value.hints.brands.some(item=>item.brand==='Chromium'));assert.equal(value.hints.platform,'Linux');
    assert.equal(value.hints.architecture,'x86');assert.equal(value.hints.bitness,'64');
    assert(value.hints.fullVersionList.some(item=>item.brand==='Chromium'&&item.version===product.split('/')[1]),'Client Hints use the real running engine version');
    assert.equal(headers.userAgent,value.userAgent);assert(headers.brands.includes('"Chromium"'));assert.equal(headers.platform,'"Linux"');assert.equal(headers.mobile,'?0');assert(headers.language.startsWith('de-DE'));
}
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await browser.setLocale('de-DE');await browser.start('');
    const url='http://127.0.0.1:'+server.address().port+'/';
    await browser.send('Page.navigate',{url});const first=await snapshot();check(first);
    await browser.newTab('');await browser.send('Page.navigate',{url});const second=await snapshot();check(second);
    console.log('BROWSER_IDENTITY_RESULT '+JSON.stringify({success:true,product,platform:second.platform,language:second.language,brands:second.hints.brands,fullVersionList:second.hints.fullVersionList,tabs:2,sandbox:true,tlsVerification:true}));
}finally{browser.destroy();await browser.closing;if(server.listening)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
