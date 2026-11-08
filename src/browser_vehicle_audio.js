'use strict';
// AudioManager protocol names are public GENIVI/BMW integration facts. This
// Browser takeover is limited to the firmware's verified CarLifeMedia source.
// Afterwards it owns only its newly-created connection; other sources stay put.
const COMMAND='org.genivi.am.commandinterface.CommandControl';
const ROUTING='org.genivi.am.routinginterface.RoutingControlObserver';
const SOURCE=287,SINK=1024;
function list(reply){
    if(Array.isArray(reply))return reply.slice(0,1024);
    if(reply&&typeof reply==='object')for(const key of Object.keys(reply)){if(Array.isArray(reply[key]))return reply[key].slice(0,1024);}
    throw new Error('audio-invalid-reply');
}
function ok(reply){return reply&&(reply.amError===0||reply.amError==='E_OK');}
function exists(reply){return reply&&(reply.amError===5||reply.amError==='E_ALREADY_EXISTS');}
function missing(reply){return reply&&(reply.amError===8||reply.amError==='E_NON_EXISTENT');}
function id(value){return Number.isInteger(value)&&value>0&&value<=65535;}
function availability(source){
    const v=source&&source.availability;
    if(!v||typeof v!=='object'||!['A_AVAILABLE','A_UNAVAILABLE',1,2].includes(v.availability)||!Number.isInteger(v.availabilityReason)||v.availabilityReason<0||v.availabilityReason>65535)throw new Error('audio-invalid-source');
    return {availability:v.availability,availabilityReason:v.availabilityReason};
}
class VehicleAudio {
    constructor(options){
        this.signals=options.signals;this.visible=options.visible||(()=>false);this.onStatus=options.onStatus||(()=>{});
        this.requestFocus=options.requestFocus||(()=>Promise.resolve());
        this.startOutput=options.start||(()=>Promise.resolve());this.stopOutput=options.stop||(()=>Promise.resolve());this.outputStarted=false;
        this.waitMs=options.waitMs||5000;this.pollMs=options.pollMs||100;this.queue=Promise.resolve();this.wanted=false;this.connection=null;this.changed=false;this.previous=null;
        this.interrupted=false;this.generation=0;this.intent=0;
        this.report('idle');
    }
    report(reason,connected){this.status={supported:!!this.signals,owned:this.connection!==null,connected:connected===true,reason};this.onStatus(this.status);return this.status;}
    task(work){const next=this.queue.catch(()=>{}).then(work);this.queue=next;return next;}
    acquire(){const intent=this.intent;this.wanted=true;return this.task(async()=>{
        if(intent!==this.intent||!this.wanted||!this.visible())throw new Error('audio-not-visible');
        try{
            if(this.interrupted)throw new Error('audio-route-interrupted');
            if(this.connection!==null){
                if(!this.outputStarted||!this.status.connected){await this.disconnect();throw new Error('audio-output-unavailable');}
                const current=(await this.connections()).find(c=>c&&c.mainConnectionID===this.connection&&c.sourceID===SOURCE&&c.sinkID===SINK);
                this.allowed(intent);if(current&&(current.connectionState==='CS_CONNECTED'||current.connectionState===2))return this.report('connected',true);
                this.interrupted=true;await this.disconnect();throw new Error('audio-route-interrupted');
            }
            return await this.connect(intent);
        }catch(e){await this.disconnect().catch(()=>{});this.report(e.message);throw e;}
    });}
    release(){this.wanted=false;this.intent++;return this.task(async()=>{try{const result=await this.disconnect();this.interrupted=false;return result;}catch(e){this.report(e.message);throw e;}});}
    async proxy(iface){
        const s=this.signals;if(!s||!s.proxy||!s.call||!s.onAvailable)throw new Error('audio-sdk-unavailable');
        const p=await s.proxy(iface,'1');
        await new Promise((resolve,reject)=>{
            let done=false,live=false;const timer=setTimeout(()=>finish(new Error('audio-service-unavailable')),this.waitMs);
            function finish(error){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();}
            Promise.resolve(s.onAvailable(p,value=>{
                if(value){live=true;finish();}
                else if(live){
                    // Provider restart invalidates connection IDs. Stop local
                    // output and forget ownership; never act on reused IDs.
                    live=false;this.generation++;this.interrupted=true;this.connection=null;this.changed=false;this.previous=null;this.command=null;this.routing=null;
                    this.report('audio-service-unavailable');this.task(async()=>{if(this.outputStarted){await this.stopOutput();this.outputStarted=false;}}).catch(()=>{});
                }
            })).catch(()=>finish(new Error('audio-service-unavailable')));
        });return p;
    }
    async interfaces(){
        if(!this.command)this.command=await this.proxy(COMMAND);
        if(!this.routing)this.routing=await this.proxy(ROUTING);
    }
    call(proxy,method,params,timeout){return this.signals.call(proxy,method,params,timeout||this.waitMs);}
    allowed(intent){if(this.interrupted)throw new Error('audio-route-interrupted');if((intent!==undefined&&intent!==this.intent)||!this.wanted||!this.visible())throw new Error('audio-not-visible');}
    async connections(timeout){return list(await this.call(this.command,'getListMainConnections',{},timeout));}
    async source(){
        const sources=list(await this.call(this.command,'getListMainSources',{})).filter(s=>s&&s.sourceID===SOURCE);
        if(sources.length!==1||sources[0].name!=='CarLifeMedia')throw new Error('audio-source-unavailable');
        return availability(sources[0]);
    }
    async sourceConnections(){
        const all=await this.connections(),routes=all.filter(c=>c&&c.sourceID===SOURCE);
        for(const route of routes)if(!id(route.mainConnectionID)||!id(route.sinkID)||all.filter(c=>c&&c.mainConnectionID===route.mainConnectionID).length!==1)throw new Error('audio-invalid-reply');
        return routes.map(route=>({mainConnectionID:route.mainConnectionID,sourceID:SOURCE,sinkID:route.sinkID}));
    }
    async takeover(routes,current){
        if(!routes.length)return;
        const until=Date.now()+this.waitMs;
        const remaining=()=>{current();const wait=until-Date.now();if(wait<=0)throw new Error('audio-takeover-timeout');return wait;};
        for(const route of routes){
            const matches=(await this.connections(remaining())).filter(c=>c&&c.mainConnectionID===route.mainConnectionID);current();
            // Connection IDs may have been reused while UI focus changed. Only
            // disconnect the exact source/sink identity from this acquisition.
            if(matches.length!==1||matches[0].sourceID!==SOURCE||matches[0].sinkID!==route.sinkID)continue;
            const reply=await this.call(this.command,'disconnect',{mainConnectionID:route.mainConnectionID},remaining());current();
            if(!ok(reply)&&!missing(reply))throw new Error('audio-takeover-refused');
        }
        do{
            const live=await this.connections(remaining());current();
            if(!routes.some(route=>live.some(c=>c&&c.mainConnectionID===route.mainConnectionID&&c.sourceID===SOURCE&&c.sinkID===route.sinkID)))return;
            if(Date.now()>=until)break;
            await new Promise(resolve=>setTimeout(resolve,Math.min(this.pollMs,until-Date.now())));
        }while(true);
        throw new Error('audio-takeover-timeout');
    }
    async connect(intent){
        const generation=this.generation;
        const sameGeneration=()=>{if(this.generation!==generation)throw new Error('audio-route-interrupted');};
        const current=()=>{sameGeneration();this.allowed(intent);};
        this.report('connecting');await this.interfaces();current();
        let focused=false;
        const focus=async()=>{if(!focused){current();focused=true;await this.requestFocus();current();}};
        const refresh=async()=>{const source=await this.source();current();const routes=await this.sourceConnections();current();return {source,routes};};
        let state=await refresh();
        if(state.source.availability==='A_AVAILABLE'||state.source.availability===1||state.routes.length){await focus();state=await refresh();}
        // E_ALREADY_EXISTS (official enum 5) is the only retryable connect
        // response. A timeout/unknown outcome never makes a route ours.
        for(let attempt=0;attempt<3;attempt++){
            current();await this.takeover(state.routes,current);current();
            const source=await this.source();current();
            if(source.availability==='A_UNAVAILABLE'||source.availability===2){
                this.previous=source;
                const changed=await this.call(this.routing,'hookSourceAvailablityStatusChange',{sourceID:SOURCE,availability:{availability:'A_AVAILABLE',availabilityReason:0}});
                sameGeneration();
                if(changed&&changed.amError!==undefined&&!ok(changed))throw new Error('audio-availability-refused');
                this.changed=true;current();
            }
            current();const result=await this.call(this.command,'connect',{sourceID:SOURCE,sinkID:SINK});sameGeneration();
            if(ok(result)&&id(result.mainConnectionID)){this.connection=result.mainConnectionID;current();break;}
            current();
            if(!exists(result)||attempt===2)throw new Error('audio-connect-refused');
            await focus();await new Promise(resolve=>setTimeout(resolve,this.pollMs));current();state=await refresh();
        }
        const until=Date.now()+this.waitMs;
        do{
            const connection=(await this.connections()).find(c=>c&&c.mainConnectionID===this.connection&&c.sourceID===SOURCE&&c.sinkID===SINK);
            current();
            if(connection&&(connection.connectionState==='CS_CONNECTED'||connection.connectionState===2)){
                this.outputStarted=true;await this.startOutput();current();return this.report('connected',true);
            }
            await new Promise(resolve=>setTimeout(resolve,this.pollMs));
        }while(Date.now()<until);
        throw new Error('audio-connect-timeout');
    }
    async disconnect(){
        const generation=this.generation;
        const current=()=>{if(this.generation!==generation)throw new Error('audio-route-interrupted');};
        if(this.outputStarted||this.connection!==null){await this.stopOutput();this.outputStarted=false;}
        if(this.connection!==null){
            // IDs can be reused after AudioManager restarts. Recheck identity
            // and leave a different route alone rather than disconnecting it.
            const owned=(await this.connections()).find(c=>c&&c.mainConnectionID===this.connection&&c.sourceID===SOURCE&&c.sinkID===SINK);
            current();if(owned){const r=await this.call(this.command,'disconnect',{mainConnectionID:this.connection});current();if(!ok(r)&&!missing(r))throw new Error('audio-release-refused');}
            this.connection=null;
        }
        if(this.changed){
            const inUse=(await this.connections()).some(c=>c&&c.sourceID===SOURCE);
            current();if(!inUse){const r=await this.call(this.routing,'hookSourceAvailablityStatusChange',{sourceID:SOURCE,availability:this.previous});current();if(r&&r.amError!==undefined&&!ok(r))throw new Error('audio-release-refused');}
            this.changed=false;this.previous=null;
        }
        if(!this.changed)this.previous=null;
        return this.report('idle');
    }
}
module.exports=VehicleAudio;
