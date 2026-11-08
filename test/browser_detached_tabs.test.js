'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EE=require('node:events'),Pages=require('../src/browser_pages');
function fixture(){
    const calls=[],opener={id:'opener',target:'target-owner',session:'owner-session'},popup={id:'popup',target:'target-popup',session:'popup-old',popup:true,openerTarget:opener.target,committed:false,sentinel:'unsaved form'};
    const info={targetId:popup.target,type:'page',url:'about:blank'};
    const pipe={cancelSession:session=>calls.push({cancelled:session}),send:async(method,params,session)=>{calls.push({method,params,session});if(method==='Target.getTargetInfo')return {targetInfo:info};if(method==='Target.attachToTarget')return {sessionId:'popup-new'};return {};}};
    const browser=Object.assign(new EE(),Pages,{pipe,epoch:1,tabs:[opener,popup],activeTab:popup.id,session:popup.session,tabQueue:Promise.resolve(),requireAllowed(){},_initializeTabSession:async tab=>{calls.push({initialized:tab.session});},_selectTab:async(id,force)=>{calls.push({selected:id,force});browser.activeTab=id;},_newTab:async()=>{browser.tabs.push({id:'replacement',session:'replacement'});browser.activeTab='replacement';},rebindFileSession:(old,next)=>calls.push({rebound:old,next})});
    browser.on('fault',error=>calls.push({fault:error.message}));
    return {browser,calls,pipe,opener,popup,info,detach:()=>browser.targetEvent({method:'Target.detachedFromTarget',params:{sessionId:'popup-old',targetId:popup.target}})};
}
test('a detached uncommitted native download popup retires only its own target and selects its opener',async()=>{
    const f=fixture();f.browser.isDownloadPopup=()=>true;f.browser.filePopupRetired=(tab,info)=>{assert(f.browser.tabs.includes(tab));assert.equal(info.targetId,tab.target);f.calls.push({proof:tab.id});};
    f.detach();await f.browser.tabQueue;assert.equal(f.browser.tabs.length,1);assert.equal(f.browser.activeTab,f.opener.id);
    const closes=f.calls.filter(call=>call.method==='Target.closeTarget');assert.equal(closes.length,1);assert.equal(closes[0].params.targetId,f.popup.target);assert.equal(f.calls.filter(call=>call.cancelled===f.popup.session).length,1);assert(f.calls.some(call=>call.proof===f.popup.id));
});
test('a blank popup without an actual download is reattached with its ID and document data intact',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.browser.isDownloadPopup=()=>false;
    f.detach();await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(300);await f.browser.tabQueue;
    assert.equal(f.browser.tabs.length,2);assert.equal(f.popup.id,'popup');assert.equal(f.popup.session,'popup-new');assert.equal(f.popup.sentinel,'unsaved form');assert.equal(f.popup.detachedSession,null);assert.equal(f.browser.activeTab,'popup');assert(!f.calls.some(call=>call.method==='Target.closeTarget'));assert(f.calls.some(call=>call.rebound==='popup-old'&&call.next==='popup-new'));
    const before=f.calls.length;f.detach();await f.browser.tabQueue;assert.equal(f.calls.length,before,'A late old-session detach cannot retire the reattached target');
});
test('an already committed page is never killed because of a stale download correlation',async()=>{
    const f=fixture();f.popup.committed=true;f.info.url='https://example.test/form';f.browser.isDownloadPopup=()=>true;f.detach();await f.browser.tabQueue;
    assert.equal(f.popup.session,'popup-new');assert.equal(f.browser.tabs.length,2);assert(!f.calls.some(call=>call.method==='Target.closeTarget'));
});
test('a detach lookup completed after engine replacement cannot close or attach any current target',async()=>{
    const f=fixture();let finish;f.browser.isDownloadPopup=()=>true;f.pipe.send=async(method,params)=>{f.calls.push({method,params});return new Promise(resolve=>{finish=resolve;});};
    f.detach();await new Promise(resolve=>setImmediate(resolve));f.browser.epoch++;f.browser.pipe={send:async()=>{throw Error('Replacement pipe must stay unused');}};finish({targetInfo:f.info});await f.browser.tabQueue;
    assert.equal(f.calls.filter(call=>call.method==='Target.closeTarget'||call.method==='Target.attachToTarget').length,0);assert.equal(f.browser.tabs.length,2);
});
