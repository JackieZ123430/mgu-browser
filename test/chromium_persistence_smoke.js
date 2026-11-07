'use strict';
// Real Chromium: cookies must survive a hard kill of the engine (ignition off,
// power loss) without a master password, and the screencast pipeline must
// deliver a fluid frame rate with changed-band updates.
// Run as an unprivileged user: MGU_CHROMIUM=/path/to/chromium node test/chromium_persistence_smoke.js
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Browser=require('../src/browser_session'),{SecureBrowserData}=require('../src/secure_browser_data'),FrameDelta=require('../src/frame_delta');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-persist-smoke-'));
const store=new SecureBrowserData(path.join(root,'protected'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileStore:store,profileRoot:path.join(root,'profiles'),binary:process.env.MGU_CHROMIUM||'/usr/bin/chromium',viewport:{width:1280,height:384}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
    assert.equal((await store.status()).locked,true,'fixture starts without an unlocked master password');
    await browser.start('');
    const expires=Math.floor(Date.now()/1000)+86400*30;
    await browser.send('Network.setCookie',{url:'https://example.org',name:'consent',value:'accepted',secure:true,expires});
    assert.equal(await browser.snapshotCookies(),true,'checkpoint writes the new cookie');
    // Simulate power loss: kill the whole engine process group, no clean exit.
    process.kill(-browser.child.pid,'SIGKILL');await wait(300);await browser.closing;
    await browser.start('');
    let cookies=(await browser.send('Network.getCookies',{urls:['https://example.org']})).cookies;
    assert(cookies.some(c=>c.name==='consent'&&c.value==='accepted'),'cookie survives a hard engine kill');

    // Frame pipeline: an animated page for two seconds.
    const delta=new FrameDelta();let frames=0,fullBytes=0,sentBytes=0,skipped=0;
    browser.on('frame',f=>{frames++;fullBytes+=f.rgba.length;const band=delta.diff(f);if(!band){skipped++;return;}sentBytes+=band.rows*f.width*4;delta.commit(f);});
    const html='<body style="margin:0;font:40px sans-serif"><p>Static text block</p><div id=b style="height:40px;width:40px;background:red;position:absolute;top:300px"></div><script>let x=0;setInterval(()=>{x=(x+8)%1200;b.style.left=x+"px";},16)</script>';
    await browser.send('Page.navigate',{url:'data:text/html,'+encodeURIComponent(html)});
    await wait(500);frames=0;fullBytes=0;sentBytes=0;skipped=0;
    const started=Date.now();await wait(2000);const fps=frames*1000/(Date.now()-started);
    console.log('Screencast: '+fps.toFixed(1)+' fps, band upload '+(100*sentBytes/Math.max(1,fullBytes)).toFixed(1)+'% of full frames, identical frames skipped: '+skipped+', decode avg '+(browser.performance.decodeMs/Math.max(1,browser.performance.frames)).toFixed(2)+' ms');
    assert(fps>=15,'expected a fluid frame rate, got '+fps.toFixed(1));
    assert(sentBytes<fullBytes*0.5,'a small animation must not upload full frames');
    browser.stop('smoke done');await browser.closing;
    console.log('Actual sandboxed Chromium: cookies survive a hard engine kill without master password; delta screencast verified');
}finally{browser.destroy();await browser.closing;fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
