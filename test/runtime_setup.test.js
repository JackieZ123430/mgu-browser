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
