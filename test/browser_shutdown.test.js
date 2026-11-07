'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const fresh=()=>{delete require.cache[require.resolve('../src/browser_shutdown')];return require('../src/browser_shutdown');};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('Shutdown retains original grace and exits exactly once across repeated notifications',async()=>{
    const shutdown=fresh(),start=Date.now();let exits=0,cleaned=false;
    shutdown.register(async()=>{await delay(30);cleaned=true;});
    const first=shutdown.run(()=>exits++),second=shutdown.run(()=>exits++);
    assert.equal(first,second);await first;assert(cleaned);assert(Date.now()-start>=180);assert.equal(exits,1);
    await shutdown.run(()=>exits++);assert.equal(exits,1);assert.throws(()=>shutdown.register(()=>{}),/already requested/);
});
test('Shutdown awaits cleanup beyond the initial grace and isolates rejected cleanup tasks',async()=>{
    const shutdown=fresh();let cleaned=false,exited=false;
    shutdown.register(()=>{throw Error('fixture cleanup failure');});
    shutdown.register(async()=>{await delay(300);cleaned=true;});
    const done=shutdown.run(()=>{assert(cleaned);exited=true;});await delay(220);assert.equal(exited,false);await done;assert(exited);
});
test('An unresponsive cleanup reaches the bounded shutdown deadline',{timeout:3000},async()=>{
    const shutdown=fresh(),start=Date.now();let exits=0;
    shutdown.register(()=>new Promise(()=>{}));await shutdown.run(()=>exits++);
    assert(Date.now()-start>=1400);assert.equal(exits,1);
});
test('Public MIT kit patch accepts exactly the known shutdown handler and is idempotent',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-shutdown-kit-'));
    try{
        cp.execFileSync('python3',['-c',[
            'import sys',
            'from pathlib import Path',
            'sys.path.insert(0, sys.argv[1])',
            'from kit_shutdown import patch_shutdown, ORIGINAL, PATCHED',
            'root=Path(sys.argv[2]); (root/"runtime").mkdir()',
            'file=root/"runtime/mgu.js"; file.write_text(ORIGINAL)',
            'patch_shutdown(root); assert file.read_text()==PATCHED',
            'patch_shutdown(root); assert file.read_text()==PATCHED',
            'file.write_text(ORIGINAL+"\\n"+ORIGINAL)',
            'try: patch_shutdown(root)',
            'except RuntimeError: pass',
            'else: raise AssertionError("ambiguous handler accepted")',
            'file.write_text("unknown lifecycle")',
            'try: patch_shutdown(root)',
            'except RuntimeError: pass',
            'else: raise AssertionError("unknown handler accepted")'
        ].join('\n'),path.resolve(__dirname,'../tools'),root]);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
