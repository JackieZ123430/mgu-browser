'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Audio=require('../src/browser_audio');
function fixture(files){return {
    readdirSync(dir){assert.equal(dir,'/dev/snd');return Object.keys(files).filter(p=>p.indexOf(dir+'/')===0).map(p=>p.slice(dir.length+1));},
    statSync(file){if(!files[file])throw Error('missing');return {isSocket:()=>files[file].type==='socket',isCharacterDevice:()=>files[file].type==='char'};},
    accessSync(file){if(!files[file]||!files[file].accessible)throw Error('denied');}
};}
test('audio reports backend permissions without asserting speaker output',()=>{
    const io=fixture({'/dev/snd/pcmC0D0p':{type:'char',accessible:false}});
    let status=Audio.output({},io).status();assert.equal(status.routeAvailable,false);assert.equal(status.reason,'no-accessible-output');assert.equal(status.speakerVerified,false);
    status=Audio.output({PULSE_SERVER:'unix:/run/audio/native'},fixture({'/run/audio/native':{type:'socket',accessible:true}})).status();
    assert.equal(status.route,'pulse');assert.equal(status.routeAvailable,true);assert.equal(status.speakerVerified,false);
    assert(!JSON.stringify(status).includes('/run/audio/native'),'IPC diagnostics do not leak server paths');
    const direct=Audio.output({MGU_BROWSER_ALSA_DEVICE:'hw:0,0'},fixture({'/dev/snd/pcmC0D0p':{type:'char',accessible:true}}));
    assert.deepEqual(direct.args,['--alsa-output-device=hw:0,0']);assert.equal(direct.status().routeAvailable,true);
    assert.equal(Audio.output({MGU_BROWSER_ALSA_DEVICE:'hw:9,0'},fixture({'/dev/snd/pcmC0D0p':{type:'char',accessible:true}})).status().routeAvailable,false);
    assert.equal(direct.status(false).reason,'media-disabled');assert.equal(direct.status(false).routeAvailable,false);
});
test('audio rejects malformed output options and retains only fixed errors',()=>{
    for(const value of ['--no-sandbox','hw:0,0 --mute-audio','../config','a'.repeat(129)])assert.throws(()=>Audio.output({MGU_BROWSER_ALSA_DEVICE:value}),/ALSA/);
    const audio=Audio.output({PULSE_SERVER:'tcp:remote.example'},fixture({}));assert.equal(audio.status().reason,'configured-route-unverified');
    audio.observe('ALSA open failed at private path');assert.equal(audio.status().reason,'audio-stream-failed');assert(!JSON.stringify(audio.status()).includes('private'));audio.reset();assert.equal(audio.status().reason,'configured-route-unverified');
});
test('test tone requires visibility, enabled media and a page; concurrent tests are bounded',async()=>{
    const blocked=Object.assign({requireAllowed(){throw Error('hidden');}},Audio.methods);await assert.rejects(()=>blocked.audioTest(),/hidden/);
    const disabled=Object.assign({requireAllowed(){},options:{mediaDisabled:true}},Audio.methods);await assert.rejects(()=>disabled.audioTest(),/deaktiviert/);
    let finish,request;const browser=Object.assign({requireAllowed(){},options:{},session:'page',mediaContext(){return {send:(m,p)=>{request={m,p};return new Promise(r=>finish=r);}};}},Audio.methods);
    const pending=browser.audioTest();await assert.rejects(()=>browser.audioTest(),/bereits/);assert.equal(request.m,'Runtime.evaluate');assert.equal(request.p.userGesture,true);
    finish({result:{value:JSON.stringify({generated:true,durationMs:1000,audibleVerified:false})}});assert.deepEqual(await pending,{generated:true,durationMs:1000,audibleVerified:false});assert.equal(browser.audioTestPending,false);
    browser.mediaContext=()=>({send:async()=>({exceptionDetails:{text:'private-page-error'}})});await assert.rejects(()=>browser.audioTest(),/nicht erzeugt/);assert.equal(browser.audioTestPending,false);
});
