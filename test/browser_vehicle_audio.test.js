'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),VehicleAudio=require('../src/browser_vehicle_audio');
function fixture(options){
    const f={calls:[],connections:[],visible:true,source:{sourceID:287,name:'CarLifeMedia',availability:{availability:'A_UNAVAILABLE',availabilityReason:7}}};
    f.signals={proxy:async i=>i,onAvailable:async(p,cb)=>cb(true),call:async(p,m,a)=>{
        f.calls.push({m,a});
        if(m==='getListMainSources')return {listSources:[f.source]};
        if(m==='getListMainConnections')return {listConnections:f.connections.slice()};
        if(m==='hookSourceAvailablityStatusChange')return {};
        if(m==='connect'){f.connections.push({sourceID:287,sinkID:1024,mainConnectionID:17,connectionState:'CS_CONNECTED'});return {amError:'E_OK',mainConnectionID:17};}
        if(m==='disconnect'){f.connections=f.connections.filter(c=>c.mainConnectionID!==a.mainConnectionID);return {amError:'E_OK'};}
        throw Error('unexpected-method');
    }};
    f.audio=new VehicleAudio(Object.assign({signals:f.signals,visible:()=>f.visible,start:async()=>f.calls.push({m:'startOutput'}),stop:async()=>f.calls.push({m:'stopOutput'}),waitMs:25,pollMs:1},options||{}));return f;
}
test('Vehicle audio claims confirmed inactive source, starts output after connection, and restores availability',async()=>{
    const f=fixture();await f.audio.acquire();assert.equal(f.audio.status.connected,true);
    await f.audio.release();assert.equal(f.audio.status.owned,false);
    const operations=f.calls.map(c=>c.m);assert(operations.indexOf('connect')<operations.indexOf('startOutput'));assert(operations.indexOf('stopOutput')<operations.indexOf('disconnect'));
    assert.deepEqual(f.calls.filter(c=>c.m==='hookSourceAvailablityStatusChange').map(c=>c.a.availability),[{availability:'A_AVAILABLE',availabilityReason:0},{availability:'A_UNAVAILABLE',availabilityReason:7}]);
});
test('An active source or foreign connection is left untouched',async()=>{
    for(const kind of ['available','connected']){const f=fixture();if(kind==='available')f.source.availability.availability='A_AVAILABLE';else f.connections.push({sourceID:287,sinkID:1024,mainConnectionID:81});
        await assert.rejects(()=>f.audio.acquire(),/audio-source-busy/);assert(!f.calls.some(c=>/connect|hook/.test(c.m)&&c.m!=='getListMainConnections'));assert.equal(f.connections.length,kind==='connected'?1:0);
    }
});
test('Unknown firmware source identity and SDK failures cannot create a route',async()=>{
    const f=fixture();f.source.name='OtherSource';await assert.rejects(()=>f.audio.acquire(),/audio-source-unavailable/);assert(!f.calls.some(c=>c.m==='connect'));
    const noSdk=new VehicleAudio({visible:()=>true});await assert.rejects(()=>noSdk.acquire(),/audio-sdk-unavailable/);
});
test('Visibility loss during route setup releases only the route being acquired',async()=>{
    const f=fixture();const call=f.signals.call;f.signals.call=async(p,m,a)=>{const reply=await call(p,m,a);if(m==='connect')f.visible=false;return reply;};
    await assert.rejects(()=>f.audio.acquire(),/audio-not-visible/);assert.equal(f.connections.length,0);assert.equal(f.audio.connection,null);
});
test('Reused connection IDs and another source consumer are not disconnected or marked unavailable',async()=>{
    const f=fixture();await f.audio.acquire();f.connections=[{sourceID:200,sinkID:1024,mainConnectionID:17},{sourceID:287,sinkID:1024,mainConnectionID:18}];await f.audio.release();
    assert(!f.calls.some(c=>c.m==='disconnect'));assert.equal(f.calls.filter(c=>c.m==='hookSourceAvailablityStatusChange').length,1);
});
test('Output setup failure unwinds the owned route without leaking availability',async()=>{
    const f=fixture({start:async()=>{throw Error('fixture-output-failed');}});await assert.rejects(()=>f.audio.acquire(),/fixture-output-failed/);assert.equal(f.connections.length,0);assert.equal(f.audio.changed,false);
});
test('Failed output release stays an error and later acquisition completes cleanup before any retry',async()=>{
    let refuse=true;const f=fixture({stop:async()=>{if(refuse)throw Error('fixture-stop-failed');}});await f.audio.acquire();
    await assert.rejects(()=>f.audio.release(),/fixture-stop-failed/);assert.equal(f.audio.status.connected,false);assert.equal(f.audio.status.owned,true);
    refuse=false;await assert.rejects(()=>f.audio.acquire(),/audio-output-unavailable/);assert.equal(f.audio.connection,null);assert.equal(f.connections.length,0);
    await f.audio.release();await f.audio.acquire();assert.equal(f.audio.status.connected,true);await f.audio.release();
});
test('Missing source API, malformed reply and refused source query do not mutate AudioManager',async()=>{
    for(const reply of [null,{amError:'E_NOT_POSSIBLE'},{listSources:[{sourceID:287,name:'CarLifeMedia',availability:{availability:'A_UNAVAILABLE'}}]}]){
        const f=fixture(),call=f.signals.call;f.signals.call=async(p,m,a)=>m==='getListMainSources'?reply:call(p,m,a);
        await assert.rejects(()=>f.audio.acquire(),/audio-invalid/);assert(!f.calls.some(c=>c.m==='connect'||c.m==='hookSourceAvailablityStatusChange'));
    }
});
test('Unknown connect outcome never disconnects an unowned connection or resets its availability',async()=>{
    const f=fixture(),call=f.signals.call;f.signals.call=async(p,m,a)=>{if(m==='connect'){f.connections.push({sourceID:287,sinkID:1024,mainConnectionID:73,connectionState:'CS_CONNECTED'});throw Error('fixture-rpc-timeout');}return call(p,m,a);};
    await assert.rejects(()=>f.audio.acquire(),/fixture-rpc-timeout/);assert.equal(f.connections[0].mainConnectionID,73);assert(!f.calls.some(c=>c.m==='disconnect'));
    assert.equal(f.calls.filter(c=>c.m==='hookSourceAvailablityStatusChange').length,1);
});
test('Suspended route reports interruption and does not fight another AudioManager focus owner',async()=>{
    const f=fixture();await f.audio.acquire();f.connections[0].connectionState='CS_SUSPENDED';
    await assert.rejects(()=>f.audio.acquire(),/audio-route-interrupted/);const connects=f.calls.filter(c=>c.m==='connect').length;
    await assert.rejects(()=>f.audio.acquire(),/audio-route-interrupted/);assert.equal(f.calls.filter(c=>c.m==='connect').length,connects);
    await f.audio.release();await f.audio.acquire();assert.equal(f.audio.status.connected,true);await f.audio.release();
});
test('AudioManager provider restart forgets ownership so reused IDs cannot stop another route',async()=>{
    const listeners=[],f=fixture();f.signals.onAvailable=async(p,cb)=>{listeners.push(cb);cb(true);};await f.audio.acquire();
    listeners[0](false);await f.audio.queue;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:17,connectionState:'CS_CONNECTED'}];await f.audio.release();
    assert(!f.calls.some(c=>c.m==='disconnect'));assert.equal(f.connections.length,1);
});
test('A delayed connect reply from a lost provider cannot restore obsolete ownership',async()=>{
    const callbacks=[],f=fixture();f.signals.onAvailable=async(p,cb)=>{callbacks.push(cb);cb(true);};
    let finish,reached;const waiting=new Promise(r=>reached=r),call=f.signals.call;
    f.signals.call=async(p,m,a)=>m==='connect'?new Promise(resolve=>{finish=resolve;reached();}):call(p,m,a);
    const acquiring=f.audio.acquire();await waiting;callbacks[0](false);
    f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:17,connectionState:'CS_CONNECTED'}];finish({amError:'E_OK',mainConnectionID:17});
    await assert.rejects(acquiring,/audio-route-interrupted/);await f.audio.queue.catch(()=>{});
    assert.equal(f.audio.connection,null);assert.equal(f.connections.length,1);assert(!f.calls.some(c=>c.m==='disconnect'));
});
