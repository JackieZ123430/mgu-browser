'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib'),cp=require('child_process');
const URL=require('url').URL;
const LIMIT=64*1024*1024;
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
    fs.writeFileSync(tmp,data,{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);
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
const excluded=name=>/(^|\/)(Singleton[^/]*|Crashpad|BrowserMetrics[^/]*|History(?:-journal)?|Visited Links|Top Sites(?:-journal)?|Sessions|Login Data(?:-journal)?|Safe Browsing[^/]*)(\/|$)/.test(name);
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
        this.directory=directory;this.protector=protector;this.key=null;this.supported=false;this.prefs={rememberSessions:false,rememberCache:false};this.skipCapture=false;
        this.ready=this.initialize().catch(()=>{this.supported=false;});
    }
    async initialize(){
        privateDirectory(this.directory);
        if(!this.protector){if(fs.existsSync(path.join(this.directory,'key.dpapi')))throw new Error('Existing Windows protection requires its helper');this.supported=true;this.loadPreferences();return;}
        const keyFile=path.join(this.directory,'key.dpapi');
        if(fs.existsSync(keyFile))this.key=await this.protector('unprotect',readFile(keyFile,16384));
        else {this.key=crypto.randomBytes(32);atomic(keyFile,await this.protector('protect',this.key));}
        if(this.key.length!==32)throw new Error('Invalid protected key');
        this.loadPreferences();this.supported=true;
    }
    loadPreferences(){
        const prefsFile=path.join(this.directory,'preferences.json');
        if(fs.existsSync(prefsFile)){const p=JSON.parse(readFile(prefsFile,8192));this.prefs={rememberSessions:p.rememberSessions===true,rememberCache:p.rememberCache===true};}
    }
    async requireReady(){await this.ready;if(!this.supported)throw new Error('Geschützter Speicher ist in dieser Laufzeit nicht verfügbar');if(!this.key)throw new Error('Geschützten Speicher zuerst entsperren');}
    async unlock(password){
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
    seal(purpose,data){
        if(data.length>LIMIT)throw new Error('Storage limit exceeded');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from('mgu-browser-v1:'+purpose));
        return Buffer.concat([Buffer.from('MGB1'),iv,cipher.update(data),cipher.final(),cipher.getAuthTag()]);
    }
    open(purpose,data){
        if(data.length<32||data.length>LIMIT+64||data.slice(0,4).toString()!=='MGB1')throw new Error('Invalid protected storage');
        const d=crypto.createDecipheriv('aes-256-gcm',this.key,data.slice(4,16));d.setAAD(Buffer.from('mgu-browser-v1:'+purpose));d.setAuthTag(data.slice(-16));return Buffer.concat([d.update(data.slice(16,-16)),d.final()]);
    }
    read(purpose){const file=path.join(this.directory,purpose+'.bin');return fs.existsSync(file)?this.open(purpose,readFile(file,LIMIT+64)):null;}
    write(purpose,data){atomic(path.join(this.directory,purpose+'.bin'),this.seal(purpose,data));}
    async status(){await this.ready;return {supported:this.supported,locked:!this.key,needsSetup:!this.protector&&!fs.existsSync(path.join(this.directory,'passphrase-key.bin')),rememberSessions:this.prefs.rememberSessions,rememberCache:this.prefs.rememberCache,protection:this.protector?'Windows DPAPI + AES-256-GCM':'Masterpasswort + AES-256-GCM'};}
    async configure(prefs){await this.requireReady();for(const name of ['rememberSessions','rememberCache'])if(typeof prefs[name]==='boolean')this.prefs[name]=prefs[name];atomic(path.join(this.directory,'preferences.json'),JSON.stringify(this.prefs));await this.filterArchive();return this.status();}
    keep(name){return !excluded(name)&&(isCache(name)?this.prefs.rememberCache:this.prefs.rememberSessions);}
    archive(){const data=this.read('sessions');if(!data)return [];const plain=zlib.gunzipSync(data,{maxOutputLength:LIMIT});if(plain.length>LIMIT)throw new Error('Session storage limit exceeded');return unpack(plain);}
    saveArchive(entries){this.write('sessions',zlib.gzipSync(pack(entries)));}
    async filterArchive(kind){await this.requireReady();this.saveArchive(this.archive().filter(e=>this.keep(e.name)&&!(kind==='cache'&&isCache(e.name))&&!(kind==='sites'&&!isCache(e.name))));}
    async restore(profile){
        await this.ready;if(!this.supported)return;if(!this.key){if(this.prefs.rememberSessions||this.prefs.rememberCache)throw new Error('Geschützten Speicher zuerst entsperren');return;}privateDirectory(profile);
        for(const item of this.archive().filter(e=>this.keep(e.name))){
            let parent=profile;const parts=item.name.split('/');for(const part of parts.slice(0,-1)){parent=path.join(parent,part);privateDirectory(parent);}
            fs.writeFileSync(path.join(parent,parts[parts.length-1]),item.data,{flag:'wx',mode:0o600});
        }
    }
    async capture(profile){
        await this.ready;if(this.skipCapture){this.skipCapture=false;return;}if(!this.supported||!this.key||(!this.prefs.rememberSessions&&!this.prefs.rememberCache))return;
        privateDirectory(profile);const entries=[];let total=0;
        const walk=(directory,prefix)=>{for(const name of fs.readdirSync(directory)){
            const relative=prefix+name;if(!validName(relative)||excluded(relative))continue;
            const file=path.join(directory,name),s=fs.lstatSync(file);if(s.isSymbolicLink()||s.nlink!==1&&!s.isDirectory())continue;
            if(s.isDirectory())walk(file,relative+'/');else if(s.isFile()&&this.keep(relative)){
                if(s.size>16*1024*1024||total+s.size>LIMIT-1024*1024){if(isCache(relative))continue;throw new Error('Session storage limit exceeded');}
                const data=readFile(file,16*1024*1024);total+=data.length;entries.push({name:relative,data});
            }
        }};walk(profile,'');this.saveArchive(entries);
    }
    async clear(kind){if(!['cache','sites'].includes(kind))throw new Error('Unknown data category');return this.filterArchive(kind);}
    async entries(){await this.requireReady();const data=this.read('vault');const list=data?JSON.parse(data.toString('utf8')):[];if(!Array.isArray(list)||list.length>80)throw new Error('Invalid password store');return list;}
    async listLogins(){return (await this.entries()).map(e=>({id:e.id,origin:e.origin,username:e.username}));}
    async saveLogin(origin,username,password){
        await this.requireReady();if(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin||!username||!password||username.length>512||password.length>4096)throw new Error('Kein vollständiges HTTPS-Anmeldeformular gefunden');
        const list=await this.entries(),old=list.find(e=>e.origin===origin&&e.username===username),entry={id:old?old.id:crypto.randomBytes(12).toString('hex'),origin,username,password};
        this.write('vault',Buffer.from(JSON.stringify([entry].concat(list.filter(e=>e.id!==entry.id)).slice(0,80))));return {saved:true};
    }
    async login(id,origin){const entry=(await this.entries()).find(e=>e.id===id&&e.origin===origin);if(!entry)throw new Error('Kein gespeicherter Zugang für diese HTTPS-Seite');return entry;}
    async removeLogin(id){const list=await this.entries();this.write('vault',Buffer.from(JSON.stringify(list.filter(e=>e.id!==id))));return {removed:true};}
}
module.exports={SecureBrowserData,dpapi,pack,unpack,validName,isCache};
