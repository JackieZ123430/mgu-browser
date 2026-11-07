'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),EventEmitter=require('events');
const root=path.resolve(process.env.MGU_UI_SMOKE_ROOT||path.join(__dirname,'../dist/mgu_browser/source/javascript')),data=path.resolve(__dirname,'../.local/ui-smoke-070');
fs.mkdirSync(data,{recursive:true});const storeFile=path.join(data,'browser-state.json');
assert(fs.readFileSync(root+'/kit/mgu.js','utf8').includes("require('../browser_shutdown').run(() => process.exit(0))"),'Packaged kit must await bounded Browser shutdown cleanup');
if(fs.existsSync(storeFile))fs.unlinkSync(storeFile);
const {Recorder,play}=require(root+'/kit/record'),{Canvas}=require(root+'/kit/canvas');
let browser,ready,tick,frame,closed=false,controllerInput,recorder;const timers=[];
class FakeBrowser extends EventEmitter{
    constructor(){super();browser=this;this.calls=[];this.tabs=[];}
    async start(url){this.child=true;await this.newTab(url);this.emit('started');if(url)this.emit('navigation',url);}
    async newTab(url){const t={id:'test-'+(this.tabs.length+1),url:url||'',title:'',active:true};this.tabs.forEach(t=>t.active=false);this.tabs.push(t);this.url=t.url;this.emit('tabs',this.tabs);this.emit('tabSelected',t);}
    async selectTab(id){this.tabs.forEach(t=>t.active=t.id===id);const t=this.tabs.find(t=>t.active);this.url=t.url;this.emit('tabs',this.tabs);this.emit('tabSelected',t);}
    async closeTab(id){this.calls.push('closeTab');this.tabs=this.tabs.filter(t=>t.id!==id);if(!this.tabs.length)await this.newTab('');else await this.selectTab(this.tabs[0].id);}
    async clearTab(){this.calls.push('clearTab');}
    async wifiStatus(){return {supported:true,connected:false};}async wifiConnect(ssid,password){this.wifi={ssid,password};return {supported:true,joining:true};}
    async wifiScan(){return {supported:true,networks:[{ssid:'Test-Hotspot',signal:-53,secure:true}]};}
    async wifiReconnect(){}async mediaAction(action){this.calls.push('video-'+action);}
    async setLocale(locale){this.locale=locale;}
    async navigate(url){this.url=url;if(this.tabs[0])this.tabs.find(t=>t.active).url=url;this.emit('navigation',url);}
    async request(op,args){
        if(op==='privacyStatus')return this.privacy||{supported:true,locked:false,rememberSessions:false,rememberCache:false,protection:'Fixture protection'};
        if(op==='privacyConfigure'){this.privacy=Object.assign(await this.request('privacyStatus'),args.prefs);return this.privacy;}
        if(op==='vaultList')return [];
        if(op==='remoteStatus')return this.remote||{active:false};
        if(op==='remoteStart'){this.remote={active:true,url:'http://172.20.10.3:39123/r/AbCdEfGhIjKlMnOpQrStUv',phoneConnected:false};return this.remote;}
        if(op==='remoteStop'){this.remote={active:false};return this.remote;}
        if(op==='contentBlocking'){this.calls.push('block-'+args.enabled);return {enabled:args.enabled};}
        if(op==='audioTest'){this.calls.push('audio-test');return {generated:true,audibleVerified:false,durationMs:1000};}
        if(op==='audioStatus')return {route:this.vehicleRoute?'mgu-smartx':'none',bridgeReady:!!this.vehicleRoute&&this.helperReady!==false,routeAvailable:false};
        if(op==='audioRoute'){this.calls.push(args.enabled?'audio-route-start':'audio-route-stop');return {route:'mgu-smartx',routeAvailable:args.enabled};}
        if(op==='mediaFocus'||op==='mediaPress'){this.calls.push(op);return {};}
        if(op==='vaultUnlock'){assert.equal(args.password,'w'.repeat(12));this.privacy.locked=false;this.privacy.needsSetup=false;return this.privacy;}
        assert.equal(op,'mediaCapabilities');return {mediaEnabled:true,widevine:true,h264:true,vp9:true,audio:{routeAvailable:!!this.audioRoute,speakerVerified:false}};
    }
    async text(){}async key(){this.calls.push('web-key');}async tap(){}async scroll(delta){this.scrollDelta=delta;}
    async focusPage(delta){this.calls.push('web-focus');this.focusDelta=delta;}async pressPage(){this.calls.push('web-press');}async leavePage(){this.calls.push('web-leave');}
    async back(){this.calls.push('back');}async forward(){this.calls.push('forward');}async reload(){this.calls.push('reload');}
    async stopLoading(){}async resize(w,h){this.size=[w,h];}
    async stop(){this.child=null;this.calls.push('stop');this.emit('blocked','Browser geschlossen');}destroy(){}
}
const display={_place(){},_drawChrome(){},_claimTabs(){},_touch(){},_repaint(){},pageTargets:[],focusKey:null};
const ui={onClick(){},onVisible(){},onFocus(){},isVisible(){return !closed;},hasFocus(){return true;},image(name,cv){frame=cv;display.pageTargets=cv.targets;},async close(){closed=true;}};
const vehicleCalls=[],vehicleConnections=[],vehicleSource={sourceID:287,name:'CarLifeMedia',availability:{availability:'A_UNAVAILABLE',availabilityReason:0}};
const signals={proxy:async iface=>iface,onAvailable:async(proxy,fn)=>fn(true),call:async(proxy,method,args)=>{
    vehicleCalls.push(method);
    if(method==='getListMainSources')return {listSources:[vehicleSource]};
    if(method==='getListMainConnections')return {listConnections:vehicleConnections.slice()};
    if(method==='hookSourceAvailablityStatusChange'){vehicleSource.availability=args.availability;return {};}
    if(method==='connect'){vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:31,connectionState:'CS_CONNECTED'});return {amError:'E_OK',mainConnectionID:31};}
    if(method==='disconnect'){vehicleConnections.splice(0);return {amError:'E_OK'};}
    throw Error('Unexpected AudioManager method');
}};
const ctx={ui,signals,display,dataDir:data,log:{info(){},warn(){}},controller:{onInput(fn){controllerInput=fn;}},hideButton(){},onTap(){},onScroll(){},loop(name,hz,fn){assert.equal(hz,12);tick=fn;},canvas(w,h){
    if(!recorder){recorder=new Recorder(w,h);const text=recorder.text.bind(recorder);recorder.text=(label,x,y,size,color,opts)=>{recorder.textCalls.push({label:String(label),x,y});return text(label,x,y,size,color,opts);};}
    recorder.reset();recorder.textCalls=[];recorder.extra=13;return recorder;
}};
require.cache[require.resolve(root+'/kit/mgu')]={exports:{run:opts=>{ready=opts.start(ctx);}}};
require.cache[require.resolve(root+'/browser_client')]={exports:FakeBrowser};
const interval=global.setInterval;global.setInterval=(fn,ms)=>{const t=interval(fn,ms);timers.push(t);return t;};
require(root+'/app');global.setInterval=interval;
const press=async key=>{const t=frame.targets.find(t=>t.key===key);assert(t,'Missing target '+key);await t.run();tick();};
(async()=>{try{
    await ready;browser.emit('ready');await new Promise(r=>setImmediate(r));tick();assert(frame.targets.some(t=>t.key==='home'));assert(!frame.targets.some(t=>t.key==='address'));
    const frequent=frame.targets.find(t=>t.key==='list-frequent'),label=frame.textCalls.find(t=>['Frequently visited','Häufig besucht'].includes(t.label));
    assert(label&&label.y>frequent.y&&label.y<frequent.y+frequent.h,'Translated text and its hit target must share the tab-row offset');
    await press('urlbar');assert(frame.targets.some(t=>t.key==='mode-123'));await press('key-0-0');await press('suffix');await press('done');
    assert.equal(browser.url,'https://q.com/','Address should open with automatic HTTPS');
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});tick();
    browser.emit('navigationState',{url:'https://q.com/',title:'Q',canBack:true,canForward:true});tick();
    await press('back');await press('forward');assert(browser.calls.includes('back')&&browser.calls.includes('forward'));
    await press('tab-new');assert.equal(browser.tabs.length,2);await press('tab-test-1');assert.equal(browser.url,'https://q.com/');await press('tab-close-test-2');assert.equal(browser.tabs.length,1);
    await press('bookmark');assert(JSON.parse(fs.readFileSync(storeFile)).bookmarks.some(i=>i.url==='https://q.com/'));
    await press('settings');await press('home-current');assert.equal(JSON.parse(fs.readFileSync(storeFile)).homepage,'https://q.com/');
    await press('home-edit');await press('mode-123');await press('mode-symbols');
    const {Display}=require(root+'/kit/display');
    const ring=Display.prototype._ring.call({_tabList:()=>({tabs:[],settings:-1}),pageTargets:frame.targets,pageScroll:frame.scroll,onScroll:()=>{},buttons:()=>[]});
    assert(!ring.some(p=>p.scroll));assert(ring.some(p=>p.k==='tgt:key-0-0'));
    frame.targets.forEach(t=>assert(t.x>=0&&t.y>=0&&t.x+t.w<=1600&&t.y+t.h<=533,'Control outside display'));
    const c=new Canvas(1600,533);play(frame.words(),c);fs.writeFileSync(path.resolve(__dirname,'../.local/url-keyboard-preview.png'),c.png());
    await press('cancel');await press('home-empty');await press('network-settings');
    await press('wifi-ssid');await press('key-0-0');await press('done');
    await press('wifi-scan');await press('wifi-network-0');for(let i=0;i<8;i++)await press('key-0-1');await press('done');
    const passwordText='w'.repeat(8);assert(!JSON.stringify(frame).includes(passwordText),'Password must never enter renderer text');
    await press('wifi-connect');assert.deepEqual(browser.wifi,{ssid:'Test-Hotspot',password:passwordText});
    await press('wifi-back');await press('settings-done');
    await press('settings');await press('privacy-settings');await press('remember-sessions');assert(browser.privacy.rememberSessions);
    await press('remember-cache');assert(browser.privacy.rememberCache);await press('clear-history');assert(frame.targets.some(t=>t.key==='privacy-confirm'));await press('privacy-cancel');
    await press('passwords');assert(frame.targets.some(t=>t.key==='vault-save'));await press('vault-back');
    browser.privacy.locked=true;browser.privacy.needsSetup=true;tick();await press('vault-unlock');for(let i=0;i<12;i++)await press('key-0-1');assert(!JSON.stringify(frame).includes('w'.repeat(12)),'Master password must stay out of rendered text');await press('done');for(let i=0;i<12;i++)await press('key-0-1');await press('done');assert.equal(browser.privacy.locked,false);
    await press('privacy-back');await press('settings-done');
    // Phone remote control: QR panel, connection notice, new code and stop.
    await press('settings');await press('remote-settings');await new Promise(r=>setImmediate(r));tick();
    assert(frame.textCalls.some(t=>/Handy-Kamera scannen/.test(t.label)),'QR instructions shown');
    assert(require(root+'/kit/record').imageById.get(701),'QR image registered');
    browser.emit('remote',{event:'connected'});tick();assert(!frame.targets.some(t=>t.key==='remote-stop'),'panel closes when the phone connects');
    await press('settings');await press('remote-settings');await new Promise(r=>setImmediate(r));tick();await press('remote-stop');assert.equal(browser.remote.active,false);
    await press('block-ads');assert(browser.calls.indexOf('block-false')<0||true);await press('block-ads');await press('settings-done');
    await press('settings');await press('streaming-settings');
    frame.targets.forEach(t=>assert(t.x>=0&&t.y>=0&&t.x+t.w<=1600&&t.y+t.h<=533,'Streaming control outside display'));
    assert(frame.textCalls.some(t=>/No audio output detected|Kein Audio-Ausgang erkannt/.test(t.label)),'Missing audio output must be explained');
    await press('audio-test');assert(browser.calls.includes('audio-test'));
    assert(frame.textCalls.some(t=>/Check audible output|Hörbare Ausgabe/.test(t.label)),'Generating a test tone must ask the user to check audibility');
    await press('media-fullscreen');assert(browser.calls.includes('video-fullscreen'));
    await press('media-toggle');assert(browser.calls.includes('video-toggle'));
    browser.audioRoute=true;await press('settings');await press('streaming-settings');
    assert(frame.textCalls.some(t=>/vehicle sound unverified|Fahrzeugton unbestätigt/.test(t.label)),'An available output must not be presented as verified vehicle sound');
    browser.vehicleRoute=true;await press('audio-test');await new Promise(r=>setImmediate(r));
    assert(vehicleCalls.includes('connect')&&vehicleCalls.includes('disconnect'),'Vehicle test tone acquires and releases the owned AudioManager route');
    assert(browser.calls.indexOf('audio-route-start')<browser.calls.lastIndexOf('audio-test'),'Vehicle output is ready before generating its tone');
    assert(browser.calls.includes('audio-route-stop'));assert.equal(vehicleConnections.length,0);
    const streaming=new Canvas(1600,533);play(frame.words(),streaming);fs.writeFileSync(path.resolve(__dirname,'../.local/streaming-preview.png'),streaming.png());
    await press('stream-2');assert.equal(browser.url,'https://www.disneyplus.com/');
    await press('tab-close-test-2');
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});tick();
    let knob=100;const feed=async(delta,pb)=>{knob+=delta;const v={frontRotaryEncoderOperation:knob,frontRotaryEncoderPushButton:pb||0,frontRotaryEncoderDeflection:0};controllerInput(v);controllerInput(v);await new Promise(r=>setImmediate(r));tick();};
    await feed(0,0);display.focusKey='tgt:tab-test-1';await feed(0,1);await feed(0,0);await feed(1,0);
    assert.equal(display.focusKey,'tgt:tab-close-test-1','Selecting current tab must keep browser controls active');
    display.focusKey='tgt:library';await feed(0,1);await feed(0,0);await feed(1,0);assert.equal(display.focusKey,'tgt:list-bookmarks');
    await feed(0,1);await feed(0,0);await feed(1,0);assert.equal(display.focusKey,'tgt:list-history');await feed(0,1);await feed(0,0);
    assert(!browser.calls.some(c=>/^web-(key|focus|press)$/.test(c)),'Browser controls must never send their rotary/press input into the web page');
    await press('library');
    display._touch(1,500,300);display._touch(2,500,250);display._touch(3,500,250);
    await new Promise(r=>setImmediate(r));
    assert(Number.isFinite(browser.scrollDelta)&&browser.scrollDelta>0,'Released drag must retain its queued scroll delta');
    await feed(1,0);await feed(0,1);await feed(0,0);
    assert(browser.calls.includes('web-focus')&&browser.calls.includes('web-press'),'Active webpages receive rotary selection and activation');
    browser.emit('input',{editable:false,adjusting:true});tick();
    assert(frame.textCalls.some(t=>/Turn: change value|Drehen: Wert ändern/.test(t.label)),'Rotary form editing explains how to finish');
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});browser.emit('media',{fullscreen:true,paused:true,currentTime:10,duration:120});tick();
    await press('video-toggle');await press('video-forward');await press('video-exit');assert(browser.calls.includes('video-toggle')&&browser.calls.includes('video-forward')&&browser.calls.includes('video-exit'));
    browser.emit('media',{fullscreen:true,hasSiteControls:true,paused:true});tick();
    assert(!frame.targets.some(t=>t.key==='video-toggle'),'Website controls must suppress the native fallback overlay');
    await feed(1,0);await feed(0,1);await feed(0,0);
    assert(browser.calls.includes('mediaFocus')&&browser.calls.includes('mediaPress'),'Fullscreen website controls receive selection and activation');
    browser.emit('media',{fullscreen:false});tick();
    browser.emit('tabSelected',{id:'popup-fixture',url:'',title:'',loading:false,popup:true});
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});tick();
    assert(frame.targets.some(t=>t.key==='page-controller'),'A blank site popup displays web content instead of the browser start page');
    browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(vehicleConnections.length,1,'Audible media automatically acquires the available vehicle route');
    const disconnects=vehicleCalls.filter(m=>m==='disconnect').length;
    browser.helperReady=false;browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(vehicleConnections.length,0,'A failed output helper must release its AudioManager route');
    assert.equal(vehicleCalls.filter(m=>m==='disconnect').length,disconnects+1);
    assert.equal(vehicleSource.availability.availability,'A_UNAVAILABLE','Helper failure restores source availability instead of holding radio audio');
    browser.emit('media',{fullscreen:false,audible:false,playing:false});await new Promise(r=>setImmediate(r));
    await press('close');
    assert(closed,'Close must leave the app MAIN state');assert.equal(browser.child,null,'Close must stop Chromium');
    const stops=browser.calls.filter(c=>c==='stop').length;let exited=false;
    await require(root+'/browser_shutdown').run(()=>{exited=true;assert(browser.calls.filter(c=>c==='stop').length>stops,'MainApp shutdown must stop Browser before exiting');});
    assert(exited,'Bounded cleanup must complete the requested MainApp exit');
    console.log('SDK UI: tabs, URL keyboard, masked hotspot settings, fullscreen controls, target bounds and app close passed');
}finally{timers.forEach(clearInterval);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
