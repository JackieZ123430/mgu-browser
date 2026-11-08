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
for(const name of ['fullscreen-smoke.js','media-fullscreen-smoke.js','controller-video-smoke.js','browser-identity-smoke.js','cookie-persistence-smoke.js','dialogs-smoke.js','native-input-smoke.js','focused-input-smoke.js','native-pdf-smoke.js','remote-input-page-smoke.js','desktop-navigation-smoke.js','permissions-smoke.js','files-smoke.js','site-recovery-smoke.js','tab-restore-smoke.js','streamed-recovery-smoke.js','find-smoke.js','frame-media-smoke.js','auth-smoke.js','viewport-smoke.js','detached-tabs-smoke.js','large-upload-smoke.js','auth-upload-smoke.js','viewport-bootstrap-smoke.js','fixture-tls-key.pem','fixture-tls-cert.pem','clip.webm']){fs.copyFileSync('/'+name,'/tmp/'+name);fs.chmodSync('/tmp/'+name,0o644);}
const env=Object.assign({},process.env,{HOME:'/tmp',MGU_FULLSCREEN_TEST_CLIP:'/tmp/clip.webm',MGU_BROWSER_BACKEND:'/tmp/runtime/files/backend',MGU_BROWSER_BINARY:engine+'/chromium',MGU_TEST_CHROMIUM:engine+'/chromium',CHROME_DEVEL_SANDBOX:engine+'/chrome-sandbox',FONTCONFIG_FILE:engine+'/fonts.conf',MGU_AUDIO_BRIDGE:'/tmp/runtime/files/audio-bridge',MGU_AUDIO_LOADER:'/lib/x86_64-linux-gnu/ld-2.27.so',MGU_PERMISSION_ISOLATED:'1',MGU_TEST_TLS_KEY:'/tmp/fixture-tls-key.pem',MGU_TEST_TLS_CERT:'/tmp/fixture-tls-cert.pem'});
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
let scriptCount=3;
function extra(script,prefix,overrides){
    const result=cp.spawnSync('/usr/bin/node',['/tmp/'+script],{uid,gid:uid,env:Object.assign({},env,overrides||{}),encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
    assert.equal(result.status,0,'Packaged '+script+' failed');
    const line=(result.stdout||'').split('\n').find(text=>text.indexOf(prefix)===0);assert(line,'Expected packaged '+prefix+' evidence');
    const value=JSON.parse(line.slice(prefix.length));assert.equal(value.success,true);scriptCount++;return value;
}
const identity=extra('browser-identity-smoke.js','BROWSER_IDENTITY_RESULT ');
const cookies=extra('cookie-persistence-smoke.js','COOKIE_PERSISTENCE_RESULT ');
assert.equal(cookies.codec,'jpeg-native');
const viewportBootstrap=extra('viewport-bootstrap-smoke.js','BROWSER_VIEWPORT_BOOTSTRAP_RESULT ');
for(const flag of ['noInteractionFirstFrame','firstTrustedClick','oopif','reload','crossSite','zoomPreserved','pageGettersIgnored'])assert.equal(viewportBootstrap[flag],true,'Required cold viewport proof '+flag);
assert.deepEqual(viewportBootstrap.stages,['cold-normal','cold-oopif','identical-reload','cross-site-main','zoomed-oopif']);
const dialogs=extra('dialogs-smoke.js','BROWSER_DIALOGS_RESULT ');
assert.equal(dialogs.beforeunloadStayLeave,true);assert.equal(dialogs.closeBeforeunloadStayLeave,true);
const input=extra('native-input-smoke.js','NATIVE_INPUT_RESULT ');
assert.equal(input.codec,'jpeg-native');assert(input.passed.length>=10);
const focusedInput=extra('focused-input-smoke.js','FOCUSED_INPUT_RESULT ');
assert.equal(focusedInput.codec,'jpeg-native');assert(focusedInput.passed.length>=4);
const pdfInput=extra('native-pdf-smoke.js','NATIVE_PDF_INPUT_RESULT ');
assert.equal(pdfInput.codec,'jpeg-native');assert.equal(pdfInput.detents,3);assert.equal(pdfInput.tabKeyEvents,6);assert(pdfInput.changedFocusPixels>0);
const phoneInput=extra('remote-input-page-smoke.js','REMOTE_INPUT_PAGE_RESULT ');
assert.equal(phoneInput.codec,'jpeg-native');assert.equal(phoneInput.viewport.width,414);assert.equal(phoneInput.scriptErrors,0);assert(phoneInput.conditionalFrames>0);
const navigation=extra('desktop-navigation-smoke.js','DESKTOP_NAVIGATION_RESULT ');
assert.equal(navigation.strictTLS,true);assert.equal(navigation.backgroundTimers,true);assert.equal(navigation.popupMessage,true);
assert.equal(navigation.initialErrorTab,true);assert.equal(navigation.errorTabRetry,true);
const permissions=extra('permissions-smoke.js','BROWSER_PERMISSIONS_RESULT ');
assert.equal(permissions.codec,'jpeg-native');
for(const flag of ['staleOriginRejected','iframeOriginVerified','oopifOriginVerified','nestedOriginVerified','oopifCleanup','sandbox','tlsVerification'])assert.equal(permissions[flag],true,'Required native permission proof '+flag);
assert.equal(permissions.native.oopifNoDevice,'NotFoundError');assert.equal(permissions.native.isolatedClipboardRead,true);
const files=extra('files-smoke.js','BROWSER_FILES_RESULT ');
for(const flag of ['explicitSelection','staleChooserRejected','persistentDownload','oopifUpload','oopifDownload','oopifNavigationExpires','popupAttachment','popupRetired','openerAlive'])assert.equal(files[flag],true,'Required file proof '+flag);
const siteRecovery=extra('site-recovery-smoke.js','SITE_RECOVERY_RESULT ');
for(const flag of ['engineHardKill','localStorage','indexedDB','cacheStorage','serviceWorkerRegistration','cleanRestart'])assert.equal(siteRecovery[flag],true,'Required site-recovery proof '+flag);
const tabs=extra('tab-restore-smoke.js','TAB_RESTORE_RESULT ');
for(const flag of ['twoURLs','activeTab','explicitOverride','repeatedStop','disabledClears','interruptedRestore','getURLsOnly'])assert.equal(tabs[flag],true,'Required tab-restore proof '+flag);
const streamedRecovery=extra('streamed-recovery-smoke.js','STREAMED_RECOVERY_RESULT ');
assert.equal(streamedRecovery.authenticated,true);assert.equal(streamedRecovery.streamed,true);assert.equal(streamedRecovery.node,'8.16.2');
const find=extra('find-smoke.js','BROWSER_FIND_RESULT ');
for(const flag of ['normal','openShadow','closedShadow','sameOriginFrame','oopif','nextPrevious','caseSensitive','selectionPreserved','scopedFrameLifecycle','topNavigationRetires'])assert.equal(find[flag],true,'Required page-find proof '+flag);
const frameMedia=extra('frame-media-smoke.js','BROWSER_FRAME_MEDIA_RESULT ');
assert.equal(frameMedia.codec,'jpeg-native');assert(frameMedia.stages.length>=7);for(const stage of ['cross-origin-closed-shadow','cross-origin-closed-resumed'])assert(frameMedia.stages.some(x=>x.stage===stage&&x.pcmBytes>0),'Required closed child-media stage '+stage);
for(const flag of ['crossOrigin','persistentVerifiedSession','ownMutePauseFlags','childFullscreenControls','navigationRetired','tabSwitchAudio'])assert.equal(frameMedia[flag],true,'Required child-media proof '+flag);
const auth=extra('auth-smoke.js','BROWSER_AUTH_RESULT ',{MGU_AUTH_SLOW_REPLY:'1'});
for(const flag of ['basic','digest','wrongCredentialsPromptAgain','cancel','realmChange','staleNavigationRejected','tabChangeRejected','oopif','oopifNavigationRejected','stoppedReplyRejected','mediaRestrictionPreserved','slowReply','sandbox','tlsVerification'])assert.equal(auth[flag],true,'Required HTTP-auth proof '+flag);
assert(auth.pausedRequests>60);assert(auth.benchmark&&Number.isFinite(auth.benchmark.nativeMedianMs)&&Number.isFinite(auth.benchmark.brokerMedianMs));
const viewport=extra('viewport-smoke.js','BROWSER_VIEWPORT_RESULT ');
for(const flag of ['oopifHit','nestedWheel','fullscreenResize','tabZoomPreserved','shortcutsPreserveViewport'])assert.equal(viewport[flag],true,'Required native zoom proof '+flag);
assert.deepEqual(viewport.frames.map(x=>x.zoom),[100,125,150,125,100]);assert(viewport.nativePaintDifference<3);assert.equal(viewport.rates.length,2);
const detachedTabs=extra('detached-tabs-smoke.js','BROWSER_DETACHED_TABS_RESULT ');
for(const flag of ['liveTargetPreserved','unsavedFormPreserved','noReload','oldInputCancelled','blankPopupPreserved','beforeunloadRetained','openerAlive'])assert.equal(detachedTabs[flag],true,'Required reattachment proof '+flag);
const largeUpload=extra('large-upload-smoke.js','CDP_LARGE_UPLOAD_RESULT ');
assert.equal(largeUpload.codec,'jpeg-native');assert.equal(largeUpload.bodyFieldsAbsent,true);assert.equal(largeUpload.maxPacketBytes,12582912);assert(largeUpload.maxHeartbeatGapMs<1500);
assert.equal(largeUpload.raw.bytes,15*1024*1024);assert.equal(largeUpload.multipart.bytes,16*1024*1024);for(const record of [largeUpload.raw,largeUpload.multipart]){assert(/^[a-f0-9]{64}$/.test(record.sha256));assert(record.frames>0);}
const authUpload=extra('auth-upload-smoke.js','BROWSER_AUTH_UPLOAD_RESULT ');
assert.equal(authUpload.codec,'jpeg-native');assert.equal(authUpload.postBytes,15*1024*1024);assert.equal(authUpload.requests,2);assert.equal(authUpload.authPrompts,1);assert.equal(authUpload.allBodyHashesMatch,true);assert(authUpload.framesDuring>0);assert(authUpload.maxHeartbeatGapMs<1500);
console.log('PACKAGED_FULLSCREEN_RESULT '+JSON.stringify({success:true,version:manifest.version,node:process.version,uid,sandbox:true,codec:evidence.codec,scriptCount,stages:evidence.stages,siteFullscreen:true,controller,identity,cookies,viewportBootstrap,dialogs,input,focusedInput,pdfInput,phoneInput,navigation,permissions,files,siteRecovery,tabs,streamedRecovery,find,frameMedia,auth,viewport,detachedTabs,largeUpload,authUpload}));
