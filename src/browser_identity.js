'use strict';
// The visible Browser uses the actual Chromium/Linux identity. Keep Client
// Hints consistent with the legacy UA override; omitting metadata disables
// Chromium's native hints entirely. Do not claim another OS or browser brand.
function create(version,architecture){
    const original=version&&version.userAgent;
    if(typeof original!=='string'||!original||original.length>2048||/[\r\n\0]/.test(original))throw new Error('Browser identity unavailable');
    const userAgent=original.replace(/\bHeadlessChrome\//g,'Chrome/');
    const match=/^(?:HeadlessChrome|Chrome|Chromium)\/(\d+(?:\.\d+){1,3})$/.exec(version.product||'');
    architecture=architecture||process.arch;
    if(!match||original.indexOf('Linux')<0||!['x64','ia32'].includes(architecture))return {userAgent,metadata:null};
    const fullVersion=match[1],major=fullVersion.split('.')[0];
    return {userAgent,metadata:{
        brands:[{brand:'Chromium',version:major}],
        fullVersionList:[{brand:'Chromium',version:fullVersion}],fullVersion,
        platform:'Linux',platformVersion:'',architecture:'x86',model:'',
        mobile:false,bitness:architecture==='x64'?'64':'32',wow64:false
    }};
}
module.exports={create};
