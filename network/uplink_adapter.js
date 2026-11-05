'use strict';
// Adapter for the official shared uplink. This module never associates a radio,
// applies routes or changes the system resolver. The root broker authenticates
// its caller before invoking these fixed operations.
const fs=require('fs'),net=require('net'),path=require('path');
const profile=require('./wifi_profile');
function readJson(file,max){
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const st=fs.fstatSync(fd);if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||st.size>max)throw new Error('Unsafe uplink state');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
function request(socketPath,message){return new Promise((resolve,reject)=>{
    const socket=net.createConnection(socketPath);let data='',done=false;
    const finish=(e,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();message.psk=null;e?reject(e):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Internet-Uplink antwortet nicht')),3500);
    socket.on('error',()=>finish(new Error('Internet-Uplink noch nicht gestartet')));
    socket.on('connect',()=>{socket.write(JSON.stringify(message)+'\n');message.psk=null;});
    socket.on('data',chunk=>{data+=chunk.toString('utf8');if(Buffer.byteLength(data)>8192)return finish(new Error('Ungültige Uplink-Antwort'));if(data.includes('\n')){try{const r=JSON.parse(data);if(r.ok!==true)return finish(new Error(String(r.error||'Uplink-Anfrage fehlgeschlagen').slice(0,256)));finish(null,r);}catch(e){finish(e);}}});
    socket.on('end',()=>{if(!done)finish(new Error('Unvollständige Uplink-Antwort'));});
});}
function networks(state){return ((state.wifi||{}).networks||[]).filter(n=>typeof n.ssid==='string'&&Buffer.byteLength(n.ssid)<=32&&!/[\x00-\x1f\x7f]/.test(n.ssid)).slice(0,32).map(n=>({ssid:n.ssid,signal:Number.isFinite(n.signal)?Math.max(-127,Math.min(0,n.signal)):-127,secure:!!n.secure,saved:!!n.saved,current:!!n.current,frequency:0}));}
function resolver(lease){
    if(!lease||!Array.isArray(lease.dns)||!net.isIP(lease.ip))return null;
    const dns=lease.dns.slice(0,3);if(!dns.length||dns.some(ip=>typeof ip!=='string'||!net.isIP(ip)))return null;
    return dns.map(ip=>'nameserver '+ip+'\n').join('')+'options timeout:2 attempts:2\n';
}
function writeOwned(file,data,mode,gid){
    const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,mode);
    try{const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||st.nlink!==1)throw new Error('Unsafe browser network output');fs.ftruncateSync(fd,0);fs.writeSync(fd,data);fs.fchownSync(fd,process.getuid(),gid);fs.fchmodSync(fd,mode);}finally{fs.closeSync(fd);}
}
class UplinkAdapter{
    constructor(base,options){
        options=options||{};this.base=base;this.shared=true;this.error='';
        this.statusFile=options.statusFile||'/run/mgu-uplink/status.json';this.leaseFile=options.leaseFile||'/run/mgu-uplink/lease.json';
        this.socket=options.socket||'/run/mgu-uplink/ctl.sock';this.group=options.group===undefined?12443:options.group;this.resolverGroup=options.resolverGroup===undefined?0:options.resolverGroup;
        this.send=options.request||((m)=>request(this.socket,m));this.wait=options.wait||(ms=>new Promise(r=>setTimeout(r,ms)));
        this.lastSync='';if(options.watch!==false){this.timer=setInterval(()=>this.syncLease(),2000);this.timer.unref();this.syncLease();}
    }
    readState(){try{return readJson(this.statusFile,131072);}catch(e){return {state:'down',wifi:{},error:'Internet-Uplink noch nicht gestartet'};}}
    status(){const s=this.readState(),w=s.wifi||{},saved=Array.isArray(w.saved)?w.saved.filter(x=>typeof x==='string').slice(0,32):[];
        return {supported:true,shared:true,ssid:typeof w.ssid==='string'?w.ssid:saved[0]||'',saved:saved.length>0,joining:['connecting','connected','scanning'].includes(w.link),connected:s.state==='online',error:String(w.error||s.error||this.error||'').slice(0,256)};}
    async connect(ssid,password){
        profile.validate(ssid,password);if(password.length>63||/[^\x20-\x7e]/.test(password))throw new Error('Der gemeinsame Uplink benötigt ein Passwort mit 8 bis 63 druckbaren Zeichen');
        try{await this.send({op:'wifi-enable',on:true});await this.send({op:'wifi-connect',ssid,psk:password});this.error='';return Object.assign(this.status(),{joining:true});}finally{password=null;}
    }
    async reconnect(){const s=this.status();if(!s.saved||!s.ssid)throw new Error('Zuerst ein WLAN im MGU Store oder Browser speichern');await this.send({op:'wifi-enable',on:true});await this.send({op:'wifi-connect',ssid:s.ssid});this.error='';return Object.assign(this.status(),{joining:true});}
    async scan(){await this.send({op:'wifi-enable',on:true});await this.send({op:'wifi-scan'});await this.wait(8500);return {supported:true,shared:true,networks:networks(this.readState())};}
    syncLease(){
        try{const s=this.readState();let lease=null;try{lease=readJson(this.leaseFile,16384);}catch(e){}
            const content=s.state==='online'?resolver(lease):null,online=!!content,key=JSON.stringify({online,content,stamp:lease&&lease.updated});
            if(this.lastSync===key)return;
            writeOwned(path.join(this.base,'resolv.conf'),content||'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n',0o644,this.resolverGroup);
            writeOwned(path.join(this.base,'../network-status.json'),JSON.stringify({connected:online,shared:true,updated:new Date().toISOString()}),0o640,this.group);
            this.lastSync=key;this.error='';
        }catch(e){this.error='Browser-DNS für den gemeinsamen Uplink konnte nicht aktualisiert werden';}
    }
    close(){clearInterval(this.timer);}
}
module.exports=UplinkAdapter;
module.exports.networks=networks;module.exports.resolver=resolver;module.exports.request=request;
