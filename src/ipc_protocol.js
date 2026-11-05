'use strict';
const EventEmitter=require('events');
const MAX_JSON=64*1024;
class Channel extends EventEmitter {
    constructor(socket){super();this.socket=socket;this.header=Buffer.alloc(8);this.headerAt=0;this.body=null;this.bodyAt=0;socket.on('data',b=>this.receive(b));socket.on('close',()=>this.emit('closed'));socket.on('error',()=>{});}
    receive(data){
        let at=0;
        while(at<data.length){
            if(!this.body){
                const n=Math.min(8-this.headerAt,data.length-at);data.copy(this.header,this.headerAt,at,at+n);this.headerAt+=n;at+=n;
                if(this.headerAt<8)return;
                this.type=this.header.readUInt32LE(0);const length=this.header.readUInt32LE(4),max=this.type===1?MAX_JSON:4*1024*1024;
                if(![1,2].includes(this.type)||!length||length>max){this.socket.destroy();return;}
                // Allocate once per bounded frame, avoiding quadratic copies of
                // ~2 MiB pixel buffers on the headunit's Node 8 runtime.
                this.body=Buffer.allocUnsafe(length);this.bodyAt=0;
            }
            const n=Math.min(this.body.length-this.bodyAt,data.length-at);data.copy(this.body,this.bodyAt,at,at+n);this.bodyAt+=n;at+=n;
            if(this.bodyAt<this.body.length)return;
            const b=this.body,type=this.type;this.body=null;this.headerAt=0;
            if(type===1){let m;try{m=JSON.parse(b.toString('utf8'));}catch(e){this.socket.destroy();return;}this.emit('json',m);}else this.emit('frame',b);
        }
    }
    send(type,body){if(this.socket.destroyed)return false;const h=Buffer.alloc(8);h.writeUInt32LE(type);h.writeUInt32LE(body.length,4);return this.socket.write(Buffer.concat([h,body]));}
    json(value){
        let body=Buffer.from(JSON.stringify(value));
        if(body.length>MAX_JSON)body=Buffer.from(JSON.stringify(value&&Number.isInteger(value.id)?{id:value.id,error:'Browser-Nachricht zu groß'}:{event:'fault',value:'Browser-Nachricht zu groß'}));
        return this.send(1,body);
    }
}
Channel.MAX_JSON=MAX_JSON;
module.exports=Channel;
