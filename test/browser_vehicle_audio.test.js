'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),VehicleAudio=require('../src/browser_vehicle_audio');
function fixture(options){
    const f={calls:[],connections:[],visible:true,source:{sourceID:287,name:'CarLifeMedia',availability:{availability:'A_UNAVAILABLE',availabilityReason:7}}};
    f.signals={proxy:async i=>i,onAvailable:async(p,cb)=>cb(true),call:async(p,m,a)=>{
        f.calls.push({m,a});
        if(m==='getListMainSources')return {listSources:[f.source]};
        if(m==='getListMainConnections')return {listConnections:f.connections.slice()};
        if(m==='hookSourceAvailablityStatusChange'){f.source.availability=Object.assign({},a.availability);return {};}
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
test('An already-available verified source acquires real focus once and gets its own route',async()=>{
    for(const available of ['A_AVAILABLE',1]){
        let focuses=0;const f=fixture({requestFocus:async()=>{focuses++;}});f.source.availability.availability=available;
        await f.audio.acquire();await f.audio.acquire();assert.equal(focuses,1);assert.equal(f.audio.connection,17);
        assert.equal(f.calls.filter(c=>c.m==='connect').length,1);assert.equal(f.calls.filter(c=>c.m==='hookSourceAvailablityStatusChange').length,0);
        await f.audio.release();assert.equal(f.source.availability.availability,available);
        assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[17]);
    }
});
test('Takeover disconnects verified CarLife routes on their exact sinks and releases only the new route',async()=>{
    let focuses=0;const f=fixture({requestFocus:async()=>{focuses++;assert(!f.calls.some(c=>c.m==='connect'||c.m==='disconnect'||c.m==='hookSourceAvailablityStatusChange'),'Focus handoff must precede the first AudioManager mutation');}});
    f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81},{sourceID:287,sinkID:777,mainConnectionID:82},{sourceID:200,sinkID:1024,mainConnectionID:91}];
    await f.audio.acquire();assert.equal(focuses,1);assert.equal(f.audio.connection,17);
    assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[81,82]);
    assert.equal(f.connections.find(c=>c.mainConnectionID===91).sourceID,200);
    const operations=f.calls.map(c=>c.m);assert(operations.lastIndexOf('disconnect')<operations.indexOf('connect'));
    await f.audio.release();assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[81,82,17]);
    assert.deepEqual(f.connections,[{sourceID:200,sinkID:1024,mainConnectionID:91}]);
});
test('Source identity and availability are read again after peer focus handoff',async()=>{
    let f;f=fixture({requestFocus:async()=>{f.connections=[];f.source.availability={availability:'A_UNAVAILABLE',availabilityReason:23};}});
    f.source.availability.availability='A_AVAILABLE';f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];
    await f.audio.acquire();assert(!f.calls.some(c=>c.m==='disconnect'));
    await f.audio.release();assert.deepEqual(f.source.availability,{availability:'A_UNAVAILABLE',availabilityReason:23});
    const invalid=fixture({requestFocus:async()=>{invalid.source.name='ReplacementSource';}});invalid.source.availability.availability='A_AVAILABLE';
    await assert.rejects(()=>invalid.audio.acquire(),/audio-source-unavailable/);
    assert(!invalid.calls.some(c=>c.m==='connect'||c.m==='disconnect'||c.m==='hookSourceAvailablityStatusChange'));
});
test('Takeover rechecks a route ID and leaves a newly reused foreign-source ID untouched',async()=>{
    const f=fixture(),call=f.signals.call;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];let reads=0;
    f.signals.call=async(p,m,a)=>{if(m==='getListMainConnections'&&++reads===3)f.connections=[{sourceID:200,sinkID:1024,mainConnectionID:81}];return call(p,m,a);};
    await f.audio.acquire();await f.audio.release();
    assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[17]);
    assert.deepEqual(f.connections,[{sourceID:200,sinkID:1024,mainConnectionID:81}]);
});
test('Takeover preserves its source/sink snapshot if a provider reuses a reply object',async()=>{
    const f=fixture(),call=f.signals.call;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];let reads=0;
    f.signals.call=async(p,m,a)=>{if(m==='getListMainConnections'&&++reads===3)f.connections[0].sinkID=999;return call(p,m,a);};
    await f.audio.acquire();await f.audio.release();
    assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[17]);
    assert.deepEqual(f.connections,[{sourceID:287,sinkID:999,mainConnectionID:81}]);
});
test('Release during focus handoff cancels the old intent even if a new acquisition is queued',async()=>{
    let finish,reached,focuses=0;const waiting=new Promise(resolve=>{reached=resolve;});
    const f=fixture({requestFocus:()=>{focuses++;if(focuses===1){reached();return new Promise(resolve=>{finish=resolve;});}return Promise.resolve();}});
    f.source.availability.availability='A_AVAILABLE';f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];
    const acquiring=f.audio.acquire();await waiting;const releasing=f.audio.release(),next=f.audio.acquire();finish();
    await assert.rejects(acquiring,/audio-not-visible/);await releasing;await next;
    assert.equal(focuses,2);assert.equal(f.calls.filter(c=>c.m==='connect').length,1);
    assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[81]);await f.audio.release();
});
test('Provider restart during focus handoff cannot act on old source routes',async()=>{
    let finish,reached;const listeners=[],waiting=new Promise(resolve=>{reached=resolve;});
    const f=fixture({requestFocus:()=>{reached();return new Promise(resolve=>{finish=resolve;});}});f.source.availability.availability='A_AVAILABLE';
    f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];f.signals.onAvailable=async(p,cb)=>{listeners.push(cb);cb(true);};
    const acquiring=f.audio.acquire();await waiting;listeners[0](false);finish();await assert.rejects(acquiring,/audio-route-interrupted/);
    await f.audio.queue.catch(()=>{});assert(!f.calls.some(c=>c.m==='connect'||c.m==='disconnect'||c.m==='hookSourceAvailablityStatusChange'));
});
test('Failed focus handoff cannot disconnect the current CarLife route',async()=>{
    const f=fixture({requestFocus:async()=>{throw Error('audio-focus-unavailable');}});f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];
    await assert.rejects(()=>f.audio.acquire(),/audio-focus-unavailable/);
    assert(!f.calls.some(c=>c.m==='connect'||c.m==='disconnect'||c.m==='hookSourceAvailablityStatusChange'));
    assert.equal(f.connections[0].mainConnectionID,81);
});
test('Provider restart during old-route disconnection cannot reuse IDs for another takeover',async()=>{
    let finish,reached;const callbacks=[],waiting=new Promise(resolve=>{reached=resolve;}),f=fixture(),call=f.signals.call;
    f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];f.signals.onAvailable=async(p,cb)=>{callbacks.push(cb);cb(true);};
    f.signals.call=async(p,m,a)=>{if(m==='disconnect'){f.calls.push({m,a});reached();return new Promise(resolve=>{finish=resolve;});}return call(p,m,a);};
    const acquiring=f.audio.acquire();await waiting;callbacks[0](false);f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];finish({amError:'E_OK'});
    await assert.rejects(acquiring,/audio-route-interrupted/);await f.audio.queue.catch(()=>{});
    assert.equal(f.connections.length,1);assert.equal(f.audio.connection,null);assert.equal(f.calls.filter(c=>c.m==='disconnect').length,1);assert(!f.calls.some(c=>c.m==='connect'));
});
test('Takeover waits for acknowledged old-route removal before connecting the new output',async()=>{
    const f=fixture(),call=f.signals.call;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];let pending=0,waited=0;
    f.signals.call=async(p,m,a)=>{
        if(m==='disconnect'&&a.mainConnectionID===81){f.calls.push({m,a});pending=2;return {amError:'E_OK'};}
        if(m==='getListMainConnections'&&pending){waited++;if(!--pending)f.connections=[];}
        if(m==='connect')assert(!f.connections.some(c=>c.mainConnectionID===81));return call(p,m,a);
    };
    await f.audio.acquire();assert.equal(waited,2);await f.audio.release();
});
test('Refused, invalid or never-removed takeover routes cannot start Browser output',async()=>{
    for(const mode of ['refused','timeout','invalid']){
        const f=fixture({waitMs:8}),call=f.signals.call;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:mode==='invalid'?0:81}];
        f.signals.call=async(p,m,a)=>m==='disconnect'?{amError:mode==='refused'?7:0}:call(p,m,a);
        await assert.rejects(()=>f.audio.acquire(),mode==='refused'?/audio-takeover-refused/:mode==='timeout'?/audio-takeover-timeout/:/audio-invalid-reply/);
        assert(!f.calls.some(c=>c.m==='connect'||c.m==='startOutput'||c.m==='hookSourceAvailablityStatusChange'));
    }
});
test('An already-disappeared takeover route accepts the official numeric non-existent reply',async()=>{
    const f=fixture(),call=f.signals.call;f.connections=[{sourceID:287,sinkID:1024,mainConnectionID:81}];
    f.signals.call=async(p,m,a)=>{if(m==='disconnect'&&a.mainConnectionID===81){f.calls.push({m,a});f.connections=[];return {amError:8};}return call(p,m,a);};
    await f.audio.acquire();assert.equal(f.audio.connection,17);await f.audio.release();
});
test('Explicit already-existing connect replies get bounded takeover retries without adopting old IDs',async()=>{
    for(const code of ['E_ALREADY_EXISTS',5]){
        let focuses=0,attempts=0;const f=fixture({requestFocus:async()=>{focuses++;}}),call=f.signals.call;
        f.signals.call=async(p,m,a)=>{
            if(m==='connect'&&++attempts<3){f.calls.push({m,a});const old=80+attempts;f.connections.push({sourceID:287,sinkID:1024,mainConnectionID:old});return {amError:code,mainConnectionID:old};}
            if(m==='disconnect'&&a.mainConnectionID!==17)assert.equal(f.audio.connection,null,'Old returned ID must not become Browser ownership');
            return call(p,m,a);
        };
        await f.audio.acquire();assert.equal(attempts,3);assert.equal(focuses,1);assert.equal(f.audio.connection,17);
        assert.deepEqual(f.calls.filter(c=>c.m==='disconnect').map(c=>c.a.mainConnectionID),[81,82]);await f.audio.release();
    }
});
test('Permanent already-existing responses stop after three attempts and restore our availability change',async()=>{
    let focuses=0,attempts=0;const f=fixture({requestFocus:async()=>{focuses++;}}),call=f.signals.call;
    f.signals.call=async(p,m,a)=>{if(m==='connect'){attempts++;return {amError:5};}return call(p,m,a);};
    await assert.rejects(()=>f.audio.acquire(),/audio-connect-refused/);assert.equal(attempts,3);assert.equal(focuses,1);assert.equal(f.audio.connection,null);
    assert.deepEqual(f.source.availability,{availability:'A_UNAVAILABLE',availabilityReason:7});assert(!f.calls.some(c=>c.m==='disconnect'));
});
test('Other explicit connect failures are not treated as retryable busy responses',async()=>{
    for(const code of ['E_NOT_POSSIBLE',7]){
        let attempts=0;const f=fixture(),call=f.signals.call;
        f.signals.call=async(p,m,a)=>{if(m==='connect'){attempts++;return {amError:code};}return call(p,m,a);};
        await assert.rejects(()=>f.audio.acquire(),/audio-connect-refused/);assert.equal(attempts,1);
        assert.deepEqual(f.source.availability,{availability:'A_UNAVAILABLE',availabilityReason:7});
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
