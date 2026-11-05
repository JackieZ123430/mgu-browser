'use strict';
const cp=require('child_process'),fs=require('fs');
const r=cp.spawnSync('/bin/sh',[__dirname+'/check.sh'],{encoding:'utf8',timeout:20000});
if(r.status!==0){process.stderr.write(r.stderr||'Engine version check failed');process.exit(1);}
process.stdout.write(r.stdout||'');
const marker='/var/opt/mgu-browser-engine/restart-runtime.json';let resume=false;
try{const fd=fs.openSync(marker,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==0||st.nlink!==1||st.size>128)throw Error('Unsafe restart marker');resume=JSON.parse(fs.readFileSync(fd,'utf8')).restart===true;}finally{fs.closeSync(fd);}}catch(e){if(e.code!=='ENOENT')throw e;}
if(fs.existsSync('/var/opt/mgu-browser/current/runtime/launch.js')){
 const active=cp.spawnSync('systemctl',['is-active','mgu-browser-backend.service']).status===0;
 if(active||resume){if(cp.spawnSync('systemctl',[active?'restart':'start','mgu-browser-backend.service'],{timeout:25000}).status!==0)process.exit(1);}
}
if(resume)fs.unlinkSync(marker);
console.log(JSON.stringify({status:'Versioned engine ready; existing running browsers use their pinned engine version'}));
