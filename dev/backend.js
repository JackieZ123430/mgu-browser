'use strict';
// Laptop-only entry point. Shares the production CDP session and IPC protocol.
const fs=require('fs'),net=require('net'),path=require('path');
if(process.env.MGU_EMULATOR_MODE!=='1'||process.platform!=='linux'||process.getuid()===0)throw new Error('Unprivileged laptop emulator required');
const base=process.env.MGU_BROWSER_DATA,socketPath=process.env.MGU_BROWSER_SOCKET;
const Browser=require('./browser_session'),Channel=require('./ipc_protocol'),peer=require('./peer_uid.node');
const {SecureBrowserData,dpapi}=require('./secure_browser_data');
const configuration=JSON.parse(fs.readFileSync(path.join(__dirname,'../config.json'),'utf8'));
const windowsKeyHelper=path.join(configuration.project,'.local/browser-dpapi.exe');
const profileStore=new SecureBrowserData(path.join(base,'protected'),fs.existsSync(windowsKeyHelper)?dpapi(windowsKeyHelper):null);
const now=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
let owner=null,allowed=false,updated=0,generation=0,phase='idle',lastURL=null,frames=0;
const gate={check:()=>({allowed:allowed&&now()-updated<1500})};
const browser=new Browser({gate,mediaDisabled:false,cdmDirectory:process.env.MGU_BROWSER_CDM_DIRECTORY,binary:process.env.MGU_CHROMIUM,profileRoot:path.join(base,'profiles'),profileStore,viewport:{width:1280,height:384},env:{HOME:process.env.HOME}});
function status(){fs.writeFileSync(path.join(base,'service-state.json'),JSON.stringify({laptop:true,uid:process.getuid(),pid:process.pid,connected:!!owner,allowed:gate.check().allowed,phase,url:lastURL,frames,codec:browser.performance.codec}));}
function stop(reason){allowed=false;browser.stop(reason);phase='idle';status();}
browser.on('frame',frame=>{
    if(!owner||!gate.check().allowed||(owner.socket.writableLength||0)>2*1024*1024)return;
    const h=Buffer.alloc(12);h.writeUInt32LE(generation);h.writeUInt32LE(frame.width,4);h.writeUInt32LE(frame.height,8);owner.send(2,Buffer.concat([h,frame.rgba]));frames++;if(frames===1||frames%20===0)status();
});
for(const event of ['started','blocked','fault','version','navigation','navigationState','loading','input','tabs','tabSelected','media'])browser.on(event,value=>{
    if(event==='started')phase='running';if(event==='blocked')phase='idle';
    if(event==='navigation')lastURL=value;
    if(event==='fault')phase='fault';
    if(owner)owner.json({event,value:value&&value.message||value});status();
});
browser.on('diagnostic',text=>{if(/FATAL|sandbox|symbol lookup/i.test(text))console.error(text.slice(0,1000));});
browser.on('performance',value=>fs.writeFileSync(path.join(base,'render-performance.json'),JSON.stringify(value)));
const server=net.createServer(socket=>{
    if(peer.peerUid(socket._handle.fd)!==process.getuid()||owner){socket.destroy();return;}
    owner=new Channel(socket);const ch=owner;
    ch.json({event:'ready'});ch.json({event:'network',value:{https:true,laptop:true}});status();
    ch.on('closed',()=>{if(owner===ch){owner=null;stop('Emulator-App getrennt');}});
    ch.on('frame',()=>socket.destroy());
    ch.on('json',async m=>{
        if(!m||typeof m!=='object')return socket.destroy();
        if(m.op==='state'){
            const next=m.allowed===true;if(allowed&&!next)stop('App nicht im Vordergrund');
            allowed=next;generation=Number(m.generation)>>>0;updated=now();status();return;
        }
        if(!Number.isInteger(m.id))return socket.destroy();
        try{
            let result;
            switch(m.op){
                case 'start':result=await browser.start(m.url);break;
                case 'navigate':result=await browser.navigate(m.url);break;
                case 'back':result=await browser.back();break;
                case 'forward':result=await browser.forward();break;
                case 'reload':result=await browser.reload();break;
                case 'stopLoading':result=await browser.stopLoading();break;
                case 'resize':result=await browser.resize(m.width,m.height);break;
                case 'newTab':result=await browser.newTab(m.url);break;
                case 'selectTab':result=await browser.selectTab(m.tabId);break;
                case 'closeTab':result=await browser.closeTab(m.tabId);break;
                case 'clearTab':result=await browser.clearTab();break;
                case 'pageFocus':result=await browser.focusPage(m.delta);break;
                case 'pagePress':result=await browser.pressPage();break;
                case 'pageLeave':result=await browser.leavePage();break;
                case 'mediaAction':result=await browser.mediaAction(m.action);break;
                case 'mediaCapabilities':result=await browser.mediaCapabilities();break;
                case 'audioTest':result=await browser.audioTest();break;
                case 'audioStatus':result=browser.audioStatus();break;
                case 'audioRoute':result=await browser.audioRoute(m.enabled);break;
                case 'privacyStatus':result=await browser.privacyStatus();break;
                case 'privacyConfigure':result=await browser.privacyConfigure(m.prefs);break;
                case 'vaultUnlock':try{result=await browser.vaultUnlock(m.password);}finally{m.password=null;}break;
                case 'clearBrowserData':result=await browser.clearBrowserData(m.kind);break;
                case 'vaultList':result=await browser.vaultList();break;
                case 'vaultSave':result=await browser.vaultSave();break;
                case 'vaultFill':result=await browser.vaultFill(m.loginId);break;
                case 'vaultRemove':result=await browser.vaultRemove(m.loginId);break;
                case 'mediaDemo':result=await require('./browser_media_demo')(browser);break;
                case 'locale':result=await browser.setLocale(m.locale);break;
                case 'wifiStatus':result={supported:false,mode:'laptop',connected:null,message:'Im Emulator wird die Internetverbindung des Laptops genutzt.'};break;
                case 'wifiScan':result={supported:false,networks:[],message:'Die WLAN-Antenne der Headunit ist im Emulator nicht verfügbar.'};break;
                case 'wifiConnect':case 'wifiReconnect':throw new Error('Hotspot-Verbindung nur auf der Headunit verfuegbar.');
                case 'tap':result=await browser.tap(m.x,m.y);break;
                case 'key':result=await browser.key(String(m.key).slice(0,30),m.shift===true);break;
                case 'text':result=await browser.text(m.text);break;
                case 'scroll':result=await browser.scroll(m.delta);break;
                case 'network':result={https:true,laptop:true};break;
                case 'stop':browser.stop('Browser geschlossen');break;
                default:throw new Error('Unbekannter Browser-Befehl');
            }
            ch.json({id:m.id,result:result||{}});status();
        }catch(e){ch.json({id:m.id,error:e.message});}
    });
});
server.listen(socketPath,()=>{fs.chmodSync(socketPath,0o600);status();console.log('Lokal: Chromium-Backend bereit ('+browser.performance.codec+')');});
const lease=setInterval(()=>{if(allowed&&!gate.check().allowed)stop('Emulator-Heartbeat beendet');},100);
let shutting=false;
async function shutdown(){
    if(shutting)return;shutting=true;clearInterval(lease);browser.destroy();
    if(owner)owner.socket.destroy();server.close();
    await browser.closing;
    try{fs.unlinkSync(socketPath);}catch(e){}
    process.exit(0);
}
for(const s of ['SIGINT','SIGTERM'])process.on(s,shutdown);
