'use strict';
const fs=require('fs'),path=require('path');
const UID=3911;
function appUid(text){
    const ids=String(text).split('\n').map(l=>/^([0-9]+)=mgu_browser\s*$/.exec(l.trim())).filter(Boolean).map(m=>Number(m[1]));
    if(ids.length>1||ids.some(id=>!Number.isInteger(id)||id<12203||id>65535))throw Error('Invalid or duplicate Browser app identity');
    return ids.length?ids[0]:null;
}
function directory(name,mode,owner){
    try{fs.mkdirSync(name,mode);}catch(e){if(e.code!=='EEXIST')throw e;}
    const st=fs.lstatSync(name);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==owner||(st.mode&0o022))throw Error('Unsafe runtime directory: '+name);
}
function readOwned(name,owners,max,trustedGroup){
    const fd=fs.openSync(name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const s=fs.fstatSync(fd),forbidden=trustedGroup!==undefined&&s.uid===trustedGroup&&s.gid===trustedGroup?0o002:0o022;if(!s.isFile()||s.nlink!==1||owners.indexOf(s.uid)<0||(s.mode&forbidden)||s.size>max)throw Error('Unsafe runtime input');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
}
function writeRoot(name,text,mode,gid){
    const fd=fs.openSync(name,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,mode);
    try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==0||s.nlink!==1)throw Error('Unsafe runtime output');fs.ftruncateSync(fd,0);fs.writeSync(fd,text);fs.fchownSync(fd,0,gid||0);fs.fchmodSync(fd,mode);}finally{fs.closeSync(fd);}
}
function prepare(){
    if(process.getuid()!==0)throw Error('Root setup required');
    for(const p of ['/var','/var/opt'])directory(p,0o755,0);
    const base='/var/opt/mgu-browser';directory(base,0o755,0);directory(base+'/network',0o700,0);directory(base+'/work',0o755,0);
    const passwd=readOwned('/etc/passwd',[0],262144).split('\n').filter(Boolean).map(l=>l.split(':'));
    if(passwd.some(p=>Number(p[2])===UID&&p[0]!=='mgu-browser'))throw Error('Runtime UID 3911 is occupied by another system account');
    const engineRoot=fs.realpathSync('/var/opt/mgu-browser-engine/current/engine');
    if(!/^\/var\/opt\/mgu-browser-engine\/versions\/[0-9]+\.[0-9]+\.[0-9]+\/engine$/.test(engineRoot))throw Error('Unexpected versioned engine path');
    let cursor='/';for(const part of engineRoot.split('/').filter(Boolean)){cursor=path.join(cursor,part);directory(cursor,0o755,0);}
    const sandbox=fs.lstatSync(engineRoot+'/chrome-sandbox');if(!sandbox.isFile()||sandbox.uid!==0||(sandbox.mode&0o7777)!==0o4755)throw Error('Chromium sandbox permissions invalid');
    let application=null;
    try{application=appUid(readOwned('/var/opt/public/oap/oap_12201/security/uids.txt',[0,12201],262144,12201));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!application)return {ready:false,serviceUid:UID,engineRoot};
    const data=base+'/data';try{fs.mkdirSync(data,0o750);}catch(e){if(e.code!=='EEXIST')throw e;}
    const fd=fs.openSync(data,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    try{const st=fs.fstatSync(fd);if(!st.isDirectory()||[0,UID].indexOf(st.uid)<0)throw Error('Existing Browser data belongs to another account');fs.fchownSync(fd,UID,application);fs.fchmodSync(fd,0o750);}finally{fs.closeSync(fd);}
    const resolver=base+'/network/resolv.conf';if(!fs.existsSync(resolver))writeRoot(resolver,'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n',0o644,0);
    const network=base+'/network-status.json';if(!fs.existsSync(network))writeRoot(network,JSON.stringify({connected:false,updated:new Date().toISOString()}),0o640,application);
    else {readOwned(network,[0],16384);fs.chownSync(network,0,application);fs.chmodSync(network,0o640);}
    const identity={ready:true,serviceUid:UID,appUid:application,engineRoot};
    writeRoot(base+'/runtime-identity.json',JSON.stringify(identity)+'\n',0o644,0);
    return identity;
}
module.exports={appUid,readOwned,writeRoot,prepare};
