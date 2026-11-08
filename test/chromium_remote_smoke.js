'use strict';
// Real Chromium + phone remote control over HTTP, native background scheduling and
// the content blocker. Run unprivileged: MGU_CHROMIUM=/path/to/chromium node test/chromium_remote_smoke.js
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const Browser=require('../src/browser_session'),{RemoteControl}=require('../src/remote_control');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-remote-smoke-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:path.join(root,'profiles'),binary:process.env.MGU_CHROMIUM||'/usr/bin/chromium',viewport:{width:1280,height:384}});
const port=39000+Math.floor(Math.random()*900);
const remote=new RemoteControl({browser,port,interfaces:()=>({lo0:[{family:'IPv4',address:'127.0.0.1',internal:false}]}),host:'127.0.0.1'});
let fixtureServer;const fixtureSockets=new Set();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function request(method,url,body,headers){
    return new Promise((resolve,reject)=>{
        const u=new URL(url),data=body?Buffer.from(JSON.stringify(body)):null;
        const req=http.request({method,hostname:u.hostname,port:u.port,path:u.pathname+u.search,headers:Object.assign(data?{'Content-Type':'application/json','Content-Length':data.length}:{},headers||{})},res=>{
            const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));
        });req.on('error',reject);if(data)req.write(data);req.end();
    });
}
(async()=>{try{
    const html='<body style="margin:0;font:28px sans-serif"><input id=f style="position:absolute;left:100px;top:100px;width:400px;height:60px;font-size:28px"><script>window.ticks=0;setInterval(()=>ticks++,50)</script>';
    fixtureServer=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Connection':'close'});res.end(html);});
    fixtureServer.on('connection',socket=>{fixtureSockets.add(socket);socket.on('close',()=>fixtureSockets.delete(socket));});
    await new Promise(resolve=>fixtureServer.listen(0,'127.0.0.1',resolve));
    await browser.start('http://127.0.0.1:'+fixtureServer.address().port+'/');await wait(800);
    assert.equal((await browser.send('Runtime.evaluate',{expression:'!!document.getElementById("f")',returnByValue:true})).result.value,true,'Authored web input fixture loads');
    const session=await remote.start(),base='http://127.0.0.1:'+port,token=session.url.split('/r/')[1];
    assert(/^http:\/\/127\.0\.0\.1:\d+\/r\/[A-Za-z0-9_-]{22}$/.test(session.url),'one-time link '+session.url);
    const pageRes=await request('GET',base+'/r/'+token);assert.equal(pageRes.status,200);assert(/Fernbedienung/.test(pageRes.body.toString()));
    assert.equal((await request('GET',base+'/r/wrong-token-wrong-token')).status,404,'wrong link is refused');
    assert.equal((await request('GET',base+'/api/state')).status,401,'API needs the token');
    const H={'X-Remote-Token':token};
    const frame=await request('GET',base+'/api/frame',null,H);assert.equal(frame.status,200,'live picture');assert(/image\/(jpeg|png)/.test(frame.headers['content-type']));
    assert.equal((await request('GET',base+'/api/frame',null,Object.assign({'If-None-Match':frame.headers.etag},H))).status,304,'unchanged picture is not resent');
    // Tap into the input field via normalized coordinates, then type like a phone.
    assert.equal((await request('POST',base+'/api/action',{op:'tap',x:300/1280,y:130/384},H)).status,200);await wait(300);
    const typed=await request('POST',base+'/api/action',{op:'text',text:'Grüße aus dem Auto'},H);assert.equal(typed.status,200,typed.body.toString());
    const value=(await browser.send('Runtime.evaluate',{expression:'document.getElementById("f").value',returnByValue:true})).result.value;
    assert.equal(value,'Grüße aus dem Auto','text from the phone reaches the focused field');
    const state=JSON.parse((await request('GET',base+'/api/state',null,H)).body);assert.equal(state.editable,true,'phone sees the focused field');
    assert.equal((await request('POST',base+'/api/action',{op:'open',url:'javascript:alert(1)'},H)).status,409,'Active non-web schemes are refused');
    // Native background policy: hidden page timers can keep login/polling alive.
    const first=browser.activeTab,firstSession=browser.session;
    await browser.newTab('');await wait(300);
    const t1=(await browser.pipe.send('Runtime.evaluate',{expression:'ticks',returnByValue:true},firstSession)).result.value;await wait(1500);
    const t2=(await browser.pipe.send('Runtime.evaluate',{expression:'ticks',returnByValue:true},firstSession)).result.value;
    await browser.selectTab(first);await wait(500);
    const t3=(await browser.send('Runtime.evaluate',{expression:'ticks',returnByValue:true})).result.value;
    assert(t3>t2,'a reselected tab runs again');
    console.log('Background tab ticks '+t1+' -> '+t2+', after return '+t3);
    assert(t2>t1,'Background timers must not be forcibly frozen');
    // The optional content blocker is still available when explicitly enabled.
    await browser.setContentBlocking(true);
    const blocked=(await browser.send('Runtime.evaluate',{expression:'fetch("https://securepubads.g.doubleclick.net/x").then(()=>"loaded",e=>"blocked:"+e.message)',awaitPromise:true,returnByValue:true})).result.value;
    assert(/^blocked/.test(blocked),'ad host blocked: '+blocked);
    remote.stop();assert.equal((await request('GET',base+'/api/state',null,H).catch(()=>({status:0}))).status,0,'server closed after stop');
    browser.stop('smoke done');await browser.closing;
    console.log('Actual sandboxed Chromium: phone remote (link, token, live picture, tap, Unicode text, web schemes), background timers and optional content blocker passed');
}finally{remote.destroy();browser.destroy();await browser.closing;for(const socket of fixtureSockets)socket.destroy();if(fixtureServer&&fixtureServer.listening)await new Promise(resolve=>fixtureServer.close(resolve));fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
