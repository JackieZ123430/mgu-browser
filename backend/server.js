'use strict';
const fs=require('fs'),net=require('net'),path=require('path');
const Channel=require('./ipc_protocol'),Browser=require('./browser_session'),peer=require('./peer_uid.node');
const networkProbe=require('./network_probe');
const wifi=require('./wifi_control');
const {SecureBrowserData}=require('./secure_browser_data');
const profileStore=new SecureBrowserData('/var/opt/mgu-browser/data/protected');
const SOCKET='/var/opt/mgu-browser/data/backend.sock';
const APP_UID=Number(process.env.MGU_BROWSER_APP_UID),SERVICE_UID=Number(process.env.MGU_BROWSER_UID);
const ENGINE=process.env.MGU_BROWSER_ENGINE_ROOT;
const FONTCONFIG=path.resolve(__dirname,'../fonts.conf');
if(!Number.isInteger(APP_UID)||APP_UID<12203||SERVICE_UID!==process.getuid()||!ENGINE)throw new Error('Verified runtime identity required');
let owner=null,allowed=false,updated=0,generation=0;
let phase='idle';
let lastNetwork=null;
let lastNetworkStamp='';
let lastNetworkProbe=0;
function status(){fs.writeFileSync('/var/opt/mgu-browser/data/service-state.json',JSON.stringify({uid:process.getuid(),connected:!!owner,allowed,generation,phase,pid:process.pid}));}
const now=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
const gate={onBlock:null,check(){return {allowed:allowed&&now()-updated>=0&&now()-updated<1500};}};
const frameSender=require('./frame_delta').sender({owner:()=>owner,allowed:()=>gate.check().allowed,generation:()=>generation});
const audioGid=Number(process.env.MGU_BROWSER_AUDIO_GID);
const vehicleAudio=Number.isInteger(audioGid)&&audioGid>0&&audioGid<=65535?{binary:'/var/opt/mgu-browser/current/audio-bridge',gid:audioGid}:null;
const browser=new Browser({gate,frameReady:()=>frameSender.canSend(),mediaDisabled:false,cdmConfig:'/var/opt/mgu-browser/cdm.json',binary:'/var/opt/mgu-browser/current/browser-launch',profileRoot:'/var/opt/mgu-browser/work/profiles',fileRoot:'/var/opt/mgu-browser/data/files',profileStore,viewport:{width:1280,height:384},vehicleAudio,env:{FONTCONFIG_FILE:fs.existsSync(FONTCONFIG)?FONTCONFIG:ENGINE+'/fonts.conf',CHROME_DEVEL_SANDBOX:ENGINE+'/chrome-sandbox'}});
function stop(reason){allowed=false;browser.stop(reason);phase='idle';status();}
const {RemoteControl}=require('./remote_control');
const remote=new RemoteControl({browser});
remote.on('remote',value=>{if(owner)owner.json({event:'remote',value});});
browser.on('frame',frame=>frameSender.send(frame));
['started','blocked','fault','version','navigation','navigationState','loading','input','tabs','tabSelected','media','dialog','files','fileChooser','permission','privacy','find','findOpen','auth','viewport'].forEach(event=>browser.on(event,value=>{if(['navigation','tabSelected','blocked'].includes(event))frameSender.reset();if(owner)owner.json({event,value:event==='fault'?String(value&&value.message||value):value});}));
browser.on('performance',value=>fs.writeFileSync('/var/opt/mgu-browser/data/render-performance.json',JSON.stringify(value)));
browser.on('started',()=>{phase='running';status();[3000,12000,25000].forEach(ms=>setTimeout(()=>{if(browser.child)browser.pageInfo().then(r=>fs.writeFileSync('/var/opt/mgu-browser/data/page-diagnostic.json',r.result.value)).catch(()=>{});},ms));});
browser.on('fault',e=>{phase='fault';status();console.error(e.message);});
browser.on('diagnostic',text=>{
    if(/sandbox|FATAL|browser-exit|error while loading|symbol lookup|\[page/i.test(text)){
        const file='/var/opt/mgu-browser/data/engine-diagnostic.log';
        try{if(!fs.existsSync(file)||fs.statSync(file).size<65536)fs.appendFileSync(file,text.trim().slice(0,1600)+'\n');}catch(e){}
        console.error(text.trim().slice(0,800));
    }
});
try{fs.unlinkSync(SOCKET);}catch(e){if(e.code!=='ENOENT')throw e;}
const server=net.createServer(socket=>{
    let uid;try{uid=peer.peerUid(socket._handle.fd);}catch(e){socket.destroy();return;}
    if(uid!==APP_UID||owner){socket.destroy();return;}
    const channel=owner=new Channel(socket);channel.json({event:'ready'});
    if(lastNetwork)channel.json({event:'network',value:lastNetwork});
    status();
    channel.on('closed',()=>{if(owner===channel){owner=null;stop('Browser-App getrennt');}});
    channel.on('frame',()=>socket.destroy());
    channel.on('json',async message=>{
        if(!message||typeof message!=='object')return socket.destroy();
        if(message.op==='keyframe'){frameSender.reset();return;}
        if(message.op==='state'){if(message.frames===2)channel.frameProtocol=2;
            if(typeof message.allowed!=='boolean'||!Number.isInteger(message.generation)||message.generation<0||message.generation>0xffffffff)return socket.destroy();
            const changed=allowed!==(message.allowed===true)||generation!==(Number(message.generation)>>>0);
            const next=message.allowed===true;generation=Number(message.generation)>>>0;updated=now();
            if(allowed&&!next)stop('Browser nicht im Vordergrund');allowed=next;if(changed)status();return;
        }
        if(!Number.isInteger(message.id))return socket.destroy();
        try{
            let result;
            switch(message.op){
                case 'network':result=await networkProbe();break;
                case 'start':result=await browser.start(message.url,message.options);break;
                case 'navigate':result=await browser.navigate(message.url);break;
                case 'tap':result=await browser.tap(message.x,message.y,message.options);break;
                case 'hover':result=await browser.hover(message.x,message.y,message.modifiers);break;
                case 'drag':result=await browser.drag(message.points,message.options);break;
                case 'key':result=await browser.key(String(message.key).slice(0,30),message.modifiers||message.shift===true);break;
                case 'text':result=await browser.text(message.text,message.options);break;
                case 'fillStructured':result=await browser.fillStructured(message.value);break;
                case 'scroll':result=await browser.scroll(message.delta,message.options);break;
                case 'dialogState':result=browser.dialogState();break;
                case 'authStatus':result=browser.authStatus();break;
                case 'authReply':try{result=await browser.authReply(message.authId,{username:message.username,password:message.password,cancel:message.cancel});}finally{message.password=null;}break;
                case 'dialogReply':result=await browser.dialogReply(message.dialogId,message.accept,message.promptText);break;
                case 'files':result=browser.fileStatus();break;
                case 'cancelDownload':result=await browser.cancelDownload(message.downloadId);break;
                case 'deleteDownload':result=await browser.deleteDownload(message.downloadId);break;
                case 'cancelFileChooser':result=await browser.cancelFileChooser(message.chooserId);break;
                case 'permissionStatus':result=await browser.permissionStatus();break;
                case 'permissionSet':result=await browser.permissionSet(message.name,message.setting,message.expectedOrigin);break;
                case 'permissionAnswer':result=await browser.permissionAnswer(message.permissionId,message.setting);break;
                case 'findText':result=await browser.findText(message.query,message.options);break;
                case 'clearFind':result=browser.clearFind();break;
                case 'back':result=await browser.back();break;
                case 'forward':result=await browser.forward();break;
                case 'reload':result=await browser.reload();break;
                case 'stopLoading':result=await browser.stopLoading();break;
                case 'resize':result=await browser.resize(message.width,message.height,message.zoom);break;
                case 'newTab':result=await browser.newTab(message.url);break;
                case 'selectTab':result=await browser.selectTab(message.tabId);break;
                case 'closeTab':result=await browser.closeTab(message.tabId);break;
                case 'clearTab':result=await browser.clearTab();break;
                case 'pageFocus':result=await browser.focusPage(message.delta);break;
                case 'pagePress':result=await browser.pressPage();break;
                case 'pageLeave':result=await browser.leavePage();break;
                case 'mediaAction':result=await browser.mediaAction(message.action);break;
                case 'mediaFocus':result=await browser.focusMediaControl(message.delta);break;
                case 'mediaPress':result=await browser.pressMediaControl();break;
                case 'mediaCapabilities':result=await browser.mediaCapabilities();break;
                case 'audioTest':result=await browser.audioTest();break;
                case 'audioStatus':result=browser.audioStatus();break;
                case 'audioRoute':result=await browser.audioRoute(message.enabled);break;
                case 'privacyStatus':result=await browser.privacyStatus();break;
                case 'privacyConfigure':result=await browser.privacyConfigure(message.prefs);break;
                case 'vaultUnlock':try{result=await browser.vaultUnlock(message.password);}finally{message.password=null;}break;
                case 'clearBrowserData':result=await browser.clearBrowserData(message.kind);break;
                case 'vaultList':result=await browser.vaultList();break;
                case 'vaultSave':result=await browser.vaultSave();break;
                case 'vaultFill':result=await browser.vaultFill(message.loginId);break;
                case 'vaultRemove':result=await browser.vaultRemove(message.loginId);break;
                case 'locale':result=await browser.setLocale(message.locale);break;
                case 'wifiStatus':result=await wifi({op:'status'});break;
                case 'wifiConnect':result=await wifi({op:'connect',ssid:message.ssid,password:message.password});message.password=null;break;
                case 'wifiReconnect':result=await wifi({op:'reconnect'});break;
                case 'wifiScan':result=await wifi({op:'scan'});break;
                case 'remoteStart':result=await remote.start();break;
                case 'remoteStop':result=remote.stop('user');break;
                case 'remoteStatus':result=remote.status();break;
                case 'contentBlocking':result=await browser.setContentBlocking(message.enabled===true);break;
                case 'stop':browser.stop('Browser geschlossen');break;
                default:throw new Error('Unbekannter Browser-Befehl');
            }
            channel.json({id:message.id,result:result||{}});
        }catch(e){channel.json({id:message.id,error:e.message});}
    });
});
server.listen(SOCKET,()=>{
    fs.chmodSync(SOCKET,0o660);fs.chownSync(SOCKET,SERVICE_UID,APP_UID);status();
    if(process.env.MGU_BROWSER_STATUS_FD==='3')fs.writeSync(3,'MGU_BROWSER_BACKEND_READY\n');
    console.log('Browser backend ready for the registered Browser frontend');
    networkProbe().then(result=>{lastNetwork=result;fs.writeFileSync('/var/opt/mgu-browser/data/network-status.json',JSON.stringify(result));if(owner)owner.json({event:'network',value:result});});
});
setInterval(()=>{if(allowed&&!gate.check().allowed)stop('Browser-App antwortet nicht');},100);
setInterval(()=>{
    let state;try{state=JSON.parse(fs.readFileSync('/var/opt/mgu-browser/network-status.json','utf8'));}catch(e){return;}
    if(state.connected&&(state.updated!==lastNetworkStamp||((!lastNetwork||!lastNetwork.https)&&now()-lastNetworkProbe>15000))){lastNetworkStamp=state.updated;lastNetworkProbe=now();networkProbe().then(result=>{lastNetwork=result;fs.writeFileSync('/var/opt/mgu-browser/data/network-status.json',JSON.stringify(result));if(owner)owner.json({event:'network',value:result});});}
},2000);
let shuttingDown=false;
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{if(shuttingDown)return;shuttingDown=true;remote.destroy();stop('Backend beendet');if(owner)owner.socket.destroy();server.close();const timeout=setTimeout(()=>process.exit(0),18000);timeout.unref();await browser.closing;process.exit(0);});
