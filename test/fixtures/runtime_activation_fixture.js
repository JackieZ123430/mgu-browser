'use strict';
// Authored filesystem/systemctl fixture; no host systemd or firmware access.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const BOOT='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NAMES=['mgu-browser-wifi','mgu-browser-backend'];
function list(names){return '[Whitelist]\n'+names.join('\n')+'\n[WhitelistExitSuccess]\n'+names.join('\n')+'\n';}
function fixture(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-activation-'));
    const at=name=>path.join(root,name);
    function write(name,text,mode){fs.mkdirSync(path.dirname(at(name)),{recursive:true,mode:0o755});fs.writeFileSync(at(name),text,{mode:mode||0o644});fs.chmodSync(at(name),mode||0o644);}
    write('/etc/recmgr-restartlist.conf',list(NAMES));
    write('/proc/sys/kernel/random/boot_id',BOOT+'\n');write('/proc/stat','cpu 0 0 0\nbtime 1000\n');
    write('/var/opt/mgu-deploy/recmgr-at-boot.json',JSON.stringify({boot:BOOT,text:list(NAMES)}));
    write('/states.json',JSON.stringify({}));write('/commands.json','[]');
    const program=at('/systemctl');
    write('/systemctl','#!/usr/bin/env node\n'+
        "const fs=require('fs'),p=require('path'),base=p.dirname(__filename),a=process.argv.slice(2),file=p.join(base,'states.json'),states=JSON.parse(fs.readFileSync(file,'utf8')),unit=a[a.length-1];\n"+
        "const log=p.join(base,'commands.json'),calls=JSON.parse(fs.readFileSync(log,'utf8'));calls.push(a);fs.writeFileSync(log,JSON.stringify(calls));\n"+
        "if(a[0]==='show'){console.log('ActiveState='+(states[unit]||'inactive'));console.log('NRestarts=0');console.log('Result=exit-code');}\n"+
        "else if(a[0]==='is-active'){const s=states[unit]||'inactive';console.log(s);process.exitCode=s==='active'?0:3;}\n"+
        "else if(a[0]==='start'||a[0]==='restart'){states[unit]='active';fs.writeFileSync(file,JSON.stringify(states));}\n"+
        "else if(a[0]!=='reset-failed')process.exitCode=1;\n",0o755);
    // Map guest absolute paths to real fixture files. Tests supply root inode
    // ownership metadata because the core suite is deliberately unprivileged;
    // modes, symlink rejection and actual file descriptors remain real.
    const io={
        realpathSync(name){const real=fs.realpathSync(at(name));return '/'+path.relative(root,real);},
        lstatSync(name){const stat=fs.lstatSync(at(name));stat.uid=0;return stat;},
        openSync(name,flags){return fs.openSync(at(name),flags);},
        fstatSync(fd){const stat=fs.fstatSync(fd);stat.uid=0;return stat;},
        readFileSync(fd,encoding){return fs.readFileSync(fd,encoding);},
        closeSync(fd){return fs.closeSync(fd);}
    };
    const execute=args=>cp.spawnSync(program,args,{encoding:'utf8',timeout:5000});
    return {root,at,write,io,execute,program,
        states(value){write('/states.json',JSON.stringify(value));},
        commands(){return JSON.parse(fs.readFileSync(at('/commands.json'),'utf8'));},
        close(){fs.rmSync(root,{recursive:true,force:true});}};
}
module.exports={fixture,list,BOOT,NAMES};
