'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('net'),fs=require('fs'),os=require('os'),path=require('path');
const Client=require('../src/browser_client'),Channel=require('../src/ipc_protocol');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected scroll IPC request did not arrive');}
async function fixture(){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-scroll-ipc-')),socketPath=path.join(dir,'browser.sock'),sockets=new Set(),calls=[];let peer;
    const server=net.createServer(socket=>{
        sockets.add(socket);socket.on('close',()=>sockets.delete(socket));peer=new Channel(socket);peer.json({event:'ready'});
        peer.on('json',message=>{if(message.op==='scroll')calls.push(message);else if(message.id)peer.json({id:message.id,result:{ok:true}});});
    });
    await new Promise(resolve=>server.listen(socketPath,resolve));
    const client=new Client({socketPath,gate:{check:()=>({allowed:true})}});await new Promise(resolve=>client.once('ready',resolve));
    return {client,calls,get peer(){return peer;},reply(index,error){peer.json(Object.assign({id:calls[index].id},error?{error}:{result:{ok:true}}));},
        async close(){client.destroy();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}};
}
test('Unix IPC scroll bursts combine only waiting movement at the same location and modifiers',async()=>{
    const f=await fixture(),c=f.client;
    try{
        const first=c.scroll(10,{x:20,y:30,deltaX:1,modifiers:{shift:false}});await until(()=>f.calls.length===1);
        const second=c.scroll(200,{x:20,y:30,deltaX:5,modifiers:{shift:false}}),third=c.scroll(300,{x:20,y:30,deltaX:7,modifiers:{shift:false}});
        assert.equal(f.calls.length,1);f.reply(0);await until(()=>f.calls.length===2);
        assert.equal(f.calls[1].delta,500);assert.deepEqual(f.calls[1].options,{x:20,y:30,deltaX:12,modifiers:{shift:false}});
        f.reply(1);await Promise.all([first,second,third]);assert.equal(f.calls.length,2);
    }finally{await f.close();}
});
test('A rejected old-page scroll cannot erase a fresh scroll queued after navigation',async()=>{
    const f=await fixture(),c=f.client;
    try{
        const old=c.scroll(10,{x:10,y:10});await until(()=>f.calls.length===1);
        const navigation=new Promise(resolve=>c.once('navigation',resolve));f.peer.json({event:'navigation',value:'http://example.org/next'});await navigation;
        const fresh=c.scroll(20,{x:80,y:80}),outcomes=Promise.allSettled([old,fresh]);
        f.reply(0,'Webseite wurde gewechselt');await until(()=>f.calls.length===2);
        assert.equal(f.calls[1].delta,20);assert.deepEqual(f.calls[1].options,{x:80,y:80});
        f.reply(1);assert((await outcomes).every(result=>result.status==='fulfilled'),'Expected stale navigation cancellation must not reject fresh movement');
    }finally{await f.close();}
});
test('Navigation drops stale pending scroll movement before it reaches the backend',async()=>{
    const f=await fixture(),c=f.client;
    try{
        const active=c.scroll(10,{x:10,y:10});await until(()=>f.calls.length===1);
        const stale=c.scroll(30,{x:10,y:10});
        const navigation=new Promise(resolve=>c.once('navigation',resolve));f.peer.json({event:'navigation',value:'http://example.org/new'});await navigation;
        f.reply(0);await Promise.all([active,stale]);await pause();assert.equal(f.calls.length,1,'Old queued coordinates never run on the next document');
    }finally{await f.close();}
});
test('A pointer activation discards waiting wheel movement instead of scrolling underneath the click',async()=>{
    const f=await fixture(),c=f.client;
    try{
        const active=c.scroll(10,{x:10,y:10});await until(()=>f.calls.length===1);
        const stale=c.scroll(30,{x:10,y:10});await c.tap(50,60);
        f.reply(0,'Old wheel operation was cancelled');await Promise.all([active,stale]);await pause();
        assert.equal(f.calls.length,1,'A click is a cancellation barrier for pending old movement');
    }finally{await f.close();}
});
