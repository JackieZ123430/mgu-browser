'use strict';
// Real Chromium, authored loopback HTTP/auth fixtures and an untrusted local
// certificate. No account, external service or TLS verification bypass is used.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),https=require('https'),cp=require('child_process');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session'),{inputURL}=require(backend+'/browser_state');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-desktop-navigation-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(root,'profiles'),viewport:{width:960,height:540}});
const sockets=new Set(),servers=[];
function track(server){server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});servers.push(server);return server;}
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address().port);});});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function remove(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isDirectory()&&!s.isSymbolicLink())remove(file);else fs.unlinkSync(file);}fs.rmdirSync(dir);}
async function value(expression,session){
    const result=await browser.pipe.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},session||browser.session,1500);
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
}
async function until(check,label){for(let i=0;i<80;i++){if(await check())return;await delay(100);}throw Error(label);}

(async()=>{try{
    const plain=track(http.createServer((request,response)=>{
        response.setHeader('Connection','close');
        if(request.url==='/redirect'){response.writeHead(302,{Location:'/opener'});response.end();return;}
        if(request.url==='/ping'){response.writeHead(200,{'Content-Type':'application/json'});response.end('{"ready":true}');return;}
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        if(request.url==='/auth'){
            response.end('<title>Auth fixture</title><h1>Authorised fixture result</h1><script>setTimeout(()=>window.opener.postMessage("auth-complete",location.origin),700)</script>');return;
        }
        response.end('<title>Opener fixture</title><h1>Ordinary web navigation</h1><script>window.ticks=0;window.authResult="";setInterval(()=>ticks++,100);addEventListener("message",event=>{if(event.origin===location.origin)window.authResult=event.data;});</script>');
    }));
    const port=await listen(plain),base='http://127.0.0.1:'+port;
    await browser.start(inputURL(base+'/redirect'));
    await until(async()=>await value('document.title==="Opener fixture"'),'HTTP redirect on a nondefault port loads');
    assert.equal(await value('location.href'),base+'/opener');
    assert.equal(await value('matchMedia("(prefers-reduced-motion: reduce)").matches'),false,'Browser does not force reduced motion');
    const opener=browser.tabs.find(tab=>tab.id===browser.activeTab),before=await value('ticks');
    assert.equal(await value('!!window.open("/auth","auth-fixture")'),true);
    await until(()=>browser.tabs.length===2&&browser.activeTab!==opener.id,'Native popup becomes the selected tab');await browser.tabQueue;
    await value('window.fetchFinished=false;setTimeout(()=>fetch("/ping").then(r=>r.json()).then(()=>window.fetchFinished=true),200);true',opener.session);
    await until(async()=>await value('window.authResult==="auth-complete"&&window.fetchFinished===true&&window.ticks>'+before,opener.session),
        'Hidden opener must receive its popup result and finish timer/fetch work');
    assert.notEqual(opener.frozen,true,'Hidden opener is not force-frozen');
    await value('window.close();true');await until(()=>browser.tabs.length===1&&browser.activeTab===opener.id,'Popup closes and returns to its original opener');await browser.tabQueue;

    // Browser.navigate must reach the real certificate error, including on a
    // nondefault HTTPS port, instead of refusing the URL before Chromium.
    assert(!!process.env.MGU_TEST_TLS_KEY===!!process.env.MGU_TEST_TLS_CERT,'Authored TLS fixture requires both key and certificate');
    const key=process.env.MGU_TEST_TLS_KEY||path.join(root,'key.pem'),cert=process.env.MGU_TEST_TLS_CERT||path.join(root,'cert.pem');
    if(!process.env.MGU_TEST_TLS_KEY)cp.execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore',timeout:10000});
    const secure=track(https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(request,response)=>{response.setHeader('Connection','close');response.end('This untrusted certificate must not load');}));
    const securePort=await listen(secure);
    let certificateError;try{await browser.navigate('https://127.0.0.1:'+securePort+'/');}catch(error){certificateError=error;}assert(certificateError&&/ERR_CERT/.test(certificateError.message),'Untrusted TLS remains rejected');
    await browser.navigate(base+'/opener');await until(async()=>await value('document.title==="Opener fixture"'),'Navigation still works after TLS rejection');
    await browser.stop('Authored initial error regression');await browser.closing;
    const tlsURL='https://127.0.0.1:'+securePort+'/';let initialError=false;const onFault=error=>{if(/ERR_CERT/.test(error.message))initialError=true;};browser.on('fault',onFault);
    await browser.start(tlsURL);assert(browser.child&&browser.tabs.length===1&&initialError,'An initial certificate error keeps its browser and native error tab alive');
    const errorTab=browser.activeTab;await browser.newTab(base+'/opener');await until(async()=>await value('document.title==="Opener fixture"'),'A normal new tab works after an initial network error');
    assert(browser.tabs.some(tab=>tab.id===errorTab),'Opening a working site does not discard the error tab');await browser.selectTab(errorTab);await browser.navigate(base+'/opener');await until(async()=>await value('document.title==="Opener fixture"'),'The original error tab can retry successfully');browser.removeListener('fault',onFault);
    console.log('Actual Chromium desktop navigation: HTTP/custom ports/redirect, native background timer+fetch+popup postMessage, default motion, popup close and strict self-signed TLS rejection passed.');
    console.log('DESKTOP_NAVIGATION_RESULT '+JSON.stringify({success:true,http:true,customPort:true,backgroundTimers:true,fetch:true,popupMessage:true,defaultMotion:true,strictTLS:true,initialErrorTab:true,errorTabRetry:true}));
}finally{
    browser.destroy();await browser.closing;
    for(const socket of sockets)socket.destroy();
    await Promise.all(servers.filter(server=>server.listening).map(server=>new Promise(resolve=>server.close(resolve))));
    remove(root);
}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
