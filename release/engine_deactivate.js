'use strict';
const fs=require('fs'),cp=require('child_process');
if(fs.existsSync('/var/opt/mgu-browser/current/runtime/launch.js')){
 const wasActive=cp.spawnSync('systemctl',['is-active','mgu-browser-backend.service']).status===0;
 if(wasActive){
  const fd=fs.openSync('/var/opt/mgu-browser-engine/restart-runtime.json',fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);
  try{const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==0||st.nlink!==1)throw Error('Unsafe engine restart marker');fs.ftruncateSync(fd,0);fs.writeSync(fd,'{"restart":true}\n');fs.fchmodSync(fd,0o600);}finally{fs.closeSync(fd);}
 }
 const r=cp.spawnSync('systemctl',['stop','mgu-browser-backend.service'],{timeout:25000});if(r.status!==0)process.exit(1);
}
console.log(JSON.stringify({status:'Browser backend stopped before engine removal; saved browser data retained'}));
