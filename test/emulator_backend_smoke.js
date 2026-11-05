'use strict';
// WSL-only integration test. Uses a separate temporary socket and profiles.
const fs=require('fs'),path=require('path'),net=require('net'),cp=require('child_process'),assert=require('assert');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv[2]==='--client'){
    const Client=require('../src/browser_client');let allowed=true,frames=0,url=null,nav=null,lastFrame=null,tabs=[],selected=null;
    const gate={check:()=>({allowed})},client=new Client({gate,socketPath:process.argv[3]});
    client.on('frame',f=>{assert(f.width>0&&f.height>0&&f.width<=1280&&f.height<=720);frames++;lastFrame=f;});
    client.on('navigation',v=>{url=v;});client.on('fault',e=>console.error(e.message));
    client.on('navigationState',s=>{nav=s;});
    client.on('tabs',value=>{tabs=value;});client.on('tabSelected',value=>{selected=value;});
    const until=async fn=>{for(let i=0;!fn()&&i<150;i++)await delay(100);assert(fn(),'Expected browser state was not reached');};
    (async()=>{try{
        for(let i=0;!client.channel&&i<50;i++)await delay(100);
        assert(client.channel,'App must connect to the local endpoint');
        await client.start('https://example.org/');
        for(let i=0;frames<2&&i<100;i++)await delay(100);
        assert(frames>=2,'Actual Chromium frames required');assert.equal(url,'https://example.org/');
        await until(()=>nav&&nav.url==='https://example.org/');assert.equal(nav.canBack,false,'Initial about:blank must not enable Back');
        await client.navigate('https://example.net/');await until(()=>nav&&nav.url==='https://example.net/'&&nav.canBack);
        await client.back();await until(()=>nav&&nav.url==='https://example.org/'&&nav.canForward);
        await client.forward();await until(()=>nav&&nav.url==='https://example.net/');
        await client.reload();await client.resize(640,480);
        await until(()=>lastFrame&&lastFrame.width===640&&lastFrame.height===480);
        const first=tabs[0].id;await client.newTab('https://example.org/');await until(()=>tabs.length===2&&nav&&nav.url==='https://example.org/');
        const second=tabs.find(t=>t.active).id;assert.notEqual(first,second);
        await client.selectTab(first);await until(()=>nav.url==='https://example.net/'&&selected.id===first);assert(nav.canBack,'Tab history must survive switching');
        await client.back();await until(()=>nav.url==='https://example.org/');
        await client.selectTab(second);await until(()=>selected.id===second);await client.clearTab();await until(()=>!selected.url);assert.equal(tabs.length,2,'Home must preserve other tabs');
        await client.closeTab(second);await until(()=>tabs.length===1&&selected.id===first);
        await client.closeTab(first);await until(()=>tabs.length===1&&!selected.url);assert.notEqual(tabs[0].id,first,'Closing last tab must produce a fresh empty tab');
        allowed=false;client.state();const before=frames;await delay(3200);
        assert.equal(frames,before);assert.equal(client.child,null);
        allowed=true;client.state();await client.start('https://example.net/');
        clearInterval(client.timer);await delay(4000);assert.equal(client.child,null,'Heartbeat loss must close Chromium');
        console.log('Actual Chromium: frames, history, resize, independent tabs, last-tab close, foreground and heartbeat cleanup passed');
    }finally{client.destroy();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
}else{
    if(process.platform!=='linux'||process.getuid()!==0)throw new Error('Run orchestrator as WSL root');
    const state='/home/mgu-dev/bmw-emulator',config=JSON.parse(fs.readFileSync(state+'/config.json'));
    const temp=fs.mkdtempSync('/tmp/bmw-emulator-test-'),profiles=path.join(temp,'profiles'),socket=path.join(temp,'browser.sock');
    fs.mkdirSync(profiles);for(const p of [temp,profiles]){fs.chownSync(p,config.uid,config.uid);fs.chmodSync(p,0o700);}
    const env=Object.assign({},process.env,{HOME:'/home/mgu-dev',MGU_EMULATOR_MODE:'1',MGU_BROWSER_DATA:temp,MGU_BROWSER_SOCKET:socket,MGU_CHROMIUM:config.chromium});
    const backend=cp.spawn('/usr/bin/node',[state+'/backend/local_backend.js'],{env,uid:config.uid,gid:config.uid,stdio:['ignore','inherit','inherit']});
    (async()=>{try{
        for(let i=0;!fs.existsSync(socket)&&i<50;i++)await delay(100);assert(fs.existsSync(socket));
        await new Promise((resolve,reject)=>{const s=net.createConnection(socket),t=setTimeout(()=>{s.destroy();reject(new Error('Wrong UID was not rejected'));},1500);s.on('data',()=>reject(new Error('Unauthorized protocol data')));s.on('close',()=>{clearTimeout(t);resolve();});s.on('error',()=>{});});
        const client=cp.spawn('/usr/bin/node',[__filename,'--client',socket],{env,uid:config.uid,gid:config.uid,stdio:'inherit'});
        const result=await new Promise(r=>client.once('exit',r));assert.equal(result,0);
        await delay(800);assert.equal(fs.readdirSync(profiles).length,0,'Temporary profiles must be removed');
        console.log('Peer UID authentication and profile cleanup passed');
    }finally{
        backend.kill('SIGTERM');await new Promise(r=>backend.once('exit',r));
        assert(temp.startsWith('/tmp/bmw-emulator-test-'));fs.rmSync(temp,{recursive:true,force:true});
    }})().catch(e=>{console.error(e.stack);process.exitCode=1;});
}
