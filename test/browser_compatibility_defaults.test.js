'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Performance=require('../src/browser_performance');
function fixture(){
    const calls=[],pipe={send:async(method,params,session)=>{calls.push({method,params,session});return {};}};
    return {browser:Object.assign({pipe,tabs:[{session:'a'},{session:'b'}]},Performance),calls,pipe};
}
test('normal pages keep default motion preferences and content blocking is explicitly opt-in',async()=>{
    const f=fixture();await f.browser.applyPagePerformance('a');
    assert.deepEqual(f.calls,[{method:'Network.setBlockedURLs',params:{urls:[]},session:'a'},
        {method:'Emulation.setEmulatedMedia',params:{features:[]},session:'a'}]);
    await f.browser.setContentBlocking(true);
    assert(f.calls.slice(-2).every(call=>call.params.urls.some(url=>url.includes('doubleclick.net'))));
    await f.browser.applyPagePerformance('new');assert(f.calls[f.calls.length-2].params.urls.length>0,'Chosen blocking applies to newly opened tabs');
    await f.browser.setContentBlocking(false);assert(f.calls.slice(-2).every(call=>call.params.urls.length===0));
});
test('normal tab switches do not freeze hidden timers, requests or popup messages',async()=>{
    const f=fixture(),previous={id:'old',session:'a',mediaActive:false},next={id:'new',session:'b'};
    await f.browser.lifecycle(previous,next);assert.deepEqual(f.calls,[]);assert.notEqual(previous.frozen,true);
});
test('legacy frozen tabs are resumed and failed resume retains enough state for retry',async()=>{
    const f=fixture(),previous={session:'a',frozen:true},next={session:'b',frozen:true};
    await f.browser.lifecycle(previous,next);
    assert.deepEqual(f.calls.map(call=>[call.session,call.params.state]),[['a','active'],['b','active']]);
    assert.equal(previous.frozen,false);assert.equal(next.frozen,false);
    next.frozen=true;const send=f.pipe.send;f.pipe.send=async()=>{throw Error('transient resume failure');};
    await f.browser.lifecycle(null,next);assert.equal(next.frozen,true);
    f.pipe.send=send;await f.browser.lifecycle(null,next);assert.equal(next.frozen,false);
});
