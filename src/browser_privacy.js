'use strict';
// Only explicit native save/fill actions touch credentials; values never return over IPC.
const loginForm='const visible=e=>e&&!e.disabled&&!e.readOnly&&e.getClientRects().length>0,p=Array.from(document.querySelectorAll("input[type=password]")).find(visible),root=p&&(p.form||document),fields=root?Array.from(root.querySelectorAll("input")).filter(e=>visible(e)&&e!==p&&/^(email|text|tel)$/.test(e.type)):[],u=fields.find(e=>e.autocomplete==="username")||fields.find(e=>e.type==="email")||fields.filter(e=>e.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING).pop();';
module.exports={
    async privacyStatus(){this.requireAllowed();return this.options.profileStore?this.options.profileStore.status():{supported:false,rememberSessions:false,rememberCache:false};},
    async privacyConfigure(prefs){this.requireAllowed();if(!this.options.profileStore)throw new Error('Geschützter Speicher nicht verfügbar');return this.options.profileStore.configure(prefs||{});},
    async vaultUnlock(password){this.requireAllowed();if(!this.options.profileStore)throw new Error('Geschützter Speicher nicht verfügbar');return this.options.profileStore.unlock(password);},
    clearBrowserData(kind){
        this.requireAllowed();const store=this.options.profileStore;if(!store)throw new Error('Geschützter Speicher nicht verfügbar');
        if(!['cache','sites','sessions-reset'].includes(kind))return Promise.reject(new Error('Unbekannte Datenkategorie'));
        const work=(this.storageChange||Promise.resolve()).catch(()=>{}).then(async()=>{
            if(kind==='cache'){if(this.session)await this.send('Network.clearBrowserCache');if(this.recoveryProfile){if(this.shutdownFault)throw this.shutdownFault;await store.clearProfileCache(this.recoveryProfile);}await store.clear('cache');}
            else {store.skipCapture=!!this.child;this.stop('Website-Daten werden gelöscht');await this.closing;if(this.shutdownFault)throw this.shutdownFault;this.discardRetainedProfile();if(kind==='sessions-reset')await store.resetSessions();else await store.clear('sites');}
            return store.status();
        });
        this.storageChange=work;return work;
    },
    async vaultList(){this.requireAllowed();if(!this.options.profileStore)throw new Error('Passwortspeicher nicht verfügbar');return this.options.profileStore.listLogins();},
    async vaultSave(){
        this.requireAllowed();if(!this.options.profileStore||!this.session)throw new Error('Zuerst ein HTTPS-Anmeldeformular ausfüllen');
        const generation=this.pageGeneration;
        const result=await this.send('Runtime.evaluate',{expression:'JSON.stringify((()=>{if(location.protocol!=="https:")return null;'+loginForm+'return p&&u&&p.value&&u.value?{origin:location.origin,username:u.value.slice(0,512),password:p.value.slice(0,4096)}:null;})())',returnByValue:true});
        const value=JSON.parse(result.result.value||'null');this.requireAllowed();
        if(generation!==this.pageGeneration||!value)throw new Error('Kein vollständiges HTTPS-Anmeldeformular gefunden');
        try{return await this.options.profileStore.saveLogin(value.origin,value.username,value.password);}finally{value.password='';}
    },
    async vaultFill(id){
        this.requireAllowed();if(!this.options.profileStore||!this.session)throw new Error('Zuerst eine HTTPS-Anmeldeseite öffnen');
        const result=await this.send('Runtime.evaluate',{expression:'location.origin',returnByValue:true}),origin=result.result.value;
        if(!/^https:\/\//.test(origin))throw new Error('Zugangsdaten nur auf der passenden HTTPS-Seite');
        const value=await this.options.profileStore.login(String(id),origin);
        const expression='(()=>{const saved='+JSON.stringify(value)+';if(location.origin!==saved.origin||location.protocol!=="https:")return false;'+loginForm+'if(!p||!u)return false;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;for(const pair of [[u,saved.username],[p,saved.password]]){set.call(pair[0],pair[1]);pair[0].dispatchEvent(new Event("input",{bubbles:true}));pair[0].dispatchEvent(new Event("change",{bubbles:true}));}return true;})()';
        try{this.requireAllowed();const filled=await this.send('Runtime.evaluate',{expression,returnByValue:true});if(!filled.result||!filled.result.value)throw new Error('Passendes Anmeldeformular nicht gefunden');return {filled:true};}finally{value.password='';}
    },
    async vaultRemove(id){this.requireAllowed();if(!this.options.profileStore)throw new Error('Passwortspeicher nicht verfügbar');return this.options.profileStore.removeLogin(String(id));}
};
