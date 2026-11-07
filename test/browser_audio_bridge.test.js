'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Bridge=require('../src/browser_audio_bridge'),setup=require('../runtime/setup'),Audio=require('../src/browser_audio');
test('MGU audio setup requires the existing audio group and a trusted SmartX plugin',()=>{
    const good={lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:0,mode:0o100644})};
    assert.deepEqual(setup.audioIdentity('mgu_alsa:x:444:',good),{gid:444});
    assert.equal(setup.audioIdentity('mgu_alsa:x:0:',good),null);
    assert.equal(setup.audioIdentity('mgu_alsa:x:444:\nmgu_alsa:x:445:',good),null);
    const unsafe={lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:1000,mode:0o100666})};
    assert.equal(setup.audioIdentity('mgu_alsa:x:444:',unsafe),null);
});
test('An exited writer can still release its AudioManager route',async()=>{
    const bridge=new Bridge({});
    bridge.error='audio-helper-exited';
    const closed=await bridge.route(false);
    assert.equal(closed.routeAvailable,false);assert.equal(closed.bridgeReady,false);
    await assert.rejects(()=>bridge.route(true),/nicht vorbereitet/);
});
test('audio route readiness follows helper acknowledgements and fixed error codes',async()=>{
    const bridge=new Bridge({});assert.equal(bridge.status().bridgeReady,false);assert.equal(bridge.status().speakerVerified,false);
    await assert.rejects(()=>bridge.route(true),/nicht vorbereitet/);
    const commands=[];bridge.child={stdin:{write:data=>commands.push(data)}};bridge.message('READY');assert.equal(bridge.status().bridgeReady,true);assert.equal(bridge.status().routeAvailable,false);
    const turn=()=>new Promise(resolve=>setImmediate(resolve));
    const enabled=bridge.route(true);await turn();bridge.message('OPEN');await enabled;assert.equal(bridge.status().routeAvailable,true);
    const disabled=bridge.route(false);await turn();bridge.message('STATS 192000 4096 0');bridge.message('CLOSED');await disabled;assert.equal(bridge.status().routeAvailable,false);assert.equal(bridge.stats.dropped,4096);assert.deepEqual(commands,['1\n','0\n']);
    const failed=bridge.route(true);await turn();bridge.message('ERROR smartx-lock');await assert.rejects(failed,/smartx-lock/);assert.equal(bridge.status().reason,'smartx-lock');
    bridge.child=null;
});
test('vehicle route enable requires foreground and media while release remains possible',async()=>{
    const state={options:{mediaDisabled:false},requireAllowed(){throw Error('hidden');},vehicleAudio:{route:async value=>value}};
    await assert.rejects(()=>Audio.methods.audioRoute.call(state,true),/hidden/);assert.equal(await Audio.methods.audioRoute.call(state,false),false);
    await assert.rejects(()=>Audio.methods.audioRoute.call(state,'yes'),/Ungültig/);
});
test('releasing during device open waits and closes the same helper instead of losing the release',async()=>{
    const bridge=new Bridge({}),commands=[];bridge.child={stdin:{write:value=>commands.push(value)}};bridge.message('READY');
    const on=bridge.route(true),off=bridge.route(false);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(commands,['1\n']);
    bridge.message('OPEN');await on;await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(commands,['1\n','0\n']);
    bridge.message('CLOSED');await off;assert.equal(bridge.status().routeAvailable,false);bridge.child=null;
});
