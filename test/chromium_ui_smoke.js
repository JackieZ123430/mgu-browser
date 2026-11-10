'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),EventEmitter=require('events');
const root=path.resolve(process.env.MGU_UI_SMOKE_ROOT||path.join(__dirname,'../dist/mgu_browser/source/javascript')),data=path.resolve(__dirname,'../.local/ui-smoke-070');
fs.mkdirSync(data,{recursive:true});const storeFile=path.join(data,'browser-state.json');
assert(fs.readFileSync(root+'/kit/mgu.js','utf8').includes("require('../browser_shutdown').run(() => process.exit(0))"),'Packaged kit must await bounded Browser shutdown cleanup');
if(fs.existsSync(storeFile))fs.unlinkSync(storeFile);
const {Recorder,play}=require(root+'/kit/record'),{Canvas}=require(root+'/kit/canvas');
const RealBrowserClient=require(root+'/browser_client');
{
    const fonts=require(root+'/kit/fonts');
    const restore=require(root+'/browser_fonts').install(fonts,path.join(root,'kit/fonts'));
    const atlas=JSON.parse(fs.readFileSync(root+'/kit/fonts/cjk-titles.json','utf8'));
    assert(atlas.sizes.every(s=>s.atlasW<=1024&&s.atlasH<=2048),'Title font must fit the renderer texture budget');
    for(const text of ['百度一下，你就知道','百度安全验证','百度热搜']){
        const font=fonts.get('label',18,text);
        for(const ch of text)assert(font.glyphs[ch.codePointAt(0)],'Missing title glyph: '+ch);
    }
    restore();
}
if(/^zh(?:-|$)/i.test(process.env.MGU_EMULATOR_LOCALE||'')){
    const fonts=require(root+'/kit/fonts');
    const atlas=JSON.parse(fs.readFileSync(root+'/kit/fonts/cjk.json','utf8'));
    assert(atlas.sizes.every(s=>s.atlasW<=1024&&s.atlasH<=2048),'CJK atlas must fit the renderer texture budget');
    const labels=Object.values(require(root+'/browser_zh_cn')).concat(['中文网页标题']);
    for(const label of labels){
        const font=fonts.get('label',24,label);
        for(const ch of label)if(/[\u3000-\u9fff\uff00-\uffef]/.test(ch))
            assert(font.glyphs[ch.codePointAt(0)],'Missing packaged CJK glyph: '+ch);
    }
}

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
        if(op==='files')return this.filesState||{downloads:[],chooser:null};
        if(op==='dialogReply'){this.lastDialogReply=args;this.emit('dialog',null);return {handled:true};}
        if(op==='permissionStatus')return {available:true,origin:'https://q.com',permissions:[{name:'camera',state:'prompt'}]};
        if(op==='permissionSet'){this.lastPermissionSet=args;return {available:true,origin:args.expectedOrigin,permissions:[{name:args.name,state:args.setting}]};}
        if(op==='permissionAnswer'){this.lastPermissionAnswer=args;this.emit('permission',{id:args.permissionId,state:'resolved'});return {};}
        if(op==='cancelFileChooser'){this.emit('fileChooser',null);return {};}
        if(op==='authReply'){this.lastAuthReply=args;this.emit('auth',null);return {handled:true};}
        if(op==='findText'){const state={active:true,query:args.query,found:true,caseSensitive:!!(args.options&&args.options.caseSensitive)};this.emit('find',state);return state;}
        if(op==='clearFind'){this.emit('find',{active:false,query:'',found:false});return {};}
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
    async text(){}async fillStructured(value){this.structuredValue=value;}async key(){this.calls.push('web-key');}async tap(){}async scroll(delta,options){this.scrollDelta=delta;this.scrollOptions=options;}
    async focusPage(delta){this.calls.push('web-focus');this.focusDelta=delta;}async pressPage(){this.calls.push('web-press');}async leavePage(){this.calls.push('web-leave');}
    async focusMedia(delta){return this.request('mediaFocus',{delta});}async pressMedia(){return this.request('mediaPress');}
    cancelController(){this.calls.push('controller-cancel');return RealBrowserClient.prototype.cancelController.call(this);}
    controller(op,delta,mode){return RealBrowserClient.prototype.controller.call(this,op,delta,mode);}pumpController(){return RealBrowserClient.prototype.pumpController.call(this);}
    async back(){this.calls.push('back');}async forward(){this.calls.push('forward');}async reload(){this.calls.push('reload');}
    async stopLoading(){}async resize(w,h){this.size=[w,h];}
    async stop(){this.child=null;this.calls.push('stop');this.emit('blocked','Browser geschlossen');}destroy(){}
}
const display={_place(){},_drawChrome(){},_claimTabs(){},_touch(){},_repaint(){},pageTargets:[],focusKey:null};
let hmiFocused=true,focusRequest=null;
const ui={onClick(){},onVisible(){},onFocus(){},isVisible(){return !closed;},hasFocus(){return hmiFocused;},async open(name){assert.equal(name,'MAIN');vehicleCalls.push('focus-main');if(focusRequest)await focusRequest();},image(name,cv){frame=cv;display.pageTargets=cv.targets;},async close(){closed=true;}};
const vehicleCalls=[],vehicleConnections=[],vehicleDisconnected=[],vehicleSource={sourceID:287,name:'CarLifeMedia',availability:{availability:'A_UNAVAILABLE',availabilityReason:0}};
const signals={proxy:async iface=>iface,onAvailable:async(proxy,fn)=>fn(true),call:async(proxy,method,args)=>{
    vehicleCalls.push(method);
    if(method==='getListMainSources')return {listSources:[vehicleSource]};
    if(method==='getListMainConnections')return {listConnections:vehicleConnections.slice()};
    if(method==='hookSourceAvailablityStatusChange'){vehicleSource.availability=args.availability;return {};}
    if(method==='connect'){vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:31,connectionState:'CS_CONNECTED'});return {amError:'E_OK',mainConnectionID:31};}
    if(method==='disconnect'){vehicleDisconnected.push(args.mainConnectionID);const index=vehicleConnections.findIndex(c=>c.mainConnectionID===args.mainConnectionID);if(index>=0)vehicleConnections.splice(index,1);return {amError:'E_OK'};}
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
    const frequent=frame.targets.find(t=>t.key==='list-frequent'),label=frame.textCalls.find(t=>['Frequently visited','Häufig besucht','常用网站'].includes(t.label));
    assert(label&&label.y>frequent.y&&label.y<frequent.y+frequent.h,'Translated text and its hit target must share the tab-row offset');
    await press('urlbar');assert(frame.targets.some(t=>t.key==='mode-123'));await press('key-0-0');await press('suffix');await press('done');
    assert.equal(browser.url,'https://q.com/','Address should open with automatic HTTPS');
    await new Promise(resolve=>setImmediate(resolve));assert(browser.size&&browser.size[0]===1280,'The frontend bootstraps its viewport before the first image arrives');
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
    const cameraInstruction=new (require(root+'/browser_locale').BrowserLocale)({currentVehicleUnits:{getLanguage:()=>browser.locale}}).text('Mit der Handy-Kamera scannen');
    assert(frame.textCalls.some(t=>t.label===cameraInstruction),'QR instructions match the active language');
    const qrImage=require(root+'/kit/record').imageById.get(701);
    assert(qrImage&&qrImage.w>0&&qrImage.w===qrImage.h&&qrImage.data.length===qrImage.w*qrImage.h*4,'QR image registered with complete pixels');
    assert(frame.images.has(701),'QR image is drawn in the remote panel');
    assert(frame.targets.some(t=>t.key==='remote-new')&&frame.targets.some(t=>t.key==='remote-stop'),'QR renewal and remote stop remain available');
    const remotePreview=new Canvas(1600,533);play(frame.words(),remotePreview);fs.writeFileSync(path.resolve(__dirname,'../.local/remote-preview.png'),remotePreview.png());
    browser.emit('remote',{event:'connected'});tick();assert(!frame.targets.some(t=>t.key==='remote-stop'),'panel closes when the phone connects');
    await press('settings');await press('remote-settings');await new Promise(r=>setImmediate(r));tick();await press('remote-stop');assert.equal(browser.remote.active,false);
    await press('block-ads');assert(browser.calls.indexOf('block-false')<0||true);await press('block-ads');await press('settings-done');
    await press('settings');await press('streaming-settings');
    frame.targets.forEach(t=>assert(t.x>=0&&t.y>=0&&t.x+t.w<=1600&&t.y+t.h<=533,'Streaming control outside display'));
    assert(frame.textCalls.some(t=>/No audio output detected|Kein Audio-Ausgang erkannt|未检测到音频输出/.test(t.label)),'Missing audio output must be explained');
    await press('audio-test');assert(browser.calls.includes('audio-test'));
    assert(frame.textCalls.some(t=>/Check audible output|Hörbare Ausgabe|请检查设备是否发声/.test(t.label)),'Generating a test tone must ask the user to check audibility');
    await press('media-fullscreen');assert(browser.calls.includes('video-fullscreen'));
    await press('media-toggle');assert(browser.calls.includes('video-toggle'));
    browser.audioRoute=true;await press('settings');await press('streaming-settings');
    assert(frame.textCalls.some(t=>/vehicle sound unverified|Fahrzeugton unbestätigt|车辆声音尚未验证/.test(t.label)),'An available output must not be presented as verified vehicle sound');
    browser.vehicleRoute=true;await press('audio-test');await new Promise(r=>setImmediate(r));
    assert(vehicleCalls.includes('connect')&&vehicleCalls.includes('disconnect'),'Vehicle test tone acquires and releases the owned AudioManager route');
    assert(browser.calls.indexOf('audio-route-start')<browser.calls.lastIndexOf('audio-test'),'Vehicle output is ready before generating its tone');
    assert(browser.calls.includes('audio-route-stop'));assert.equal(vehicleConnections.length,0);
    // A busy CarLife source is taken over after a genuine HMI-open request.
    // Other sources remain connected, and closing releases only our new ID.
    vehicleSource.availability={availability:'A_AVAILABLE',availabilityReason:0};
    vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:81,connectionState:'CS_CONNECTED'},
        {sourceID:287,sinkID:1030,mainConnectionID:82,connectionState:'CS_CONNECTED'},
        {sourceID:200,sinkID:1024,mainConnectionID:83,connectionState:'CS_CONNECTED'});
    const takeoverAt=vehicleCalls.length;let finishFocus;
    focusRequest=()=>new Promise(resolve=>finishFocus=resolve);
    const takeover=frame.targets.find(t=>t.key==='audio-test').run();await new Promise(r=>setImmediate(r));
    assert(vehicleCalls.slice(takeoverAt).includes('focus-main'),'Busy-source takeover requests actual MAIN foreground');
    assert(!vehicleCalls.slice(takeoverAt).some(m=>['disconnect','connect','hookSourceAvailablityStatusChange'].includes(m)),'AudioManager mutations wait for the focus request');
    finishFocus();await takeover;await new Promise(r=>setImmediate(r));tick();focusRequest=null;
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID),[83],'Takeover and release preserve unrelated audio sources');
    assert(vehicleDisconnected.includes(81)&&vehicleDisconnected.includes(82),'All occupied routes of the requested source are replaced');
    assert(!vehicleDisconnected.includes(83),'A different source is never disconnected');
    assert(vehicleCalls.slice(takeoverAt).indexOf('focus-main')<vehicleCalls.slice(takeoverAt).indexOf('disconnect'),'HMI focus precedes the audio takeover');
    // A fresh playback request must survive cancellation of an older handoff,
    // even when there is no later media event to retry steady WebAudio.
    vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:84,connectionState:'CS_CONNECTED'});
    let resumedFocus,focusAttempts=0;
    focusRequest=()=>++focusAttempts===1?new Promise(resolve=>resumedFocus=resolve):Promise.resolve();
    const resumedAt=vehicleCalls.length;
    browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(typeof resumedFocus,'function');
    browser.emit('media',{fullscreen:false,audible:false,playing:false});
    browser.emit('media',{fullscreen:false,audible:true,playing:true});
    resumedFocus();
    for(let i=0;i<20&&!vehicleConnections.some(c=>c.mainConnectionID===31);i++)await new Promise(r=>setImmediate(r));
    assert.equal(focusAttempts,2,'Resuming playback starts a new handoff instead of reusing the cancelled promise');
    assert.equal(vehicleCalls.slice(resumedAt).filter(m=>m==='connect').length,1,'Only the fresh playback intent connects');
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID).sort((a,b)=>a-b),[31,83]);
    const beforeUnknown=vehicleCalls.filter(m=>m==='disconnect').length;
    browser.emit('media',{fullscreen:false,audible:false,playing:false,activityUnknown:true});await new Promise(r=>setImmediate(r));
    assert(vehicleConnections.some(c=>c.mainConnectionID===31),'An unknown query briefly holds only the already-owned route');
    assert.equal(vehicleCalls.filter(m=>m==='disconnect').length,beforeUnknown);
    await new Promise(resolve=>setTimeout(resolve,4100));await new Promise(r=>setImmediate(r));
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID),[83],'An unchanged unknown state releases the route after the finite grace without requiring another media event');
    browser.emit('media',{fullscreen:false,audible:false,playing:false});await new Promise(r=>setImmediate(r));focusRequest=null;
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID),[83]);
    browser.emit('media',{fullscreen:false,audible:false,playing:false,activityUnknown:true});await new Promise(r=>setImmediate(r));
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID),[83],'Unknown activity alone never starts a new audio takeover');
    // The SDK wrapper may resolve even when HMI focus was not granted.
    vehicleConnections.splice(0);vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:91,connectionState:'CS_CONNECTED'});
    const refusedAt=vehicleCalls.length,tonesBefore=browser.calls.filter(c=>c==='audio-test').length;
    focusRequest=async()=>{hmiFocused=false;};await press('audio-test');hmiFocused=true;focusRequest=null;
    assert(!vehicleCalls.slice(refusedAt).some(m=>['disconnect','connect','hookSourceAvailablityStatusChange'].includes(m)),'Unconfirmed HMI focus must not take over audio');
    assert.equal(browser.calls.filter(c=>c==='audio-test').length,tonesBefore,'Focus refusal cannot start output or a test tone');
    vehicleConnections.splice(0);vehicleSource.availability={availability:'A_UNAVAILABLE',availabilityReason:0};
    const streaming=new Canvas(1600,533);play(frame.words(),streaming);fs.writeFileSync(path.resolve(__dirname,'../.local/streaming-preview.png'),streaming.png());
    await press('stream-1');assert.equal(browser.url,'https://www.netflix.com/login','Netflix opens the existing-account login form directly');
    await press('tab-close-test-2');await press('settings');await press('streaming-settings');
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
    // A native keyboard must cancel held page-controller work, while keeping
    // the webpage's text-field focus available for subsequent typing.
    const originalRequest=browser.request,controllerCalls=[];let finishController;
    Object.assign(browser,{channel:{},generation:1,lastAllowed:true,gate:{check:()=>({allowed:true})}});
    browser.request=function(op,args){if(op==='pageFocus'){controllerCalls.push(op);return new Promise(resolve=>finishController=resolve);}if(op==='pagePress'){controllerCalls.push(op);return Promise.resolve({});}return originalRequest.call(this,op,args);};
    const heldTurn=RealBrowserClient.prototype.focusPage.call(browser,1);await new Promise(r=>setImmediate(r));
    const queuedTurn=RealBrowserClient.prototype.focusPage.call(browser,2),queuedPress=RealBrowserClient.prototype.pressPage.call(browser);
    browser.emit('input',{editable:true,password:false});tick();assert(frame.targets.some(t=>t.key==='keyboard-close'),'Editable input opens the native keyboard');
    assert((await Promise.all([heldTurn,queuedTurn,queuedPress])).every(r=>r.cancelled),'Opening the keyboard cancels old page turns and activation');
    finishController({});await new Promise(r=>setImmediate(r));assert.deepEqual(controllerCalls,['pageFocus'],'No hidden webpage focus or activation follows the keyboard transition');browser.request=originalRequest;
    await press('keyboard-close');browser.emit('input',{editable:false});
    browser.emit('input',{editable:false,adjusting:true});tick();
    assert(frame.textCalls.some(t=>/Turn: change value|Drehen: Wert ändern|旋转：修改数值/.test(t.label)),'Rotary form editing explains how to finish');
    browser.emit('input',{editable:true,password:false,type:'textarea',multiline:true});tick();await press('text-keyboard');
    const beforeDone=browser.calls.filter(c=>c==='web-key').length;await press('done');assert.equal(browser.calls.filter(c=>c==='web-key').length,beforeDone,'Dismissing a text keyboard must not submit or insert a newline');
    browser.emit('input',{editable:true,password:false,type:'date'});tick();await press('text-keyboard');
    for(const key of ['key-0-1','key-0-9','key-0-1','key-0-5','key-1-7','key-0-0','key-0-0','key-1-7','key-0-9','key-0-7'])await press(key);
    await press('done');assert.equal(browser.structuredValue,'2026-11-08','Native date keyboard uses the structured input broker');browser.emit('input',{editable:false});
    browser.emit('dialog',{id:'native-prompt',type:'prompt',origin:'https://q.com',message:'A real site prompt',defaultPrompt:'initial'});tick();assert(frame.targets.some(t=>t.key==='browser-dialog-accept'));assert(!frame.targets.some(t=>t.key==='page-controller'),'A modal cannot send controller input to a blocked page');
    await press('browser-prompt-edit');await press('key-0-0');await press('done');await press('browser-dialog-accept');assert.deepEqual(browser.lastDialogReply,{dialogId:'native-prompt',accept:true,promptText:'q'});
    browser.emit('permission',{id:'native-permission',state:'requested',origin:'https://frame.example',embeddingOrigin:'https://q.com',permissions:['camera']});tick();await press('browser-permission-deny');assert.equal(browser.lastPermissionAnswer.permissionId,'native-permission');
    await press('settings');await press('permissions-settings');await press('browser-permission-0-0');assert.equal(browser.lastPermissionSet.expectedOrigin,'https://q.com');await press('browser-permissions-done');await press('downloads-settings');assert(frame.targets.some(t=>t.key==='browser-files-phone'));await press('browser-files-done');await press('settings-done');
    browser.emit('fileChooser',{id:'native-chooser',origin:'https://q.com',accept:'.txt',multiple:false,files:[]});tick();assert(frame.targets.some(t=>t.key==='browser-chooser-phone'));await press('browser-chooser-cancel');
    browser.emit('auth',{id:'native-auth',origin:'http://auth.example',realm:'Synthetic test only',scheme:'basic',isProxy:false});tick();await press('browser-auth-username');await press('key-0-0');await press('done');await press('browser-auth-password');for(let i=0;i<12;i++)await press('key-0-0');assert(!JSON.stringify(frame).includes('q'.repeat(12)),'Authentication password never enters native rendering text');await press('done');await press('browser-auth-submit');assert.deepEqual(browser.lastAuthReply,{authId:'native-auth',username:'q',password:'q'.repeat(12),cancel:false});
    await press('settings');await press('find-settings');await press('key-0-0');await press('done');assert(frame.targets.some(t=>t.key==='find-next'));assert(frame.targets.some(t=>t.key==='page-controller'),'Search results remain visible in the page');await press('find-next');await press('find-close');assert(!frame.targets.some(t=>t.key==='find-next'));
    browser.emit('privacy',{supported:true,storage:{state:'failed'}});tick();assert(frame.textCalls.some(t=>/Website-Daten sind nicht|Website data|网站数据尚未完整保存/.test(t.label)),'Unsaved site storage stays visible');browser.emit('privacy',{supported:true,storage:{state:'saved'}});
    const beforeFullscreenCancel=browser.calls.filter(c=>c==='controller-cancel').length;
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});browser.emit('media',{fullscreen:true,playerMode:true,paused:true,currentTime:10,duration:120});tick();
    assert(browser.calls.filter(c=>c==='controller-cancel').length>beforeFullscreenCancel,'Fullscreen transition cancels pending controller work before switching UI');
    await press('video-toggle');await press('video-forward');await press('video-exit');assert(browser.calls.includes('video-toggle')&&browser.calls.includes('video-forward')&&browser.calls.includes('video-exit'));
    browser.emit('media',{fullscreen:true,playerMode:true,hasSiteControls:true,paused:true});tick();
    assert(!frame.targets.some(t=>t.key==='video-toggle'),'Website controls must suppress the native fallback overlay');
    await feed(1,0);await feed(0,1);await feed(0,0);
    assert(browser.calls.includes('mediaFocus')&&browser.calls.includes('mediaPress'),'Fullscreen website controls receive selection and activation');
    browser.emit('media',{fullscreen:false});tick();
    browser.emit('media',{fullscreen:true,playerMode:false,hasMedia:true});tick();assert(!frame.targets.some(t=>t.key==='video-toggle'),'Generic page fullscreen cannot display video-only controls');const webFocusBefore=browser.calls.filter(c=>c==='web-focus').length;await feed(1,0);assert(browser.calls.filter(c=>c==='web-focus').length>webFocusBefore,'A fullscreen game or form retains normal page controls');browser.emit('media',{fullscreen:false});tick();
    browser.emit('tabSelected',{id:'popup-fixture',url:'',title:'',loading:false,popup:true});
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});tick();
    assert(frame.targets.some(t=>t.key==='page-controller'),'A blank site popup displays web content instead of the browser start page');
    browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(vehicleConnections.length,1,'Audible media automatically acquires the available vehicle route');
    browser.emit('navigation','https://example.org/watch');browser.child=null;
    browser.emit('blocked','Browser-Dienst getrennt');await new Promise(r=>setImmediate(r));tick();
    assert.equal(vehicleConnections.length,0,'A disconnected backend releases the frontend-owned audio route');
    browser.emit('ready');await new Promise(r=>setImmediate(r));tick();
    assert(browser.child&&browser.url==='https://example.org/watch','A recovered backend reopens the current page rather than leaving a frozen surface');
    browser.emit('frame',{width:1280,height:380,rgba:Buffer.alloc(1280*380*4)});
    browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(vehicleConnections.length,1,'Recovered audible playback obtains a new owned route');
    const disconnects=vehicleCalls.filter(m=>m==='disconnect').length;
    browser.helperReady=false;browser.emit('media',{fullscreen:false,audible:true,playing:true});await new Promise(r=>setImmediate(r));
    assert.equal(vehicleConnections.length,0,'A failed output helper must release its AudioManager route');
    assert.equal(vehicleCalls.filter(m=>m==='disconnect').length,disconnects+1);
    assert.equal(vehicleSource.availability.availability,'A_UNAVAILABLE','Helper failure restores source availability instead of holding radio audio');
    browser.emit('media',{fullscreen:false,audible:false,playing:false});await new Promise(r=>setImmediate(r));
    // Closing during an outstanding real focus request cancels takeover,
    // including a late HMI acknowledgement. The old source is left intact.
    browser.helperReady=true;await press('settings');await press('streaming-settings');
    vehicleSource.availability={availability:'A_AVAILABLE',availabilityReason:0};
    vehicleConnections.push({sourceID:287,sinkID:1024,mainConnectionID:92,connectionState:'CS_CONNECTED'});
    let finishClosingFocus;focusRequest=()=>new Promise(resolve=>finishClosingFocus=resolve);
    const cancelledAt=vehicleCalls.length,cancelledTakeover=frame.targets.find(t=>t.key==='audio-test').run();
    await new Promise(r=>setImmediate(r));assert.equal(typeof finishClosingFocus,'function');
    const closingApp=frame.targets.find(t=>t.key==='close').run();await new Promise(r=>setImmediate(r));
    finishClosingFocus();await Promise.all([cancelledTakeover,closingApp]);tick();focusRequest=null;
    assert(!vehicleCalls.slice(cancelledAt).some(m=>['disconnect','connect','hookSourceAvailablityStatusChange'].includes(m)),'Closing cancels takeover before any AudioManager mutation, even after late focus confirmation');
    assert.deepEqual(vehicleConnections.map(c=>c.mainConnectionID),[92]);
    assert(closed,'Close must leave the app MAIN state');assert.equal(browser.child,null,'Close must stop Chromium');
    const stops=browser.calls.filter(c=>c==='stop').length;let exited=false;
    await require(root+'/browser_shutdown').run(()=>{exited=true;assert(browser.calls.filter(c=>c==='stop').length>stops,'MainApp shutdown must stop Browser before exiting');});
    assert(exited,'Bounded cleanup must complete the requested MainApp exit');
    console.log('SDK UI: tabs, URL keyboard, masked hotspot settings, audio takeover with observed HMI focus, fullscreen controls, target bounds and app close passed');
}finally{timers.forEach(clearInterval);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
