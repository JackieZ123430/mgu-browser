'use strict';
const fs=require('fs'),cp=require('child_process'),profile=require('./wifi_profile');
class WifiAdapter{
    constructor(base){this.base=base;this.child=null;this.joining=false;this.error='';}
    status(){
        let state={};try{state=JSON.parse(fs.readFileSync(this.base+'/../network-status.json','utf8'));}catch(e){}
        return {supported:true,ssid:profile.ssid(this.base),saved:!!profile.ssid(this.base),joining:this.joining,connected:!this.joining&&!!state.connected,error:this.error};
    }
    connect(ssid,password){if(this.joining||this.scanning)throw new Error('Laufenden WLAN-Vorgang bitte abwarten');profile.save(this.base,ssid,password);password=null;return this.reconnect();}
    scan(){
        if(this.joining)throw new Error('Bitte den laufenden Verbindungsaufbau abwarten');
        if(this.scanning)return this.scanning;
        const work=require('./wifi_scan').scan(this.base);this.scanning=work;
        const clear=()=>{this.scanning=null;};work.then(clear,clear);return work;
    }
    reconnect(){
        if(this.scanning)throw new Error('Laufenden WLAN-Scan bitte abwarten');
        if(this.joining)throw new Error('WLAN-Verbindung wird bereits aufgebaut');
        if(!profile.ssid(this.base))throw new Error('Zuerst WLAN-Name und Passwort eingeben');
        if(this.child)this.child.kill('SIGTERM');
        this.joining=true;this.error='';
        const child=this.child=cp.spawn('/usr/bin/node',[require('path').join(__dirname,'start_wifi.js')],{stdio:['ignore','pipe','ignore']});
        let output='';
        const timer=setTimeout(()=>{if(this.child===child&&this.joining){this.error='WLAN-Zeitlimit erreicht';this.joining=false;child.kill('SIGTERM');}},80000);
        child.stdout.on('data',b=>{output=(output+b.toString('utf8')).slice(-512);if(output.includes('Browser WLAN startup complete')){this.joining=false;clearTimeout(timer);}});
        const ended=()=>{clearTimeout(timer);if(this.child===child){if(this.joining){this.error='WLAN-Verbindung fehlgeschlagen. Hotspot, Passwort und Empfang pruefen.';this.joining=false;}this.child=null;}};
        child.on('error',ended);child.on('exit',ended);return this.status();
    }
    close(){if(this.child)this.child.kill('SIGTERM');}
}
module.exports=WifiAdapter;
