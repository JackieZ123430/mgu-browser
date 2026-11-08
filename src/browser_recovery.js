'use strict';
// Bounded streaming counterpart to the ordinary 64 MiB encrypted archive.
// It preserves complete database/WAL sets, rather than dropping large files.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const LIMIT=192*1024*1024,MAX_FILES=12000;
const random=()=>crypto.randomBytes(8).toString('hex');
const valid=name=>name&&Buffer.byteLength(name)<2048&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&!name.split('/').some(s=>!s||s==='.'||s==='..'||s.includes(':'));
function directory(p){try{fs.mkdirSync(p,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||process.getuid&&s.uid!==process.getuid())throw new Error('Unsafe recovery directory');}
function checkFile(fd,max){const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>max||process.getuid&&s.uid!==process.getuid())throw new Error('Unsafe recovery file');return s;}
function syncDir(p){if(process.platform==='win32')return;const fd=fs.openSync(p,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function clean(profile){for(const name of fs.readdirSync(profile)){const item=path.join(profile,name),s=fs.lstatSync(item);if(s.isDirectory()&&!s.isSymbolicLink()){clean(item);fs.rmdirSync(item);}else fs.unlinkSync(item);}}
function call(method,args){return new Promise((resolve,reject)=>fs[method].apply(fs,args.concat((e,value)=>e?reject(e):resolve(value))));}
async function write(file,files,key){
    let total=0;for(const item of files){if(!valid(item.name)||!Number.isInteger(item.size)||item.size<0)throw new Error('Invalid recovery entry');total+=6+Buffer.byteLength(item.name)+item.size;}if(files.length>MAX_FILES||total>LIMIT-1024*1024)throw new Error('Recovery storage limit exceeded');
    const temp=file+'.'+random()+'.partial',iv=crypto.randomBytes(12),zip=zlib.createGzip(),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),out=fs.createWriteStream(temp,{flags:'wx',mode:0o600});cipher.setAAD(Buffer.from('mgu-browser-v1:recovery'));
    let error=null,rejectFailure;const failure=new Promise((resolve,reject)=>{rejectFailure=reject;});failure.catch(()=>{});
    const fail=e=>{if(error)return;error=e;rejectFailure(e);zip.destroy();cipher.destroy();out.destroy();};[zip,cipher,out].forEach(s=>s.on('error',fail));
    const finished=new Promise((resolve,reject)=>{out.on('finish',resolve);out.on('error',reject);});finished.catch(()=>{});
    const closed=new Promise(resolve=>out.once('close',resolve));
    const put=data=>Promise.race([new Promise((resolve,reject)=>zip.write(data,e=>e?reject(e):resolve())),failure]);
    out.write(Buffer.concat([Buffer.from('MGB1'),iv]));zip.pipe(cipher).pipe(out,{end:false});cipher.once('end',()=>{if(!error)out.end(cipher.getAuthTag());});
    try{for(const item of files){const fd=await call('open',[item.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)]);try{const s=checkFile(fd,LIMIT);if(s.size!==item.size)throw new Error('Recovery file changed');const name=Buffer.from(item.name),header=Buffer.alloc(6);header.writeUInt16BE(name.length);header.writeUInt32BE(item.size,2);await put(header);await put(name);let at=0;while(at<item.size){const data=Buffer.alloc(Math.min(65536,item.size-at)),read=await call('read',[fd,data,0,data.length,at]);if(!read)throw new Error('Recovery file truncated');at+=read;await put(data.slice(0,read));}}finally{fs.closeSync(fd);}}
        zip.end();await Promise.race([finished,failure]);await closed;const fd=fs.openSync(temp,'r+');try{checkFile(fd,LIMIT+64);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);syncDir(path.dirname(file));return total;
    }catch(e){fail(e);await closed;try{fs.unlinkSync(temp);}catch(ignore){if(ignore.code!=='ENOENT')throw ignore;}throw e;}
}
async function restore(file,profile,key,keep,isAllowed){
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let size;try{size=checkFile(fd,LIMIT+64).size;if(size<32)throw new Error('Invalid recovery archive');const header=Buffer.alloc(16),tag=Buffer.alloc(16);if(fs.readSync(fd,header,0,16,0)!==16||fs.readSync(fd,tag,0,16,size-16)!==16||header.slice(0,4).toString()!=='MGB1')throw new Error('Invalid recovery archive');
        const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.slice(4)),zip=zlib.createGunzip();decipher.setAAD(Buffer.from('mgu-browser-v1:recovery'));decipher.setAuthTag(tag);
        const input=fs.createReadStream(null,{fd,autoClose:false,start:16,end:size-17});let pending=Buffer.alloc(0),state='header',nameLength=0,remaining=0,total=0,records=0,output=null,operation=Promise.resolve(),error=null;
        const consume=async chunk=>{if(isAllowed&&!isAllowed())throw new Error('Browserstart abgebrochen');total+=chunk.length;if(total>LIMIT)throw new Error('Recovery storage limit exceeded');pending=pending.length?Buffer.concat([pending,chunk]):chunk;
            for(;;){if(state==='header'){if(pending.length<6)return;if(++records>MAX_FILES)throw new Error('Recovery file limit exceeded');nameLength=pending.readUInt16BE(0);remaining=pending.readUInt32BE(2);pending=pending.slice(6);if(!nameLength||nameLength>=2048||remaining>LIMIT)throw new Error('Invalid recovery entry');state='name';}
                if(state==='name'){if(pending.length<nameLength)return;const name=pending.slice(0,nameLength).toString('utf8');pending=pending.slice(nameLength);if(!valid(name))throw new Error('Invalid recovery path');if(keep(name)){let parent=profile;const parts=name.split('/');for(const part of parts.slice(0,-1)){parent=path.join(parent,part);directory(parent);}output=await call('open',[path.join(parent,parts[parts.length-1]),'wx',0o600]);}state='data';}
                if(state==='data'){const count=Math.min(pending.length,remaining);if(count){if(output!==null){let at=0;while(at<count){const wrote=await call('write',[output,pending,at,count-at,null]);if(!wrote)throw new Error('Recovery restore write failed');at+=wrote;}}pending=pending.slice(count);remaining-=count;}if(remaining)return;if(output!==null){fs.closeSync(output);output=null;}state='header';if(!pending.length)return;}
            }
        };
        await new Promise((resolve,reject)=>{const fail=e=>{if(error)return;error=e;input.destroy();decipher.destroy();zip.destroy();reject(e);};[input,decipher,zip].forEach(s=>s.on('error',fail));zip.on('data',chunk=>{zip.pause();operation=operation.then(()=>consume(chunk));operation.then(()=>{if(!error)zip.resume();},fail);});zip.once('end',()=>operation.then(()=>{if(state!=='header'||pending.length)throw new Error('Truncated recovery archive');resolve();},fail).catch(fail));input.pipe(decipher).pipe(zip);}).catch(async e=>{try{await operation;}catch(ignore){}if(output!==null){fs.closeSync(output);output=null;}throw e;});
    }catch(e){clean(profile);throw e;}finally{fs.closeSync(fd);}
}
module.exports={write,restore,limit:LIMIT};
