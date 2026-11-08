'use strict';
const URL=require('url').URL;
const isIP=require('net').isIP;
const SCHEME=/^[a-z][a-z0-9+.-]*:/i;
// A numeric port after a hostname is address syntax, not a custom scheme.
// Reserved schemes keep their meaning even when their payload is numeric.
const RESERVED=/^(?:https?|javascript|data|file|about|chrome|chrome-extension|devtools|blob|filesystem|view-source|mailto|tel|intent|ftp|wss?)$/i;
function hostPort(value){
    const match=/^(\[[^\]]+\]|[^\s/?#:@\[\]]+):(\d+)(?=[/?#]|$)/.exec(value);
    return !!match&&!RESERVED.test(match[1]);
}
function ipv6Address(value){
    const match=/^([^/?#]+)([/?#].*)?$/.exec(value);
    return match&&isIP(match[1])===6?'['+match[1]+']'+(match[2]||''):null;
}
function allowed(value) {
    if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>4096||/[\x00-\x1f\x7f]/.test(value))return false;
    let u;try { u=new URL(value); } catch(e) { return false; }
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password) return false;
    return !!u.hostname;
}
function normalize(value){
    let v=String(value||'').trim();
    const ipv6=ipv6Address(v);
    if(ipv6)v='https://'+ipv6;
    else if(hostPort(v)||!SCHEME.test(v))v='https://'+v;
    return allowed(v)?new URL(v).href:null;
}
function addressLike(value){
    return SCHEME.test(value)||hostPort(value)||!!ipv6Address(value)||!(/\s/.test(value))&&
        (value.includes('.')||/^localhost([/?#]|$)/i.test(value)||/^\[[^\]]+\]([:/?#]|$)/.test(value));
}
module.exports={allowed,normalize,addressLike};
