'use strict';
// Real Chromium: cookies must survive a hard kill of the engine (ignition off,
// power loss) without a master password, and the screencast pipeline must
// deliver a fluid frame rate with changed-band updates.
// Run as an unprivileged user: MGU_CHROMIUM=/path/to/chromium node test/chromium_persistence_smoke.js
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),cp=require('child_process');
const modules=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src');
const Browser=require(path.join(modules,'browser_session')),{SecureBrowserData}=require(path.join(modules,'secure_browser_data')),FrameDelta=require(path.join(modules,'frame_delta'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-persist-smoke-'));
const store=new SecureBrowserData(path.join(root,'protected'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileStore:store,profileRoot:path.join(root,'profiles'),binary:process.env.MGU_CHROMIUM||process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',viewport:{width:1280,height:384}});
let server;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
    assert.equal((await store.status()).locked,true,'fixture starts without an unlocked master password');
    await browser.start('');
    const expires=Math.floor(Date.now()/1000)+86400*30;
    await browser.send('Network.setCookie',{url:'https://example.org',name:'consent',value:'accepted',secure:true,expires});
    await browser.send('Network.setCookie',{url:'https://example.org',name:'__Host-browser-check',value:'authored-verification-fixture',path:'/',secure:true,httpOnly:true,expires});
    assert.equal(await browser.snapshotCookies(),true,'checkpoint writes the new cookie');
    await browser.send('Network.setCookie',{url:'https://example.org',name:'consent',value:'accepted',secure:true,httpOnly:true,sameSite:'Strict',expires});
    assert.equal(await browser.snapshotCookies(),true,'A flags-only change is checkpointed even when the token and expiry stay the same');
    assert.equal(await browser.snapshotCookies(),false,'An unchanged cookie snapshot is not rewritten');
    // Simulate power loss: kill the whole engine process group, no clean exit.
    process.kill(-browser.child.pid,'SIGKILL');await wait(300);await browser.closing;
    await browser.start('');
    let cookies=(await browser.send('Network.getCookies',{urls:['https://example.org']})).cookies;
    assert(cookies.some(c=>c.name==='consent'&&c.value==='accepted'),'cookie survives a hard engine kill');
    assert(cookies.some(c=>c.name==='consent'&&c.httpOnly&&c.sameSite==='Strict'),'Changed cookie flags survive the hard kill');
    assert(cookies.some(c=>c.name==='__Host-browser-check'&&c.value==='authored-verification-fixture'&&c.secure&&c.httpOnly),'A valid host-scoped verification-like cookie survives without weakening its flags');

    // Frame pipeline: an animated page for two seconds.
    const delta=new FrameDelta();let frames=0,fullBytes=0,sentBytes=0,skipped=0;
    browser.on('frame',f=>{frames++;fullBytes+=f.rgba.length;const band=delta.diff(f);if(!band){skipped++;return;}sentBytes+=band.rows*f.width*4;delta.commit(f);});
    const html='<body style="margin:0;font:40px sans-serif"><p>Static text block</p><div id=b style="height:40px;width:40px;background:red;position:absolute;top:300px"></div><script>let x=0;setInterval(()=>{x=(x+8)%1200;b.style.left=x+"px";},16)</script>';
    // An authored loopback page also works on managed test browsers which
    // disallow top-level data: navigation. Never relax their browser policy.
    server=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const navigation=await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    assert(!navigation.errorText,'Authored loopback page loads: '+navigation.errorText);
    await wait(500);frames=0;fullBytes=0;sentBytes=0;skipped=0;
    const started=Date.now();await wait(2000);const fps=frames*1000/(Date.now()-started);
    console.log('Screencast: '+fps.toFixed(1)+' fps, band upload '+(100*sentBytes/Math.max(1,fullBytes)).toFixed(1)+'% of full frames, identical frames skipped: '+skipped+', decode avg '+(browser.performance.decodeMs/Math.max(1,browser.performance.frames)).toFixed(2)+' ms');
    assert(fps>=15,'expected a fluid frame rate, got '+fps.toFixed(1));
    assert(sentBytes<fullBytes*0.5,'a small animation must not upload full frames');
    browser.stop('smoke done');await browser.closing;
    console.log('Actual sandboxed Chromium: cookies survive a hard engine kill without master password; delta screencast verified');
    console.log('COOKIE_PERSISTENCE_RESULT '+JSON.stringify({success:true,hardKill:true,changedFlags:true,hostScoped:true,codec:browser.performance.codec,fps,bandFraction:sentBytes/Math.max(1,fullBytes)}));
}finally{browser.destroy();await browser.closing;if(server&&server.listening)await new Promise(resolve=>server.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
