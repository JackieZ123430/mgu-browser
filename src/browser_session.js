'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),EventEmitter=require('events');
const CdpPipe=require('./cdp_pipe'),PNG=require('./png_frame'),URLPolicy=require('./url_policy');
let JPEG=null;try{JPEG=require('./jpeg_frame.node');}catch(e){}
const monotonic=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};

class BrowserSession extends EventEmitter {
    constructor(options) {
        super();this.options=options;this.gate=options.gate;this.child=null;this.pipe=null;
        this.session=null;this.epoch=0;this.lastFrame=0;this.decoding=false;this.profile=null;
        this.performance={codec:JPEG?'jpeg-native':'png-js',frames:0,decodeMs:0,encodedBytes:0};
        this.closing=Promise.resolve();
        this.viewport=options.viewport||{width:960,height:540};
        this.locale=options.locale||'en-GB';
        this.tabs=[];this.tabNext=0;this.pageGeneration=0;this.tabQueue=Promise.resolve();
        this.mediaWatch=setInterval(()=>{if(this.child)this.inspectMedia();},500);
        if(!this.gate||typeof this.gate.check!=='function')throw new Error('Vordergrundstatus fehlt');
        this.watch=setInterval(()=>{if(this.child&&!this.gate.check().allowed)this.stop('Browser nicht im Vordergrund');},100);
        this.gate.onBlock=reason=>this.stop(reason);
    }
    requireAllowed() { const state=this.gate.check();if(!state.allowed)throw new Error(state.reason||'Browser nicht freigegeben'); }
    async start(url) {
        this.requireAllowed();
        if(url&&!URLPolicy.allowed(url))throw new Error('HTTPS-Adresse erforderlich');
        await this.closing;this.requireAllowed();
        if(this.child)return this.navigate(url);
        if(process.platform!=='linux'||process.getuid()===0)throw new Error('Browser benötigt einen unprivilegierten Linux-Benutzer');
        const epoch=++this.epoch;
        try{fs.mkdirSync(this.options.profileRoot,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
        const profileStat=fs.lstatSync(this.options.profileRoot);
        if(!profileStat.isDirectory()||profileStat.isSymbolicLink()||profileStat.uid!==process.getuid())throw new Error('Profilordner gehört nicht dem Browser-Benutzer');
        const profile=this.profile=fs.mkdtempSync(path.join(this.options.profileRoot,'session-'));
        try{if(this.options.profileStore)await this.options.profileStore.restore(profile);this.requireAllowed();if(epoch!==this.epoch||this.profile!==profile)throw new Error('Browserstart abgebrochen');}catch(e){removeProfile(profile,this.options.profileRoot);if(this.profile===profile)this.profile=null;throw e;}
        const args=['--headless','--disable-gpu','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--lang='+this.locale,
            '--disable-sync','--disable-background-networking','--disable-extensions','--disable-component-update',
            '--disable-breakpad','--disable-dev-shm-usage','--disk-cache-size=16777216','--media-cache-size=8388608',
            '--window-size='+this.viewport.width+','+this.viewport.height,'--user-data-dir='+this.profile,'about:blank'];
        if(this.options.mediaDisabled)args.push('--disable-blink-features=WebCodecs');
        if(this.options.profileStore&&this.options.profileStore.prefs.rememberSessions)args.push('--restore-last-session');
        // Browser/renderer sandbox stays enabled. No --no-sandbox, root browser,
        // insecure TLS flag, public debugging port or remote rendering backend.
        const child=cp.spawn(this.options.binary,args,{stdio:['ignore','ignore','pipe','pipe','pipe'],detached:true,env:Object.assign({},process.env,this.options.env||{})});
        this.child=child;
        const pipe=this.pipe=new CdpPipe(child.stdio[3],child.stdio[4]);
        child.on('error',e=>{this.emit('fault',e);this.stop('Browser konnte nicht starten');});
        child.stderr.on('data',data=>this.emit('diagnostic',data.toString('utf8').slice(0,1000)));
        child.once('exit',(code,signal)=>{if(this.child===child){this.stop('Browser beendet ('+(signal||code)+')');}});
        pipe.on('closed',()=>{if(this.pipe===pipe)this.stop('Browser-Verbindung beendet');});
        pipe.on('event',event=>{if(epoch===this.epoch)this.event(event);});
        try {
            const version=await pipe.send('Browser.getVersion');this.emit('version',version.product);
            this.userAgent=version.userAgent;
            await pipe.send('Browser.setDownloadBehavior',{behavior:'deny'});
            if(epoch!==this.epoch)throw new Error('Browserstart abgebrochen');
            await this._newTab(url||'');
            this.emit('started');
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
        const tab=this.tabs.find(t=>t.session===event.sessionId);
        if(!tab)return;
        const active=event.sessionId===this.session;
        if(event.method==='Page.frameNavigated'&&!event.params.frame.parentId){tab.mainFrame=event.params.frame.id;tab.url=URLPolicy.allowed(event.params.frame.url)?event.params.frame.url:'';this.emitTabs();}
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
        if(event.method==='Runtime.exceptionThrown')this.emit('diagnostic','[page] '+JSON.stringify(event.params.exceptionDetails).slice(0,1400));
        if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')this.emit('diagnostic','[page] '+event.params.entry.text.slice(0,1400));
        if(event.method==='Network.loadingFailed')this.emit('diagnostic','[page-network] '+event.params.errorText+' '+event.params.type);
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
        if(event.method==='Page.screencastFrame') {
            const epoch=this.epoch,view=this.pageGeneration,pipe=this.pipe,sid=this.session,params=event.params;
            const ack=()=>pipe.send('Page.screencastFrameAck',{sessionId:params.sessionId},sid).catch(()=>{});
            const work=()=>{
                if(epoch!==this.epoch||view!==this.pageGeneration||this.decoding||!this.gate.check().allowed){ack();return;}
                this.decoding=true;
                const started=monotonic(),encoded=Buffer.from(params.data,'base64');
                Promise.resolve().then(()=>JPEG?JPEG.decode(encoded):PNG.decode(encoded)).then(frame=>{
                    this.performance.frames++;this.performance.decodeMs+=monotonic()-started;this.performance.encodedBytes+=encoded.length;
                    if(this.performance.frames===1||this.performance.frames%30===0)this.emit('performance',this.performance);
                    if(epoch===this.epoch&&view===this.pageGeneration&&this.gate.check().allowed){this.lastFrame=monotonic();this.emit('frame',frame);}
                }).catch(e=>{if(epoch===this.epoch)this.emit('fault',e);}).then(()=>{this.decoding=false;ack();});
            };
            const wait=70-(monotonic()-this.lastFrame);
            if(wait>0){
                if(this.pendingFrame)this.pendingFrame.ack();
                this.pendingFrame={work,ack};
                if(!this.frameTimer)this.frameTimer=setTimeout(()=>{this.frameTimer=null;const p=this.pendingFrame;this.pendingFrame=null;if(p)p.work();},wait);
            }else work();
        }
    }
    async tap(x,y) {
        this.requireAllowed();if(!Number.isFinite(x)||!Number.isFinite(y))return;
        x=Math.max(0,Math.min(this.viewport.width-1,x));y=Math.max(0,Math.min(this.viewport.height-1,y));
        await this.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
        await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});this.inspectInput();
    }
    async text(value) {
        this.requireAllowed();
        // Custom PIN/key-driven fields need keydown, while composition text
        // still needs insertText. Do not insert twice when a field handles
        // keydown and prevents its default text insertion.
        for(const character of String(value).slice(0,1000)){
            this.requireAllowed();
            if(/^[\x20-\x7e]$/.test(character)){
                const code=/^[a-z]$/i.test(character)?'Key'+character.toUpperCase():/^[0-9]$/.test(character)?'Digit'+character:undefined;
                const data={key:character};if(code)data.code=code;
                await this.send('Input.dispatchKeyEvent',Object.assign({type:'keyDown',text:character,unmodifiedText:character},data));
                await this.send('Input.dispatchKeyEvent',Object.assign({type:'keyUp'},data));
            }else await this.send('Input.insertText',{text:character});
        }
        this.inspectInput();
    }
    async key(key,shift) {
        this.requireAllowed();const codes={Tab:9,Enter:13,Backspace:8,Escape:27,ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39};
        const data={key,modifiers:shift?8:0};if(codes[key])data.windowsVirtualKeyCode=codes[key];
        await this.send('Input.dispatchKeyEvent',Object.assign({type:'keyDown'},data));
        const result=await this.send('Input.dispatchKeyEvent',Object.assign({type:'keyUp'},data));this.inspectInput();return result;
    }
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
                    const tab=this.tabs.find(t=>t.id===this.activeTab);if(tab){tab.title=entry.title||'';tab.url=URLPolicy.allowed(entry.url)?entry.url:'';this.emitTabs();}
                    this.emit('navigationState',{url:URLPolicy.allowed(entry.url)?entry.url:'',title:entry.title,canBack:h.entries.slice(0,h.currentIndex).some(e=>URLPolicy.allowed(e.url)),canForward:h.entries.slice(h.currentIndex+1).some(e=>URLPolicy.allowed(e.url))});
                }
            }catch(e){}
        },100);
    }
    inspectInput(){
        clearTimeout(this.inputTimer);const epoch=this.epoch,view=this.pageGeneration;
        this.inputTimer=setTimeout(async()=>{
            try{const r=await this.send('Runtime.evaluate',{expression:'JSON.stringify((()=>{const e=document.activeElement,t=(e&&e.type||"").toLowerCase(),editable=!!e&&!e.disabled&&!e.readOnly&&(e.isContentEditable||e.tagName==="TEXTAREA"||(e.tagName==="INPUT"&&!/^(button|submit|reset|checkbox|radio|range|file|color|hidden|image)$/.test(t)));return {editable,password:t==="password",token:editable?e.tagName+":"+t+":"+Array.from(document.querySelectorAll("input,textarea,[contenteditable]")).indexOf(e):""};})())',returnByValue:true});
                const info=JSON.parse(r.result.value),key=JSON.stringify(info);
                if(epoch===this.epoch&&view===this.pageGeneration&&key!==this.lastInput){this.lastInput=key;this.emit('input',info);}
            }catch(e){}
        },120);
    }
    async pageInfo(){
        return this.send('Runtime.evaluate',{expression:'JSON.stringify({url:location.origin+location.pathname,title:document.title,ready:document.readyState,visible:document.visibilityState,mains:Array.from(document.querySelectorAll("main")).map(m=>({display:getComputedStyle(m).display,text:m.innerText.slice(0,120)})),scripts:document.scripts.length,resources:performance.getEntriesByType("resource").length})',returnByValue:true});
    }
    stop(reason) {
        this.tabs=[];this.activeTab=null;this.pageGeneration++;this.emitTabs();
        this.lastMedia=null;this.emit('media',{fullscreen:false});
        clearTimeout(this.navigationTimer);clearTimeout(this.inputTimer);this.lastInput=null;
        clearTimeout(this.frameTimer);this.frameTimer=null;if(this.pendingFrame){this.pendingFrame.ack();this.pendingFrame=null;}
        const child=this.child,pipe=this.pipe,profile=this.profile;this.child=null;this.pipe=null;this.session=null;this.profile=null;this.epoch++;
        if(child) {
            // Clear the page immediately and ask Chromium to close normally.
            // Avoid an unconditional SIGKILL, which is unsuitable on this MGU.
            this.emit('blocked',reason||'Browser geschlossen');
            if(pipe&&!pipe.closed)pipe.send('Browser.close',{},null,2000).catch(()=>{});
            let exited=child.exitCode!==null||child.signalCode!==null;
            this.closing=new Promise(resolve=>{
                const cleanup=()=>setTimeout(async()=>{try{if(this.options.profileStore)await this.options.profileStore.capture(profile);}catch(e){this.emit('diagnostic','Geschützte Sitzung konnte nicht gespeichert werden');}finally{try{removeProfile(profile,this.options.profileRoot);}catch(e){this.emit('diagnostic','Profile cleanup failed: '+e.code);}resolve();}},500);
                if(exited)cleanup();else child.once('close',()=>{exited=true;cleanup();});
            });
            const timer=setTimeout(()=>{if(!exited&&child.pid){try{process.kill(-child.pid,'SIGTERM');}catch(e){try{child.kill('SIGTERM');}catch(ignore){}}}},2500);
            timer.unref&&timer.unref();
        }
        if(pipe)pipe.close(new Error(reason||'Browser geschlossen'));
    }
    destroy() {clearInterval(this.watch);clearInterval(this.mediaWatch);this.stop('App geschlossen');}
}
Object.assign(BrowserSession.prototype,require('./browser_pages'));
Object.assign(BrowserSession.prototype,require('./browser_media'));
Object.assign(BrowserSession.prototype,require('./browser_privacy'));
// Node 8 has no recursive rm. Never follow links when clearing our temporary
// profile, and accept only the direct session directory we created ourselves.
function removeProfile(profile,root){
    if(!profile||path.dirname(profile)!==root||!/^session-/.test(path.basename(profile)))return;
    function remove(p){const stat=fs.lstatSync(p);if(stat.isDirectory()&&!stat.isSymbolicLink()){fs.readdirSync(p).forEach(n=>remove(path.join(p,n)));fs.rmdirSync(p);}else fs.unlinkSync(p);}
    try{remove(profile);}catch(e){if(e.code!=='ENOENT')throw e;}
}
module.exports=BrowserSession;
