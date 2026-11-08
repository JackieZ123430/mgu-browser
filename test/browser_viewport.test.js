'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EventEmitter=require('events');
const Viewport=require('../src/browser_viewport'),Input=require('../src/browser_input');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
    const browser=new EventEmitter(),calls=[],state={zoom:100,width:1280,height:540,targets:new Set(),closed:[]};let next=0;
    Object.assign(browser,Viewport,{inputTask:Input.inputTask,session:'main',epoch:1,pageGeneration:2,viewport:{width:1280,height:540},gate:{check:()=>({allowed:true})},requireAllowed(){},stop(reason){this.stopped=reason;}});
    browser.pipe={async send(method,params,session){
        calls.push({method,params,session});
        if(method==='Target.createTarget'){const targetId='private-'+(++next);state.targets.add(targetId);return {targetId};}
        if(method==='Target.attachToTarget')return {sessionId:'settings-'+params.targetId};
        if(method==='Target.closeTarget'){state.closed.push(params.targetId);state.targets.delete(params.targetId);return {success:true};}
        if(method==='Emulation.setVisibleSize'){state.width=params.width;state.height=params.height;return {};}
        if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main-frame'}}};
        if(method==='Page.createIsolatedWorld')return {executionContextId:42};
        if(method==='Runtime.evaluate'){
            if(session&&session.indexOf('settings-')===0){const match=params.expression.match(/setDefaultZoom\(([0-9.]+)\)/);if(match)state.zoom=Number(match[1])*100;return {result:{value:true}};}
            return {result:{value:{width:Math.round(state.width*100/state.zoom),height:Math.round(state.height*100/state.zoom),dpr:state.zoom/100}}};
        }
        return {};
    }};return {browser,calls,state};
}
test('Native zoom validates physical frame limits and supported levels before CDP',async()=>{
    const f=fixture();for(const args of [[639,400,100],[1281,400,100],[1280,199,100],[1280,721,100],[1280,400,126]])await assert.rejects(()=>f.browser.resize(...args),/Browsergroesse/);assert.equal(f.calls.length,0);
});
test('Native mouse/drag positions stay CSS while wheel distances preserve CSS scrolling',()=>{
    const wheel={type:'mouseWheel',x:120,y:80,deltaX:70,deltaY:110};assert.deepEqual(Viewport.inputParams({zoom:150},'Input.dispatchMouseEvent',wheel),{type:'mouseWheel',x:120,y:80,deltaX:105,deltaY:165});assert.equal(wheel.deltaX,70);
    const drag={type:'dragOver',x:50,y:90,data:{items:[],dragOperationsMask:1}};assert.equal(Viewport.inputParams({zoom:125},'Input.dispatchDragEvent',drag),drag);const mouse={type:'mouseMoved',x:40,y:50};assert.equal(Viewport.inputParams({zoom:150},'Input.dispatchMouseEvent',mouse),mouse);
});
test('Native zoom uses a fixed transient settings target and publishes acknowledged CSS bounds',async()=>{
    const f=fixture(),events=[];f.browser.on('viewport',v=>events.push(v));const result=await f.browser.resize(1280,400,125);
    assert.deepEqual(result,{width:1024,height:320,pixelWidth:1280,pixelHeight:400,zoom:125});assert.deepEqual(events,[result]);assert.equal(f.state.targets.size,0);assert.equal(f.state.closed.length,1);
    assert.deepEqual(f.calls.find(c=>c.method==='Target.createTarget').params,{url:'chrome://settings/appearance',background:true});assert(f.calls.some(c=>c.params&&c.params.expression==='chrome.settingsPrivate.setDefaultZoom(1.25);true'));assert(!f.calls.some(c=>c.method==='Emulation.setDeviceMetricsOverride'||c.method==='Emulation.setPageScaleFactor'));
    result.width=1;assert.equal(f.browser.viewport.width,1024);await f.browser.resize(1280,540,125);assert.equal(f.calls.filter(c=>c.method==='Target.createTarget').length,1,'Changing physical height reuses native zoom without opening Settings again');
});
test('A pointer queued with the old viewport cannot activate after zoom changes its geometry',async()=>{
    const f=fixture();const zoom=f.browser.resize(1280,400,150),oldInput=f.browser.inputTask(context=>context.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:100}));const results=await Promise.allSettled([zoom,oldInput]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/Webseite wurde gewechselt/);assert(!f.calls.some(c=>c.method==='Input.dispatchMouseEvent'));
    await f.browser.inputTask(context=>context.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:100}));assert(f.calls.some(c=>c.method==='Input.dispatchMouseEvent'));
});
test('A failed resize restores native zoom and dimensions and closes every private target',async()=>{
    const f=fixture(),original=f.browser.pipe.send,events=[];f.browser.on('viewport',v=>events.push(v));let failure=true;
    f.browser.pipe.send=async(...args)=>{if(args[0]==='Emulation.setVisibleSize'&&failure){failure=false;throw Error('Resize failed');}return original(...args);};
    await assert.rejects(()=>f.browser.resize(1280,400,125),/Resize failed/);assert.deepEqual(f.browser.viewport,{width:1280,height:540});assert.equal(f.state.zoom,100);assert.equal(f.state.height,540);assert.equal(f.state.targets.size,0);assert.equal(events.length,0);await f.browser.resize(1280,400,150);assert.equal(f.browser.viewport.zoom,150);
});
test('A tab change rejects an old pending resize before mutating the new target',async()=>{
    const f=fixture();let release;f.browser.inputQueue=new Promise(resolve=>{release=resolve;});const resize=f.browser.resize(1280,400,125);f.browser.session='next';f.browser.pageGeneration++;release();await assert.rejects(resize,/Webseite wurde gewechselt/);assert.equal(f.calls.length,0);
});
test('A starting target without its first default context is retried without losing browser startup',async()=>{
    const f=fixture(),original=f.browser.pipe.send;let starting=true;f.browser.pipe.send=async(...args)=>{if(args[0]==='Runtime.evaluate'&&args[2]==='main'&&starting){starting=false;throw Error('Cannot find default execution context');}return original(...args);};
    const result=await f.browser.resize(1280,400,100);assert.equal(result.height,400);assert.equal(f.state.targets.size,0);
});
test('A fresh engine resets viewport initialization without retaining the previous CDP stream',async()=>{
    const f=fixture();await f.browser.resize(1280,540,100);const previousPipe=f.browser.pipe,previousSessions=f.browser.nativeViewportSessions;
    f.browser.pipe={send:previousPipe.send};f.browser.epoch++;await f.browser.resize(1280,540,100);assert.notEqual(f.browser.nativeViewportSessions,previousSessions);assert.equal(f.calls.filter(c=>c.method==='Emulation.clearDeviceMetricsOverride').length,2);assert.equal(f.browser.nativeViewportEpoch,f.browser.epoch);assert(!Object.values(f.browser).includes(previousPipe),'The closed pipe and its partial frame buffers are not retained by viewport caching');
});
test('Navigation during private-target creation closes the late target and retains fresh zoom intent',async()=>{
    const f=fixture(),original=f.browser.pipe.send;let release,hold=true;
    f.browser.pipe.send=async(...args)=>{const result=await original(...args);if(args[0]==='Target.createTarget'&&hold){hold=false;await new Promise(resolve=>{release=resolve;});}return result;};
    const old=f.browser.resize(1280,400,125);await turn();f.browser.pageGeneration++;const fresh=f.browser.resize(1280,400,150),results=Promise.allSettled([old,fresh]);release();const outcome=await results;assert.equal(outcome[0].status,'rejected');assert.equal(outcome[1].status,'fulfilled');assert.equal(f.state.zoom,150);assert.equal(f.state.targets.size,0);assert.equal(f.browser.viewport.zoom,150);
});
test('Navigation bootstrap coalesces and cancellation prevents hidden or stopped work',async()=>{
    const f=fixture();f.browser.scheduleReapply();f.browser.scheduleReapply();f.browser.scheduleReapply();f.browser.cancelReapply();await new Promise(resolve=>setTimeout(resolve,35));assert.equal(f.calls.length,0);assert.equal(f.browser.nativeViewportReapply,null);
    let allowed=true;f.browser.gate.check=()=>({allowed});f.browser.scheduleReapply();allowed=false;await new Promise(resolve=>setTimeout(resolve,35));assert.equal(f.calls.length,0);assert.equal(f.browser.nativeViewportReapply,null);
});
test('Automatic bootstrap reads dimensions after a newer explicit zoom and runs one bounded capture',async()=>{
    const f=fixture(),original=f.browser.pipe.send;let release,held=true;f.browser.pipe.send=async(...args)=>{const result=await original(...args);if(args[0]==='Target.createTarget'&&held){held=false;await new Promise(resolve=>{release=resolve;});}return result;};
    const user=f.browser.resize(1280,400,125);await turn();f.browser.scheduleReapply();f.browser.scheduleReapply();f.browser.scheduleReapply();await new Promise(resolve=>setTimeout(resolve,30));release();await user;
    for(let i=0;i<30&&f.browser.nativeViewportReapply;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.browser.nativeViewportReapply,null);assert.equal(f.browser.viewport.pixelHeight,400);assert.equal(f.browser.viewport.zoom,125);assert.equal(f.calls.filter(c=>c.method==='Page.captureScreenshot').length,1);assert.equal(f.calls.filter(c=>c.method==='Page.startScreencast').length,1);assert.equal(f.state.targets.size,0);
});
test('An old in-flight bootstrap cannot resize or focus the newly selected page',async()=>{
    const f=fixture(),original=f.browser.pipe.send;let release,held=true;f.browser.pipe.send=async(...args)=>{const result=await original(...args);if(args[0]==='Emulation.setVisibleSize'&&held){held=false;await new Promise(resolve=>{release=resolve;});}return result;};
    f.browser.scheduleReapply();for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert(release);f.browser.session='next';f.browser.pageGeneration++;const boundary=f.calls.length;f.browser.scheduleReapply();release();
    for(let i=0;i<50&&f.browser.nativeViewportReapply;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.browser.nativeViewportReapply,null);assert(f.calls.slice(boundary).every(c=>!c.session||c.session==='next'));assert.equal(f.calls.filter(c=>c.method==='Page.startScreencast').length,1);
});
test('A close or detach during compositor readback cannot roll back the retired view or stop its engine',async()=>{
    for(const retire of [tab=>{tab.detachedSession=tab.session;},(tab,browser)=>{browser.tabs=[];}]){
        const f=fixture(),tab={id:'last',session:'main'};f.browser.tabs=[tab];
        const original=f.browser.pipe.send;let rejectCapture;
        f.browser.pipe.send=async(...args)=>{if(args[0]==='Page.captureScreenshot'){f.calls.push({method:args[0],session:args[2]});return new Promise((resolve,reject)=>{rejectCapture=reject;});}return original(...args);};
        const work=f.browser.resize(null,null,null,true);await turn();assert(rejectCapture,'The native view has already been applied before the close');
        retire(tab,f.browser);const boundary=f.calls.length;rejectCapture(Error('Seitenverbindung beendet'));
        await assert.rejects(work,/Seitenverbindung beendet/);assert.equal(f.browser.stopped,undefined);assert.equal(f.calls.length,boundary,'No native rollback, focus or stream operation may reach a retired session');
        f.browser.session='replacement';f.browser.pageGeneration++;f.browser.tabs=[{id:'replacement',session:'replacement'}];
        await f.browser.resize(1280,400,100);assert.equal(f.browser.viewport.pixelHeight,400,'The surviving engine can render the next tab');
    }
});
