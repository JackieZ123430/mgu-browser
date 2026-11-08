'use strict';
// Cookie persistence that does not depend on a clean Chromium exit.
// Chromium writes its cookie database lazily; ignition off, a forced stop or a
// renderer crash used to lose cookie consent and logins. The backend therefore
// keeps an encrypted snapshot from Storage.getCookies and restores it with
// Storage.setCookies before the first page loads.
const crypto=require('crypto');
const {cookieRecord}=require('./secure_browser_data');
const CHECKPOINT_MS=10000;
const BATCH=50;
function digest(cookies){
    const stable=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{}):value;
    // Flags and partition scope are part of stored cookie state too. A site
    // may change them without changing the token's name, value or expiry.
    const records=cookies.map(cookie=>JSON.stringify(stable(cookieRecord(cookie)))).sort();
    const h=crypto.createHash('sha256');
    for(const record of records)h.update(record+'\n');
    return h.digest('hex');
}
module.exports={
    cookiePersistence(){const store=this.options.profileStore;return !!(store&&store.prefs&&store.prefs.rememberSessions&&typeof store.saveCookies==='function');},
    async restoreCookies(pipe){
        if(!this.cookiePersistence())return 0;
        const cookies=await this.options.profileStore.loadCookies();if(!cookies.length)return 0;
        let restored=0;
        for(let at=0;at<cookies.length;at+=BATCH){
            const batch=cookies.slice(at,at+BATCH);
            try{await pipe.send('Storage.setCookies',{cookies:batch},null,5000);restored+=batch.length;}
            catch(e){
                // One malformed or now-rejected cookie must not drop the others.
                for(const cookie of batch){try{await pipe.send('Storage.setCookies',{cookies:[cookie]},null,2000);restored++;}catch(ignore){}}
            }
        }
        this.cookieDigest=digest(cookies);
        return restored;
    },
    async snapshotCookies(pipe,timeoutMs){
        pipe=pipe||this.pipe;if(!pipe||pipe.closed||!this.cookiePersistence())return false;
        const store=this.options.profileStore;if(store.skipCapture)return false;
        const result=await pipe.send('Storage.getCookies',{},null,timeoutMs||3000);
        const cookies=Array.isArray(result.cookies)?result.cookies:[];
        const next=digest(cookies);if(next===this.cookieDigest)return false;
        if(store.skipCapture)return false;
        await store.saveCookies(cookies);this.cookieDigest=next;return true;
    },
    scheduleCookieCheckpoint(delay){
        if(!this.child||!this.cookiePersistence())return;
        clearTimeout(this.cookieTimer);const epoch=this.epoch;
        this.cookieTimer=setTimeout(()=>{
            this.cookieTimer=null;if(epoch!==this.epoch||!this.child)return;
            this.snapshotCookies().catch(()=>this.emit('diagnostic','Cookie checkpoint failed')).then(()=>{if(epoch===this.epoch)this.scheduleCookieCheckpoint(CHECKPOINT_MS);});
        },delay===undefined?CHECKPOINT_MS:delay);
    }
};
module.exports.digest=digest;
