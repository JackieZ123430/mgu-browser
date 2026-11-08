'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),EventEmitter=require('events');
const SOURCE=fs.readFileSync(path.join(__dirname,'../runtime/launch.js'),'utf8');
function launch(options){
    options=options||{};
    const records=[],timers=[],exits=[],calls=[],spawned=[];
    let uid=0,spawnOptions;
    const child=new EventEmitter();child.stdio=[null,null,null,new EventEmitter()];child.kill=signal=>calls.push(signal);
    const process=new EventEmitter();Object.assign(process,{pid:424242,env:{},getuid:()=>uid,setgroups:g=>calls.push(['groups',g]),setgid:g=>calls.push(['gid',g]),setuid:u=>{uid=u;calls.push(['uid',u]);},exit:code=>exits.push(code)});
    const services={
        './setup':{prepare(){if(options.setupError)throw options.setupError;return {ready:!options.wait,serviceUid:3911,appUid:12397,engineRoot:'/trusted/engine'};}},
        './startup_status':{open(version){assert.equal(version,'0.13.3');return {write:(state,extra)=>records.push({state,...extra}),close:()=>calls.push('status-close')};}},
        './legacy_cleanup':{cleanup(){calls.push('legacy-cleanup');return {removed:false};}},
        './remote_firewall':{apply(){calls.push('remote-firewall');return {applied:0};}},
        fs:{readFileSync:()=>'{"version":"0.13.3"}'},
        child_process:{spawn(name,args,opts){spawned.push({name,args});if(options.spawnError&&!/remote_firewall/.test(args[0]||''))throw options.spawnError;if(!/remote_firewall/.test(args[0]||''))spawnOptions=opts;return /remote_firewall/.test(args[0]||'')?new EventEmitter():child;}}
    };
    vm.runInNewContext(SOURCE,{require:name=>services[name]||require(name),process,console:{log(){},error(){}},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},__dirname:'/fixture/runtime'},{filename:'runtime/launch.js'});
    return {records,timers,exits,calls,child,process,spawnOptions,spawned};
}
test('The launcher waits for the dedicated post-listen ready signal and preserves startup work',()=>{
    const f=launch();
    assert.deepEqual(f.records.map(r=>r.state),['preparing','starting']);
    assert.deepEqual(Array.from(f.spawnOptions.stdio),['inherit','inherit','inherit','pipe']);
    assert.equal(f.spawnOptions.env.MGU_BROWSER_STATUS_FD,'3');
    assert(f.calls.includes('legacy-cleanup'));assert(f.calls.includes('remote-firewall'));
    assert(f.spawned.some(s=>/remote_firewall\.js$/.test(s.args[0])&&s.args[1]==='watch'),'a root keeper re-applies the remote rules after mgu-uplink rebuilds its table');
    assert.equal(f.timers.length,0,'an elapsed timer cannot claim socket readiness');
    f.child.stdio[3].emit('data',Buffer.from('MGU_BROWSER_BACKEND_'));
    assert.equal(f.records.at(-1).state,'starting');
    f.child.stdio[3].emit('data',Buffer.from('READY\n'));
    assert.equal(f.records.at(-1).state,'running');
    f.child.emit('exit',125,null);assert.equal(f.records.at(-1).state,'backend_exited');assert.equal(f.records.at(-1).code,125);assert.equal(f.exits.at(-1),125);
});
test('Malformed, oversized or late ready messages do not claim a running backend',()=>{
    for(const message of ['MGU_BROWSER_BACKEND_READY\nextra','other\n','x'.repeat(65)]){
        const f=launch();f.child.stdio[3].emit('data',Buffer.from(message));assert(!f.records.some(r=>r.state==='running'));
    }
    const f=launch();f.process.emit('SIGTERM');f.child.stdio[3].emit('data',Buffer.from('MGU_BROWSER_BACKEND_READY\n'));
    assert(!f.records.some(r=>r.state==='running'));assert.equal(f.records.at(-1).state,'stopped');assert(f.calls.includes('SIGTERM'));
});
test('Setup, registration and spawn failures publish fixed states while retaining retries',()=>{
    const failure=launch({setupError:Error('/private/raw/setup/path')});
    assert.equal(failure.records.at(-1).state,'setup_failed');assert.equal(failure.timers[0].delay,15000);
    assert(!JSON.stringify(failure.records).includes('/private'));
    const waiting=launch({wait:true});assert.equal(waiting.records.at(-1).state,'waiting_for_app');assert.equal(waiting.timers[0].delay,5000);
    const spawn=launch({spawnError:Error('/private/native/path')});assert.equal(spawn.records.at(-1).state,'backend_launch_failed');assert.equal(spawn.exits[0],1);
    assert(!JSON.stringify(spawn.records).includes('/private'));
    const error=launch();error.child.emit('error',Error('/private/native/path'));assert.equal(error.records.at(-1).state,'backend_launch_failed');assert.equal(error.exits[0],1);
});
