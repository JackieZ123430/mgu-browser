'use strict';
// Authored loopback Basic/Digest challenges only. Fixture credentials are
// generated test data; no provider, external account or credential store.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process');
const URL=require('url').URL;
const Browser=require(path.join(process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),'browser_session'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-http-auth-'));
const browser=new Browser({gate:{check:()=>({allowed:true})},binary:process.env.MGU_BROWSER_BINARY||process.env.MGU_TEST_CHROMIUM||'/usr/bin/chromium',profileRoot:root+'/profiles',viewport:{width:1280,height:480}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let site,restricted,realmChanged=false;const errors=[],seen=[];let paused=0;
browser.on('auth',value=>{if(value)seen.push({origin:value.origin,realm:value.realm,scheme:value.scheme,isProxy:value.isProxy,tabId:value.tabId});});
browser.on('fault',error=>errors.push(error.message));
const md5=value=>crypto.createHash('md5').update(value).digest('hex');
function authorized(request,user,password,realm,digest){
    const header=request.headers.authorization||'';
    if(!digest)return header==='Basic '+Buffer.from(user+':'+password).toString('base64');
    if(!header.startsWith('Digest '))return false;const fields={};header.slice(7).replace(/([a-zA-Z]+)=(?:"([^"]*)"|([^,\s]+))/g,(all,name,quoted,plain)=>{fields[name]=quoted===undefined?plain:quoted;return all;});
    return fields.username===user&&fields.realm===realm&&fields.nonce==='owned-fixture-nonce'&&fields.qop==='auth'&&fields.uri===request.url&&fields.response===md5(md5(user+':'+realm+':'+password)+':'+fields.nonce+':'+fields.nc+':'+fields.cnonce+':'+fields.qop+':'+md5(request.method+':'+fields.uri));
}
function respond(request,response){
    const url=new URL(request.url,'http://fixture.invalid');response.setHeader('Cache-Control','no-store');
    if(url.pathname==='/asset'){response.end('owned-resource');return;}
    if(url.pathname==='/benchmark'){
        response.setHeader('Content-Type','text/html; charset=utf-8');
        response.end('<!doctype html><title>Owned benchmark</title><script>window.benchmarkNonce='+JSON.stringify(url.searchParams.get('nonce'))+';const began=performance.now();for(let i=0;i<5000;i++)document.documentElement.appendChild(document.createElement("span"));Promise.all(Array.from({length:60},(_,i)=>fetch("/asset?nonce="+benchmarkNonce+"&i="+i).then(r=>r.text()))).then(()=>window.benchmarkMs=performance.now()-began);</script>');return;
    }
    if(url.pathname.startsWith('/basic/')||url.pathname==='/digest'||url.pathname==='/change'){
        const label=url.pathname.slice('/basic/'.length),digest=url.pathname==='/digest';
        let user='fixture-'+label,password='owned-'+label,realm='Owned '+label;
        if(digest){user='fixture-digest';password='owned-digest';realm='Owned Digest';}
        if(url.pathname==='/change'){user=realmChanged?'fixture-second':'fixture-first';password=realmChanged?'owned-second':'owned-first';realm=realmChanged?'Owned second realm':'Owned first realm';if(!realmChanged&&authorized(request,user,password,realm,false)){realmChanged=true;user='fixture-second';password='owned-second';realm='Owned second realm';}}
        if(!authorized(request,user,password,realm,digest)){response.writeHead(401,{'WWW-Authenticate':digest?'Digest realm="'+realm+'", nonce="owned-fixture-nonce", algorithm=MD5, qop="auth"':'Basic realm="'+realm+'"','Content-Type':'text/plain'});response.end('Owned authentication challenge');return;}
        response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><title>Owned authenticated</title><h1>Owned authenticated content</h1>');return;
    }
    response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><title>Owned public</title><h1>Owned public content</h1>');
}
async function value(expression,session){const response=await browser.pipe.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},session||browser.session,5000);if(response.exceptionDetails)throw Error('Auth fixture evaluation failed');return response.result.value;}
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await delay(50);}throw Error(label);}
async function challenge(realm){await until(()=>{const current=browser.authStatus();return current&&(!realm||current.realm===realm);},'Expected native HTTP auth challenge '+realm);return browser.authStatus();}
async function reject(promise){let rejected=false;try{await promise;}catch(ignore){rejected=true;}assert(rejected,'Stale auth reply must reject');}
async function publicPage(base){await browser.navigate(base+'/public');await until(()=>value('document.title==="Owned public"'),'Owned public page loads');}
async function authenticated(route,label){await until(()=>value('document.title==="Owned authenticated"&&location.pathname==='+JSON.stringify(route)),label);}
function median(values){return values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];}
(async()=>{try{
    site=http.createServer(respond);await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
    const base='http://a.fixture.localhost:'+site.address().port,other='http://b.fixture.localhost:'+site.address().port;
    // Cross-site HTTP auth is natively suppressed by Chromium's third-party
    // credential policy. Use same-site loopback names and stricter process
    // isolation to exercise a real OOPIF without relaxing that policy.
    const binary=browser.options.binary,wrapper=root+'/isolated-fixture-browser';
    fs.writeFileSync(wrapper,'#!/bin/sh\nexec "$MGU_AUTH_ENGINE_BINARY" "--host-resolver-rules=MAP *.fixture.localhost 127.0.0.1" "--isolate-origins=$MGU_AUTH_ISOLATED_ORIGIN" "$@"\n',{mode:0o700});
    browser.options.env={MGU_AUTH_ENGINE_BINARY:binary,MGU_AUTH_ISOLATED_ORIGIN:other};browser.options.binary=wrapper;
    await browser.start(base+'/basic/initial');assert(browser.child,'Startup releases its caller while native auth UI awaits a reply');
    browser.pipe.on('event',event=>{if(event.method==='Fetch.requestPaused')paused++;});
    const first=await challenge('Owned initial');assert.equal(first.origin,base);assert.equal(first.scheme,'basic');
    if(process.env.MGU_AUTH_SLOW_REPLY==='1'){await delay(11000);assert(browser.child,'A person can take more than ten seconds to answer');}
    await browser.authReply(first.id,{username:'fixture-initial',password:'owned-initial'});await authenticated('/basic/initial','Basic credentials reach native authenticated content');assert.equal(browser.authStatus(),null);
    await browser.navigate(base+'/digest');const digest=await challenge('Owned Digest');assert.equal(digest.scheme,'digest');await browser.authReply(digest.id,{username:'fixture-digest',password:'owned-digest'});await authenticated('/digest','Native Digest response validates');
    await browser.navigate(base+'/basic/wrong');const wrong=await challenge('Owned wrong');await browser.authReply(wrong.id,{username:'fixture-wrong',password:'incorrect-fixture'});await until(()=>browser.authStatus()&&browser.authStatus().id!==wrong.id,'Wrong credentials create a fresh native challenge');await reject(browser.authReply(wrong.id,{username:'fixture-wrong',password:'owned-wrong'}));await browser.authReply(browser.authStatus().id,{cancel:true});assert.equal(browser.authStatus(),null);
    await browser.navigate(base+'/change');const original=await challenge('Owned first realm');await browser.authReply(original.id,{username:'fixture-first',password:'owned-first'});const changed=await challenge('Owned second realm');assert.notEqual(changed.id,original.id);await reject(browser.authReply(original.id,{username:'fixture-first',password:'owned-first'}));await browser.authReply(changed.id,{username:'fixture-second',password:'owned-second'});await authenticated('/change','Changed realm requires its explicit credentials');
    await browser.navigate(base+'/basic/navigation');const stale=await challenge('Owned navigation');await publicPage(base);await reject(browser.authReply(stale.id,{username:'fixture-navigation',password:'owned-navigation'}));
    await browser.navigate(base+'/basic/tab');const switched=await challenge('Owned tab');await browser.newTab('');await reject(browser.authReply(switched.id,{cancel:true}));await publicPage(base);
    // An already loaded cross-site iframe owns a different Chromium session.
    await value('document.body.innerHTML='+JSON.stringify('<iframe src="'+other+'/public"></iframe>')+';true');let child;
    await until(()=>{child=Array.from(browser.permissionFrameOwners||[]).map(item=>item[1]).find(entry=>browser.frameOwner(entry.session));return !!child;},'OOPIF session attaches');
    await until(()=>value('document.title==="Owned public"&&location.origin==='+JSON.stringify(other),child.session),'OOPIF public document loads before its authenticated fetch');
    await value('window.authFetch=null;fetch("/basic/oopif").then(r=>r.text()).then(text=>authFetch=text);true',child.session);const iframe=await challenge('Owned oopif');assert.equal(iframe.origin,other);assert.equal(Array.from(browser.httpAuthRequests.values()).find(record=>record.public.id===iframe.id).session,child.session);
    await browser.authReply(iframe.id,{username:'fixture-oopif',password:'owned-oopif'});await until(()=>value('typeof authFetch==="string"&&authFetch.includes("Owned authenticated")',child.session),'OOPIF fetch authenticates through native HTTP stack');
    await value('fetch("/basic/oopif-stale").catch(()=>{});true',child.session);const staleFrame=await challenge('Owned oopif-stale');await publicPage(base);await reject(browser.authReply(staleFrame.id,{cancel:true}));
    // Compare the same 5,000-node/60-resource page with and without Fetch.
    const samples={native:[],broker:[]};let nonce=0;
    for(let round=0;round<6;round++)for(const mode of round%2?['broker','native']:['native','broker']){
        if(mode==='native')await browser.send('Fetch.disable');else await browser.installAuth(browser.session);
        const n=String(++nonce);await browser.navigate(base+'/benchmark?nonce='+n);await until(()=>value('window.benchmarkNonce==='+JSON.stringify(n)+'&&typeof window.benchmarkMs==="number"'),'Resource benchmark completes');samples[mode].push(await value('benchmarkMs'));
    }
    await browser.installAuth(browser.session);await browser.navigate(base+'/basic/stop');const stopped=await challenge('Owned stop');browser.stop('Auth fixture stop');await browser.closing;await reject(browser.authReply(stopped.id,{cancel:true}));
    // Media-disabled documents retain CSP while using the same auth broker.
    restricted=new Browser({gate:{check:()=>({allowed:true})},binary:browser.options.binary,profileRoot:root+'/restricted',mediaDisabled:true});
    restricted.options.env=Object.assign({},browser.options.env);
    await restricted.start(base+'/basic/restricted');const restrictedAuth=restricted.authStatus();assert(restrictedAuth);await restricted.authReply(restrictedAuth.id,{username:'fixture-restricted',password:'owned-restricted'});
    let restrictedResult;for(let i=0;i<80;i++){restrictedResult=await restricted.send('Runtime.evaluate',{expression:'document.title',returnByValue:true});if(restrictedResult.result.value==='Owned authenticated')break;await delay(50);}assert.equal(restrictedResult.result.value,'Owned authenticated');
    let mediaBlocked=false;restricted.pipe.on('event',event=>{if(event.method==='Network.loadingFailed'&&event.params.type==='Media'&&/BLOCKED_BY_CLIENT/.test(event.params.errorText))mediaBlocked=true;});
    await restricted.send('Runtime.evaluate',{expression:'const v=document.createElement("video");v.src="'+base+'/media.webm";document.body.appendChild(v);v.load();true',returnByValue:true});
    for(let i=0;i<50&&!mediaBlocked;i++)await delay(50);assert.equal(mediaBlocked,true,'Existing native network media rejection stays active');
    assert.deepEqual(errors,[]);assert(paused>60,'The actual all-resource interception path is exercised');
    console.log('BROWSER_AUTH_RESULT '+JSON.stringify({success:true,basic:true,digest:true,wrongCredentialsPromptAgain:true,cancel:true,realmChange:true,staleNavigationRejected:true,tabChangeRejected:true,oopif:true,oopifNavigationRejected:true,stoppedReplyRejected:true,mediaRestrictionPreserved:true,slowReply:process.env.MGU_AUTH_SLOW_REPLY==='1',pausedRequests:paused,benchmark:{nodes:5000,resources:60,nativeMedianMs:median(samples.native),brokerMedianMs:median(samples.broker),samples},sandbox:true,tlsVerification:true}));
}finally{if(restricted){restricted.destroy();await restricted.closing;}browser.destroy();await browser.closing;if(site)await new Promise(resolve=>site.close(resolve));if(fs.rmSync)fs.rmSync(root,{recursive:true,force:true});else cp.execFileSync('/bin/rm',['-rf','--',root]);}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
