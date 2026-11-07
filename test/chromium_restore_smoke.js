'use strict';
// Exercise the actual encrypted archive and Chromium's session-cookie startup
// behavior without restoring browser windows or visiting external websites.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Browser=require('../src/browser_session'),{SecureBrowserData}=require('../src/secure_browser_data');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-restore-smoke-'));
const store=new SecureBrowserData(path.join(root,'protected'));
const browser=new Browser({gate:{check:()=>({allowed:true})},profileStore:store,profileRoot:path.join(root,'profiles'),binary:process.env.MGU_CHROMIUM||'/usr/bin/chromium',viewport:{width:960,height:540}});
(async()=>{try{
    await store.unlock('dummy fixture archive master passphrase');await store.configure({rememberSessions:true});
    await browser.start('');
    await browser.send('Network.setCookie',{url:'https://example.org',name:'mgu_session_fixture',value:'fixture-cookie',secure:true});
    await browser.newTab('');
    browser.stop('archive fixture');await browser.closing;
    for(let n=0;n<2;n++){
        await browser.start('');
        const cookies=(await browser.send('Network.getCookies',{urls:['https://example.org']})).cookies;
        assert(cookies.some(c=>c.name==='mgu_session_fixture'&&c.value==='fixture-cookie'&&c.session),'Session cookie survives the real encrypted archive');
        assert.equal(browser.tabs.length,1);
        const pages=(await browser.pipe.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page');
        assert(pages.length<=2,'Only the managed tab and Chromium bootstrap page may exist');
        browser.stop('archive fixture');await browser.closing;
    }
    console.log('Actual sandboxed Chromium: encrypted session-cookie restore survives two restarts without restoring hidden windows');
}finally{browser.destroy();await browser.closing;fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
