'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Dialogs=require('../src/browser_dialogs');
function fixture(send){
    const calls=[],events=[],tabs=[{id:'tab-a',session:'a',title:'First tab'},{id:'tab-b',session:'b',title:'Second tab'}];
    const pipe={send:async(method,params,session,timeout)=>{calls.push({method,params,session,timeout});return send?send(method,params,session):{};}};
    const browser=Object.assign({},Dialogs,{tabs,pipe,epoch:3,activeTab:'tab-a',requireAllowed(){},emit:(name,value)=>events.push({name,value})});
    const open=(session,type,extra)=>browser.javascriptDialogEvent({method:'Page.javascriptDialogOpening',sessionId:session,params:Object.assign({type,message:'Authored dialog',defaultPrompt:'Default',url:'https://example.test/dialog'},extra)});
    return {browser,calls,events,tabs,pipe,open};
}
test('dialog metadata is bounded and strips URL credentials/path and control characters',()=>{
    const f=fixture();f.open('a','prompt',{message:'a\x00\x01\r\n'+'x'.repeat(2000),defaultPrompt:'p'.repeat(900),url:'https://user:secret@example.test/private?token=secret'});
    const state=f.browser.dialogState();assert.equal(state.type,'prompt');assert.equal(state.message.length,1024);assert(state.message.startsWith('a\n'));assert.equal(state.defaultPrompt.length,512);assert.equal(state.origin,'https://example.test');assert.equal(state.tabId,'tab-a');assert.equal(state.background,false);assert(!JSON.stringify(state).includes('secret'));f.browser.clearDialogs();
});
test('dialog queue prefers the selected tab and retains the other target until its own closure',()=>{
    const f=fixture();f.open('b','alert');const second=f.browser.dialogState().id;assert.equal(f.browser.dialogState().background,true);
    f.open('a','confirm');const first=f.browser.dialogState().id;assert.notEqual(first,second);assert.equal(f.browser.dialogState().tabId,'tab-a');
    f.browser.activeTab='tab-b';f.browser.emitDialogState();assert.equal(f.browser.dialogState().id,second);
    f.browser.javascriptDialogEvent({method:'Page.javascriptDialogClosed',sessionId:'b',params:{result:true}});assert.equal(f.browser.dialogState().id,first);assert.equal(f.browser.dialogState().background,true);f.browser.clearDialogs();assert.equal(f.browser.dialogState(),null);
});
test('prompt reply uses its exact target and duplicate or expired UI replies cannot send native answers',async()=>{
    const f=fixture();f.open('b','prompt');const id=f.browser.dialogState().id;
    assert.deepEqual(await f.browser.dialogReply(id,true,'Owner supplied'),{handled:true});assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{method:'Page.handleJavaScriptDialog',params:{accept:true,promptText:'Owner supplied'},session:'b',timeout:2000});assert.equal(f.browser.dialogState(),null);
    await assert.rejects(()=>f.browser.dialogReply(id,true,'late'),/aktuell/);assert.equal(f.calls.length,1);
});
test('a late response or error from an old dialog cannot retire its replacement',async()=>{
    for(const fails of [false,true]){
        let finish,reject;const f=fixture(()=>new Promise((resolve,fail)=>{finish=resolve;reject=fail;}));f.open('a','prompt');const old=f.browser.dialogState().id;
        const pending=f.browser.dialogReply(old,true,'one');assert.equal(f.browser.dialogState().busy,true);await assert.rejects(()=>f.browser.dialogReply(old,false,''),/aktuell/);
        f.open('a','confirm');const current=f.browser.dialogState().id;
        if(fails){reject(Error('old native command failed'));await assert.rejects(pending,/nicht beantwortet/);}else{finish({});await pending;}
        assert.equal(f.browser.dialogState().id,current);assert.equal(f.browser.dialogState().busy,false);f.browser.clearDialogs();
    }
});
test('dialog answers cannot cross an engine epoch, pipe replacement or removed tab',async()=>{
    for(const invalidate of [f=>{f.browser.epoch++;},f=>{f.browser.pipe={};},f=>{f.browser.tabs=[];}]){
        const f=fixture();f.open('a','beforeunload');const id=f.browser.dialogState().id;invalidate(f);await assert.rejects(()=>f.browser.dialogReply(id,true,''),/aktuell/);assert.equal(f.calls.length,0);f.browser.clearDialogs();
    }
});
test('navigation and shutdown retirement do not answer an unrelated or future native dialog',async()=>{
    const f=fixture();f.open('a','confirm');const old=f.browser.dialogState().id;f.browser.clearDialogs('a');f.open('a','alert');await assert.rejects(()=>f.browser.dialogReply(old,true,''),/aktuell/);assert.equal(f.calls.length,0);f.browser.clearDialogs();assert.equal(f.browser.dialogState(),null);
});
test('cancelling native beforeunload re-enables its original tab close request',async()=>{
    const f=fixture();f.tabs[0].closeRequested=true;f.open('a','beforeunload');await f.browser.dialogReply(f.browser.dialogState().id,false,'');assert.equal(f.tabs[0].closeRequested,false,'Native reply acknowledgment can precede the closed event');
    f.tabs[0].closeRequested=true;f.open('a','beforeunload');f.browser.javascriptDialogEvent({method:'Page.javascriptDialogClosed',sessionId:'a',params:{result:false}});
    assert.equal(f.tabs[0].closeRequested,false);assert.equal(f.browser.dialogState(),null);assert.equal(f.browser.activeTab,'tab-a');assert.equal(f.browser.tabs.length,2);
});
test('unattended beforeunload dialog is cancelled rather than accepted at its bounded deadline',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.open('a','beforeunload');t.mock.timers.tick(120000);await Promise.resolve();await Promise.resolve();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.accept,false);assert.equal(f.calls[0].session,'a');assert.equal(f.browser.dialogState(),null);f.browser.clearDialogs();
});
test('malformed dialog replies cannot reach Chromium',async()=>{
    const f=fixture();f.open('a','prompt');const id=f.browser.dialogState().id;
    for(const args of [[id,'yes',''],[id,true,{}],[id,true,'x'.repeat(4097)]])await assert.rejects(()=>f.browser.dialogReply(...args),/Ungültige/);
    assert.equal(f.calls.length,0);f.browser.clearDialogs();
});
