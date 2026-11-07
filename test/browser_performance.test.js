'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {PassThrough}=require('stream'),EE=require('events');
const FrameDelta=require('../src/frame_delta'),Channel=require('../src/ipc_protocol'),CdpPipe=require('../src/cdp_pipe');
const {markDirty,dirtySince}=require('../src/native_image_bridge');
const {SecureBrowserData}=require('../src/secure_browser_data');
const Cookies=require('../src/browser_cookies');
const frame=(w,h,fill)=>({width:w,height:h,rgba:Buffer.alloc(w*h*4,fill||0)});

test('Frame delta sends full frames first, nothing for identical frames and only the changed band afterwards',()=>{
    const d=new FrameDelta(),a=frame(64,32,1);
    assert.deepEqual(d.diff(a),{y:0,rows:32,full:true});d.commit(a);
    assert.equal(d.diff(frame(64,32,1)),null);
    const b=frame(64,32,1);b.rgba.fill(9,10*64*4,13*64*4);
    assert.deepEqual(d.diff(b),{y:10,rows:3,full:false});
    // Not committed (dropped for backpressure): the next diff is still against `a`.
    const c=frame(64,32,1);c.rgba.fill(7,20*64*4,21*64*4);
    assert.deepEqual(d.diff(c),{y:20,rows:1,full:false});
    assert.deepEqual(d.diff(frame(32,32,1)).full,true);
});

test('Frame sender writes bands without concatenation and the client reassembles the surface',()=>{
    const socket=new PassThrough(),server=new Channel(socket);let generation=5;
    const sender=FrameDelta.sender({owner:()=>server,allowed:()=>true,generation:()=>generation});
    const BrowserClient=require('../src/browser_client');
    const client=Object.assign(Object.create(BrowserClient.prototype),EE.prototype);EE.call(client);
    Object.assign(client,{gate:{check:()=>({allowed:true})},generation:5,channel:{json:m=>client.requested=m}});
    const received=[];client.on('frame',f=>received.push({dirty:f.dirty,rgba:Buffer.from(f.rgba)}));
    const reader=new Channel(new PassThrough());reader.on('frame',b=>client.frame(b));
    socket.on('data',d=>reader.receive(d));
    const a=frame(16,8,3);assert.equal(sender.send(a),true);
    assert.equal(sender.send(frame(16,8,3)),false,'identical frame is not sent');
    const b=frame(16,8,3);b.rgba.fill(200,2*16*4,4*16*4);assert.equal(sender.send(b),true);
    assert.deepEqual(received.map(r=>r.dirty),[{y:0,rows:8},{y:2,rows:2}]);
    assert.deepEqual(received[1].rgba,b.rgba);
    // A new foreground generation always starts with a full frame.
    generation=6;client.generation=6;const c=frame(16,8,3);c.rgba.fill(200,2*16*4,4*16*4);assert.equal(sender.send(c),true);
    assert.deepEqual(received[2].dirty,{y:0,rows:8});
    // A band for a surface the client does not have asks for a keyframe.
    client.surface=null;client.lastKeyframe=0;const d=frame(16,8,3);d.rgba.fill(1,0,16*4);sender.send(d);
    assert.deepEqual(client.requested,{op:'keyframe'});
});

test('Renderer upload covers the union of all versions since the last upload, else the full image',()=>{
    const im={ver:1,w:10,h:100};
    const record=require('module')._load;void record;
    im.dirtyLog=[];const push=(ver,y,rows)=>im.dirtyLog.push({ver,y,end:y+rows,w:10,h:100});
    push(2,10,5);push(3,40,2);push(4,12,1);im.ver=4;
    assert.deepEqual(dirtySince(im,1),{y:10,rows:32});
    assert.deepEqual(dirtySince(im,3),{y:12,rows:1});
    assert.equal(dirtySince(im,0),null,'version 1 was never logged');
    im.ver=5;assert.equal(dirtySince(im,3),null,'unlogged newer version forces full upload');
    assert.equal(typeof markDirty,'function');
});

test('CDP pipe parses messages split across many chunks and several messages per chunk',()=>{
    const input=new PassThrough(),output=new PassThrough(),pipe=new CdpPipe(input,output),events=[];
    pipe.on('event',e=>events.push(e));
    const big=JSON.stringify({method:'Page.screencastFrame',params:{data:'x'.repeat(300000)}});
    for(let at=0;at<big.length;at+=65536)pipe.receive(Buffer.from(big.slice(at,at+65536)));
    pipe.receive(Buffer.from('\0{"method":"A"}\0{"method":"B"}\0{"meth'));pipe.receive(Buffer.from('od":"C"}\0'));
    assert.deepEqual(events.map(e=>e.method),['Page.screencastFrame','A','B','C']);
    assert.equal(events[0].params.data.length,300000);
});

test('Cookies persist without the master password and survive a restart; deleting site data removes them',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-cookies-'));
    try{
        const store=new SecureBrowserData(root+'/protected');assert.equal((await store.status()).rememberSessions,true);
        const cookies=[{name:'consent',value:'yes',domain:'.example.org',path:'/',expires:Date.now()/1000+86400,secure:true,httpOnly:false,sameSite:'Lax',session:false,size:10},
            {name:'old',value:'x',domain:'.example.org',path:'/',expires:Date.now()/1000-10,session:false},
            {name:'sid',value:'abc',domain:'login.example.org',path:'/',expires:-1,session:true}];
        assert.equal(await store.saveCookies(cookies),true);
        assert(!fs.readFileSync(root+'/protected/cookies.bin').includes(Buffer.from('consent')));
        const again=new SecureBrowserData(root+'/protected');const loaded=await again.loadCookies();
        assert.deepEqual(loaded.map(c=>c.name),['consent','sid']);assert.equal(loaded[1].expires,undefined);assert.equal(loaded[0].size,undefined);
        // Restore via CDP in batches, skipping single bad cookies.
        const sent=[];const pipe={send:async(method,params)=>{sent.push(params.cookies.length);if(params.cookies.length>1)throw new Error('Invalid cookie fields');if(params.cookies[0].name==='sid')throw new Error('rejected');return {};}};
        const session={options:{profileStore:again}};Object.assign(session,Cookies);
        assert.equal(await session.restoreCookies(pipe),1);assert.deepEqual(sent,[2,1,1]);
        // Unchanged snapshots are not rewritten.
        session.cookieDigest=Cookies.digest(loaded);const snapshotPipe={closed:false,send:async()=>({cookies:loaded})};
        assert.equal(await session.snapshotCookies(snapshotPipe),false);
        await again.clear('sites');assert.equal(fs.existsSync(root+'/protected/cookies.bin'),false);
        // Turning "stay signed in" off is stored as an explicit version-2 choice.
        await again.configure({rememberSessions:false});assert.equal(new SecureBrowserData(root+'/protected').prefs.rememberSessions,false);
        assert.equal(await again.saveCookies(cookies),false);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Version-1 preferences with the old default turn cookie persistence on',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-prefs-'));
    try{fs.mkdirSync(root+'/protected',{mode:0o700});fs.writeFileSync(root+'/protected/preferences.json',JSON.stringify({rememberSessions:false,rememberCache:true}),{mode:0o600});
        const store=new SecureBrowserData(root+'/protected');await store.ready;assert.deepEqual(store.prefs,{rememberSessions:true,rememberCache:true});
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
