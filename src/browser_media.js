'use strict';
const DRM=require('./browser_drm');
const Viewport=require('./browser_viewport');
// Fixed expressions only: no page-provided scripts, selectors or input values.
// Search open shadow roots and same-origin frames with a fixed work budget.
const playerLocate=`
const deepRootCache=new Map();
const deep=(scope,selector)=>{
    let roots=deepRootCache.get(scope);
    if(!roots){
        const queue=[scope],seen=new Set();roots=[];let budget=6000;
        while(queue.length&&roots.length<16){
            const root=queue.shift();if(!root||seen.has(root))continue;seen.add(root);roots.push(root);
            // Native selectors find media/frames even after a large page's
            // skeleton or recommendations. Only shadow-host discovery has a
            // JavaScript walk budget; it must never truncate HTML media.
            const frame=e=>{try{if(e.contentDocument)queue.push(e.contentDocument);}catch(ignore){}};
            if(root.tagName==="IFRAME")frame(root);
            const frames=root.querySelectorAll("iframe");for(let i=0;i<frames.length&&i<16;i++)frame(frames[i]);
            if(root.shadowRoot)queue.push(root.shadowRoot);
            const walker=(root.ownerDocument||root).createTreeWalker(root,1);let e,visited=0;
            while((e=walker.nextNode())&&visited++<3000&&budget-->0){if(e.shadowRoot)queue.push(e.shadowRoot);}
        }
        deepRootCache.set(scope,roots);
    }
    const found=[];
    for(const root of roots){
        if(root.nodeType===1&&root.matches(selector))found.push(root);
        const matches=root.querySelectorAll(selector);
        for(let i=0;i<matches.length&&found.length<64;i++)found.push(matches[i]);
        if(found.length>=64)break;
    }
    return found;
};
const visible=e=>{
    if(!e||!e.isConnected||!e.getClientRects().length)return false;
    const r=e.getBoundingClientRect(),w=e.ownerDocument.defaultView,s=w.getComputedStyle(e);
    return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<w.innerWidth&&r.top<w.innerHeight&&s.visibility!=="hidden"&&s.visibility!=="collapse"&&s.display!=="none";
};
const enabled=e=>visible(e)&&!e.disabled&&e.getAttribute("aria-disabled")!=="true"&&!e.closest("[inert],[hidden],[aria-hidden=true]");
const controlSelector="button,[role=button],[tabindex],input[type=range]";
let f=document.fullscreenElement;
for(let i=0;f&&i<8;i++){
    let inner=f.shadowRoot&&f.shadowRoot.fullscreenElement;
    try{inner=inner||f.contentDocument&&f.contentDocument.fullscreenElement;}catch(ignore){}
    if(!inner)break;f=inner;
}
const scope=f||document;
const hosts=deep(scope,"disney-web-player,disney-web-player-ui,hive-video"),customRoot=hosts.find(visible);
const vs=deep(scope,"video"),v=vs.filter(visible).sort((a,b)=>{
    const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
    return br.width*br.height-ar.width*ar.height;
})[0];
let root=f||customRoot&&customRoot.parentElement||v&&v.parentElement;
for(let i=0;!f&&root&&root!==document.body&&i<12&&hosts.some(h=>!root.contains(h));i++)root=root.parentElement;
for(let i=0;!f&&!customRoot&&root&&root!==document.body&&i<16&&deep(root,controlSelector).filter(enabled).length<2;i++)root=root.parentElement;
const controls=root?deep(root,controlSelector).filter(e=>e!==v&&enabled(e)&&!(e.tagName==="INPUT"&&e.type!=="range")&&(e.matches("button,[role=button],input[type=range]")||e.tabIndex>=0)):[];
const domPlayerAccessible=!!v&&(!customRoot||customRoot.contains(v)||(()=>{let node=v;for(let i=0;node&&i<8;i++){node=node.getRootNode().host;if(node===customRoot)return true;}return false;})());
`;
// Inspect only activity in background tabs; retain no page text or addresses.
const activityScript=`JSON.stringify((()=>{
    const queue=[document],seen=new Set();let budget=6000,roots=0,playing=false,audible=false;
    while(queue.length&&roots++<16){
        const root=queue.shift();if(!root||seen.has(root))continue;seen.add(root);
        const media=root.querySelectorAll("video,audio");
        for(let i=0;i<media.length&&i<64;i++){const e=media[i],active=!e.paused&&!e.ended;playing=playing||active;audible=audible||active&&!e.muted&&e.volume>0;}
        if(playing&&audible)return {playing,audible};
        const frames=root.querySelectorAll("iframe");for(let i=0;i<frames.length&&i<16;i++){try{if(frames[i].contentDocument)queue.push(frames[i].contentDocument);}catch(ignore){}}
        const walker=(root.ownerDocument||root).createTreeWalker(root,1);let e;
        while((e=walker.nextNode())&&budget-->0){
            if(e.shadowRoot)queue.push(e.shadowRoot);
        }
    }
    return {playing,audible};
})())`;
const snapshot='JSON.stringify((()=>{'+playerLocate+'const media=v||customRoot,rect=media&&media.getBoundingClientRect(),playerMode=!!media&&(!!f||rect.width*rect.height>innerWidth*innerHeight*0.3),buttons=controls,mediaButtons=buttons.filter(b=>/play|pause|wiederg|abspiel|mute|stumm|fullscreen|vollbild|seek|rewind|forward/i.test([b.getAttribute("aria-label"),b.title,b.getAttribute("data-testid")].join(" "))),dedicatedPlayer=!!root&&root!==v&&!/^(BODY|HTML)$/.test(root.tagName),customSiteControls=!!media&&((dedicatedPlayer&&buttons.length>=2)||mediaButtons.length>=2||(mediaButtons.length>0&&!!root.querySelector("input[type=range],[role=slider]"))),hasSiteControls=!!media&&((v&&v.controls)||customSiteControls),elements=deep(document,"video,audio"),playing=elements.some(e=>!e.paused&&!e.ended),audible=elements.some(e=>!e.paused&&!e.ended&&!e.muted&&e.volume>0);return {hasMedia:elements.length>0||!!customRoot,domPlayerAccessible:domPlayerAccessible,playing,audible,fullscreen:!!f,fullscreenFrame:!!f&&/^(IFRAME|FRAME)$/.test(f.tagName),customPlayer:!!customRoot,rootTag:root&&root.tagName||"",playerMode,hasSiteControls,customSiteControls,controlCount:buttons.length,paused:v?!!v.paused:true,muted:v?!!v.muted:false,currentTime:v&&Number.isFinite(v.currentTime)?v.currentTime:0,duration:v&&Number.isFinite(v.duration)?v.duration:0};})())';
const ownMediaState='function(){if(!this.isConnected||!/^(VIDEO|AUDIO)$/.test(this.tagName))return null;const playing=!this.paused&&!this.ended;let node=this,customPlayer=false;for(let i=0;node&&i<8;i++){node=node.getRootNode().host;if(node&&/^(DISNEY-WEB-PLAYER|DISNEY-WEB-PLAYER-UI|HIVE-VIDEO)$/.test(node.tagName)){customPlayer=true;break;}}return {playing,audible:playing&&!this.muted&&this.volume>0,paused:!!this.paused,muted:!!this.muted,customPlayer,currentTime:Number.isFinite(this.currentTime)?this.currentTime:0,duration:Number.isFinite(this.duration)?this.duration:0};}';
// Keep a site's own video/container geometry. Forcing every nested video to
// absolute 100% dimensions can collapse its zero-height inner layout in native
// player fullscreen. Only a video which is itself fullscreen needs viewport fit.
const fitScript='if(!document.__mguVideoFitInstalled){document.__mguVideoFitInstalled=true;document.addEventListener("fullscreenchange",()=>{if(document.getElementById("mgu-video-fit"))return;const s=document.createElement("style");s.id="mgu-video-fit";s.textContent=":fullscreen video{object-fit:contain!important;object-position:center!important;}video:fullscreen{width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;object-fit:contain!important;object-position:center!important;}:fullscreen button:focus,:fullscreen [role=button]:focus,:fullscreen [tabindex]:focus{outline:3px solid #78bfff!important;outline-offset:3px!important;}";document.documentElement.appendChild(s);});}';
const fullscreenScript='(async()=>{'+playerLocate+`
    if(!v)return false;if(f)return true;
    const doc=v.ownerDocument;
    const known=v.closest("#movie_player,.html5-video-player,.video-js,.jwplayer,.plyr,[data-player]");
    const component=v.getRootNode().host;
    const container=known||root&&root!==doc.body&&root!==doc.documentElement&&root.contains(v)&&root||component||v;
    // Let the provider update its own player state and keep its controls.
    // A video-only request bypasses YouTube's fullscreen mode and overlays.
    const button=deep(container,".ytp-fullscreen-button,.vjs-fullscreen-control,.jw-icon-fullscreen,[data-plyr=fullscreen]").find(enabled);
    if(button){
        button.click();
        for(let i=0;i<5&&!doc.fullscreenElement;i++)await new Promise(resolve=>setTimeout(resolve,40));
        if(doc.fullscreenElement)return true;
    }
    const target=v.controls&&!known&&!component?v:container;
    if(!target||typeof target.requestFullscreen!=="function")return false;
    await target.requestFullscreen();return !!doc.fullscreenElement;
})()`;
module.exports={
    clearAccessibleMedia(session,objectsOnly){
        if(!objectsOnly&&this.clearFrameMedia)this.clearFrameMedia(session);
        const cache=this.accessibleMediaCache;if(!cache)return;
        for(const [key,record] of cache){
            if(session!==undefined&&key!==session&&!(!objectsOnly&&record.frame&&record.frame.mainSession===session))continue;
            cache.delete(key);
            record.pipe.send('Runtime.releaseObjectGroup',{objectGroup:record.group},key,1000).catch(()=>{});
        }
    },
    async accessibleMediaActivity(context,state,retried,onlySession){
        const cache=this.accessibleMediaCache||(this.accessibleMediaCache=new Map()),pipe=this.pipe;
        const tabs=this.tabs||[],eligible=state.customPlayer&&state.domPlayerAccessible!==true;
        const live=record=>context.valid()&&this.pipe===pipe&&cache.get(record.session)===record&&tabs.indexOf(record.tab)>=0&&(!record.frame||this.mediaFrameValid(record.frame));
        for(const [session,record] of cache)if(record.pipe!==pipe||tabs.indexOf(record.tab)<0||record.frame&&!this.mediaFrameValid(record.frame))this.clearAccessibleMedia(session,true);
        const frame=context.frame,tab=tabs.find(item=>item.session===(frame?frame.mainSession:context.session));let foreground=cache.get(context.session);
        if(foreground&&!foreground.objects.length&&!eligible){this.clearAccessibleMedia(context.session,true);foreground=null;}
        if(eligible&&tab&&(!foreground||!foreground.objects.length&&Date.now()-foreground.scannedAt>=3000)){
            if(foreground)this.clearAccessibleMedia(context.session,true);
            foreground={tab,pipe,session:context.session,frame:frame||null,group:'mgu-media-'+(this.accessibleMediaSequence=(this.accessibleMediaSequence||0)+1),objects:[],scannedAt:Date.now(),unknown:false};
            cache.set(context.session,foreground);
            try{
                // Accessibility exposes media players in closed components.
                // Resolve only those nodes and read their own playback flags;
                // never change shadow-root mode or inspect protected content.
                const tree=await context.send('Accessibility.getFullAXTree',{depth:12},1500);
                const candidates=(tree.nodes||[]).filter(node=>node.backendDOMNodeId&&/^(Video|Audio)$/i.test(node.role&&node.role.value||'')),nodes=candidates.slice(0,8);
                if(candidates.length>8)foreground.unknown=true;
                await Promise.all(nodes.map(async node=>{
                    try{const result=await context.send('DOM.resolveNode',{backendNodeId:node.backendDOMNodeId,objectGroup:foreground.group},1500);
                        if(live(foreground)&&result.object&&result.object.objectId)foreground.objects.push(result.object.objectId);
                    }catch(ignore){foreground.unknown=true;}
                }));
                if(!foreground.objects.length)foreground.unknown=true;
            }catch(ignore){foreground.unknown=true;}
            if(!live(foreground))return {playing:false,audible:false,unknown:true};
        }
        const result={playing:false,audible:false,unknown:false};let rescan=false;
        await Promise.all(Array.from(cache.values()).filter(record=>onlySession?record.session===context.session:!record.frame).map(async record=>{
            if(!live(record))return;let connected=0;
            if(record.unknown)result.unknown=true;
            await Promise.all(record.objects.map(async objectId=>{
                try{
                    const timeout=record.frame?Math.max(1,Math.min(1000,context.deadline?context.deadline-Date.now():1000)):1500;
                    const reply=await pipe.send('Runtime.callFunctionOn',{objectId,functionDeclaration:ownMediaState,returnByValue:true},record.session,timeout);
                    if(!live(record))return;
                    const own=reply.result&&reply.result.value;
                    if(reply.exceptionDetails||!own){result.unknown=true;return;}
                    connected++;result.playing=result.playing||own.playing===true;result.audible=result.audible||own.audible===true;
                    if(record.session===context.session&&(!result.primary||own.customPlayer&&!result.primary.customPlayer||own.customPlayer===result.primary.customPlayer&&own.playing&&!result.primary.playing))result.primary=own;
                }catch(ignore){if(live(record))result.unknown=true;}
            }));
            if(live(record)&&record.objects.length&&!connected){this.clearAccessibleMedia(record.session,true);if(record.session===context.session&&eligible&&!retried)rescan=true;}
        }));
        if(rescan)return this.accessibleMediaActivity(context,state,true,onlySession);
        return result;
    },
    async mediaActivity(context){
        // The foreground snapshot already includes its HTML media. Only query
        // other tabs here; avoid a second full DOM scan and CDP roundtrip for
        // the visible player on every activity poll.
        const tabs=(this.tabs||[]).filter(tab=>tab.session!==context.session).slice(0,7),cache=this.tabMediaActivity||(this.tabMediaActivity=new Map()),pipe=this.pipe;
        let unknown=false;
        await Promise.all(tabs.map(async tab=>{
            try{const r=await pipe.send('Runtime.evaluate',{expression:activityScript,returnByValue:true},tab.session,1500);
                if(context.valid()&&this.tabs.indexOf(tab)>=0){if(r.exceptionDetails)throw Error('Media unavailable');cache.set(tab.session,JSON.parse(r.result.value));}
            }catch(ignore){if(context.valid()&&this.tabs.indexOf(tab)>=0){cache.delete(tab.session);unknown=true;}}
        }));
        if(!context.valid())throw Error('Webseite hat gewechselt');
        const live=tabs.map(t=>t.session);cache.forEach((value,session)=>{if(live.indexOf(session)<0)cache.delete(session);});
        let playing=false,audible=false;cache.forEach(state=>{playing=playing||!!state.playing;audible=audible||!!state.audible;});
        return {playing,audible,unknown};
    },
    webAudioEvent(event){
        const contexts=this.webAudioContexts||(this.webAudioContexts=new Map()),p=event.params||{},context=p.context,owner=this.frameOwner&&this.frameOwner(event.sessionId);
        if((event.method==='WebAudio.contextCreated'||event.method==='WebAudio.contextChanged')&&context&&typeof context.contextId==='string'){
            const key=event.sessionId+':'+context.contextId;
            if(contexts.size<64||contexts.has(key))contexts.set(key,{session:event.sessionId,state:context.contextState,frame:owner&&owner.mainSession!==owner.session?owner:null});
        }else if(event.method==='WebAudio.contextWillBeDestroyed')contexts.delete(event.sessionId+':'+p.contextId);
    },
    webAudioActivity(){
        let running=0;const sessions=this.tabs?this.tabs.map(t=>t.session):[this.session];
        if(this.webAudioContexts)this.webAudioContexts.forEach((context,id)=>{if(context.frame?!this.mediaFrameValid(context.frame):sessions.indexOf(context.session)<0)this.webAudioContexts.delete(id);else if(context.state==='running')running++;});
        return {running};
    },
    mediaTask(task){
        const context=this.mediaContext(),work=(this.mediaQueue||Promise.resolve()).catch(()=>{}).then(()=>{if(!context.valid())throw new Error('Webseite hat gewechselt');return task(context);});
        this.mediaQueue=work.catch(()=>{});return work;
    },
    focusMediaControl(delta){return this.mediaTask(context=>this._focusMediaControl(delta,context));},
    pressMediaControl(){return this.mediaTask(context=>this._pressMediaControl(context));},
    mediaContext(mainOnly){
        const pipe=this.pipe,session=this.session,view=this.pageGeneration;
        const valid=()=>pipe&&this.pipe===pipe&&session&&this.session===session&&view===this.pageGeneration;
        const context={valid,session,view,send:async(method,params,timeout)=>{this.requireAllowed();if(!valid())throw new Error('Webseite hat gewechselt');const result=await pipe.send(method,Viewport.inputParams(this.viewport,method,params),session,timeout);if(!valid())throw new Error('Webseite hat gewechselt');return result;}};
        const frame=!mainOnly&&this.selectedMediaFrame&&this.selectedMediaFrame();return frame?this.childMediaContext(context,frame,true):context;
    },
    async installVideoFit(session){await this.pipe.send('Page.addScriptToEvaluateOnNewDocument',{source:fitScript},session);return this.pipe.send('Runtime.evaluate',{expression:fitScript},session);},
    async mediaCapabilities(){
        const context=this.mediaContext();this.requireAllowed();if(!this.session)throw new Error('Zuerst eine HTTPS-Webseite öffnen');
        const r=await context.send('Runtime.evaluate',{expression:DRM.probeScript,awaitPromise:true,returnByValue:true});
        if(r.exceptionDetails||!r.result||typeof r.result.value!=='string')throw Error('Medienprüfung fehlgeschlagen');
        const result=JSON.parse(r.result.value);result.drm=DRM.status(this.drm,result.drm);
        return Object.assign(result,{mediaEnabled:!this.options.mediaDisabled,audio:typeof this.audioStatus==='function'?this.audioStatus():{configured:false}});
    },
    async inspectMedia(){
        if(!this.session||this.mediaQuery)return;
        const view=this.pageGeneration,session=this.session,pipe=this.pipe,context=this.mediaContext(true);this.mediaQuery=true;if(this.mediaAXGeneration!==view){this.mediaAXGeneration=view;this.mediaAXStamp=0;this.mediaAXCache=[];}
        try{const r=await context.send('Runtime.evaluate',{expression:snapshot,returnByValue:true},1500);
            if(view!==this.pageGeneration||session!==this.session)return;
            const state=JSON.parse(r.result.value),activity=this.webAudioActivity();
            const combined=await Promise.all([this.mediaActivity(context),this.accessibleMediaActivity(context,state),this.frameMediaActivity(context,state,snapshot)]),htmlActivity=combined[0],accessibleActivity=combined[1],frameActivity=combined[2];
            if(!context.valid())return;
            if(!state.domPlayerAccessible&&accessibleActivity.primary){for(const name of ['paused','muted','currentTime','duration'])state[name]=accessibleActivity.primary[name];}
            if(frameActivity.foreground){const child=frameActivity.foreground.state;for(const name of ['playerMode','hasSiteControls','customSiteControls','customPlayer','controlCount','paused','muted','currentTime','duration'])state[name]=child[name];}
            delete state.domPlayerAccessible;delete state.fullscreenFrame;
            state.webAudioRunning=activity.running;state.playing=state.playing||htmlActivity.playing||accessibleActivity.playing||frameActivity.playing||activity.running>0;state.audible=state.audible||htmlActivity.audible||accessibleActivity.audible||frameActivity.audible||activity.running>0;state.hasMedia=state.hasMedia||frameActivity.hasMedia||state.playing;
            state.activityUnknown=!state.audible&&!!(accessibleActivity.unknown||htmlActivity.unknown||frameActivity.unknown);
            if(state.playerMode&&state.customPlayer&&!state.hasSiteControls){
                const frame=frameActivity.foreground&&frameActivity.foreground.frame,controlsContext=frame?this.childMediaContext(context,frame,false):context;
                const controlsKey=frame?frame.session+':'+frame.generation:session+':'+view;
                if(this.mediaAXContext!==controlsKey){this.mediaAXContext=controlsKey;this.mediaAXStamp=0;this.mediaAXCache=[];}
                const stamp=Date.now();if(!this.mediaAXStamp||stamp-this.mediaAXStamp>3000){
                    this.mediaAXStamp=stamp;
                    // Optional control discovery must not invalidate an actual
                    // media snapshot or the media node's confirmed own flags.
                    try{const controls=await this.accessibleMediaControls(controlsContext);if(!controlsContext.valid())throw Error('Media controls changed');this.mediaAXCache=controls;}
                    catch(ignore){if(!context.valid())return;if(frame&&!this.mediaFrameValid(frame))throw Error('Embedded media changed');}
                }
                const candidates=this.mediaAXCache||[];if(!context.valid())return;
                state.accessibleControls=candidates.length;
                if(candidates.length>=2){state.hasSiteControls=true;state.customSiteControls=true;}
            }
            if(this.siteControlsGeneration!==view){this.siteControlsGeneration=view;this.mediaHadCustomControls=false;this.mediaWasFullscreen=false;}
            if(this.mediaWasFullscreen&&!state.fullscreen)this.mediaHadCustomControls=false;
            this.mediaWasFullscreen=!!state.fullscreen;
            this.mediaHadCustomControls=!!state.playerMode&&(this.mediaHadCustomControls||!!state.customSiteControls);
            state.hasSiteControls=!!state.hasSiteControls||this.mediaHadCustomControls;
            this.mediaActivityState={playing:state.playing,audible:state.audible,webAudioRunning:state.webAudioRunning};
            this.lastMediaSession=session;this.lastMediaView=view;this.lastMediaPipe=pipe;
            const key=JSON.stringify(state);
            if(key!==this.lastMedia){this.lastMedia=key;this.emit('media',state);}
        }catch(ignore){
            if(context.valid()){
                // A busy renderer is missing evidence, not fresh silence or
                // fresh sound. Preserve this view's controls, but never carry
                // its last audible flag into navigation/tab reset messages.
                let previous={};
                if(this.lastMediaSession===session&&this.lastMediaView===view&&this.lastMediaPipe===pipe&&this.lastMedia){try{previous=JSON.parse(this.lastMedia)||{};}catch(ignored){}}
                const state=Object.assign({fullscreen:false,hasMedia:false,playerMode:false,paused:true,muted:false},previous,{playing:previous.playing===true,audible:false,webAudioRunning:0,activityUnknown:true});
                this.mediaActivityState={playing:state.playing,audible:false,webAudioRunning:0,activityUnknown:true};
                this.lastMediaSession=session;this.lastMediaView=view;this.lastMediaPipe=pipe;
                const key=JSON.stringify(state);if(key!==this.lastMedia){this.lastMedia=key;this.emit('media',state);}
            }
        }finally{this.mediaQuery=false;}
    },
    async accessibleMediaControls(context){
        context=context||this.mediaContext();const result=await context.send('Accessibility.getFullAXTree',{depth:12},3000);
        const buttons=(result.nodes||[]).filter(n=>!n.ignored&&n.backendDOMNodeId&&!(n.properties||[]).some(p=>p.name==='disabled'&&p.value&&p.value.value===true)&&/^(button|slider)$/.test(n.role&&n.role.value||'')&&/play|pause|wiederg|abspiel|mute|stumm|full.?screen|vollbild|seek|rewind|forward|sekunden|seconds|untertitel|subtitle|audio|settings|einstellungen|skip|überspring/i.test(n.name&&n.name.value||''));
        const candidates=[];
        for(const node of buttons.slice(0,40)){try{const r=await context.send('DOM.getBoxModel',{backendNodeId:node.backendDOMNodeId}),b=r.model.border,x=Math.min(b[0],b[2],b[4],b[6]),y=Math.min(b[1],b[3],b[5],b[7]);if(r.model.width>0&&r.model.height>0&&x>=0&&x<this.viewport.width&&y>=0&&y<this.viewport.height)candidates.push({node:node.backendDOMNodeId,name:node.name.value,x,y});}catch(e){}}
        if(!context.valid())throw new Error("Webseite hat gewechselt");return candidates.sort((a,b)=>a.x-b.x);
    },
    async focusAccessibleMediaControl(delta,context){
        context=context||this.mediaContext();const candidates=await this.accessibleMediaControls(context);if(!candidates.length)throw new Error('Video-Steuerung noch nicht auswählbar');
        let index=candidates.findIndex(c=>this.focusedMediaControl&&c.node===this.focusedMediaControl.node);index=index<0?(delta>0?(delta-1)%candidates.length:(delta%candidates.length+candidates.length)%candidates.length):(index+delta%candidates.length+candidates.length)%candidates.length;
        const previous=this.focusedMediaObjectInfo;
        if(this.focusedMediaObject&&previous&&previous.pipe===this.pipe&&this.mediaFrameValid(previous.owner)){
            try{await previous.pipe.send('Runtime.callFunctionOn',{objectId:this.focusedMediaObject,functionDeclaration:'function(){this.removeAttribute("data-mgu-media-focus");}'},previous.owner.session,1000);if(this.mediaFrameValid(previous.owner))await previous.pipe.send('Runtime.releaseObject',{objectId:this.focusedMediaObject},previous.owner.session,1000);}catch(ignore){}
        }
        const chosen=candidates[index],resolved=await context.send('DOM.resolveNode',{backendNodeId:chosen.node}),objectId=resolved.object.objectId;
        await context.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){this.focus({preventScroll:true});this.setAttribute("data-mgu-media-focus","");const r=this.getRootNode();if(!r.querySelector("#mgu-control-focus")){const s=document.createElement("style");s.id="mgu-control-focus";s.textContent="[data-mgu-media-focus]{outline:3px solid #78bfff!important;outline-offset:3px!important;}";(r.nodeType===9?r.documentElement:r).appendChild(s);}}'});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        this.focusedMediaControl=Object.assign({generation:context.view,session:context.session,frame:context.frame||null},chosen);this.focusedMediaObject=objectId;this.focusedMediaObjectInfo={pipe:this.pipe,owner:this.frameOwner&&this.frameOwner(context.session)};return {focused:true};
    },
    async _focusMediaControl(delta,context){
        this.requireAllowed();await this.mediaAction('reveal');
        const step=Math.max(-20,Math.min(20,Math.trunc(Number(delta)||1)));
        const r=await context.send('Runtime.evaluate',{expression:'(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+playerLocate+'if(!root||(!v&&!customRoot))return false;if(v&&v.controls&&!controls.length){if(document.activeElement!==v)v.focus();return "native";}if(!controls.length)return false;let active=document.activeElement;for(let i=0;active&&i<12;i++){const next=active.shadowRoot&&active.shadowRoot.activeElement||active.tagName==="IFRAME"&&active.contentDocument&&active.contentDocument.activeElement;if(!next)break;active=next;}let index=controls.findIndex(e=>e.hasAttribute("data-mgu-media-focus"));if(index<0)index=controls.findIndex(e=>e===active);if(index<0)index=controls.findIndex(e=>e.contains(active));index=index<0?('+step+'>0?('+step+'-1)%controls.length:('+step+'%controls.length+controls.length)%controls.length):(index+'+step+'%controls.length+controls.length)%controls.length;const e=controls[index];if(e.tabIndex<0)e.tabIndex=0;e.focus({preventScroll:true});controls.forEach(n=>n.removeAttribute("data-mgu-media-focus"));e.setAttribute("data-mgu-media-focus","");const styleRoot=e.getRootNode();if(!styleRoot.querySelector("#mgu-control-focus")){const style=document.createElement("style");style.id="mgu-control-focus";style.textContent="[data-mgu-media-focus]{outline:3px solid #78bfff!important;outline-offset:3px!important;}";(styleRoot.nodeType===9?styleRoot.documentElement:styleRoot).appendChild(style);}return true;})()',awaitPromise:true,returnByValue:true});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        if(r.result.value==='native'){for(let i=0;i<Math.abs(step);i++)await this.key('Tab',step<0);return {focused:true};}
        if(r.result.value!==true)return this.focusAccessibleMediaControl(step,context);
        this.focusedMediaControl=null;
        return {focused:true};
    },
    async _pressMediaControl(context){
        const selected=this.focusedMediaControl;this.requireAllowed();
        if(selected&&selected.generation===this.pageGeneration&&selected.session===context.session&&(!selected.frame||this.mediaFrameValid(selected.frame))){
            const chosen=(await this.accessibleMediaControls(context)).find(c=>c.node===selected.node);if(!chosen)throw new Error('Video-Schaltfläche erneut auswählen');
            const r=await context.send('DOM.resolveNode',{backendNodeId:chosen.node});try{const pressed=await context.send('Runtime.callFunctionOn',{objectId:r.object.objectId,functionDeclaration:'function(){if(!this.isConnected||this.disabled||this.getAttribute("aria-disabled")==="true"||!this.getClientRects().length)return false;if(this.tagName==="INPUT"&&this.type==="range"){this.stepUp();this.dispatchEvent(new Event("input",{bubbles:true}));this.dispatchEvent(new Event("change",{bubbles:true}));}else this.click();return true;}',returnByValue:true,userGesture:true});if(!pressed.result||pressed.result.value!==true)throw new Error('Video-Schaltfläche erneut auswählen');}finally{await context.send('Runtime.releaseObject',{objectId:r.object.objectId}).catch(()=>{});}return {pressed:true};
        }
        const r=await context.send('Runtime.evaluate',{expression:'(()=>{'+playerLocate+'if(v&&v.controls&&!controls.length)return "native";let e=document.activeElement;for(let i=0;e&&i<12;i++){const next=e.shadowRoot&&e.shadowRoot.activeElement||e.tagName==="IFRAME"&&e.contentDocument&&e.contentDocument.activeElement;if(!next)break;e=next;}if(!root)return false;e=deep(root,"[data-mgu-media-focus]")[0]||e;if(!e||!controls.includes(e)||!enabled(e))return false;if(e.tagName==="INPUT"&&e.type==="range"){e.stepUp();e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}else e.click();return true;})()',returnByValue:true,userGesture:true});
        if(!context.valid())throw new Error('Webseite hat gewechselt');
        if(r.result.value==='native')return this.key('Enter');
        if(r.result.value!==true)throw new Error('Zuerst eine Video-Schaltfläche auswählen');
        return {pressed:true};
    },
    async mediaAction(action){
        const context=this.mediaContext(action==='exit');this.requireAllowed();
        if(action==='reveal')return context.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:this.viewport.width/2,y:Math.max(1,this.viewport.height-50)});
        const actions={fullscreen:'',play:'await v.play();',pause:'v.pause();',unmute:'v.muted=false;if(v.volume===0)v.volume=1;',toggle:'if(v.paused)await v.play();else v.pause();',back:'v.currentTime=Math.max(0,v.currentTime-10);',forward:'const end=Number.isFinite(v.duration)?v.duration:v.seekable.length?v.seekable.end(v.seekable.length-1):v.currentTime;v.currentTime=Math.max(0,Math.min(Math.max(0,end-0.05),v.currentTime+10));',mute:'v.muted=!v.muted;',exit:'await document.exitFullscreen();'};
        if(!Object.prototype.hasOwnProperty.call(actions,action))throw new Error('Unbekannte Videoaktion');
        if(this.options.mediaDisabled&&action!=='exit')throw new Error('Medienwiedergabe ist derzeit deaktiviert');
        const expression=action==='fullscreen'?fullscreenScript:action==='exit'?'(async()=>{if(!document.fullscreenElement)return false;await document.exitFullscreen();return true;})()':'(async()=>{'+playerLocate+'const a=v||deep(document,"audio").find(e=>!e.paused)||deep(document,"audio")[0];if(!a)return false;return await(async(v)=>{'+actions[action]+'return true;})(a);})()';
        const result=await context.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
        if(result.exceptionDetails||!result.result||result.result.value!==true)throw new Error('Videoaktion auf dieser Seite nicht verfuegbar');
        await this.inspectMedia();
    }
};

Object.assign(module.exports,require('./browser_frame_media'));
