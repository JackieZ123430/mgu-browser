'use strict';
// Local capabilities by default. --playback explicitly contacts the official
// public Shaka/Sintel test service. No accounts, key extraction or CDM download.
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert');
const Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const playback=process.argv.indexOf('--playback')>=0,required=playback||process.argv.indexOf('--require-widevine')>=0;
const binary=process.argv.slice(2).find(v=>v.indexOf('--')!==0)||process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-drm-probe-')),out=process.env.MGU_DRM_OUTPUT;
const browser=new Browser({gate:{check:()=>({allowed:true})},mediaDisabled:false,binary,cdmDirectory:process.env.MGU_BROWSER_CDM_DIRECTORY,profileRoot:root,viewport:{width:1280,height:720}});
let version='',lastFrame=null;browser.on('version',v=>version=v);browser.on('frame',f=>lastFrame=f);browser.on('fault',()=>{});
let shaka=null;
const server=http.createServer((req,res)=>{
    let data;
    if(req.url==='/shaka-player.compiled.js'&&shaka){data=shaka;res.setHeader('Content-Type','application/javascript; charset=utf-8');}
    else if(req.url==='/'){data=playback?fs.readFileSync(path.join(__dirname,'drm_fixture.html')):'<!doctype html><title>Local DRM diagnostic</title>';res.setHeader('Content-Type','text/html; charset=utf-8');}
    else{res.writeHead(404);res.end();return;}
    res.end(data);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const save=report=>{if(out){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}};
(async()=>{try{
    if(out){if(!path.isAbsolute(out))throw Error('MGU_DRM_OUTPUT must be an absolute directory');fs.mkdirSync(out,{recursive:true,mode:0o700});}
    if(playback){
        const script=process.env.MGU_SHAKA_SCRIPT;if(!script||!path.isAbsolute(script))throw Error('--playback requires MGU_SHAKA_SCRIPT pointing to your local public Shaka Player compiled JS');
        const st=fs.statSync(script);if(!st.isFile()||st.size>8*1024*1024)throw Error('Invalid local Shaka script');shaka=fs.readFileSync(script);
    }
    await new Promise(r=>server.listen(0,'127.0.0.1',r));await browser.start('');
    await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    let caps;for(let i=0;i<30;i++){try{caps=await browser.mediaCapabilities();if(caps.secure)break;}catch(e){}await delay(100);}
    const report={engine:version,capabilities:caps,protectedPlaybackVerified:false};save(report);
    if(!playback){console.log(JSON.stringify(report,null,2));if(required)assert(caps&&caps.widevine,'Widevine CDM creation unavailable; see capabilities.drm');return;}
    assert(caps&&caps.widevine,'Widevine CDM creation unavailable; see capabilities.drm');
    let state={};
    for(let i=0;i<120;i++){
        const r=await browser.send('Runtime.evaluate',{expression:'JSON.stringify(window.drmResult||{})',returnByValue:true});state=JSON.parse(r.result.value||'{}');
        if(state.phase==='failed'||(state.time>=15&&state.decodedFrames>5&&state.licenseResponses>0&&state.mediaKeys&&state.keyStatuses.includes('usable')))break;
        await delay(500);
    }
    report.playback=state;
    if(lastFrame){
        const colors=new Set();let luminance=0,count=0;
        for(let y=170;y<Math.min(lastFrame.height,570);y+=7)for(let x=80;x<Math.min(lastFrame.width,900);x+=7){const i=(y*lastFrame.width+x)*4,r=lastFrame.rgba[i],g=lastFrame.rgba[i+1],b=lastFrame.rgba[i+2];colors.add((r>>3)*1024+(g>>3)*32+(b>>3));luminance+=(r+g+b)/3;count++;}
        report.rendered={colors:colors.size,meanLuminance:luminance/Math.max(count,1)};
    }
    save(report);
    if(out){const shot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'widevine-playback.png'),Buffer.from(shot.data,'base64'));}
    assert.equal(state.phase,'playing');assert(state.time>=15&&state.decodedFrames>5&&state.licenseResponses>0&&state.mediaKeys&&state.keyStatuses.includes('usable'),'Encrypted playback was not verified');
    assert(report.rendered&&report.rendered.colors>24&&report.rendered.meanLuminance>5,'Projected video appears blank');
    report.protectedPlaybackVerified=true;save(report);console.log(JSON.stringify(report,null,2));
}finally{browser.destroy();await browser.closing;if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
