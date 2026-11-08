'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Media=require('../src/browser_media');
function fixture(send){
    const events=[],calls=[],pipe={send:async(method,params,session,timeout)=>{calls.push({method,session,timeout});return send(method,params,session,timeout);}};
    const browser=Object.assign({},Media,{pipe,session:'a',pageGeneration:1,requireAllowed(){},emit:(name,state)=>events.push({name,state}),webAudioActivity:()=>({running:0}),mediaActivity:async()=>({playing:false,audible:false}),accessibleMediaActivity:async()=>({playing:false,audible:false,unknown:false})});
    return {browser,pipe,events,calls};
}
test('a rejected media snapshot emits bounded unknown activity while preserving only same-view controls',async()=>{
    let fail=false;const snapshot={hasMedia:true,playing:true,audible:true,fullscreen:true,playerMode:true,customPlayer:false,hasSiteControls:true,customSiteControls:true,paused:false,muted:false,currentTime:10,duration:100,domPlayerAccessible:true};
    const f=fixture(async()=>{if(fail)throw Error('private page diagnostic');return {result:{value:JSON.stringify(snapshot)}};});
    await f.browser.inspectMedia();assert.equal(f.events.length,1);assert.equal(f.events[0].state.audible,true);
    fail=true;await f.browser.inspectMedia();assert.equal(f.events.length,2);
    const state=f.events[1].state;assert.equal(state.activityUnknown,true);assert.equal(state.audible,false);assert.equal(state.playing,true);assert.equal(state.fullscreen,true);assert.equal(state.hasSiteControls,true);assert.equal(state.currentTime,10);
    assert.equal(f.browser.mediaActivityState.audible,false);assert.equal(f.browser.mediaActivityState.activityUnknown,true);assert(!f.browser.lastMedia.includes('private'));
    assert(f.calls.every(call=>call.timeout===1500),'Snapshot queries must have a short bounded deadline');
    await f.browser.inspectMedia();assert.equal(f.events.length,2,'Repeated identical failures do not manufacture new evidence');assert.equal(f.browser.mediaQuery,false);
});
test('a media snapshot rejected after a tab/context change cannot emit or overwrite the new activity state',async()=>{
    let reject;const f=fixture(()=>new Promise((resolve,fail)=>{reject=fail;}));
    const pending=f.browser.inspectMedia();assert.equal(f.browser.mediaQuery,true);
    f.browser.session='b';f.browser.pageGeneration++;f.browser.mediaActivityState={playing:false,audible:false};
    reject(Error('old renderer failed'));await pending;
    assert.equal(f.events.length,0);assert.deepEqual(f.browser.mediaActivityState,{playing:false,audible:false});assert.equal(f.browser.mediaQuery,false);
});
test('a first failure in a different renderer context does not reuse cached old player UI or audibility',async()=>{
    const f=fixture(async()=>{throw Error('busy renderer');});
    f.browser.lastMedia=JSON.stringify({fullscreen:true,playing:true,audible:true,hasMedia:true});f.browser.lastMediaSession='old';f.browser.lastMediaView=0;f.browser.lastMediaPipe={};
    await f.browser.inspectMedia();assert.equal(f.events.length,1);
    assert.equal(f.events[0].state.fullscreen,false);assert.equal(f.events[0].state.hasMedia,false);assert.equal(f.events[0].state.playing,false);assert.equal(f.events[0].state.audible,false);assert.equal(f.events[0].state.activityUnknown,true);
});
test('optional AX control discovery failure preserves confirmed media flags, fullscreen and same-view controls',async()=>{
    const snapshot={hasMedia:true,playing:false,audible:false,fullscreen:true,playerMode:true,customPlayer:true,hasSiteControls:false,customSiteControls:false,paused:true,muted:false,domPlayerAccessible:false};
    const f=fixture(async()=>({result:{value:JSON.stringify(snapshot)}}));
    f.browser.accessibleMediaActivity=async()=>({playing:true,audible:true,unknown:false,primary:{paused:false,muted:false,currentTime:4,duration:10}});
    f.browser.accessibleMediaControls=async()=>{throw Error('private control-tree diagnostic');};
    await f.browser.inspectMedia();let state=f.events[0].state;
    assert.equal(state.playing,true);assert.equal(state.audible,true);assert.equal(state.activityUnknown,false);assert.equal(state.fullscreen,true);assert.equal(state.paused,false);
    const controls=[{node:1},{node:2}];f.browser.mediaAXCache=controls;f.browser.mediaAXStamp=0;
    await f.browser.inspectMedia();state=f.events[f.events.length-1].state;
    assert.equal(state.audible,true);assert.equal(state.activityUnknown,false);assert.equal(state.fullscreen,true);assert.equal(state.accessibleControls,2);assert.equal(state.hasSiteControls,true);assert.equal(f.browser.mediaAXCache,controls);
    assert.equal(f.browser.mediaActivityState.audible,true);assert(!f.browser.lastMedia.includes('private'));
});
test('a rejected optional control-tree request after context change cannot emit old confirmed media',async()=>{
    const snapshot={hasMedia:true,playing:false,audible:false,fullscreen:true,playerMode:true,customPlayer:true,hasSiteControls:false,domPlayerAccessible:false};
    const f=fixture(async()=>({result:{value:JSON.stringify(snapshot)}}));let reject;
    f.browser.accessibleMediaActivity=async()=>({playing:true,audible:true,unknown:false});
    f.browser.accessibleMediaControls=()=>new Promise((resolve,fail)=>{reject=fail;});
    const pending=f.browser.inspectMedia();await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof reject,'function');
    f.browser.session='b';f.browser.pageGeneration++;f.browser.mediaActivityState={playing:false,audible:false};
    reject(Error('old optional request failed'));await pending;
    assert.equal(f.events.length,0);assert.deepEqual(f.browser.mediaActivityState,{playing:false,audible:false});assert.equal(f.browser.mediaQuery,false);
});
