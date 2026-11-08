'use strict';
// Independent Chromium targets share one engine and one active profile.
const Policy=require('./url_policy');
const Metadata=require('./browser_metadata');
const Identity=require('./browser_identity');
module.exports={
    // Keep the original Chromium popup target: login flows rely on window.opener,
    // postMessage and window.close and cannot be recreated in a different page.
    targetEvent(event){
        const info=event.params&&event.params.targetInfo,targetId=info&&info.targetId||event.params&&event.params.targetId;
        if(event.method==='Target.targetCreated'&&info&&info.type==='page'&&info.openerId){
            const pending=this.pendingPopups||(this.pendingPopups=new Map());
            if(!this.tabs.some(t=>t.target===info.openerId)&&!pending.has(info.openerId))return;
            if(this.tabs.some(t=>t.target===targetId)||pending.has(targetId))return;
            const pipe=this.pipe,epoch=this.epoch;
            if(this.tabs.length+pending.size>=8){pipe.send('Target.closeTarget',{targetId}).catch(()=>{});this.emit('fault',new Error('Maximal 8 Tabs. Bitte zuerst einen Tab schliessen.'));return;}
            pending.set(targetId,info);
            this.tabTask(async()=>{
                if(this.pipe!==pipe||this.epoch!==epoch||!pending.has(targetId))return;
                try{this.requireAllowed();if(this.tabs.length>=8){await pipe.send('Target.closeTarget',{targetId});throw new Error('Maximal 8 Tabs. Bitte zuerst einen Tab schliessen.');}await this._attachTab(targetId,pending.get(targetId));}
                catch(e){if(this.pipe===pipe&&this.epoch===epoch&&pending.has(targetId))this.emit('fault',e);}
                finally{pending.delete(targetId);}
            }).catch(()=>{});
        }else if(event.method==='Target.targetInfoChanged'&&info){
            if(this.pendingPopups&&this.pendingPopups.has(targetId))this.pendingPopups.set(targetId,info);
            const tab=this.tabs.find(t=>t.target===targetId);
            if(tab){tab.url=Policy.allowed(info.url)?info.url:'';tab.title=Metadata.title(info.title);this.emitTabs();}
        }else if(event.method==='Target.targetDestroyed'){
            if(this.pendingPopups)this.pendingPopups.delete(targetId);
            const pipe=this.pipe,epoch=this.epoch;
            this.tabTask(async()=>{
                if(this.pipe!==pipe||this.epoch!==epoch)return;
                const tab=this.tabs.find(t=>t.target===targetId);if(!tab)return;
                await this._retireTab(tab);
            }).catch(e=>{if(this.pipe===pipe&&this.epoch===epoch)this.emit('fault',e);});
        }else if(event.method==='Target.detachedFromTarget'){
            const params=event.params||{},tab=this.tabs.find(item=>item.session===params.sessionId&&(!params.targetId||item.target===params.targetId));
            if(!tab||tab.detachedSession===params.sessionId)return;
            const pipe=this.pipe,epoch=this.epoch,session=tab.session;tab.detachedSession=session;
            if(pipe.cancelSession)pipe.cancelSession(session);
            this._clearTabSession(tab,session,false);
            this.tabTask(()=>this._handleDetachedTab(tab,session,pipe,epoch)).catch(error=>{if(this.pipe===pipe&&this.epoch===epoch)this.emit('fault',error);});
        }
    },
    _clearTabSession(tab,session,files){
        if(this.clearFileChooser)this.clearFileChooser(session);
        if(files&&this.releaseFileUploads)this.releaseFileUploads(session);
        if(this.forgetPermissionSession)this.forgetPermissionSession(session);
        if(this.clearAuth)this.clearAuth(session);
        if(this.clearDialogs)this.clearDialogs(session);
        if(this.clearAccessibleMedia)this.clearAccessibleMedia(session);
        if(this.webAudioContexts)for(const [key,context] of this.webAudioContexts)if(context.session===session||context.frame&&context.frame.mainSession===session)this.webAudioContexts.delete(key);
        if(this.activeTab===tab.id&&this.session===session){
            let previous={};if(this.lastMediaSession===session&&this.lastMediaPipe===this.pipe&&this.lastMedia){try{previous=JSON.parse(this.lastMedia)||{};}catch(ignore){}}
            this.mediaActivityState=Object.assign({},this.mediaActivityState,{audible:false,webAudioRunning:0,activityUnknown:true});
            this.emit('media',Object.assign({fullscreen:false},previous,this.mediaActivityState));
        }
    },
    async _retireTab(tab){
        if(this.tabs.indexOf(tab)<0)return;
        this._clearTabSession(tab,tab.session,true);
        const index=this.tabs.indexOf(tab),active=this.activeTab===tab.id;this.tabs=this.tabs.filter(item=>item!==tab);
        if(active){
            const opener=this.tabs.find(item=>item.target===tab.openerTarget),next=opener||this.tabs[Math.min(index,this.tabs.length-1)];
            if(next)await this._selectTab(next.id);else await this._newTab('');
        }
        this.emitTabs();
    },
    async _handleDetachedTab(tab,session,pipe,epoch){
        const valid=()=>this.pipe===pipe&&this.epoch===epoch&&this.tabs.indexOf(tab)>=0&&tab.session===session;
        if(!valid())return;let info;
        try{info=(await pipe.send('Target.getTargetInfo',{targetId:tab.target},null,1500)).targetInfo;}
        catch(ignore){try{info=((await pipe.send('Target.getTargets',{},null,1500)).targetInfos||[]).find(item=>item.targetId===tab.target);}catch(error){if(valid())throw Error('Seitenverbindung konnte nicht wiederhergestellt werden');return;}}
        if(!valid())return;if(!info){await this._retireTab(tab);return;}
        if(info.targetId!==tab.target||info.type!=='page')throw Error('Seitenverbindung hat sich geändert');
        const empty=()=>info&&info.targetId===tab.target&&info.type==='page'&&tab.popup&&tab.openerTarget&&tab.committed!==true&&info.url==='about:blank';
        if(empty()&&this.isDownloadPopup&&!this.isDownloadPopup(tab)){
            await new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);this.removeListener('downloadPopup',changed);resolve();},changed=target=>{if(target===tab.target)finish();};this.on('downloadPopup',changed);timer=setTimeout(finish,300);});
        }
        if(!valid())return;
        if(empty()&&this.isDownloadPopup&&this.isDownloadPopup(tab)){
            try{info=(await pipe.send('Target.getTargetInfo',{targetId:tab.target},null,1500)).targetInfo;}catch(ignore){info=null;}
            if(!valid())return;if(!info){await this._retireTab(tab);return;}
            if(empty()){
                if(this.filePopupRetired)this.filePopupRetired(tab,info);
                await pipe.send('Target.closeTarget',{targetId:tab.target},null,1500).catch(()=>{});
                if(valid())await this._retireTab(tab);return;
            }
        }
        await this._recoverDetachedTab(tab,pipe,epoch);
    },
    async _recoverDetachedTab(tab,pipe,epoch){
        const old=tab.session,valid=()=>this.pipe===pipe&&this.epoch===epoch&&this.tabs.indexOf(tab)>=0;let attached;
        try{
            this.requireAllowed();attached=await pipe.send('Target.attachToTarget',{targetId:tab.target,flatten:true},null,1500);
            if(!valid()||tab.session!==old){if(attached.sessionId)pipe.send('Target.detachFromTarget',{sessionId:attached.sessionId}).catch(()=>{});throw Error('Seitenverbindung hat sich geändert');}
            tab.session=attached.sessionId;tab.closeRequested=false;
            if(this.rebindFileSession)this.rebindFileSession(old,tab.session);
            await this._initializeTabSession(tab,pipe,epoch);tab.detachedSession=null;
            if(this.activeTab===tab.id||!this.tabs.some(item=>item.id===this.activeTab))await this._selectTab(tab.id,true);
            this.updateTab(tab);this.emitTabs();return {id:tab.id};
        }catch(error){
            if(valid()){
                tab.detachedSession=tab.session;
                if(attached&&attached.sessionId)pipe.send('Target.detachFromTarget',{sessionId:attached.sessionId}).catch(()=>{});
                if(this.activeTab===tab.id){const next=this.tabs.find(item=>item!==tab&&item.target===tab.openerTarget)||this.tabs.find(item=>item!==tab);if(next)await this._selectTab(next.id).catch(()=>{});else await this._newTab('');}
                this.emitTabs();
            }
            throw Error('Seitenverbindung konnte nicht wiederhergestellt werden');
        }
    },
    async setLocale(locale){
        this.requireAllowed();if(typeof locale!=='string'||!(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)))throw new Error('Invalid browser locale');
        this.locale=locale;for(const tab of this.tabs)await this.applyLocale(tab.session);
    },
    async applyLocale(session,pipe){
        pipe=pipe||this.pipe;
        // An empty UA clears CDP's identity override while still applying the
        // selected language. Chromium supplies its own UA, platform, brands,
        // GREASE and high-entropy hints on every tab and after locale changes.
        await pipe.send('Network.setUserAgentOverride',Identity.localeOverride(this.locale),session);
        // Same-origin popups can share their opener's renderer and inherit its
        // locale override. Chromium permits only one CDP owner per renderer.
        try{await pipe.send('Emulation.setLocaleOverride',{locale:this.locale},session);}
        catch(e){if(e.message!=='Another locale override is already in effect')throw e;}
    },
    emitTabs(){this.emit('tabs',this.tabs.map(t=>({id:t.id,url:Policy.allowed(t.url)?t.url:'',title:Metadata.title(t.title),loading:!!t.loading,active:t.id===this.activeTab})));if(this.checkpointTabs)this.checkpointTabs();},
    async updateTab(tab){
        const pipe=this.pipe;if(!pipe)return;
        try{
            const h=await pipe.send('Page.getNavigationHistory',{},tab.session),e=h.entries[h.currentIndex];
            if(!this.tabs.includes(tab))return;
            if(e){tab.url=Policy.allowed(e.url)?e.url:'';tab.title=Metadata.title(e.title);}this.emitTabs();
        }catch(e){}
    },
    tabTask(fn){const work=this.tabQueue.catch(()=>{}).then(fn);this.tabQueue=work;return work;},
    newTab(url){return this.tabTask(()=>this.child?this._newTab(url||''):this.start(url||''));},
    selectTab(id){return this.tabTask(()=>{const tab=this.tabs.find(item=>item.id===id);return tab&&tab.detachedSession===tab.session?this._recoverDetachedTab(tab,this.pipe,this.epoch):this._selectTab(id);});},
    clearTab(){return this.tabTask(async()=>{
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===this.activeTab);if(!tab)return;
        await this.send('Page.navigate',{url:'about:blank'});tab.url='';tab.requestedURL='';tab.title='';tab.loading=false;tab.popup=false;
        this.emitTabs();this.emit('tabSelected',{id:tab.id,url:'',title:'',loading:false});this.scheduleNavigation();
    });},
    closeTab(id){return this.tabTask(async()=>{
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===id);if(!tab)throw new Error('Tab nicht vorhanden');
        if(tab.detachedSession===tab.session)await this._recoverDetachedTab(tab,this.pipe,this.epoch);
        if(tab.closeRequested)return {pending:true};
        const pipe=this.pipe,epoch=this.epoch,valid=()=>this.pipe===pipe&&this.epoch===epoch&&this.tabs.indexOf(tab)>=0;
        const modal=this.javascriptDialogs&&this.javascriptDialogs.get(tab.session);
        if(modal){
            if(modal.responding||modal.public.type==='beforeunload')return {pending:true};
            await this.dialogReply(modal.public.id,false,'');
            if(!valid())throw new Error('Tab wurde bereits geschlossen');
            if(this.javascriptDialogs.get(tab.session))return {pending:true};
        }
        this.requireAllowed();tab.closeRequested=true;
        try{
            // Keep the target, focus, uploads and media until Chromium really
            // closes it. A beforeunload cancellation must leave them intact.
            // targetDestroyed handles selection/replacement on this same
            // queue; never wait for that queued event from inside tabTask.
            await pipe.send('Page.close',{},tab.session,2000);return {closing:true};
        }catch(ignore){if(valid())tab.closeRequested=false;throw new Error('Tab konnte nicht geschlossen werden');}
    });},
    async _newTab(url){
        this.requireAllowed();if(url&&!Policy.allowed(url))throw new Error('HTTP- oder HTTPS-Adresse erforderlich');
        if(this.tabs.length>=8)throw new Error('Maximal 8 Tabs. Bitte zuerst einen Tab schliessen.');
        const pipe=this.pipe,epoch=this.epoch,target=await pipe.send('Target.createTarget',{url:'about:blank'});
        if(this.pipe!==pipe||this.epoch!==epoch)throw new Error('Tabstart abgebrochen');
        return this._attachTab(target.targetId,{},url);
    },
    async _initializeTabSession(tab,pipe,epoch){
        const check=()=>{if(this.pipe!==pipe||this.epoch!==epoch||this.tabs.indexOf(tab)<0)throw Error('Tabstart abgebrochen');this.requireAllowed();};
        const send=async(method,params)=>{check();const result=await pipe.send(method,params,tab.session);check();return result;};
        await send('Page.enable');await send('Page.setInterceptFileChooserDialog',{enabled:true});await send('Runtime.enable');await send('Network.enable');await send('Log.enable');await send('WebAudio.enable').catch(()=>{});
        if(this.installPermissions){await this.installPermissions(tab.session,pipe);check();}
        await this.applyLocale(tab.session,pipe);check();await this.applyPagePerformance(tab.session,pipe);check();await this.installVideoFit(tab.session);check();
    },
    async _attachTab(targetId,info,url){
        this.requireAllowed();const pipe=this.pipe,epoch=this.epoch,previous=this.activeTab;
        let tab;
        try{
            const attached=await pipe.send('Target.attachToTarget',{targetId,flatten:true});
            if(epoch!==this.epoch||pipe!==this.pipe)throw new Error('Tabstart abgebrochen');
            tab={id:'tab-'+(++this.tabNext),target:targetId,session:attached.sessionId,url:Policy.allowed(info.url)?info.url:'',requestedURL:url||'',title:Metadata.title(info.title),loading:!!url,popup:!!info.openerId,openerTarget:info.openerId||null,committed:false};
            this.tabs.push(tab);
            const check=()=>{if(this.pipe!==pipe||this.epoch!==epoch||!this.tabs.includes(tab))throw new Error('Tabstart abgebrochen');this.requireAllowed();};
            await this._initializeTabSession(tab,pipe,epoch);check();
            await this._selectTab(tab.id);check();
            if(url){
                try{await this.navigate(url);}
                catch(error){
                    if(!error.navigationFailure)throw error;check();
                    // Chromium has a real network/certificate error document.
                    // Keep this tab and its error UI available for retry; the
                    // browser process itself successfully started.
                    if(tab.requestedURL===url){tab.url=url;tab.loading=false;if(this.session===tab.session)this.emit('navigation',url);}
                    this.emit('fault',error);this.scheduleNavigation();
                }
            }
            else this.updateTab(tab);
            this.emitTabs();return {id:tab.id};
        }catch(e){
            // Native attachment downloads may retire the renderer while its
            // initial CDP setup is still pending. The queued detach handler
            // owns safe retirement/recovery; never discard a live document.
            if(tab&&this.pipe===pipe&&this.epoch===epoch&&this.tabs.includes(tab)&&tab.detachedSession===tab.session)return {id:tab.id,detached:true};
            if(tab)if(this.clearFileChooser)this.clearFileChooser(tab.session);
            if(tab){if(this.clearAccessibleMedia)this.clearAccessibleMedia(tab.session);if(this.clearDialogs)this.clearDialogs(tab.session);this.tabs=this.tabs.filter(t=>t!==tab);}
            if(this.pipe===pipe&&this.epoch===epoch){
                await pipe.send('Target.closeTarget',{targetId}).catch(()=>{});
                if(tab&&this.activeTab===tab.id){const prior=this.tabs.find(t=>t.id===previous);if(prior)await this._selectTab(prior.id).catch(()=>{});else{this.activeTab=null;this.session=null;this.target=null;}}
                this.emitTabs();
            }
            throw e;
        }
    },
    async _selectTab(id,force){
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===id);if(!tab)throw new Error('Tab nicht vorhanden');
        if(this.activeTab===id&&!force)return;
        if(this.resetFindState)this.resetFindState();
        if(this.clearFileChooser)this.clearFileChooser();
        const pipe=this.pipe,epoch=this.epoch;
        const check=()=>{this.requireAllowed();if(this.pipe!==pipe||this.epoch!==epoch||!this.tabs.includes(tab))throw new Error('Tabwechsel abgebrochen');};
        const send=async(method,params,session)=>{check();const result=await pipe.send(method,params,session||tab.session);check();return result;};
        const previous=this.tabs.find(t=>t.session===this.session);
        if(previous&&this.clearAuth)this.clearAuth(previous.session);
        if(previous&&this.cancelPermissionRequests)this.cancelPermissionRequests(previous.session);
        if(previous)previous.mediaActive=!!(this.mediaActivityState&&(this.mediaActivityState.playing||this.mediaActivityState.audible));
        if(this.session){await send('Page.stopScreencast',{},this.session).catch(()=>{});check();await send('Emulation.setFocusEmulationEnabled',{enabled:false},this.session).catch(()=>{});check();}
        clearTimeout(this.navigationTimer);clearTimeout(this.inputTimer);clearTimeout(this.frameTimer);
        this.frameTimer=null;if(this.pendingFrame){this.pendingFrame.ack();this.pendingFrame=null;}
        this.pageGeneration++;this.lastInput=null;this.lastFrame=0;
        this.lastMedia=null;this.emit('media',Object.assign({fullscreen:false},this.mediaActivityState||{}));
        this.session=tab.session;this.target=tab.target;this.activeTab=id;this.mainFrame=tab.mainFrame;
        if(this.emitAuthState)this.emitAuthState();
        if(this.emitDialogState)this.emitDialogState();
        this.emitTabs();this.emit('tabSelected',{id,url:tab.url,title:tab.title||'',loading:!!tab.loading,popup:!!tab.popup});
        this.emit('input',{editable:false,password:false});
        await this.lifecycle(previous,tab);check();
        await send('Page.bringToFront');
        await send('Emulation.setFocusEmulationEnabled',{enabled:true});
        await this.resize(this.viewport.pixelWidth||this.viewport.width,this.viewport.pixelHeight||this.viewport.height,this.viewport.zoom||100);check();
        await send('Page.startScreencast',{format:this.performance.codec==='jpeg-native'?'jpeg':'png',quality:75,maxWidth:1280,maxHeight:720,everyNthFrame:1});
        this.emit('loading',!!tab.loading);this.scheduleNavigation();this.inspectInput();
    }
};
