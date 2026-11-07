'use strict';
// Isolated Docker-only test. Without ENGINE_FIXTURE, a fake engine satisfies
// pre-IPC checks. The optional immutable public engine must produce an actual
// sandboxed frame. No BMW SDK, audio device, systemd or host service is used.
const fs=require('fs'),cp=require('child_process'),assert=require('assert');
const app=Number(process.env.APP_UID||13001),audio=process.env.AUDIO_FIXTURE==='1';
const legacy=process.env.LEGACY_DIR||'',expect=process.env.EXPECT_FAILURE||'';
const expectedExit=process.env.EXPECT_LAUNCH_EXIT===undefined?null:Number(process.env.EXPECT_LAUNCH_EXIT);
function run(file,args){const p=cp.spawnSync(file,args,{stdio:'inherit'});assert.equal(p.status,0,file+' failed');}
function mkdir(p){run('/bin/mkdir',['-p',p]);}
mkdir('/tmp/runtime');run('/bin/tar',['-xzpf','/runtime.tgz','-C','/tmp/runtime']);
const manifest=JSON.parse(fs.readFileSync('/tmp/runtime/component.json','utf8'));
assert.equal(manifest.id,'mgu-browser');assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version));
const base='/var/opt/mgu-browser',version=base+'/versions/'+manifest.version;
const engine='/var/opt/mgu-browser-engine/versions/0.1.0/engine';
mkdir(version);run('/bin/cp',['-a','/tmp/runtime/files/.',version]);fs.symlinkSync('versions/'+manifest.version,base+'/current');
if(process.env.HELPER_OVERRIDE==='1'){fs.writeFileSync(version+'/backend-launch',fs.readFileSync('/fixed-helper'));fs.chmodSync(version+'/backend-launch',0o755);}
if(process.env.ENGINE_FIXTURE==='1'){
 mkdir('/tmp/engine');run('/bin/tar',['-xzpf','/engine.tgz','-C','/tmp/engine']);
 const engineManifest=JSON.parse(fs.readFileSync('/tmp/engine/component.json','utf8'));assert.equal(engineManifest.id,'mgu-browser-engine');assert.equal(engineManifest.version,'0.1.0');
 mkdir(engine);run('/bin/cp',['-a','/tmp/engine/files/engine/.',engine]);
}else{mkdir(engine);fs.writeFileSync(engine+'/chrome-sandbox','');fs.chmodSync(engine+'/chrome-sandbox',0o4755);}
fs.symlinkSync('versions/0.1.0','/var/opt/mgu-browser-engine/current');
mkdir('/var/opt/public/oap/oap_12201/security');fs.writeFileSync('/var/opt/public/oap/oap_12201/security/uids.txt',app+'=mgu_browser\n');
if(audio){fs.appendFileSync('/etc/group','\nmgu_alsa:x:301:\n');mkdir('/usr/lib/alsa-lib');fs.writeFileSync('/usr/lib/alsa-lib/libasound_module_pcm_smartx.so','fixture-presence-only');}
for(const name of ['data','network','work'])if(legacy===name||legacy==='all'){
 const dir=base+'/'+name;mkdir(dir);fs.chownSync(dir,app,app);fs.chmodSync(dir,0o700);fs.writeFileSync(dir+'/old-profile-marker','keep-private-data');fs.chownSync(dir+'/old-profile-marker',app,app);
}
if(process.env.LEGACY_NETWORK_STATUS==='1'){fs.writeFileSync(base+'/network-status.json','{"connected":false}');fs.chownSync(base+'/network-status.json',app,app);}
if(process.env.LEGACY_UID==='1')fs.appendFileSync('/etc/passwd','\nmgu_browser_backend:x:3911:3911:legacy fixture:/nonexistent:/bin/false\n');
let activationBootProof=null;
if(fs.existsSync(version+'/runtime/activate.js')){
 // Exercise actual root inode ownership and /proc boot ID, without invoking
 // systemctl or claiming the container has a firmware recmgr process.
 const activation=require(version+'/runtime/activate');
 const list='[Whitelist]\nmgu-browser-backend\nmgu-browser-wifi\n[WhitelistExitSuccess]\nmgu-browser-backend\nmgu-browser-wifi\n';
 mkdir('/var/opt/mgu-deploy');fs.writeFileSync('/etc/recmgr-restartlist.conf',list,{mode:0o644});
 const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),snapshot='/var/opt/mgu-deploy/recmgr-at-boot.json';
 fs.writeFileSync(snapshot,JSON.stringify({boot,text:list}),{mode:0o644});
 const procUid=fs.statSync('/proc').uid;
 if(procUid===0){
  assert.equal(activation.loadedThisBoot(),true);
  fs.writeFileSync(snapshot,JSON.stringify({boot,text:'[Whitelist]\nstockd\n[WhitelistExitSuccess]\nstockd\n'}));assert.equal(activation.loadedThisBoot(),false);
  fs.writeFileSync(snapshot,JSON.stringify({boot,text:list}));assert.equal(activation.loadedThisBoot(),true);activationBootProof=true;
 }else{
  // Rootless Docker maps host-owned proc inodes to nobody. Keep the real
  // ownership check intact; this extra rootful-only proof cannot run there.
  assert.equal(activation.loadedThisBoot(),false);activationBootProof={skipped:'proc-owner-outside-container-root',procUid};
 }
}
const statusVictim='/tmp/status-victim';let statusSymlinkProof=null;
if(fs.existsSync(version+'/runtime/startup_status.js')){
 mkdir('/run/mgu-browser');fs.chownSync('/run/mgu-browser',3911,0);fs.chmodSync('/run/mgu-browser',0o755);
 fs.writeFileSync(statusVictim,'root fixture remains unchanged',{mode:0o644});fs.symlinkSync(statusVictim,'/run/mgu-browser/status.json');
 fs.symlinkSync(statusVictim,'/run/mgu-browser/status.tmp');
}
const client='/tmp/client.js';
function ipcClient(){
 const net=require('net'),assert=require('assert'),Channel=require('/var/opt/mgu-browser/current/backend/ipc_protocol');
 const reject=process.argv[2]==='reject',render=process.argv[2]==='engine';
 const socket=net.createConnection('/var/opt/mgu-browser/data/backend.sock'),channel=new Channel(socket);
 let connected=false,started=false,frame=null,version='',heartbeat=null,stopRequested=false,transientFrames=0;
 const timer=setTimeout(()=>{console.error('IPC ready/frame timed out');process.exit(3);},render?35000:3000);
 const state=()=>channel.json({op:'state',allowed:true,generation:2});
 function done(){clearInterval(heartbeat);clearTimeout(timer);socket.destroy();process.exit(0);}
 function stop(){if(started&&frame&&!stopRequested){stopRequested=true;channel.json({id:3,op:'stop'});}}
 channel.on('frame',body=>{
  try{assert(render);assert(body.length>=12);assert.equal(body.readUInt32LE(0),2);const width=body.readUInt32LE(4),height=body.readUInt32LE(8);assert(width>0&&width<=1280&&height>0&&height<=720);assert.equal(body.length,12+width*height*4);assert(body.slice(12).some(b=>b!==0));if(width!==1280||height!==384){transientFrames++;return;}frame={width,height,rgbaBytes:body.length-12};stop();}catch(e){console.error(e.stack);process.exit(7);}
 });
 socket.on('connect',()=>{connected=true;});
 channel.on('json',m=>{
  if(reject)process.exit(5);
  if(m.error||m.event==='fault'){console.error(JSON.stringify(m));process.exit(6);}
  if(m.event==='version')version=m.value;
  if(m.event==='ready')channel.json({id:1,op:'audioStatus'});
  if(m.id===1){
   if(!render){console.log(JSON.stringify(m));return done();}
   state();heartbeat=setInterval(state,300);channel.json({id:2,op:'start',url:''});
  }
  if(m.id===2){started=true;stop();}
  if(m.id===3){console.log('IPC_CLIENT_RESULT '+JSON.stringify({version,frame,transientFrames}));done();}
 });
 socket.on('close',()=>{if(reject&&connected)done();});
 socket.on('error',e=>{console.error(e.message);process.exit(4);});
}
fs.writeFileSync(client,'('+ipcClient.toString()+')();',{mode:0o644});
process.umask(0o077); // Match the actual service unit.
const child=cp.spawn('/usr/bin/node',[base+'/current/runtime/launch.js'],{stdio:['ignore','pipe','pipe']});
let output='',ended=false,finished=false,exitCode=null;
for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;process.stdout.write(b);});
child.on('exit',(code,signal)=>{ended=true;exitCode=code;console.log('LAUNCH_EXIT '+code+' '+signal);});
function finish(result){if(finished)return;finished=true;clearInterval(timer);console.log('RUNTIME_SERVICE_RESULT '+JSON.stringify(Object.assign({version:manifest.version,node:process.version,appUid:app,audio,legacy,legacyNetworkStatus:process.env.LEGACY_NETWORK_STATUS==='1',legacyUid:process.env.LEGACY_UID==='1'},result)));if(!ended)child.kill('SIGTERM');setTimeout(()=>process.exit(result.success?0:1),600);}
const began=Date.now();
const timer=setInterval(()=>{
 try{
  const socket=base+'/data/backend.sock',stateFile=base+'/data/service-state.json';
  if(fs.existsSync(socket)&&fs.existsSync(stateFile)){
   assert.equal(expect,'','Unexpected startup success');assert.equal(expectedExit,null,'Unexpected startup success');
   const stat=fs.statSync(socket),state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
   assert(stat.isSocket());assert.equal(stat.uid,3911);assert.equal(stat.gid,app);assert.equal(stat.mode&0o777,0o660);
   const identity=fs.readFileSync('/proc/'+state.pid+'/status','utf8');
   assert(/^Uid:\s+3911\s+3911\s+3911\s+3911$/m.test(identity));
   const expectedGid=audio?301:3911;assert(new RegExp('^Gid:\\s+'+expectedGid+'\\s+'+expectedGid+'\\s+'+expectedGid+'\\s+'+expectedGid+'$','m').test(identity));
   const groups=/^Groups:\s+(.+)$/m.exec(identity)[1].trim().split(/\s+/).map(Number);assert(groups.indexOf(app)>=0);if(audio)assert(groups.indexOf(301)>=0);
   const mounts=fs.readFileSync('/proc/'+state.pid+'/mountinfo','utf8');const work=mounts.split('\n').find(l=>l.split(' ')[4]===base+'/work');assert(work);assert(/noexec/.test(work)&&/nosuid/.test(work)&&/nodev/.test(work)&&/ - tmpfs /.test(work));assert(/(?:^|,)size=393216k(?:,|$)/.test(work.split(' - ')[1].split(' ')[2]),'Expected actual 384 MiB work mount: '+work);
   // Deliberately retain the registered group so filesystem permissions permit
   // connect; the native SO_PEERCRED check must reject the wrong process UID.
   const wrong=cp.spawnSync('/usr/bin/node',[client,'reject'],{uid:app+1,gid:app,encoding:'utf8'});assert.equal(wrong.status,0,'Wrong peer must connect then close without any IPC response: '+wrong.stderr);
   const peer=cp.spawnSync('/usr/bin/node',[client,process.env.ENGINE_FIXTURE==='1'?'engine':'accept'],{uid:app,gid:app,encoding:'utf8',timeout:40000});process.stdout.write(peer.stdout||'');assert.equal(peer.status,0,'Registered peer ready/audioStatus/frame: '+peer.stderr);
   let launcherReady=null;if(fs.readFileSync(version+'/runtime/launch.js','utf8').indexOf('MGU_BROWSER_BACKEND_READY')>=0){const record=JSON.parse(fs.readFileSync('/run/mgu-browser/status.json','utf8'));assert.equal(record.state,'running');assert.equal(record.appUid,app);launcherReady=true;}
   if(fs.existsSync(version+'/runtime/startup_status.js')){
    assert.equal(fs.readFileSync(statusVictim,'utf8'),'root fixture remains unchanged');const dir=fs.lstatSync('/run/mgu-browser'),file=fs.lstatSync('/run/mgu-browser/status.json');
    assert(dir.isDirectory());assert.equal(dir.uid,0);assert.equal(dir.gid,0);assert.equal(dir.mode&0o777,0o755);assert(file.isFile());assert(!file.isSymbolicLink());assert.equal(file.nlink,1);assert.equal(file.uid,0);assert.equal(file.gid,0);assert.equal(file.mode&0o777,0o644);statusSymlinkProof=true;
   }
   let installedCheck=null;if(fs.existsSync(version+'/runtime/check.js')){const check=cp.spawnSync('/bin/sh',[version+'/check.sh'],{encoding:'utf8',timeout:20000});assert.equal(check.status,0,'Actual packaged check.sh: '+check.stdout+' '+check.stderr);assert(check.stdout.indexOf('Current Browser backend reported authenticated IPC readiness')>=0);installedCheck=true;}
   let rendered=null;if(process.env.ENGINE_FIXTURE==='1'){const line=peer.stdout.split('\n').find(l=>l.indexOf('IPC_CLIENT_RESULT ')===0);assert(line,'Actual IPC engine frame result required');rendered=JSON.parse(line.slice('IPC_CLIENT_RESULT '.length));assert(rendered.version.indexOf('Chrome/')>=0);assert.equal(rendered.frame.rgbaBytes,1280*384*4);}
   const moved=fs.readdirSync(base).filter(n=>/\.legacy-/.test(n));
   for(const name of ['data','network','work'])if(legacy===name||legacy==='all'){const old=moved.filter(n=>n.indexOf(name+'.legacy-')===0);assert.equal(old.length,1);assert.equal(fs.readFileSync(base+'/'+old[0]+'/old-profile-marker','utf8'),'keep-private-data');}
   return finish({success:true,ready:true,peerUidRejected:true,socket:{uid:stat.uid,gid:stat.gid,mode:(stat.mode&0o777).toString(8)},backendGid:expectedGid,groups,workMiB:384,moved,rendered,activationBootProof,launcherReady,statusSymlinkProof,installedCheck});
  }
  if(expect&&output.indexOf(expect)>=0)return finish({success:true,ready:false,expectedFailure:expect});
  if(ended&&expectedExit!==null){assert.equal(exitCode,expectedExit);return finish({success:true,ready:false,expectedLaunchExit:exitCode});}
  if(ended||Date.now()-began>7000){let diagnostic=null;try{diagnostic=JSON.parse(fs.readFileSync('/run/mgu-browser/status.json','utf8'));}catch(e){}finish({success:false,ready:false,reason:ended?'launcher-exited':'socket-timeout',diagnostic,output:output.slice(-3000)});}
 }catch(e){finish({success:false,ready:false,error:e.stack});}
},50);
