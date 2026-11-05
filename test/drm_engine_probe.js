'use strict';
// Isolated local test page and an official, public Widevine test license.
// No user accounts, key extraction, license payload logging or TLS exceptions.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
if(process.platform!=='linux'||process.getuid()===0)throw new Error('Run as unprivileged WSL user');
const base='/home/mgu-dev/bmw-emulator',Browser=require(base+'/backend/browser_session'),out=path.resolve(__dirname,'../.local/drm-test');
const profileRoot=fs.mkdtempSync(base+'/data/drm-probe-');
const browser=new Browser({gate:{check:()=>({allowed:true})},mediaDisabled:false,binary:process.argv[2]||'/opt/google/chrome/chrome',profileRoot,viewport:{width:1280,height:720}});
let version='',lastFrame=null;browser.on('version',v=>version=v);browser.on('frame',f=>lastFrame=f);browser.on('fault',()=>{});
const server=http.createServer((req,res)=>{
    const script=req.url==='/shaka-player.compiled.js',file=script?path.join(out,'shaka-player.compiled.js'):path.join(__dirname,'drm_fixture.html');
    res.setHeader('Content-Type',script?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));await browser.start('');
    await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    let caps;for(let i=0;i<20;i++){try{caps=await browser.mediaCapabilities();if(caps.secure)break;}catch(e){}await delay(100);}
    const report={engine:version,capabilities:caps};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));assert(caps&&caps.widevine,'Widevine key system unavailable');
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
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    const shot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'widevine-playback.png'),Buffer.from(shot.data,'base64'));
    assert.equal(state.phase,'playing');assert(state.time>=15&&state.decodedFrames>5&&state.licenseResponses>0&&state.mediaKeys&&state.keyStatuses.includes('usable'),'Encrypted playback was not verified');
    assert(report.rendered&&report.rendered.colors>24&&report.rendered.meanLuminance>5,'Projected video appears blank');
    console.log(JSON.stringify(report,null,2));
}finally{browser.destroy();await browser.closing;await new Promise(r=>server.close(r));assert.equal(path.dirname(profileRoot),base+'/data');fs.rmSync(profileRoot,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
