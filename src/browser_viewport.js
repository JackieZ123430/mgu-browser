'use strict';
// Native browser zoom keeps layout, OOPIF hit testing and raster resolution in
// Chromium's own zoom machinery. The fixed internal target is never exposed by
// IPC, included in the user's tabs, or given page-controlled code/addresses.
const SETTINGS='chrome://settings/appearance';
const LAYOUT='({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})';
const WORLD='mgu-browser-viewport';
function current(view){const v=view||{width:960,height:540};return {width:v.width,height:v.height,pixelWidth:v.pixelWidth||v.width,pixelHeight:v.pixelHeight||v.height,zoom:v.zoom||100};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,15));
function liveSession(browser,session){return !browser.tabs||browser.tabs.some(tab=>tab.session===session&&tab.detachedSession!==session);}
function contextCurrent(browser,context){return !!(context&&browser.pipe===context.pipe&&!context.pipe.closed&&browser.epoch===context.epoch&&browser.session===context.session&&browser.target===context.target&&browser.pageGeneration===context.view&&liveSession(browser,context.session)&&browser.gate.check().allowed);}
function armReapply(browser,state){
    if(browser.nativeViewportReapply!==state||state.timer||state.work||!state.pending)return;
    state.timer=setTimeout(()=>{
        state.timer=null;const context=state.pending;state.pending=null;
        if(browser.nativeViewportReapply!==state)return;
        if(!contextCurrent(browser,context)){browser.nativeViewportReapply=null;return;}
        state.work=true;
        // Resolve dimensions inside the input queue, after any explicit user
        // zoom/resize already queued ahead of this automatic reapplication.
        const work=module.exports.resize.call(browser,null,null,null,true);
        const finish=()=>{state.work=false;if(browser.nativeViewportReapply!==state)return;if(state.pending)armReapply(browser,state);else browser.nativeViewportReapply=null;};
        work.then(finish,error=>{if(contextCurrent(browser,context))browser.emit('diagnostic','Browserdarstellung nach Navigation noch nicht bereit');finish();});
    },16);
}
async function nativeZoom(pipe,factor,check){
    let target;
    const send=async(method,params,session)=>{check();const result=await pipe.send(method,params,session,1500);check();return result;};
    try{
        check();const created=await pipe.send('Target.createTarget',{url:SETTINGS,background:true},null,1500);target=created.targetId;check();
        const attached=await send('Target.attachToTarget',{targetId:target,flatten:true}),session=attached.sessionId;await send('Runtime.enable',{},session);
        const deadline=Date.now()+1500;let ready=false;
        while(Date.now()<deadline){
            try{const result=await send('Runtime.evaluate',{expression:'!!(window.chrome&&chrome.settingsPrivate&&chrome.settingsPrivate.setDefaultZoom)',returnByValue:true},session);ready=!!(result.result&&result.result.value);}
            catch(error){check();if(!/Cannot find default execution context|Execution context was destroyed|Cannot find context/.test(error.message))throw error;}
            if(ready)break;await pause();
        }
        if(!ready)throw Error('Native Browserzoom ist nicht verfuegbar');
        const result=await send('Runtime.evaluate',{expression:'chrome.settingsPrivate.setDefaultZoom('+factor+');true',returnByValue:true},session);
        if(result.exceptionDetails||!result.result||result.result.value!==true)throw Error('Native Browserzoom konnte nicht gesetzt werden');
    }finally{if(target&&!pipe.closed)await pipe.send('Target.closeTarget',{targetId:target},null,1500).catch(()=>{});}
}
module.exports={
    scheduleReapply(){
        if(!this.pipe||!this.session||!this.gate.check().allowed)return;
        const context={pipe:this.pipe,epoch:this.epoch,session:this.session,target:this.target,view:this.pageGeneration};
        const state=this.nativeViewportReapply||(this.nativeViewportReapply={timer:null,work:false,pending:null});
        state.pending=context;
        if(state.timer){clearTimeout(state.timer);state.timer=null;}armReapply(this,state);
    },
    cancelReapply(){const state=this.nativeViewportReapply;if(!state)return;clearTimeout(state.timer);state.timer=null;state.pending=null;this.nativeViewportReapply=null;},
    inputParams(view,method,params){
        if(!params||method!=='Input.dispatchMouseEvent'||params.type!=='mouseWheel')return params;
        const scale=(view&&view.zoom||100)/100;if(scale===1)return params;
        // Native CDP pointer positions are CSS pixels. Wheel distances are
        // device-independent pixels, so convert only their distances.
        return Object.assign({},params,{deltaX:params.deltaX*scale,deltaY:params.deltaY*scale});
    },
    resize(pixelWidth,pixelHeight,zoom,reapply){
        try{
            this.requireAllowed();if(!reapply){if(zoom===undefined)zoom=100;
            if(!Number.isInteger(pixelWidth)||!Number.isInteger(pixelHeight)||pixelWidth<640||pixelWidth>1280||pixelHeight<200||pixelHeight>720||![100,125,150].includes(zoom))throw Error('Ungueltige Browsergroesse');}
        }catch(error){return Promise.reject(error);}
        const pipe=this.pipe,session=this.session,epoch=this.epoch,view=this.pageGeneration;
        const valid=()=>this.pipe===pipe&&!pipe.closed&&this.session===session&&this.epoch===epoch&&this.pageGeneration===view&&liveSession(this,session);
        const check=()=>{this.requireAllowed();if(!pipe||!session||!valid())throw Error('Webseite wurde gewechselt');};
        const send=async(method,params)=>{check();const result=await pipe.send(method,params,session,1500);check();return result;};
        const run=async()=>{
            if(reapply){const requested=current(this.viewport);pixelWidth=requested.pixelWidth;pixelHeight=requested.pixelHeight;zoom=requested.zoom;}
            check();const previous=current(this.viewport),factor=zoom/100;let changedZoom=false,applied=false;
            const world=async()=>{const cached=this.nativeViewportContext;if(cached&&cached.epoch===epoch&&cached.session===session&&cached.view===view&&cached.frames===(this.inputFrameGeneration||0))return cached.id;const tree=await send('Page.getFrameTree',{});if(!tree.frameTree||!tree.frameTree.frame)throw Error('Browserrahmen fehlt');const created=await send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:WORLD});this.nativeViewportContext={epoch,session,view,frames:this.inputFrameGeneration||0,id:created.executionContextId};return created.executionContextId;};
            const read=async()=>{const deadline=Date.now()+1500;for(;;){try{const result=await send('Runtime.evaluate',{expression:LAYOUT,contextId:await world(),returnByValue:true});if(result.exceptionDetails||!result.result||!result.result.value)throw Error('Browsergroesse konnte nicht gelesen werden');return result.result.value;}catch(error){check();if(Date.now()>=deadline||!/Cannot find default execution context|Execution context was destroyed|Cannot find context/.test(error.message))throw error;this.nativeViewportContext=null;await pause();}}};
            const ready=async(width,height,level)=>{const deadline=Date.now()+1500;while(Date.now()<deadline){const value=await read();if(value.width===Math.round(width*100/level)&&value.height===Math.round(height*100/level)&&Math.abs(value.dpr-level/100)<0.000001)return value;await pause();}throw Error('Native Browsergroesse wurde nicht uebernommen');};
            try{
                if(reapply)await send('Page.bringToFront');
                if(this.nativeViewportEpoch!==epoch){this.nativeViewportEpoch=epoch;this.nativeViewportSessions=new Set();}
                const sessions=this.nativeViewportSessions,live=new Set((this.tabs||[{session}]).map(tab=>tab.session));for(const entry of sessions)if(!live.has(entry))sessions.delete(entry);
                if(!sessions.has(session)){await send('Emulation.clearDeviceMetricsOverride');sessions.add(session);}
                const initial=await read();if(Math.abs(initial.dpr-factor)>0.000001){changedZoom=true;await nativeZoom(pipe,factor,check);}
                applied=true;
                await send('Emulation.setVisibleSize',{width:pixelWidth,height:pixelHeight});
                const actual=await ready(pixelWidth,pixelHeight,zoom),next={width:actual.width,height:actual.height,pixelWidth,pixelHeight,zoom};
                if(reapply){
                    // Complete the new view's compositor surface before
                    // rearming its stream, including cold OOPIF hit testing.
                    // The readback is discarded; projection keeps quality75.
                    await send('Page.captureScreenshot',{format:'jpeg',quality:10,fromSurface:true,captureBeyondViewport:false});
                    await send('Page.stopScreencast');
                    await send('Page.startScreencast',{format:this.performance&&this.performance.codec==='jpeg-native'?'jpeg':'png',quality:75,maxWidth:1280,maxHeight:720,everyNthFrame:1})
                        .catch(error=>{if(!/Screencast is already active/i.test(error&&error.message))throw error;});
                }
                if(previous.width!==next.width||previous.height!==next.height||previous.pixelWidth!==pixelWidth||previous.pixelHeight!==pixelHeight||previous.zoom!==zoom)this.inputFrameGeneration=(this.inputFrameGeneration||0)+1;
                this.viewport=next;this.emit('viewport',Object.assign({},next));return Object.assign({},next);
            }catch(error){
                // A close or renderer detach can cancel the compositor
                // readback before selection advances to its replacement.
                // Never roll back or stop the browser for that retired view.
                if((applied||changedZoom)&&valid()&&this.gate.check().allowed){
                    try{if(changedZoom)await nativeZoom(pipe,previous.zoom/100,check);await send('Emulation.setVisibleSize',{width:previous.pixelWidth,height:previous.pixelHeight});await ready(previous.pixelWidth,previous.pixelHeight,previous.zoom);}
                    catch(ignore){if(valid()&&typeof this.stop==='function')this.stop('Browsergroesse konnte nicht wiederhergestellt werden');}
                }
                throw error;
            }
        };
        // A click or key queued after zoom must use the resulting CSS viewport.
        const work=(this.inputQueue||Promise.resolve()).catch(()=>{}).then(run);this.inputQueue=work;return work;
    }
};
