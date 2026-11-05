'use strict';
const URL=require('url').URL;
function allowed(value) {
    if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>4096)return false;
    let u;try { u=new URL(value); } catch(e) { return false; }
    if (u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443')) return false;
    return !!u.hostname;
}
function normalize(value){let v=String(value||'').trim();if(!/^[a-z][a-z0-9+.-]*:/i.test(v))v='https://'+v;return allowed(v)?new URL(v).href:null;}
module.exports={allowed,normalize};
