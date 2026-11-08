'use strict';
// Native browser prompts stay outside the website's rendered surface. Website
// text is displayed as literal text and responses retain the broker's ID.
class BrowserChrome {
    constructor(options){
        this.options=options;this.browser=options.browser;this.dialog=null;this.auth=null;this.authUsername='';this.authPassword='';this.filesState={downloads:[],chooser:null};this.offset=0;this.prompt='';this.busy=false;this.permissionRequests=new Map();this.permissions=null;
        this.browser.on('dialog',value=>{
            const previous=this.dialog;this.dialog=value||null;
            if(!previous||!value||previous.id!==value.id){this.offset=0;this.prompt=value&&value.defaultPrompt||'';options.changed();}
        });
        this.browser.on('files',value=>{if(value)this.filesState=value;options.changed();});
        this.browser.on('auth',value=>{if(!this.auth||!value||this.auth.id!==value.id){this.authUsername='';this.authPassword='';}this.auth=value||null;options.changed();});
        this.browser.on('fileChooser',value=>{this.filesState.chooser=value||null;options.changed();});
        this.browser.on('permission',value=>{if(value&&value.state==='requested')this.permissionRequests.set(value.id,value);else if(value)this.permissionRequests.delete(value.id);options.changed();});
        ['navigation','tabSelected'].forEach(event=>this.browser.on(event,()=>{this.permissions=null;}));
        this.browser.on('blocked',()=>{this.dialog=null;this.auth=null;this.authUsername='';this.authPassword='';this.filesState.chooser=null;this.permissionRequests.clear();this.busy=false;options.changed();});
    }
    permission(){return this.permissionRequests.values().next().value||null;}
    modal(){return !!(this.dialog||this.auth||this.permission()||this.filesState.chooser);}
    authValue(id,field,value){if(!this.auth||this.auth.id!==id||!['username','password'].includes(field))throw new Error('Anmeldung ist abgelaufen');value=String(value||'');if(Buffer.byteLength(value,'utf8')>(field==='username'?1024:4096))throw new Error('Anmeldeeingabe ist zu lang');this[field==='username'?'authUsername':'authPassword']=value;}
    async respondAuth(id,cancel){if(!this.auth||this.auth.id!==id||this.auth.busy||this.busy)return;this.busy=true;try{return await this.browser.request('authReply',{authId:id,username:this.authUsername,password:this.authPassword,cancel});}finally{this.authPassword='';this.busy=false;}}
    promptValue(value){value=String(value||'');if(Buffer.byteLength(value,'utf8')>4096)throw new Error('Dialogantwort ist zu lang (maximal 4096 Byte)');this.prompt=value;}
    async refreshFiles(){const result=await this.browser.request('files');this.filesState=result;return result;}
    async refreshPermissions(){this.permissions=await this.browser.request('permissionStatus');return this.permissions;}
    async setPermission(name,setting,expectedOrigin){if(!expectedOrigin||!this.permissions||this.permissions.origin!==expectedOrigin)throw new Error('Webseite wurde gewechselt');this.permissions=await this.browser.request('permissionSet',{name,setting,expectedOrigin});}
    text(value){return this.options.text?this.options.text(value):value;}
    permissionLabel(name){return this.text({geolocation:'Standort',notifications:'Benachrichtigungen',camera:'Kamera',microphone:'Mikrofon','clipboard-read':'Zwischenablage lesen','clipboard-write':'Zwischenablage schreiben'}[name]||name);}
    async respondDialog(dialogId,accept){
        const state=this.dialog;if(!state||state.id!==dialogId||this.busy)return;this.busy=true;
        try{await this.browser.request('dialogReply',{dialogId:state.id,accept,promptText:this.prompt});}
        finally{this.busy=false;}
    }
    literal(c,value,x,y,size,color,max){c.text(String(value||'').slice(0,max||150),x,y,size,color,{literal:true});}
    lines(c,value,y){
        const words=String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').split(/\s+/),lines=[];let line='';
        for(const word of words){if((line+' '+word).length>105&&line){lines.push(line);line='';}for(let i=0;i<word.length;i+=105){const part=word.slice(i,i+105);if(i+105<word.length){lines.push(line?line+' '+part:part);line='';}else line+=(line?' ':'')+part;}}
        if(line)lines.push(line);const max=Math.max(0,lines.length-5);this.offset=Math.min(this.offset,max);
        lines.slice(this.offset,this.offset+5).forEach((text,index)=>this.literal(c,text,64,y+index*29,22,'#f4f6f9',110));
        if(max){this.options.button(c,64,352,180,40,'Zurueck',()=>{this.offset=Math.max(0,this.offset-5);},'browser-message-prev');this.options.button(c,256,352,180,40,'Weitere',()=>{this.offset=Math.min(max,this.offset+5);},'browser-message-next');}
    }
    draw(c,bottom,mode){
        const button=this.options.button,dialog=this.dialog,auth=this.auth,permission=this.permission(),chooser=this.filesState.chooser;
        c.fillRect(0,58,1600,bottom-58,'#1b222c');
        if(dialog){
            c.text(dialog.type==='beforeunload'?'Seite verlassen?':'Meldung der Webseite',64,114,32,'#f4f6f9');
            this.literal(c,dialog.origin||dialog.tabTitle,64,150,19,'#78bfff',120);this.lines(c,dialog.message,195);
            if(dialog.type==='prompt')button(c,64,399,860,42,this.prompt?this.prompt.slice(0,65):this.text('Antwort eingeben'),()=>this.options.editPrompt(this.prompt),'browser-prompt-edit',{enabled:!this.busy,literal:true});
            if(dialog.type!=='alert')button(c,1020,bottom-58,246,42,'Abbrechen',()=>this.respondDialog(dialog.id,false),'browser-dialog-cancel',{enabled:!this.busy});
            button(c,1288,bottom-58,246,42,dialog.type==='beforeunload'?'Verlassen':'OK',()=>this.respondDialog(dialog.id,true),'browser-dialog-accept',{enabled:!this.busy,primary:true});return;
        }
        if(auth){
            const authBusy=this.busy||auth.busy;
            c.text(auth.isProxy?'Proxy-Anmeldung':'Anmeldung der Webseite',64,114,32,'#f4f6f9');this.literal(c,auth.origin,64,154,20,'#78bfff',120);this.literal(c,auth.realm||'',64,190,19,'#a2afc0',120);
            button(c,64,225,860,44,this.authUsername?this.authUsername.slice(0,65):this.text('Benutzername eingeben'),()=>this.options.editAuth(auth.id,'username',this.authUsername),'browser-auth-username',{enabled:!authBusy,literal:true});
            button(c,64,285,860,44,this.authPassword?'*'.repeat(Math.min(40,this.authPassword.length)):this.text('Passwort eingeben'),()=>this.options.editAuth(auth.id,'password',this.authPassword),'browser-auth-password',{enabled:!authBusy,literal:true});
            if(/^http:/.test(auth.origin))c.text('HTTP-Verbindung ist nicht verschluesselt.',64,370,19,'#a2afc0');
            button(c,1020,bottom-58,246,42,'Abbrechen',()=>this.respondAuth(auth.id,true),'browser-auth-cancel',{enabled:!authBusy});
            button(c,1288,bottom-58,246,42,'Anmelden',()=>this.respondAuth(auth.id,false),'browser-auth-submit',{enabled:!authBusy,primary:true});return;
        }
        if(permission){
            c.text('Berechtigung fuer diese Webseite',64,114,32,'#f4f6f9');
            this.literal(c,permission.origin,64,154,20,'#78bfff',120);
            if(permission.embeddingOrigin!==permission.origin)this.literal(c,this.text('Eingebettet in')+' '+permission.embeddingOrigin,64,187,18,'#a2afc0',125);
            this.lines(c,(permission.permissions||[]).map(name=>this.permissionLabel(name)).join(', '),239);
            button(c,1020,bottom-58,246,42,'Blockieren',()=>this.browser.request('permissionAnswer',{permissionId:permission.id,setting:'denied'}),'browser-permission-deny');
            button(c,1288,bottom-58,246,42,'Erlauben',()=>this.browser.request('permissionAnswer',{permissionId:permission.id,setting:'granted'}),'browser-permission-allow',{primary:true});return;
        }
        if(chooser){
            c.text('Datei fuer die Webseite auswaehlen',64,114,32,'#f4f6f9');
            this.literal(c,chooser.origin||'',64,154,19,'#78bfff',125);
            c.text('Datei auf dem Handy auswaehlen und an diese Webseite senden.',64,211,22,'#f4f6f9');
            this.literal(c,chooser.accept?this.text('Dateitypen:')+' '+chooser.accept:this.text('Alle Dateitypen'),64,252,20,'#a2afc0',115);
            c.text(chooser.multiple?'Mehrere Dateien sind erlaubt.':'Eine Datei ist erlaubt.',64,293,20,'#a2afc0');
            button(c,64,343,450,46,'Handy verbinden / Datei senden',()=>this.options.openRemote(),'browser-chooser-phone',{primary:true});
            button(c,1288,bottom-58,246,42,'Abbrechen',()=>this.browser.request('cancelFileChooser',{chooserId:chooser.id}),'browser-chooser-cancel');return;
        }
        if(mode==='browser-permissions'){
            const state=this.permissions||{};c.text('Website-Berechtigungen',64,114,32,'#f4f6f9');this.literal(c,state.origin||this.text(state.reason||'Zuerst eine Webseite oeffnen'),64,150,19,'#78bfff',125);
            (state.permissions||[]).forEach((item,index)=>{
                const y=191+index*42;this.literal(c,this.permissionLabel(item.name),64,y,22,'#f4f6f9',45);this.literal(c,this.text(({granted:'Erlaubt',denied:'Blockiert',prompt:'Fragen',unsupported:'Nicht verfuegbar'})[item.state]||item.state),615,y,18,'#a2afc0',30);
                [['Erlauben','granted'],['Blockieren','denied'],['Fragen','prompt']].forEach((choice,n)=>button(c,980+n*190,y-26,178,36,choice[0],()=>this.setPermission(item.name,choice[1],state.origin),'browser-permission-'+index+'-'+n,{enabled:state.available&&item.state!=='unsupported',primary:item.state===choice[1]}));
            });
            button(c,1288,bottom-58,246,42,'Fertig',()=>this.options.close(),'browser-permissions-done',{primary:true});return;
        }
        c.text('Downloads',64,114,34,'#f4f6f9');
        const items=this.filesState.downloads||[],count=3,max=Math.max(0,items.length-count);this.offset=Math.min(this.offset,max);
        if(!items.length)c.text('Noch keine Downloads.',64,180,24,'#a2afc0');
        items.slice(this.offset,this.offset+count).forEach((item,index)=>{
            const y=160+index*85;this.literal(c,item.name,64,y,23,'#f4f6f9',77);
            const amount=Math.round((item.received||0)/1024)+' KiB'+(item.total?' / '+Math.round(item.total/1024)+' KiB':'');
            this.literal(c,amount+' · '+this.text(({downloading:'Wird geladen',completed:'Abgeschlossen',cancelled:'Abgebrochen',failed:'Fehlgeschlagen'})[item.state]||item.state||''),64,y+29,18,'#a2afc0',115);
            const active=item.state==='downloading';button(c,1190,y-24,344,42,active?'Abbrechen':'Loeschen',()=>this.browser.request(active?'cancelDownload':'deleteDownload',{downloadId:item.id}),'browser-download-'+index);
        });
        if(items.length>count){button(c,64,415,180,38,'Zurueck',()=>{this.offset=Math.max(0,this.offset-count);},'browser-files-prev');button(c,256,415,180,38,'Weitere',()=>{this.offset=Math.min(max,this.offset+count);},'browser-files-next');}
        button(c,760,bottom-58,500,42,'Downloads auf dem Handy oeffnen',()=>this.options.openRemote(),'browser-files-phone');
        button(c,1288,bottom-58,246,42,'Fertig',()=>this.options.close(),'browser-files-done',{primary:true});
    }
}
module.exports=BrowserChrome;
