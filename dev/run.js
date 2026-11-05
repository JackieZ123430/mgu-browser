'use strict';
// Local WSL supervisor: source sync, SDK live emulator and Chromium backend.
const fs=require('fs'),path=require('path'),net=require('net'),cp=require('child_process');
const state=path.join(process.env.HOME,'bmw-emulator'),config=JSON.parse(fs.readFileSync(path.join(state,'config.json'),'utf8'));
if(process.platform!=='linux'||process.getuid()===0||process.getuid()!==config.uid)throw new Error('Run as the dedicated WSL development user');
const control=path.join(state,'run/control.sock'),browserSocket=path.join(state,'run/browser.sock');
function connect(){return new Promise(resolve=>{const s=net.createConnection(control);s.once('connect',()=>resolve(s));s.once('error',()=>resolve(null));});}
async function main(){
    const existing=await connect();
    if(process.argv.includes('--stop')){
        if(!existing){console.log('Emulator ist bereits gestoppt.');return;}
        existing.end('stop');return;
    }
    if(existing){existing.end('status');console.log('Emulator laeuft bereits: http://localhost:'+config.port);return;}
    for(const file of [control,browserSocket]){try{const s=fs.lstatSync(file);if(!s.isSocket()||s.uid!==process.getuid())throw new Error('Unexpected runtime file');fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
    let emulator=null,backend=null,stopping=false,restartBackend=false;
    const log=(label,data)=>String(data).trimEnd().split('\n').forEach(line=>console.log('['+new Date().toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin'})+'] '+label+': '+line));
    const env=Object.assign({},process.env,{MGU_EMULATOR_MODE:'1',MGU_BROWSER_SOCKET:browserSocket,MGU_BROWSER_DATA:path.join(state,'data'),MGU_CHROMIUM:config.chromium});
    const copy=(source,target)=>{
        const body=fs.readFileSync(source);if(fs.existsSync(target)&&fs.readFileSync(target).equals(body))return false;
        const temp=path.join(path.dirname(target),'.'+path.basename(target)+'.partial');
        fs.writeFileSync(temp,body);fs.renameSync(temp,target);return true;
    };
    function sync(){
        let changed=false;
        for(const file of fs.readdirSync(path.join(config.project,'apps/mgu_browser'))){
            if(!/\.(js|json|png)$/.test(file))continue;
            copy(path.join(config.project,'apps/mgu_browser',file),path.join(state,'apps/mgu_browser',file));
        }
        for(const file of fs.readdirSync(path.join(config.project,'src')).filter(f=>f.endsWith('.js'))){
            const source=path.join(config.project,'src',file);
            copy(source,path.join(state,'apps/mgu_browser',file));
            if(copy(source,path.join(state,'backend',file)))changed=true;
        }
        if(copy(path.join(config.project,'dev/backend.js'),path.join(state,'backend/local_backend.js')))changed=true;
        if(changed&&backend&&!restartBackend){restartBackend=true;backend.kill('SIGTERM');}
    }
    function startBackend(){
        if(stopping)return;restartBackend=false;
        try{const s=fs.lstatSync(browserSocket);if(!s.isSocket()||s.uid!==process.getuid())throw new Error('Unexpected browser socket');fs.unlinkSync(browserSocket);}catch(e){if(e.code!=='ENOENT')throw e;}
        backend=cp.spawn(process.execPath,['--max-old-space-size=128',path.join(state,'backend/local_backend.js')],{env,stdio:['ignore','pipe','pipe']});
        backend.stdout.on('data',d=>log('Backend',d));backend.stderr.on('data',d=>log('Backend',d));
        backend.on('exit',(code,signal)=>{backend=null;if(!stopping){log('Backend','Neustart nach '+(signal||code));setTimeout(startBackend,500);}});
    }
    sync();startBackend();
    emulator=cp.spawn(process.execPath,[path.join(state,'kit/tools/emu.js'),'mgu_browser','--port',String(config.port)],{cwd:state,env,stdio:['ignore','pipe','pipe']});
    emulator.stdout.on('data',d=>log('Emulator',d));emulator.stderr.on('data',d=>log('Emulator',d));
    emulator.on('exit',(code,signal)=>{log('Emulator','beendet: '+(signal||code));if(!stopping)shutdown();});
    const poll=setInterval(()=>{try{sync();}catch(e){log('Quellcode',e.message);}},600);
    const ctl=net.createServer(s=>{s.on('error',()=>{});s.on('data',b=>{const op=String(b).trim();s.end(JSON.stringify({pid:process.pid,url:'http://localhost:'+config.port}));if(op==='stop')shutdown();});});
    ctl.listen(control,()=>{fs.chmodSync(control,0o600);console.log('BMW Browser Emulator: http://localhost:'+config.port+'/?panel=bottom');});
    async function shutdown(){
        if(stopping)return;stopping=true;clearInterval(poll);ctl.close();
        const children=[emulator,backend].filter(Boolean);
        for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
        await Promise.race([Promise.all(children.map(child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(r=>child.once('exit',r)))),new Promise(r=>setTimeout(r,6500))]);
        for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
        for(const file of [control,browserSocket])try{fs.unlinkSync(file);}catch(e){}
        process.exit(0);
    }
    process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
