'use strict';
// Authored loopback pages in the actual sandboxed engine. No external account,
// upload, provider action, permission grant or security override is involved.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),cp=require('child_process');
const Browser=process.env.MGU_BROWSER_BACKEND?require(path.join(process.env.MGU_BROWSER_BACKEND,'browser_session')):require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-dialog-smoke-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:root});
const server=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><title>Dialog fixture '+request.url+'</title><h1>Authored dialog page</h1><button id=activate style="width:200px;height:60px">Activate fixture</button>');});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await delay(40);}throw Error(label);}
async function value(expression){const result=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},6000);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function dialog(expression,type,accept,promptText){
    let settled=false;const pending=value(expression);pending.then(()=>{settled=true;},()=>{settled=true;});
    await until(()=>browser.dialogState()&&browser.dialogState().type===type,'Native '+type+' reaches broker');
    const state=browser.dialogState();await delay(80);assert.equal(settled,false,'Native dialog actually blocks its page until answered');
    await browser.dialogReply(state.id,accept,promptText);const result=await pending;
    assert.equal(browser.dialogState(),null);return result;
}
(async()=>{try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await browser.start('');
    const origin='http://127.0.0.1:'+server.address().port;
    // Harness-only loopback navigation bypasses the product HTTPS address bar.
    await browser.send('Page.navigate',{url:origin+'/one'});await until(async()=>await value('document.title')==='Dialog fixture /one','Authored page loads');
    assert.equal(await dialog('alert("Authored alert");"continued"','alert',true),'continued');
    assert.equal(await dialog('confirm("Authored confirmation")','confirm',false),false);
    assert.equal(await dialog('confirm("Authored confirmation")','confirm',true),true);
    assert.equal(await dialog('prompt("Authored prompt","default")','prompt',true,'Owner text Ä'), 'Owner text Ä');
    assert.equal(await dialog('prompt("Authored prompt","default")','prompt',false),null);
    await browser.tap(60,100);await value('window.onbeforeunload=event=>{event.preventDefault();event.returnValue="";};true');
    let navigation=browser.send('Page.navigate',{url:origin+'/two'},6000);navigation.catch(()=>{});
    await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Native beforeunload is visible');
    await browser.dialogReply(browser.dialogState().id,false,'');const declined=await navigation;assert(declined.errorText,'Cancelling beforeunload cancels that navigation');assert.equal(await value('document.title'),'Dialog fixture /one');
    navigation=browser.send('Page.navigate',{url:origin+'/two'},6000);navigation.catch(()=>{});
    await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Repeated beforeunload receives its own dialog');
    await browser.dialogReply(browser.dialogState().id,true,'');await navigation;await until(async()=>await value('document.title')==='Dialog fixture /two','Accepted navigation continues');
    await browser.tap(60,100);await value('window.onbeforeunload=event=>{event.preventDefault();event.returnValue="";};true');
    const last=browser.tabs.find(tab=>tab.id===browser.activeTab);
    await browser.closeTab(last.id);await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Closing tab respects native beforeunload');
    assert.equal(browser.tabs.length,1);assert.equal(browser.activeTab,last.id,'Close request preserves original focus');
    await browser.dialogReply(browser.dialogState().id,false,'');assert.equal(browser.tabs.length,1);assert.equal(browser.activeTab,last.id);assert.equal(last.closeRequested,false);assert.equal(await value('document.title'),'Dialog fixture /two');
    await browser.closeTab(last.id);await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Closing can be requested again after staying');
    assert.equal(browser.tabs.length,1,'Last-tab replacement is not created before confirmation');await browser.dialogReply(browser.dialogState().id,true,'');
    await until(()=>browser.tabs.length===1&&browser.activeTab!==last.id,'Accepted last-tab close creates one fresh blank tab');await browser.tabQueue;assert.equal(browser.tabs[0].url,'');
    const original=browser.activeTab;await browser.newTab('');const popup=browser.activeTab;
    const blocked=value('alert("Close this tab while modal");true').catch(()=>false);
    await until(()=>browser.dialogState()&&browser.dialogState().tabId===popup,'Popup modal reaches broker');await browser.closeTab(popup);await blocked;
    await until(()=>browser.tabs.length===1&&browser.activeTab===original,'Modal tab really closes and returns to its survivor');assert.equal(browser.dialogState(),null);assert.equal(await value('2+2'),4);
    const stopped=value('alert("Stop browser while modal");true').catch(()=>false);await until(()=>!!browser.dialogState(),'Shutdown modal reaches broker');
    const began=Date.now();browser.destroy();await browser.closing;await stopped;assert(Date.now()-began<11000,'Closing browser with a modal must remain bounded');assert.equal(browser.dialogState(),null);
    console.log('BROWSER_DIALOGS_RESULT '+JSON.stringify({success:true,sandbox:true,alert:true,confirmAcceptCancel:true,promptValueCancel:true,beforeunloadStayLeave:true,closeBeforeunloadStayLeave:true,lastTabReplacementAfterConfirmation:true,closeModalTab:true,stopModalBrowser:true,openerTargetPreserved:true}));
}finally{browser.destroy();await browser.closing;if(server.listening)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
