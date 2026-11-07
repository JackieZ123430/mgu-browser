'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {SecureBrowserData,pack,unpack}=require('../src/secure_browser_data');
test('Portable encrypted storage preserves selected profile data and never restores history/password databases',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-storage-fixture-')),store=new SecureBrowserData(path.join(root,'protected'));
    try{
        assert.equal((await store.status()).locked,true);await store.unlock('fixture master phrase 2468');
        await store.configure({rememberSessions:true,rememberCache:true});
        const profile=path.join(root,'session-fixture');fs.mkdirSync(profile);fs.mkdirSync(profile+'/Default');fs.mkdirSync(profile+'/Default/Cache');
        fs.writeFileSync(profile+'/Default/Cookies','fixture-cookie-only');fs.writeFileSync(profile+'/Default/Cache/item','fixture-cached-response');
        fs.writeFileSync(profile+'/Default/History','fixture-history');fs.writeFileSync(profile+'/Default/Login Data','fixture-password-db');
        fs.mkdirSync(profile+'/mgu-audio');fs.writeFileSync(profile+'/mgu-audio/alsa.conf','temporary PCM routing');
        fs.mkdirSync(profile+'/WidevineCdm');fs.writeFileSync(profile+'/WidevineCdm/latest-component-updated-widevine-cdm','temporary native module selection');
        await store.capture(profile);assert(!fs.readFileSync(root+'/protected/sessions.bin').includes(Buffer.from('fixture-cookie-only')));
        assert(!store.archive().some(e=>/^(mgu-audio|WidevineCdm)\//.test(e.name)),'Session archives must exclude runtime audio and native module configuration');
        const reopened=new SecureBrowserData(root+'/protected');await assert.rejects(()=>reopened.restore(root+'/session-locked'),/entsperren/);
        await assert.rejects(()=>reopened.unlock('incorrect fixture password'),/ungültig/);await reopened.unlock('fixture master phrase 2468');
        await assert.rejects(()=>reopened.restore(root+'/session-cancelled',()=>false),/abgebrochen/);assert.equal(fs.readdirSync(root+'/session-cancelled').length,0);
        const restored=root+'/session-restored';await reopened.restore(restored);assert.equal(fs.readFileSync(restored+'/Default/Cookies','utf8'),'fixture-cookie-only');
        assert(!fs.existsSync(restored+'/Default/History'));assert(!fs.existsSync(restored+'/Default/Login Data'));
        assert(!fs.existsSync(restored+'/mgu-audio'));assert(!fs.existsSync(restored+'/WidevineCdm'));
        await reopened.clear('cache');assert(reopened.archive().every(e=>!e.name.includes('/Cache/')));
        await reopened.clear('sites');assert.equal(reopened.archive().length,0);
        await reopened.saveLogin('https://login.example.org','fixture-user','fixture-secret-123');
        const entries=await reopened.listLogins();assert(!JSON.stringify(entries).includes('fixture-secret-123'));
        assert(!fs.readFileSync(root+'/protected/vault.bin').includes(Buffer.from('fixture-secret-123')));
        await assert.rejects(()=>reopened.login(entries[0].id,'https://other.example.org'),/HTTPS/);
        assert.equal((await reopened.login(entries[0].id,'https://login.example.org')).password,'fixture-secret-123');
        await reopened.removeLogin(entries[0].id);assert.equal((await reopened.listLogins()).length,0);
    }finally{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
});
test('Encrypted session records reject tampering, purpose reuse and archive path traversal',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-storage-format-'));
    try{const store=new SecureBrowserData(root+'/protected');await store.unlock('format test master phrase');const data=store.seal('sessions',Buffer.from('fixture'));assert.throws(()=>store.open('vault',data));data[data.length-1]^=1;assert.throws(()=>store.open('sessions',data));assert.throws(()=>unpack(pack([{name:'../outside',data:Buffer.from('fixture')}])));}
    finally{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
});
