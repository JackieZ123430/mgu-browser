'use strict';
const net=require('net'),EventEmitter=require('events'),Channel=require('./ipc_protocol');
class BrowserClient extends EventEmitter {
    constructor(options){
        super();this.gate=options.gate;this.channel=null;this.child=null;this.pending=new Map();this.next=0;this.generation=1;this.lastAllowed=false;
        this.socketPath=options.socketPath||(process.env.MGU_EMULATOR_MODE==='1'&&process.env.MGU_BROWSER_SOCKET)||'/var/opt/mgu-browser/data/backend.sock';
        this.connect();this.timer=setInterval(()=>this.state(),300);
        this.gate.onBlock=reason=>{this.generation++;this.child=null;this.emit('blocked',reason);this.state();};
    }
    connect(){
        const socket=net.createConnection(this.socketPath);
        socket.on('error',e=>{this.emit('diagnostic','Browser-Verbindung: '+e.code);});socket.on('connect',()=>{this.surface=null;this.channel=new Channel(socket);this.channel.on('json',m=>this.receive(m));this.channel.on('frame',b=>this.frame(b));this.state();});
        socket.on('close',()=>{this.channel=null;this.child=null;this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(new Error('Browser-Dienst getrennt'));});this.pending.clear();if(!this.closed)this.retry=setTimeout(()=>this.connect(),2000);});
    }
    state(){
        const allowed=this.gate.check().allowed;
        if(allowed!==this.lastAllowed){this.generation++;this.lastAllowed=allowed;if(!allowed){this.child=null;this.emit('blocked','Browser nicht im Vordergrund');}}
        if(this.channel)this.channel.json({op:'state',allowed,generation:this.generation,frames:2});
    }
    receive(m){
        if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result||{});}return;}
        if(m.event==='started')this.child=true;if(m.event==='blocked')this.child=null;
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
    // Touch drags produce many small moves; send one wheel event at a time and
    // merge the rest, instead of queueing dozens of CDP round trips.
    scroll(delta){
        if(!Number.isFinite(delta))return Promise.resolve();
        if(this.scrolling){this.scrollRest=(this.scrollRest||0)+delta;return this.scrolling;}
        const run=d=>this.request('scroll',{delta:Math.max(-1000,Math.min(1000,d))}).catch(e=>{this.scrollRest=0;throw e;}).then(()=>{
            const rest=this.scrollRest||0;this.scrollRest=0;if(Math.abs(rest)>=1)return run(rest);
        });
        const work=this.scrolling=run(delta).then(r=>{if(this.scrolling===work)this.scrolling=null;return r;},e=>{if(this.scrolling===work)this.scrolling=null;throw e;});
        return work;
    }
    request(op,args){
        if(!this.channel)return Promise.reject(new Error('Browser-Dienst noch nicht bereit'));
        if(op!=='stop'&&!this.gate.check().allowed)return Promise.reject(new Error(this.gate.check().reason||'Browser nicht freigegeben'));
        this.state();const id=++this.next;
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser-Dienst: Zeitlimit'));},['start','navigate','mediaDemo','wifiScan','vaultUnlock'].includes(op)?30000:15000);this.pending.set(id,{resolve,reject,timer});this.channel.json(Object.assign({},args||{},{id,op}));});
    }
    start(url){return this.request('start',{url});}navigate(url){return this.request('navigate',{url});}tap(x,y){return this.request('tap',{x,y});}
    text(text){return this.request('text',{text});}key(key,shift){return this.request('key',{key,shift});}back(){return this.request('back');}
    forward(){return this.request('forward');}reload(){return this.request('reload');}stopLoading(){return this.request('stopLoading');}resize(width,height){return this.request('resize',{width,height});}
    newTab(url){return this.request('newTab',{url:url||''});}selectTab(tabId){return this.request('selectTab',{tabId});}closeTab(tabId){return this.request('closeTab',{tabId});}
    clearTab(){return this.request('clearTab');}
    focusPage(delta){return this.request('pageFocus',{delta});}pressPage(){return this.request('pagePress');}leavePage(){return this.request('pageLeave');}
    mediaAction(action){return this.request('mediaAction',{action});}
    setLocale(locale){return this.request('locale',{locale});}
    wifiStatus(){return this.request('wifiStatus');}wifiConnect(ssid,password){return this.request('wifiConnect',{ssid,password});}wifiReconnect(){return this.request('wifiReconnect');}
    wifiScan(){return this.request('wifiScan');}
    stop(reason){this.child=null;this.emit('blocked',reason||'Browser geschlossen');return this.request('stop').catch(()=>{});}
    destroy(){this.closed=true;clearInterval(this.timer);clearTimeout(this.retry);if(this.channel)this.channel.socket.destroy();}
}
module.exports=BrowserClient;
