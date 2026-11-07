'use strict';
// Real sandboxed Chromium with authored blank pages; no provider or account data.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Browser=require('../src/browser_session');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-tabs-smoke-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:root,binary:process.env.MGU_CHROMIUM||'/usr/bin/chromium',viewport:{width:960,height:540},mediaDisabled:false});
const value=async expression=>(await browser.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:true})).result.value;
const until=async check=>{for(let i=0;!check()&&i<100;i++)await new Promise(r=>setTimeout(r,50));assert(check(),'Tab lifecycle timeout');};
(async()=>{try{
    await browser.start('');const original=browser.activeTab,openerTarget=browser.target;
    assert.equal(await value('!!window.open("about:blank", "mgu-popup")'),true);
    await until(()=>browser.tabs.length===2&&browser.activeTab!==original);await browser.tabQueue;
    const popupTarget=browser.target;assert.notEqual(popupTarget,openerTarget);
    assert.equal(await value('!!window.opener'),true,'Adoption retains window.opener');
    await value('window.opener.fixturePopupMessage="preserved";window.close()');
    await until(()=>browser.tabs.length===1&&browser.activeTab===original);await browser.tabQueue;
    assert.equal(await value('window.fixturePopupMessage'),'preserved','Original opener receives popup result');
    await value('document.body.innerHTML="<a id=fixture href=about:blank target=_blank rel=noopener>Open</a>";document.getElementById("fixture").click()');
    await until(()=>browser.tabs.length===2&&browser.activeTab!==original);await browser.tabQueue;
    assert.equal(await value('window.opener===null'),true,'Noopener isolation remains intact');
    await browser.closeTab(browser.activeTab);assert.equal(browser.activeTab,original);
    console.log('Actual sandboxed Chromium: popup adoption, opener messaging, window.close, target=_blank and noopener isolation passed');
}finally{browser.destroy();await browser.closing;fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
