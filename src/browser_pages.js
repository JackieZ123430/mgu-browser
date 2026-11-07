'use strict';
// Independent Chromium targets share one engine and one active profile.
const Policy=require('./url_policy');
const Metadata=require('./browser_metadata');
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
                const index=this.tabs.indexOf(tab),active=this.activeTab===tab.id;
                this.tabs=this.tabs.filter(t=>t!==tab);
                if(active){if(this.tabs.length)await this._selectTab(this.tabs[Math.min(index,this.tabs.length-1)].id);else await this._newTab('');}
                this.emitTabs();
            }).catch(e=>{if(this.pipe===pipe&&this.epoch===epoch)this.emit('fault',e);});
        }
    },
    async setLocale(locale){
        this.requireAllowed();if(typeof locale!=='string'||!(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)))throw new Error('Invalid browser locale');
        this.locale=locale;for(const tab of this.tabs)await this.applyLocale(tab.session);
    },
    async applyLocale(session,pipe){
        pipe=pipe||this.pipe;
        const language=this.locale.split('-')[0];
        await pipe.send('Network.setUserAgentOverride',{userAgent:this.userAgent,acceptLanguage:this.locale+','+language+';q=0.9',platform:'Linux x86_64'},session);
        // Same-origin popups can share their opener's renderer and inherit its
        // locale override. Chromium permits only one CDP owner per renderer.
        try{await pipe.send('Emulation.setLocaleOverride',{locale:this.locale},session);}
        catch(e){if(e.message!=='Another locale override is already in effect')throw e;}
    },
    emitTabs(){this.emit('tabs',this.tabs.map(t=>({id:t.id,url:Policy.allowed(t.url)?t.url:'',title:Metadata.title(t.title),loading:!!t.loading,active:t.id===this.activeTab})));},
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
    selectTab(id){return this.tabTask(()=>this._selectTab(id));},
    clearTab(){return this.tabTask(async()=>{
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===this.activeTab);if(!tab)return;
        await this.send('Page.navigate',{url:'about:blank'});tab.url='';tab.title='';tab.loading=false;tab.popup=false;
        this.emitTabs();this.emit('tabSelected',{id:tab.id,url:'',title:'',loading:false});this.scheduleNavigation();
    });},
    closeTab(id){return this.tabTask(async()=>{
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===id);if(!tab)throw new Error('Tab nicht vorhanden');
        const index=this.tabs.indexOf(tab),active=this.activeTab===id;
        if(this.tabs.length===1){await this._newTab('');}
        else if(active)await this._selectTab(this.tabs[index===this.tabs.length-1?index-1:index+1].id);
        this.tabs=this.tabs.filter(t=>t!==tab);await this.pipe.send('Target.closeTarget',{targetId:tab.target});this.emitTabs();
    });},
    async _newTab(url){
        this.requireAllowed();if(url&&!Policy.allowed(url))throw new Error('HTTPS-Adresse erforderlich');
        if(this.tabs.length>=8)throw new Error('Maximal 8 Tabs. Bitte zuerst einen Tab schliessen.');
        const pipe=this.pipe,epoch=this.epoch,target=await pipe.send('Target.createTarget',{url:'about:blank'});
        if(this.pipe!==pipe||this.epoch!==epoch)throw new Error('Tabstart abgebrochen');
        return this._attachTab(target.targetId,{},url);
    },
    async _attachTab(targetId,info,url){
        this.requireAllowed();const pipe=this.pipe,epoch=this.epoch,previous=this.activeTab;
        let tab;
        try{
            const attached=await pipe.send('Target.attachToTarget',{targetId,flatten:true});
            if(epoch!==this.epoch||pipe!==this.pipe)throw new Error('Tabstart abgebrochen');
            tab={id:'tab-'+(++this.tabNext),target:targetId,session:attached.sessionId,url:Policy.allowed(info.url)?info.url:'',title:Metadata.title(info.title),loading:!!url,popup:!!info.openerId};
            this.tabs.push(tab);
            const check=()=>{if(this.pipe!==pipe||this.epoch!==epoch||!this.tabs.includes(tab))throw new Error('Tabstart abgebrochen');this.requireAllowed();};
            const send=async(method,params)=>{check();const result=await pipe.send(method,params,tab.session);check();return result;};
            await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
            await this.applyLocale(tab.session,pipe);check();
            await this.installVideoFit(tab.session);check();
            if(this.options.mediaDisabled)await send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Response'},{urlPattern:'*',resourceType:'Media',requestStage:'Request'}]});
            await this._selectTab(tab.id);check();
            if(url)await this.navigate(url);
            else this.updateTab(tab);
            this.emitTabs();return {id:tab.id};
        }catch(e){
            if(tab)this.tabs=this.tabs.filter(t=>t!==tab);
            if(this.pipe===pipe&&this.epoch===epoch){
                await pipe.send('Target.closeTarget',{targetId}).catch(()=>{});
                if(tab&&this.activeTab===tab.id){const prior=this.tabs.find(t=>t.id===previous);if(prior)await this._selectTab(prior.id).catch(()=>{});else{this.activeTab=null;this.session=null;this.target=null;}}
                this.emitTabs();
            }
            throw e;
        }
    },
    async _selectTab(id){
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===id);if(!tab)throw new Error('Tab nicht vorhanden');
        if(this.activeTab===id)return;
        const pipe=this.pipe,epoch=this.epoch;
        const check=()=>{this.requireAllowed();if(this.pipe!==pipe||this.epoch!==epoch||!this.tabs.includes(tab))throw new Error('Tabwechsel abgebrochen');};
        const send=async(method,params,session)=>{check();const result=await pipe.send(method,params,session||tab.session);check();return result;};
        if(this.session){await send('Page.stopScreencast',{},this.session).catch(()=>{});check();await send('Emulation.setFocusEmulationEnabled',{enabled:false},this.session).catch(()=>{});check();}
        clearTimeout(this.navigationTimer);clearTimeout(this.inputTimer);clearTimeout(this.frameTimer);
        this.frameTimer=null;if(this.pendingFrame){this.pendingFrame.ack();this.pendingFrame=null;}
        this.pageGeneration++;this.lastInput=null;this.lastFrame=0;
        this.lastMedia=null;this.emit('media',{fullscreen:false});
        this.session=tab.session;this.target=tab.target;this.activeTab=id;this.mainFrame=tab.mainFrame;
        this.emitTabs();this.emit('tabSelected',{id,url:tab.url,title:tab.title||'',loading:!!tab.loading,popup:!!tab.popup});
        this.emit('input',{editable:false,password:false});
        await send('Page.bringToFront');
        await send('Emulation.setFocusEmulationEnabled',{enabled:true});
        await this.resize(this.viewport.width,this.viewport.height);check();
        await send('Page.startScreencast',{format:this.performance.codec==='jpeg-native'?'jpeg':'png',quality:82,maxWidth:1280,maxHeight:720,everyNthFrame:1});
        this.emit('loading',!!tab.loading);this.scheduleNavigation();this.inspectInput();
    }
};
