'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Media=require('../src/browser_media');
function fixture(count){
    const frames=new Map(),states=new Map(),calls=[],events=[],tab={id:'tab-main',session:'main',target:'top-target'};
    for(let i=0;i<(count||1);i++){const session='child-'+i;frames.set(session,{session,target:'target-'+i,frameId:'target-'+i,mainSession:'main',tabId:tab.id,parentSession:'main',epoch:1,generation:1});states.set(session,{hasMedia:true,playing:true,audible:true,fullscreen:false,playerMode:true,hasSiteControls:true,customSiteControls:true,customPlayer:false,domPlayerAccessible:true,paused:false,muted:false,currentTime:1,duration:10});}
    const parent={hasMedia:false,playing:false,audible:false,fullscreen:false,playerMode:false,customPlayer:false,hasSiteControls:false,domPlayerAccessible:false};
    const pipe={send:async(method,params,session,timeout)=>{calls.push({method,params,session,timeout});if(method==='Runtime.evaluate')return {result:{value:JSON.stringify(session==='main'?parent:states.get(session))}};return {};}};
    const browser=Object.assign({},Media,{pipe,epoch:1,session:'main',pageGeneration:1,tabs:[tab],webAudioContexts:new Map(),requireAllowed(){},emit:(name,state)=>events.push({name,state}),frameOwner:session=>frames.has(session)?Object.assign({},frames.get(session)):null,relatedFrames:main=>Array.from(frames.values()).filter(frame=>frame.mainSession===main).map(frame=>Object.assign({},frame))});
    return {browser,frames,states,calls,events,pipe,parent,context:browser.mediaContext(true)};
}
test('verified embedded own flags aggregate freshly and selected context cannot cross a child generation',async()=>{
    const f=fixture();let result=await f.browser.frameMediaActivity(f.context,f.parent,'snapshot');assert.equal(result.audible,true);assert.equal(result.playing,true);assert.equal(f.browser.selectedMediaFrame().session,'child-0');
    f.states.get('child-0').audible=false;result=await f.browser.frameMediaActivity(f.context,f.parent,'snapshot');assert.equal(result.audible,false);assert.equal(result.playing,true);
    const context=f.browser.mediaContext();assert.equal(context.session,'child-0');f.frames.get('child-0').generation++;
    const before=f.calls.length;await assert.rejects(()=>context.send('Runtime.evaluate',{}),/gewechselt/);assert.equal(f.calls.length,before);
});
test('known current embedded sound overrides an uncertain other frame without reusing stale audio after failure',async()=>{
    const f=fixture(2),send=f.pipe.send;f.pipe.send=async(method,params,session,timeout)=>{if(session==='child-0')throw Error('private embedded error');return send(method,params,session,timeout);};
    await f.browser.inspectMedia();let state=f.events[f.events.length-1].state;assert.equal(state.audible,true);assert.equal(state.activityUnknown,false);
    f.pipe.send=async(method,params,session,timeout)=>{if(session!=='main')throw Error('busy embedded renderer');return send(method,params,session,timeout);};
    await f.browser.inspectMedia();state=f.events[f.events.length-1].state;assert.equal(state.audible,false);assert.equal(state.activityUnknown,true);assert(!JSON.stringify(state).includes('private'));
});
test('late embedded snapshots cannot become fresh evidence after navigation or session retirement',async()=>{
    const f=fixture();let resolve;f.pipe.send=async()=>new Promise(finish=>{resolve=finish;});
    const pending=f.browser.frameMediaActivity(f.context,f.parent,'snapshot');await new Promise(done=>setImmediate(done));f.frames.get('child-0').generation++;
    resolve({result:{value:JSON.stringify({hasMedia:true,playing:true,audible:true,playerMode:true,domPlayerAccessible:true})}});
    const result=await pending;assert.equal(result.audible,false);assert.equal(result.unknown,true);assert.equal(f.browser.mediaFrameCache.size,0);assert.equal(f.browser.selectedMediaFrame(),null);
});
test('embedded polling is parallel, capped and shares one deadline rather than per-frame serial waits',async t=>{
    t.mock.timers.enable({apis:['setTimeout','Date']});const f=fixture(30);f.pipe.send=(method,params,session,timeout)=>{f.calls.push({method,session,timeout});return new Promise((resolve,reject)=>setTimeout(()=>reject(Error('deadline')),timeout));};
    const pending=f.browser.frameMediaActivity(f.context,f.parent,'snapshot');await new Promise(done=>setImmediate(done));assert.equal(f.calls.length,16);assert(f.calls.every(call=>call.timeout>0&&call.timeout<=1000));
    t.mock.timers.tick(1000);const result=await pending;assert.equal(result.audible,false);assert.equal(result.unknown,true);assert.equal(f.browser.mediaFrameCache.size,0);
});
test('child WebAudio evidence is removed when its verified renderer document changes',()=>{
    const f=fixture(2);for(const sessionId of ['child-0','child-1'])f.browser.webAudioEvent({sessionId,method:'WebAudio.contextCreated',params:{context:{contextId:'audio',contextState:'running'}}});assert.equal(f.browser.webAudioActivity().running,2,'Context IDs are scoped to their actual renderer session');
    f.frames.get('child-0').generation++;assert.equal(f.browser.webAudioActivity().running,1);assert.equal(f.browser.webAudioContexts.size,1);
    f.browser.webAudioEvent({sessionId:'child-1',method:'WebAudio.contextWillBeDestroyed',params:{contextId:'audio'}});assert.equal(f.browser.webAudioActivity().running,0);
});
test('accessible focus cleanup uses its original renderer even when two sessions reuse a remote object ID',async()=>{
    const f=fixture(2);f.browser.accessibleMediaControls=async()=>[{node:1,name:'Play',x:20,y:20}];
    f.pipe.send=async(method,params,session)=>{f.calls.push({method,params,session});return method==='DOM.resolveNode'?{object:{objectId:'shared-object-id'}}:{};};
    const first=f.browser.childMediaContext(f.context,f.frames.get('child-0'),false),second=f.browser.childMediaContext(f.context,f.frames.get('child-1'),false);
    await f.browser.focusAccessibleMediaControl(1,first);await f.browser.focusAccessibleMediaControl(1,second);
    const cleanup=f.calls.find(call=>call.method==='Runtime.callFunctionOn'&&call.params.functionDeclaration.includes('this.removeAttribute'));
    assert.equal(cleanup.session,'child-0');assert.equal(f.calls.filter(call=>call.method==='Runtime.releaseObject')[0].session,'child-0');assert.equal(f.browser.focusedMediaControl.session,'child-1');
});
test('parent and embedded media pointer reveals preserve the native zoom coordinate mapping without double scaling',async()=>{
    const f=fixture();f.browser.viewport={width:640,height:360,pixelWidth:960,pixelHeight:540,zoom:150};
    await f.context.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:20});
    const child=f.browser.childMediaContext(f.context,f.frames.get('child-0'),false);await child.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:20});
    assert(f.calls.every(call=>call.params.x===10&&call.params.y===20));assert.equal(f.calls[0].session,'main');assert.equal(f.calls[1].session,'child-0');
});
