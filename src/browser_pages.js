'use strict';
// Independent Chromium targets share one engine and one temporary profile.
const Policy=require('./url_policy');
module.exports={
    async setLocale(locale){
        this.requireAllowed();if(typeof locale!=='string'||!(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)))throw new Error('Invalid browser locale');
        this.locale=locale;for(const tab of this.tabs)await this.applyLocale(tab.session);
    },
    async applyLocale(session){
        const language=this.locale.split('-')[0];
        await this.pipe.send('Network.setUserAgentOverride',{userAgent:this.userAgent,acceptLanguage:this.locale+','+language+';q=0.9',platform:'Linux x86_64'},session);
        await this.pipe.send('Emulation.setLocaleOverride',{locale:this.locale},session);
    },
    emitTabs(){this.emit('tabs',this.tabs.map(t=>({id:t.id,url:t.url,title:t.title||'',loading:!!t.loading,active:t.id===this.activeTab})));},
    async updateTab(tab){
        const pipe=this.pipe;if(!pipe)return;
        try{
            const h=await pipe.send('Page.getNavigationHistory',{},tab.session),e=h.entries[h.currentIndex];
            if(!this.tabs.includes(tab))return;
            if(e){tab.url=Policy.allowed(e.url)?e.url:'';tab.title=e.title||'';}this.emitTabs();
        }catch(e){}
    },
    tabTask(fn){const work=this.tabQueue.catch(()=>{}).then(fn);this.tabQueue=work;return work;},
    newTab(url){return this.tabTask(()=>this.child?this._newTab(url||''):this.start(url||''));},
    selectTab(id){return this.tabTask(()=>this._selectTab(id));},
    clearTab(){return this.tabTask(async()=>{
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===this.activeTab);if(!tab)return;
        await this.send('Page.navigate',{url:'about:blank'});tab.url='';tab.title='';tab.loading=false;
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
        const attached=await pipe.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
        if(epoch!==this.epoch)throw new Error('Tabstart abgebrochen');
        const tab={id:'tab-'+(++this.tabNext),target:target.targetId,session:attached.sessionId,url:'',title:'',loading:!!url};
        const send=(method,params)=>pipe.send(method,params,tab.session);
        this.tabs.push(tab);
        try{
            await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
            await this.applyLocale(tab.session);
            await this.installVideoFit(tab.session);
            if(this.options.mediaDisabled)await send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Response'},{urlPattern:'*',resourceType:'Media',requestStage:'Request'}]});
            await this._selectTab(tab.id);
            if(url)await this.navigate(url);
            this.emitTabs();return {id:tab.id};
        }catch(e){this.tabs=this.tabs.filter(t=>t!==tab);if(this.pipe===pipe)await pipe.send('Target.closeTarget',{targetId:tab.target}).catch(()=>{});throw e;}
    },
    async _selectTab(id){
        this.requireAllowed();const tab=this.tabs.find(t=>t.id===id);if(!tab)throw new Error('Tab nicht vorhanden');
        if(this.activeTab===id)return;
        if(this.session)await this.send('Page.stopScreencast').catch(()=>{});
        clearTimeout(this.navigationTimer);clearTimeout(this.inputTimer);clearTimeout(this.frameTimer);
        this.frameTimer=null;if(this.pendingFrame){this.pendingFrame.ack();this.pendingFrame=null;}
        this.pageGeneration++;this.lastInput=null;this.lastFrame=0;
        this.lastMedia=null;this.emit('media',{fullscreen:false});
        this.session=tab.session;this.target=tab.target;this.activeTab=id;this.mainFrame=tab.mainFrame;
        this.emitTabs();this.emit('tabSelected',{id,url:tab.url,title:tab.title||'',loading:!!tab.loading});
        this.emit('input',{editable:false,password:false});
        await this.send('Page.bringToFront');
        await this.resize(this.viewport.width,this.viewport.height);
        await this.send('Page.startScreencast',{format:this.performance.codec==='jpeg-native'?'jpeg':'png',quality:82,maxWidth:1280,maxHeight:720,everyNthFrame:1});
        this.emit('loading',!!tab.loading);this.scheduleNavigation();this.inspectInput();
    }
};
