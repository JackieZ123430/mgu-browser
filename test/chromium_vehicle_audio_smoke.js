'use strict';
// End-to-end Chromium -> private ALSA FIFO -> native system-ALSA bridge.
// The fixture supplies an ALSA file sink instead of BMW's proprietary plugin.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),cp=require('child_process');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux user required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-vehicle-audio-')),helper=process.env.MGU_AUDIO_BRIDGE||path.join(dir,'audio-bridge'),sink=path.join(dir,'output.raw'),config=path.join(dir,'system-alsa.conf');
const root=path.resolve(__dirname,'..');
if(!process.env.MGU_AUDIO_BRIDGE)cp.execFileSync('gcc',['-O2','-Wall','-Wextra','-Werror','-Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2','-Wl,--wrap=__libc_start_main',path.join(root,'native/audio_bridge.c'),'-Wl,--no-as-needed','-l:libdl.so.2','-Wl,--as-needed','-o',helper]);
fs.writeFileSync(config,'pcm.null { type null }\npcm.fixture { type file slave.pcm null file "'+sink+'" format raw }\n');
const hostLoader=process.env.MGU_AUDIO_LOADER||['/lib64/ld-linux-x86-64.so.2','/lib/ld-linux-x86-64.so.2'].find(p=>fs.existsSync(p));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(dir,'profiles'),viewport:{width:960,height:540},
    vehicleAudio:{binary:helper,loader:hostLoader,gid:process.getgid(),owner:process.getuid(),fixture:{device:'fixture'},helperEnv:Object.assign({ALSA_CONFIG_PATH:config},process.env.MGU_AUDIO_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.MGU_AUDIO_LIBRARY_PATH}:{})}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let diagnostics='';
function observe(session){
    session.on('diagnostic',message=>{diagnostics=(diagnostics+'\n'+message).slice(-8192);});
    session.on('blocked',reason=>{diagnostics=(diagnostics+'\nStopped: '+reason).slice(-8192);});
}
observe(browser);
browser.on('fault',e=>console.error(e.message));
(async()=>{try{
    console.log('Audio fixture Chromium: '+fs.realpathSync(browser.options.binary)+'; '+cp.execFileSync(browser.options.binary,['--version'],{encoding:'utf8',timeout:5000}).trim());
    await browser.start('');assert.equal(browser.audioStatus().bridgeReady,true);assert.equal(browser.audioStatus().routeAvailable,false);
    await browser.audioRoute(true);assert.equal(browser.audioStatus().routeAvailable,true);
    const result=await browser.audioTest();assert.equal(result.generated,true);assert.equal(result.audibleVerified,false);
    await delay(150);await browser.audioRoute(false);
    const first=fs.readFileSync(sink);assert(first.length>96000&&first.length<512000,'Output is real-time PCM with bounded throughput');assert(first.some(b=>b!==0),'Tone reaches the native system ALSA sink');
    const before=first.length;await browser.audioTest();await delay(150);assert.equal(fs.statSync(sink).size,before,'Releasing the route stops output while FIFO samples are discarded');
    await browser.audioRoute(true);await delay(120);await browser.audioRoute(false);
    const after=fs.readFileSync(sink);assert(after.every(b=>b===0),'Reacquiring the route does not replay the tone discarded while closed');
    assert(browser.vehicleAudio.stats.dropped>0,'Native helper drops samples while disconnected');
    const pid=browser.vehicleAudio.child.pid;browser.stop('fixture complete');await browser.closing;assert.throws(()=>process.kill(pid,0),'Stopping Browser terminates its audio child');
    const mutedSink=path.join(dir,'muted.fifo'),mutedConfig=path.join(dir,'muted.conf');cp.execFileSync('mkfifo',[mutedSink]);
    fs.writeFileSync(mutedConfig,'pcm.null { type null }\npcm.fixture { type file slave.pcm null file "'+mutedSink+'" format raw }\n');
    const sinkFd=fs.openSync(mutedSink,fs.constants.O_RDWR|fs.constants.O_NONBLOCK),chunk=Buffer.alloc(4096);let nonzero=false;
    const sampler=setInterval(()=>{try{const count=fs.readSync(sinkFd,chunk,0,chunk.length,null);for(let i=0;i<count;i++)nonzero=nonzero||chunk[i]!==0;}catch(e){if(e.code!=='EAGAIN')throw e;}},10);
    const muted=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(dir,'muted-profiles'),env:{ALSA_CONFIG_PATH:mutedConfig,MGU_BROWSER_ALSA_DEVICE:'fixture'},vehicleAudio:{binary:path.join(dir,'missing-helper'),gid:process.getgid()}});
    observe(muted);
    try{await muted.start('');assert.equal(muted.audioStatus().bridgeReady,false);await muted.audioTest();muted.stop('muted fixture complete');await muted.closing;assert(!nonzero,'An unavailable vehicle bridge must not emit audio through an unmanaged output');}
    finally{muted.destroy();await muted.closing;clearInterval(sampler);fs.closeSync(sinkFd);}
    console.log('Actual sandboxed Chromium -> FIFO -> system ALSA: '+first.length+' PCM bytes, nonzero tone, paced output, disconnected discard, no stale replay, helper cleanup passed. BMW speaker hardware remains untested.');
}finally{browser.destroy();await browser.closing;fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);console.error('Fixture diagnostics (last 8 KiB):'+diagnostics);process.exitCode=1;});
