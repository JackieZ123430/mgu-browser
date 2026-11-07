'use strict';
const fs=require('fs'),path=require('path'),setup=require('./setup'),{rootFile}=require('./activate');
const STATUS='/run/mgu-browser/status.json',SOCKET='/var/opt/mgu-browser/data/backend.sock';
function monotonic(){const time=process.hrtime();return time[0]*1000+time[1]/1e6;}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return false;}}
function inspect(options){
    const io=options.fs||fs;let status;
    try{status=JSON.parse(rootFile(STATUS,4096,io).text);}catch(e){return 'startup-status-unavailable';}
    if(!status||status.version!==options.version)return 'runtime-version-mismatch';
    if(status.state!=='running')return 'backend-not-ready';
    if(status.appUid!==options.identity.appUid)return 'app-identity-mismatch';
    const stamp=Date.parse(status.at),age=(options.wallClock||Date.now)()-stamp;
    if(!Number.isFinite(stamp)||age<0||age>90000)return 'startup-status-stale';
    if(!Number.isInteger(status.pid)||status.pid<2||!(options.alive||alive)(status.pid))return 'supervisor-not-running';
    try{
        const socket=io.lstatSync(SOCKET);
        if(!socket.isSocket()||socket.uid!==options.identity.serviceUid||socket.gid!==options.identity.appUid||(socket.mode&0o777)!==0o660)return 'backend-socket-identity-mismatch';
    }catch(e){return 'backend-socket-unavailable';}
    return '';
}
async function waitReady(options){
    if(!options.identity.ready)return {ready:false,waitingForApp:true};
    const clock=options.clock||monotonic,sleep=options.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    const limit=options.timeout===undefined?15000:options.timeout,deadline=clock()+limit;let reason='backend-not-ready';
    while(true){
        reason=inspect(options);if(!reason)return {ready:true};
        const remaining=deadline-clock();if(remaining<=0)throw Error('Browser backend readiness timed out: '+reason);
        await sleep(Math.min(250,remaining));
    }
}
module.exports={inspect,waitReady};
if(require.main===module){
    (async()=>{
        if(process.getuid()!==0)throw Error('Root runtime check required');
        const identity=setup.prepare();
        if(!identity.ready){console.log('Waiting for frontend registration');return;}
        const provenance=JSON.parse(rootFile(path.join(__dirname,'../build-provenance.json'),32768).text);
        if(typeof provenance.version!=='string'||!/^\d+\.\d+\.\d+$/.test(provenance.version))throw Error('Invalid runtime build version');
        await waitReady({identity,version:provenance.version});
        console.log('Current Browser backend reported authenticated IPC readiness');
    })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
