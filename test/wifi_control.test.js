'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),net=require('net');
const profile=require('../network/wifi_profile'),serve=require('../network/control');
test('WPA validation rejects invalid data and writes a private escaped profile',{skip:process.platform==='win32'},()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bmw-wifi-test-'));
    try{
        assert.throws(()=>profile.validate('x'.repeat(33),'12345678'));assert.throws(()=>profile.validate('Hotspot','bad\npassword'));assert.throws(()=>profile.validate('Hotspot','x'.repeat(64)));
        profile.save(directory,'Test-Hotspot','test space\\password');assert.equal(profile.ssid(directory),'Test-Hotspot');
        const file=path.join(directory,'wifi.profile');assert.match(fs.readFileSync(file,'utf8'),/Passphrase=test\\sspace\\\\password/);
        if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('WLAN broker authenticates the peer and exposes only fixed operations, no secret replies',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bmw-wifi-broker-test-'));
    const socket=process.platform==='win32'?'\\\\.\\pipe\\bmw-wifi-test-'+process.pid:path.join(directory,'socket');
    let accepted=false,received=null;
    const adapter={status:()=>({supported:true,ssid:'Test-Hotspot'}),connect:(ssid,password)=>{received={ssid,password};return {joining:true};},reconnect:()=>({joining:true}),scan:async()=>({networks:[{ssid:'Test-Hotspot',signal:-53,secure:true}]})};
    const server=serve({adapter,socket,uid:1000,peerUid:()=>accepted?1000:999});await new Promise(r=>server.once('listening',r));
    const request=(data,denied)=>new Promise((resolve,reject)=>{const s=net.createConnection(socket);let out='';s.on('connect',()=>s.write(data));s.on('data',b=>out+=b);s.on('error',e=>{if(denied&&['EPIPE','ECONNRESET'].includes(e.code))resolve(out);else reject(e);});s.on('close',()=>resolve(out));});
    try{
        assert.equal(await request('{"op":"status"}\n',true),'');accepted=true;
        const response=await request(JSON.stringify({op:'connect',ssid:'Test-Hotspot',password:'test-password'})+'\n');assert.deepEqual(received,{ssid:'Test-Hotspot',password:'test-password'});assert(!response.includes('test-password'));
        assert.match(await request('{"op":"exec","command":"no"}\n'),/Unbekannter/);
        assert.equal(JSON.parse(await request('{"op":"scan"}\n')).result.networks[0].ssid,'Test-Hotspot','Broker must await asynchronous scans');
        assert(!((await request('not-json secret-test-password\n')).includes('secret-test-password')));
    }finally{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
