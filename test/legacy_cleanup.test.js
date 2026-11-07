'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {cleanup}=require('../runtime/legacy_cleanup');
test('Old 0.9.x engine folder is removed only when the Store engine is installed, without following links',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-'));
    try{
        const legacy=path.join(root,'mgu-browser/engine'),versioned=path.join(root,'mgu-browser-engine/versions/0.1.0/engine'),current=path.join(root,'mgu-browser-engine/current');
        fs.mkdirSync(path.join(legacy,'lib'),{recursive:true});fs.writeFileSync(path.join(legacy,'chromium'),'old');fs.writeFileSync(path.join(legacy,'lib/x.so'),'old');
        const outside=path.join(root,'keep.txt');fs.writeFileSync(outside,'keep');fs.symlinkSync(outside,path.join(legacy,'link'));
        const owner=process.getuid(),pattern=new RegExp('^'+root.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'/mgu-browser-engine/versions/[0-9.]+/engine$');
        const opts={legacy,storeEngine:path.join(current,'engine'),pattern,owner};
        assert.deepEqual(cleanup(opts),{removed:false,reason:'store-engine-missing'});assert(fs.existsSync(legacy));
        fs.mkdirSync(versioned,{recursive:true});fs.writeFileSync(path.join(versioned,'chromium'),'new');fs.writeFileSync(path.join(versioned,'chrome-sandbox'),'new');
        fs.symlinkSync(path.dirname(versioned),current);
        assert.deepEqual(cleanup(opts),{removed:true});
        assert(!fs.existsSync(legacy));assert.equal(fs.readFileSync(outside,'utf8'),'keep','a link target outside is never deleted');
        assert(fs.existsSync(path.join(versioned,'chromium')));
        assert.deepEqual(cleanup(opts),{removed:false,reason:'absent'});
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
