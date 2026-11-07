'use strict';
// A Store update leaves an already failed ordinary service stopped. Recover it
// only when recmgr already knew BOTH Browser units at this boot: starting the
// backend also starts its wanted WLAN broker. Never edit a firmware boot list.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const UNITS=['mgu-browser-wifi.service','mgu-browser-backend.service'];
const FILES={list:'/etc/recmgr-restartlist.conf',atBoot:'/var/opt/mgu-deploy/recmgr-at-boot.json',boot:'/proc/sys/kernel/random/boot_id',stat:'/proc/stat'};
function rootFile(file,max,io){
    io=io||fs;
    const parent=io.realpathSync(path.dirname(file));let cursor='/';
    for(const part of parent.split('/').filter(Boolean)){
        cursor=path.join(cursor,part);const st=io.lstatSync(cursor);
        if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022))throw Error('Untrusted recmgr input directory');
    }
    const fd=io.openSync(path.join(parent,path.basename(file)),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{
        const st=io.fstatSync(fd);
        if(!st.isFile()||st.uid!==0||st.nlink!==1||(st.mode&0o022)||st.size>max)throw Error('Untrusted recmgr input file');
        const text=io.readFileSync(fd,'utf8');if(Buffer.byteLength(text)>max)throw Error('Oversized recmgr input');
        return {text,mtimeMs:st.mtime.getTime()};
    }finally{io.closeSync(fd);}
}
function listsAll(text){
    const sections={};let section='';
    String(text).split('\n').forEach(line=>{
        const value=line.split('#')[0].trim(),match=/^\[(.*)\]$/.exec(value);
        if(match){section=match[1];if(!sections[section])sections[section]=[];}
        else if(section&&value)sections[section].push(value);
    });
    return UNITS.every(unit=>['Whitelist','WhitelistExitSuccess'].every(name=>(sections[name]||[]).indexOf(unit.replace(/\.service$/,''))>=0));
}
function loadedThisBoot(io){
    io=io||fs;
    try{
        const current=rootFile(FILES.list,262144,io);if(!listsAll(current.text))return false;
        const boot=rootFile(FILES.boot,128,io).text.trim();if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(boot))return false;
        let saved=null;
        try{
            saved=JSON.parse(rootFile(FILES.atBoot,524288,io).text);
            if(!saved||typeof saved!=='object'||Array.isArray(saved)||typeof saved.boot!=='string'||typeof saved.text!=='string')return false;
        }catch(e){if(e.code!=='ENOENT')return false;}
        // The Store's current-boot copy is authoritative even if the clock
        // moved and the rewritten list now appears older than boot time.
        if(saved&&saved.boot===boot)return typeof saved.text==='string'&&listsAll(saved.text);
        const match=/^btime (\d+)$/m.exec(rootFile(FILES.stat,1048576,io).text);
        return !!match&&Number(match[1])>0&&Math.floor(current.mtimeMs/1000)<Number(match[1]);
    }catch(e){return false;}
}
function recover(options){
    options=options||{};const io=options.fs||fs,execute=options.execute||((args)=>cp.spawnSync('systemctl',args,{encoding:'utf8',timeout:15000,maxBuffer:65536}));
    if(!loadedThisBoot(io))return {status:'Browser services wait for the head-unit restart required by recmgr',reboot:'Browser service whitelist entries must be loaded at the next head-unit start'};
    const started=[];
    for(const unit of UNITS){
        const state=execute(['show','-p','ActiveState',unit]);
        if(state.error||state.status!==0)throw Error('Cannot inspect '+unit);
        const match=/^ActiveState=([a-z-]+)$/m.exec(state.stdout||'');
        if(!match)throw Error('Unknown service state for '+unit);
        if(['active','reloading'].indexOf(match[1])>=0)continue;
        if(['failed','inactive','activating'].indexOf(match[1])<0)throw Error('Service is not ready for recovery: '+unit);
        // Recheck the gate immediately before each command that can start a
        // service; no caller-provided name or arbitrary command is accepted.
        if(!loadedThisBoot(io))throw Error('Recmgr boot proof changed during Browser activation');
        const commands=match[1]==='failed'?[['reset-failed',unit],['start',unit]]:[['start',unit]];
        for(const args of commands){const result=execute(args);if(result.error||result.status!==0)throw Error('Browser service recovery failed: '+args[0]+' '+unit);}
        started.push(unit);
    }
    return {status:started.length?'Recovered stopped Browser services: '+started.join(', '):'Browser services are already running'};
}
module.exports={rootFile,listsAll,loadedThisBoot,recover};
if(require.main===module){
    if(process.getuid()!==0)throw Error('Root runtime activation required');
    try{console.log(JSON.stringify(recover()));}catch(e){console.error(e.message);process.exitCode=1;}
}
