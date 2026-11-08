'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('net'),fs=require('fs'),os=require('os'),path=require('path');
const Client=require('../src/browser_client'),Channel=require('../src/ipc_protocol');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function bounded(event,target){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{target.removeListener(event,done);reject(Error('Timed out waiting for '+event));},1000);function done(value){clearTimeout(timer);resolve(value);}target.once(event,done);});}
async function fixture(){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-client-disconnect-')),socketPath=path.join(dir,'backend.sock'),sockets=new Set();let peer,serverChannel;
    const server=net.createServer(socket=>{peer=socket;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));serverChannel=new Channel(socket);serverChannel.json({event:'ready'});});
    await new Promise(resolve=>server.listen(socketPath,resolve));const client=new Client({socketPath,gate:{check:()=>({allowed:true})}});await bounded('ready',client);
    return {client,get peer(){return peer;},get channel(){return serverChannel;},async close(){client.destroy();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}};
}

test('An established backend disconnect clears state and emits one blocked event before retry',async()=>{
    const f=await fixture(),c=f.client,events=[];
    try{
        c.child=true;c.surface={rgba:Buffer.alloc(64)};c.controllerFullscreen=true;c.scrollRest=45;
        const pending=c.request('network'),rejected=assert.rejects(pending,/Browser-Dienst getrennt/);
        const focus=c.focusPage(1);await turn();const queued=c.focusPage(2),press=c.pressPage();
        c.on('blocked',reason=>{events.push(reason);assert.equal(c.channel,null);assert.equal(c.child,null);assert.equal(c.surface,null);assert.equal(c.controllerFullscreen,undefined);assert.equal(c.scrollRest,0);assert.equal(c.pending.size,0);assert.equal(c.controllerQueue.length,0);});
        const blocked=bounded('blocked',c);f.peer.destroy();assert.equal(await blocked,'Browser-Dienst getrennt');await rejected;
        assert((await Promise.all([focus,queued,press])).every(result=>result.cancelled),'Old controller intent must be cancelled before frontend release handlers');
        await turn();await turn();assert.deepEqual(events,['Browser-Dienst getrennt']);assert(c.retry,'Existing reconnect retry remains armed');
    }finally{await f.close();}
});

test('Initial missing backend retries without reporting an established browser as blocked',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-client-absent-')),events=[];
    const c=new Client({socketPath:path.join(dir,'missing.sock'),gate:{check:()=>({allowed:true})}});c.on('blocked',value=>events.push(value));
    try{const diagnostic=await bounded('diagnostic',c);assert.match(diagnostic,/ENOENT/);for(let i=0;i<10&&!c.retry;i++)await turn();assert(c.retry);assert.deepEqual(events,[]);assert.equal(c.channel,null);}
    finally{c.destroy();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Intentional client destruction stays quiet and does not schedule reconnect',async()=>{
    const f=await fixture(),c=f.client,events=[];c.on('blocked',value=>events.push(value));
    try{const closed=bounded('close',c.channel.socket);c.destroy();await closed;await turn();assert.deepEqual(events,[]);assert.equal(c.channel,null);assert.equal(c.child,null);assert.equal(c.retry,undefined);}
    finally{await f.close();}
});
