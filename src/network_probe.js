'use strict';
const dns=require('dns'),https=require('https'),fs=require('fs'),net=require('net');
module.exports=function(){
    return new Promise(resolve=>{
        const result={uid:process.getuid(),dns:false,https:false};let settled=false;
        const finish=()=>{if(!settled){settled=true;clearTimeout(timer);resolve(result);}};
        const timer=setTimeout(()=>{result.error='timeout';if(request)request.destroy();finish();},7000);
        let request;
        const resolver=new dns.Resolver();
        const servers=fs.readFileSync('/etc/resolv.conf','utf8').split('\n').map(l=>l.match(/^\s*nameserver\s+(\S+)/)).filter(Boolean).map(m=>m[1]).filter(s=>net.isIP(s));
        if(servers.length)resolver.setServers(servers);
        resolver.resolve4('example.net',(e,addresses)=>{
            const address=addresses&&addresses[0];
            if(settled)return;if(e){result.error=e.code;finish();return;}result.dns=!!address;
            request=https.get({hostname:'example.net',port:443,path:'/',servername:'example.net',lookup:(name,options,callback)=>callback(null,address,4)},response=>{
                result.status=response.statusCode;result.https=response.statusCode>=200&&response.statusCode<400;
                response.destroy();finish();
            });
            request.on('error',error=>{result.error=error.code||error.message;finish();});
        });
    });
};
