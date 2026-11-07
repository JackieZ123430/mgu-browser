'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const SOURCE=fs.readFileSync(path.join(__dirname,'../runtime/startup_status.js'),'utf8');
function fixture(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-startup-status-')),owners=new Map(),fds=new Map();
    fs.mkdirSync(root+'/run',0o755);fs.chmodSync(root+'/run',0o755);
    const physical=name=>root+name;
    let uid=0,beat=null,closedBeat=false;
    function metadata(s,name){const own=owners.get(name)||{uid:0,gid:0};s.uid=own.uid;s.gid=own.gid;return s;}
    const io=Object.assign({},fs,{
        mkdirSync:(name,mode)=>fs.mkdirSync(physical(name),mode),
        lstatSync:name=>metadata(fs.lstatSync(physical(name)),name),
        openSync(name,flags,mode){const fd=fs.openSync(physical(name),flags,mode);fds.set(fd,name);return fd;},
        fstatSync:fd=>metadata(fs.fstatSync(fd),fds.get(fd)),
        fchownSync(fd,owner,group){owners.set(fds.get(fd),{uid:owner,gid:group});},
        unlinkSync:name=>fs.unlinkSync(physical(name)),
        renameSync:(from,to)=>fs.renameSync(physical(from),physical(to))
    });
    const module={exports:{}};
    vm.runInNewContext(SOURCE,{module,Buffer,require:n=>n==='fs'?io:require(n),process:{getuid:()=>uid,pid:424242},setInterval(fn){beat=fn;return {unref(){}};},clearInterval(){closedBeat=true;}},{filename:'runtime/startup_status.js'});
    return {root,physical,owners,module,drop(){uid=3911;},beat(){beat();},closedBeat:()=>closedBeat,
        cleanup(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('Startup status reclaims the legacy service directory and writes through its retained root descriptor',()=>{
    const f=fixture();let writer;
    try{
        const directory=f.physical('/run/mgu-browser');fs.mkdirSync(directory);fs.chmodSync(directory,0o777);
        f.owners.set('/run/mgu-browser',{uid:3911,gid:3911});
        const victim=path.join(f.root,'victim');fs.writeFileSync(victim,'unchanged');
        fs.symlinkSync(victim,directory+'/status.json.424242');fs.symlinkSync(victim,directory+'/status.json');
        writer=f.module.exports.open('0.13.3');
        assert.equal(f.owners.get('/run/mgu-browser').uid,0);assert.equal(fs.statSync(directory).mode&0o777,0o755);
        assert.equal(f.owners.get('/run/mgu-browser/status.json').uid,0);assert.equal(fs.statSync(directory+'/status.json').mode&0o777,0o644);
        f.drop();writer.write('setup_failed',{error:'/private/raw/path',arbitrary:'untrusted'});
        let record=JSON.parse(fs.readFileSync(directory+'/status.json','utf8'));
        assert.deepEqual(Object.keys(record).sort(),['at','pid','state','version']);assert.equal(record.state,'setup_failed');
        assert.equal(record.version,'0.13.3');assert.equal(fs.readFileSync(victim,'utf8'),'unchanged');
        writer.write('backend_exited',{code:125,signal:'arbitrary signal',afterSeconds:2,appUid:12397});
        record=JSON.parse(fs.readFileSync(directory+'/status.json','utf8'));assert.equal(record.code,125);assert.equal(record.afterSeconds,2);assert.equal(record.appUid,12397);assert.equal(record.signal,undefined);
        assert(fs.statSync(directory+'/status.json').size<512);
        f.beat();assert.equal(JSON.parse(fs.readFileSync(directory+'/status.json','utf8')).state,'backend_exited');
        assert.throws(()=>writer.write('untrusted-state'),/Invalid/);
        writer.close();assert(f.closedBeat());assert.throws(()=>writer.write('running'),/Invalid/);
    }finally{if(writer)writer.close();f.cleanup();}
});
test('A legacy status hardlink or directory cannot turn root status updates into writes elsewhere',()=>{
    for(const kind of ['hardlink','directory']){
        const f=fixture();let writer;
        try{
            const directory=f.physical('/run/mgu-browser');fs.mkdirSync(directory);
            const victim=path.join(f.root,'victim');fs.writeFileSync(victim,'kept');
            if(kind==='hardlink')fs.linkSync(victim,directory+'/status.json');
            else {fs.mkdirSync(directory+'/status.json');fs.writeFileSync(directory+'/status.json/keep','kept');}
            writer=f.module.exports.open('0.13.3');writer.write('running');
            assert.equal(fs.readFileSync(victim,'utf8'),'kept');
            if(kind==='directory'){
                const legacy=fs.readdirSync(directory).find(name=>name.startsWith('status.json.legacy-'));
                assert(legacy);assert.equal(fs.readFileSync(directory+'/'+legacy+'/keep','utf8'),'kept');
            }
        }finally{if(writer)writer.close();f.cleanup();}
    }
});
test('Startup status refuses unknown owners, directory links and an unsafe parent',()=>{
    for(const kind of ['owner','link','parent']){
        const f=fixture();
        try{
            const directory=f.physical('/run/mgu-browser');
            if(kind==='link'){fs.mkdirSync(f.root+'/elsewhere');fs.symlinkSync(f.root+'/elsewhere',directory);}
            else fs.mkdirSync(directory);
            if(kind==='owner')f.owners.set('/run/mgu-browser',{uid:12225,gid:12225});
            if(kind==='parent')fs.chmodSync(f.root+'/run',0o777);
            assert.throws(()=>f.module.exports.open('0.13.3'));
            assert(!fs.existsSync(directory+'/status.json'));
        }finally{f.cleanup();}
    }
});
