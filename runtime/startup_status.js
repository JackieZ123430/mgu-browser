'use strict';
// This public file contains fixed startup states, never exception text. Keep
// its already opened root-owned descriptor across the supervisor's UID drop.
const fs=require('fs'),crypto=require('crypto');
const DIRECTORY='/run/mgu-browser',FILE=DIRECTORY+'/status.json';
const STATES=['preparing','setup_failed','waiting_for_app','starting','running','backend_launch_failed','backend_exited','stopped'];
const SIGNALS=['SIGTERM','SIGINT','SIGKILL','SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGFPE','SIGHUP'];
function open(version){
    if(process.getuid()!==0)throw Error('Root startup status setup required');
    const parent=fs.lstatSync('/run');
    if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==0||(parent.mode&0o022))throw Error('Unsafe startup status parent');
    try{fs.mkdirSync(DIRECTORY,0o755);}catch(e){if(e.code!=='EEXIST')throw e;}
    const directory=fs.openSync(DIRECTORY,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    try{
        const s=fs.fstatSync(directory);
        // 0.13.2 owned this directory as 3911. Reclaim the directory first,
        // before touching its potentially service-controlled former entries.
        if(!s.isDirectory()||[0,3911].indexOf(s.uid)<0)throw Error('Unsafe startup status directory');
        fs.fchownSync(directory,0,0);fs.fchmodSync(directory,0o755);
    }finally{fs.closeSync(directory);}
    // Removing an entry never follows a planted symlink or hardlink. Creating
    // exclusively afterwards avoids every predictable temporary-file write.
    try{
        const previous=fs.lstatSync(FILE);
        if(previous.isDirectory()&&!previous.isSymbolicLink())fs.renameSync(FILE,FILE+'.legacy-'+crypto.randomBytes(12).toString('hex'));
        else fs.unlinkSync(FILE);
    }catch(e){if(e.code!=='ENOENT')throw e;}
    const fd=fs.openSync(FILE,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o644);
    try{fs.fchownSync(fd,0,0);fs.fchmodSync(fd,0o644);}catch(e){fs.closeSync(fd);throw e;}
    let closed=false,last=null;
    function write(state,extra){
        if(closed||STATES.indexOf(state)<0)throw Error('Invalid startup status');
        const record={state,version:/^\d+\.\d+\.\d+$/.test(version||'')?version:'',at:new Date().toISOString(),pid:process.pid};
        extra=extra||{};
        if(Number.isInteger(extra.appUid)&&extra.appUid>=12203&&extra.appUid<=65535)record.appUid=extra.appUid;
        if(Number.isInteger(extra.code)&&extra.code>=0&&extra.code<=255)record.code=extra.code;
        if(SIGNALS.indexOf(extra.signal)>=0)record.signal=extra.signal;
        if(Number.isInteger(extra.afterSeconds)&&extra.afterSeconds>=0&&extra.afterSeconds<=2147483647)record.afterSeconds=extra.afterSeconds;
        const text=JSON.stringify(record)+'\n';
        fs.writeSync(fd,text,0,'utf8');fs.ftruncateSync(fd,Buffer.byteLength(text));last=record;
    }
    const heartbeat=setInterval(()=>{if(last){try{write(last.state,last);}catch(e){/* The launcher reports write failures on state changes. */}}},30000);
    heartbeat.unref();
    return {write,close(){if(!closed){closed=true;clearInterval(heartbeat);fs.closeSync(fd);}}};
}
module.exports={open};
