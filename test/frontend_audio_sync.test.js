'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const VehicleAudio=require('../src/browser_vehicle_audio');

// Exercise the frontend's actual private function rather than duplicating its
// logic. These explicit declaration boundaries also fail if its context moves.
const frontend=fs.readFileSync(path.join(__dirname,'../apps/mgu_browser/chromium_frontend.js'),'utf8');
const declaration='    function syncVehicleAudio(wanted){',following='    const audioError=';
const start=frontend.indexOf(declaration),end=frontend.indexOf(following,start);
assert(start>=0&&frontend.indexOf(declaration,start+1)<0&&end>start,'Find exactly one frontend audio synchronizer');
const synchronize=frontend.slice(start,end);
assert(synchronize.trim().endsWith('}'),'Extract the complete frontend audio function');

function deferred(){
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    return {promise,resolve,reject};
}
function fixture(options){
    options=options||{};
    const state={calls:[],focuses:0,statusRequests:0,source:{sourceID:287,name:'CarLifeMedia',availability:{availability:'A_AVAILABLE',availabilityReason:0}},
        routes:[{sourceID:287,sinkID:1024,mainConnectionID:81,connectionState:'CS_CONNECTED'},
            {sourceID:200,sinkID:1024,mainConnectionID:83,connectionState:'CS_CONNECTED'}]};
    const signals={proxy:async name=>name,onAvailable:async(proxy,notify)=>notify(true),call:async(proxy,method,args)=>{
        state.calls.push({method,args});
        if(method==='getListMainSources')return {listSources:[Object.assign({},state.source,{availability:Object.assign({},state.source.availability)})]};
        if(method==='getListMainConnections')return {listConnections:state.routes.map(route=>Object.assign({},route))};
        if(method==='hookSourceAvailablityStatusChange'){state.source.availability=Object.assign({},args.availability);return {};}
        if(method==='disconnect'){state.routes=state.routes.filter(route=>route.mainConnectionID!==args.mainConnectionID);return {amError:'E_OK'};}
        if(method==='connect'){state.routes.push({sourceID:287,sinkID:1024,mainConnectionID:17,connectionState:'CS_CONNECTED'});return {amError:'E_OK',mainConnectionID:17};}
        throw Error('Unexpected fixture method '+method);
    }};
    const audio=new VehicleAudio({signals,visible:()=>true,waitMs:100,pollMs:1,
        requestFocus:async()=>{state.focuses++;if(options.focus)await options.focus(state.focuses);},
        start:async()=>{state.calls.push({method:'startOutput'});},stop:async()=>{state.calls.push({method:'stopOutput'});}});
    const status={route:'mgu-smartx',bridgeReady:true};
    const browser={request:async op=>{
        assert.equal(op,'audioStatus');state.statusRequests++;
        return options.status?options.status(state.statusRequests):status;
    }};
    const context=vm.createContext({vehicleAudio:audio,browser,gate:{check:()=>({allowed:true})},clearTimeout,module:{exports:{}}});
    vm.runInContext('let audioWanted=false,audioSync=null,audioUnknownTimer=null,audioKnownUntil=0;\n'+synchronize+'\nmodule.exports={sync:syncVehicleAudio,wanted:()=>audioWanted,inFlight:()=>audioSync};',context);
    return Object.assign({audio,state,status},context.module.exports);
}

test('A released delayed status request rejects its old caller without acquiring audio',async()=>{
    const status=deferred(),reached=deferred(),f=fixture({status:()=>{reached.resolve();return status.promise;}});
    const old=f.sync(true),rejected=assert.rejects(old,/audio-not-visible/);
    let oldCallerContinued=false;old.then(()=>{oldCallerContinued=true;},()=>{});
    await reached.promise;await f.sync(false);status.resolve(f.status);await rejected;
    assert.equal(oldCallerContinued,false,'Cancelled setup must not let a test-tone caller continue');
    assert.equal(f.wanted(),false);assert.equal(f.inFlight(),null);assert.equal(f.state.focuses,0);
    assert.deepEqual(f.state.calls,[],'A stale status reply cannot reach AudioManager or native output');
    assert.deepEqual(f.state.routes.map(route=>route.mainConnectionID),[81,83]);
});

test('Release and resume during focus handoff acquires the fresh intent without another media event',async()=>{
    const focus=deferred(),reached=deferred(),f=fixture({focus:count=>{if(count===1){reached.resolve();return focus.promise;}}});
    const old=f.sync(true),rejected=assert.rejects(old,/audio-not-visible/);
    await reached.promise;
    const released=f.sync(false),fresh=f.sync(true);assert.notEqual(fresh,old);
    focus.resolve();await rejected;await released;await fresh;
    assert.equal(f.wanted(),true);assert.equal(f.state.focuses,2);assert.equal(f.audio.status.connected,true);
    assert.equal(f.state.calls.filter(call=>call.method==='connect').length,1);
    assert.equal(f.state.calls.filter(call=>call.method==='startOutput').length,1);
    assert.deepEqual(f.state.calls.filter(call=>call.method==='disconnect').map(call=>call.args.mainConnectionID),[81]);
    assert.deepEqual(f.state.routes.map(route=>route.mainConnectionID),[83,17],'Only the requested source is replaced');
    await f.sync(false);
    assert.deepEqual(f.state.routes.map(route=>route.mainConnectionID),[83],'Release removes only the fresh owned route');
});

test('Completing stale status work cannot clear or duplicate a fresh pending acquisition',async()=>{
    const oldStatus=deferred(),newStatus=deferred();
    const f=fixture({status:count=>count===1?oldStatus.promise:newStatus.promise});
    const old=f.sync(true),rejected=assert.rejects(old,/audio-not-visible/);
    await f.sync(false);const fresh=f.sync(true);oldStatus.resolve(f.status);await rejected;
    const repeated=f.sync(true);assert.equal(repeated,fresh,'Repeated demand reuses only the fresh pending acquisition');
    assert.equal(f.state.statusRequests,2,'Stale completion cannot trigger an extra status request');
    newStatus.resolve(f.status);await fresh;
    assert.equal(f.audio.status.connected,true);assert.equal(f.state.calls.filter(call=>call.method==='connect').length,1);
    await f.sync(false);
});
