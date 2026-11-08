'use strict';
const EventEmitter=require('events');
const RequestFilter=require('./cdp_request_filter');

// Chromium --remote-debugging-pipe: NUL-terminated JSON on inherited fd 3/4.
// No debugging TCP listener, WebSocket, HTTP server or public browser port.
class CdpPipe extends EventEmitter {
    constructor(input, output, options) {
        super();this.input=input;this.output=output;this.pending=new Map();this.nextId=0;
        this.chunks=[];this.size=0;this.filter=null;this.closed=false;this.maxBytes=(options&&options.maxBytes)||12*1024*1024;
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
            this.pending.set(id,{resolve,reject,timer,sessionId:sessionId||null,method});
            try { this.input.write(JSON.stringify(packet)+'\0'); }
            catch(e) { clearTimeout(timer);this.pending.delete(id);reject(e); }
        });
    }
    // Chromium screencast messages are large (base64 JPEG). Keep received
    // chunks in a list and only join them once a full message has arrived;
    // the old concat-per-chunk approach copied every frame several times.
    receive(chunk) {
        if (this.closed) return;
        let start=0,end;
        while ((end=chunk.indexOf(0,start))!==-1) {
            const tail=chunk.slice(start,end);
            let message;
            try{
                if(!this.filter&&!tail.length){start=end+1;continue;}
                const filter=this.filter||(this.filter=new RequestFilter(this.maxBytes));filter.write(tail);const raw=filter.finish();
                message=JSON.parse(raw.toString('utf8'));if(!message||typeof message!=='object'||Array.isArray(message)||filter.filtered&&!['Fetch.requestPaused','Fetch.authRequired','Network.requestWillBeSent'].includes(message.method))throw Error('Ungültige Browser-Nachricht');RequestFilter.strip(message);
            }catch(e){return this.close(new Error(e.message==='Browser-Nachricht zu groß'?e.message:'Ungültige Browser-Nachricht'));}
            this.filter=null;this.size=0;start=end+1;
            this.dispatch(message);
            if (this.closed) return;
        }
        if(start<chunk.length)try{const filter=this.filter||(this.filter=new RequestFilter(this.maxBytes));filter.write(start?chunk.slice(start):chunk);this.size=filter.size;}catch(e){this.close(new Error(e.message==='Browser-Nachricht zu groß'?e.message:'Ungültige Browser-Nachricht'));}
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
    cancelSession(sessionId,error){
        if(typeof sessionId!=='string'||!sessionId)return;
        for(const [id,pending] of this.pending){
            // These commands can legitimately retire their own target before
            // their acknowledgment. Keep their existing bounded deadline.
            if(pending.sessionId!==sessionId||pending.method==='Page.close'||pending.method==='Page.handleJavaScriptDialog')continue;
            clearTimeout(pending.timer);this.pending.delete(id);pending.reject(error||new Error('Seitenverbindung beendet'));
        }
    }
    close(error) {
        if (this.closed) return;
        this.closed=true;
        this.filter=null;this.chunks=[];this.size=0;
        this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(error||new Error('Browser beendet'));});this.pending.clear();
        this.emit('closed',error);
    }
}
module.exports=CdpPipe;
