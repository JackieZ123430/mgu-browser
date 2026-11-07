'use strict';
// Root supervisor of the browser backend. It prepares the runtime folders,
// then starts the privilege-dropping backend launcher. Problems are retried
// instead of ending the service, and every state is written to
// /run/mgu-browser/status.json, which the app shows while it cannot reach
// the backend ("Browser-Dienst noch nicht bereit" alone said nothing).
const cp=require('child_process'),fs=require('fs'),setup=require('./setup');
if(process.getuid()!==0)throw Error('Root service launcher required');
const STATUS_DIR='/run/mgu-browser',STATUS=STATUS_DIR+'/status.json',SERVICE_UID=3911;
let child=null,stopping=false,timer=null,version='';
try{version=JSON.parse(fs.readFileSync(__dirname+'/../build-provenance.json','utf8')).version||'';}catch(e){/* development tree */}
function status(state,extra){
    const record=Object.assign({state,version,at:new Date().toISOString(),pid:process.pid},extra||{});
    try{
        try{fs.mkdirSync(STATUS_DIR,0o755);}catch(e){if(e.code!=='EEXIST')throw e;}
        const st=fs.lstatSync(STATUS_DIR);
        // Root creates it for the service account, which keeps writing after the privilege drop.
        if(!st.isDirectory()||st.isSymbolicLink()||[0,SERVICE_UID].indexOf(st.uid)<0)return;
        if(process.getuid()===0){fs.chownSync(STATUS_DIR,SERVICE_UID,0);fs.chmodSync(STATUS_DIR,0o755);}
        const tmp=STATUS+'.'+process.pid;fs.writeFileSync(tmp,JSON.stringify(record)+'\n',{mode:0o644});fs.chmodSync(tmp,0o644);fs.renameSync(tmp,STATUS);
    }catch(e){console.error('status: '+e.message);}
    console.log('Browser backend: '+state+(extra?' '+JSON.stringify(extra):''));
}
function start(){
    if(stopping)return;
    let identity;
    try{identity=setup.prepare();}
    catch(e){status('setup_failed',{error:String(e.message).slice(0,200)});timer=setTimeout(start,15000);return;}
    if(!identity.ready){status('waiting_for_app');timer=setTimeout(start,5000);return;}
    // Leftovers of the private 0.9.x installation (old engine folder).
    try{const r=require('./legacy_cleanup').cleanup();if(r.removed)console.log('Removed the unused 0.9.x Chromium engine folder');}
    catch(e){console.error('Legacy cleanup skipped: '+e.message);}
    // Phone remote control: open its port in the WLAN before dropping root.
    try{const r=require('./remote_firewall').apply();console.log('Remote control firewall: '+JSON.stringify(r));}
    catch(e){console.error('Remote control firewall not applied: '+e.message);}
    const args=['--uid',String(identity.serviceUid),'--app-uid',String(identity.appUid)];
    if(identity.audio)args.push('--audio-gid',String(identity.audio.gid));
    status('starting',{appUid:identity.appUid});
    const started=Date.now();
    child=cp.spawn('/var/opt/mgu-browser/current/backend-launch',args,{stdio:'inherit',env:Object.assign({},process.env,{MGU_BROWSER_ENGINE_ROOT:identity.engineRoot})});
    // The supervising Node process does not retain root privileges either.
    process.setgroups([identity.appUid]);process.setgid(identity.serviceUid);process.setuid(identity.serviceUid);
    const running=setTimeout(()=>{if(child)status('running',{appUid:identity.appUid});},3000);
    child.on('error',e=>{status('backend_launch_failed',{error:e.message});});
    // systemd (Restart=always) starts the service again after the backend ends.
    child.on('exit',(code,signal)=>{clearTimeout(running);if(!stopping)status('backend_exited',{code,signal,afterSeconds:Math.round((Date.now()-started)/1000)});process.exit(stopping?0:(signal?1:code||1));});
}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;clearTimeout(timer);status('stopped');if(child)child.kill(sig);else process.exit(0);});
start();
