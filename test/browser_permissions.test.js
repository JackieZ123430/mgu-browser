'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EE=require('events'),vm=require('vm');
const Permissions=require('../src/browser_permissions');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
    const browser=new EE(),calls=[],events=[],states={};let shown=true;
    const tree={frame:{id:'main',url:'https://parent.example/path',securityOrigin:'https://parent.example'},childFrames:[{frame:{id:'child',url:'https://embed.example/form',securityOrigin:'https://embed.example'}}]};
    const pipe={send:async(method,params,session)=>{calls.push({method,params,session});
        if(method==='Page.getFrameTree')return {frameTree:tree};
        if(method==='Runtime.evaluate'&&params.awaitPromise)return {result:{value:Permissions.permissionNames.map(name=>({name,state:states[name]||'prompt'}))}};
        if(method==='Browser.setPermission')states[params.permission.name]=params.setting;
        return {};
    }};
    Object.assign(browser,Permissions,{pipe,session:'tab',epoch:1,pageGeneration:1,gate:{check:()=>({allowed:shown})},requireAllowed(){if(!shown)throw Error('not visible');}});
    browser.on('permission',event=>events.push(event));
    const context=(id,origin,frameId)=>browser.permissionEvent({method:'Runtime.executionContextCreated',sessionId:'tab',params:{context:{id,origin,auxData:{isDefault:true,frameId}}}});
    return {browser,calls,events,tree,context,hide:()=>{shown=false;}};
}

test('Site permission controls apply native decisions only to the verified current origin',async()=>{
    const f=fixture();
    const status=await f.browser.permissionStatus();assert.equal(status.origin,'https://parent.example');assert.equal(status.permissions.length,6);
    const changed=await f.browser.permissionSet('geolocation','granted','https://parent.example');assert.equal(changed.permissions.find(p=>p.name==='geolocation').state,'granted');
    const call=f.calls.find(c=>c.method==='Browser.setPermission');assert.deepEqual(call.params,{permission:{name:'geolocation'},setting:'granted',origin:'https://parent.example',embeddedOrigin:'https://parent.example'});assert.equal(call.session,undefined);
    await assert.rejects(f.browser.permissionSet('arbitrary-native-feature','granted'),/Unsupported/);
    await assert.rejects(f.browser.permissionSet('camera','arbitrary','https://parent.example'),/Unsupported/);
    assert.equal(f.calls.filter(c=>c.method==='Browser.setPermission').length,1);
});

test('An iframe request cannot spoof its requesting or embedding origin',async()=>{
    const f=fixture();f.context(7,'https://embed.example','child');
    await f.browser.permissionRequest('tab',7,JSON.stringify({id:4,names:['microphone','camera'],origin:'https://forged.example'}));
    assert.equal(f.events.length,1);const event=f.events[0];assert.equal(event.origin,'https://embed.example');assert.equal(event.embeddingOrigin,'https://parent.example');
    await f.browser.permissionAnswer(event.id,'granted');
    const grants=f.calls.filter(c=>c.method==='Browser.setPermission');assert.equal(grants.length,2);assert(grants.every(c=>c.params.origin==='https://parent.example'&&c.params.embeddedOrigin==='https://embed.example'));
    assert.deepEqual(f.events[1],Object.assign({},event,{state:'resolved',setting:'granted'}));
    const response=f.calls.find(c=>c.method==='Runtime.evaluate'&&c.params.contextId===7);assert.equal(response.params.expression,'window.__mguPermissionUIResolve(4,true)');
});

test('Invalid, opaque, forged or background permission bindings never reach a grant',async()=>{
    const f=fixture();f.context(7,'https://embed.example','child');f.context(8,'null','child');
    for(const payload of ['invalid',JSON.stringify({id:'1);danger()',names:['camera']}),JSON.stringify({id:1,names:['unknown']}),'x'.repeat(1025)])await f.browser.permissionRequest('tab',7,payload);
    await f.browser.permissionRequest('tab',8,JSON.stringify({id:1,names:['camera']}));
    await f.browser.permissionRequest('other-tab',7,JSON.stringify({id:1,names:['camera']}));
    f.tree.childFrames[0].frame.securityOrigin='https://different.example';await f.browser.permissionRequest('tab',7,JSON.stringify({id:1,names:['camera']}));
    f.hide();await f.browser.permissionRequest('tab',7,JSON.stringify({id:1,names:['camera']}));
    assert.equal(f.events.length,0);assert(!f.calls.some(c=>c.method==='Browser.setPermission'));
});

test('Navigation and tab cancellation expire only pending UI without granting another page',async()=>{
    const f=fixture();f.context(7,'https://embed.example','child');await f.browser.permissionRequest('tab',7,JSON.stringify({id:1,names:['geolocation']}));
    const id=f.events[0].id;f.browser.permissionEvent({method:'Page.frameNavigated',sessionId:'tab',params:{frame:{id:'child'}}});
    assert.equal(f.events[1].state,'resolved');assert.equal(f.events[1].id,id);assert(!f.calls.some(c=>c.method==='Browser.setPermission'));
    await assert.rejects(f.browser.permissionAnswer(id,'granted'),/expired/);
    assert(f.calls.some(c=>c.method==='Runtime.evaluate'&&c.params.expression==='window.__mguPermissionUIResolve(1,false)'));
});

test('A changed page during frame-authority lookup cannot receive a permission decision',async()=>{
    const f=fixture(),send=f.browser.pipe.send;
    f.browser.pipe.send=async(method,params,session)=>{const result=await send(method,params,session);if(method==='Page.getFrameTree')f.browser.pageGeneration++;return result;};
    await assert.rejects(f.browser.permissionSet('geolocation','granted','https://parent.example'),/changed/);assert(!f.calls.some(c=>c.method==='Browser.setPermission'));
});

test('Permission requests are bounded and duplicate page IDs cannot create repeated prompts',async()=>{
    const f=fixture();f.context(7,'https://embed.example','child');
    for(let i=1;i<=8;i++)await f.browser.permissionRequest('tab',7,JSON.stringify({id:i,names:['camera']}));
    assert.equal(f.browser.permissionPending.size,1);assert.equal(Array.from(f.browser.permissionPending.values())[0].pageIds.length,8);
    for(const [index,name] of ['microphone','notifications','geolocation','clipboard-read'].entries())await f.browser.permissionRequest('tab',7,JSON.stringify({id:20+index,names:[name]}));
    assert.equal(f.browser.permissionPending.size,4);assert.equal(f.events.length,4);
    f.browser.cancelPermissionRequests();assert.equal(f.browser.permissionPending.size,0);
    await f.browser.permissionRequest('tab',7,JSON.stringify({id:1,names:['camera']}));await f.browser.permissionRequest('tab',7,JSON.stringify({id:1,names:['camera']}));assert.equal(f.browser.permissionPending.size,1);
    f.browser.clearPermissions();assert.equal(f.browser.permissionContexts.size,0);
});

test('Insecure non-loopback pages cannot be made permission-capable by the browser panel',async()=>{
    const f=fixture();f.tree.frame.securityOrigin='http://ordinary.example';f.tree.frame.url='http://ordinary.example/';
    assert.equal((await f.browser.permissionStatus()).available,false);await assert.rejects(f.browser.permissionSet('geolocation','granted','https://parent.example'),/Secure website/);
    assert(!f.calls.some(c=>c.method==='Browser.setPermission'));
});

test('A stale or missing website origin cannot grant permissions to a newly navigated site',async()=>{
    const f=fixture(),shown=await f.browser.permissionStatus();
    f.tree.frame.securityOrigin='https://next.example';f.tree.frame.url='https://next.example/';
    await assert.rejects(f.browser.permissionSet('camera','granted',shown.origin),/website changed/);
    await assert.rejects(f.browser.permissionSet('camera','granted'),/origin required/);
    assert(!f.calls.some(c=>c.method==='Browser.setPermission'));
});

function oopifFixture(){
    const f=fixture(),send=f.browser.pipe.send;
    f.browser.tabs=[{id:'first',session:'tab',target:'main',mainFrame:'main'}];
    const trees={childSession:{frame:{id:'remote',url:'https://remote.example/',securityOrigin:'https://remote.example'}},nestedSession:{frame:{id:'nested',url:'https://nested.example/',securityOrigin:'https://nested.example'}}};
    f.browser.pipe.send=async(method,params,session)=>{if(method==='Page.getFrameTree'&&trees[session]){f.calls.push({method,params,session});return {frameTree:trees[session]};}return send(method,params,session);};
    f.attach=(session,parentSession,target,parentTarget,parentFrame)=>f.browser.permissionAttachFrame({method:'Target.attachedToTarget',sessionId:parentSession,params:{sessionId:session,waitingForDebugger:true,targetInfo:{type:'iframe',targetId:target,parentId:parentTarget,parentFrameId:parentFrame}}});
    f.contextAt=(session,id,frameId,origin)=>f.browser.permissionEvent({method:'Runtime.executionContextCreated',sessionId:session,params:{context:{id,origin,auxData:{isDefault:true,frameId}}}});
    return f;
}

test('Only protocol-owned iframe sessions receive native bindings and shared frame authority',async()=>{
    const f=oopifFixture();
    await f.attach('forgedSession','tab','forged','foreign','main');assert.equal(f.browser.frameOwner('forgedSession'),null);
    await f.attach('missingFrameSession','tab','missing','main','not-an-owned-frame');assert.equal(f.browser.frameOwner('missingFrameSession'),null);
    await f.attach('childSession','tab','remote','main','main');
    const child=f.browser.frameOwner('childSession');assert.equal(child.mainSession,'tab');assert.equal(child.target,'remote');assert.equal(child.parentTarget,'main');assert.equal(child.parentFrame,'main');
    assert.deepEqual(f.browser.relatedFrames('tab'),[child]);assert.deepEqual(f.browser.relatedFrames('other-tab'),[]);
    assert(f.calls.some(call=>call.method==='Page.setInterceptFileChooserDialog')===false,'Only available file handlers enable interception');
    for(const method of ['Page.enable','Runtime.enable','Runtime.addBinding','Page.addScriptToEvaluateOnNewDocument','Target.setAutoAttach','Runtime.runIfWaitingForDebugger'])assert(f.calls.some(call=>call.method===method&&call.session==='childSession'));
    f.browser.tabs=[];assert.equal(f.browser.frameOwner('childSession'),null);assert.deepEqual(f.browser.relatedFrames('tab'),[]);
    f.browser.clearPermissions();
});

test('Nested child origins use native authority and all owned sessions retire on owner navigation',async()=>{
    const f=oopifFixture();
    await f.attach('childSession','tab','remote','main','main');await f.attach('nestedSession','childSession','nested','remote','remote');
    f.contextAt('childSession',1,'remote','https://remote.example');f.contextAt('nestedSession',2,'nested','https://nested.example');
    await f.browser.permissionRequest('nestedSession',2,JSON.stringify({id:5,names:['geolocation'],origin:'https://fake.example'}));
    const pending=f.events[0];assert.equal(pending.origin,'https://nested.example');assert.equal(pending.embeddingOrigin,'https://parent.example');
    await f.browser.permissionAnswer(pending.id,'denied');
    assert(f.calls.some(call=>call.method==='Browser.setPermission'&&call.params.origin==='https://parent.example'&&call.params.embeddedOrigin==='https://nested.example'));
    await f.browser.permissionRequest('childSession',1,JSON.stringify({id:6,names:['camera']}));const id=f.events[f.events.length-1].id;
    f.browser.permissionEvent({method:'Runtime.executionContextsCleared',sessionId:'tab',params:{}});
    assert.deepEqual(f.browser.relatedFrames('tab'),[]);assert.equal(f.browser.permissionContexts.size,0);assert.equal(f.browser.permissionPending.size,0);
    await assert.rejects(f.browser.permissionAnswer(id,'granted'),/expired/);
    for(const session of ['childSession','nestedSession'])assert(f.calls.some(call=>call.method==='Target.detachFromTarget'&&call.params.sessionId===session));
});

test('Child navigation invalidates stale decisions and unrelated iframe navigation preserves focused input',async()=>{
    const f=oopifFixture();await f.attach('childSession','tab','remote','main','main');f.contextAt('childSession',1,'remote','https://remote.example');
    f.browser.inputFocusedFrame={session:'tab',frameId:'main'};
    const generation=f.browser.frameOwner('childSession').generation;
    f.browser.permissionEvent({method:'Page.frameNavigated',sessionId:'childSession',params:{frame:{id:'remote',url:'https://new.example/'}}});
    assert.equal(f.browser.frameOwner('childSession').generation,generation+1);assert.equal(f.browser.inputFrameGeneration,undefined);
    f.browser.inputFocusedFrame={session:'childSession',frameId:'remote'};
    f.browser.permissionEvent({method:'Page.frameNavigated',sessionId:'childSession',params:{frame:{id:'remote',url:'https://remote.example/'}}});assert.equal(f.browser.inputFrameGeneration,1);
    f.browser.inputFocusedFrame=null;f.browser.permissionEvent({method:'Page.frameNavigated',sessionId:'tab',params:{frame:{id:'child',parentId:'main'}}});assert.equal(f.browser.inputFrameGeneration,2);
    f.browser.clearPermissions();
});

test('A parent navigation during child attachment resumes and detaches the stale child',async()=>{
    const f=oopifFixture(),send=f.browser.pipe.send;
    f.browser.pipe.send=async(method,params,session)=>{const result=await send(method,params,session);if(method==='Page.getFrameTree'&&session==='tab')f.browser.permissionEvent({method:'Runtime.executionContextsCleared',sessionId:'tab',params:{}});return result;};
    await f.attach('childSession','tab','remote','main','main');assert.equal(f.browser.frameOwner('childSession'),null);
    assert(f.calls.some(call=>call.method==='Runtime.runIfWaitingForDebugger'&&call.session==='childSession'));assert(f.calls.some(call=>call.method==='Target.detachFromTarget'&&call.params.sessionId==='childSession'));
});

test('A paused iframe with no first execution context still installs its future-document hooks',async()=>{
    const f=oopifFixture(),send=f.browser.pipe.send;
    f.browser.pipe.send=async(method,params,session)=>{const result=await send(method,params,session);if(method==='Runtime.evaluate'&&session==='childSession')throw Error('Cannot find default execution context');return result;};
    await f.attach('childSession','tab','remote','main','main');assert(f.browser.frameOwner('childSession'));
    assert(f.calls.some(call=>call.method==='Page.addScriptToEvaluateOnNewDocument'&&call.session==='childSession'));assert(f.calls.some(call=>call.method==='Target.setAutoAttach'&&call.session==='childSession'));assert(f.calls.some(call=>call.method==='Runtime.runIfWaitingForDebugger'&&call.session==='childSession'));
    assert(!f.calls.some(call=>call.method==='Target.detachFromTarget'&&call.params.sessionId==='childSession'));f.browser.clearPermissions();
});

test('Closing or detaching a main tab releases its bounded native context registry',async()=>{
    const f=oopifFixture();await f.attach('childSession','tab','remote','main','main');f.context(1,'https://parent.example','main');f.contextAt('childSession',2,'remote','https://remote.example');
    f.browser.permissionEvent({method:'Target.targetDestroyed',params:{targetId:'main'}});assert.equal(f.browser.permissionContexts.size,0);assert.deepEqual(f.browser.relatedFrames('tab'),[]);
    f.context(3,'https://parent.example','main');f.browser.tabs=[];f.browser.permissionEvent({method:'Target.detachedFromTarget',params:{sessionId:'tab'}});assert.equal(f.browser.permissionContexts.size,0);
});

test('Bridge forwards only prompt decisions, preserves native outcomes and cancels watches safely',async()=>{
    const states={geolocation:'prompt',notifications:'granted','clipboard-read':'prompt'},bindings=[],native=[],timers=new Set();
    const geolocation={getCurrentPosition(success,error){native.push('position');success({native:true});},watchPosition(){native.push('watch');return 41;},clearWatch(id){native.push(['clear',id]);}};
    const sandbox={Map,Number,Promise,JSON,DOMException:global.DOMException||Error,setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timers.add(timer);return timer;},clearTimeout:timer=>{timers.delete(timer);clearTimeout(timer);},navigator:{permissions:{query:async({name})=>({state:states[name]||'prompt'})},geolocation,clipboard:{readText:async()=>{native.push('clipboard');return 'native clipboard fixture';}}},Notification:{requestPermission:async()=>{native.push('notification');return 'granted';}}};
    sandbox.window=sandbox;sandbox.__mguPermissionUIRequest=value=>bindings.push(JSON.parse(value));
    vm.runInNewContext(Permissions.permissionBridge,sandbox);
    try{
        let position;geolocation.getCurrentPosition(value=>position=value);await tick();assert.equal(bindings.length,1);assert.equal(position,undefined);
        sandbox.__mguPermissionUIResolve(bindings[0].id,true);await tick();assert.equal(position.native,true);
        assert.equal(await sandbox.Notification.requestPermission(),'granted');assert.equal(bindings.length,1,'Already granted native APIs do not prompt again');
        const watch=geolocation.watchPosition(()=>{});geolocation.clearWatch(String(watch));await tick();sandbox.__mguPermissionUIResolve(bindings[1].id,true);await tick();assert(!native.includes('watch'),'Cleared pending watch never starts a native capture');
        const read=sandbox.navigator.clipboard.readText();await tick();sandbox.__mguPermissionUIResolve(bindings[2].id,false);await assert.rejects(read,/cancelled/);assert(!native.includes('clipboard'),'Cancellation never invokes the sensitive native operation');
    }finally{for(const timer of timers)clearTimeout(timer);}
});
