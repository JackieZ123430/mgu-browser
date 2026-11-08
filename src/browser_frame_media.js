'use strict';
// Passive media inspection in verified embedded renderer sessions. These are
// ordinary related CDP targets; the website's same-origin policy stays intact.
const LIMIT=16;
const Viewport=require('./browser_viewport');
function same(a,b){return !!(a&&b&&a.session===b.session&&a.target===b.target&&a.mainSession===b.mainSession&&a.epoch===b.epoch&&a.generation===b.generation);}
const fullscreenNode='(()=>{let f=document.fullscreenElement;for(let i=0;f&&i<8;i++){let next=f.shadowRoot&&f.shadowRoot.fullscreenElement;try{next=next||f.contentDocument&&f.contentDocument.fullscreenElement;}catch(ignore){}if(!next)break;f=next;}return f;})()';
module.exports={
    mediaFrameValid(frame){return !!(this.frameOwner&&same(frame,this.frameOwner(frame.session))&&frame.epoch===this.epoch);},
    selectedMediaFrame(){
        const frame=this.activeMediaFrame||this.inlineMediaFrame;
        return frame&&frame.mainSession===this.session&&this.mediaFrameValid(frame)?frame:null;
    },
    childMediaContext(parent,frame,selected){
        const pipe=this.pipe,captured=Object.assign({},frame);
        const valid=()=>parent.valid()&&this.pipe===pipe&&this.mediaFrameValid(captured)&&(!selected||same(captured,this.selectedMediaFrame()));
        return {session:captured.session,ownerSession:captured.mainSession,view:parent.view,deadline:parent.deadline,frame:captured,valid,send:async(method,params,timeout)=>{
            this.requireAllowed();if(!valid())throw Error('Eingebettete Webseite hat gewechselt');
            const requested=timeout||(selected?10000:1000),remaining=parent.deadline?Math.max(1,parent.deadline-Date.now()):requested;
            const result=await pipe.send(method,Viewport.inputParams(this.viewport,method,params),captured.session,Math.min(requested,selected?requested:1000,remaining));
            if(!valid())throw Error('Eingebettete Webseite hat gewechselt');return result;
        }};
    },
    clearFrameMedia(session){
        const cache=this.mediaFrameCache;
        if(cache)for(const [key,record] of cache)if(session===undefined||key===session||record.frame.mainSession===session)cache.delete(key);
        for(const name of ['activeMediaFrame','inlineMediaFrame'])if(this[name]&&(session===undefined||this[name].session===session||this[name].mainSession===session))this[name]=null;
        const fullscreen=this.fullscreenMediaOwner;
        if(fullscreen&&(session===undefined||fullscreen.session===session)){
            this.fullscreenMediaOwner=null;fullscreen.pipe.send('Runtime.releaseObject',{objectId:fullscreen.objectId},fullscreen.session,1000).catch(()=>{});
        }
    },
    async fullscreenMediaFrameId(context,state){
        if(!state.fullscreen){
            const old=this.fullscreenMediaOwner;if(old){this.fullscreenMediaOwner=null;old.pipe.send('Runtime.releaseObject',{objectId:old.objectId},old.session,1000).catch(()=>{});}return null;
        }
        let cached=this.fullscreenMediaOwner;
        if(cached&&(cached.pipe!==this.pipe||cached.session!==context.session||cached.view!==context.view)){
            this.fullscreenMediaOwner=null;cached.pipe.send('Runtime.releaseObject',{objectId:cached.objectId},cached.session,1000).catch(()=>{});cached=null;
        }
        if(cached){
            try{const current=await context.send('Runtime.callFunctionOn',{objectId:cached.objectId,functionDeclaration:'function(){return this.isConnected&&this===('+fullscreenNode+');}',returnByValue:true},1000);if(current.result&&current.result.value===true)return cached.frameId;}catch(ignore){}
            this.fullscreenMediaOwner=null;cached.pipe.send('Runtime.releaseObject',{objectId:cached.objectId},cached.session,1000).catch(()=>{});
        }
        let objectId;
        try{
            const node=await context.send('Runtime.evaluate',{expression:fullscreenNode,returnByValue:false},1000);objectId=node.result&&node.result.objectId;
            if(!objectId)return null;
            const described=await context.send('DOM.describeNode',{objectId,depth:0},1000),element=described.node;
            if(element&&/^(IFRAME|FRAME)$/.test(element.nodeName)&&typeof element.frameId==='string'){
                this.fullscreenMediaOwner={pipe:this.pipe,session:context.session,view:context.view,objectId,frameId:element.frameId};return element.frameId;
            }
        }catch(ignore){}
        if(objectId)this.pipe.send('Runtime.releaseObject',{objectId},context.session,1000).catch(()=>{});return null;
    },
    async frameMediaActivity(context,state,expression){
        const result={playing:false,audible:false,hasMedia:false,unknown:false,foreground:null};
        if(!this.relatedFrames||!this.frameOwner)return result;
        const deadline=Date.now()+1000,budget={session:context.session,view:context.view,deadline,valid:()=>context.valid()&&Date.now()<deadline,send:async(method,params,timeout)=>{
            if(!budget.valid())throw Error('Embedded media deadline');
            const reply=await context.send(method,params,Math.min(timeout||1000,Math.max(1,deadline-Date.now())));
            if(!budget.valid())throw Error('Embedded media deadline');return reply;
        }};
        const pipe=this.pipe,cache=this.mediaFrameCache||(this.mediaFrameCache=new Map()),frames=[];
        for(const tab of this.tabs||[])for(const frame of this.relatedFrames(tab.session))if(this.mediaFrameValid(frame))frames.push(frame);
        for(const [key,record] of cache)if(!this.mediaFrameValid(record.frame))cache.delete(key);
        if(!frames.length){this.clearFrameMedia(context.session);return result;}
        const fullscreenId=state.fullscreen&&state.fullscreenFrame?await this.fullscreenMediaFrameId(budget,state):null;
        if(!state.fullscreen||!state.fullscreenFrame)await this.fullscreenMediaFrameId(context,{fullscreen:false});
        const score=frame=>(frame.frameId===fullscreenId?100:0)+(frame.mainSession===context.session?20:0)+(cache.get(frame.session)&&cache.get(frame.session).state.audible?40:0);
        frames.sort((a,b)=>score(b)-score(a));let chosen=frames;
        if(frames.length>LIMIT){
            const first=frames.slice(0,LIMIT/2),others=frames.slice(LIMIT/2),at=this.mediaFrameCursor||0;
            chosen=first.concat(Array.from({length:LIMIT/2},(_,i)=>others[(at+i)%others.length]));this.mediaFrameCursor=(at+LIMIT/2)%others.length;result.unknown=true;
        }
        const inline=[];
        await Promise.all(chosen.map(async frame=>{
            const child=this.childMediaContext(budget,frame,false);
            try{
                const response=await child.send('Runtime.evaluate',{expression,returnByValue:true},1000);
                if(response.exceptionDetails||!response.result||typeof response.result.value!=='string')throw Error('Embedded media unavailable');
                const own=JSON.parse(response.result.value),accessible=await this.accessibleMediaActivity(child,own,false,true);
                if(!child.valid()){if(context.valid())result.unknown=true;return;}
                if(!own.domPlayerAccessible&&accessible.primary)for(const name of ['paused','muted','currentTime','duration'])own[name]=accessible.primary[name];
                own.playing=!!(own.playing||accessible.playing);own.audible=!!(own.audible||accessible.audible);own.hasMedia=!!(own.hasMedia||own.playing);
                cache.set(frame.session,{frame:Object.assign({},frame),state:own});
                result.playing=result.playing||own.playing;result.audible=result.audible||own.audible;result.hasMedia=result.hasMedia||own.hasMedia;result.unknown=result.unknown||accessible.unknown;
                if(frame.mainSession===context.session&&own.playerMode){
                    inline.push({frame,state:own});
                    let belongs=frame.frameId===fullscreenId,parent=frame;
                    for(let i=0;!belongs&&parent&&i<16;i++){parent=frames.find(candidate=>candidate.session===parent.parentSession);if(parent&&parent.frameId===fullscreenId)belongs=true;}
                    if(belongs&&(frame.frameId===fullscreenId||own.fullscreen)&&(!result.foreground||own.fullscreen&&!result.foreground.state.fullscreen||own.playing&&!result.foreground.state.playing))result.foreground={frame,state:own};
                }
            }catch(ignore){if(context.valid())result.unknown=true;}
        }));
        if(!context.valid())throw Error('Webseite hat gewechselt');
        this.activeMediaFrame=result.foreground?Object.assign({},result.foreground.frame):null;
        const playing=inline.filter(item=>item.state.playing),single=playing.length===1?playing[0]:inline.length===1?inline[0]:null;
        this.inlineMediaFrame=!state.domPlayerAccessible&&single?Object.assign({},single.frame):null;
        return result;
    }
};
