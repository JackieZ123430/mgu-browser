'use strict';
const net=require('net');
module.exports=function request(message){return new Promise((resolve,reject)=>{
    const socket=net.createConnection('/run/mgu-browser-wifi/control.sock');let text='',done=false;
    const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();err?reject(err):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('WLAN-Dienst antwortet nicht')),message.op==='scan'?25000:['connect','reconnect'].includes(message.op)?12000:4000);
    socket.on('error',()=>finish(new Error('WLAN-Einstellungsdienst noch nicht installiert oder gestartet')));
    socket.on('connect',()=>{socket.write(JSON.stringify(message)+'\n');message.password=null;});
    socket.on('data',chunk=>{
        text+=chunk.toString('utf8');if(text.length>8192)return finish(new Error('Ungueltige WLAN-Antwort'));
        if(text.includes('\n')){try{const r=JSON.parse(text);finish(r.error?new Error(r.error):null,r.result);}catch(e){finish(new Error('Ungueltige WLAN-Antwort'));}}
    });
    socket.on('end',()=>{if(!done)finish(new Error('WLAN-Dienst hat die Anfrage beendet'));});
});};
