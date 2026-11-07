'use strict';
// Actual video/audio continuity through a fullscreen viewport transition. The
// sink is a private ALSA file, not BMW's proprietary firmware or loudspeakers.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),cp=require('child_process');
const Browser=process.env.MGU_BROWSER_BACKEND?require(path.join(process.env.MGU_BROWSER_BACKEND,'browser_session')):require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux user required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-fullscreen-audio-'));
const helper=process.env.MGU_AUDIO_BRIDGE||path.join(dir,'audio-bridge'),sink=path.join(dir,'output.raw'),config=path.join(dir,'system-alsa.conf');
const root=path.resolve(__dirname,'..');
if(!process.env.MGU_AUDIO_BRIDGE)cp.execFileSync('gcc',['-O2','-Wall','-Wextra','-Werror','-Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2','-Wl,--wrap=__libc_start_main',path.join(root,'native/audio_bridge.c'),'-Wl,--no-as-needed','-l:libdl.so.2','-Wl,--as-needed','-o',helper]);
fs.writeFileSync(config,'pcm.null { type null }\npcm.fixture { type file slave.pcm null file "'+sink+'" format raw }\n');
const loader=process.env.MGU_AUDIO_LOADER||['/lib64/ld-linux-x86-64.so.2','/lib/ld-linux-x86-64.so.2'].find(p=>fs.existsSync(p));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:path.join(dir,'profiles'),viewport:{width:1280,height:384},
    vehicleAudio:{binary:helper,loader,gid:process.getgid(),owner:process.getuid(),fixture:{device:'fixture'},helperEnv:Object.assign({ALSA_CONFIG_PATH:config},process.env.MGU_AUDIO_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.MGU_AUDIO_LIBRARY_PATH}:{})}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let diagnostics='',lastVisibleFrame=0,frameNumber=0,media={};
browser.on('diagnostic',message=>{diagnostics=(diagnostics+'\n'+message).slice(-8192);});
browser.on('fault',error=>console.error(error.message));
browser.on('media',state=>{media=state;});
browser.on('frame',frame=>{
    frameNumber++;
    // Sample the video-containing centre, excluding expected letterbox bars.
    let colourful=0;
    for(let y=1;y<16;y++)for(let x=1;x<16;x++){
        const offset=(Math.floor(frame.height*y/16)*frame.width+Math.floor(frame.width*(.25+x/32)))*4;
        if(frame.rgba[offset]+frame.rgba[offset+1]+frame.rgba[offset+2]>60)colourful++;
    }
    if(colourful>20)lastVisibleFrame=frameNumber;
});
async function value(expression){const r=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(check,label){for(let i=0;i<80;i++){if(await check())return;await delay(100);}throw Error(label);}
async function continuity(label){
    const began=Date.now(),frame=frameNumber,offset=fs.existsSync(sink)?fs.statSync(sink).size:0,started=await value('video.currentTime');
    await delay(label==='inline'?2000:650);await browser.inspectMedia();
    await until(()=>lastVisibleFrame>frame,label+': fresh nonblack video frame');
    const ended=await value('video.currentTime'),bytes=fs.readFileSync(sink).slice(offset);
    assert(ended>started+.25,label+': video clock advances');
    assert(bytes.length>=48000,label+': native PCM continues');
    assert(bytes.some(byte=>byte!==0),label+': native PCM contains actual nonzero soundtrack');
    assert.equal(browser.audioStatus().bridgeReady,true,label+': bridge remains ready');
    assert.equal(browser.audioStatus().routeAvailable,true,label+': owned output remains open');
    assert.equal(media.audible,true,label+': foreground media stays audible');
    const wallMs=Date.now()-began;
    if(label==='inline'){
        const elapsed=wallMs/1000;
        assert(ended-started>elapsed*.82&&ended-started<elapsed*1.18,'Native audio must keep video clock near real time');
        assert(bytes.length>192000*elapsed*.82&&bytes.length<192000*elapsed*1.18,'Native audio must sustain 48 kHz stereo S16_LE without slowing or racing the producer');
    }
    return {stage:label,wallMs,pcmBytes:bytes.length,clockAdvance:ended-started,nonblackFrames:lastVisibleFrame-frame};
}
(async()=>{try{
    console.log('Fullscreen audio Chromium: '+cp.execFileSync(browser.options.binary,['--version'],{encoding:'utf8',timeout:5000}).trim());
    const clip=process.env.MGU_FULLSCREEN_TEST_CLIP?{status:0,stdout:fs.readFileSync(process.env.MGU_FULLSCREEN_TEST_CLIP)}:cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-b:v','180k','-c:a','libopus','-b:a','48k','-f','webm','pipe:1'],{maxBuffer:3*1024*1024});
    assert.equal(clip.status,0,'Generated VP8/Opus fixture: '+String(clip.stderr));
    assert(clip.stdout.length>0&&clip.stdout.length<3*1024*1024,'Bounded generated media fixture');
    await browser.start('');await browser.audioRoute(true);
    await value('document.body.style.cssText="margin:0;background:black";document.body.innerHTML="<div id=player style=width:100%;height:100vh><video id=video loop style=width:100%;height:100%;object-fit:contain></video></div>";video.src="data:video/webm;base64,'+clip.stdout.toString('base64')+'";video.volume=.2;video.play()');
    await until(async()=>await value('video.currentTime>.2&&video.videoWidth===320'),'Video decodes');
    const results=[await continuity('inline')];
    // Real sites commonly put a player behind thousands of template nodes.
    // Media discovery must not conclude that a playing soundtrack disappeared.
    await value('(()=>{const filler=document.createDocumentFragment();for(let i=0;i<7000;i++)filler.appendChild(document.createElement("span"));document.body.insertBefore(filler,player);return true;})()');
    results.push(await continuity('large-dom-inline'));
    await browser.mediaAction('fullscreen');await until(async()=>await value('!!document.fullscreenElement'),'Fullscreen activates');
    results.push(await continuity('fullscreen'));
    await browser.resize(1280,480);results.push(await continuity('fullscreen-resize'));
    await browser.mediaAction('exit');await browser.resize(1280,384);results.push(await continuity('inline-restored'));
    await browser.audioRoute(false);assert.equal(browser.audioStatus().routeAvailable,false);
    const releasedAt=Date.now(),releasedBytes=fs.statSync(sink).size,releasedClock=await value('video.currentTime');
    await delay(1000);
    const releasedWall=Date.now()-releasedAt,releasedAdvance=await value('video.currentTime')-releasedClock;
    assert.equal(fs.statSync(sink).size,releasedBytes,'Disconnected output must discard PCM without writing to the sink');
    assert(releasedAdvance>releasedWall/1000*.82&&releasedAdvance<releasedWall/1000*1.18,'Disconnected output must also keep video clock near real time');
    results.push({stage:'route-released',wallMs:releasedWall,pcmBytes:0,clockAdvance:releasedAdvance});
    console.log('Actual video/PCM continuity: '+JSON.stringify({codec:browser.performance.codec,stages:results}));
}finally{browser.destroy();await browser.closing;assert.equal(path.dirname(dir),os.tmpdir());if(fs.rmSync)fs.rmSync(dir,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',dir]);}})().catch(error=>{console.error(error.stack);console.error('Fixture diagnostics (last 8 KiB):'+diagnostics);process.exitCode=1;});
