'use strict';
// Authored secure-loopback pages and native Chromium permissions. No location,
// camera or microphone data are fabricated. Isolated-container-only checks may
// open the native API to prove missing hardware remains a native error.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),cp=require('child_process');
const modules=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(path.join(modules,'browser_session'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-site-permissions-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:root+'/profiles',binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',viewport:{width:1280,height:480}});
const requests=[],errors=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let decision='denied',site,other;
browser.on('permission',event=>{if(event.state==='requested'){requests.push(event);browser.permissionAnswer(event.id,decision).catch(error=>errors.push(error.message));}});
const value=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,userGesture:true,returnByValue:true},5000);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const state=name=>value('(async()=>(await navigator.permissions.query({name:'+JSON.stringify(name)+'})).state)()');
function server(){return http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><title>Native site permissions</title><h1>Native site permissions</h1>');});}
async function loaded(){for(let i=0;i<60;i++){if(await value('document.title==="Native site permissions"'))return;await pause(50);}throw Error('Permission fixture failed to load');}
async function frameContext(frameOrigin){for(let i=0;i<80;i++){const context=Array.from(browser.permissionContexts.values()).find(context=>context.session!==browser.session&&context.origin===frameOrigin&&browser.frameOwner(context.session));if(context)return context;await pause(50);}throw Error('Cross-site iframe context failed to attach');}
async function frameValue(context,expression){const r=await browser.pipe.send('Runtime.evaluate',{expression,contextId:context.id,awaitPromise:true,returnByValue:true,userGesture:true},context.session,5000);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
(async()=>{try{
    site=server();other=server();await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+site.address().port,next='http://127.0.0.1:'+other.address().port;
    await browser.start('');await browser.send('Page.navigate',{url:origin+'/'});await loaded();
    const initial=await browser.permissionStatus();assert(initial.available);assert.equal(initial.origin,origin);assert.equal(await value('typeof window.__mguPermissionUIRequest'),'function');
    const initialGeolocation=await state('geolocation');
    await browser.permissionSet('geolocation','prompt',origin);assert.equal(await state('geolocation'),'prompt');
    const denied=await value('new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve({position:true}),error=>resolve({error:error.code}),{timeout:500}))');
    assert.equal(denied.error,1);assert.equal(await state('geolocation'),'denied');assert.equal(requests.length,1);assert.equal(requests[0].origin,origin);
    await browser.permissionSet('notifications','prompt',origin);decision='granted';assert.equal(await value('Notification.requestPermission()'),'granted');assert.equal(await state('notifications'),'granted');
    const promptCount=requests.length;assert.equal(await value('Notification.requestPermission()'),'granted');assert.equal(requests.length,promptCount,'A native grant is not requested again');
    const native={initialGeolocation,geolocationDenied:denied.error,notificationsGranted:true};
    if(process.env.MGU_PERMISSION_ISOLATED==='1'){
        // This flag is set only in a no-network disposable container with no
        // host devices, display server or clipboard mounted into it.
        const capture=await value('navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream=>{stream.getTracks().forEach(track=>track.stop());return {stream:true};},error=>({error:error.name}))');
        assert.equal(capture.error,'NotFoundError');assert.equal(await state('camera'),'granted');assert.equal(await state('microphone'),'granted');native.noDevice=capture.error;
        const clipboard=await value('navigator.clipboard.readText().then(()=>true)');assert.equal(clipboard,true);assert.equal(await state('clipboard-read'),'granted');native.isolatedClipboardRead=true;
    }
    await browser.send('Page.navigate',{url:next+'/'});await loaded();
    await assert.rejects(()=>browser.permissionSet('camera','granted',initial.origin),/website changed/);
    await assert.rejects(()=>browser.permissionSet('camera','granted'),/origin required/);
    assert.notEqual(await state('camera'),'granted','A stale panel cannot grant camera access to the newly displayed origin');
    // Same-process cross-origin frame: the broker must use CDP context/frame
    // authority for both requesting and embedding origins.
    const iframe='<iframe id="frame" allow="geolocation" src="'+origin+'/"></iframe>';
    await value('document.body.innerHTML='+JSON.stringify(iframe)+';true');await pause(300);
    const contexts=Array.from(browser.permissionContexts.values()),child=contexts.find(context=>context.session===browser.session&&context.origin===origin);
    assert(child,'Authored iframe execution context is observed');decision='denied';
    // Explicitly reset only this authored frame pair, since a managed host
    // browser may start with policy denials even in a fresh temporary profile.
    await browser.pipe.send('Browser.setPermission',{permission:{name:'geolocation'},setting:'prompt',origin:next,embeddedOrigin:origin});
    const before=requests.length,result=await browser.pipe.send('Runtime.evaluate',{expression:'new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve({position:true}),error=>resolve({error:error.code}),{timeout:500}))',contextId:child.id,awaitPromise:true,returnByValue:true,userGesture:true},browser.session,5000);
    assert.equal(result.result.value.error,1);assert.equal(requests.length,before+1);assert.equal(requests[before].origin,origin);assert.equal(requests[before].embeddingOrigin,next);
    // A genuinely cross-site frame is a distinct Chromium renderer target.
    // Its persistent session must expose ordinary permission UI and must be
    // retired together with its native execution contexts on owner navigation.
    const remote='http://localhost:'+site.address().port;
    await browser.pipe.send('Browser.setPermission',{permission:{name:'geolocation'},setting:'prompt',origin:next,embeddedOrigin:remote});
    await value('document.body.innerHTML='+JSON.stringify('<iframe allow="geolocation; camera; microphone" src="'+remote+'/"></iframe>')+';true');
    const remoteContext=await frameContext(remote),remoteOwner=browser.frameOwner(remoteContext.session);
    assert.equal(remoteOwner.mainSession,browser.session);assert.equal(remoteOwner.frameId,remoteOwner.target);assert.equal(await frameValue(remoteContext,'typeof __mguPermissionUIRequest'),'function');
    const remoteBefore=requests.length,remoteDenied=await frameValue(remoteContext,'new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve({position:true}),error=>resolve({error:error.code}),{timeout:500}))');
    assert.equal(remoteDenied.error,1);assert.equal(requests.length,remoteBefore+1);assert.equal(requests[remoteBefore].origin,remote);assert.equal(requests[remoteBefore].embeddingOrigin,next);
    if(process.env.MGU_PERMISSION_ISOLATED==='1'){
        for(const name of ['camera','microphone'])await browser.pipe.send('Browser.setPermission',{permission:{name},setting:'prompt',origin:next,embeddedOrigin:remote});
        decision='granted';const capture=await frameValue(remoteContext,'navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream=>{stream.getTracks().forEach(track=>track.stop());return {stream:true};},error=>({error:error.name}))');
        assert.equal(capture.error,'NotFoundError');assert.equal(await frameValue(remoteContext,'(async()=>(await navigator.permissions.query({name:"camera"})).state)()'),'granted');assert.equal(await frameValue(remoteContext,'(async()=>(await navigator.permissions.query({name:"microphone"})).state)()'),'granted');native.oopifNoDevice=capture.error;
    }
    decision='denied';await browser.pipe.send('Browser.setPermission',{permission:{name:'geolocation'},setting:'prompt',origin:next,embeddedOrigin:origin});
    await frameValue(remoteContext,'document.body.innerHTML='+JSON.stringify('<iframe allow="geolocation" src="'+origin+'/"></iframe>')+';true');
    const nestedContext=await frameContext(origin),nestedOwner=browser.frameOwner(nestedContext.session);assert.equal(nestedOwner.mainSession,browser.session);assert.equal(nestedOwner.parentSession,remoteContext.session);
    const nestedBefore=requests.length,nestedDenied=await frameValue(nestedContext,'new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve({position:true}),error=>resolve({error:error.code}),{timeout:500}))');
    assert.equal(nestedDenied.error,1);assert.equal(requests.length,nestedBefore+1);assert.equal(requests[nestedBefore].origin,origin);assert.equal(requests[nestedBefore].embeddingOrigin,next);
    await browser.send('Page.navigate',{url:origin+'/'});await loaded();
    assert.equal(browser.frameOwner(remoteContext.session),null);assert.equal(browser.frameOwner(nestedContext.session),null);assert.equal(browser.relatedFrames(browser.session).length,0);assert(!Array.from(browser.permissionContexts.values()).some(context=>context.session===remoteContext.session||context.session===nestedContext.session));
    assert.deepEqual(errors,[]);
    console.log('BROWSER_PERMISSIONS_RESULT '+JSON.stringify({success:true,codec:browser.performance.codec,requests:requests.map(request=>({origin:request.origin,embeddingOrigin:request.embeddingOrigin,permissions:request.permissions})),native,staleOriginRejected:true,iframeOriginVerified:true,oopifOriginVerified:true,nestedOriginVerified:true,oopifCleanup:true,sandbox:true,tlsVerification:true}));
}finally{browser.destroy();await browser.closing;for(const server of [site,other])if(server&&server.listening)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
