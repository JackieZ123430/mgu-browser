'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),EventEmitter=require('events');
const CdpPipe=require('./cdp_pipe'),PNG=require('./png_frame'),URLPolicy=require('./url_policy');
const Metadata=require('./browser_metadata');
const Identity=require('./browser_identity');
const Audio=require('./browser_audio'),DRM=require('./browser_drm');
const VehicleAudioBridge=require('./browser_audio_bridge');
const InputEvents=require('./input_events');
let JPEG=null;try{JPEG=require('./jpeg_frame.node');}catch(e){}
const monotonic=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};

class BrowserSession extends EventEmitter {
    constructor(options) {
        super();this.options=options;this.gate=options.gate;this.child=null;this.pipe=null;
        this.audio=Audio.output(Object.assign({},process.env,options.env||{}));this.webAudioContexts=new Map();this.drm=DRM.status();
        this.vehicleAudio=options.vehicleAudio?new VehicleAudioBridge(options.vehicleAudio):null;
        this.session=null;this.epoch=0;this.lastFrame=0;this.lastDecodeStart=0;this.decoding=false;this.profile=null;
        // 30 fps ceiling. The frontend only receives changed rows, so this costs
        // little on static pages and keeps scrolling and video fluid.
        this.frameInterval=options.frameInterval||33;
        this.performance={codec:JPEG?'jpeg-native':'png-js',frames:0,dropped:0,decodeMs:0,encodedBytes:0};
        this.closing=Promise.resolve();
        this.viewport=options.viewport||{width:960,height:540};
        this.locale=options.locale||'en-GB';
        this.tabs=[];this.tabNext=0;this.pageGeneration=0;this.tabQueue=Promise.resolve();
        this.mediaWatch=setInterval(()=>{if(this.child)this.inspectMedia();},1000);
        if(!this.gate||typeof this.gate.check!=='function')throw new Error('Vordergrundstatus fehlt');
        this.watch=setInterval(()=>{if(this.child&&!this.gate.check().allowed)this.stop('Browser nicht im Vordergrund');},100);
        this.gate.onBlock=reason=>this.stop(reason);
    }
    requireAllowed() { const state=this.gate.check();if(!state.allowed)throw new Error(state.reason||'Browser nicht freigegeben'); }
    async start(url,launchOptions) {
        this.requireAllowed();
        if(url&&!URLPolicy.allowed(url))throw new Error('HTTP- oder HTTPS-Adresse erforderlich');
        await this.closing;await this.storageChange;this.requireAllowed();if(this.shutdownFault)throw this.shutdownFault;
        if(this.child)return this.navigate(url);
        if(process.platform!=='linux'||process.getuid()===0)throw new Error('Browser benötigt einen unprivilegierten Linux-Benutzer');
        const epoch=++this.epoch;
        try{fs.mkdirSync(this.options.profileRoot,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
        const profileStat=fs.lstatSync(this.options.profileRoot);
        if(!profileStat.isDirectory()||profileStat.isSymbolicLink()||profileStat.uid!==process.getuid())throw new Error('Profilordner gehört nicht dem Browser-Benutzer');
        if(this.recoveryProfile&&this.options.profileStore&&!this.options.profileStore.prefs.rememberSessions)this.discardRetainedProfile();
        const retained=this.recoveryProfile,profile=this.profile=retained||fs.mkdtempSync(path.join(this.options.profileRoot,'session-'));this.recoveryProfile=null;
        try{if(this.options.profileStore&&!retained)await this.options.profileStore.restore(profile,()=>epoch===this.epoch&&this.profile===profile&&this.gate.check().allowed);this.requireAllowed();if(epoch!==this.epoch||this.profile!==profile)throw new Error('Browserstart abgebrochen');}catch(e){if(retained)this.recoveryProfile=profile;else removeProfile(profile,this.options.profileRoot);if(this.profile===profile)this.profile=null;throw e;}
        try{this.drm=DRM.prepare(profile,this.options);}catch(e){if(retained)this.recoveryProfile=profile;else removeProfile(profile,this.options.profileRoot);if(this.profile===profile)this.profile=null;throw e;}
        this.webAudioContexts.clear();
        let vehicleOutput=null;
        if(this.vehicleAudio&&!this.options.mediaDisabled){try{vehicleOutput=await this.vehicleAudio.start(profile);}catch(e){if(this.vehicleAudio.error==='audio-helper-starting')this.vehicleAudio.fail('audio-helper-unavailable');this.emit('diagnostic','Vehicle audio helper unavailable');}}
        if(epoch!==this.epoch||this.profile!==profile||!this.gate.check().allowed){if(this.vehicleAudio)await this.vehicleAudio.stop();if(retained)this.recoveryProfile=profile;else removeProfile(profile,this.options.profileRoot);throw new Error('Browserstart abgebrochen');}
        // Run the ordinary Chromium browser on its built-in offscreen display.
        // Keep the existing software WebGL capability without requiring an X
        // server, GPU device access, or a different engine package.
        const args=['--ozone-platform=headless','--ozone-override-screen-size='+this.viewport.width+','+this.viewport.height,
            '--disable-gpu','--use-gl=angle','--use-angle=swiftshader',
            '--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--lang='+this.locale,'--accept-lang='+Identity.languages(this.locale).join(','),
            '--disable-sync','--disable-background-networking','--disable-extensions','--disable-component-update',
            '--disable-breakpad','--disable-dev-shm-usage','--disk-cache-size=67108864','--media-cache-size=16777216',
            // Fixed cookie encryption key store: there is no desktop keyring on
            // the MGU. Without this Chromium may pick a different backend per
            // start and refuse to read the restored cookie database.
            '--password-store=basic','--use-mock-keychain',
            // Discrete wheel steps: smooth scrolling produced dozens of
            // intermediate frames per gesture that the screencast cannot keep up with.
            '--disable-smooth-scrolling',
            '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,InterestFeedContentSuggestions',
            '--window-size='+this.viewport.width+','+this.viewport.height,'--user-data-dir='+this.profile,'about:blank'];
        if(this.options.mediaDisabled)args.push('--disable-blink-features=WebCodecs');
        if(this.options.mediaDisabled||this.vehicleAudio&&!vehicleOutput)args.push('--mute-audio');
        this.audio.reset();args.push.apply(args,vehicleOutput?vehicleOutput.args:this.audio.args);
        if(this.options.profileStore&&this.options.profileStore.prefs.rememberSessions)args.push('--restore-last-session');
        // Browser/renderer sandbox stays enabled. No --no-sandbox, root browser,
        // insecure TLS flag, public debugging port or remote rendering backend.
        const child=cp.spawn(this.options.binary,args,{stdio:['ignore','ignore','pipe','pipe','pipe'],detached:true,env:Object.assign({},process.env,this.options.env||{},vehicleOutput?vehicleOutput.env:{})});
        this.child=child;this.stoppingTabs=false;this.restoringTabs=true;
        const pipe=this.pipe=new CdpPipe(child.stdio[3],child.stdio[4]);
        child.on('error',e=>{this.emit('fault',e);this.stop('Browser konnte nicht starten');});
        child.stderr.on('data',data=>{this.audio.observe(data.toString('utf8').slice(0,4000));this.emit('diagnostic',data.toString('utf8').slice(0,1000));});
        child.once('exit',(code,signal)=>{if(this.child===child){this.stop('Browser beendet ('+(signal||code)+')');}});
        pipe.on('closed',()=>{if(this.pipe===pipe)this.stop('Browser-Verbindung beendet');});
        pipe.on('event',event=>{if(epoch===this.epoch)this.event(event);});
        try {
            const version=await pipe.send('Browser.getVersion');this.emit('version',version.product);
            const identity=Identity.create(version);this.userAgent=identity.userAgent;
            await this.initializeFiles(pipe);
            try{await this.restoreCookies(pipe);}catch(e){this.emit('diagnostic','Saved cookies could not be restored');}
            await pipe.send('Target.setDiscoverTargets',{discover:true});
            if(epoch!==this.epoch)throw new Error('Browserstart abgebrochen');
            const store=this.options.profileStore,saved=launchOptions&&launchOptions.restore===true&&store&&typeof store.loadTabs==='function'?await store.loadTabs():null;
            if(saved&&saved.tabs.length){const restored=[];for(const address of saved.tabs){const opened=await this._newTab('');restored.push(opened);const tab=this.tabs.find(t=>t.id===opened.id);if(address){try{await this.navigate(address);}catch(e){if(this.pipe!==pipe||this.epoch!==epoch)throw e;tab.loading=false;this.emit('diagnostic','Gespeicherter Tab konnte nicht geladen werden');}tab.requestedURL=address;}}await this._selectTab(restored[Math.min(saved.active,restored.length-1)].id);}
            else await this._newTab(url||'');
            this.restoringTabs=false;this.checkpointTabs();
            this.emit('started');this.scheduleCookieCheckpoint();
        } catch(e) {this.stop('Browserstart fehlgeschlagen');this.restoringTabs=false;throw e;}
    }
    send(method,params,timeoutMs) {
        if(!this.pipe||!this.session)return Promise.reject(new Error('Browser nicht verbunden'));
        return this.pipe.send(method,params,this.session,timeoutMs);
    }
    async navigate(url) {
        this.requireAllowed();if(!URLPolicy.allowed(url))throw new Error('HTTP- oder HTTPS-Adresse erforderlich');
        const tab=this.tabs.find(t=>t.session===this.session);if(tab)tab.requestedURL=url;
        this.clearAuth(this.session);
        return this.navigateWithAuth(url);
    }
    event(event) {
        this.findEvent(event);
        if(this.authEvent(event))return;
        if(this.permissionEvent(event))return;
        if(this.fileEvent(event))return;
        if(/^Target\.(targetCreated|targetInfoChanged|targetDestroyed|detachedFromTarget)$/.test(event.method)){this.targetEvent(event);return;}
        const tab=this.tabs.find(t=>t.session===event.sessionId);
        if(!tab){
            const owner=this.frameOwner&&this.frameOwner(event.sessionId);
            if(owner&&owner.mainSession!==event.sessionId){
                if(event.method.indexOf('WebAudio.')===0)this.webAudioEvent(event);
                if(event.method==='Runtime.executionContextsCleared'||event.method==='Page.frameNavigated'&&!event.params.frame.parentId)this.clearAccessibleMedia(event.sessionId);
            }
            // Embedded navigation must never replace the main tab's URL,
            // frame ID, viewport or selected page generation.
            return;
        }
        if(event.method==='Page.javascriptDialogOpening'||event.method==='Page.javascriptDialogClosed'){this.javascriptDialogEvent(event);return;}
        const active=event.sessionId===this.session;
        if(event.method==='Page.documentOpened'||event.method==='Page.frameNavigated'&&!event.params.frame.parentId&&event.params.frame.url!=='about:blank')tab.committed=true;
        if(event.method.indexOf('WebAudio.')===0){this.webAudioEvent(event);return;}
        if(event.method==='Runtime.executionContextsCleared'||event.method==='Page.frameNavigated'&&!event.params.frame.parentId)this.clearAccessibleMedia(event.sessionId);
        if(event.method==='Page.frameNavigated'&&!event.params.frame.parentId){this.clearDialogs(event.sessionId);if(active){this.pageGeneration++;this.focusedMediaControl=null;this.focusedMediaObject=null;this.lastMedia=null;this.emit('media',Object.assign({fullscreen:false},this.mediaActivityState||{}));}tab.mainFrame=event.params.frame.id;tab.url=URLPolicy.allowed(event.params.frame.url)?event.params.frame.url:'';this.emitTabs();}
        if(event.method==='Page.navigatedWithinDocument'&&event.params.frameId===tab.mainFrame){tab.url=URLPolicy.allowed(event.params.url)?event.params.url:'';this.emitTabs();}
        if(event.method==='Page.frameStartedLoading'&&event.params.frameId===tab.mainFrame){tab.loading=true;this.emitTabs();}
        if(event.method==='Page.loadEventFired'){tab.loading=false;this.updateTab(tab);}
        if(active&&(event.method==='Page.frameNavigated'&&!event.params.frame.parentId||event.method==='Page.loadEventFired'))require('./browser_viewport').scheduleReapply.call(this,event.method==='Page.loadEventFired');
        if(!active&&event.method!=='Fetch.requestPaused')return;
        if(event.method==='Page.frameStartedLoading'&&event.params.frameId===this.mainFrame)this.emit('loading',true);
        if(event.method==='Page.loadEventFired'||(event.method==='Page.frameStoppedLoading'&&event.params.frameId===this.mainFrame)){this.emit('loading',false);this.scheduleNavigation();}
        if(event.method==='Page.frameNavigated'||event.method==='Page.navigatedWithinDocument')this.scheduleNavigation();
        if(event.method==='Page.frameNavigated'&&!event.params.frame.parentId&&URLPolicy.allowed(event.params.frame.url))this.emit('navigation',event.params.frame.url);
        if(event.method==='Page.navigatedWithinDocument'&&event.params.frameId===this.mainFrame&&URLPolicy.allowed(event.params.url))this.emit('navigation',event.params.url);
        if(event.method==='Page.frameNavigated'&&!event.params.frame.parentId)this.mainFrame=event.params.frame.id;
        if(event.method==='Runtime.exceptionThrown')this.emit('diagnostic','[page] JavaScript exception (content omitted)');
        if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')this.emit('diagnostic','[page] Browser error (content omitted)');
        if(event.method==='Network.loadingFailed')this.emit('diagnostic','[page-network] Request failed');
        if(event.method==='Inspector.targetCrashed'){this.emit('fault',new Error('Webseite abgestürzt. Browser erneut öffnen.'));this.stop('Webseite abgestürzt');return;}
        if(event.method==='Page.loadEventFired')this.scheduleCookieCheckpoint(3000);
        if(event.method==='Page.screencastFrame')this.screencastFrame(event);
    }
    // Latest-frame-wins pipeline. A frame is acknowledged when its decode
    // starts, so Chromium already encodes the next one meanwhile; frames that
    // arrive during a decode replace each other and only the newest is shown.
    screencastFrame(event){
        const params=event.params,pipe=this.pipe,sid=event.sessionId;
        const ack=()=>{if(pipe&&!pipe.closed)pipe.send('Page.screencastFrameAck',{sessionId:params.sessionId},sid).catch(()=>{});};
        if(this.pendingFrame){this.pendingFrame.ack();this.performance.dropped++;}
        this.pendingFrame={params,ack,epoch:this.epoch,view:this.pageGeneration};
        this.pumpFrames();
    }
    pumpFrames(){
        if(this.decoding||!this.pendingFrame||this.frameTimer)return;
        // Keep the newest compressed picture while the frontend socket is
        // congested. Decoding it now would allocate a full RGBA surface only
        // for the sender to discard it. Retry even for a static final frame;
        // Chromium need not produce another frame after the socket drains.
        if(this.options.frameReady&&!this.options.frameReady()){
            this.frameTimer=setTimeout(()=>{this.frameTimer=null;this.pumpFrames();},this.frameInterval);
            return;
        }
        const wait=this.frameInterval-(monotonic()-this.lastDecodeStart);
        if(wait>1){this.frameTimer=setTimeout(()=>{this.frameTimer=null;this.pumpFrames();},wait);return;}
        const p=this.pendingFrame;this.pendingFrame=null;p.ack();
        if(p.epoch!==this.epoch||p.view!==this.pageGeneration||!this.gate.check().allowed)return;
        this.decoding=true;this.lastDecodeStart=monotonic();
        const epoch=p.epoch,view=p.view,started=this.lastDecodeStart;
        Promise.resolve().then(()=>{const encoded=Buffer.from(p.params.data,'base64');this.performance.encodedBytes+=encoded.length;
            // The phone remote control shows this exact picture; no second encode.
            if(this.listenerCount('screencastJpeg'))this.emit('screencastJpeg',{data:encoded,type:JPEG?'image/jpeg':'image/png'});return JPEG?JPEG.decode(encoded):PNG.decode(encoded);}).then(frame=>{
            this.performance.frames++;this.performance.decodeMs+=monotonic()-started;
            if(this.performance.frames===1||this.performance.frames%60===0)this.emit('performance',this.performance);
            if(epoch===this.epoch&&view===this.pageGeneration&&this.gate.check().allowed){this.lastFrame=monotonic();this.emit('frame',frame);}
        }).catch(e=>{if(epoch===this.epoch)this.emit('fault',e);}).then(()=>{this.decoding=false;this.pumpFrames();});
    }
    tap(x,y,options) {
        return this.inputTask(async context=>{
            const p=InputEvents.point(x,y,this.viewport),o=InputEvents.mouse(options);
            await context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseMoved',button:'none',buttons:0,modifiers:o.modifiers},p));
            for(let click=1;click<=o.clickCount;click++){
                await context.send('Input.dispatchMouseEvent',Object.assign({type:'mousePressed',button:o.button,buttons:o.buttons,clickCount:click,modifiers:o.modifiers},p));
                await context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseReleased',button:o.button,buttons:0,clickCount:click,modifiers:o.modifiers},p));
            }
            this.inspectInput();
            // Consent banners and logins set cookies right after a tap.
            this.scheduleCookieCheckpoint(2500);
        });
    }
    hover(x,y,modifiers){return this.inputTask(context=>context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseMoved',modifiers:InputEvents.modifiers(modifiers)},InputEvents.point(x,y,this.viewport))));}
    drag(points,options){
        return this.inputTask(async context=>{
            if(!Array.isArray(points)||points.length<2||points.length>64)throw new Error('Ungueltiger Ziehpfad');
            const path=points.map(p=>{if(!p||typeof p!=='object')throw new Error('Ungueltiger Ziehpfad');return InputEvents.point(p.x,p.y,this.viewport);});
            const o=InputEvents.mouse(InputEvents.options(options,['button','modifiers'])),first=path[0],last=path[path.length-1],pipe=this.pipe,session=this.session;
            if(path.length===2)path.splice(1,0,{x:(first.x+last.x)/2,y:(first.y+last.y)/2});
            let pressed=false,intercept=false,data=null,signal;
            const intercepted=new Promise(resolve=>signal=resolve),onDrag=event=>{if(event.method==='Input.dragIntercepted'&&event.sessionId===session){data=event.params&&event.params.data;signal();}};
            pipe.on('event',onDrag);
            try{
                await context.send('Input.setInterceptDrags',{enabled:true});intercept=true;
                await context.send('Input.dispatchMouseEvent',Object.assign({type:'mousePressed',button:o.button,buttons:o.buttons,clickCount:1,modifiers:o.modifiers},first));pressed=true;
                for(let i=1;i<path.length;i++)await context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseMoved',button:o.button,buttons:o.buttons,modifiers:o.modifiers},path[i]));
                if(!data)await Promise.race([intercepted,new Promise(resolve=>setTimeout(resolve,20))]);
                if(data){
                    if(!Array.isArray(data.items)||data.items.length>64||Buffer.byteLength(JSON.stringify(data),'utf8')>1048576)throw new Error('Ziehinhalt ist zu gross');
                    for(const type of ['dragEnter','dragOver','drop'])await context.send('Input.dispatchDragEvent',{type,x:last.x,y:last.y,data,modifiers:o.modifiers});
                }
                await context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseReleased',button:o.button,buttons:0,clickCount:1,modifiers:o.modifiers},last));pressed=false;
            }finally{
                pipe.removeListener('event',onDrag);
                if(pressed)try{await context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseReleased',button:o.button,buttons:0,clickCount:1,modifiers:o.modifiers},last));}catch(ignore){}
                if(intercept){await pipe.send('Input.cancelDragging',{},session,1500).catch(()=>{});await pipe.send('Input.setInterceptDrags',{enabled:false},session,1500).catch(()=>{});}
            }
            this.inspectInput();
        });
    }
    text(value,options) {
        return this.inputTask(async context=>{
            const o=InputEvents.options(options,['replace']);if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>65536||o.replace!==undefined&&typeof o.replace!=='boolean')throw new Error('Texteingabe muss hoechstens 64 KiB UTF-8 enthalten');
            const inspected=await this.inspectFocusedInput(context,false);
            if(inspected&&['date','month','week','time','datetime-local'].indexOf(inspected.type)>=0)throw new Error('Fuer dieses Feld die Datums- oder Zeiteingabe verwenden');
            if(o.replace)await context.key('a',{ctrl:true});
            if(!value.length){if(o.replace)await context.key('Backspace');this.inspectInput();return;}
            // Keep native key events for short PIN/OTP widgets. Large pasted
            // text uses one trusted Chromium insertion, without silent truncation.
            if(Array.from(value).length>256){const current=await this.inspectFocusedInput(context,false);if(!inspected.editable||!current.editable||current.identity!==inspected.identity)throw new Error('Eingabefeld wurde gewechselt');await context.send('Input.insertText',{text:value});this.inspectInput();return;}
            for(const character of value){
                if(/^[\x20-\x7e]$/.test(character)){
                    const code=/^[a-z]$/i.test(character)?'Key'+character.toUpperCase():/^[0-9]$/.test(character)?'Digit'+character:undefined;
                    const data={key:character};if(code)data.code=code;
                    await context.send('Input.dispatchKeyEvent',Object.assign({type:'keyDown',text:character,unmodifiedText:character},data));
                    await context.send('Input.dispatchKeyEvent',Object.assign({type:'keyUp'},data));
                }else await context.send('Input.insertText',{text:character});
            }
            this.inspectInput();
        });
    }
    key(key,modifiers) {return this.inputTask(async context=>{const result=await context.key(key,modifiers);this.inspectInput();return result;});}
    scroll(delta,options){return this.inputTask(context=>{
        if(!Number.isFinite(delta))throw new Error('Ungueltiger Bildlauf');const o=InputEvents.options(options,['x','y','deltaX','modifiers']);
        const dx=o.deltaX===undefined?0:o.deltaX;if(!Number.isFinite(dx))throw new Error('Ungueltiger Bildlauf');
        const p=InputEvents.point(o.x===undefined?this.viewport.width/2:o.x,o.y===undefined?this.viewport.height/2:o.y,this.viewport);
        return context.send('Input.dispatchMouseEvent',Object.assign({type:'mouseWheel',deltaX:Math.max(-1000,Math.min(1000,dx)),deltaY:Math.max(-1000,Math.min(1000,delta)),modifiers:InputEvents.modifiers(o.modifiers)},p));
    });}
    async back() {
        return this.moveHistory(-1);
    }
    async forward(){
        return this.moveHistory(1);
    }
    async moveHistory(direction){
        this.requireAllowed();const h=await this.send('Page.getNavigationHistory');
        for(let i=h.currentIndex+direction;i>=0&&i<h.entries.length;i+=direction){
            if(URLPolicy.allowed(h.entries[i].url))return this.send('Page.navigateToHistoryEntry',{entryId:h.entries[i].id});
        }
    }
    async reload(){this.requireAllowed();return this.send('Page.reload',{ignoreCache:false});}
    async stopLoading(){this.requireAllowed();return this.send('Page.stopLoading');}
    resize(width,height,zoom){return require('./browser_viewport').resize.call(this,width,height,zoom);}
    scheduleNavigation(){
        clearTimeout(this.navigationTimer);const epoch=this.epoch,view=this.pageGeneration;
        this.navigationTimer=setTimeout(async()=>{
            try{const h=await this.send('Page.getNavigationHistory'),entry=h.entries[h.currentIndex];
                if(epoch===this.epoch&&view===this.pageGeneration&&entry){
                    const tab=this.tabs.find(t=>t.id===this.activeTab);if(tab){tab.title=Metadata.title(entry.title);tab.url=URLPolicy.allowed(entry.url)?entry.url:'';this.emitTabs();}
                    this.emit('navigationState',{url:URLPolicy.allowed(entry.url)?entry.url:'',title:Metadata.title(entry.title),canBack:h.entries.slice(0,h.currentIndex).some(e=>URLPolicy.allowed(e.url)),canForward:h.entries.slice(h.currentIndex+1).some(e=>URLPolicy.allowed(e.url))});
                }
            }catch(e){}
        },100);
    }
    inspectInput(){
        clearTimeout(this.inputTimer);const epoch=this.epoch,view=this.pageGeneration,frameView=this.inputFrameGeneration||0,pipe=this.pipe,session=this.session;
        this.inputTimer=setTimeout(async()=>{
            try{
                const check=()=>{this.requireAllowed();if(this.pipe!==pipe||this.session!==session||this.epoch!==epoch||this.pageGeneration!==view||(this.inputFrameGeneration||0)!==frameView)throw new Error('Webseite wurde gewechselt');};
                const context={check,session,send:async(method,params)=>{check();const result=await pipe.send(method,params,session,1500);check();return result;}};
                const info=await this.inspectFocusedInput(context,false),key=JSON.stringify(info);
                if(epoch===this.epoch&&view===this.pageGeneration&&key!==this.lastInput){this.lastInput=key;this.emit('input',info);}
            }catch(e){}
        },120);
    }
    async pageInfo(){
        return this.send('Runtime.evaluate',{expression:'JSON.stringify({ready:document.readyState,visible:document.visibilityState,scripts:document.scripts.length,resources:performance.getEntriesByType("resource").length})',returnByValue:true});
    }
    discardRetainedProfile(){if(this.shutdownFault)throw this.shutdownFault;if(this.recoveryProfile){removeProfile(this.recoveryProfile,this.options.profileRoot);this.recoveryProfile=null;}}
    stop(reason) {
        require('./browser_viewport').cancelReapply.call(this);
        this.resetFindState();
        this.clearAuth();
        clearTimeout(this.tabCheckpointTimer);const tabsClosing=this.child&&!this.restoringTabs?this.flushTabs().catch(()=>this.emit('diagnostic','Gespeicherte Tabs konnten nicht aktualisiert werden')):Promise.resolve();this.stoppingTabs=true;
        this.clearPermissions();
        this.stopFiles();
        this.clearDialogs();
        this.clearAccessibleMedia();
        const audioClosing=this.vehicleAudio?this.vehicleAudio.stop():Promise.resolve();
        this.webAudioContexts.clear();
        if(this.pendingPopups)this.pendingPopups.clear();
        this.tabs=[];this.activeTab=null;this.pageGeneration++;this.emitTabs();
        this.lastMedia=null;this.emit('media',{fullscreen:false,playing:false,audible:false,webAudioRunning:0});
        clearTimeout(this.navigationTimer);clearTimeout(this.inputTimer);clearTimeout(this.cookieTimer);this.cookieTimer=null;this.lastInput=null;
        clearTimeout(this.frameTimer);this.frameTimer=null;if(this.pendingFrame){this.pendingFrame.ack();this.pendingFrame=null;}
        const child=this.child,pipe=this.pipe,profile=this.profile;this.child=null;this.pipe=null;this.session=null;this.profile=null;this.epoch++;
        if(child) {
            // Clear the page immediately and ask Chromium to close normally.
            // Avoid an unconditional SIGKILL, which is unsuitable on this MGU.
            this.emit('blocked',reason||'Browser geschlossen');
            // Take a last cookie snapshot (bounded to 1.5 s) before asking
            // Chromium to close, then close the pipe.
            if(pipe)pipe.cancelPending(new Error(reason||'Browser geschlossen'));
            const finalSnapshot=pipe&&!pipe.closed?this.snapshotCookies(pipe,1500).catch(()=>{}):Promise.resolve();
            finalSnapshot.then(()=>{if(pipe&&!pipe.closed)pipe.send('Browser.close',{},null,2000).catch(()=>{});}).then(()=>{if(pipe)setTimeout(()=>pipe.close(new Error(reason||'Browser geschlossen')),2100);});
            let exited=child.exitCode!==null||child.signalCode!==null,forced=false,interrupted=false,cleaned=false,termTimer,killTimer,deadline;
            this.closing=new Promise(resolve=>{
                const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(termTimer);clearTimeout(killTimer);clearTimeout(deadline);setTimeout(async()=>{let retain=false,writers=false;const store=this.options.profileStore;try{await audioClosing;await tabsClosing;if(store){writers=!(await groupStopped(child.pid));if(writers){retain=true;if(store.storageStatus)store.storageStatus('failed','writers-active',0,false);throw new Error('Browser profile still has live writers');}if(!forced&&!interrupted&&child.exitCode===0&&!child.signalCode)await store.capture(profile);else if(typeof store.captureRecovery==='function')await store.captureRecovery(profile);else store.skipCapture=false;}}catch(e){retain=true;this.emit('diagnostic','Geschützte Sitzung konnte nicht gespeichert werden');}finally{if(retain)this.recoveryProfile=profile;else try{removeProfile(profile,this.options.profileRoot);}catch(e){this.emit('diagnostic','Profile cleanup failed');}this.shutdownFault=writers?new Error('Browser-Prozesse schreiben noch; Backend-Neustart erforderlich.'):null;if(store&&typeof store.status==='function')try{this.emit('privacy',await store.status());}catch(e){}resolve();}},500);};
                if(exited)cleanup();else child.once('close',()=>{exited=true;cleanup();});
                if(!exited)deadline=setTimeout(()=>{this.shutdownFault=new Error('Browser-Prozess nicht beendet. Backend-Neustart erforderlich.');this.emit('fault',this.shutdownFault);resolve();},11000);
            });
            const signal=name=>{if(!exited&&child.pid){interrupted=true;try{process.kill(-child.pid,name);}catch(e){try{child.kill(name);}catch(ignore){}}}};
            if(!exited){termTimer=setTimeout(()=>signal('SIGTERM'),4000);killTimer=setTimeout(()=>{if(!exited){forced=true;this.emit('diagnostic','Browser reagiert nicht; eigene Prozessgruppe wird beendet');signal('SIGKILL');}},7000);}
        }
        if(pipe&&!child)pipe.close(new Error(reason||'Browser geschlossen'));
        if(!child)this.closing=Promise.all([this.closing,audioClosing]).then(()=>{});
    }
    destroy() {clearInterval(this.watch);clearInterval(this.mediaWatch);this.stop('App geschlossen');}
}
Object.assign(BrowserSession.prototype,require('./browser_pages'));
Object.assign(BrowserSession.prototype,require('./browser_tab_state'));
Object.assign(BrowserSession.prototype,require('./browser_files'));
Object.assign(BrowserSession.prototype,require('./browser_dialogs'));
Object.assign(BrowserSession.prototype,require('./browser_permissions'));
Object.assign(BrowserSession.prototype,require('./browser_auth'));
Object.assign(BrowserSession.prototype,require('./browser_input'));
Object.assign(BrowserSession.prototype,require('./browser_find'));
Object.assign(BrowserSession.prototype,require('./browser_media'));
Object.assign(BrowserSession.prototype,Audio.methods);
Object.assign(BrowserSession.prototype,require('./browser_privacy'));
Object.assign(BrowserSession.prototype,require('./browser_cookies'));
Object.assign(BrowserSession.prototype,require('./browser_performance'));
// Node 8 has no recursive rm. Never follow links when clearing our temporary
// profile, and accept only the direct session directory we created ourselves.
function removeProfile(profile,root){
    if(!profile||path.dirname(profile)!==root||!/^session-/.test(path.basename(profile)))return;
    function remove(p){const stat=fs.lstatSync(p);if(stat.isDirectory()&&!stat.isSymbolicLink()){fs.readdirSync(p).forEach(n=>remove(path.join(p,n)));fs.rmdirSync(p);}else fs.unlinkSync(p);}
    try{remove(profile);}catch(e){if(e.code!=='ENOENT')throw e;}
}
// The detached supervisor may exit before its Chromium grandchildren. Never
// archive live SQLite/LevelDB writers, even following a crash or forced stop.
async function groupStopped(group){
    if(!Number.isInteger(group)||group<=1||process.platform!=='linux')return true;
    const live=()=>{const members=[];for(const name of fs.readdirSync('/proc')){if(!/^\d+$/.test(name))continue;try{const base='/proc/'+name,s=fs.statSync(base),data=fs.readFileSync(base+'/stat','utf8'),fields=data.slice(data.lastIndexOf(')')+2).split(' ');if(Number(fields[2])===group&&!/^[ZX]$/.test(fields[0]))members.push({pid:Number(name),uid:s.uid});}catch(e){if(!['ENOENT','ESRCH','EACCES'].includes(e.code))throw e;}}return members;};
    for(let i=0;i<20;i++){const members=live();if(!members.length)return true;if(members.some(p=>p.uid!==process.getuid()))return false;if(i===5)try{process.kill(-group,'SIGKILL');}catch(e){if(e.code!=='ESRCH')return false;}await new Promise(resolve=>setTimeout(resolve,100));}return live().length===0;
}
module.exports=BrowserSession;
