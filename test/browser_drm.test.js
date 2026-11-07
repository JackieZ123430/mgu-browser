'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const DRM=require('../src/browser_drm');
function fixture(){
    const parent=path.resolve('.local');try{fs.mkdirSync(parent,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
    const root=fs.mkdtempSync(path.join(parent,'drm-unit-')),cdm=root+'/authorized',profile=root+'/profile';
    for(const directory of [cdm,profile,cdm+'/_platform_specific',cdm+'/_platform_specific/linux_x64'])fs.mkdirSync(directory,0o700);
    const manifest={version:'4.10.9999.0',os:'linux',arch:'x64','x-cdm-module-versions':'4','x-cdm-interface-versions':'10,11','x-cdm-host-versions':'10,11'};
    fs.writeFileSync(cdm+'/manifest.json',JSON.stringify(manifest),{mode:0o600});
    // A deliberately non-executable header fixture; no proprietary CDM bytes.
    const elf=Buffer.alloc(64);elf.write('7f454c46',0,'hex');elf[4]=2;elf[5]=1;elf[6]=1;elf.writeUInt16LE(3,16);elf.writeUInt16LE(62,18);elf.writeUInt32LE(1,20);elf.writeUInt16LE(64,52);
    const library=cdm+'/_platform_specific/linux_x64/libwidevinecdm.so';fs.writeFileSync(library,elf,{mode:0o600});
    return {root,cdm,profile,library,manifest,remove(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('optional authorized CDM writes only a Chromium hint; profile cannot select an old native module',()=>{
    const f=fixture();try{
        let prepared=DRM.prepare(f.profile,{cdmDirectory:f.cdm});assert.equal(prepared.configured,true);assert.equal(prepared.version,f.manifest.version);assert.equal(prepared.recognized,false);
        const hint=f.profile+'/WidevineCdm/'+DRM.HINT;assert.equal(JSON.parse(fs.readFileSync(hint)).Path,f.cdm);assert.equal(fs.statSync(hint).mode&0o777,0o600);
        const sentinel=f.root+'/sentinel';fs.writeFileSync(sentinel,'unchanged');fs.unlinkSync(hint);fs.symlinkSync(sentinel,hint);
        prepared=DRM.prepare(f.profile,{});assert.equal(prepared.configuration,'no-cdm');assert.equal(JSON.parse(fs.readFileSync(hint)).Path,'');assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
        const status=DRM.status(DRM.prepare(f.profile,{cdmDirectory:f.cdm}),{state:'unavailable',error:'NotSupportedError'});
        assert.equal(status.protectedPlaybackVerified,false);assert(!JSON.stringify(status).includes(f.cdm),'No administrator path in app status');
    }finally{f.remove();}
});
test('CDM directory, manifest and ELF inputs require a trusted owner and immutable path',()=>{
    const f=fixture();try{
        assert.throws(()=>DRM.validate(f.cdm+'/../authorized',process.getuid()),/directory/);
        fs.chmodSync(f.library,0o666);assert.throws(()=>DRM.validate(f.cdm,process.getuid()),/file/);fs.chmodSync(f.library,0o600);
        const original=fs.readFileSync(f.library);const wrong=Buffer.from(original);wrong.writeUInt16LE(183,18);fs.writeFileSync(f.library,wrong);assert.throws(()=>DRM.validate(f.cdm,process.getuid()),/x86_64/);fs.writeFileSync(f.library,original);
        fs.renameSync(f.library,f.library+'.real');fs.symlinkSync(f.library+'.real',f.library);assert.throws(()=>DRM.validate(f.cdm,process.getuid()));fs.unlinkSync(f.library);fs.renameSync(f.library+'.real',f.library);
        fs.writeFileSync(f.cdm+'/manifest.json',JSON.stringify(Object.assign({},f.manifest,{arch:'arm64'})));assert.throws(()=>DRM.validate(f.cdm,process.getuid()),/manifest/);
        assert.equal(DRM.prepare(f.profile,{cdmDirectory:f.cdm}).configuration,'configuration-rejected');
    }finally{f.remove();}
});
test('production CDM configuration requires root ownership and accepts no launch arguments',()=>{
    const f=fixture();try{
        const config=f.root+'/cdm.json';fs.writeFileSync(config,JSON.stringify({directory:f.cdm}),{mode:0o600});
        assert.throws(()=>DRM.configuration(config),/permissions|rejected/);
        assert.equal(DRM.configuration(config,process.getuid()).version,f.manifest.version);
        fs.writeFileSync(config,JSON.stringify({directory:f.cdm,args:['--no-sandbox']}));assert.throws(()=>DRM.configuration(config,process.getuid()),/configuration/);
        fs.chmodSync(config,0o666);assert.throws(()=>DRM.configuration(config,process.getuid()),/file/);
    }finally{f.remove();}
});
function scope(options){return Object.assign({isSecureContext:true,document:{createElement(){return {canPlayType(){return 'probably';}};}},setTimeout,clearTimeout,navigator:{}},options);}
test('EME diagnostics distinguish secure context, absence and actual CDM creation; sanitize errors',async()=>{
    let called=false;
    let result=JSON.parse(await vm.runInNewContext(DRM.probeScript,scope({isSecureContext:false,navigator:{requestMediaKeySystemAccess(){called=true;}}})));
    assert.equal(result.drm.state,'insecure-context');assert.equal(called,false);
    result=JSON.parse(await vm.runInNewContext(DRM.probeScript,scope()));assert.equal(result.drm.state,'eme-unavailable');
    result=JSON.parse(await vm.runInNewContext(DRM.probeScript,scope({navigator:{requestMediaKeySystemAccess:async()=>({createMediaKeys:async()=>{const e=Error('private provider detail');e.name='OperationError';throw e;}})}})));
    assert.equal(result.widevine,false);assert.equal(result.drm.error,'OperationError');assert(!JSON.stringify(result).includes('private'));
    result=JSON.parse(await vm.runInNewContext(DRM.probeScript,scope({navigator:{requestMediaKeySystemAccess:async()=>({createMediaKeys:async()=>({})})}})));
    assert.equal(result.widevine,true);assert.equal(result.drm.state,'recognized');
    result=JSON.parse(await vm.runInNewContext(DRM.probeScript,scope({setTimeout:callback=>setTimeout(callback,1),navigator:{requestMediaKeySystemAccess:()=>new Promise(()=>{})}})));
    assert.equal(result.drm.state,'timed-out');assert.equal(result.drm.error,'TimeoutError');
});
