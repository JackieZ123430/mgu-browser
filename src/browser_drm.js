'use strict';
// Optional, administrator-provisioned CDM. Never download, copy or execute a CDM
// in Node. Chromium validates its own CDM ABI and loads it inside its sandbox.
const fs=require('fs'),path=require('path');
const HINT='latest-component-updated-widevine-cdm';
function owned(stat,uid){return (stat.uid===0||stat.uid===uid)&&!(stat.mode&0o022)&&!stat.isSymbolicLink();}
function directories(directory,uid){
    if(typeof directory!=='string'||directory.length>4096||directory.indexOf('\0')>=0||!path.isAbsolute(directory)||path.normalize(directory)!==directory)throw Error('CDM directory rejected');
    let current='/';
    for(const part of directory.split('/').filter(Boolean)){current=path.join(current,part);const st=fs.lstatSync(current);if(!st.isDirectory()||!owned(st,uid))throw Error('CDM directory permissions rejected');}
}
function readOwned(file,uid,max,head){
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const st=fs.fstatSync(fd);if(!st.isFile()||st.nlink!==1||!owned(st,uid)||st.size>max||st.size<(head||0))throw Error('CDM file rejected');
        if(head){const bytes=Buffer.alloc(head);if(fs.readSync(fd,bytes,0,head,0)!==head)throw Error('CDM header rejected');return bytes;}
        return fs.readFileSync(fd,'utf8');
    }finally{fs.closeSync(fd);}
}
function validate(directory,uid){
    directories(directory,uid);
    const manifest=JSON.parse(readOwned(path.join(directory,'manifest.json'),uid,65536));
    if(!manifest||!/^\d{1,6}\.\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(manifest.version||'')||(manifest.os&&manifest.os!=='linux')||(manifest.arch&&manifest.arch!=='x64'))throw Error('CDM manifest rejected');
    for(const key of ['x-cdm-module-versions','x-cdm-interface-versions','x-cdm-host-versions'])if(typeof manifest[key]!=='string'||!/^\d+(,\d+)*$/.test(manifest[key]))throw Error('CDM ABI declaration rejected');
    const platform=path.join(directory,'_platform_specific/linux_x64');directories(platform,uid);
    const elf=readOwned(path.join(platform,'libwidevinecdm.so'),uid,128*1024*1024,64);
    if(elf.slice(0,4).toString('hex')!=='7f454c46'||elf[4]!==2||elf[5]!==1||elf[6]!==1||elf.readUInt16LE(16)!==3||elf.readUInt16LE(18)!==62||elf.readUInt32LE(20)!==1||elf.readUInt16LE(52)!==64)throw Error('Linux x86_64 CDM required');
    return {directory,version:manifest.version};
}
function configuration(file,uid){
    uid=uid===undefined?0:uid;directories(path.dirname(file),uid);
    let data;try{data=readOwned(file,uid,8192);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    const value=JSON.parse(data);
    if(!value||typeof value.directory!=='string'||Object.keys(value).some(k=>k!=='directory'))throw Error('CDM configuration rejected');
    return validate(value.directory,uid);
}
function prepare(profile,options){
    options=options||{};let selected=null,reason='no-cdm';
    try{
        if(options.cdmConfig)selected=configuration(options.cdmConfig);
        else if(options.cdmDirectory)selected=validate(options.cdmDirectory,process.getuid());
        if(selected)reason='configured';
    }catch(e){reason='configuration-rejected';}
    // A restored profile must not select a different native library. Even with
    // no configured CDM, overwrite Chromium's hint with the empty selection.
    const directory=path.join(profile,'WidevineCdm');
    try{fs.mkdirSync(directory,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
    const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())throw Error('Unsafe CDM profile directory');
    fs.chmodSync(directory,0o700);
    const file=path.join(directory,HINT);try{fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    fs.writeFileSync(file,JSON.stringify({Path:selected?selected.directory:''})+'\n',{mode:0o600,flag:'wx'});
    return {configured:!!selected,configuration:reason,version:selected?selected.version:null,recognized:false,protectedPlaybackVerified:false};
}
function status(prepared,probe){
    const result=Object.assign({configured:false,configuration:'no-cdm',version:null,recognized:false,protectedPlaybackVerified:false},prepared||{});
    if(probe){result.recognized=probe.state==='recognized';result.state=probe.state;result.error=probe.error||null;}
    else result.state='not-tested';
    return result;
}
// Fixed JavaScript, no license server calls or provider/account requests.
const probeScript=`(async()=>{
    const video=document.createElement("video"),audio=document.createElement("audio");
    const result={secure:isSecureContext,h264:!!video.canPlayType('video/mp4; codecs="avc1.42E01E"'),vp9:!!video.canPlayType('video/webm; codecs="vp9"'),aac:!!audio.canPlayType('audio/mp4; codecs="mp4a.40.2"'),opus:!!audio.canPlayType('audio/webm; codecs="opus"'),widevine:false,drm:{state:"unavailable",error:null}};
    if(!isSecureContext){result.drm.state="insecure-context";return JSON.stringify(result);}
    if(!navigator.requestMediaKeySystemAccess){result.drm.state="eme-unavailable";return JSON.stringify(result);}
    let timer;
    try{
        await Promise.race([(async()=>{
            const access=await navigator.requestMediaKeySystemAccess("com.widevine.alpha",[
                {initDataTypes:["cenc"],videoCapabilities:[{contentType:'video/mp4; codecs="avc1.42E01E"'}]},
                {initDataTypes:["cenc"],videoCapabilities:[{contentType:'video/webm; codecs="vp9"'}]}
            ]);
            await access.createMediaKeys();
        })(),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error();e.name="TimeoutError";reject(e);},4000);})]);
        result.widevine=true;result.drm.state="recognized";
    }catch(e){result.drm.error=["NotSupportedError","SecurityError","InvalidStateError","QuotaExceededError","TimeoutError","OperationError"].includes(e.name)?e.name:"UnknownError";result.drm.state=e.name==="TimeoutError"?"timed-out":"unavailable";}
    finally{clearTimeout(timer);}
    return JSON.stringify(result);
})()`;
module.exports={validate,configuration,prepare,status,probeScript,HINT};
