'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),net=require('net');
const Adapter=require('../network/uplink_adapter');
test('Shared uplink DNS uses only validated lease addresses and preserves the bind-mounted inode',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-uplink-test-')),base=path.join(dir,'network');fs.mkdirSync(base);
    const statusFile=path.join(dir,'status.json'),leaseFile=path.join(dir,'lease.json'),resolverFile=path.join(base,'resolv.conf');
    fs.writeFileSync(statusFile,JSON.stringify({state:'online',wifi:{ssid:'Hotspot',saved:['Hotspot'],link:'online'}}));
    fs.writeFileSync(leaseFile,JSON.stringify({ip:'192.0.2.4',dns:['192.0.2.1','2001:db8::1'],updated:'one'}));fs.writeFileSync(resolverFile,'old');
    const a=new Adapter(base,{watch:false,statusFile,leaseFile,group:process.getgid(),resolverGroup:process.getgid()});
    try{const inode=fs.statSync(resolverFile).ino;a.syncLease();assert.equal(a.error,'');assert.equal(fs.statSync(resolverFile).ino,inode);assert.match(fs.readFileSync(resolverFile,'utf8'),/^nameserver 192.0.2.1\n/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'network-status.json'))).connected,true);
        fs.writeFileSync(leaseFile,JSON.stringify({ip:'192.0.2.4',dns:['192.0.2.1\nsearch evil'],updated:'two'}));a.syncLease();assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'network-status.json'))).connected,false);assert.equal(fs.readFileSync(resolverFile,'utf8').includes('search evil'),false);
        fs.writeFileSync(statusFile,JSON.stringify({state:'searching'}));assert.equal(a.status().connected,false);
    }finally{a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Shared Wi-Fi operations use fixed upstream requests without persisting credentials',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-uplink-op-')),file=path.join(dir,'status.json'),calls=[];
    fs.writeFileSync(file,JSON.stringify({state:'online',wifi:{ssid:'Hotspot',saved:['Hotspot'],link:'online',networks:[{ssid:'Hotspot',signal:-42,secure:true,current:true,psk:'must-not-return'},{ssid:'bad\nname'}]}}));
    const a=new Adapter(dir,{watch:false,statusFile:file,wait:async()=>{},request:async m=>{calls.push(m);return {ok:true};}});
    try{assert.equal((await a.connect('Hotspot','fixture-password')).joining,true);assert.deepEqual(calls.map(c=>c.op),['wifi-enable','wifi-connect']);assert.equal(fs.existsSync(path.join(dir,'wifi.profile')),false);assert.equal(JSON.stringify(a.status()).includes('fixture-password'),false);
        const scan=await a.scan();assert.equal(scan.networks.length,1);assert.equal(Object.hasOwn(scan.networks[0],'psk'),false);await a.reconnect();assert.equal(Object.hasOwn(calls[calls.length-1],'psk'),false);await assert.rejects(a.connect('Hotspot','x'.repeat(64)),/8 bis 63/);
    }finally{a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Shared uplink outputs reject symlinks instead of modifying an unrelated file',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-uplink-link-')),base=path.join(dir,'network');fs.mkdirSync(base);
    const target=path.join(dir,'unrelated'),state=path.join(dir,'state'),lease=path.join(dir,'lease');fs.writeFileSync(target,'untouched');fs.symlinkSync(target,path.join(base,'resolv.conf'));fs.writeFileSync(state,JSON.stringify({state:'online'}));fs.writeFileSync(lease,JSON.stringify({ip:'192.0.2.4',dns:['192.0.2.1']}));
    const a=new Adapter(base,{watch:false,statusFile:state,leaseFile:lease,group:process.getgid(),resolverGroup:process.getgid()});
    try{a.syncLease();assert.notEqual(a.error,'');assert.equal(fs.readFileSync(target,'utf8'),'untouched');}finally{a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Uplink transport waits for a complete bounded response and clears the password reference',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-uplink-ctl-')),socket=path.join(dir,'ctl.sock');
    const server=net.createServer(s=>s.once('data',()=>s.end('{"ok":true}\n')));await new Promise(r=>server.listen(socket,r));
    const message={op:'wifi-connect',ssid:'Hotspot',psk:'fixture-password'};
    try{assert.equal((await Adapter.request(socket,message)).ok,true);assert.equal(message.psk,null);}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
