'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const setup=require('../runtime/setup');
test('Runtime discovers the app UID instead of assuming the development head unit UID',()=>{
 assert.equal(setup.appUid('12225=robertn_store\n12397=mgu_browser\n'),12397);
 assert.equal(setup.appUid('12225=robertn_store\n'),null);
 assert.throws(()=>setup.appUid('12443=mgu_browser\n12397=mgu_browser\n'),/duplicate/);
 assert.throws(()=>setup.appUid('0=mgu_browser\n'),/identity/);
 assert.equal(setup.appUid('12443=mgu_browser2\n'),null);
});
test('UID-map reads accept only the explicitly trusted manager group and reject links',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-identity-')),file=path.join(dir,'uids.txt');
 try{fs.writeFileSync(file,'12397=mgu_browser\n',{mode:0o660});fs.chmodSync(file,0o660);
  assert.throws(()=>setup.readOwned(file,[process.getuid()],100),/Unsafe/);
  assert.equal(setup.appUid(setup.readOwned(file,[process.getuid()],100,process.getgid())),12397);
  fs.chmodSync(file,0o662);assert.throws(()=>setup.readOwned(file,[process.getuid()],100,process.getgid()),/Unsafe/);
  fs.chmodSync(file,0o640);fs.symlinkSync(file,path.join(dir,'link'));assert.throws(()=>setup.readOwned(path.join(dir,'link'),[process.getuid()],100));
  assert.throws(()=>setup.readOwned(file,[process.getuid()],2),/Unsafe/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Folders of an older installation with other owners are moved aside, never deleted',()=>{
    const fs=require('fs'),os=require('os'),path=require('path'),{setAside}=require('../runtime/setup');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'aside-'));
    try{
        const good=path.join(root,'good');fs.mkdirSync(good,0o755);fs.chmodSync(good,0o755);
        assert.equal(setAside(good,[process.getuid()]),null,'a correct folder stays');
        const foreign=path.join(root,'data');fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'keep'),'x');
        const moved=setAside(foreign,[process.getuid()+1]);
        assert.match(moved,/data\.legacy-\d+$/);assert(!fs.existsSync(foreign));assert.equal(fs.readFileSync(path.join(moved,'keep'),'utf8'),'x');
        const link=path.join(root,'work');fs.symlinkSync(good,link);
        assert.equal(setAside(link,[process.getuid()]),'link-removed');assert(fs.existsSync(good));
        assert.equal(setAside(path.join(root,'absent'),[0]),null);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
