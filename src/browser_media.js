'use strict';
// Fixed expressions only: no page-provided scripts, selectors or input values.
const locate='const f=document.fullscreenElement,v=f&&(f.tagName==="VIDEO"?f:f.querySelector("video"));';
const snapshot='JSON.stringify((()=>{'+locate+'return {fullscreen:!!v,paused:v?!!v.paused:true,muted:v?!!v.muted:false,currentTime:v&&Number.isFinite(v.currentTime)?v.currentTime:0,duration:v&&Number.isFinite(v.duration)?v.duration:0};})())';
const fitScript='document.addEventListener("fullscreenchange",()=>{if(document.getElementById("mgu-video-fit"))return;const s=document.createElement("style");s.id="mgu-video-fit";s.textContent=":fullscreen video,video:fullscreen{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center!important;transform:none!important;}";document.documentElement.appendChild(s);});';
module.exports={
    installVideoFit(session){return this.pipe.send('Page.addScriptToEvaluateOnNewDocument',{source:fitScript},session);},
    async mediaCapabilities(){
        this.requireAllowed();if(!this.session)throw new Error('Zuerst eine HTTPS-Webseite öffnen');
        const r=await this.send('Runtime.evaluate',{expression:'(async()=>{const v=document.createElement("video"),result={secure:isSecureContext,h264:!!v.canPlayType(\'video/mp4; codecs="avc1.42E01E"\'),vp9:!!v.canPlayType(\'video/webm; codecs="vp9"\'),widevine:false};if(navigator.requestMediaKeySystemAccess){try{await Promise.race([navigator.requestMediaKeySystemAccess("com.widevine.alpha",[{initDataTypes:["cenc"],videoCapabilities:[{contentType:\'video/mp4; codecs="avc1.42E01E"\'}]}]),new Promise((_,reject)=>setTimeout(reject,3500))]);result.widevine=true;}catch(e){}}return JSON.stringify(result);})()',awaitPromise:true,returnByValue:true});
        return Object.assign(JSON.parse(r.result.value),{mediaEnabled:!this.options.mediaDisabled});
    },
    async inspectMedia(){
        if(!this.session||this.mediaQuery)return;
        const view=this.pageGeneration;this.mediaQuery=true;
        try{const r=await this.send('Runtime.evaluate',{expression:snapshot,returnByValue:true});
            if(view!==this.pageGeneration)return;
            const state=JSON.parse(r.result.value),key=JSON.stringify(state);
            if(key!==this.lastMedia){this.lastMedia=key;this.emit('media',state);}
        }catch(e){}finally{this.mediaQuery=false;}
    },
    async mediaAction(action){
        this.requireAllowed();
        const actions={toggle:'if(v.paused)await v.play();else v.pause();',back:'v.currentTime=Math.max(0,v.currentTime-10);',forward:'const end=Number.isFinite(v.duration)?v.duration:v.seekable.length?v.seekable.end(v.seekable.length-1):v.currentTime;v.currentTime=Math.max(0,Math.min(Math.max(0,end-0.05),v.currentTime+10));',mute:'v.muted=!v.muted;',exit:'await document.exitFullscreen();'};
        if(!Object.prototype.hasOwnProperty.call(actions,action))throw new Error('Unbekannte Videoaktion');
        if(this.options.mediaDisabled&&action!=='exit')throw new Error('Medienwiedergabe ist derzeit deaktiviert');
        const result=await this.send('Runtime.evaluate',{expression:'(async()=>{'+locate+'if(!v)return false;'+actions[action]+'return true;})()',awaitPromise:true,returnByValue:true,userGesture:true});
        if(result.exceptionDetails||!result.result||result.result.value!==true)throw new Error('Videoaktion auf dieser Seite nicht verfuegbar');
        await this.inspectMedia();
    }
};
