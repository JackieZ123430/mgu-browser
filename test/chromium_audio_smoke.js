'use strict';
// Real Chromium writes its ALSA output into a private file sink. No speakers,
// vehicle services, network or disabling the browser sandbox are required.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),cp=require('child_process');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux user required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-audio-')),pcm=path.join(dir,'output.raw'),config=path.join(dir,'alsa.conf');
// A FIFO consumer supplies device-like backpressure. An unpaced ALSA null
// device otherwise emits hundreds of MB during a one-second wall-clock test.
cp.execFileSync('mkfifo',[pcm]);let bytes=0,nonzero=false,resumeTimer;
const sink=fs.createReadStream(pcm,{highWaterMark:4096});sink.on('data',chunk=>{bytes+=chunk.length;nonzero=nonzero||chunk.some(b=>b!==0);sink.pause();resumeTimer=setTimeout(()=>sink.resume(),10);});
fs.writeFileSync(config,'pcm.null { type null }\npcm.mgu_test { type file slave.pcm null file "'+pcm+'" format raw }\n');
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(dir,'profiles'),env:{ALSA_CONFIG_PATH:config,MGU_BROWSER_ALSA_DEVICE:'mgu_test'},viewport:{width:960,height:540}});
browser.on('fault',e=>console.error(e.message));
(async()=>{try{
    await browser.start('');const result=await browser.audioTest();assert.equal(result.generated,true);assert.equal(result.audibleVerified,false);
    browser.stop('audio fixture complete');await browser.closing;
    assert(bytes>32000,'Chromium must write PCM to the ALSA sink');assert(nonzero,'PCM contains audible samples, not only silence');
    console.log('Actual sandboxed Chromium: explicit 1 s WebAudio tone produced '+bytes+' PCM bytes with nonzero samples through ALSA. Physical speaker routing remains unverified.');
}finally{browser.destroy();await browser.closing;clearTimeout(resumeTimer);sink.destroy();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
