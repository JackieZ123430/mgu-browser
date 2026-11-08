'use strict';
// Rendered-text search in real Chromium. Every page/frame is authored locally.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-find-smoke-')),sockets=new Set(),servers=[];
const browser=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:path.join(root,'profiles'),gate:{check:()=>({allowed:true})},viewport:{width:960,height:540}});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function listen(server,host){servers.push(server);server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});return new Promise(resolve=>server.listen(0,host,()=>resolve(server.address().port)));}
async function value(expression,session){const r=await browser.pipe.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session||browser.session,1500);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(check,message){for(let i=0;i<60;i++){if(await check())return;await pause(100);}throw Error(message);}
function remove(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isDirectory()&&!s.isSymbolicLink())remove(file);else fs.unlinkSync(file);}fs.rmdirSync(dir);}
async function rejected(fn,pattern){let error;try{await fn();}catch(e){error=e;}assert(error&&pattern.test(error.message),'Expected bounded search refusal');}
const selected='getSelection().toString()',position='JSON.stringify({x:scrollX,y:scrollY,selection:getSelection().toString()})';let publicState=null;browser.on('find',state=>{publicState=state;});
(async()=>{try{
    const remote=http.createServer((request,response)=>{response.setHeader('Connection','close');response.setHeader('Content-Type','text/html');response.end('<p>OOPIFNeedle</p><p>OOPIFSecond</p>');});
    const remotePort=await listen(remote,'127.0.0.1');
    const local=http.createServer((request,response)=>{
        response.setHeader('Connection','close');response.setHeader('Content-Type','text/html; charset=utf-8');
        if(request.url.indexOf('/frame')===0){response.end('<p>SameFrameNeedle</p>');return;}
        response.end('<title>Find fixture</title><p id=first>MainNeedle</p><p id=case>CASEword</p><div id=open></div><div id=closed></div><p id=literal></p><div style="height:1400px"></div><p id=second>MainNeedle</p><iframe id=same src=/frame></iframe><iframe id=cross src="http://localhost:'+remotePort+'/"></iframe><script>document.getElementById("open").attachShadow({mode:"open"}).innerHTML="<p>OpenShadowNeedle</p>";document.getElementById("closed").attachShadow({mode:"closed"}).innerHTML="<p>ClosedShadowNeedle</p>";document.getElementById("literal").textContent=\'";window.findInjection=1;//\';window.find=()=>{throw Error("Page replacement must not execute")};</script>');
    });
    const port=await listen(local,'127.0.0.1');await browser.start('http://127.0.0.1:'+port+'/');
    await until(async()=>await value('document.querySelector("#same").contentDocument&&document.querySelector("#same").contentDocument.readyState==="complete"'),'Same-origin iframe loads');
    await until(()=>browser.relatedFrames(browser.session).length>0,'Cross-site iframe becomes an owned OOPIF');
    await until(async()=>await value('document.readyState==="complete"'),'Authored page and embedded documents finish loading');
    assert.equal((await browser.findText('MainNeedle')).found,true);assert.equal(await value('getSelection().anchorNode.parentElement.id'),'first');
    await browser.findText('MainNeedle');assert.equal(await value('getSelection().anchorNode.parentElement.id'),'second');
    await browser.findText('MainNeedle');assert.equal(await value('getSelection().anchorNode.parentElement.id'),'first');
    await browser.findText('MainNeedle',{backwards:true});assert.equal(await value('getSelection().anchorNode.parentElement.id'),'second');
    assert.equal((await browser.findText('caseword',{caseSensitive:true})).found,false);
    assert.equal((await browser.findText('caseword')).found,true);assert.equal(await value(selected),'CASEword');
    for(const query of ['OpenShadowNeedle','ClosedShadowNeedle']){assert.equal((await browser.findText(query)).found,true,query);assert.equal(await value(selected),query);}
    assert.equal((await browser.findText('";window.findInjection=1;//')).found,true);assert.equal(await value('window.findInjection||0'),0,'Search input remains a literal');
    const before=await value(position);assert.equal((await browser.findText('DefinitelyAbsentNeedle')).found,false);assert.equal(await value(position),before,'A failed search preserves selection and scroll');
    await value('getSelection().setBaseAndExtent(document.querySelector("#first").firstChild,8,document.querySelector("#first").firstChild,1);true');
    const direction=await value('JSON.stringify({anchor:getSelection().anchorOffset,focus:getSelection().focusOffset})');await browser.findText('AnotherAbsentNeedle');assert.equal(await value('JSON.stringify({anchor:getSelection().anchorOffset,focus:getSelection().focusOffset})'),direction,'A failed search preserves selection direction');
    assert.equal((await browser.findText('SameFrameNeedle')).found,true);assert.equal(await value('document.querySelector("#same").contentWindow.getSelection().toString()'),'SameFrameNeedle');assert(await value('scrollY>1000'),'Finding a low iframe scrolls its parent into view');
    const cross=browser.relatedFrames(browser.session).find(frame=>frame.parentSession===browser.session);
    assert(cross,'Owned cross-site frame exists');assert.equal((await browser.findText('OOPIFNeedle')).found,true);assert.equal(await value(selected,cross.session),'OOPIFNeedle');
    const preserved=await value(position),crossSelection=await value(selected,cross.session);assert.equal(browser.clearFind().active,false);assert.equal(await value(position),preserved);assert.equal(await value(selected,cross.session),crossSelection,'Closing Find preserves the current page selection');
    await browser.findText('OOPIFNeedle');await value('document.querySelector("#same").src="/frame-two";true');await until(async()=>await value('document.querySelector("#same").contentDocument&&document.querySelector("#same").contentWindow.location.pathname==="/frame-two"'),'Unrelated local frame navigates');assert.equal(publicState.active,true,'Unrelated frame navigation leaves the selected result active');
    await browser.pipe.send('Page.navigate',{url:'http://localhost:'+remotePort+'/replacement'},cross.session,1500);await until(()=>publicState&&publicState.active===false,'Navigation of the selected OOPIF retires its old result');assert.equal(browser.findState,null);
    await until(async()=>{try{return await value('document.readyState==="complete"&&location.pathname==="/replacement"',cross.session);}catch(error){if(/Cannot find default execution context|Execution context was destroyed/.test(error.message))return false;throw error;}},'Replaced OOPIF finishes loading before another search');
    await browser.findText('MainNeedle');await browser.navigate('http://127.0.0.1:'+port+'/replacement');await until(()=>publicState&&publicState.active===false,'Top navigation retires the previous page result');
    await rejected(()=>browser.findText('x'.repeat(257)),/256/);await rejected(()=>browser.findText('test',{unknown:true}),/Sucheinstellung/);
    console.log('Actual Chromium Find: next/previous/wrap, case, normal/open/closed-shadow text, same-origin/OOPIF frame selection and scrolling, literal input, selection-preserving failure/close and bounded queries passed.');
    console.log('BROWSER_FIND_RESULT '+JSON.stringify({success:true,normal:true,openShadow:true,closedShadow:true,sameOriginFrame:true,oopif:true,nextPrevious:true,caseSensitive:true,selectionPreserved:true,scopedFrameLifecycle:true,topNavigationRetires:true}));
}finally{browser.destroy();await browser.closing;for(const socket of sockets)socket.destroy();await Promise.all(servers.filter(server=>server.listening).map(server=>new Promise(resolve=>server.close(resolve))));remove(root);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
