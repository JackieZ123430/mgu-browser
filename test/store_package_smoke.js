'use strict';
// Run after building both packages. Uses an external, separately pinned Store
// checkout; it never invokes deployment, systemd, root hooks or vehicle access.
// node test/store_package_smoke.js <store-root> <frontend.tgz> <runtime.tgz> [catalog.json]
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),vm=require('vm'),Module=require('module');
const [storePath,frontendPath,runtimePath,catalogPath]=process.argv.slice(2);
if(!storePath||!frontendPath||!runtimePath)throw new Error('Expected Store checkout, frontend.tgz and runtime.tgz');
const store=path.resolve(storePath),frontend=path.resolve(frontendPath),runtime=path.resolve(runtimePath);
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-package-smoke-'));
try{
    const unit=path.join(store,'deploy/unit/mgu-deploy.js');
    const source=fs.readFileSync(unit,'utf8'),entry='process.exit(main());';
    assert.equal(source.split(entry).length,2,'Unexpected deploy entry point; review the Store API first');
    const sandbox={require:Module.createRequire(unit),__dirname:path.dirname(unit),process,Buffer,console,module:{exports:{}}};
    vm.runInNewContext(source.replace(entry,'module.exports = {validateArtifact};'),sandbox,{filename:unit});
    const validate=sandbox.module.exports.validateArtifact;
    const app=validate(frontend,work),tool=validate(runtime,work);
    assert.equal(app.id,'mgu_browser');assert.equal(tool.id,'mgu-browser');
    assert.equal(app.version,tool.version);assert.deepEqual(Array.from(app.hmi),['ID7']);
    assert(!fs.existsSync(path.join(app.pkgDir,'node_modules/oap-sdk')),'Published app must omit the proprietary SDK');
    const sourceRoot=path.resolve(__dirname,'..');
    const legacy=new Set(['native_reader.js','http_reader.js','html_page.js','html5_parser.js','park_gate.js','vehicle_signals.js']);
    for(const name of fs.readdirSync(path.join(sourceRoot,'src')).filter(n=>n.endsWith('.js')&&!legacy.has(n))){
        const source=fs.readFileSync(path.join(sourceRoot,'src',name));
        assert(source.equals(fs.readFileSync(path.join(tool.dir,'files/backend',name))),'Stale or missing runtime module '+name);
        assert(source.equals(fs.readFileSync(path.join(app.pkgDir,'javascript',name))),'Stale or missing frontend module '+name);
    }
    assert(fs.readFileSync(path.join(sourceRoot,'apps/mgu_browser/chromium_frontend.js')).equals(fs.readFileSync(path.join(app.pkgDir,'javascript/chromium_frontend.js'))),'Stale frontend UI');
    const kitRuntime=fs.readFileSync(path.join(app.pkgDir,'javascript/kit/mgu.js'),'utf8');
    assert(kitRuntime.includes("require('../browser_shutdown').run(() => process.exit(0))"),'Frontend kit must use the bounded asynchronous shutdown hook');
    assert(!kitRuntime.includes("setTimeout(() => process.exit(0), 200)"),'Old immediate kit shutdown must not bypass Browser cleanup');
    for(const folder of ['runtime','network']){
        const names=folder==='runtime'?fs.readdirSync(path.join(sourceRoot,folder)).filter(n=>n.endsWith('.js')):['control.js','uplink_adapter.js','wifi_profile.js'];
        for(const name of names)assert(fs.readFileSync(path.join(sourceRoot,folder,name)).equals(fs.readFileSync(path.join(tool.dir,'files',folder,name))),'Stale runtime helper '+folder+'/'+name);
    }
    assert(fs.readFileSync(path.join(sourceRoot,'backend/server.js')).equals(fs.readFileSync(path.join(tool.dir,'files/backend/server.js'))),'Stale backend entry point');
    assert(fs.readFileSync(path.join(sourceRoot,'release/runtime_check.sh')).equals(fs.readFileSync(path.join(tool.dir,'files/check.sh'))),'Stale installed runtime check');
    for(const entry of [['backend','mgu-browser-backend.service'],['network','mgu-browser-wifi.service']])assert(fs.readFileSync(path.join(sourceRoot,entry[0],entry[1])).equals(fs.readFileSync(path.join(tool.dir,'units',entry[1]))),'Stale packaged service unit '+entry[1]);
    const provenance=JSON.parse(fs.readFileSync(path.join(tool.dir,'files/build-provenance.json'),'utf8'));
    assert.equal(provenance.version,tool.version);assert.equal(provenance.engineComponent,'0.1.0');
    for(const name of Object.keys(provenance.nativeSources))assert.equal(provenance.nativeSources[name],require('crypto').createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,'native',name))).digest('hex'),'Native source provenance differs');
    if(fs.existsSync(path.join(sourceRoot,'native/audio_bridge.c'))){
        assert(provenance.builtNative&&provenance.builtNative.helpers,'Audio release must record its freshly built helpers');
        for(const name of ['backend-launch','audio-bridge']){
            const record=provenance.builtNative.helpers[name];assert(record,'Missing native helper provenance '+name);
            assert.equal(record.sha256,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(tool.dir,'files',name))).digest('hex'),'Packaged helper differs from its build provenance');
            assert.equal(record.sourceSha256,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,record.source))).digest('hex'),'Helper source differs from its provenance');
        }
        assert.equal(provenance.builtNative.helpers['backend-launch'].static,true);
        assert.equal(provenance.builtNative.helpers['audio-bridge'].interpreter,'/lib/ld-linux-x86-64.so.2');
        assert(provenance.builtNative.helpers['audio-bridge'].needed.includes('libdl.so.2'),'Pre-2.34 headunit glibc needs explicit libdl');
        assert(provenance.builtNative.helpers['audio-bridge'].glibcVersions.every(v=>{const p=v.split('.').map(Number);return p[0]<2||p[0]===2&&p[1]<=27;}),'Audio helper must fit headunit glibc');
    }
    const link=require(path.join(store,'tools/oap_link.js'));
    const donor=require(path.join(store,'tools/test/synthetic_donor.js'));
    const fake=donor.tgz(path.join(work,'synthetic-donor.tgz'));
    const prepared=link.preparePackage(app.pkgDir,path.join(work,'prepared-app.tgz'),{donors:[fake]});
    assert(prepared.sdk,'Store must generate the SDK from its own donor');
    const installable=validate(prepared.file,work);
    assert.equal(installable.prepare,null,'The donor-prepared app must be ready for installation');
    const nativeDir=path.join(tool.dir,'files/backend');
    assert.equal(typeof require(path.join(nativeDir,'peer_uid.node')).peerUid,'function');
    assert.equal(typeof require(path.join(nativeDir,'jpeg_frame.node')).decode,'function');
    if(catalogPath){
        const catalog=require(path.join(store,'native/mgu-updater/js/catalog.js')).parse(fs.readFileSync(catalogPath,'utf8'));
        for(const descriptor of [app,tool]){
            const row=catalog.components.find(c=>c.id===descriptor.id);
            assert(row);assert.equal(row.version,descriptor.version);
            const data=fs.readFileSync(descriptor.file);
            assert.equal(row.artifact.size,data.length);
            assert.equal(row.artifact.sha256,require('crypto').createHash('sha256').update(data).digest('hex'));
        }
        const row=catalog.components.find(c=>c.id==='mgu_browser');
        assert.equal(row.requires['mgu-browser'],tool.version,'Store must upgrade the backend with the frontend');
    }
    console.log('Store acceptance: runtime hashes/units, final source equality, provenance, SDK-free app, synthetic donor preparation, native modules and optional catalog passed ('+app.version+')');
}finally{fs.rmSync(work,{recursive:true,force:true});}
