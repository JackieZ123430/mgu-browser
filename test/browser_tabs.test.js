'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EE=require('events');
const Pages=require('../src/browser_pages');
function fixture(){
    const calls=[],b=Object.assign(new EE(),Pages,require('../src/browser_performance'),{options:{},pipe:{send:async(method,params)=>{calls.push({method,params});return {}; }},epoch:1,tabQueue:Promise.resolve(),tabs:[{id:'tab-1',target:'opener',session:'session-1'}],activeTab:'tab-1',requireAllowed(){}});
    b.on('fault',e=>calls.push({fault:e.message}));
    b._attachTab=async(target,info)=>{calls.push({attached:target,info});b.tabs.push({id:target,target,session:target});b.activeTab=target;};
    b._selectTab=async id=>{b.activeTab=id;};b._newTab=async()=>{b.tabs.push({id:'replacement',target:'replacement'});b.activeTab='replacement';};
    return {b,calls};
}
const created=(id,opener='opener')=>({method:'Target.targetCreated',params:{targetInfo:{targetId:id,openerId:opener,type:'page',url:'https://example.org/',title:'Popup'}}});
const destroyed=id=>({method:'Target.targetDestroyed',params:{targetId:id}});
test('Popup adoption preserves the actual opener target and ignores unrelated pages',async()=>{
    const {b,calls}=fixture();b.targetEvent(created('unrelated','not-ours'));assert.equal(b.pendingPopups.size,0);
    b.targetEvent(created('popup'));b.targetEvent(created('popup'));await b.tabQueue;
    assert.equal(b.tabs.length,2);assert.equal(b.activeTab,'popup');assert.equal(calls.filter(x=>x.attached).length,1);assert.equal(calls.find(x=>x.attached).attached,'popup');
});
test('Popup queue respects the eight-tab limit and discards targets closed before adoption',async()=>{
    const {b,calls}=fixture();let unblock;b.tabQueue=new Promise(r=>unblock=r);
    b.targetEvent(created('short-lived'));b.targetEvent(destroyed('short-lived'));
    for(let i=0;i<9;i++)b.targetEvent(created('popup-'+i));
    assert.equal(b.pendingPopups.size,7);assert.equal(calls.filter(x=>x.method==='Target.closeTarget').length,2);
    unblock();await b.tabQueue;assert.equal(b.tabs.length,8);assert(!calls.some(x=>x.attached==='short-lived'));
});
test('Closing a page from JavaScript selects a surviving tab and replaces the last tab',async()=>{
    const {b}=fixture();b.targetEvent(created('popup'));await b.tabQueue;b.targetEvent(destroyed('popup'));await b.tabQueue;
    assert.equal(b.activeTab,'tab-1');assert.equal(b.tabs.length,1);
    b.targetEvent(destroyed('opener'));await b.tabQueue;assert.equal(b.activeTab,'replacement');assert.equal(b.tabs.length,1);
});
test('Popup queued before browser shutdown cannot attach to a new engine',async()=>{
    const {b,calls}=fixture();let unblock;b.tabQueue=new Promise(r=>unblock=r);b.targetEvent(created('old-popup'));b.epoch++;unblock();await b.tabQueue;
    assert(!calls.some(x=>x.attached));
});
test('A target created before stop/restart cannot attach through the replacement pipe',async()=>{
    const {b,calls}=fixture();let finish;b.pipe.send=async()=>new Promise(r=>finish=r);b._newTab=Pages._newTab;
    const creating=b._newTab('');b.epoch++;b.pipe={send:async()=>({})};finish({targetId:'stale-target'});
    await assert.rejects(creating,/abgebrochen/);assert(!calls.some(x=>x.attached));
});
test('Failed navigation in a newly selected tab restores the previous tab',async()=>{
    const {b}=fixture();b._attachTab=Pages._attachTab;b.tabNext=1;b.applyLocale=async()=>{};b.installVideoFit=async()=>{};
    b.pipe.send=async(method)=>method==='Target.attachToTarget'?{sessionId:'popup-session'}:{};
    b.navigate=async()=>{throw new Error('fixture-navigation-failed');};
    await assert.rejects(()=>b._attachTab('failed',{},'https://example.org/'),/fixture-navigation-failed/);
    assert.equal(b.activeTab,'tab-1');assert.equal(b.tabs.length,1);
});
test('Renderer-shared popup locale conflict is tolerated, other errors stay visible',async()=>{
    const {b}=fixture();b.locale='de-DE';let called=0;
    await Pages.applyLocale.call(b,'popup-session',{send:async(method)=>{called++;if(method==='Emulation.setLocaleOverride')throw new Error('Another locale override is already in effect');}});assert.equal(called,2);
    await assert.rejects(()=>Pages.applyLocale.call(b,'popup-session',{send:async()=>{throw new Error('fixture-protocol-error');}}),/fixture-protocol-error/);
});
test('Active tab focus emulation follows selection and blank popup remains a webpage',async()=>{
    const {b,calls}=fixture();b._selectTab=Pages._selectTab;b.session='session-1';b.viewport={width:960,height:540};b.performance={codec:'png-js'};
    b.resize=async()=>{};b.scheduleNavigation=()=>{};b.inspectInput=()=>{};
    b.tabs.push({id:'popup',target:'popup',session:'popup-session',url:'',popup:true});
    let selected;b.on('tabSelected',t=>selected=t);await b._selectTab('popup');
    assert.equal(selected.popup,true);assert.equal(selected.url,'');
    assert.deepEqual(calls.filter(x=>x.method==='Emulation.setFocusEmulationEnabled').map(x=>x.params.enabled),[false,true]);
});
test('A pending tab selection cannot act on a replacement engine after shutdown',async()=>{
    const {b}=fixture();b._selectTab=Pages._selectTab;b.session='session-1';b.tabs.push({id:'second',target:'second',session:'second-session'});
    let finish,replacementCalls=0;b.pipe.send=async()=>new Promise(r=>finish=r);
    const selecting=b._selectTab('second');b.epoch++;b.tabs=[];b.pipe={send:async()=>{replacementCalls++;return {};}};finish({});
    await assert.rejects(selecting,/abgebrochen/);assert.equal(replacementCalls,0);
});
