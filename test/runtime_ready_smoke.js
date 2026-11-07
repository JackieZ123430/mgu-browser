'use strict';
// Runs on Node 8 as well as current Node. A native execl handoff must retain
// the dedicated readiness FD; the child only acknowledges after real listen.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-ready-smoke-'));
async function main(){
    const source=path.join(root,'handoff.c'),binary=path.join(root,'handoff'),child=path.join(root,'server.js'),socket=path.join(root,'backend.sock');
    fs.writeFileSync(source,'#include <unistd.h>\nint main(int argc,char **argv){if(argc<3)return 2;execv(argv[1],argv+1);return 127;}\n');
    cp.execFileSync('cc',['-O2','-Wall','-Wextra','-Werror',source,'-o',binary]);
    fs.writeFileSync(child,"'use strict';const fs=require('fs'),net=require('net');const server=net.createServer();server.listen(process.argv[2],()=>{fs.writeSync(3,'MGU_BROWSER_BACKEND_READY\\n');process.stdin.once('data',()=>server.close());});\n");
    const launched=cp.spawn(binary,[process.execPath,child,socket],{stdio:['pipe','ignore','pipe','pipe']});
    let result='',stderr='';launched.stdio[3].on('data',data=>{result+=data.toString();assert(result.length<=64);assert(fs.statSync(socket).isSocket(),'the native-to-Node signal must follow listen');launched.stdin.end('ack');});
    launched.stderr.on('data',data=>{stderr+=data.toString();});
    await new Promise((resolve,reject)=>{launched.once('error',reject);launched.once('exit',code=>code===0?resolve():reject(Error('native handoff failed '+code+': '+stderr)));});
    assert.equal(result,'MGU_BROWSER_BACKEND_READY\n');
    console.log(JSON.stringify({node:process.version,nativeExecl:true,postListenReady:true}));
}
main().then(()=>{cp.execFileSync('rm',['-rf',root]);},e=>{cp.execFileSync('rm',['-rf',root]);console.error(e.stack);process.exitCode=1;});
