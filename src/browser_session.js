'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),EventEmitter=require('events');
const CdpPipe=require('./cdp_pipe'),PNG=require('./png_frame'),URLPolicy=require('./url_policy');
const Metadata=require('./browser_metadata');
const Audio=require('./browser_audio'),DRM=require('./browser_drm');
const VehicleAudioBridge=require('./browser_audio_bridge');
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
    async start(url) {
        this.requireAllowed();
        if(url&&!URLPolicy.allowed(url))throw new Error('HTTPS-Adresse erforderlich');
        await this.closing;await this.storageChange;this.requireAllowed();if(this.shutdownFault)throw this.shutdownFault;
        if(this.child)return this.navigate(url);
        if(process.platform!=='linux'||process.getuid()===0)throw new Error('Browser benötigt einen unprivilegierten Linux-Benutzer');
        const epoch=++this.epoch;
        try{fs.mkdirSync(this.options.profileRoot,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
        const profileStat=fs.lstatSync(this.options.profileRoot);
        if(!profileStat.isDirectory()||profileStat.isSymbolicLink()||profileStat.uid!==process.getuid())throw new Error('Profilordner gehört nicht dem Browser-Benutzer');
        const profile=this.profile=fs.mkdtempSync(path.join(this.options.profileRoot,'session-'));
        try{if(this.options.profileStore)await this.options.profileStore.restore(profile,()=>epoch===this.epoch&&this.profile===profile&&this.gate.check().allowed);this.requireAllowed();if(epoch!==this.epoch||this.profile!==profile)throw new Error('Browserstart abgebrochen');}catch(e){removeProfile(profile,this.options.profileRoot);if(this.profile===profile)this.profile=null;throw e;}
        try{this.drm=DRM.prepare(profile,this.options);}catch(e){removeProfile(profile,this.options.profileRoot);if(this.profile===profile)this.profile=null;throw e;}
        this.webAudioContexts.clear();
        let vehicleOutput=null;
        if(this.vehicleAudio&&!this.options.mediaDisabled){try{vehicleOutput=await this.vehicleAudio.start(profile);}catch(e){if(this.vehicleAudio.error==='audio-helper-starting')this.vehicleAudio.fail('audio-helper-unavailable');this.emit('diagnostic','Vehicle audio helper unavailable');}}
        if(epoch!==this.epoch||this.profile!==profile||!this.gate.check().allowed){if(this.vehicleAudio)await this.vehicleAudio.stop();removeProfile(profile,this.options.profileRoot);throw new Error('Browserstart abgebrochen');}
        const args=['--headless','--disable-gpu','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--lang='+this.locale,
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
            '--renderer-process-limit=4',
            '--window-size='+this.viewport.width+','+this.viewport.height,'--user-data-dir='+this.profile,'about:blank'];
        if(this.options.mediaDisabled)args.push('--disable-blink-features=WebCodecs');
        if(this.options.mediaDisabled||this.vehicleAudio&&!vehicleOutput)args.push('--mute-audio');
        this.audio.reset();args.push.apply(args,vehicleOutput?vehicleOutput.args:this.audio.args);
        if(this.options.profileStore&&this.options.profileStore.prefs.rememberSessions)args.push('--restore-last-session');
        // Browser/renderer sandbox stays enabled. No --no-sandbox, root browser,
        // insecure TLS flag, public debugging port or remote rendering backend.
        const child=cp.spawn(this.options.binary,args,{stdio:['ignore','ignore','pipe','pipe','pipe'],detached:true,env:Object.assign({},process.env,this.options.env||{},vehicleOutput?vehicleOutput.env:{})});
        this.child=child;
        const pipe=this.pipe=new CdpPipe(child.stdio[3],child.stdio[4]);
        child.on('error',e=>{this.emit('fault',e);this.stop('Browser konnte nicht starten');});
        child.stderr.on('data',data=>{this.audio.observe(data.toString('utf8').slice(0,4000));this.emit('diagnostic',data.toString('utf8').slice(0,1000));});
        child.once('exit',(code,signal)=>{if(this.child===child){this.stop('Browser beendet ('+(signal||code)+')');}});
        pipe.on('closed',()=>{if(this.pipe===pipe)this.stop('Browser-Verbindung beendet');});
        pipe.on('event',event=>{if(epoch===this.epoch)this.event(event);});
        try {
            const version=await pipe.send('Browser.getVersion');this.emit('version',version.product);
            this.userAgent=version.userAgent;
            await pipe.send('Browser.setDownloadBehavior',{behavior:'deny'});
            try{await this.restoreCookies(pipe);}catch(e){this.emit('diagnostic','Saved cookies could not be restored');}
            await pipe.send('Target.setDiscoverTargets',{discover:true});
            if(epoch!==this.epoch)throw new Error('Browserstart abgebrochen');
            await this._newTab(url||'');
            this.emit('started');this.scheduleCookieCheckpoint();
        } catch(e) {this.stop('Browserstart fehlgeschlagen');throw e;}
    }
    send(method,params,timeoutMs) {
        if(!this.pipe||!this.session)return Promise.reject(new Error('Browser nicht verbunden'));
        return this.pipe.send(method,params,this.session,timeoutMs);
    }
    async navigate(url) {
        this.requireAllowed();if(!URLPolicy.allowed(url))throw new Error('HTTPS-Adresse erforderlich');
        const result=await this.send('Page.navigate',{url});if(result.errorText)throw new Error(result.errorText);return result;
    }
    event(event) {
        if(/^Target\.(targetCreated|targetInfoChanged|targetDestroyed)$/.test(event.method)){this.targetEvent(event);return;}
        const tab=this.tabs.find(t=>t.session===event.sessionId);
        if(!tab)return;
        const active=event.sessionId===this.session;
        if(event.method.indexOf('WebAudio.')===0){this.webAudioEvent(event);return;}
        if(event.method==='Page.frameNavigated'&&!event.params.frame.parentId){if(active){this.pageGeneration++;this.focusedMediaControl=null;this.focusedMediaObject=null;this.lastMedia=null;this.emit('media',Object.assign({fullscreen:false},this.mediaActivityState||{}));}tab.mainFrame=event.params.frame.id;tab.url=URLPolicy.allowed(event.params.frame.url)?event.params.frame.url:'';this.emitTabs();}
        if(event.method==='Page.navigatedWithinDocument'&&event.params.frameId===tab.mainFrame){tab.url=URLPolicy.allowed(event.params.url)?event.params.url:'';this.emitTabs();}
        if(event.method==='Page.frameStartedLoading'&&event.params.frameId===tab.mainFrame){tab.loading=true;this.emitTabs();}
        if(event.method==='Page.loadEventFired'){tab.loading=false;this.updateTab(tab);}
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
        if(event.method==='Fetch.requestPaused'&&this.options.mediaDisabled){
            const p=event.params;
            const send=(method,params)=>this.pipe.send(method,params,event.sessionId);
            if(p.resourceType==='Media')send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
            else if(p.responseStatusCode){
                const headers=(p.responseHeaders||[]).concat([{name:'Content-Security-Policy',value:"media-src 'none'; object-src 'none'"}]);
                send('Fetch.continueResponse',{requestId:p.requestId,responseCode:p.responseStatusCode,responseHeaders:headers}).catch(e=>{this.emit('fault',e);this.stop('Medien-Sperre konnte nicht gesetzt werden');});
            }else send('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});
            return;
        }
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
    tap(x,y) {
        return this.inputTask(async context=>{
            if(!Number.isFinite(x)||!Number.isFinite(y))return;
            x=Math.max(0,Math.min(this.viewport.width-1,x));y=Math.max(0,Math.min(this.viewport.height-1,y));
            await context.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
            await context.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});this.inspectInput();
            // Consent banners and logins set cookies right after a tap.
            this.scheduleCookieCheckpoint(2500);
        });
    }
    text(value) {
        return this.inputTask(async context=>{
            // Key-driven PIN fields need keydown; Unicode uses composition.
            for(const character of String(value).slice(0,1000)){
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
    key(key,shift) {return this.inputTask(async context=>{const result=await context.key(key,shift);this.inspectInput();return result;});}
    async scroll(delta) {this.requireAllowed();return this.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:this.viewport.width/2,y:this.viewport.height/2,deltaX:0,deltaY:Math.max(-1000,Math.min(1000,delta))});}
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
    async resize(width,height){
        this.requireAllowed();if(!Number.isInteger(width)||!Number.isInteger(height)||width<640||width>1280||height<200||height>720)throw new Error('Ungueltige Browsergroesse');
        this.viewport={width,height};return this.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    }
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
        clearTimeout(this.inputTimer);const epoch=this.epoch,view=this.pageGeneration;
        this.inputTimer=setTimeout(async()=>{
            try{const r=await this.send('Runtime.evaluate',{expression:'JSON.stringify('+this.inputExpression+')',returnByValue:true});
                const info=JSON.parse(r.result.value),key=JSON.stringify(info);
                if(epoch===this.epoch&&view===this.pageGeneration&&key!==this.lastInput){this.lastInput=key;this.emit('input',info);}
            }catch(e){}
        },120);
    }
    async pageInfo(){
        return this.send('Runtime.evaluate',{expression:'JSON.stringify({ready:document.readyState,visible:document.visibilityState,scripts:document.scripts.length,resources:performance.getEntriesByType("resource").length})',returnByValue:true});
    }
    stop(reason) {
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
                const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(termTimer);clearTimeout(killTimer);clearTimeout(deadline);setTimeout(async()=>{try{await audioClosing;if(this.options.profileStore&&!forced&&!interrupted&&child.exitCode===0&&!child.signalCode)await this.options.profileStore.capture(profile);else if(this.options.profileStore)this.options.profileStore.skipCapture=false;}catch(e){this.emit('diagnostic','Geschützte Sitzung konnte nicht gespeichert werden');}finally{try{removeProfile(profile,this.options.profileRoot);}catch(e){this.emit('diagnostic','Profile cleanup failed');}this.shutdownFault=null;resolve();}},500);};
                if(exited)cleanup();else child.once('close',()=>{exited=true;cleanup();});
                if(!exited)deadline=setTimeout(()=>{this.shutdownFault=new Error('Browser-Prozess nicht beendet. Backend-Neustart erforderlich.');this.emit('fault',this.shutdownFault);resolve();},11000);
            });
            const signal=name=>{if(!exited&&child.pid){interrupted=true;try{process.kill(-child.pid,name);}catch(e){try{child.kill(name);}catch(ignore){}}}};
            if(!exited){termTimer=setTimeout(()=>signal('SIGTERM'),4000);killTimer=setTimeout(()=>{if(!exited){forced=true;this.emit('diagnostic','Browser reagiert nicht; eigene Prozessgruppe wird beendet');signal('SIGKILL');}},7000);}
        }
        if(pipe&&!child)pipe.close(new Error(reason||'Browser geschlossen'));
        if(!child)this.closing=audioClosing;
    }
    destroy() {clearInterval(this.watch);clearInterval(this.mediaWatch);this.stop('App geschlossen');}
}
Object.assign(BrowserSession.prototype,require('./browser_pages'));
Object.assign(BrowserSession.prototype,require('./browser_input'));
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
module.exports=BrowserSession;
