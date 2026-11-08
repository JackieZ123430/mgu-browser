'use strict';
// HTTP authentication stays in Chromium's native network stack. The broker
// holds only a live challenge; credentials exist only in an explicit reply.
const URL=require('url').URL;
const MAX_PENDING=16,MAX_TRACKED=512,TIMEOUT=120000;
function origin(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.origin:null;}catch(ignore){return null;}}
function display(value,limit){return typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').slice(0,limit):'';}
function key(session,id){return session+':'+id;}
function cancel(pipe,session,requestId){if(pipe&&!pipe.closed)pipe.send('Fetch.continueWithAuth',{requestId,authChallengeResponse:{response:'CancelAuth'}},session,1500).catch(()=>{});}
module.exports={
    async installAuth(session,pipe){
        pipe=pipe||this.pipe;
        const owner=this.frameOwner(session);
        if(owner&&owner.mainSession!==session)await pipe.send('Network.enable',{maxPostDataSize:1},session);
        // Chromium rejects empty auth patterns and does not issue auth events
        // for response-only interception. Immediately continue ordinary request
        // pauses; retain the existing optional document/media restrictions.
        await pipe.send('Fetch.enable',{handleAuthRequests:true,patterns:[{urlPattern:'*',requestStage:'Request'}]},session);
    },
    navigateWithAuth(url){
        const pipe=this.pipe,session=this.session,epoch=this.epoch;
        return new Promise((resolve,reject)=>{
            let settled=false;
            const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);this.removeListener('auth',changed);error?reject(error):resolve(result);};
            const changed=()=>{
                if(this.pipe!==pipe||this.epoch!==epoch)return;
                const owner=this.frameOwner(session),records=this.httpAuthRequests;
                if(!owner||!records)return;
                for(const record of records.values())if(record.session===session&&record.frameId===owner.frameId&&record.resourceType==='Document'&&this.authCurrent(record)){finish(null,{authPending:true,frameId:record.frameId});break;}
            };
            // Keep ordinary navigation's ten-second limit. A native challenge
            // releases the caller immediately so the Browser can finish its
            // startup and the person can answer without a client timeout.
            const timer=setTimeout(()=>finish(new Error('Page.navigate: Zeitlimit')),10000);
            this.on('auth',changed);
            pipe.send('Page.navigate',{url},session,TIMEOUT+5000).then(result=>{
                let error=null;if(result.errorText){error=new Error(result.errorText);error.navigationFailure=true;}
                finish(error,result);
            },error=>finish(error));
        });
    },
    authStatus(){
        const records=this.httpAuthRequests;if(!records)return null;
        for(const record of records.values())if(record.mainSession===this.session)return Object.assign({},record.public,{busy:record.responding});
        return null;
    },
    emitAuthState(){const state=this.authStatus(),serialized=JSON.stringify(state);if(serialized!==this.lastAuthState){this.lastAuthState=serialized;this.emit('auth',state);}},
    authCurrent(record){
        const owner=this.frameOwner(record.session);
        return !!owner&&this.httpAuthRequests&&this.httpAuthRequests.get(record.key)===record&&record.pipe===this.pipe&&record.epoch===this.epoch&&owner.mainSession===record.mainSession&&owner.mainSession===this.session&&owner.tabId===record.public.tabId&&owner.target===record.target&&owner.generation===record.generation&&this.gate.check().allowed;
    },
    clearAuth(session,frameId){
        const records=this.httpAuthRequests;let changed=false;
        if(records)for(const [id,record] of records){
            if(session!==undefined&&record.session!==session&&!(frameId===undefined&&record.mainSession===session))continue;
            if(frameId!==undefined&&record.frameId!==frameId)continue;
            clearTimeout(record.timer);records.delete(id);cancel(record.pipe,record.session,record.requestId);changed=true;
        }
        const tracked=this.httpAuthTracked;if(tracked)for(const [id,entry] of tracked)if((session===undefined||entry.session===session||entry.mainSession===session)&&(frameId===undefined||entry.frameId===frameId)){
            tracked.delete(id);if(this.httpAuthNetwork&&this.httpAuthNetwork.get(entry.networkKey)===id)this.httpAuthNetwork.delete(entry.networkKey);
        }
        if(changed)this.emitAuthState();
    },
    authEvent(event){
        const p=event.params||{},session=event.sessionId;
        if(event.method==='Fetch.requestPaused'){
            const owner=this.frameOwner(session);if(!owner)return false;
            if(p.networkId){
                const tracked=this.httpAuthTracked||(this.httpAuthTracked=new Map());
                const network=this.httpAuthNetwork||(this.httpAuthNetwork=new Map()),id=key(session,p.requestId),networkKey=key(session,p.networkId),previous=network.get(networkKey);
                const existing=tracked.get(id);if(existing&&existing.networkKey!==networkKey&&network.get(existing.networkKey)===id)network.delete(existing.networkKey);
                if(previous&&previous!==id)tracked.delete(previous);
                tracked.set(id,{session,mainSession:owner.mainSession,frameId:p.frameId,networkId:p.networkId,networkKey});network.set(networkKey,id);
                while(tracked.size>MAX_TRACKED){const first=tracked.keys().next().value,entry=tracked.get(first);tracked.delete(first);if(network.get(entry.networkKey)===first)network.delete(entry.networkKey);}
            }
            const pipe=this.pipe;
            if(pipe&&!pipe.closed){
                // Preserve the existing media restriction for main documents
                // and separately attached iframe renderers alike.
                if(this.options.mediaDisabled&&p.resourceType==='Media')pipe.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'},session,2000).catch(()=>{});
                else if(this.options.mediaDisabled&&p.responseStatusCode){
                    const headers=(p.responseHeaders||[]).concat([{name:'Content-Security-Policy',value:"media-src 'none'; object-src 'none'"}]);
                    pipe.send('Fetch.continueResponse',{requestId:p.requestId,responseCode:p.responseStatusCode,responseHeaders:headers},session,2000).catch(()=>{this.emit('fault',new Error('Medien-Sperre konnte nicht gesetzt werden'));this.stop('Medien-Sperre konnte nicht gesetzt werden');});
                }else{
                    const params={requestId:p.requestId};
                    // Matching Request/Response patterns are not cumulative in
                    // Chromium. Request the document response explicitly so
                    // auth interception cannot silently remove its CSP.
                    if(this.options.mediaDisabled&&p.resourceType==='Document')params.interceptResponse=true;
                    pipe.send('Fetch.continueRequest',params,session,2000).catch(()=>{});
                }
            }
            return true;
        }
        if(event.method==='Fetch.authRequired'){
            const owner=this.frameOwner(session),challenge=p.authChallenge||{},requestOrigin=origin(p.request&&p.request.url),challengeOrigin=origin(challenge.origin),scheme=String(challenge.scheme||'').toLowerCase(),isProxy=challenge.source==='Proxy';
            const records=this.httpAuthRequests||(this.httpAuthRequests=new Map()),id=key(session,p.requestId),old=records.get(id);
            if(old){clearTimeout(old.timer);records.delete(id);}
            if(!owner||owner.mainSession!==this.session||!this.gate.check().allowed||!requestOrigin||!challengeOrigin||!isProxy&&requestOrigin!==challengeOrigin||!['basic','digest'].includes(scheme)||challenge.source!==undefined&&!['Server','Proxy'].includes(challenge.source)||typeof challenge.realm!=='string'||Buffer.byteLength(challenge.realm)>4096||typeof p.requestId!=='string'||typeof p.frameId!=='string'||records.size>=MAX_PENDING){cancel(this.pipe,session,p.requestId);this.emitAuthState();return true;}
            const sequence=this.httpAuthSequence=(this.httpAuthSequence||0)+1;
            const record={key:id,session,mainSession:owner.mainSession,target:owner.target,generation:owner.generation,frameId:p.frameId,resourceType:p.resourceType,requestId:p.requestId,pipe:this.pipe,epoch:this.epoch,responding:false,
                // Bind the full native realm internally; truncate only display.
                realm:challenge.realm,origin:challengeOrigin,scheme,isProxy,
                public:{id:'auth-'+this.epoch+'-'+sequence,origin:challengeOrigin,realm:display(challenge.realm,256),scheme,isProxy,tabId:owner.tabId}};
            const tracked=this.httpAuthTracked&&this.httpAuthTracked.get(id);record.networkId=tracked&&tracked.networkId;
            records.set(id,record);record.timer=setTimeout(()=>{if(records.get(id)===record){records.delete(id);cancel(record.pipe,session,record.requestId);this.emitAuthState();}},TIMEOUT);if(record.timer.unref)record.timer.unref();
            this.emitAuthState();return true;
        }
        if(event.method==='Network.loadingFinished'||event.method==='Network.loadingFailed'){
            const network=this.httpAuthNetwork,networkKey=key(session,p.requestId),tracked=network&&network.get(networkKey);
            if(tracked){this.httpAuthTracked.delete(tracked);network.delete(networkKey);}
            if(this.httpAuthRequests)for(const [id,record] of this.httpAuthRequests)if(record.session===session&&record.networkId===p.requestId){clearTimeout(record.timer);this.httpAuthRequests.delete(id);this.emitAuthState();}
        }else if(event.method==='Page.frameStartedNavigating'||event.method==='Page.frameNavigated'){
            const owner=this.frameOwner(session),frameId=p.frameId||p.frame&&p.frame.id;
            if(owner&&frameId){if(owner.session===owner.mainSession&&frameId===owner.frameId)this.clearAuth(owner.mainSession);else this.clearAuth(session,frameId);}
        }else if(event.method==='Runtime.executionContextsCleared')this.clearAuth(session);
        return false;
    },
    async authReply(id,reply){
        this.requireAllowed();
        if(typeof id!=='string'||id.length>100||!reply||typeof reply!=='object'||Array.isArray(reply)||Object.keys(reply).some(name=>!['username','password','cancel'].includes(name))||reply.cancel!==undefined&&typeof reply.cancel!=='boolean')throw Error('Ungültige Anmeldeantwort');
        const record=this.httpAuthRequests&&Array.from(this.httpAuthRequests.values()).find(item=>item.public.id===id);
        if(!record||record.responding||!this.authCurrent(record))throw Error('Website-Anmeldung ist nicht mehr aktuell');
        const cancelled=reply.cancel===true;
        if(!cancelled&&(typeof reply.username!=='string'||typeof reply.password!=='string'||Buffer.byteLength(reply.username)>1024||Buffer.byteLength(reply.password)>4096||/[\x00\r\n]/.test(reply.username)||/[\x00\r\n]/.test(reply.password)))throw Error('Ungültige Anmeldedaten');
        record.responding=true;clearTimeout(record.timer);this.emitAuthState();
        const response=cancelled?{response:'CancelAuth'}:{response:'ProvideCredentials',username:reply.username,password:reply.password};
        try{
            await record.pipe.send('Fetch.continueWithAuth',{requestId:record.requestId,authChallengeResponse:response},record.session,3000);
            if(this.httpAuthRequests.get(record.key)===record){this.httpAuthRequests.delete(record.key);this.emitAuthState();}
            return {handled:true,cancelled};
        }catch(ignore){
            if(this.httpAuthRequests.get(record.key)===record){this.httpAuthRequests.delete(record.key);this.emitAuthState();}
            throw Error('Website-Anmeldung konnte nicht beantwortet werden');
        }finally{if(!cancelled){response.username='';response.password='';}}
    }
};
