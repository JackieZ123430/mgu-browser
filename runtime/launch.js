'use strict';
// Root supervisor of the browser backend. It prepares the runtime folders,
// then starts the privilege-dropping backend launcher. Problems are retried
// instead of ending the service, and every state is written to
// /run/mgu-browser/status.json, which the app shows while it cannot reach
// the backend ("Browser-Dienst noch nicht bereit" alone said nothing).
const cp=require('child_process'),fs=require('fs'),setup=require('./setup');
if(process.getuid()!==0)throw Error('Root service launcher required');
let child=null,stopping=false,timer=null,version='';
try{version=JSON.parse(fs.readFileSync(__dirname+'/../build-provenance.json','utf8')).version||'';}catch(e){/* development tree */}
const startup=require('./startup_status').open(version);
function status(state,extra){
    try{startup.write(state,extra);}catch(e){console.error('Browser startup status unavailable');}
    console.log('Browser backend: '+state);
}
function start(){
    if(stopping)return;
    status('preparing');
    let identity;
    try{identity=setup.prepare();}
    catch(e){status('setup_failed');console.error(e.message);timer=setTimeout(start,15000);return;}
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
    try{child=cp.spawn('/var/opt/mgu-browser/current/backend-launch',args,{stdio:['inherit','inherit','inherit','pipe'],env:Object.assign({},process.env,{MGU_BROWSER_ENGINE_ROOT:identity.engineRoot,MGU_BROWSER_STATUS_FD:'3'})});}
    catch(e){status('backend_launch_failed');console.error(e.message);process.exit(1);return;}
    let ready='',finished=false;
    child.stdio[3].on('data',data=>{
        if(finished||stopping)return;
        ready+=data.toString('ascii');
        if(ready.length>64){finished=true;return;}
        if(ready.indexOf('\n')<0)return;
        finished=true;
        if(ready==='MGU_BROWSER_BACKEND_READY\n')status('running',{appUid:identity.appUid});
    });
    child.stdio[3].on('error',()=>{});
    // The supervising Node process does not retain root privileges either.
    process.setgroups([identity.appUid]);process.setgid(identity.serviceUid);process.setuid(identity.serviceUid);
    child.on('error',e=>{finished=true;status('backend_launch_failed');console.error(e.message);process.exit(1);});
    // systemd (Restart=always) starts the service again after the backend ends.
    child.on('exit',(code,signal)=>{finished=true;if(!stopping)status('backend_exited',{code,signal,afterSeconds:Math.round((Date.now()-started)/1000)});process.exit(stopping?0:(signal?1:code||1));});
}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;clearTimeout(timer);status('stopped');if(child)child.kill(sig);else process.exit(0);});
process.on('exit',()=>startup.close());
start();
