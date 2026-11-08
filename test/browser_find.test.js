'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EventEmitter=require('events');
const Find=require('../src/browser_find'),Input=require('../src/browser_input');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
    const browser=new EventEmitter(),calls=[];let held=null;
    Object.assign(browser,Find,{inputTask:Input.inputTask,session:'main',epoch:1,pageGeneration:2,inputFrameGeneration:0,requireAllowed(){},relatedFrames(){return [];}});
    browser.pipe={async send(method,params,session){
        calls.push({method,params,session});if(held&&held.method===method)return new Promise(resolve=>{held.resolve=resolve;});
        if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame-main'}}};
        if(method==='Page.createIsolatedWorld')return {executionContextId:42};
        return {result:{value:true}};
    }};
    return {browser,calls,hold(method){held={method};return value=>held.resolve(value);}};
}
test('Find rejects oversized/invalid requests before sending any browser command',async()=>{
    const f=fixture();await assert.rejects(()=>f.browser.findText('x'.repeat(257)),/256/);await assert.rejects(()=>f.browser.findText('ok',{backwards:1}),/Sucheinstellung/);await assert.rejects(()=>f.browser.findText('ok',{other:true}),/Sucheinstellung/);assert.equal(f.calls.length,0);
});
test('Navigation while Find discovers frames cannot send a search into the next page',async()=>{
    const f=fixture(),release=f.hold('Page.getFrameTree'),events=[];f.browser.on('find',s=>events.push(s));
    const work=f.browser.findText('needle');await turn();f.browser.pageGeneration++;release({frameTree:{frame:{id:'frame-main'}}});await assert.rejects(work,/Webseite wurde gewechselt/);assert.deepEqual(f.calls.map(c=>c.method),['Page.getFrameTree']);assert.equal(events.length,0);
});
test('Closing Find invalidates a late result and preserves only the closed state',async()=>{
    const f=fixture(),release=f.hold('Runtime.evaluate'),events=[];f.browser.on('find',s=>events.push(s));
    const work=f.browser.findText('needle');await turn();f.browser.clearFind();release({result:{value:true}});await assert.rejects(work,/Suche wurde geschlossen/);assert.deepEqual(events,[{active:false,query:'',found:false}]);assert.equal(f.browser.findState,null);
});
test('An iframe replacement invalidates a pending Find without publishing a false result',async()=>{
    const f=fixture(),release=f.hold('Page.createIsolatedWorld'),events=[];f.browser.on('find',s=>events.push(s));
    const work=f.browser.findText('needle');await turn();f.browser.inputFrameGeneration++;release({executionContextId:42});await assert.rejects(work,/wurde gewechselt/);assert.equal(events.length,0);assert(!f.calls.some(c=>c.method==='Runtime.evaluate'));
});
test('Find lifecycle reset releases state without foreground while public clear still checks it',()=>{
    const f=fixture(),events=[];f.browser.on('find',state=>events.push(state));f.browser.findState={session:'main',frame:'selected'};f.browser.requireAllowed=()=>{throw Error('Not foreground');};assert.throws(()=>f.browser.clearFind(),/foreground/);const serial=f.browser.findSerial||0;f.browser.resetFindState();assert.equal(f.browser.findState,null);assert.equal(f.browser.findSerial,serial+1);assert.deepEqual(events,[{active:false,query:'',found:false}]);
});
test('An unrelated ad-frame navigation keeps Find active while the selected frame navigation retires it',()=>{
    const f=fixture(),events=[];f.browser.on('find',state=>events.push(state));const state=f.browser.findState={session:'main',frame:'searched',ancestors:[{session:'main',id:'top'}]};f.browser.findEvent({method:'Page.frameNavigated',sessionId:'main',params:{frame:{id:'advertisement',parentId:'top'}}});assert.equal(f.browser.findState,state);assert.equal(events.length,0);f.browser.findEvent({method:'Page.frameNavigated',sessionId:'main',params:{frame:{id:'searched',parentId:'top'}}});assert.equal(f.browser.findState,null);assert.equal(events[0].active,false);
});
test('Parent-reported OOPIF detachment retires a nested selected frame using its captured ancestry',()=>{
    const f=fixture();f.browser.findState={session:'child',frame:'nested',ancestors:[{session:'main',id:'top'},{session:'child',id:'remote-root'}]};f.browser.findEvent({method:'Page.frameDetached',sessionId:'main',params:{frameId:'remote-root'}});assert.equal(f.browser.findState,null);
    f.browser.findState={session:'child',frame:'remote-root',ancestors:[{session:'main',id:'top'}]};f.browser.findEvent({method:'Target.detachedFromTarget',sessionId:'main',params:{sessionId:'other-ad'}});assert(f.browser.findState);f.browser.findEvent({method:'Target.detachedFromTarget',sessionId:'main',params:{sessionId:'child'}});assert.equal(f.browser.findState,null);
});
