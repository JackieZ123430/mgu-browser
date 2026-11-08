'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),Media=require('../src/browser_media');
function fixture(count){
    const calls=[],tab={id:'tab-a',session:'a'},player={tagName:'VIDEO',isConnected:true,paused:false,muted:false,ended:false,volume:1,currentTime:1,duration:10,getRootNode:()=>({host:null})};
    const pipe={send:async(method,params,session)=>{
        calls.push({method,params,session});
        if(method==='Accessibility.getFullAXTree')return {nodes:Array.from({length:count||1},(_,i)=>({backendDOMNodeId:i+1,role:{value:'Video'}}))};
        if(method==='DOM.resolveNode')return {object:{objectId:'player-'+params.backendNodeId}};
        if(method==='Runtime.callFunctionOn')return {result:{value:vm.runInNewContext('('+params.functionDeclaration+')').call(player)}};
        return {};
    }};
    const browser=Object.assign({},Media,{pipe,tabs:[tab]});
    const context={session:'a',valid:()=>true,send:(method,params)=>pipe.send(method,params,'a')};
    return {browser,context,pipe,player,calls,tab,state:{customPlayer:true,domPlayerAccessible:false}};
}
test('closed-component media uses exact own mute, pause, volume and ended flags with one cached AX scan',async()=>{
    const f=fixture();let state=await f.browser.accessibleMediaActivity(f.context,f.state);
    assert.equal(state.playing,true);assert.equal(state.audible,true);assert.equal(state.primary.paused,false);
    f.player.muted=true;state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.playing,true);assert.equal(state.audible,false);
    f.player.muted=false;f.player.volume=0;state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.audible,false);
    f.player.volume=.5;f.player.paused=true;state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.playing,false);assert.equal(state.audible,false);
    f.player.paused=false;f.player.ended=true;state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.playing,false);assert.equal(state.audible,false);
    assert.equal(f.calls.filter(c=>c.method==='Accessibility.getFullAXTree').length,1);
    f.browser.clearAccessibleMedia('a');assert.equal(f.browser.accessibleMediaCache.size,0);assert.equal(f.calls.filter(c=>c.method==='Runtime.releaseObjectGroup').length,1);
});
test('accessible media object count stays bounded and replacing a disconnected player rescans once',async()=>{
    const f=fixture(20);await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(f.browser.accessibleMediaCache.get('a').objects.length,8);
    f.player.isConnected=false;
    const state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.audible,false);assert.equal(state.unknown,true);
    assert.equal(f.calls.filter(c=>c.method==='Accessibility.getFullAXTree').length,2,'At most one immediate rescan');
    assert.equal(f.browser.accessibleMediaCache.size,0,'Unusable handles are released');
});
test('navigation invalidation prevents a late AX resolution from re-entering the live media cache',async()=>{
    const f=fixture(),send=f.pipe.send;let valid=true;f.context.valid=()=>valid;
    f.pipe.send=async(method,params,session)=>{const reply=await send(method,params,session);if(method==='DOM.resolveNode'){f.browser.clearAccessibleMedia('a');valid=false;}return reply;};
    const state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.audible,false);assert.equal(state.unknown,true);assert.equal(f.browser.accessibleMediaCache.size,0);
    assert.equal(f.calls.filter(c=>c.method==='Runtime.releaseObjectGroup').length,1);
});
test('ordinary DOM pages skip AX discovery and unsupported AX evidence stays explicitly unknown',async()=>{
    const f=fixture();let state=await f.browser.accessibleMediaActivity(f.context,{customPlayer:false,domPlayerAccessible:true});assert.equal(state.audible,false);assert.equal(state.unknown,false);assert.equal(f.calls.length,0);
    f.pipe.send=async()=>{throw Error('Unsupported accessibility domain');};
    state=await f.browser.accessibleMediaActivity(f.context,f.state);assert.equal(state.audible,false);assert.equal(state.unknown,true);
});
