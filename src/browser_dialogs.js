'use strict';
const URL=require('url').URL;
const TYPES=['alert','confirm','prompt','beforeunload'];
const TIMEOUT=120000;
function text(value,limit){return typeof value==='string'?value.replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,limit):'';}
function origin(value){try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url.origin.slice(0,256):'';}catch(ignore){return '';}}
module.exports={
    dialogState(){
        const records=this.javascriptDialogs;if(!records||!records.size)return null;
        let chosen;
        for(const record of records.values()){
            if(!chosen)chosen=record;
            if(record.tab.id===this.activeTab){chosen=record;break;}
        }
        return Object.assign({},chosen.public,{background:chosen.tab.id!==this.activeTab,busy:chosen.responding});
    },
    emitDialogState(){
        const state=this.dialogState(),key=JSON.stringify(state);
        if(this.lastDialogState!==key){this.lastDialogState=key;this.emit('dialog',state);}
    },
    clearDialogs(session){
        const records=this.javascriptDialogs;if(!records)return;
        let changed=false;
        for(const [key,record] of records){
            if(session!==undefined&&key!==session)continue;
            clearTimeout(record.timer);records.delete(key);changed=true;
        }
        if(changed)this.emitDialogState();
    },
    javascriptDialogEvent(event){
        const session=event.sessionId,records=this.javascriptDialogs||(this.javascriptDialogs=new Map());
        if(event.method==='Page.javascriptDialogClosed'){
            const record=records.get(session);
            if(record&&record.public.type==='beforeunload'&&event.params&&event.params.result===false)record.tab.closeRequested=false;
            this.clearDialogs(session);return;
        }
        if(event.method!=='Page.javascriptDialogOpening')return;
        const params=event.params||{},tab=(this.tabs||[]).find(item=>item.session===session);
        if(!tab||TYPES.indexOf(params.type)<0)return;
        const existing=records.get(session);if(existing)clearTimeout(existing.timer);
        // Chromium allows one native modal per target. A replay/replacement
        // receives a new owner ID, invalidating any queued old UI response.
        const id='dialog-'+this.epoch+'-'+(this.dialogSequence=(this.dialogSequence||0)+1);
        const record={tab,session,pipe:this.pipe,epoch:this.epoch,responding:false,
            public:{id,type:params.type,origin:origin(params.url),tabId:tab.id,tabTitle:text(tab.title,160),message:text(params.message,1024),defaultPrompt:text(params.defaultPrompt,512)}};
        records.set(session,record);
        record.timer=setTimeout(()=>{
            if(records.get(session)!==record)return;
            // Cancel confirmations/prompts and stay on a beforeunload page.
            // Never accept an unattended request to leave or submit anything.
            this.dialogReply(id,false,'').catch(()=>{if(records.get(session)===record)this.clearDialogs(session);});
        },TIMEOUT);
        if(record.timer.unref)record.timer.unref();
        this.emitDialogState();
    },
    async dialogReply(id,accept,promptText){
        this.requireAllowed();
        if(typeof id!=='string'||id.length>80||typeof accept!=='boolean'||promptText!==undefined&&(typeof promptText!=='string'||Buffer.byteLength(promptText,'utf8')>4096))throw Error('Ungültige Dialogantwort');
        const records=this.javascriptDialogs;
        const record=records&&Array.from(records.values()).find(item=>item.public.id===id);
        if(!record||record.responding||record.pipe!==this.pipe||record.epoch!==this.epoch||(this.tabs||[]).indexOf(record.tab)<0||record.tab.session!==record.session)throw Error('Website-Dialog ist nicht mehr aktuell');
        const current=()=>records.get(record.session)===record&&record.pipe===this.pipe&&record.epoch===this.epoch&&(this.tabs||[]).indexOf(record.tab)>=0;
        record.responding=true;clearTimeout(record.timer);this.emitDialogState();
        const params={accept};if(record.public.type==='prompt'&&accept)params.promptText=promptText===undefined?'':promptText;
        try{
            // Modal replies must bypass the renderer's input task queue; the
            // page may be synchronously blocked on this very dialog.
            await record.pipe.send('Page.handleJavaScriptDialog',params,record.session,2000);
            if(current()){if(record.public.type==='beforeunload'&&!accept)record.tab.closeRequested=false;records.delete(record.session);this.emitDialogState();}
            return {handled:true};
        }catch(ignore){
            if(current()){records.delete(record.session);this.emitDialogState();}
            throw Error('Website-Dialog konnte nicht beantwortet werden');
        }
    }
};
