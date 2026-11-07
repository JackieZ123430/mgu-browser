'use strict';
const cp=require('child_process'),setup=require('./setup');
if(process.getuid()!==0)throw Error('Root service launcher required');
let child=null,stopping=false,timer=null;
function start(){
    if(stopping)return;
    let identity;try{identity=setup.prepare();}catch(e){console.error(e.message);process.exitCode=1;return;}
    if(!identity.ready){console.log('Waiting for the Browser frontend to be installed');timer=setTimeout(start,5000);return;}
    // Leftovers of the private 0.9.x installation (old engine folder).
    try{const r=require('./legacy_cleanup').cleanup();if(r.removed)console.log('Removed the unused 0.9.x Chromium engine folder');}
    catch(e){console.error('Legacy cleanup skipped: '+e.message);}
    // Phone remote control: open its port in the WLAN before dropping root.
    try{const r=require('./remote_firewall').apply();console.log('Remote control firewall: '+JSON.stringify(r));}
    catch(e){console.error('Remote control firewall not applied: '+e.message);}
    const args=['--uid',String(identity.serviceUid),'--app-uid',String(identity.appUid)];
    if(identity.audio)args.push('--audio-gid',String(identity.audio.gid));
    child=cp.spawn('/var/opt/mgu-browser/current/backend-launch',args,{stdio:'inherit',env:Object.assign({},process.env,{MGU_BROWSER_ENGINE_ROOT:identity.engineRoot})});
    // The supervising Node process does not retain root privileges either.
    process.setgroups([identity.appUid]);process.setgid(identity.serviceUid);process.setuid(identity.serviceUid);
    child.on('error',e=>{console.error(e.message);process.exitCode=1;});
    child.on('exit',(code,signal)=>{process.exitCode=signal?1:code||0;});
}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;clearTimeout(timer);if(child)child.kill(sig);else process.exit(0);});
start();
