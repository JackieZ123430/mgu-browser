'use strict';
// A private DevTools-session detach must not close its ordinary live document.
// Authored loopback forms only; no account, upload or provider action.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),cp=require('child_process');
const Browser=require(path.join(process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),'browser_session'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-detached-tabs-')),browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:path.join(root,'profiles'),binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let server,requests=0;
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await delay(50);}throw Error(label);}
async function value(expression){const response=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},2000);if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;}
async function detach(tab){const old=tab.session;await browser.pipe.send('Target.detachFromTarget',{sessionId:old},null,1500);await until(()=>browser.tabs.includes(tab)&&tab.session!==old&&tab.detachedSession!==tab.session&&browser.session===tab.session,'Live tab session is recovered');await browser.tabQueue;return old;}
(async()=>{try{
    server=http.createServer((request,response)=>{if(request.url==='/')requests++;response.writeHead(200,{'Content-Type':'text/html','Connection':'close'});response.end('<title>Unsaved form fixture</title><input id=draft value=initial><button id=activate style="display:block;width:150px;height:60px">Activate</button>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    await browser.start('');await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});await until(async()=>await value('!!document.getElementById("draft")'),'Form fixture loads');
    await value('draft.value="unsaved owner text";true');const original=browser.tabs.find(tab=>tab.id===browser.activeTab),target=original.target;
    let entered=false,rejected=false;const pending=browser.inputTask(async context=>{entered=true;await context.send('Runtime.evaluate',{expression:'new Promise(()=>{})',awaitPromise:true});});pending.catch(()=>{rejected=true;});await until(()=>entered,'Old renderer input task begins');
    const began=Date.now();await detach(original);await pending.catch(()=>{});assert(rejected);assert(Date.now()-began<5000,'Old-session input is cancelled instead of freezing its replacement');
    assert.equal(browser.tabs.length,1);assert.equal(browser.activeTab,original.id);assert.equal(original.target,target);assert.equal(await value('draft.value'),'unsaved owner text');assert.equal(requests,1,'Recovery never reloads the live form');
    await value('window.popup=window.open("about:blank","unsaved-popup");popup.document.write(\'<title>Blank popup with unsaved form</title><input id=draft value="popup owner text"><button style="display:block;width:200px;height:100px">Activate</button>\');popup.document.close();true');
    await until(()=>browser.tabs.length===2&&browser.activeTab!==original.id,'Authored blank popup is adopted');await browser.tabQueue;
    const popup=browser.tabs.find(tab=>tab.id===browser.activeTab),popupTarget=popup.target;await browser.tap(50,80);await value('window.onbeforeunload=event=>{event.preventDefault();event.returnValue="";};true');
    await detach(popup);assert.equal(browser.tabs.length,2);assert.equal(popup.target,popupTarget);assert.equal(await value('draft.value'),'popup owner text','An about:blank URL without an actual download is a live document');
    await browser.closeTab(popup.id);await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Recovered tab still owns its native beforeunload');await browser.dialogReply(browser.dialogState().id,false,'');assert(browser.tabs.includes(popup));assert.equal(await value('draft.value'),'popup owner text');
    await browser.closeTab(popup.id);await until(()=>browser.dialogState()&&browser.dialogState().type==='beforeunload','Close can be retried after cancellation');await browser.dialogReply(browser.dialogState().id,true,'');await until(()=>browser.tabs.length===1&&browser.activeTab===original.id,'Confirmed close returns to the original opener');
    assert.equal(await value('draft.value'),'unsaved owner text');
    console.log('BROWSER_DETACHED_TABS_RESULT '+JSON.stringify({success:true,sandbox:true,liveTargetPreserved:true,unsavedFormPreserved:true,noReload:true,oldInputCancelled:true,blankPopupPreserved:true,beforeunloadRetained:true,openerAlive:true}));
}finally{browser.destroy();await browser.closing;if(server)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
