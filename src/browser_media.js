'use strict';
// Fixed expressions only: no page-provided scripts, selectors or input values.
const locate='const f=document.fullscreenElement,vs=f?(f.tagName==="VIDEO"?[f]:Array.from(f.querySelectorAll("video"))):[],v=vs.find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0)||vs[0];';
const playerLocate='const deepBudgets=new Map();const deep=(scope,selector)=>{let deepBudget=deepBudgets.has(selector)?deepBudgets.get(selector):6000;const queue=[scope].concat(scope.shadowRoot?[scope.shadowRoot]:[]),seen=new Set(),found=[];let roots=0;while(queue.length&&roots++<16&&deepBudget>0&&found.length<64){const r=queue.shift();if(seen.has(r))continue;seen.add(r);const doc=r.ownerDocument||r,walker=doc.createTreeWalker(r,1);let e,visited=0;while((e=walker.nextNode())&&visited++<3000&&deepBudget-->0&&found.length<64){if(e.matches(selector))found.push(e);if(e.shadowRoot)queue.push(e.shadowRoot);if(e.tagName==="IFRAME"){try{if(e.contentDocument)queue.push(e.contentDocument);}catch(ignore){}}}}deepBudgets.set(selector,deepBudget);return found;};const f=document.fullscreenElement,scope=f||document,hosts=deep(scope,"disney-web-player,disney-web-player-ui,hive-video").concat(f&&/^(DISNEY-WEB-PLAYER|HIVE-VIDEO)$/.test(f.tagName)?[f]:[]),customRoot=hosts.find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0),vs=deep(scope,"video").concat(f&&f.tagName==="VIDEO"?[f]:[]),v=vs.filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];let root=f||customRoot&&customRoot.parentElement||v&&v.parentElement;for(let i=0;!f&&root&&root!==document.body&&i<12&&hosts.some(h=>!root.contains(h));i++)root=root.parentElement;for(let i=0;!f&&!customRoot&&root&&root!==document.body&&i<16&&deep(root,"button,[role=button],[tabindex]").length<2;i++)root=root.parentElement;';
const snapshot='JSON.stringify((()=>{'+playerLocate+'const media=v||customRoot,rect=media&&media.getBoundingClientRect(),playerMode=!!media&&(!!f||rect.width*rect.height>innerWidth*innerHeight*0.3),buttons=root?deep(root,"button,[role=button],[tabindex]").filter(b=>!b.disabled):[],mediaButtons=buttons.filter(b=>/play|pause|wiederg|abspiel|mute|stumm|fullscreen|vollbild|seek|rewind|forward/i.test([b.getAttribute("aria-label"),b.title,b.getAttribute("data-testid")].join(" "))),dedicatedPlayer=!!root&&root!==v&&!/^(BODY|HTML)$/.test(root.tagName),customSiteControls=!!media&&((dedicatedPlayer&&buttons.length>=2)||mediaButtons.length>=2||(mediaButtons.length>0&&!!root.querySelector("input[type=range],[role=slider]"))),hasSiteControls=!!media&&((v&&v.controls)||customSiteControls);return {fullscreen:!!f&&!!media,customPlayer:!!customRoot,rootTag:root&&root.tagName||"",playerMode,hasSiteControls,customSiteControls,controlCount:buttons.length,paused:v?!!v.paused:true,muted:v?!!v.muted:false,currentTime:v&&Number.isFinite(v.currentTime)?v.currentTime:0,duration:v&&Number.isFinite(v.duration)?v.duration:0};})())';
const fitScript='document.addEventListener("fullscreenchange",()=>{if(document.getElementById("mgu-video-fit"))return;const s=document.createElement("style");s.id="mgu-video-fit";s.textContent=":fullscreen video,video:fullscreen{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center!important;transform:none!important;}:fullscreen button:focus,:fullscreen [role=button]:focus,:fullscreen [tabindex]:focus{outline:3px solid #78bfff!important;outline-offset:3px!important;}";document.documentElement.appendChild(s);});';
module.exports={
    mediaTask(task){
        const context=this.mediaContext(),work=(this.mediaQueue||Promise.resolve()).catch(()=>{}).then(()=>{if(!context.valid())throw new Error('Webseite hat gewechselt');return task(context);});
        this.mediaQueue=work.catch(()=>{});return work;
    },
    focusMediaControl(delta){return this.mediaTask(context=>this._focusMediaControl(delta,context));},
    pressMediaControl(){return this.mediaTask(context=>this._pressMediaControl(context));},
    mediaContext(){
        const pipe=this.pipe,session=this.session,view=this.pageGeneration;
        const valid=()=>pipe&&this.pipe===pipe&&session&&this.session===session&&view===this.pageGeneration;
        return {valid,session,view,send:async(method,params,timeout)=>{this.requireAllowed();if(!valid())throw new Error('Webseite hat gewechselt');const result=await pipe.send(method,params,session,timeout);if(!valid())throw new Error('Webseite hat gewechselt');return result;}};
    },
    installVideoFit(session){return this.pipe.send('Page.addScriptToEvaluateOnNewDocument',{source:fitScript},session);},
    async mediaCapabilities(){
        const context=this.mediaContext();this.requireAllowed();if(!this.session)throw new Error('Zuerst eine HTTPS-Webseite öffnen');
        const r=await context.send('Runtime.evaluate',{expression:'(async()=>{const v=document.createElement("video"),result={secure:isSecureContext,h264:!!v.canPlayType(\'video/mp4; codecs="avc1.42E01E"\'),vp9:!!v.canPlayType(\'video/webm; codecs="vp9"\'),widevine:false};if(navigator.requestMediaKeySystemAccess){try{await Promise.race([navigator.requestMediaKeySystemAccess("com.widevine.alpha",[{initDataTypes:["cenc"],videoCapabilities:[{contentType:\'video/mp4; codecs="avc1.42E01E"\'}]}]),new Promise((_,reject)=>setTimeout(reject,3500))]);result.widevine=true;}catch(e){}}return JSON.stringify(result);})()',awaitPromise:true,returnByValue:true});
        return Object.assign(JSON.parse(r.result.value),{mediaEnabled:!this.options.mediaDisabled});
    },
    async inspectMedia(){
        if(!this.session||this.mediaQuery)return;
        const view=this.pageGeneration,session=this.session,context=this.mediaContext();this.mediaQuery=true;if(this.mediaAXGeneration!==view){this.mediaAXGeneration=view;this.mediaAXStamp=0;this.mediaAXCache=[];}
        try{const r=await context.send('Runtime.evaluate',{expression:snapshot,returnByValue:true});
            if(view!==this.pageGeneration||session!==this.session)return;
            const state=JSON.parse(r.result.value);
            if(state.playerMode&&state.customPlayer&&!state.hasSiteControls){
                const stamp=Date.now();if(!this.mediaAXStamp||stamp-this.mediaAXStamp>3000){this.mediaAXStamp=stamp;this.mediaAXCache=await this.accessibleMediaControls(context);}const candidates=this.mediaAXCache||[];if(view!==this.pageGeneration||session!==this.session)return;
                state.accessibleControls=candidates.length;
                if(candidates.length>=2){state.hasSiteControls=true;state.customSiteControls=true;}
            }
            if(this.siteControlsGeneration!==view){this.siteControlsGeneration=view;this.mediaHadCustomControls=false;this.mediaWasFullscreen=false;}
            if(this.mediaWasFullscreen&&!state.fullscreen)this.mediaHadCustomControls=false;
            this.mediaWasFullscreen=!!state.fullscreen;
            this.mediaHadCustomControls=!!state.playerMode&&(this.mediaHadCustomControls||!!state.customSiteControls);
            state.hasSiteControls=!!state.hasSiteControls||this.mediaHadCustomControls;
            const key=JSON.stringify(state);
            if(key!==this.lastMedia){this.lastMedia=key;this.emit('media',state);}
        }catch(e){}finally{this.mediaQuery=false;}
    },
    async accessibleMediaControls(context){
        context=context||this.mediaContext();const result=await context.send('Accessibility.getFullAXTree',{depth:12},3000);
        const buttons=(result.nodes||[]).filter(n=>!n.ignored&&n.backendDOMNodeId&&/^(button|slider)$/.test(n.role&&n.role.value||'')&&/play|pause|wiederg|abspiel|mute|stumm|full.?screen|vollbild|seek|rewind|forward|sekunden|seconds|untertitel|subtitle|audio|settings|einstellungen|skip|überspring/i.test(n.name&&n.name.value||''));
        const candidates=[];
        for(const node of buttons.slice(0,40)){try{const r=await context.send('DOM.getBoxModel',{backendNodeId:node.backendDOMNodeId}),b=r.model.border,x=Math.min(b[0],b[2],b[4],b[6]),y=Math.min(b[1],b[3],b[5],b[7]);if(r.model.width>0&&r.model.height>0&&x>=0&&x<this.viewport.width&&y>=this.viewport.height*.45&&y<this.viewport.height)candidates.push({node:node.backendDOMNodeId,name:node.name.value,x,y});}catch(e){}}
        if(!context.valid())throw new Error("Webseite hat gewechselt");return candidates.sort((a,b)=>a.x-b.x);
    },
    async focusAccessibleMediaControl(delta,context){
        context=context||this.mediaContext();const candidates=await this.accessibleMediaControls(context);if(!candidates.length)throw new Error('Video-Steuerung noch nicht auswählbar');
        let index=candidates.findIndex(c=>this.focusedMediaControl&&c.node===this.focusedMediaControl.node);index=index<0?(delta<0?candidates.length-1:0):(index+delta%candidates.length+candidates.length)%candidates.length;
        if(this.focusedMediaObject){try{await context.send('Runtime.callFunctionOn',{objectId:this.focusedMediaObject,functionDeclaration:'function(){this.removeAttribute("data-mgu-media-focus");}'});await context.send('Runtime.releaseObject',{objectId:this.focusedMediaObject});}catch(e){}}
        const chosen=candidates[index],resolved=await context.send('DOM.resolveNode',{backendNodeId:chosen.node}),objectId=resolved.object.objectId;
        await context.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){this.focus({preventScroll:true});this.setAttribute("data-mgu-media-focus","");const r=this.getRootNode();if(!r.querySelector("#mgu-control-focus")){const s=document.createElement("style");s.id="mgu-control-focus";s.textContent="[data-mgu-media-focus]{outline:3px solid #78bfff!important;outline-offset:3px!important;}";(r.nodeType===9?document.documentElement:r).appendChild(s);}}'});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        this.focusedMediaControl=Object.assign({generation:context.view,session:context.session},chosen);this.focusedMediaObject=objectId;return {focused:true};
    },
    async _focusMediaControl(delta,context){
        this.requireAllowed();await this.mediaAction('reveal');
        const step=Math.max(-20,Math.min(20,Math.trunc(Number(delta)||1)));
        const r=await context.send('Runtime.evaluate',{expression:'(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+playerLocate+'if(!root||(!v&&!customRoot))return false;if(root===v&&v.controls)return "native";const all=deep(root,"button,[role=button],[tabindex],input[type=range]"),controls=all.filter(e=>!e.disabled&&e!==v&&e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden"&&!all.some(c=>c!==e&&e.contains(c)));if(!controls.length)return false;let active=document.activeElement;for(let i=0;active&&i<12;i++){const next=active.shadowRoot&&active.shadowRoot.activeElement||active.tagName==="IFRAME"&&active.contentDocument&&active.contentDocument.activeElement;if(!next)break;active=next;}let index=controls.findIndex(e=>e.hasAttribute("data-mgu-media-focus"));if(index<0)index=controls.findIndex(e=>e===active);if(index<0)index=controls.findIndex(e=>e.contains(active));index=index<0?('+step+'<0?controls.length-1:0):(index+'+step+'%controls.length+controls.length)%controls.length;const e=controls[index];if(e.tabIndex<0)e.tabIndex=0;e.focus({preventScroll:true});controls.forEach(n=>n.removeAttribute("data-mgu-media-focus"));e.setAttribute("data-mgu-media-focus","");const styleRoot=e.getRootNode();if(!styleRoot.querySelector("#mgu-control-focus")){const style=document.createElement("style");style.id="mgu-control-focus";style.textContent="[data-mgu-media-focus]{outline:3px solid #78bfff!important;outline-offset:3px!important;}";(styleRoot.nodeType===9?document.documentElement:styleRoot).appendChild(style);}return true;})()',awaitPromise:true,returnByValue:true});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        if(r.result.value==='native')return this.key('Tab',step<0);
        if(r.result.value!==true)return this.focusAccessibleMediaControl(step,context);
        this.focusedMediaControl=null;
        return {focused:true};
    },
    async _pressMediaControl(context){
        const selected=this.focusedMediaControl;this.requireAllowed();
        if(selected&&selected.generation===this.pageGeneration&&selected.session===this.session){
            const chosen=(await this.accessibleMediaControls(context)).find(c=>c.node===selected.node);if(!chosen)throw new Error('Video-Schaltfläche erneut auswählen');
            const r=await context.send('DOM.resolveNode',{backendNodeId:chosen.node});await context.send('Runtime.callFunctionOn',{objectId:r.object.objectId,functionDeclaration:'function(){this.click();}',userGesture:true});return {pressed:true};
        }
        const r=await context.send('Runtime.evaluate',{expression:'(()=>{'+playerLocate+'if(root===v&&v&&v.controls)return "native";let e=document.activeElement;for(let i=0;e&&i<12;i++){const next=e.shadowRoot&&e.shadowRoot.activeElement||e.tagName==="IFRAME"&&e.contentDocument&&e.contentDocument.activeElement;if(!next)break;e=next;}if(!root)return false;const controls=deep(root,"button,[role=button],[tabindex],input[type=range]");e=controls.find(n=>n.hasAttribute("data-mgu-media-focus"))||e;if(!e||!controls.includes(e)||e.disabled||!e.getClientRects().length)return false;if(e.tagName==="INPUT"&&e.type==="range"){e.stepUp();e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}else e.click();return true;})()',returnByValue:true,userGesture:true});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        if(r.result.value==='native')return this.key('Enter');
        if(r.result.value!==true)throw new Error('Zuerst eine Video-Schaltfläche auswählen');
        return {pressed:true};
    },
    async mediaAction(action){
        const context=this.mediaContext();this.requireAllowed();
        if(action==='reveal')return context.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:this.viewport.width/2,y:Math.max(1,this.viewport.height-50)});
        const actions={toggle:'if(v.paused)await v.play();else v.pause();',back:'v.currentTime=Math.max(0,v.currentTime-10);',forward:'const end=Number.isFinite(v.duration)?v.duration:v.seekable.length?v.seekable.end(v.seekable.length-1):v.currentTime;v.currentTime=Math.max(0,Math.min(Math.max(0,end-0.05),v.currentTime+10));',mute:'v.muted=!v.muted;',exit:'await document.exitFullscreen();'};
        if(!Object.prototype.hasOwnProperty.call(actions,action))throw new Error('Unbekannte Videoaktion');
        if(this.options.mediaDisabled&&action!=='exit')throw new Error('Medienwiedergabe ist derzeit deaktiviert');
        const expression=action==='exit'?'(async()=>{if(!document.fullscreenElement)return false;await document.exitFullscreen();return true;})()':'(async()=>{'+locate+'if(!v)return false;'+actions[action]+'return true;})()';
        const result=await context.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
        if(result.exceptionDetails||!result.result||result.result.value!==true)throw new Error('Videoaktion auf dieser Seite nicht verfuegbar');
        await this.inspectMedia();
    }
};
