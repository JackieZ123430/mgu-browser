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
        socket.on('error',e=>{this.emit('diagnostic','Browser-Verbindung: '+e.code);});socket.on('connect',()=>{this.channel=new Channel(socket);this.channel.on('json',m=>this.receive(m));this.channel.on('frame',b=>this.frame(b));this.state();});
        socket.on('close',()=>{this.channel=null;this.child=null;this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(new Error('Browser-Dienst getrennt'));});this.pending.clear();if(!this.closed)this.retry=setTimeout(()=>this.connect(),2000);});
    }
    state(){
        const allowed=this.gate.check().allowed;
        if(allowed!==this.lastAllowed){this.generation++;this.lastAllowed=allowed;if(!allowed){this.child=null;this.emit('blocked','Browser nicht im Vordergrund');}}
        if(this.channel)this.channel.json({op:'state',allowed,generation:this.generation});
    }
    receive(m){
        if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result||{});}return;}
        if(m.event==='started')this.child=true;if(m.event==='blocked')this.child=null;
        if(m.event==='fault')this.emit('fault',new Error(m.value));else if(m.event)this.emit(m.event,m.value);
    }
    frame(b){
        if(b.length<12||!this.gate.check().allowed||b.readUInt32LE(0)!==this.generation)return;
        const w=b.readUInt32LE(4),h=b.readUInt32LE(8);if(w>1280||h>720||!w||!h||b.length!==12+w*h*4)return;
        this.emit('frame',{width:w,height:h,rgba:b.slice(12)});
    }
    request(op,args){
        if(!this.channel)return Promise.reject(new Error('Browser-Dienst noch nicht bereit'));
        if(op!=='stop'&&!this.gate.check().allowed)return Promise.reject(new Error(this.gate.check().reason||'Browser nicht freigegeben'));
        this.state();const id=++this.next;
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser-Dienst: Zeitlimit'));},['start','navigate','mediaDemo','wifiScan','vaultUnlock'].includes(op)?30000:15000);this.pending.set(id,{resolve,reject,timer});this.channel.json(Object.assign({},args||{},{id,op}));});
    }
    start(url){return this.request('start',{url});}navigate(url){return this.request('navigate',{url});}tap(x,y){return this.request('tap',{x,y});}
    text(text){return this.request('text',{text});}key(key,shift){return this.request('key',{key,shift});}scroll(delta){return this.request('scroll',{delta});}back(){return this.request('back');}
    forward(){return this.request('forward');}reload(){return this.request('reload');}stopLoading(){return this.request('stopLoading');}resize(width,height){return this.request('resize',{width,height});}
    newTab(url){return this.request('newTab',{url:url||''});}selectTab(tabId){return this.request('selectTab',{tabId});}closeTab(tabId){return this.request('closeTab',{tabId});}
    clearTab(){return this.request('clearTab');}
    mediaAction(action){return this.request('mediaAction',{action});}
    setLocale(locale){return this.request('locale',{locale});}
    wifiStatus(){return this.request('wifiStatus');}wifiConnect(ssid,password){return this.request('wifiConnect',{ssid,password});}wifiReconnect(){return this.request('wifiReconnect');}
    wifiScan(){return this.request('wifiScan');}
    stop(reason){this.child=null;this.emit('blocked',reason||'Browser geschlossen');return this.request('stop').catch(()=>{});}
    destroy(){this.closed=true;clearInterval(this.timer);clearTimeout(this.retry);if(this.channel)this.channel.socket.destroy();}
}
module.exports=BrowserClient;
