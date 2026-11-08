'use strict';
const net=require('net'),EventEmitter=require('events'),Channel=require('./ipc_protocol');
class BrowserClient extends EventEmitter {
    constructor(options){
        super();this.gate=options.gate;this.channel=null;this.child=null;this.pending=new Map();this.next=0;this.generation=1;this.lastAllowed=false;
        this.socketPath=options.socketPath||(process.env.MGU_EMULATOR_MODE==='1'&&process.env.MGU_BROWSER_SOCKET)||'/var/opt/mgu-browser/data/backend.sock';
        this.connect();this.timer=setInterval(()=>this.state(),300);
        this.gate.onBlock=reason=>{this.cancelController();this.generation++;this.child=null;this.emit('blocked',reason);this.state();};
    }
    connect(){
        const socket=net.createConnection(this.socketPath);let connected=false;
        socket.on('error',e=>{this.emit('diagnostic','Browser-Verbindung: '+e.code);});socket.on('connect',()=>{connected=true;this.cancelController();this.surface=null;this.channel=new Channel(socket);this.channel.on('json',m=>this.receive(m));this.channel.on('frame',b=>this.frame(b));this.state();});
        socket.once('close',()=>{
            this.cancelController();this.channel=null;this.child=null;this.surface=null;this.controllerFullscreen=undefined;this.scrollRest=0;
            this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(new Error('Browser-Dienst getrennt'));});this.pending.clear();
            // An established backend disappearing must clear its picture and
            // release the frontend's owned vehicle audio route immediately.
            // Initial connection retries and intentional shutdown stay quiet.
            if(connected&&!this.closed)this.emit('blocked','Browser-Dienst getrennt');
            if(!this.closed)this.retry=setTimeout(()=>this.connect(),2000);
        });
    }
    state(){
        const allowed=this.gate.check().allowed;
        if(allowed!==this.lastAllowed){this.cancelController();this.generation++;this.lastAllowed=allowed;if(!allowed){this.child=null;this.emit('blocked','Browser nicht im Vordergrund');}}
        if(this.channel)this.channel.json({op:'state',allowed,generation:this.generation,frames:2});
    }
    receive(m){
        if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result||{});}return;}
        if(['ready','tabSelected','navigation','blocked'].includes(m.event))this.cancelController();
        if(m.event==='viewport'&&m.value){const v=m.value;if(Number.isInteger(v.width)&&Number.isInteger(v.height)&&v.width>0&&v.width<=1280&&v.height>0&&v.height<=720){if(!this.viewport||this.viewport.width!==v.width||this.viewport.height!==v.height||this.viewport.zoom!==v.zoom)this.cancelController();this.viewport=v;}}
        if(m.event==='media'){
            const fullscreen=!!(m.value&&m.value.fullscreen);if(this.controllerFullscreen!==undefined&&this.controllerFullscreen!==fullscreen)this.cancelController();this.controllerFullscreen=fullscreen;
        }
        if(m.event==='started')this.child=true;if(m.event==='blocked'){this.child=null;this.viewport=null;this.surface=null;}
        if(m.event==='fault')this.emit('fault',new Error(m.value));else if(m.event)this.emit(m.event,m.value);
    }
    // Type-2 messages carry a changed row band (see src/frame_delta.js). The
    // client keeps one persistent surface and patches bands into it, so the
    // renderer only uploads the rows that really changed.
    frame(b){
        if(b.length<12||!this.gate.check().allowed||b.readUInt32LE(0)!==this.generation)return;
        const lw=b.readUInt32LE(4),lh=b.readUInt32LE(8);
        // Full frame from a 0.12 runtime (12-byte header) while the runtime update is pending.
        if(lw>=16&&lh>=16&&lw<=1280&&lh<=720&&b.length===12+lw*lh*4){
            this.surface={width:lw,height:lh,generation:this.generation,rgba:b.slice(12)};
            this.emit('frame',{width:lw,height:lh,rgba:this.surface.rgba,dirty:{y:0,rows:lh}});return;
        }
        if(b.length<20)return;
        const w=b.readUInt32LE(4),h=b.readUInt32LE(8),y=b.readUInt32LE(12),rows=b.readUInt32LE(16);
        if(w>1280||h>720||!w||!h||!rows||y+rows>h||b.length!==20+w*rows*4)return;
        const s=this.surface,full=y===0&&rows===h;
        if(full){this.surface={width:w,height:h,generation:this.generation,rgba:b.slice(20)};}
        else if(!s||s.width!==w||s.height!==h||s.generation!==this.generation){this.keyframe();return;}
        else b.copy(s.rgba,y*w*4,20);
        this.emit('frame',{width:w,height:h,rgba:this.surface.rgba,dirty:{y,rows}});
    }
    keyframe(){
        // Ask for a full picture at most every 500 ms when a band cannot be applied.
        const t=Date.now();if(this.channel&&t-(this.lastKeyframe||0)>500){this.lastKeyframe=t;this.channel.json({op:'keyframe'});}
    }
    // Merge rotary detents waiting behind a slow page, without a debounce
    // delay. A press is a barrier: it follows all preceding focus movement,
    // and turns received after it cannot move its selected control first.
    cancelController(){
        this.controllerEpoch=(this.controllerEpoch||0)+1;
        this.scrollPending=null;
        if(this.controllerActive){this.controllerActive.cancelled=true;this.controllerActive.resolve({cancelled:true});}
        (this.controllerQueue||[]).forEach(job=>{job.cancelled=true;job.resolve({cancelled:true});});
        this.controllerQueue=[];this.controllerMode=null;
    }
    controller(op,delta,mode){
        const focus=delta!==null;
        if(!focus)this.scrollPending=null;
        if(focus&&(!Number.isInteger(delta)||!delta||Math.abs(delta)>16))return Promise.reject(new Error('Ungueltige Controller-Drehung'));
        if(!this.channel||!this.gate.check().allowed)return Promise.reject(new Error('Browser nicht freigegeben'));
        if(this.lastAllowed!==true)this.state();
        if(this.controllerMode&&this.controllerMode!==mode)this.cancelController();this.controllerMode=mode;
        const queue=this.controllerQueue||(this.controllerQueue=[]),last=queue[queue.length-1];
        if(focus&&last&&last.op===op&&!last.cancelled&&Math.sign(last.delta)===Math.sign(delta)){last.delta=Math.max(-64,Math.min(64,last.delta+delta));return last.promise;}
        if(queue.length>=32)return Promise.resolve({cancelled:true});
        const job={op,delta,mode,channel:this.channel,generation:this.generation,epoch:this.controllerEpoch||0};
        job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});queue.push(job);this.pumpController();return job.promise;
    }
    pumpController(){
        if(this.controllerPumping)return;this.controllerPumping=true;
        const valid=job=>!job.cancelled&&job.channel===this.channel&&job.generation===this.generation&&job.epoch===(this.controllerEpoch||0)&&this.gate.check().allowed;
        const work=Promise.resolve().then(async()=>{
            while(this.controllerQueue&&this.controllerQueue.length){
                const job=this.controllerQueue.shift();this.controllerActive=job;
                if(!valid(job)){job.resolve({cancelled:true});continue;}
                try{
                    let result={coalesced:true};
                    if(job.delta===null)result=await this.request(job.op);
                    else while(job.delta&&valid(job)){
                        const limit=job.mode==='media'?20:16,step=Math.sign(job.delta)*Math.min(limit,Math.abs(job.delta));job.delta-=step;
                        result=await this.request(job.op,{delta:step});
                    }
                    job.resolve(valid(job)?result:{cancelled:true});
                }catch(error){if(valid(job)){job.reject(error);this.cancelController();}else job.resolve({cancelled:true});}
                this.controllerActive=null;
            }
        });
        const done=()=>{this.controllerActive=null;this.controllerPumping=false;if(this.controllerQueue&&this.controllerQueue.length)this.pumpController();};work.then(done,done);
    }
    // Touch drags produce many small moves; send one wheel event at a time and
    // merge the rest, instead of queueing dozens of CDP round trips.
    scroll(delta,options){
        if(!Number.isFinite(delta))return Promise.resolve();
        const opts=Object.assign({},options||{}),pending=this.scrollPending,epoch=this.controllerEpoch||0;
        const key=JSON.stringify([opts.x,opts.y,opts.modifiers]);
        if(pending&&pending.epoch===epoch&&pending.key===key){pending.delta=Math.max(-1000,Math.min(1000,pending.delta+delta));pending.options.deltaX=Math.max(-1000,Math.min(1000,(pending.options.deltaX||0)+(opts.deltaX||0)));}
        else this.scrollPending={delta:Math.max(-1000,Math.min(1000,delta)),options:opts,key,epoch,channel:this.channel,generation:this.generation};
        if(this.scrolling)return this.scrolling;
        const valid=job=>job.channel===this.channel&&job.generation===this.generation&&job.epoch===(this.controllerEpoch||0)&&this.gate.check().allowed;
        const run=async()=>{
            while(this.scrollPending){
                const job=this.scrollPending;this.scrollPending=null;
                if(!valid(job))continue;
                try{await this.request('scroll',{delta:job.delta,options:job.options});}
                catch(error){
                    // Navigation can reject an old in-flight wheel event after
                    // fresh movement has already queued for the next page.
                    // Its expected cancellation must not erase the new job.
                    if(valid(job))throw error;
                }
            }
        };
        const work=this.scrolling=run().then(r=>{if(this.scrolling===work)this.scrolling=null;return r;},e=>{this.scrollPending=null;if(this.scrolling===work)this.scrolling=null;throw e;});
        return work;
    }
    request(op,args){
        if(!this.channel)return Promise.reject(new Error(require('./browser_service_status').explain()||'Browser-Dienst noch nicht bereit'));
        if(op!=='stop'&&!this.gate.check().allowed)return Promise.reject(new Error(this.gate.check().reason||'Browser nicht freigegeben'));
        this.state();const id=++this.next;
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser-Dienst: Zeitlimit'));},['start','navigate','mediaDemo','wifiScan','vaultUnlock'].includes(op)?30000:15000);this.pending.set(id,{resolve,reject,timer});this.channel.json(Object.assign({},args||{},{id,op}));});
    }
    start(url,options){this.cancelController();return this.request('start',{url,options});}navigate(url){this.cancelController();return this.request('navigate',{url});}tap(x,y,options){this.cancelController();return this.request('tap',{x,y,options});}
    hover(x,y,modifiers){return this.request('hover',{x,y,modifiers});}drag(points,options){this.cancelController();return this.request('drag',{points,options});}
    text(text,options){return this.request('text',{text,options});}fillStructured(value){return this.request('fillStructured',{value});}key(key,modifiers){return this.request('key',{key,modifiers});}back(){this.cancelController();return this.request('back');}
    forward(){this.cancelController();return this.request('forward');}reload(){this.cancelController();return this.request('reload');}stopLoading(){return this.request('stopLoading');}resize(width,height,zoom){this.cancelController();return this.request('resize',{width,height,zoom});}
    newTab(url){this.cancelController();return this.request('newTab',{url:url||''});}selectTab(tabId){this.cancelController();return this.request('selectTab',{tabId});}closeTab(tabId){this.cancelController();return this.request('closeTab',{tabId});}
    clearTab(){this.cancelController();return this.request('clearTab');}
    focusPage(delta){return this.controller('pageFocus',delta,'page');}pressPage(){return this.controller('pagePress',null,'page');}leavePage(){this.cancelController();return this.request('pageLeave');}
    focusMedia(delta){return this.controller('mediaFocus',delta,'media');}pressMedia(){return this.controller('mediaPress',null,'media');}
    mediaAction(action){if(action==='fullscreen'||action==='exit')this.cancelController();return this.request('mediaAction',{action});}
    setLocale(locale){return this.request('locale',{locale});}
    wifiStatus(){return this.request('wifiStatus');}wifiConnect(ssid,password){return this.request('wifiConnect',{ssid,password});}wifiReconnect(){return this.request('wifiReconnect');}
    wifiScan(){return this.request('wifiScan');}
    stop(reason){this.cancelController();this.child=null;this.emit('blocked',reason||'Browser geschlossen');return this.request('stop').catch(()=>{});}
    destroy(){this.cancelController();this.closed=true;clearInterval(this.timer);clearTimeout(this.retry);if(this.channel)this.channel.socket.destroy();}
}
module.exports=BrowserClient;
