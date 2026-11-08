'use strict';
// Native Chromium permission decisions, scoped to the actual requesting frame.
// Page bindings ask for UI only; the page never supplies an authoritative origin.
const URL=require('url').URL;
const NAMES=['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write'];
const BINDING='__mguPermissionUIRequest',RESOLVE='__mguPermissionUIResolve';
const bridge='('+function(){
    if(window.__mguPermissionUIInstalled)return;window.__mguPermissionUIInstalled=true;
    const waiting=new Map();let serial=0;
    window.__mguPermissionUIResolve=(id,proceed)=>{const pending=waiting.get(id);if(pending){waiting.delete(id);clearTimeout(pending.timer);pending.resolve(proceed!==false);}};
    const ask=async names=>{
        const required=[];
        for(const name of names){try{const p=await navigator.permissions.query({name});if(p.state==='denied')return true;if(p.state==='prompt')required.push(name);}catch(ignore){return true;}}
        if(!required.length)return true;
        return new Promise(resolve=>{
            const id=++serial,timer=setTimeout(()=>{waiting.delete(id);resolve(false);},35000);
            waiting.set(id,{resolve,timer});
            try{window.__mguPermissionUIRequest(JSON.stringify({id,names:required}));}catch(ignore){clearTimeout(timer);waiting.delete(id);resolve(false);}
        });
    };
    const aborted=()=>new DOMException('The permission request was cancelled','AbortError');
    const cancelledLocation=error=>{if(typeof error==='function')error({code:1,message:'The permission request was cancelled',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});};
    if(navigator.geolocation){
        const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition=function(success,error,options){
            if(typeof success!=='function'||error!=null&&typeof error!=='function')return original(success,error,options);
            ask(['geolocation']).then(proceed=>{if(proceed)original(success,error,options);else cancelledLocation(error);});
        };
        const watch=navigator.geolocation.watchPosition.bind(navigator.geolocation),clear=navigator.geolocation.clearWatch.bind(navigator.geolocation),watches=new Map();let watchSerial=0;
        navigator.geolocation.watchPosition=function(success,error,options){
            if(typeof success!=='function'||error!=null&&typeof error!=='function')return watch(success,error,options);
            const id=++watchSerial,entry={native:null};watches.set(id,entry);
            ask(['geolocation']).then(proceed=>{if(!watches.has(id))return;if(proceed)entry.native=watch(success,error,options);else{watches.delete(id);cancelledLocation(error);}});return id;
        };
        navigator.geolocation.clearWatch=function(id){const token=Number(id)>>>0,entry=watches.get(token);if(entry){watches.delete(token);if(entry.native!==null)clear(entry.native);}else clear(id);};
    }
    if(window.Notification&&typeof Notification.requestPermission==='function'){
        const original=Notification.requestPermission.bind(Notification);
        Notification.requestPermission=function(callback){return ask(['notifications']).then(proceed=>{if(proceed)return original(callback);if(typeof callback==='function')callback('default');return 'default';});};
    }
    if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
        const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=function(constraints){
            const names=[];if(constraints&&constraints.audio)names.push('microphone');if(constraints&&constraints.video)names.push('camera');
            return (names.length?ask(names):Promise.resolve(true)).then(proceed=>{if(!proceed)throw aborted();return original(constraints);});
        };
    }
    if(navigator.clipboard)for(const method of ['read','readText'])if(typeof navigator.clipboard[method]==='function'){
        const original=navigator.clipboard[method].bind(navigator.clipboard);
        navigator.clipboard[method]=function(){return ask(['clipboard-read']).then(proceed=>{if(!proceed)throw aborted();return original();});};
    }
}.toString()+')();';
const statusExpression='(async()=>{const result=[];for(const name of '+JSON.stringify(NAMES)+'){try{const p=await navigator.permissions.query({name});result.push({name,state:p.state});}catch(ignore){result.push({name,state:"unsupported"});}}return result;})()';
function origin(value){
    try{const u=new URL(value);if(u.username||u.password)return null;
        if(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))return u.origin;
    }catch(ignore){}return null;
}
function key(session,id){return session+':'+id;}
function inputFrameChanged(browser,session,frameId){
    const owner=browser.permissionOwner(session),focused=browser.inputFocusedFrame;
    if(owner&&owner.session===browser.session&&(!focused||focused.session===session&&(frameId===undefined||focused.frameId===frameId)))browser.inputFrameGeneration=(browser.inputFrameGeneration||0)+1;
}
function findFrame(tree,id){
    if(tree.frame&&tree.frame.id===id)return tree.frame;
    for(const child of tree.childFrames||[]){const found=findFrame(child,id);if(found)return found;}return null;
}
module.exports={
    async installPermissions(session,pipe){
        pipe=pipe||this.pipe;
        await pipe.send('Page.enable',{},session);
        await pipe.send('Runtime.enable',{},session);
        if(this.installAuth)await this.installAuth(session,pipe);
        if(this.fileEvent)await pipe.send('Page.setInterceptFileChooserDialog',{enabled:true},session);
        await pipe.send('WebAudio.enable',{},session).catch(()=>{});
        await pipe.send('Runtime.addBinding',{name:BINDING},session);
        await pipe.send('Page.addScriptToEvaluateOnNewDocument',{source:bridge},session);
        // Cross-site iframes have separate renderer targets. Pause only those
        // targets briefly while their ordinary permission UI binding is added.
        await pipe.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe',exclude:false},{exclude:true}]},session);
        // An iframe paused before its first document has no default context
        // yet. Its registered new-document script runs when it is resumed.
        await pipe.send('Runtime.evaluate',{expression:bridge},session).catch(error=>{if(!/Cannot find default execution context|Execution context was destroyed|Cannot find context with specified id/.test(error.message))throw error;});
    },
    permissionOwner(session){
        const tabs=this.tabs,tab=tabs&&tabs.find(t=>t.session===session);
        if(tab)return {session:tab.session,target:tab.target};
        const entry=this.permissionFrameOwners&&this.permissionFrameOwners.get(session);
        if(entry&&entry.pipe===this.pipe&&entry.epoch===this.epoch&&tabs&&tabs.some(t=>t.session===entry.owner.session&&t.target===entry.owner.target))return entry.owner;
        // Module fixtures have no tab registry; production BrowserSession does.
        if(!tabs&&session===this.session)return {session,target:this.target||null};
        return null;
    },
    frameOwner(session){
        const tabs=this.tabs||[],tab=tabs.find(t=>t.session===session);
        if(tab)return {session,target:tab.target,frameId:tab.mainFrame||tab.target,tabId:tab.id,mainSession:tab.session,parentTarget:null,parentFrame:null,epoch:this.epoch,generation:tab.permissionGeneration||0};
        const entry=this.permissionFrameOwners&&this.permissionFrameOwners.get(session),owner=entry&&this.permissionOwner(session);
        if(!owner)return null;
        const main=tabs.find(t=>t.session===owner.session);
        return {session,target:entry.target,frameId:entry.target,tabId:main.id,mainSession:owner.session,parentTarget:entry.parentTarget,parentFrame:entry.parentFrame,parentSession:entry.parentSession,epoch:entry.epoch,generation:entry.generation};
    },
    relatedFrames(mainSession){
        const frames=this.permissionFrameOwners;if(!frames)return [];
        return Array.from(frames.keys()).map(session=>this.frameOwner(session)).filter(frame=>frame&&frame.mainSession===mainSession);
    },
    async permissionAttachFrame(event){
        const p=event.params||{},info=p.targetInfo,session=p.sessionId,pipe=this.pipe,epoch=this.epoch;
        const owner=this.permissionOwner(event.sessionId),parentOwner=this.frameOwner(event.sessionId),frames=this.permissionFrameOwners||(this.permissionFrameOwners=new Map());
        let accepted=false;
        try{
            if(frames.has(session)){accepted=true;return;}
            if(!owner||!parentOwner||!info||info.type!=='iframe'||typeof session!=='string'||session===event.sessionId||typeof info.targetId!=='string'||info.targetId===parentOwner.target||typeof info.parentFrameId!=='string'||frames.size>=128)return;
            const parent=frames.get(event.sessionId),parentTarget=parent?parent.target:owner.target;
            if(info.parentId!==owner.target&&info.parentId!==parentTarget)return;
            const tree=(await pipe.send('Page.getFrameTree',{},event.sessionId)).frameTree;
            const current=this.frameOwner(event.sessionId);
            if(this.pipe!==pipe||this.epoch!==epoch||!parentOwner||!current||current.target!==parentOwner.target||current.generation!==parentOwner.generation||!findFrame(tree,info.parentFrameId))return;
            const entry={session,target:info.targetId,parentSession:event.sessionId,parentTarget,parentFrame:info.parentFrameId,owner,pipe,epoch,generation:0};
            frames.set(session,entry);accepted=true;
            await this.installPermissions(session,pipe);
        }catch(error){
            if(accepted){this.permissionDetachFrame(session);accepted=false;}
            throw error;
        }finally{
            // Never leave an unrelated or failed frame paused behind this UI.
            if(p.waitingForDebugger)await pipe.send('Runtime.runIfWaitingForDebugger',{},session).catch(()=>{});
            if(!accepted){await pipe.send('Target.detachFromTarget',{sessionId:session}).catch(()=>{});}
        }
    },
    permissionDetachFrame(session){
        const frames=this.permissionFrameOwners;if(!frames||!frames.has(session))return;
        if(this.clearAuth)this.clearAuth(session);
        for(const child of Array.from(frames.values()))if(child.parentSession===session)this.permissionDetachFrame(child.session);
        this.cancelPermissionRequests(session);
        if(this.permissionContexts)for(const [k,c] of this.permissionContexts)if(c.session===session)this.permissionContexts.delete(k);
        frames.delete(session);
    },
    permissionRetireFrames(parentSession,parentFrame){
        const frames=this.permissionFrameOwners;if(!frames)return;
        const retiring=Array.from(frames.values()).filter(entry=>entry.parentSession===parentSession&&(parentFrame===undefined||entry.parentFrame===parentFrame));
        for(const entry of retiring){
            this.permissionRetireFrames(entry.session);
            this.permissionDetachFrame(entry.session);
            if(this.pipe===entry.pipe)entry.pipe.send('Target.detachFromTarget',{sessionId:entry.session}).catch(()=>{});
        }
    },
    forgetPermissionSession(session){
        if(typeof session!=='string')return;
        if(this.clearAuth)this.clearAuth(session);
        this.permissionRetireFrames(session);this.cancelPermissionRequests(session);
        if(this.permissionContexts)for(const [k,context] of this.permissionContexts)if(context.session===session)this.permissionContexts.delete(k);
    },
    permissionEvent(event){
        const p=event.params||{},session=event.sessionId;
        if(event.method==='Target.targetDestroyed'){
            const tab=this.tabs&&this.tabs.find(tab=>tab.target===p.targetId);if(tab)this.forgetPermissionSession(tab.session);
        }
        if(event.method==='Target.attachedToTarget'&&this.permissionOwner(session)&&p.targetInfo&&p.targetInfo.type==='iframe'){
            this.permissionAttachFrame(event).catch(()=>{});return true;
        }
        if(event.method==='Target.detachedFromTarget'&&this.permissionFrameOwners&&this.permissionFrameOwners.has(p.sessionId)){this.permissionDetachFrame(p.sessionId);return true;}
        if(event.method==='Target.detachedFromTarget')this.forgetPermissionSession(p.sessionId);
        if(!this.permissionOwner(session))return false;
        const contexts=this.permissionContexts||(this.permissionContexts=new Map());
        if(event.method==='Runtime.executionContextCreated'){
            const c=p.context,aux=c&&c.auxData;
            if(c&&aux&&aux.isDefault===true&&typeof aux.frameId==='string'&&origin(c.origin)&&(contexts.size<256||contexts.has(key(session,c.id))))contexts.set(key(session,c.id),{session,id:c.id,frameId:aux.frameId,origin:origin(c.origin)});
        }else if(event.method==='Runtime.executionContextDestroyed'){
            const k=key(session,p.executionContextId),previous=contexts.get(k);
            if(previous)inputFrameChanged(this,session,previous.frameId);
            if(previous)this.permissionRetireFrames(session,previous.frameId);
            contexts.delete(k);this.cancelPermissionRequests(session,p.executionContextId);
        }else if(event.method==='Runtime.executionContextsCleared'){
            inputFrameChanged(this,session);
            const tab=this.tabs&&this.tabs.find(t=>t.session===session);if(tab)tab.permissionGeneration=(tab.permissionGeneration||0)+1;
            this.permissionRetireFrames(session);
            const child=this.permissionFrameOwners&&this.permissionFrameOwners.get(session);if(child)child.generation++;
            for(const [k,c] of contexts)if(c.session===session)contexts.delete(k);this.cancelPermissionRequests(session);
        }else if(event.method==='Page.frameNavigated'){
            if(p.frame)inputFrameChanged(this,session,p.frame.id);
            const tab=this.tabs&&this.tabs.find(t=>t.session===session);if(tab&&p.frame&&!p.frame.parentId)tab.permissionGeneration=(tab.permissionGeneration||0)+1;
            if(p.frame)this.permissionRetireFrames(session,p.frame.parentId?p.frame.id:undefined);
            const child=this.permissionFrameOwners&&this.permissionFrameOwners.get(session);if(child)child.generation++;
            const frame=p.frame;
            if(frame)for(const [k,c] of contexts)if(c.session===session&&c.frameId===frame.id){contexts.delete(k);this.cancelPermissionRequests(session,c.id);}
        }else if(event.method==='Runtime.bindingCalled'&&p.name===BINDING){
            this.permissionRequest(session,p.executionContextId,p.payload).catch(()=>{});
        }
    },
    async permissionAuthority(session,frameId){
        this.requireAllowed();const owner=this.permissionOwner(session);if(!this.pipe||!owner||owner.session!==this.session)throw Error('Permission page changed');
        const pipe=this.pipe,epoch=this.epoch,view=this.pageGeneration;
        const response=await pipe.send('Page.getFrameTree',{},owner.session);
        this.requireAllowed();if(this.pipe!==pipe||this.session!==owner.session||this.epoch!==epoch||this.pageGeneration!==view)throw Error('Permission page changed');
        const tree=response.frameTree,top=tree&&tree.frame;let frame=frameId&&tree?findFrame(tree,frameId):top;
        let frameGeneration=null;
        if(session!==owner.session){
            const entry=this.permissionFrameOwners&&this.permissionFrameOwners.get(session);
            if(!entry||entry.owner.session!==owner.session)throw Error('Permission frame changed');
            frameGeneration=entry.generation;
            const child=(await pipe.send('Page.getFrameTree',{},session)).frameTree;
            if(!child||!child.frame||child.frame.id!==entry.target||this.permissionFrameOwners.get(session)!==entry||entry.generation!==frameGeneration)throw Error('Permission frame changed');
            frame=findFrame(child,frameId||entry.target);
        }
        this.requireAllowed();if(this.pipe!==pipe||this.session!==owner.session||this.epoch!==epoch||this.pageGeneration!==view)throw Error('Permission page changed');
        const embeddingOrigin=top&&origin(top.securityOrigin||top.url),requestOrigin=frame&&origin(frame.securityOrigin||frame.url);
        if(!embeddingOrigin||!requestOrigin)throw Error('Secure website required for permissions');
        return {pipe,session:owner.session,contextSession:session,epoch,view,frameGeneration,frameId:frame.id,origin:requestOrigin,embeddingOrigin};
    },
    async permissionStatus(){
        let authority;
        try{authority=await this.permissionAuthority(this.session);}catch(error){return {available:false,origin:null,permissions:[],reason:error.message};}
        const result=await authority.pipe.send('Runtime.evaluate',{expression:statusExpression,awaitPromise:true,returnByValue:true},authority.session);
        if(this.pipe!==authority.pipe||this.session!==authority.session||this.pageGeneration!==authority.view)throw Error('Permission page changed');
        const values=result.result&&result.result.value;
        return {available:true,origin:authority.origin,embeddingOrigin:authority.embeddingOrigin,permissions:NAMES.map(name=>{
            const state=Array.isArray(values)&&values.find(p=>p&&p.name===name);
            return {name,state:state&&['granted','denied','prompt','unsupported'].includes(state.state)?state.state:'unsupported'};
        })};
    },
    async permissionApply(authority,names,setting){
        if(!['granted','denied','prompt'].includes(setting)||!names.length||names.some(name=>!NAMES.includes(name)))throw Error('Unsupported website permission');
        for(const name of names){
            this.requireAllowed();if(this.pipe!==authority.pipe||this.session!==authority.session||this.epoch!==authority.epoch||this.pageGeneration!==authority.view)throw Error('Permission page changed');
            if(authority.contextSession!==authority.session){const frame=this.frameOwner(authority.contextSession);if(!frame||frame.generation!==authority.frameGeneration)throw Error('Permission frame changed');}
            await authority.pipe.send('Browser.setPermission',{permission:{name},setting,origin:authority.embeddingOrigin,embeddedOrigin:authority.origin});
        }
    },
    async permissionSet(name,setting,expectedOrigin){
        if(!NAMES.includes(name))throw Error('Unsupported website permission');
        if(typeof expectedOrigin!=='string'||origin(expectedOrigin)!==expectedOrigin)throw Error('Website permission origin required');
        const authority=await this.permissionAuthority(this.session);
        if(authority.origin!==expectedOrigin)throw Error('Permission website changed');
        await this.permissionApply(authority,[name],setting);return this.permissionStatus();
    },
    async permissionRequest(session,contextId,payload){
        if(typeof payload!=='string'||payload.length>1024)return;
        let data;try{data=JSON.parse(payload);}catch(ignore){return;}
        if(!data||!Number.isInteger(data.id)||data.id<1||data.id>2147483647||!Array.isArray(data.names)||!data.names.length||data.names.length>2||data.names.some(name=>!NAMES.includes(name)))return;
        const contexts=this.permissionContexts,context=contexts&&contexts.get(key(session,contextId));
        const owner=this.permissionOwner(session);
        if(!context||!owner||owner.session!==this.session||!this.gate.check().allowed)return;
        const authority=await this.permissionAuthority(session,context.frameId);
        if(contexts.get(key(session,contextId))!==context||authority.origin!==context.origin)return;
        const pending=this.permissionPending||(this.permissionPending=new Map());
        const names=NAMES.filter(name=>data.names.includes(name));
        const repeated=Array.from(pending.values()).find(r=>r.contextSession===session&&r.contextId===contextId&&r.names.join(',')===names.join(','));
        if(repeated){if(repeated.pageIds.length<32&&!repeated.pageIds.includes(data.id))repeated.pageIds.push(data.id);return;}
        if(pending.size>=4)return;
        this.permissionSerial=(this.permissionSerial||0)+1;
        const id='permission-'+this.permissionSerial,request=Object.assign({id,contextId,context,pageIds:[data.id],names},authority);
        request.timer=setTimeout(()=>{this.permissionAnswer(id,'denied').catch(()=>this.permissionFinish(request,'denied'));},30000);if(request.timer.unref)request.timer.unref();
        pending.set(id,request);this.emit('permission',{id,origin:authority.origin,embeddingOrigin:authority.embeddingOrigin,permissions:names,state:'requested'});
    },
    async permissionAnswer(id,setting){
        if(!['granted','denied'].includes(setting))throw Error('Unsupported permission decision');
        const request=this.permissionPending&&this.permissionPending.get(id);if(!request)throw Error('Permission request expired');
        const context=this.permissionContexts&&this.permissionContexts.get(key(request.contextSession,request.contextId));
        if(!context||context!==request.context||context.frameId!==request.frameId||context.origin!==request.origin)throw Error('Permission page changed');
        const authority=await this.permissionAuthority(request.contextSession,request.frameId);
        if(authority.origin!==request.origin||authority.embeddingOrigin!==request.embeddingOrigin||authority.epoch!==request.epoch||authority.view!==request.view)throw Error('Permission page changed');
        if(this.permissionContexts.get(key(request.contextSession,request.contextId))!==request.context||this.permissionPending.get(id)!==request)throw Error('Permission page changed');
        await this.permissionApply(authority,request.names,setting);
        if(this.permissionContexts.get(key(request.contextSession,request.contextId))!==request.context||this.permissionPending.get(id)!==request)throw Error('Permission page changed');
        for(const pageId of request.pageIds)await authority.pipe.send('Runtime.evaluate',{expression:'window.'+RESOLVE+'('+pageId+',true)',contextId:request.contextId},request.contextSession).catch(()=>{});
        this.permissionFinish(request,setting);return {id,setting,origin:request.origin};
    },
    permissionFinish(request,setting){
        const pending=this.permissionPending;if(!pending||pending.get(request.id)!==request)return;
        clearTimeout(request.timer);pending.delete(request.id);this.emit('permission',{id:request.id,origin:request.origin,embeddingOrigin:request.embeddingOrigin,permissions:request.names,state:'resolved',setting});
    },
    cancelPermissionRequests(session,contextId){
        const pending=this.permissionPending;if(!pending)return;
        for(const request of pending.values())if((session===undefined||request.session===session||request.contextSession===session)&&(contextId===undefined||request.contextId===contextId)){
            if(this.pipe===request.pipe)for(const pageId of request.pageIds)request.pipe.send('Runtime.evaluate',{expression:'window.'+RESOLVE+'('+pageId+',false)',contextId:request.contextId},request.contextSession).catch(()=>{});
            this.permissionFinish(request,'denied');
        }
    },
    clearPermissions(){
        this.cancelPermissionRequests();if(this.permissionContexts)this.permissionContexts.clear();
        if(this.permissionFrameOwners){for(const entry of this.permissionFrameOwners.values())if(this.pipe===entry.pipe)entry.pipe.send('Target.detachFromTarget',{sessionId:entry.session}).catch(()=>{});this.permissionFrameOwners.clear();}
    },
    permissionNames:NAMES,
    permissionBridge:bridge
};
