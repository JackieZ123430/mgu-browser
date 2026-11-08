'use strict';
// Disposable container only. Package/engine/test inputs are read-only binds;
// all extraction and the public ALSA library stay in the container filesystem.
const fs=require('fs'),cp=require('child_process'),assert=require('assert'),crypto=require('crypto');
function run(file,args){const p=cp.spawnSync(file,args,{stdio:'inherit',timeout:30000});assert.equal(p.status,0,file+' fixture preparation failed');}
function mkdir(dir){run('/bin/mkdir',['-p',dir]);}
assert.equal(process.getuid(),0,'Container preparation requires its own root');
mkdir('/tmp/runtime');mkdir('/tmp/engine');mkdir('/tmp/alsa');
run('/bin/tar',['-xzpf','/runtime.tgz','-C','/tmp/runtime']);
run('/bin/tar',['-xzpf','/engine.tgz','-C','/tmp/engine']);
run('/usr/bin/dpkg-deb',['-x','/old-alsa.deb','/tmp/alsa']);
const manifest=JSON.parse(fs.readFileSync('/tmp/runtime/component.json','utf8'));
assert.equal(manifest.id,'mgu-browser');
assert(/^\d+\.\d+\.\d+$/.test(manifest.version));
for(const name of ['audio-bridge','backend/jpeg_frame.node']){
    const row=manifest.files.find(file=>file.path===name);assert(row,'Required packaged native payload '+name);
    const data=fs.readFileSync('/tmp/runtime/files/'+name);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),row.sha256);
}
const engine='/var/opt/mgu-browser-engine/versions/0.1.0/engine';
mkdir('/var/opt/mgu-browser-engine/versions/0.1.0');
run('/bin/cp',['-a','/tmp/engine/files/engine',engine]);
fs.copyFileSync('/tmp/alsa/usr/lib/x86_64-linux-gnu/libasound.so.2.0.0','/usr/lib/x86_64-linux-gnu/libasound.so.2');
const sandbox=fs.statSync(engine+'/chrome-sandbox');assert.equal(sandbox.uid,0);assert.equal(sandbox.mode&0o7777,0o4755);
const uid=3911;fs.appendFileSync('/etc/passwd','mgu-test:x:'+uid+':'+uid+'::/tmp:/bin/false\n');
// Host umask can make read-only inputs 0600. Copy them inside the disposable
// container before dropping privileges; never chmod or write a host bind.
for(const name of ['fullscreen-smoke.js','media-fullscreen-smoke.js','controller-video-smoke.js','browser-identity-smoke.js','cookie-persistence-smoke.js','clip.webm']){fs.copyFileSync('/'+name,'/tmp/'+name);fs.chmodSync('/tmp/'+name,0o644);}
const env=Object.assign({},process.env,{HOME:'/tmp',MGU_FULLSCREEN_TEST_CLIP:'/tmp/clip.webm',MGU_BROWSER_BACKEND:'/tmp/runtime/files/backend',MGU_BROWSER_BINARY:engine+'/chromium',MGU_TEST_CHROMIUM:engine+'/chromium',CHROME_DEVEL_SANDBOX:engine+'/chrome-sandbox',FONTCONFIG_FILE:engine+'/fonts.conf',MGU_AUDIO_BRIDGE:'/tmp/runtime/files/audio-bridge',MGU_AUDIO_LOADER:'/lib/x86_64-linux-gnu/ld-2.27.so'});
const result=cp.spawnSync('/usr/bin/node',['/tmp/fullscreen-smoke.js'],{uid,gid:uid,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
assert.equal(result.status,0,'Unprivileged packaged fullscreen/video/audio fixture failed');
const line=(result.stdout||'').split('\n').find(text=>text.indexOf('Actual video/PCM continuity: ')===0);
assert(line,'Expected actual video/PCM evidence');
const evidence=JSON.parse(line.slice('Actual video/PCM continuity: '.length));
assert.equal(evidence.codec,'jpeg-native','Must exercise the actual packaged native JPEG addon');
for(const stage of ['inline','large-dom-inline','fullscreen','fullscreen-resize','inline-restored','route-released','closed-shadow-playing','closed-shadow-unmuted','closed-shadow-volume-restored','closed-shadow-resumed','closed-shadow-muted-paused-ended'])assert(evidence.stages.some(item=>item.stage===stage),'Missing required continuity stage '+stage);
const closed=evidence.stages.find(item=>item.stage==='closed-shadow-muted-paused-ended');
for(const flag of ['closedShadowPreserved','ownFlags','unrelatedDomAudio','navigationReleased','tabCloseReleased'])assert.equal(closed[flag],true,'Closed-player proof '+flag);
const siteEnv=Object.assign({},env,{MGU_BROWSER_BACKEND:'/tmp/runtime/files/backend/browser_session'});
const site=cp.spawnSync('/usr/bin/node',['/tmp/media-fullscreen-smoke.js'],{uid,gid:uid,env:siteEnv,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
process.stdout.write(site.stdout||'');process.stderr.write(site.stderr||'');
assert.equal(site.status,0,'Packaged site-controls/fullscreen geometry fixture failed');
const controls=cp.spawnSync('/usr/bin/node',['/tmp/controller-video-smoke.js'],{uid,gid:uid,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
process.stdout.write(controls.stdout||'');process.stderr.write(controls.stderr||'');
assert.equal(controls.status,0,'Packaged controller/video ordering fixture failed');
const controlLine=(controls.stdout||'').split('\n').find(text=>text.indexOf('CONTROLLER_VIDEO_RESULT ')===0);
assert(controlLine,'Expected actual controller/video evidence');
const controller=JSON.parse(controlLine.slice('CONTROLLER_VIDEO_RESULT '.length));
assert.equal(controller.codec,'jpeg-native');
assert.equal(controller.raw.focusRequests,16);assert.equal(controller.coalesced.focusRequests,1);
assert.equal(controller.raw.activated,'control15');assert.equal(controller.coalesced.activated,controller.raw.activated);
for(const phase of [controller.raw,controller.coalesced]){
    assert(phase.videoAfter.time!==phase.videoBefore.time&&phase.videoAfter.decoded>phase.videoBefore.decoded,'Video must advance through each controller phase');
    assert(Number.isFinite(phase.burstToActivationMs)&&phase.burstToActivationMs>=0,'Controller timing must be reported');
}
function extra(script,prefix){
    const result=cp.spawnSync('/usr/bin/node',['/tmp/'+script],{uid,gid:uid,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
    assert.equal(result.status,0,'Packaged '+script+' failed');
    const line=(result.stdout||'').split('\n').find(text=>text.indexOf(prefix)===0);assert(line,'Expected packaged '+prefix+' evidence');
    const value=JSON.parse(line.slice(prefix.length));assert.equal(value.success,true);return value;
}
const identity=extra('browser-identity-smoke.js','BROWSER_IDENTITY_RESULT ');
const cookies=extra('cookie-persistence-smoke.js','COOKIE_PERSISTENCE_RESULT ');
assert.equal(cookies.codec,'jpeg-native');
console.log('PACKAGED_FULLSCREEN_RESULT '+JSON.stringify({success:true,version:manifest.version,node:process.version,uid,sandbox:true,codec:evidence.codec,stages:evidence.stages,siteFullscreen:true,controller,identity,cookies}));
