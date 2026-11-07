'use strict';
// Uses the unchanged official installer's real restart policy and the built
// runtime manifest. systemctl/ownership are authored fixtures, not a vehicle.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),Module=require('module');
const activation=require('../runtime/activate'),{fixture,list,BOOT,NAMES}=require('./fixtures/runtime_activation_fixture');
const store=path.resolve(process.argv[2]||''),artifact=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw Error('Expected Store checkout and built runtime.tgz');
const f=fixture();
try{
    const file=path.join(store,'deploy/unit/mgu-deploy.js'),source=fs.readFileSync(file,'utf8');
    const env=Object.assign({},process.env,{MGU_DEPLOY_FAKE_ROOT:'1',MGU_DEPLOY_VAR_OPT:f.at('/var/opt'),MGU_DEPLOY_RECMGR:f.at('/etc/recmgr-restartlist.conf'),MGU_DEPLOY_BOOT_ID:f.at('/proc/sys/kernel/random/boot_id'),MGU_DEPLOY_PROC_STAT:f.at('/proc/stat'),MGU_DEPLOY_SYSTEMCTL:f.program});
    const box={require:Module.createRequire(file),__dirname:path.dirname(file),process:Object.assign(Object.create(process),{env}),Buffer,console,module:{exports:{}}};
    assert.equal(source.split('process.exit(main());').length,2);
    vm.runInNewContext(source.replace('process.exit(main());','module.exports={validateArtifact,applyRestarts};'),box,{filename:file});
    const api=box.module.exports,tool=api.validateArtifact(artifact,f.root),manifest=tool.component;
    assert.deepEqual(Array.from(manifest.activate),['node','runtime/activate.js']);
    assert(fs.readFileSync(path.join(tool.dir,'files/runtime/activate.js')).equals(fs.readFileSync(path.join(__dirname,'../runtime/activate.js'))));
    for(const unit of ['mgu-browser-wifi.service','mgu-browser-backend.service']){
        const text=fs.readFileSync(path.join(tool.dir,'units',unit),'utf8');
        assert(text.includes('RequiresMountsFor=/var/opt'));assert(text.includes('StandardOutput=journal'));assert(text.includes('StandardError=journal'));
    }
    // The Store's public hook contract is activate before its immediate check;
    // a reboot result defers that check. Guard the real install implementation.
    const install=source.slice(source.indexOf('function installTool('),source.indexOf('function recordInstalledTool('));
    assert(install.indexOf("runHook(c.id, dest, c, 'activate'")<install.indexOf('runCheck(c, root)'));
    for(const fresh of [true,false]){
        f.write('/commands.json','[]');f.states({'mgu-browser-wifi.service':'failed','mgu-browser-backend.service':'failed'});
        f.write('/var/opt/mgu-deploy/recmgr-at-boot.json',JSON.stringify({boot:BOOT,text:list(fresh?['stockd']:NAMES)}));
        const state={pending_reboot:[]};
        const touched=api.applyRestarts(manifest,state,fresh);
        assert.equal(touched.length,0);
        assert.deepEqual(f.commands().filter(args=>['start','restart'].includes(args[0])),[],'Official updater leaves an ordinary failed update stopped');
        const recovered=activation.recover({fs:f.io,execute:f.execute});
        const starts=f.commands().filter(args=>args[0]==='start');
        if(fresh){assert(recovered.reboot);assert.equal(starts.length,0);assert.equal(state.pending_reboot.length,1);}
        else{assert(!recovered.reboot);assert.equal(starts.length,2);for(const unit of ['mgu-browser-wifi.service','mgu-browser-backend.service'])assert.equal(f.execute(['is-active',unit]).status,0);}
    }
    console.log('Official Store restart policy + packaged activation: failed update recovered; first-install recmgr reboot gate retained; real systemd/vehicle not exercised');
}finally{f.close();}
