'use strict';
// Phone remote control for the browser.
//
// The head unit shows a QR code with a one-time link. The phone (normally the
// hotspot the MGU is connected to, or a phone in the car's own WLAN) opens it
// and gets a small control page: live view with tapping and scrolling, typing
// into the focused field (logins), sending links and switching tabs.
//
// Security: plain HTTP inside the private WLAN only; a 128-bit random token in
// the link authorizes every request; only private/link-local source addresses
// are answered; the session ends on request, after 30 minutes without use, or
// when the backend stops. Every browser action still requires the browser app
// to be in the foreground (the existing visibility gate).
const http=require('http'),fs=require('fs'),crypto=require('crypto'),os=require('os'),EventEmitter=require('events');
const URLPolicy=require('./url_policy'),{inputURL}=require('./browser_state'),Metadata=require('./browser_metadata');
const page=require('./remote_page');
const PORT=39123,IDLE_MS=30*60*1000,CLIENT_MS=8000,BODY_LIMIT=512*1024;
const KEYS=['Enter','Tab','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Delete','Home','End','PageUp','PageDown','Insert',' '];

function privateAddress(address){
    const a=String(address||'').replace(/^::ffff:/,'');
    const m=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
    if(m){
        const b=m.slice(1).map(Number);
        return b[0]===10||(b[0]===172&&b[1]>=16&&b[1]<=31)||(b[0]===192&&b[1]===168)||(b[0]===169&&b[1]===254)||b[0]===127;
    }
    return /^(fe[89ab][0-9a-f]:|f[cd][0-9a-f]{2}:|::1$)/i.test(a);
}
// The address the phone can reach: the hotspot client interface first, then
// the car's own access point, then (development) any private IPv4.
// The address the phone can reach: the Wi-Fi uplink first (the head unit
// joined the phone's own hotspot, wlan1 or wlan0), then the BMW access
// point, then (development) any private IPv4.
function uplinkName(){
    try{const lease=JSON.parse(fs.readFileSync('/run/mgu-uplink/lease.json','utf8'));return /^wlan[0-9]$/.test(lease.interface)?lease.interface:null;}catch(e){return null;}
}
function localAddress(interfaces,uplink){
    const list=interfaces||os.networkInterfaces();
    const preferred=[uplink===undefined?uplinkName():uplink,'wlan1','wlan0','wlan_bridge'].filter(Boolean);
    for(const name of preferred){
        const hit=(list[name]||[]).find(a=>a.family==='IPv4'&&!a.internal&&privateAddress(a.address));
        if(hit)return hit.address;
    }
    for(const name of Object.keys(list)){
        const hit=(list[name]||[]).find(a=>a.family==='IPv4'&&!a.internal&&privateAddress(a.address));
        if(hit)return hit.address;
    }
    return null;
}
function same(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}

class RemoteControl extends EventEmitter{
    constructor(options){
        super();this.options=options||{};this.browser=this.options.browser;this.port=this.options.port||PORT;
        this.token=null;this.server=null;this.lastUse=0;this.clientSeen=0;this.frame=null;this.frameSeq=0;this.transfers=new Set();this.permissionRequests=new Map();
        this.view={url:'',title:'',tabs:[],editable:false,password:false,loading:false,canBack:false,canForward:false};
        const b=this.browser;
        b.on('tabs',tabs=>{this.view.tabs=(tabs||[]).map(t=>({id:t.id,title:Metadata.title(t.title),url:t.url,active:!!t.active}));});
        b.on('navigationState',s=>{if(s){this.view.url=s.url||'';this.view.title=s.title||'';this.view.canBack=!!s.canBack;this.view.canForward=!!s.canForward;}});
        b.on('input',s=>{this.view.editable=!!(s&&s.editable);this.view.password=!!(s&&s.password);this.view.type=s&&s.type||'';this.view.multiline=!!(s&&s.multiline);});
        b.on('dialog',s=>{this.view.dialog=s||null;});
        b.on('auth',s=>{this.view.auth=s||null;});
        b.on('find',s=>{this.view.find=s;});
        b.on('files',s=>{this.view.files=s;});
        b.on('fileChooser',s=>{if(this.view.files)this.view.files.chooser=s||null;});
        b.on('permission',s=>{if(s&&s.state==='requested')this.permissionRequests.set(s.id,s);else if(s)this.permissionRequests.delete(s.id);else this.permissionRequests.clear();this.view.permission=this.permissionRequests.values().next().value||null;});
        b.on('loading',v=>{this.view.loading=!!v;});
        b.on('blocked',()=>{this.frame=null;this.view.tabs=[];this.view.dialog=null;this.view.auth=null;this.permissionRequests.clear();this.view.permission=null;if(this.view.files)this.view.files.chooser=null;});
        b.on('screencastJpeg',jpeg=>{this.frame=jpeg;this.frameSeq=(this.frameSeq+1)>>>0;});
        this.timer=setInterval(()=>{if(this.token&&Date.now()-this.lastUse>IDLE_MS)this.stop('idle');},30000);
        if(this.timer.unref)this.timer.unref();
    }
    status(){
        const address=localAddress(this.options.interfaces&&this.options.interfaces());
        return {active:!!this.token,url:this.token&&address?'http://'+address+':'+this.port+'/r/'+this.token:'',address:address||'',
            phoneConnected:!!this.token&&Date.now()-this.clientSeen<CLIENT_MS,expiresInMinutes:this.token?Math.max(0,Math.round((IDLE_MS-(Date.now()-this.lastUse))/60000)):0};
    }
    // A new code always replaces the previous one; an old link stops working.
    async start(){
        const address=localAddress(this.options.interfaces&&this.options.interfaces());
        if(!address)throw new Error('Kein WLAN verbunden. Zuerst den Handy-Hotspot verbinden.');
        await this.listen();
        this.revokeTransfers();
        this.token=crypto.randomBytes(16).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        this.lastUse=Date.now();this.clientSeen=0;
        return this.status();
    }
    stop(reason){
        const was=!!this.token;this.token=null;this.clientSeen=0;
        this.revokeTransfers();
        if(this.server){const s=this.server;this.server=null;s.close();}
        if(was)this.emit('remote',{event:'stopped',reason:reason||'stopped'});
        return this.status();
    }
    destroy(){clearInterval(this.timer);this.stop('closed');}
    revokeTransfers(){for(const transfer of this.transfers){if(transfer.stream)transfer.stream.destroy();transfer.req.destroy();transfer.res.destroy();}this.transfers.clear();}
    track(req,res,stream){const transfer={req,res,stream};this.transfers.add(transfer);const done=()=>this.transfers.delete(transfer);res.once('close',done);res.once('finish',done);return transfer;}
    listen(){
        if(this.server)return Promise.resolve();
        return new Promise((resolve,reject)=>{
            const server=http.createServer((req,res)=>this.handle(req,res));
            server.on('clientError',(e,socket)=>{try{socket.destroy();}catch(ignore){}});
            server.headersTimeout=10000;server.setTimeout(30000);server.maxHeadersCount=40;
            server.once('error',reject);
            server.listen(this.port,this.options.host||'0.0.0.0',()=>{server.removeListener('error',reject);server.on('error',()=>{});this.server=server;resolve();});
        });
    }
    send(res,status,body,type,extra){
        const headers=Object.assign({'Content-Type':type||'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
            'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'},extra||{});
        const data=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
        headers['Content-Length']=data.length;res.writeHead(status,headers);res.end(data);
    }
    authorized(req,url){
        if(!this.token)return false;
        return same(req.headers['x-remote-token']||url.searchParams.get('t'),this.token);
    }
    handle(req,res){
        let url;try{url=new (require('url').URL)(req.url,'http://remote.invalid');}catch(e){return this.send(res,400,{error:'bad request'});}
        if(!privateAddress(req.socket.remoteAddress))return this.send(res,403,{error:'forbidden'});
        if(!this.token)return this.send(res,404,'Diese Verbindung ist beendet. Am Browser einen neuen QR-Code anzeigen.','text/plain; charset=utf-8');
        if(req.method==='GET'&&url.pathname==='/favicon.ico')return this.send(res,204,'');
        const parts=url.pathname.split('/');
        if(req.method==='GET'&&parts[1]==='r'&&parts.length===3){
            if(!same(parts[2],this.token))return this.send(res,404,'Dieser QR-Code ist abgelaufen. Am Browser einen neuen QR-Code anzeigen.','text/plain; charset=utf-8');
            this.touch();
            return this.send(res,200,page.html(),'text/html; charset=utf-8',{'Content-Security-Policy':"default-src 'none'; img-src 'self' blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"});
        }
        if(!this.authorized(req,url))return this.send(res,401,{error:'Verbindung abgelaufen'});
        const pairedToken=this.token,paired=()=>!!pairedToken&&this.token===pairedToken;
        if(req.headers.origin){let origin;try{origin=new (require('url').URL)(req.headers.origin);}catch(e){return this.send(res,403,{error:'Fremder Ursprung'});}if(origin.protocol!=='http:'||origin.host!==req.headers.host)return this.send(res,403,{error:'Fremder Ursprung'});}
        this.touch();
        if(req.method==='POST'&&url.pathname==='/api/upload'){
            let name;try{name=decodeURIComponent(String(req.headers['x-file-name']||''));}catch(e){return this.send(res,400,{error:'Ungueltiger Dateiname'});}
            const length=req.headers['content-length']===undefined?undefined:Number(req.headers['content-length']);
            this.track(req,res);this.browser.stageUpload(url.searchParams.get('chooser'),req,{name,type:String(req.headers['content-type']||''),length}).then(file=>{if(paired()&&!res.destroyed)this.send(res,200,{ok:true,file,state:this.state()});},e=>{if(paired()&&!res.destroyed)this.send(res,409,{error:e.message,state:this.state()});});return;
        }
        if(req.method==='GET'&&url.pathname==='/api/download'){
            let file;try{file=this.browser.openDownload(url.searchParams.get('id'));}catch(e){return this.send(res,409,{error:e.message});}
            this.track(req,res,file.stream);
            res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.size,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)),
                'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});
            file.stream.on('error',()=>res.destroy());res.on('close',()=>file.stream.destroy());file.stream.pipe(res);return;
        }
        if(req.method==='GET'&&url.pathname==='/api/state')return this.send(res,200,this.state());
        if(req.method==='GET'&&url.pathname==='/api/frame'){
            if(!this.frame)return this.send(res,204,'');
            const etag='"'+this.frameSeq+'"';
            if(req.headers['if-none-match']===etag){res.writeHead(304,{ETag:etag,'Cache-Control':'no-store'});return res.end();}
            return this.send(res,200,this.frame.data,this.frame.type,{ETag:etag});
        }
        if(req.method==='POST'&&url.pathname==='/api/action'){
            this.track(req,res);
            let size=0;const chunks=[];
            req.on('data',c=>{size+=c.length;if(size>BODY_LIMIT){req.destroy();return;}chunks.push(c);});
            req.on('end',()=>{
                if(!paired()||res.destroyed)return;
                let message;try{message=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(e){return this.send(res,400,{error:'Ungültige Anfrage'});}
                this.action(message).then(result=>{if(paired()&&!res.destroyed)this.send(res,200,Object.assign({ok:true},result||{},{state:this.state()}));},
                    e=>{if(paired()&&!res.destroyed)this.send(res,409,{error:e.message||'Aktion fehlgeschlagen',state:this.state()});});
            });
            return;
        }
        this.send(res,404,{error:'not found'});
    }
    touch(){
        const first=Date.now()-this.clientSeen>CLIENT_MS;this.lastUse=this.clientSeen=Date.now();
        if(first)this.emit('remote',{event:'connected'});
    }
    state(){
        const b=this.browser,allowed=!!(b.gate&&b.gate.check().allowed);
        if(typeof b.fileStatus==='function')this.view.files=b.fileStatus();
        return Object.assign({},this.view,{running:!!b.child,foreground:allowed,frame:this.frame?this.frameSeq:0,
            viewport:b.viewport?{width:b.viewport.width,height:b.viewport.height}:null});
    }
    async action(m){
        if(!m||typeof m!=='object'||typeof m.op!=='string')throw new Error('Ungültige Aktion');
        const b=this.browser;
        switch(m.op){
            case 'open':{
                const target=inputURL(String(m.url||'').slice(0,4096));
                if(!target||!URLPolicy.allowed(target))throw new Error('Nur HTTP- und HTTPS-Adressen koennen geoeffnet werden');
                if(!b.child)await b.start(target);else if(m.newTab)await b.newTab(target);else await b.navigate(target);
                this.emit('remote',{event:'opened',url:target});return {url:target};
            }
            case 'text':{
                const text=String(m.text||'');if((!text&&!m.replace)||Buffer.byteLength(text,'utf8')>64*1024)throw new Error('Text fehlt oder ist zu lang (maximal 64 KiB)');
                await b.text(text,{replace:m.replace===true});if(m.enter)await b.key('Enter',false);return {};
            }
            case 'fillStructured':await b.fillStructured(m.value);return {};
            case 'key':{if(KEYS.indexOf(m.key)<0&&!(/^[A-Za-z0-9]$/.test(m.key)&&m.modifiers&&(m.modifiers.ctrl||m.modifiers.meta||m.modifiers.alt)))throw new Error('Unbekannte Taste');await b.key(m.key,m.modifiers||m.shift===true);return {};}
            case 'tap':{
                const x=Number(m.x),y=Number(m.y);if(!(x>=0&&x<=1&&y>=0&&y<=1)||!b.viewport)throw new Error('Ungültige Position');
                await b.tap(x*b.viewport.width,y*b.viewport.height,m.options);return {};
            }
            case 'hover':{const x=Number(m.x),y=Number(m.y);if(!(x>=0&&x<=1&&y>=0&&y<=1)||!b.viewport)throw new Error('Ungueltige Position');await b.hover(x*b.viewport.width,y*b.viewport.height,m.modifiers);return {};}
            case 'drag':{if(!Array.isArray(m.points)||m.points.length<2||m.points.length>64||!b.viewport)throw new Error('Ungueltige Bewegung');const points=m.points.map(p=>{if(!p||typeof p.x!=='number'||typeof p.y!=='number'||!(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))throw new Error('Ungueltige Position');return {x:p.x*b.viewport.width,y:p.y*b.viewport.height};});await b.drag(points,m.options);return {};}
            case 'scroll':{const d=Number(m.delta);if(!Number.isFinite(d))throw new Error('Ungültiger Bildlauf');const options={deltaX:m.deltaX,modifiers:m.modifiers};if(m.x!==undefined||m.y!==undefined){if(typeof m.x!=='number'||typeof m.y!=='number'||!(m.x>=0&&m.x<=1&&m.y>=0&&m.y<=1)||!b.viewport)throw new Error('Ungueltige Position');options.x=m.x*b.viewport.width;options.y=m.y*b.viewport.height;}await b.scroll(Math.max(-1000,Math.min(1000,d)),options);return {};}
            case 'dialogReply':return b.dialogReply(m.dialogId,m.accept,m.promptText);
            case 'authReply':try{return await b.authReply(m.authId,{username:m.username,password:m.password,cancel:m.cancel});}finally{m.password=null;}
            case 'permissionStatus':return {permissions:await b.permissionStatus()};
            case 'permissionSet':return {permissions:await b.permissionSet(m.name,m.setting,m.expectedOrigin)};
            case 'permissionAnswer':return b.permissionAnswer(m.permissionId,m.setting);
            case 'findText':return b.findText(m.query,m.options);
            case 'clearFind':return b.clearFind();
            case 'cancelDownload':return b.cancelDownload(m.downloadId);
            case 'deleteDownload':return b.deleteDownload(m.downloadId);
            case 'chooseFiles':return b.chooseFiles(m.chooserId,m.stagedIds);
            case 'cancelFileChooser':return b.cancelFileChooser(m.chooserId);
            case 'back':await b.back();return {};
            case 'forward':await b.forward();return {};
            case 'reload':await b.reload();return {};
            case 'selectTab':await b.selectTab(String(m.id||''));return {};
            case 'closeTab':await b.closeTab(String(m.id||''));return {};
            default:throw new Error('Unbekannte Aktion');
        }
    }
}
module.exports={RemoteControl,privateAddress,localAddress,PORT};
