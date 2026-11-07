'use strict';
// Portable local-only EME/CDM and audio-activity check. No license-server call,
// account, proprietary module, key material, or protected-content claim.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-drm-smoke-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:root,cdmDirectory:process.env.MGU_BROWSER_CDM_DIRECTORY});
const server=http.createServer((req,res)=>res.end('<!doctype html><title>Local EME check</title>'));
const value=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const activity=async()=>{for(let i=0;i<40;i++){if(!browser.mediaQuery){await browser.inspectMedia();if(browser.lastMedia)return JSON.parse(browser.lastMedia);}await new Promise(r=>setTimeout(r,50));}throw Error('No completed media activity snapshot');};
(async()=>{try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));await browser.start('');
    await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
    for(let i=0;i<40&&!await value('isSecureContext');i++)await new Promise(r=>setTimeout(r,50));
    const capabilities=await browser.mediaCapabilities();assert.equal(capabilities.secure,true);
    assert.equal(typeof capabilities.drm.configuration,'string');assert.equal(capabilities.drm.protectedPlaybackVerified,false);
    assert.equal(capabilities.widevine,capabilities.drm.recognized);
    const clearKey=await value('(async()=>{try{await navigator.requestMediaKeySystemAccess("org.w3.clearkey",[{initDataTypes:["cenc"],videoCapabilities:[{contentType:\'video/mp4; codecs="avc1.42E01E"\'}]}]);return true;}catch(e){return false;}})()');assert(clearKey,'Browser supports standards EME separately from proprietary CDM');
    await value('window.fixtureContext=new AudioContext();window.oscillator=fixtureContext.createOscillator();window.gain=fixtureContext.createGain();gain.gain.value=0;oscillator.connect(gain).connect(fixtureContext.destination);oscillator.start();fixtureContext.resume()');
    let state;for(let i=0;i<40;i++){state=await activity();if(state.webAudioRunning>0)break;await new Promise(r=>setTimeout(r,50));}
    assert(state.playing&&state.audible&&state.webAudioRunning>0,'WebAudio running activity reported (not measured sound)');
    const first=browser.activeTab,resetStates=[];browser.on('media',state=>{if(!Object.prototype.hasOwnProperty.call(state,'rootTag'))resetStates.push(state);});await browser.newTab('');assert(resetStates.every(state=>state.audible),'Tab view resets retain last aggregate audibility');state=await activity();assert(state.audible,'Background-tab WebAudio retains audio focus');
    await browser.selectTab(first);await value('fixtureContext.close()');
    for(let i=0;i<40;i++){state=await activity();if(!state.audible)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(state.audible,false);
    // Silent generated WAV still exercises HTML activity, mute/volume semantics,
    // and background-tab aggregation without external media or device output.
    const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
    await value('document.body.innerHTML="<audio id=audio loop></audio>";audio.src="data:audio/wav;base64,'+wav.toString('base64')+'";audio.play()');
    state=await activity();assert(state.playing&&state.audible);await browser.selectTab(browser.tabs.find(t=>t.id!==first).id);state=await activity();assert(state.audible,'Background HTML audio retains audio focus');
    await browser.selectTab(first);await value('audio.volume=0');state=await activity();assert(state.playing&&!state.audible);await value('audio.volume=1;audio.muted=true');state=await activity();assert(state.playing&&!state.audible);await value('audio.pause()');state=await activity();assert(!state.playing&&!state.audible);
    console.log(JSON.stringify({capabilities,clearKey,checks:'EME diagnostics, WebAudio activity/lifecycle, background HTML/WebAudio aggregation, mute and volume zero passed',protectedPlaybackVerified:false}));
}finally{browser.destroy();await browser.closing;await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
