'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Client=require('../src/browser_client');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
    const client=Object.create(Client.prototype),calls=[],waiters=[];
    Object.assign(client,{gate:{check:()=>({allowed:true})},lastAllowed:true,generation:4,channel:{},pending:new Map()});
    client.request=(op,args)=>{calls.push({op,delta:args&&args.delta});return new Promise((resolve,reject)=>waiters.push({resolve,reject}));};
    return {client,calls,waiters,release:()=>waiters.shift().resolve({ok:true})};
}

test('Rotary burst coalesces immediately and preserves both press barriers',async()=>{
    const {client:c,calls,release}=fixture(),work=[];
    for(let i=0;i<10;i++)work.push(c.focusMedia(1));work.push(c.pressMedia());work.push(c.focusMedia(-2));work.push(c.pressMedia());
    await tick();assert.deepEqual(calls,[{op:'mediaFocus',delta:10}]);
    release();await tick();assert.equal(calls[1].op,'mediaPress');release();await tick();assert.deepEqual(calls[2],{op:'mediaFocus',delta:-2});release();await tick();assert.equal(calls[3].op,'mediaPress');release();await Promise.all(work);
});

test('Turns accumulate while one request is in flight instead of queueing every detent',async()=>{
    const {client:c,calls,release}=fixture(),work=[c.focusPage(1)];await tick();
    for(let i=0;i<8;i++)work.push(c.focusPage(1));work.push(c.pressPage());assert.equal(calls.length,1);
    release();await tick();assert.deepEqual(calls[1],{op:'pageFocus',delta:8});release();await tick();assert.equal(calls[2].op,'pagePress');release();await Promise.all(work);
});

test('Navigation cancels queued turns and presses, and fresh work waits for an old in-flight request',async()=>{
    const {client:c,calls,release}=fixture(),old=[c.focusMedia(1)];await tick();old.push(c.focusMedia(2),c.pressMedia());
    c.receive({event:'navigation',value:'https://example.org/next'});assert((await Promise.all(old)).every(r=>r.cancelled));
    const fresh=c.focusMedia(1);await tick();assert.equal(calls.length,1);release();await tick();assert.deepEqual(calls[1],{op:'mediaFocus',delta:1});release();await fresh;
});

test('History title updates retain ordering but tab and generation changes cancel stale work',async()=>{
    const {client:c,calls,release}=fixture(),first=c.focusPage(1),press=c.pressPage();
    c.receive({event:'navigationState',value:{title:'New title'}});await tick();release();await tick();assert.equal(calls[1].op,'pagePress');release();await Promise.all([first,press]);
    const stale=c.focusPage(1);await tick();c.generation++;release();assert.equal((await stale).cancelled,true);
    const held=c.focusPage(1),heldPress=c.pressPage();c.receive({event:'tabSelected',value:{id:'another'}});assert.equal((await held).cancelled,true);assert.equal((await heldPress).cancelled,true);await tick();assert.equal(calls.length,3);
});

test('Changing control mode cancels old pending activation and backend payloads stay bounded',async()=>{
    const {client:c,calls,release}=fixture(),page=c.focusPage(1);await tick();const oldPress=c.pressPage(),media=c.focusMedia(1);assert.equal((await page).cancelled,true);assert.equal((await oldPress).cancelled,true);
    release();await tick();assert.equal(calls[1].op,'mediaFocus');release();await media;
    const burst=[];for(let i=0;i<100;i++)burst.push(c.focusPage(1));await tick();
    for(let i=0;i<4;i++){assert.equal(calls[2+i].op,'pageFocus');assert.equal(calls[2+i].delta,16);release();await tick();}
    await Promise.all(burst);assert.equal(calls.length,6);
});

test('A failed focus cannot activate a later press; malformed rotations never reach IPC',async()=>{
    const {client:c,calls,waiters}=fixture();
    for(const delta of [0,NaN,Infinity,17,-17,'1',1.5])await assert.rejects(c.focusPage(delta),/Controller/);
    const turn=c.focusMedia(1),failed=assert.rejects(turn,/fixture/),press=c.pressMedia();await tick();waiters.shift().reject(Error('fixture failure'));await failed;assert.equal((await press).cancelled,true);await tick();assert.equal(calls.length,1);
});

test('Opposite directions preserve their focus boundary semantics and queued work is bounded',async()=>{
    const {client:c,calls,release}=fixture(),work=[c.focusMedia(1),c.focusMedia(-1),c.pressMedia()];await tick();assert.deepEqual(calls[0],{op:'mediaFocus',delta:1});release();await tick();assert.deepEqual(calls[1],{op:'mediaFocus',delta:-1});release();await tick();release();await Promise.all(work);
    const held=c.focusPage(1);await tick();const queued=[];for(let i=0;i<32;i++)queued.push(c.pressPage());const overflow=c.pressPage();assert.equal(c.controllerQueue.length,32);assert.equal((await overflow).cancelled,true);c.cancelController();release();await Promise.all([held,...queued]);
});

test('Local navigation cancels pending controller intent before the remote navigation event',async()=>{
    for(const method of ['start','navigate','back','forward','reload','newTab','selectTab','closeTab','clearTab']){
        const {client:c,calls,release}=fixture(),old=c.focusPage(1);await tick();const press=c.pressPage(),navigation=c[method]('fixture');assert.equal((await old).cancelled,true);assert.equal((await press).cancelled,true);assert.equal(calls.length,2,method+' sends no stale activation');release();await tick();release();await navigation;
    }
});

test('A replaced connection cannot inherit a queued turn or press',async()=>{
    const {client:c,calls,release}=fixture(),old=c.focusMedia(1);await tick();const press=c.pressMedia();c.channel={};release();assert.equal((await old).cancelled,true);assert.equal((await press).cancelled,true);assert.equal(calls.length,1);
});
