'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),EE=require('events'),{PassThrough}=require('stream'),cp=require('child_process');
const Channel=require('../src/ipc_protocol'),Pages=require('../src/browser_pages'),Metadata=require('../src/browser_metadata'),Browser=require('../src/browser_session'),{SecureBrowserData}=require('../src/secure_browser_data'),{BrowserState}=require('../src/browser_state');
const fixture=()=>fs.mkdtempSync(path.join(os.tmpdir(),'mgu-readiness-'));
const remove=dir=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});};
test('UTF-8 tab metadata and oversized results preserve the native channel',()=>{
    const socket=new PassThrough(),channel=new Channel(socket),messages=[];channel.on('json',v=>messages.push(v));
    const browser=Object.assign(new EE(),{tabs:Array.from({length:8},(_,i)=>({id:'tab-'+i,url:'https://example.org/?q='+'x'.repeat(3900),title:'🧪'.repeat(9000)})),activeTab:'tab-0'});
    browser.on('tabs',value=>channel.json({event:'tabs',value}));Pages.emitTabs.call(browser);
    assert.equal(messages[0].value.length,8);assert(Buffer.byteLength(messages[0].value[0].title)<=512);assert(!messages[0].value[0].title.includes('\ufffd'));
    channel.json({id:17,result:'x'.repeat(Channel.MAX_JSON+1)});assert.equal(messages[1].id,17);assert(messages[1].error);assert(!socket.destroyed);
    assert.equal(Metadata.title('ok'),'ok');socket.destroy();
});
test('History/bookmark storage stays readable under long multibyte metadata',()=>{
    const dir=fixture();try{const store=new BrowserState(dir);store.set('homepage','https://example.org/');
        for(let i=0;i<120;i++){const url='https://example.org/'+i+'?q='+'x'.repeat(3800);store.visit(url,'🧪'.repeat(900));if(i<80)store.toggleBookmark(url,'🧪'.repeat(900));}
        assert(fs.statSync(store.file).size<=256*1024);const again=new BrowserState(dir);assert.equal(again.data.homepage,'https://example.org/');assert(again.data.bookmarks.length>0);assert.equal(store.error,'');
    }finally{remove(dir);}
});
test('Site deletion serializes a concurrent browser start before restore',{skip:process.platform!=='linux'||process.getuid()===0},async()=>{
    const dir=fixture(),store=new SecureBrowserData(dir+'/protected');let browser;
    try{await store.unlock('dummy readiness master phrase');await store.configure({rememberSessions:true});store.saveArchive([{name:'Default/Cookies',data:Buffer.from('dummy-cookie')}]);
        browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:dir+'/profiles',profileStore:store});browser.child=Object.assign(new EE(),{exitCode:0,signalCode:null});
        let restoredOldCookie=false,restoreCalled=false;const original=store.restore.bind(store);store.restore=async(p,allowed)=>{restoreCalled=true;await original(p,allowed);restoredOldCookie=fs.existsSync(p+'/Default/Cookies');throw new Error('fixture-stop-before-spawn');};
        await Promise.allSettled([browser.clearBrowserData('sites'),browser.start('')]);assert(restoreCalled);assert.equal(restoredOldCookie,false);assert.equal((await store.archiveAsync()).length,0);
    }finally{if(browser){browser.destroy();await browser.closing;}remove(dir);}
});
test('Corrupt session archive can be reset without deleting the password vault',async()=>{
    const dir=fixture();try{const store=new SecureBrowserData(dir+'/protected');await store.unlock('dummy corruption master phrase');await store.configure({rememberSessions:true});await store.saveLogin('https://example.org','dummy-user','dummy-secret');
        fs.writeFileSync(dir+'/protected/sessions.bin','corrupt-fixture');await store.restore(dir+'/profile');assert(fs.existsSync(dir+'/protected/sessions.bin.damaged'));assert.match(store.error,/beschädigt/);await store.resetSessions();assert.equal((await store.archiveAsync()).length,0);assert.equal((await store.listLogins()).length,1);
    }finally{remove(dir);}
});
test('Archive processing yields and concurrent initial setup preserves one master key',async()=>{
    const dir=fixture();try{const store=new SecureBrowserData(dir+'/protected');await Promise.all([store.unlock('dummy one master phrase'),store.unlock('dummy one master phrase')]);await store.configure({rememberSessions:true});
        let ticks=0;const timer=setInterval(()=>ticks++,1);try{await store.saveArchiveAsync([{name:'Default/Cookies',data:Buffer.alloc(6*1024*1024,97)}]);assert.equal((await store.archiveAsync())[0].data.length,6*1024*1024);assert(ticks>0);}finally{clearInterval(timer);}
        const reopened=new SecureBrowserData(dir+'/protected');await reopened.unlock('dummy one master phrase');assert.equal((await reopened.archiveAsync()).length,1);
    }finally{remove(dir);}
});
test('Browser close terminates only its own unresponsive child and skips invalid capture',{skip:process.platform!=='linux'},async()=>{
    const dir=fixture();let browser,child;
    try{let captured=false;browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:dir,profileStore:{capture:async()=>{captured=true;}}});
        child=cp.spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},1000)'],{detached:true,stdio:['ignore','pipe','ignore']});await new Promise(r=>child.stdout.once('data',r));
        browser.child=child;browser.profile=fs.mkdtempSync(path.join(dir,'session-'));browser.stop('fixture close');await browser.closing;
        assert.equal(child.signalCode,'SIGKILL');assert.equal(captured,false);assert.equal(fs.readdirSync(dir).length,0);assert.equal(browser.shutdownFault,null);
    }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');if(browser){browser.destroy();await browser.closing;}remove(dir);}
});
test('DHCP subnet overlap with another interface fails before network mutation',()=>{
    const {assertIsolated}=require('../network/lease_policy');
    const topology=[{ifname:'eth0',addr_info:[{family:'inet',local:'192.168.1.10',prefixlen:24}]},{ifname:'wlan0',addr_info:[]}];
    assert.throws(()=>assertIsolated('192.168.1.40',24,topology),/überschneidet/);assert.throws(()=>assertIsolated('192.168.0.4',16,topology),/überschneidet/);assert.doesNotThrow(()=>assertIsolated('172.20.10.2',28,topology));
});
test('Deferred media work cannot resolve old accessibility nodes in a different tab',async()=>{
    const media=require('../src/browser_media'),calls=[];
    let release;const response=new Promise(r=>release=r);
    const browser=Object.assign({pipe:{send:async(method,params,session)=>{calls.push({method,session});return response;}},session:'tab-a',pageGeneration:1,requireAllowed(){}},media);
    const context=browser.mediaContext(),pending=context.send('Accessibility.getFullAXTree');
    browser.session='tab-b';browser.pageGeneration=2;release({nodes:[]});await assert.rejects(pending,/gewechselt/);assert.equal(calls[0].session,'tab-a');
    await assert.rejects(()=>context.send('DOM.resolveNode',{backendNodeId:7}),/gewechselt/);assert.equal(calls.length,1);
    const order=[];await Promise.all([browser.mediaTask(async()=>{await new Promise(r=>setImmediate(r));order.push('turn');}),browser.mediaTask(async()=>order.push('press'))]);assert.deepEqual(order,['turn','press']);
});
test('A crashed browser cannot replace the last good archived session',async()=>{
    const dir=fixture();let browser;try{let captured=false;browser=new Browser({gate:{check:()=>({allowed:true})},profileRoot:dir,profileStore:{capture:async()=>{captured=true;}}});browser.child=Object.assign(new EE(),{exitCode:7,signalCode:null});browser.profile=fs.mkdtempSync(path.join(dir,'session-'));browser.stop('fixture crash');await browser.closing;assert.equal(captured,false);assert.equal(fs.readdirSync(dir).length,0);}finally{if(browser){browser.destroy();await browser.closing;}remove(dir);}
});
test('A tab change between a protocol reply and the caller continuation cannot commit stale focus',async()=>{
    const media=require('../src/browser_media');let finish,reached;const atCall=new Promise(r=>reached=r);
    const browser=Object.assign({pipe:{send:async method=>{if(method==='DOM.resolveNode')return {object:{objectId:'old-page-button'}};return new Promise(r=>{finish=r;reached();});}},session:'tab-a',pageGeneration:1,requireAllowed(){}},media);
    browser.accessibleMediaControls=async()=>[{node:7,name:'Play',x:10,y:400}];
    const pending=browser.focusAccessibleMediaControl(1);await atCall;finish({});Promise.resolve().then(()=>{browser.session='tab-b';browser.pageGeneration=2;});
    await assert.rejects(pending,/gewechselt/);assert.equal(browser.focusedMediaControl,undefined);assert.equal(browser.focusedMediaObject,undefined);
});
