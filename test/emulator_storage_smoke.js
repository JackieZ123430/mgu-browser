'use strict';
// Own loopback fixture, dummy credentials, separate engine profiles. No provider account.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {SecureBrowserData}=require('../src/secure_browser_data'),Browser=require('../src/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw new Error('Run as the emulator development user');
const base=path.join(process.env.HOME,'bmw-emulator'),config=JSON.parse(fs.readFileSync(base+'/config.json','utf8'));
const root=fs.mkdtempSync(base+'/data/storage-fixture-');fs.mkdirSync(root+'/profiles');let assetRequests=0,browser;
const server=http.createServer((req,res)=>{if(req.url==='/asset.gif'){assetRequests++;res.setHeader('Content-Type','image/gif');res.setHeader('Cache-Control','public, max-age=86400');return res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Own persistence fixture</title><img src="/asset.gif"><p id="status">Own persistence fixture</p>');});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(store,url){browser=new Browser({gate:{check:()=>({allowed:true})},mediaDisabled:false,binary:config.chromium,profileRoot:root+'/profiles',profileStore:store});await browser.start('');await browser.send('Page.navigate',{url});for(let i=0;i<60;i++){if((await browser.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true})).result.value==='complete')return;await delay(100);}throw new Error('Fixture did not load');}
async function stop(){browser.destroy();await browser.closing;browser=null;}
(async()=>{try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
    let store=new SecureBrowserData(root+'/protected');await store.unlock('integration fixture master phrase');await store.configure({rememberSessions:true,rememberCache:true});
    await start(store,url);await browser.send('Network.setCookie',{name:'fixture_login',value:'fixture_cookie_value',url,expires:Math.floor(Date.now()/1000)+86400,httpOnly:true});
    await browser.send('Network.setCookie',{name:'fixture_session',value:'fixture_session_cookie',url,httpOnly:true});
    await browser.send('Runtime.evaluate',{expression:'localStorage.setItem("fixture-login","fixture-local-value")'});await stop();
    store=new SecureBrowserData(root+'/protected');await store.unlock('integration fixture master phrase');await start(store,url);
    const cookies=await browser.send('Network.getCookies',{urls:[url]});assert(cookies.cookies.some(c=>c.name==='fixture_login'&&c.value==='fixture_cookie_value'),'Cookie must survive complete engine restart');
    assert(cookies.cookies.some(c=>c.name==='fixture_session'),'Session cookies must survive an explicitly remembered session');
    const local=await browser.send('Runtime.evaluate',{expression:'localStorage.getItem("fixture-login")',returnByValue:true});assert.equal(local.result.value,'fixture-local-value');
    assert.equal(assetRequests,1,'HTTP cache must survive complete engine restart');
    await browser.clearBrowserData('cache');await browser.send('Page.reload',{ignoreCache:false});await delay(1000);assert(assetRequests>=2,'Cache clear must require a fresh request');
    await browser.clearBrowserData('sites');browser.destroy();await browser.closing;browser=null;await start(store,url);
    assert(!(await browser.send('Network.getCookies',{urls:[url]})).cookies.some(c=>c.name==='fixture_login'));
    assert.equal((await browser.send('Runtime.evaluate',{expression:'localStorage.getItem("fixture-login")',returnByValue:true})).result.value,null);
    await browser.navigate('https://example.org/');await delay(1000);
    const tree=await browser.send('Page.getFrameTree');await browser.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html><form><input type="email" value="fixture@example.org"><input type="password" value="fixture-password-only"></form>'});
    await browser.vaultSave();const entries=await browser.vaultList();assert.equal(entries.length,1);assert(!JSON.stringify(entries).includes('fixture-password-only'));
    await browser.send('Runtime.evaluate',{expression:'document.querySelectorAll("input").forEach(e=>e.value="")'});await browser.vaultFill(entries[0].id);
    const filled=await browser.send('Runtime.evaluate',{expression:'JSON.stringify(Array.from(document.querySelectorAll("input")).map(e=>e.value))',returnByValue:true});assert.deepEqual(JSON.parse(filled.result.value),['fixture@example.org','fixture-password-only']);
    await browser.vaultRemove(entries[0].id);assert.equal((await browser.vaultList()).length,0);
    await stop();let allowed=true;const restore=store.restore.bind(store);const slowStore={prefs:store.prefs,restore:async profile=>{await delay(200);return restore(profile);},capture:profile=>store.capture(profile)};
    browser=new Browser({gate:{check:()=>({allowed})},binary:config.chromium,profileRoot:root+'/profiles',profileStore:slowStore});const starting=browser.start('');await delay(40);allowed=false;browser.stop('Fixture focus loss');await assert.rejects(()=>starting);assert.equal(browser.child,null);assert.equal(fs.readdirSync(root+'/profiles').length,0,'Cancelled restore must remove its decrypted working profile');
    console.log('Actual engine: encrypted profile restart, cookie, localStorage, HTTP cache, separate clears and explicit vault save/fill/remove passed');
}finally{if(browser)await stop();await new Promise(r=>server.close(r));assert.equal(path.dirname(root),base+'/data');fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
