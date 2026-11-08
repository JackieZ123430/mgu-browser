'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib'),cp=require('child_process');
const Recovery=require('./browser_recovery');
const URLPolicy=require('./url_policy');
const URL=require('url').URL;
const LIMIT=64*1024*1024;
const later=()=>new Promise(resolve=>setImmediate(resolve));
function inflateBounded(data){return new Promise((resolve,reject)=>{
    const stream=zlib.createGunzip(),parts=[];let total=0,done=false;
    const fail=e=>{if(done)return;done=true;stream.destroy();reject(e);};
    stream.on('error',fail);stream.on('data',part=>{total+=part.length;if(total>LIMIT)fail(new Error('Session storage limit exceeded'));else parts.push(part);});
    stream.on('end',()=>{if(!done){done=true;resolve(Buffer.concat(parts,total));}});stream.end(data);
});}
function readAsync(file,max){
    const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max||(process.getuid&&s.uid!==process.getuid()))return Promise.reject(new Error('Unsafe data file'));
    return new Promise((resolve,reject)=>fs.readFile(file,(e,data)=>e?reject(e):data.length>max?reject(new Error('Storage limit exceeded')):resolve(data)));
}
function privateDirectory(directory){
    try{fs.mkdirSync(directory,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}
    const s=fs.lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||(process.getuid&&s.uid!==process.getuid()))throw new Error('Unsafe data directory');
    if(process.platform!=='win32')fs.chmodSync(directory,0o700);
}
function readFile(file,max){
    const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max||(process.getuid&&s.uid!==process.getuid()))throw new Error('Unsafe data file');
    return fs.readFileSync(file);
}
function atomic(file,data){
    const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.partial';
    let fd;try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(tmp,file);syncDirectory(path.dirname(file));}finally{if(fd!==undefined&&fd!==null)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function syncDirectory(directory){if(process.platform==='win32')return;const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
async function atomicAsync(file,data){
    const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.partial';
    let fd;try{await new Promise((resolve,reject)=>fs.writeFile(tmp,data,{mode:0o600,flag:'wx'},e=>e?reject(e):resolve()));fd=await new Promise((resolve,reject)=>fs.open(tmp,'r+', (e,value)=>e?reject(e):resolve(value)));await new Promise((resolve,reject)=>fs.fsync(fd,e=>e?reject(e):resolve()));fs.closeSync(fd);fd=null;await new Promise((resolve,reject)=>fs.rename(tmp,file,e=>e?reject(e):resolve()));syncDirectory(path.dirname(file));}finally{if(fd!==undefined&&fd!==null)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function dpapi(helper){
    return (operation,data)=>new Promise((resolve,reject)=>{
        if(!['protect','unprotect'].includes(operation)||data.length>8192)return reject(new Error('Protected storage request rejected'));
            const child=cp.execFile(helper,[],{timeout:10000,maxBuffer:32768},(e,result)=>{
                if(e||!/^\s*[A-Za-z0-9+/=]+\s*$/.test(result||''))return reject(new Error('Windows protected storage unavailable'));
                resolve(Buffer.from(result.trim(),'base64'));
            });
            child.stdin.on('error',()=>{});
            child.stdin.end(operation+'\n'+data.toString('base64')+'\n');
    });
}
const isCache=name=>/(^|\/)(Cache|Code Cache|GPUCache|DawnCache|ShaderCache|GrShaderCache)(\/|$)/.test(name);
const excluded=name=>/(^|\/)(Singleton[^/]*|Crashpad|BrowserMetrics[^/]*|History(?:-(?:journal|wal|shm))?|Visited Links|Top Sites(?:-(?:journal|wal|shm))?|Sessions|Login Data(?:-(?:journal|wal|shm))?|Safe Browsing[^/]*|mgu-audio|WidevineCdm)(\/|$)/.test(name);
function validName(name){return !!name&&name.length<2048&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':'));}
function pack(entries){
    const chunks=[];let total=0;
    for(const item of entries){const name=Buffer.from(item.name),data=item.data;total+=6+name.length+data.length;if(total>LIMIT)throw new Error('Session storage limit exceeded');const header=Buffer.alloc(6);header.writeUInt16BE(name.length);header.writeUInt32BE(data.length,2);chunks.push(header,name,data);}
    return Buffer.concat(chunks,total);
}
function unpack(data){
    const entries=[];let at=0;
    while(at<data.length){if(data.length-at<6)throw new Error('Invalid session archive');const n=data.readUInt16BE(at),size=data.readUInt32BE(at+2);at+=6;if(n>2048||at+n+size>data.length)throw new Error('Invalid session archive');const name=data.slice(at,at+n).toString('utf8');at+=n;if(!validName(name))throw new Error('Invalid session path');entries.push({name,data:data.slice(at,at+size)});at+=size;if(entries.length>12000)throw new Error('Session file limit exceeded');}
    return entries;
}
class SecureBrowserData{
    constructor(directory,protector){
        // `key` protects the password vault (master password or Windows DPAPI).
        // `siteKey` protects cookies and site storage. It is bound to this device
        // and service account so "stay signed in" and cookie consent survive a
        // restart without typing the master password on every start.
        this.directory=directory;this.protector=protector;this.key=null;this.siteKey=null;this.supported=false;this.prefs={rememberSessions:true,rememberCache:false};this.skipCapture=false;
        this.operation=Promise.resolve();this.error='';this.storage={state:'never',code:'',bytes:0,limit:LIMIT,at:0,recovered:false,archive:'auto'};
        this.ready=this.initialize().catch(()=>{this.supported=false;this.error='Geschützten Speicher und Dateirechte prüfen';});
    }
    task(fn){const work=this.operation.catch(()=>{}).then(fn);this.operation=work.catch(()=>{});return work;}
    unlock(password){return this.task(()=>this._unlock(password));}
    configure(prefs){return this.task(()=>this._configure(prefs));}
    clear(kind){return this.task(()=>this._clear(kind));}
    saveLogin(origin,username,password){return this.task(()=>this._saveLogin(origin,username,password));}
    removeLogin(id){return this.task(()=>this._removeLogin(id));}
    capture(profile){return this.task(()=>this._capture(profile));}
    captureRecovery(profile){return this.task(()=>this._capture(profile,true));}
    saveTabs(tabs,active){const snapshot=Array.isArray(tabs)?tabs.slice(0,8).map(t=>({id:t.id,url:t.url})):[];return this.task(async()=>{await this.ready;if(!this.siteKey||!this.prefs.rememberSessions)return false;const kept=snapshot.filter(t=>t.url===''||URLPolicy.allowed(t.url)),selected=Math.max(0,kept.findIndex(t=>t.id===active));const data=Buffer.from(JSON.stringify({version:1,active:selected,tabs:kept.map(t=>t.url)}));if(data.length>40960)throw new Error('Tab storage limit exceeded');await atomicAsync(path.join(this.directory,'tabs.bin'),await this.cryptAsync('tabs',data,true,this.siteKey));return true;});}
    async loadTabs(){await this.operation;await this.ready;if(!this.siteKey||!this.prefs.rememberSessions)return null;const file=path.join(this.directory,'tabs.bin');if(!fs.existsSync(file))return null;try{const data=JSON.parse((await this.cryptAsync('tabs',await readAsync(file,41024),false,this.siteKey)).toString('utf8'));if(!data||data.version!==1||!Array.isArray(data.tabs)||data.tabs.length>8||!Number.isInteger(data.active))throw new Error('Invalid saved tabs');const kept=data.tabs.map((url,index)=>({url,index})).filter(t=>t.url===''||URLPolicy.allowed(t.url));return kept.length?{tabs:kept.map(t=>t.url),active:Math.max(0,kept.findIndex(t=>t.index===data.active))}:null;}catch(e){this.error='Gespeicherte Tabs waren beschädigt und wurden verworfen';try{fs.renameSync(file,file+'.damaged');}catch(ignore){}return null;}}
    async initialize(){
        privateDirectory(this.directory);
        for(const name of fs.readdirSync(this.directory))if(/^(?:[a-z-]+\.bin|preferences\.json|storage-status\.json)\.[a-f0-9]{16}\.partial$/.test(name)){try{const p=path.join(this.directory,name),s=fs.lstatSync(p);if(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&(!process.getuid||s.uid===process.getuid()))fs.unlinkSync(p);}catch(e){}}
        try{const saved=JSON.parse(readFile(path.join(this.directory,'storage-status.json'),4096).toString('utf8'));if(saved&&['saved','failed','recovery','pending'].includes(saved.state))this.storage=Object.assign(this.storage,{state:saved.state,code:String(saved.code||'').slice(0,40),bytes:Math.max(0,Number(saved.bytes)||0),at:Math.max(0,Number(saved.at)||0),recovered:!!saved.recovered,cacheCleared:!!saved.cacheCleared,archive:['normal','recovery'].includes(saved.archive)?saved.archive:saved.state==='saved'?'normal':saved.state==='recovery'?'recovery':'auto'});if(this.storage.state==='pending'){this.storage.state='failed';this.storage.code='interrupted';}}catch(e){}
        if(!this.protector){if(fs.existsSync(path.join(this.directory,'key.dpapi')))throw new Error('Existing Windows protection requires its helper');this.siteKey=this.deviceKey();this.supported=true;this.loadPreferences();return;}
        const keyFile=path.join(this.directory,'key.dpapi');
        if(fs.existsSync(keyFile))this.key=await this.protector('unprotect',readFile(keyFile,16384));
        else {this.key=crypto.randomBytes(32);atomic(keyFile,await this.protector('protect',this.key));}
        if(this.key.length!==32)throw new Error('Invalid protected key');
        this.siteKey=this.key;this.loadPreferences();this.supported=true;
    }
    deviceKey(){
        const file=path.join(this.directory,'site-key.bin');
        if(fs.existsSync(file)){const key=readFile(file,64);if(key.length!==32)throw new Error('Invalid site data key');return key;}
        const key=crypto.randomBytes(32);
        try{fs.writeFileSync(file,key,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;return this.deviceKey();}
        return key;
    }
    loadPreferences(){
        const prefsFile=path.join(this.directory,'preferences.json');
        if(fs.existsSync(prefsFile)){try{const p=JSON.parse(readFile(prefsFile,8192));
            // Version 1 stored "off" as the factory default because enabling it
            // required the master password. Version 2 makes cookies persistent
            // by default; only an explicit choice made in version 2 turns it off.
            this.prefs={rememberSessions:p.version===2?p.rememberSessions===true:true,rememberCache:p.rememberCache===true};
        }catch(e){this.error='Speichereinstellungen beschädigt; Standardwerte aktiv';}}
    }
    async requireSiteStorage(){await this.ready;if(!this.supported||!this.siteKey)throw new Error('Geschützter Speicher ist in dieser Laufzeit nicht verfügbar');}
    async requireReady(){await this.ready;if(!this.supported)throw new Error('Geschützter Speicher ist in dieser Laufzeit nicht verfügbar');if(!this.key)throw new Error('Geschützten Speicher zuerst entsperren');}
    async _unlock(password){
        await this.ready;if(this.protector)throw new Error('Windows-Kontoschutz entsperrt diesen Speicher');
        if(!this.supported||typeof password!=='string'||password.length<12||password.length>512)throw new Error('Masterpasswort benötigt mindestens 12 Zeichen');
        const saltFile=path.join(this.directory,'passphrase-salt.bin'),keyFile=path.join(this.directory,'passphrase-key.bin'),exists=fs.existsSync(keyFile);
        const salt=exists?readFile(saltFile,32):crypto.randomBytes(16);if(salt.length!==16)throw new Error('Invalid key salt');
        const derived=await new Promise((resolve,reject)=>crypto.pbkdf2(password,salt,600000,32,'sha256',(e,key)=>e?reject(e):resolve(key)));
        password='';this.key=derived;
        try{const key=exists?this.open('master-key',readFile(keyFile,1024)):crypto.randomBytes(32);if(key.length!==32)throw new Error('Invalid master key');if(!exists){atomic(saltFile,salt);atomic(keyFile,this.seal('master-key',key));}this.key=key;}
        catch(e){this.key=null;throw new Error('Masterpasswort oder geschützter Speicher ungültig');}finally{derived.fill(0);}
        return this.status();
    }
    seal(purpose,data,key){
        if(data.length>LIMIT)throw new Error('Storage limit exceeded');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key||this.key,iv);cipher.setAAD(Buffer.from('mgu-browser-v1:'+purpose));
        return Buffer.concat([Buffer.from('MGB1'),iv,cipher.update(data),cipher.final(),cipher.getAuthTag()]);
    }
    open(purpose,data,key){
        if(data.length<32||data.length>LIMIT+64||data.slice(0,4).toString()!=='MGB1')throw new Error('Invalid protected storage');
        const d=crypto.createDecipheriv('aes-256-gcm',key||this.key,data.slice(4,16));d.setAAD(Buffer.from('mgu-browser-v1:'+purpose));d.setAuthTag(data.slice(-16));return Buffer.concat([d.update(data.slice(16,-16)),d.final()]);
    }
    read(purpose,key){const file=path.join(this.directory,purpose+'.bin');return fs.existsSync(file)?this.open(purpose,readFile(file,LIMIT+64),key):null;}
    write(purpose,data,key){atomic(path.join(this.directory,purpose+'.bin'),this.seal(purpose,data,key));}
    async status(){await this.ready;return {supported:this.supported,error:this.error||(this.storage.state==='failed'?'Website-Daten konnten nicht gespeichert werden; letzter gesicherter Stand bleibt erhalten':''),storage:Object.assign({recoveryLimit:Recovery.limit},this.storage),locked:!this.key,siteStorage:!!this.siteKey,needsSetup:!this.protector&&!fs.existsSync(path.join(this.directory,'passphrase-key.bin')),rememberSessions:this.prefs.rememberSessions,rememberCache:this.prefs.rememberCache,protection:this.protector?'Windows DPAPI + AES-256-GCM':'Masterpasswort + AES-256-GCM'};}
    storageStatus(state,code,bytes,recovered){this.storage={state,code:code||'',bytes:bytes||0,limit:LIMIT,at:Date.now(),recovered:!!recovered,cacheCleared:(state==='failed'||state==='pending')&&!!this.storage.cacheCleared,archive:state==='saved'?'normal':state==='recovery'?'recovery':this.storage.archive||'auto'};try{atomic(path.join(this.directory,'storage-status.json'),JSON.stringify(this.storage));}catch(e){if(state!=='failed'){this.storage.state='failed';this.storage.code='status-write-failed';throw e;}}return this.storage;}
    async _configure(prefs){
        await this.requireSiteStorage();const next=Object.assign({},this.prefs);for(const name of ['rememberSessions','rememberCache'])if(typeof prefs[name]==='boolean')next[name]=prefs[name];
        const entries=await this.archiveAsync().catch(()=>[]);this.prefs=next;atomic(path.join(this.directory,'preferences.json'),JSON.stringify(Object.assign({version:2},this.prefs)));
        await this.saveArchiveAsync(entries.filter(e=>this.keep(e.name)));if(!this.prefs.rememberSessions){for(const name of ['cookies','recovery','tabs']){this.removeFile(name+'.bin');this.removeFile(name+'.bin.damaged');}this.storageStatus('saved','',0,false);}else if(!this.prefs.rememberCache&&fs.existsSync(path.join(this.directory,'recovery.bin'))){this.storage.cacheCleared=true;atomic(path.join(this.directory,'storage-status.json'),JSON.stringify(this.storage));}return this.status();
    }
    removeFile(name){const file=path.join(this.directory,name);if(!fs.existsSync(file))return;const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(process.getuid&&s.uid!==process.getuid()))throw new Error('Unsafe data file');fs.unlinkSync(file);syncDirectory(this.directory);}
    // Cookie snapshots come from Chromium's Storage.getCookies. They are taken
    // while the browser runs, so a power loss or forced stop keeps the last
    // consent and login state even when the profile files cannot be captured.
    saveCookies(cookies){return this.task(async()=>{
        await this.ready;if(!this.supported||!this.siteKey||!this.prefs.rememberSessions||!Array.isArray(cookies))return false;
        const now=Date.now()/1000,list=cookies.filter(c=>c&&typeof c.name==='string'&&typeof c.domain==='string'&&(!(c.expires>0)||c.expires>now)).slice(0,4000).map(cookieRecord);
        const compressed=await new Promise((resolve,reject)=>zlib.gzip(Buffer.from(JSON.stringify({version:1,cookies:list})),(e,data)=>e?reject(e):resolve(data)));
        if(compressed.length>4*1024*1024)throw new Error('Cookie storage limit exceeded');
        await atomicAsync(path.join(this.directory,'cookies.bin'),await this.cryptAsync('cookies',compressed,true,this.siteKey));return true;
    });}
    async loadCookies(){
        await this.operation;await this.ready;if(!this.supported||!this.siteKey||!this.prefs.rememberSessions)return [];
        const file=path.join(this.directory,'cookies.bin');if(!fs.existsSync(file))return [];
        try{const plain=await inflateBounded(await this.cryptAsync('cookies',await readAsync(file,4*1024*1024+64),false,this.siteKey));const data=JSON.parse(plain.toString('utf8'));
            const now=Date.now()/1000;return Array.isArray(data.cookies)?data.cookies.filter(c=>c&&typeof c.name==='string'&&typeof c.domain==='string'&&(!(c.expires>0)||c.expires>now)).slice(0,4000).map(cookieRecord):[];}
        catch(e){this.error='Gespeicherte Cookies waren beschädigt und wurden verworfen';try{this.removeFile('cookies.bin');}catch(ignore){}return [];}
    }
    keep(name){return !excluded(name)&&(isCache(name)?this.prefs.rememberCache:this.prefs.rememberSessions);}
    archive(){const data=this.read('sessions',this.siteKey);if(!data)return [];const plain=zlib.gunzipSync(data,{maxOutputLength:LIMIT});if(plain.length>LIMIT)throw new Error('Session storage limit exceeded');return unpack(plain);}
    saveArchive(entries){this.write('sessions',zlib.gzipSync(pack(entries)),this.siteKey);}
    async archiveAsync(){
        const file=path.join(this.directory,'sessions.bin');if(!fs.existsSync(file))return [];
        const data=await readAsync(file,LIMIT+64);let compressed;
        try{compressed=await this.cryptAsync('sessions',data,false,this.siteKey);}
        catch(e){
            // Archives written before 0.13 were sealed with the master key.
            if(!this.key||this.key===this.siteKey)throw e;compressed=await this.cryptAsync('sessions',data,false,this.key);
        }
        return unpack(await inflateBounded(compressed));
    }
    async cryptAsync(purpose,data,encrypt,key){
        key=key||this.key;if(!key)throw new Error('Geschützter Speicher ist gesperrt');
        if(encrypt&&data.length>LIMIT)throw new Error('Storage limit exceeded');
        if(!encrypt&&(data.length<32||data.length>LIMIT+64||data.slice(0,4).toString()!=='MGB1'))throw new Error('Invalid protected storage');
        const iv=encrypt?crypto.randomBytes(12):data.slice(4,16),cipher=encrypt?crypto.createCipheriv('aes-256-gcm',key,iv):crypto.createDecipheriv('aes-256-gcm',key,iv);
        cipher.setAAD(Buffer.from('mgu-browser-v1:'+purpose));if(!encrypt)cipher.setAuthTag(data.slice(-16));
        const source=encrypt?data:data.slice(16,-16),parts=encrypt?[Buffer.from('MGB1'),iv]:[];
        for(let at=0;at<source.length;at+=256*1024){parts.push(cipher.update(source.slice(at,at+256*1024)));await later();}
        parts.push(cipher.final());if(encrypt)parts.push(cipher.getAuthTag());return Buffer.concat(parts);
    }
    async saveArchiveAsync(entries){
        const compressed=await new Promise((resolve,reject)=>zlib.gzip(pack(entries),(e,data)=>e?reject(e):resolve(data)));
        await atomicAsync(path.join(this.directory,'sessions.bin'),await this.cryptAsync('sessions',compressed,true,this.siteKey));
    }
    async filterArchive(kind){
        await this.requireSiteStorage();if(kind==='sites'){for(const name of ['cookies','recovery','tabs']){this.removeFile(name+'.bin');this.removeFile(name+'.bin.damaged');}this.removeFile('sessions.bin.damaged');}else if(fs.existsSync(path.join(this.directory,'recovery.bin'))){this.storage.cacheCleared=true;atomic(path.join(this.directory,'storage-status.json'),JSON.stringify(this.storage));}
        await this.saveArchiveAsync((await this.archiveAsync().catch(()=>[])).filter(e=>this.keep(e.name)&&!(kind==='cache'&&isCache(e.name))&&!(kind==='sites'&&!isCache(e.name))));if(kind==='sites')this.storageStatus('saved','',0,false);
    }
    resetSessions(){return this.task(async()=>{await this.requireSiteStorage();for(const name of ['sessions','cookies','recovery','tabs']){this.removeFile(name+'.bin');this.removeFile(name+'.bin.damaged');}this.storageStatus('saved','',0,false);return this.status();});}
    async restore(profile,isAllowed){
        await this.operation;await this.ready;if(!this.supported||!this.siteKey)return;privateDirectory(profile);
        if(!this.prefs.rememberSessions&&!this.prefs.rememberCache)return;
        const recovery=path.join(this.directory,'recovery.bin');if(fs.existsSync(recovery)&&this.storage.archive!=='normal'){try{await Recovery.restore(recovery,profile,this.siteKey,name=>this.keep(name)&&!(this.storage.cacheCleared&&isCache(name)),isAllowed);return;}catch(e){if(isAllowed&&!isAllowed())throw e;this.error='Wiederherstellung war beschädigt; letzter gesicherter Stand wurde geladen';try{fs.renameSync(recovery,recovery+'.damaged');}catch(ignore){}}}
        let entries;
        try{entries=(await this.archiveAsync()).filter(e=>this.keep(e.name));}
        catch(e){
            // A damaged archive must never keep the browser from starting.
            // Keep it aside for diagnosis; the next clean exit writes a new one.
            this.error='Gespeicherte Website-Daten waren beschädigt und wurden zurückgesetzt';
            try{const file=path.join(this.directory,'sessions.bin');fs.renameSync(file,file+'.damaged');}catch(ignore){}
            entries=[];
        }
        for(let index=0;index<entries.length;index++){
            if(index%16===0){await new Promise(resolve=>setImmediate(resolve));if(isAllowed&&!isAllowed())throw new Error('Browserstart abgebrochen');}
            const item=entries[index];
            let parent=profile;const parts=item.name.split('/');for(const part of parts.slice(0,-1)){parent=path.join(parent,part);privateDirectory(parent);}
            await new Promise((resolve,reject)=>fs.writeFile(path.join(parent,parts[parts.length-1]),item.data,{flag:'wx',mode:0o600},e=>e?reject(e):resolve()));
        }
    }
    async _capture(profile,recovered){
        await this.ready;if(this.skipCapture){this.skipCapture=false;return {skipped:true};}if(!this.supported||!this.siteKey||(!this.prefs.rememberSessions&&!this.prefs.rememberCache))return {skipped:true};
        let total=0,files=[],scanned=false;try{this.storageStatus('pending','saving',0,recovered);privateDirectory(profile);const entries=[];
        let records=0;const walk=async(directory,prefix)=>{for(const name of fs.readdirSync(directory)){
            if(++records>12000)throw new Error('Session file limit exceeded');if(records%32===0)await later();
            const relative=prefix+name;if(!validName(relative)||excluded(relative))continue;
            const file=path.join(directory,name),s=fs.lstatSync(file);if(s.isSymbolicLink()||s.nlink!==1&&!s.isDirectory())continue;
            if(s.isDirectory())await walk(file,relative+'/');else if(s.isFile()&&this.keep(relative)){
                files.push({file,name:relative,size:s.size,cache:isCache(relative)});
            }
        }};await walk(profile,'');scanned=true;files.sort((a,b)=>Number(a.cache)-Number(b.cache));const required=files.filter(item=>!item.cache).reduce((n,item)=>n+item.size+6+Buffer.byteLength(item.name),0);if(recovered||required>LIMIT-1024*1024){total=required;if(required>Recovery.limit-1024*1024)throw new Error('Recovery storage limit exceeded');const selected=files.filter(item=>!item.cache);for(const item of files.filter(x=>x.cache)){const size=item.size+6+Buffer.byteLength(item.name);if(total+size<=Recovery.limit-1024*1024){selected.push(item);total+=size;}}await Recovery.write(path.join(this.directory,'recovery.bin'),selected,this.siteKey);this.storageStatus('recovery',recovered?'engine-exit':'normal-quota',total,recovered);return {saved:true,recovery:true,bytes:total,recovered:!!recovered};}
        for(const item of files){const size=item.size+6+Buffer.byteLength(item.name);if(total+size>LIMIT-1024*1024){if(item.cache)continue;throw new Error('Session storage limit exceeded');}const data=await readAsync(item.file,LIMIT);total+=size;entries.push({name:item.name,data});}await this.saveArchiveAsync(entries);this.storageStatus('saved','',total,recovered);this.removeFile('recovery.bin');return {saved:true,bytes:total,recovered:!!recovered};}
        catch(e){if(scanned&&files.length&&total<=Recovery.limit-1024*1024&&!/file limit|Recovery storage limit/.test(e.message)){try{total=await Recovery.write(path.join(this.directory,'recovery.bin'),files.filter(item=>!item.cache),this.siteKey);this.storageStatus('recovery','snapshot-write-failed',total,recovered);return {saved:true,recovery:true,bytes:total,recovered:!!recovered};}catch(ignore){}}this.storageStatus('failed',/limit exceeded/.test(e.message)?'quota':'write-failed',total,recovered);throw e;}
    }
    async _clear(kind){if(!['cache','sites'].includes(kind))throw new Error('Unknown data category');return this.filterArchive(kind);}
    async clearProfileCache(profile){privateDirectory(profile);const remove=async(file)=>{const s=fs.lstatSync(file);if(s.isDirectory()&&!s.isSymbolicLink()){for(const name of fs.readdirSync(file))await remove(path.join(file,name));fs.rmdirSync(file);}else fs.unlinkSync(file);};const walk=async(folder,prefix)=>{for(const name of fs.readdirSync(folder)){const file=path.join(folder,name),relative=prefix+name,s=fs.lstatSync(file);if(isCache(relative)){await remove(file);}else if(s.isDirectory()&&!s.isSymbolicLink())await walk(file,relative+'/');}await later();};await walk(profile,'');}
    async entries(){await this.requireReady();const data=this.read('vault');const list=data?JSON.parse(data.toString('utf8')):[];if(!Array.isArray(list)||list.length>80)throw new Error('Invalid password store');return list;}
    async listLogins(){const metadata=require('./browser_metadata');return (await this.entries()).map(e=>({id:e.id,origin:metadata.text(e.origin,512),username:metadata.text(e.username,128)}));}
    async _saveLogin(origin,username,password){
        await this.requireReady();if(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin||!username||!password||username.length>512||password.length>4096)throw new Error('Kein vollständiges HTTPS-Anmeldeformular gefunden');
        const list=await this.entries(),old=list.find(e=>e.origin===origin&&e.username===username),entry={id:old?old.id:crypto.randomBytes(12).toString('hex'),origin,username,password};
        this.write('vault',Buffer.from(JSON.stringify([entry].concat(list.filter(e=>e.id!==entry.id)).slice(0,80))));return {saved:true};
    }
    async login(id,origin){const entry=(await this.entries()).find(e=>e.id===id&&e.origin===origin);if(!entry)throw new Error('Kein gespeicherter Zugang für diese HTTPS-Seite');return entry;}
    async _removeLogin(id){const list=await this.entries();this.write('vault',Buffer.from(JSON.stringify(list.filter(e=>e.id!==id))));return {removed:true};}
}
const COOKIE_FIELDS=['name','value','domain','path','expires','httpOnly','secure','sameSite','priority','sourceScheme','sourcePort','partitionKey'];
function cookieRecord(c){
    const out={};for(const name of COOKIE_FIELDS)if(c[name]!==undefined&&c[name]!==null)out[name]=c[name];
    if(typeof out.value!=='string')out.value='';if(out.value.length>8192)out.value=out.value.slice(0,8192);
    if(!(out.expires>0))delete out.expires;if(out.session)delete out.expires;
    return out;
}
module.exports={SecureBrowserData,dpapi,pack,unpack,validName,isCache,cookieRecord};
