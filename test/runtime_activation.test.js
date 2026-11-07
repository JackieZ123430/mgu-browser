'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const activation=require('../runtime/activate'),{fixture,list,BOOT,NAMES}=require('./fixtures/runtime_activation_fixture');
test('Browser activation requires both service names in both recmgr sections',()=>{
    assert(activation.listsAll(list(NAMES)));
    assert(!activation.listsAll(list([NAMES[0]])));
    assert(!activation.listsAll('[Whitelist]\n'+NAMES.join('\n')));
    assert(activation.listsAll(list(NAMES).replace(/\n/g,' # comment\r\n')));
});
test('Current-boot recmgr snapshot blocks fresh hot-start even after clock changes',()=>{
    const f=fixture();try{
        f.write('/var/opt/mgu-deploy/recmgr-at-boot.json',JSON.stringify({boot:BOOT,text:list(['stockd'])}));
        fs.utimesSync(f.at('/etc/recmgr-restartlist.conf'),100,100);
        assert(!activation.loadedThisBoot(f.io));
        const result=activation.recover({fs:f.io,execute:f.execute});
        assert.match(result.reboot,/next head-unit start/);assert.deepEqual(f.commands(),[]);
    }finally{f.close();}
});
test('Only a trusted list predating boot can substitute for a missing boot snapshot',()=>{
    const f=fixture();try{
        fs.unlinkSync(f.at('/var/opt/mgu-deploy/recmgr-at-boot.json'));
        fs.utimesSync(f.at('/etc/recmgr-restartlist.conf'),100,100);
        assert(activation.loadedThisBoot(f.io));
        fs.utimesSync(f.at('/etc/recmgr-restartlist.conf'),1100,1100);
        assert(!activation.loadedThisBoot(f.io));
    }finally{f.close();}
});
test('Unsafe or malformed root boot proof never starts a Browser service',()=>{
    const f=fixture();try{
        fs.chmodSync(f.at('/var/opt/mgu-deploy'),0o777);assert(!activation.loadedThisBoot(f.io));
        fs.chmodSync(f.at('/var/opt/mgu-deploy'),0o755);
        fs.chmodSync(f.at('/etc/recmgr-restartlist.conf'),0o666);assert(!activation.loadedThisBoot(f.io));
        fs.chmodSync(f.at('/etc/recmgr-restartlist.conf'),0o644);
        const inspect=f.io.fstatSync;f.io.fstatSync=fd=>{const st=inspect(fd);st.uid=3911;return st;};
        assert(!activation.loadedThisBoot(f.io));f.io.fstatSync=inspect;
        fs.linkSync(f.at('/etc/recmgr-restartlist.conf'),f.at('/etc/list-hardlink'));
        assert(!activation.loadedThisBoot(f.io));fs.unlinkSync(f.at('/etc/list-hardlink'));
        f.write('/var/opt/mgu-deploy/recmgr-at-boot.json','null');assert(!activation.loadedThisBoot(f.io));
        f.write('/var/opt/mgu-deploy/recmgr-at-boot.json',JSON.stringify({boot:BOOT,text:list(NAMES)}));
        fs.renameSync(f.at('/etc/recmgr-restartlist.conf'),f.at('/etc/actual-list'));
        fs.symlinkSync('actual-list',f.at('/etc/recmgr-restartlist.conf'));assert(!activation.loadedThisBoot(f.io));
        assert.deepEqual(f.commands(),[]);
    }finally{f.close();}
});
test('Activation recovers failed and inactive services after a proven boot, WLAN first',()=>{
    const f=fixture();try{
        f.states({'mgu-browser-wifi.service':'failed','mgu-browser-backend.service':'inactive'});
        const result=activation.recover({fs:f.io,execute:f.execute});assert(!result.reboot);
        assert.deepEqual(f.commands().filter(args=>args[0]!=='show'),[
            ['reset-failed','mgu-browser-wifi.service'],['start','mgu-browser-wifi.service'],['start','mgu-browser-backend.service']
        ]);
    }finally{f.close();}
});
test('Activation leaves running services alone and requires both dependency boot entries',()=>{
    const f=fixture();try{
        f.states({'mgu-browser-wifi.service':'active','mgu-browser-backend.service':'active'});
        activation.recover({fs:f.io,execute:f.execute});assert(f.commands().every(args=>args[0]==='show'));
        f.write('/commands.json','[]');
        f.write('/var/opt/mgu-deploy/recmgr-at-boot.json',JSON.stringify({boot:BOOT,text:list(['mgu-browser-backend'])}));
        activation.recover({fs:f.io,execute:f.execute});assert.deepEqual(f.commands(),[]);
    }finally{f.close();}
});
test('A recovery command failure is reported to Store activation',()=>{
    const f=fixture();try{
        assert.throws(()=>activation.recover({fs:f.io,execute:args=>args[0]==='show'?{status:0,stdout:'ActiveState=failed\n'}:{status:1}}),/recovery failed/);
    }finally{f.close();}
});
test('Activation waits for an already activating service through an idempotent start job',()=>{
    const f=fixture();try{
        f.states({'mgu-browser-wifi.service':'active','mgu-browser-backend.service':'activating'});
        activation.recover({fs:f.io,execute:f.execute});
        assert.deepEqual(f.commands().filter(args=>args[0]!=='show'),[['start','mgu-browser-backend.service']]);
    }finally{f.close();}
});
