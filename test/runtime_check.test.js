'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {waitReady,inspect}=require('../runtime/check'),{fixture}=require('./fixtures/runtime_activation_fixture');
const STATUS='/run/mgu-browser/status.json',SOCKET='/var/opt/mgu-browser/data/backend.sock',WALL=1700000000000;
function readyFixture(){
    const f=fixture(),lstat=f.io.lstatSync;
    f.io.lstatSync=name=>name===SOCKET?{isSocket:()=>true,uid:3911,gid:13001,mode:0o660}:lstat(name);
    f.status=value=>f.write(STATUS,JSON.stringify(Object.assign({state:'running',version:'0.13.3',pid:123,appUid:13001,at:new Date(WALL).toISOString()},value||{})));
    f.status();let elapsed=0;
    f.options={fs:f.io,identity:{ready:true,serviceUid:3911,appUid:13001},version:'0.13.3',wallClock:()=>WALL,alive:()=>true,clock:()=>elapsed,sleep:async ms=>{elapsed+=ms;},timeout:1000};
    f.elapsed=()=>elapsed;return f;
}
test('Runtime check waits from starting to exact current-version IPC readiness without real sleeps',async()=>{
    const f=readyFixture();try{
        f.status({state:'starting'});const advance=f.options.sleep;
        f.options.sleep=async ms=>{await advance(ms);if(f.elapsed()>=500)f.status();};
        assert.deepEqual(await waitReady(f.options),{ready:true});assert.equal(f.elapsed(),500);
    }finally{f.close();}
});
test('Runtime check rejects an old running version until the bounded deadline',async()=>{
    const f=readyFixture();try{
        f.status({version:'0.13.2'});
        await assert.rejects(()=>waitReady(f.options),/timed out: runtime-version-mismatch/);assert.equal(f.elapsed(),1000);
    }finally{f.close();}
});
test('Runtime check permanently failed startup times out and missing app registration skips IPC',async()=>{
    const f=readyFixture();try{
        f.status({state:'backend_exited'});
        await assert.rejects(()=>waitReady(f.options),/timed out: backend-not-ready/);assert.equal(f.elapsed(),1000);
        assert.deepEqual(await waitReady({identity:{ready:false}}),{ready:false,waitingForApp:true});
    }finally{f.close();}
});
test('Runtime check rejects stale, foreign, dead and unsafe startup/socket evidence',()=>{
    const f=readyFixture();try{
        f.status({at:new Date(WALL-90001).toISOString()});assert.equal(inspect(f.options),'startup-status-stale');
        f.status({appUid:14876});assert.equal(inspect(f.options),'app-identity-mismatch');
        f.status();assert.equal(inspect(Object.assign({},f.options,{alive:()=>false})),'supervisor-not-running');
        fs.chmodSync(f.at(STATUS),0o666);assert.equal(inspect(f.options),'startup-status-unavailable');
        fs.chmodSync(f.at(STATUS),0o644);
        const lstat=f.io.lstatSync;f.io.lstatSync=name=>name===SOCKET?{isSocket:()=>true,uid:3911,gid:14876,mode:0o660}:lstat(name);
        assert.equal(inspect(f.options),'backend-socket-identity-mismatch');
    }finally{f.close();}
});
