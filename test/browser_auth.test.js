'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EE=require('events');
const Auth=require('../src/browser_auth');
function fixture(){
    const browser=Object.assign(new EE(),Auth),calls=[],events=[];let allowed=true;
    const owners=new Map([['main',{session:'main',mainSession:'main',target:'top',frameId:'top',tabId:'tab-1',generation:0}],['child',{session:'child',mainSession:'main',target:'subframe',frameId:'subframe',tabId:'tab-1',generation:0}]]);
    Object.assign(browser,{options:{},epoch:2,session:'main',pipe:{send:async(method,params,session)=>{calls.push({method,params:JSON.parse(JSON.stringify(params)),session});return {}; }},frameOwner:session=>owners.get(session),gate:{check:()=>({allowed})},requireAllowed(){if(!allowed)throw Error('hidden');}});
    browser.on('auth',state=>events.push(state));
    return {browser,calls,events,owners,hide(){allowed=false;},close(){browser.clearAuth();}};
}
function required(session='main',requestId='fetch-1',realm='Owned realm'){
    return {method:'Fetch.authRequired',sessionId:session,params:{requestId,frameId:session==='main'?'top':'subframe',request:{url:'https://owned.example/private?not-displayed'},authChallenge:{source:'Server',origin:'https://owned.example',scheme:'basic',realm}}};
}
test('Native auth enables request-stage interception and preserves optional media restrictions',async()=>{
    const f=fixture();try{await f.browser.installAuth('main');assert.deepEqual(f.calls[0].params,{handleAuthRequests:true,patterns:[{urlPattern:'*',requestStage:'Request'}]});
        f.browser.options.mediaDisabled=true;await f.browser.installAuth('child');assert.equal(f.calls[1].method,'Network.enable');assert.equal(f.calls[2].params.handleAuthRequests,true);
        f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'child',params:{requestId:'media',resourceType:'Media'}});
        assert.equal(f.calls[3].method,'Fetch.failRequest');
        f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'child',params:{requestId:'document',resourceType:'Document',responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}]}});
        assert.equal(f.calls[4].method,'Fetch.continueResponse');assert(f.calls[4].params.responseHeaders.some(h=>h.name==='Content-Security-Policy'&&h.value.includes("media-src 'none'")));
        f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'child',params:{requestId:'document-request',resourceType:'Document'}});
        assert.deepEqual(f.calls[5].params,{requestId:'document-request',interceptResponse:true});
    }finally{f.close();}
});
test('Ordinary requests immediately continue and challenge UI contains no full URLs or credentials',async()=>{
    const f=fixture();try{assert.equal(f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'main',params:{requestId:'fetch-1',networkId:'network-1',frameId:'top',resourceType:'Fetch'}}),true);assert.equal(f.calls[0].method,'Fetch.continueRequest');
        f.browser.authEvent(required());const shown=f.browser.authStatus();assert.equal(shown.origin,'https://owned.example');assert.equal(shown.realm,'Owned realm');assert.equal(shown.scheme,'basic');assert.equal(shown.tabId,'tab-1');assert(!JSON.stringify(shown).includes('not-displayed'));
        await f.browser.authReply(shown.id,{username:'fixture-user',password:'fixture-password'});const sent=f.calls.find(c=>c.method==='Fetch.continueWithAuth');assert.deepEqual(sent.params.authChallengeResponse,{response:'ProvideCredentials',username:'fixture-user',password:'fixture-password'});assert.equal(f.browser.authStatus(),null);assert(!JSON.stringify(f.events).includes('fixture-password'));
    }finally{f.close();}
});
test('Wrong credentials or a changed realm require a new explicit reply',async()=>{
    const f=fixture();try{f.browser.authEvent(required());const old=f.browser.authStatus();const send=f.browser.pipe.send;f.browser.pipe.send=async(method,params,session)=>{const value=await send(method,params,session);if(method==='Fetch.continueWithAuth')f.browser.authEvent(required('main','fetch-1','Changed realm'));return value;};
        await f.browser.authReply(old.id,{username:'fixture',password:'wrong'});const next=f.browser.authStatus();assert(next);assert.notEqual(next.id,old.id);assert.equal(next.realm,'Changed realm');
        await assert.rejects(()=>f.browser.authReply(old.id,{username:'fixture',password:'owned'}),/nicht mehr aktuell/);assert.equal(f.calls.filter(c=>c.method==='Fetch.continueWithAuth').length,1);
    }finally{f.close();}
});
test('Cancel sends native CancelAuth without any credentials',async()=>{
    const f=fixture();try{f.browser.authEvent(required());await f.browser.authReply(f.browser.authStatus().id,{cancel:true});assert.deepEqual(f.calls[0].params.authChallengeResponse,{response:'CancelAuth'});assert.equal(f.browser.authStatus(),null);}finally{f.close();}
});
test('A verified document challenge releases navigation while the native request waits for a person',async()=>{
    const f=fixture();let finish;
    try{const send=f.browser.pipe.send;f.browser.pipe.send=(method,params,session)=>method==='Page.navigate'?new Promise((resolve,reject)=>{finish={resolve,reject};}):send(method,params,session);
        const navigating=f.browser.navigateWithAuth('https://owned.example/private');const event=required();event.params.resourceType='Document';f.browser.authEvent(event);
        assert.deepEqual(await navigating,{authPending:true,frameId:'top'});finish.reject(Error('Late native cancellation'));await new Promise(resolve=>setImmediate(resolve));assert(f.browser.authStatus(),'A late navigation rejection cannot discard the still-visible challenge');
    }finally{f.close();}
});
test('Ordinary native navigation errors remain visible without an auth challenge',async()=>{
    const f=fixture();try{f.browser.pipe.send=async()=>({errorText:'net::ERR_CONNECTION_REFUSED'});await assert.rejects(()=>f.browser.navigateWithAuth('https://owned.example/'),error=>error.message==='net::ERR_CONNECTION_REFUSED'&&error.navigationFailure===true);
        f.browser.pipe.send=async()=>{throw Error('CDP configuration failed');};await assert.rejects(()=>f.browser.navigateWithAuth('https://owned.example/'),error=>error.message==='CDP configuration failed'&&error.navigationFailure===undefined);
    }finally{f.close();}
});
test('Unknown/mismatched origins, unsupported schemes, background and hidden challenges fail closed',()=>{
    const f=fixture();try{const bad=required();bad.params.authChallenge.origin='https://different.example';f.browser.authEvent(bad);
        const unsupported=required();unsupported.params.authChallenge.scheme='unknown';f.browser.authEvent(unsupported);f.browser.authEvent(required('unowned'));f.browser.session='another-tab';f.browser.authEvent(required());f.browser.session='main';f.hide();f.browser.authEvent(required());
        assert.equal(f.browser.authStatus(),null);assert.equal(f.calls.length,5);assert(f.calls.every(c=>c.params.authChallengeResponse.response==='CancelAuth'));
    }finally{f.close();}
});
test('Navigation, child detachment and engine replacement invalidate stale replies',async()=>{
    const f=fixture();try{f.browser.authEvent(required('child'));const old=f.browser.authStatus();f.browser.authEvent({method:'Page.frameStartedNavigating',sessionId:'child',params:{frameId:'subframe'}});assert.equal(f.browser.authStatus(),null);await assert.rejects(()=>f.browser.authReply(old.id,{username:'fixture',password:'owned'}),/nicht mehr aktuell/);
        f.browser.authEvent(required('child'));const detached=f.browser.authStatus();f.owners.delete('child');await assert.rejects(()=>f.browser.authReply(detached.id,{cancel:true}),/nicht mehr aktuell/);f.browser.clearAuth('child');
        f.browser.authEvent(required());const previous=f.browser.authStatus();f.browser.epoch++;await assert.rejects(()=>f.browser.authReply(previous.id,{cancel:true}),/nicht mehr aktuell/);assert(!f.calls.some(c=>c.params.authChallengeResponse.response==='ProvideCredentials'));
    }finally{f.close();}
});
test('Native request completion and global stop clear only live challenge IDs',()=>{
    const f=fixture();try{f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'main',params:{requestId:'fetch-1',networkId:'net-1'}});f.browser.authEvent(required());f.browser.authEvent({method:'Network.loadingFailed',sessionId:'main',params:{requestId:'net-1'}});assert.equal(f.browser.authStatus(),null);f.browser.authEvent(required('child'));f.browser.clearAuth();assert.equal(f.browser.httpAuthRequests.size,0);assert.equal(f.browser.httpAuthTracked.size,0);
    }finally{f.close();}
});
test('Pending prompts and tracked network requests remain bounded',()=>{
    const f=fixture();try{for(let i=0;i<600;i++)f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'main',params:{requestId:'fetch-'+i,networkId:'net-'+i}});assert(f.browser.httpAuthTracked.size<=512);assert(f.browser.httpAuthNetwork.size<=512);for(let i=0;i<600;i++)f.browser.authEvent({method:'Fetch.requestPaused',sessionId:'main',params:{requestId:'reused-fetch',networkId:'reused-net-'+i}});assert(f.browser.httpAuthNetwork.size<=512);for(let i=0;i<40;i++)f.browser.authEvent(required('main','challenge-'+i));assert.equal(f.browser.httpAuthRequests.size,16);assert.equal(f.calls.filter(c=>c.method==='Fetch.continueWithAuth').length,24);}finally{f.close();}
});
test('OOPIF auth is bound to its verified owner and invalid credential shapes never send',async()=>{
    const f=fixture();try{f.browser.authEvent(required('child'));const shown=f.browser.authStatus();for(const reply of [{username:'x',password:'secret\nheader'},{username:'x',password:'x'.repeat(5000)},{username:'x',password:'secret',origin:'https://another.example'}])await assert.rejects(()=>f.browser.authReply(shown.id,reply),/Ungültig/);
        f.owners.get('child').generation++;await assert.rejects(()=>f.browser.authReply(shown.id,{username:'fixture',password:'owned'}),/nicht mehr aktuell/);assert.equal(f.calls.length,0);
    }finally{f.close();}
});
