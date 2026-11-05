'use strict';
// Narrow root broker. No shell, arbitrary paths, command strings or credential replies.
const fs=require('fs'),net=require('net');
function serve(options){
    const adapter=options.adapter,server=net.createServer(socket=>{
        try{if(options.peerUid(socket._handle.fd)!==options.uid){socket.destroy();return;}}catch(e){socket.destroy();return;}
        let buffer='',used=false;socket.setTimeout(3000,()=>socket.destroy());
        socket.on('error',()=>{});
        socket.on('data',async chunk=>{
            if(used)return;buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>4096)return socket.destroy();
            if(!buffer.includes('\n'))return;used=true;
            let message;
            try{
                try{message=JSON.parse(buffer);}catch(e){throw new Error('Ungueltige WLAN-Anfrage');}buffer='';let result;
                if(message.op==='status')result=await adapter.status();
                else if(message.op==='connect'){socket.setTimeout(11000,()=>socket.destroy());result=await adapter.connect(message.ssid,message.password);}
                else if(message.op==='reconnect'){socket.setTimeout(11000,()=>socket.destroy());result=await adapter.reconnect();}
                else if(message.op==='scan'){socket.setTimeout(24000,()=>socket.destroy());result=await adapter.scan();}
                else throw new Error('Unbekannter WLAN-Befehl');
                if(message)message.password=null;socket.end(JSON.stringify({result})+'\n');
            }catch(e){if(message)message.password=null;socket.end(JSON.stringify({error:e.message})+'\n');}
        });
    });
    server.listen(options.socket,()=>{fs.chmodSync(options.socket,0o660);if(options.group!==undefined)fs.chownSync(options.socket,0,options.group);});return server;
}
module.exports=serve;
if(require.main===module){
    if(process.getuid()!==0)throw new Error('Root WLAN broker required');
    const setup=require('../runtime/setup');let identity;
    function launch(){identity=setup.prepare();if(!identity.ready){setTimeout(launch,5000);return;}start(identity);}
    function start(identity){
    const Adapter=require('./uplink_adapter');
    const adapter=new Adapter('/var/opt/mgu-browser/network',{group:identity.appUid});
    const peer=require('/var/opt/mgu-browser/current/backend/peer_uid.node');
    const socket='/run/mgu-browser-wifi/control.sock';try{fs.unlinkSync(socket);}catch(e){if(e.code!=='ENOENT')throw e;}
    const server=serve({adapter,socket,uid:identity.serviceUid,group:identity.serviceUid,peerUid:fd=>peer.peerUid(fd)});
    for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{adapter.close();server.close(()=>process.exit(0));});
    }
    launch();
}
