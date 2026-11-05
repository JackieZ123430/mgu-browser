'use strict';
const https=require('https'),dns=require('dns'),zlib=require('zlib'),URL=require('url').URL;
const policy=require('./url_policy');
function load(url,servers){
    const started=Date.now(),resolver=new dns.Resolver();if(servers&&servers.length)resolver.setServers(servers);
    function get(address,depth){return new Promise((resolve,reject)=>{
        if(!policy.allowed(address)||depth>5||Date.now()-started>20000)return reject(new Error('HTTPS-Adresse oder Weiterleitung ungueltig'));
        const u=new URL(address);let complete=false;
        const request=https.get({hostname:u.hostname,path:u.pathname+u.search,port:443,headers:{'User-Agent':'MGU-NativeReader/0.4','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
            lookup:(host,opts,cb)=>resolver.resolve4(host,(e,ips)=>{if(e)return cb(e);if(opts&&opts.all)cb(null,ips.map(address=>({address,family:4})));else cb(null,ips[0],4);})},response=>{
            if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){response.resume();finish(null,get(new URL(response.headers.location,address).href,depth+1));return;}
            if(response.statusCode!==200){response.resume();finish(new Error('HTTP '+response.statusCode));return;}
            if(!/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type']||'')){response.resume();finish(new Error('Dieser Lesemodus unterstuetzt HTML-Seiten'));return;}
            let stream=response,bytes=0,chunks=[];
            const enc=response.headers['content-encoding'];if(enc==='gzip')stream=response.pipe(zlib.createGunzip());else if(enc==='deflate')stream=response.pipe(zlib.createInflate());else if(enc&&enc!=='identity'){response.destroy();finish(new Error('Unbekannte Seitenkompression'));return;}
            stream.on('error',finish);response.on('error',finish);
            stream.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024){stream.destroy();response.destroy();finish(new Error('Seite groesser als 2 MiB'));}else chunks.push(b);});
            stream.on('end',()=>finish(null,{url:address,status:response.statusCode,html:Buffer.concat(chunks).toString('utf8'),bytes}));
        });
        const timer=setTimeout(()=>{request.destroy();resolver.cancel();finish(new Error('WLAN-Anfrage abgelaufen'));},Math.min(10000,Math.max(1000,20000-(Date.now()-started))));
        function finish(error,result){if(complete)return;complete=true;clearTimeout(timer);error?reject(error):resolve(result);}
        request.on('error',finish);
    });}
    return get(url,0);
}
module.exports={load};
