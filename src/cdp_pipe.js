'use strict';
const EventEmitter=require('events');

// Chromium --remote-debugging-pipe: NUL-terminated JSON on inherited fd 3/4.
// No debugging TCP listener, WebSocket, HTTP server or public browser port.
class CdpPipe extends EventEmitter {
    constructor(input, output, options) {
        super();this.input=input;this.output=output;this.pending=new Map();this.nextId=0;
        this.chunks=[];this.size=0;this.closed=false;this.maxBytes=(options&&options.maxBytes)||12*1024*1024;
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
    // Chromium screencast messages are large (base64 JPEG). Keep received
    // chunks in a list and only join them once a full message has arrived;
    // the old concat-per-chunk approach copied every frame several times.
    receive(chunk) {
        if (this.closed) return;
        if (!this.chunks) { this.chunks=[]; this.size=0; }
        let start=0,end;
        while ((end=chunk.indexOf(0,start))!==-1) {
            const tail=chunk.slice(start,end);
            const raw=this.size?Buffer.concat(this.chunks.concat([tail]),this.size+tail.length):tail;
            this.chunks=[];this.size=0;start=end+1;
            if (raw.length>this.maxBytes) return this.close(new Error('Browser-Nachricht zu groß'));
            if (!raw.length) continue;
            let message;
            try { message=JSON.parse(raw.toString('utf8')); }
            catch(e) { return this.close(new Error('Ungültige Browser-Nachricht')); }
            this.dispatch(message);
            if (this.closed) return;
        }
        if (start<chunk.length) { this.chunks.push(start?chunk.slice(start):chunk); this.size+=chunk.length-start; }
        if (this.size>this.maxBytes) this.close(new Error('Browser-Nachricht zu groß'));
    }
    dispatch(message) {
        if (message.id) {
            const p=this.pending.get(message.id);
            if (p) { clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result||{}); }
        } else if (typeof message.method==='string') this.emit('event',message);
    }
    // Rejects outstanding requests of a finished session while the pipe stays
    // usable for the final cookie snapshot and Browser.close.
    cancelPending(error) {
        this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(error||new Error('Browser beendet'));});this.pending.clear();
    }
    close(error) {
        if (this.closed) return;
        this.closed=true;
        this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(error||new Error('Browser beendet'));});this.pending.clear();
        this.emit('closed',error);
    }
}
module.exports=CdpPipe;
