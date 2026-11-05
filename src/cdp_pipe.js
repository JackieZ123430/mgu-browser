'use strict';
const EventEmitter=require('events');

// Chromium --remote-debugging-pipe: NUL-terminated JSON on inherited fd 3/4.
// No debugging TCP listener, WebSocket, HTTP server or public browser port.
class CdpPipe extends EventEmitter {
    constructor(input, output, options) {
        super();this.input=input;this.output=output;this.pending=new Map();this.nextId=0;
        this.buffer=Buffer.alloc(0);this.closed=false;this.maxBytes=(options&&options.maxBytes)||12*1024*1024;
        output.on('data',data=>this.receive(data));
        output.on('end',()=>this.close(new Error('Browser-Pipe beendet')));
        output.on('error',e=>this.close(e));input.on('error',e=>this.close(e));
    }
    send(method, params, sessionId, timeoutMs) {
        if (this.closed) return Promise.reject(new Error('Browser-Pipe geschlossen'));
        const id=++this.nextId,packet={id,method,params:params||{}};
        if (sessionId) packet.sessionId=sessionId;
        return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(method+': Zeitlimit'));},timeoutMs||10000);
            this.pending.set(id,{resolve,reject,timer});
            try { this.input.write(JSON.stringify(packet)+'\0'); }
            catch(e) { clearTimeout(timer);this.pending.delete(id);reject(e); }
        });
    }
    receive(chunk) {
        if (this.closed) return;
        this.buffer=Buffer.concat([this.buffer,chunk]);
        let end;
        while ((end=this.buffer.indexOf(0))!==-1) {
            if (end>this.maxBytes) return this.close(new Error('Browser-Nachricht zu groß'));
            const raw=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);
            if (!raw.length) continue;
            let message;
            try { message=JSON.parse(raw.toString('utf8')); }
            catch(e) { return this.close(new Error('Ungültige Browser-Nachricht')); }
            if (message.id) {
                const p=this.pending.get(message.id);
                if (p) { clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result||{}); }
            } else if (typeof message.method==='string') this.emit('event',message);
        }
        if (this.buffer.length>this.maxBytes) this.close(new Error('Browser-Nachricht zu groß'));
    }
    close(error) {
        if (this.closed) return;
        this.closed=true;
        this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(error||new Error('Browser beendet'));});this.pending.clear();
        this.emit('closed',error);
    }
}
module.exports=CdpPipe;
