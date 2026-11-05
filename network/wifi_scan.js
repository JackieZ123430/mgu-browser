'use strict';
const fs=require('fs'),cp=require('child_process');
function decode(value){
    const chunks=[];for(let i=0;i<value.length;){
        const escaped=value.slice(i).match(/^\\x([a-f0-9]{2})/i);
        if(escaped){chunks.push(Buffer.from([parseInt(escaped[1],16)]));i+=4;}
        else{const code=value.codePointAt(i),char=String.fromCodePoint(code);chunks.push(Buffer.from(char));i+=char.length;}
    }return Buffer.concat(chunks).toString('utf8');
}
function parse(text){
    const found=new Map();
    String(text).split(/(?:^|\n)BSS /).slice(1,129).forEach(block=>{
        const name=block.match(/^\s*SSID: (.*)$/m),signal=block.match(/^\s*signal:\s*(-?[0-9.]+)\s*dBm/m),frequency=block.match(/^\s*freq:\s*(\d+)/m);
        if(!name)return;const ssid=decode(name[1]);
        if(!ssid||Buffer.byteLength(ssid)>32||/[\x00-\x1f\x7f\ufffd]/.test(ssid))return;
        const strength=signal?Math.max(-127,Math.min(0,Math.round(Number(signal[1])))):-127;
        const secure=/^\s*(RSN|WPA):/m.test(block)||/^\s*capability:.*Privacy/m.test(block);
        const entry={ssid,signal:strength,secure,frequency:frequency?Number(frequency[1]):0};
        if(!found.has(ssid)||found.get(ssid).signal<strength)found.set(ssid,entry);
    });return Array.from(found.values()).sort((a,b)=>b.signal-a.signal).slice(0,32);
}
function scan(base){
    const command=JSON.parse(fs.readFileSync(base+'/radio.json','utf8')).command;
    if(!Array.isArray(command)||command.length!==4||command[0]!=='/var/opt/mgu-browser/engine/lib/ld-linux-x86-64.so.2'||command[3]!==base+'/radio-tools/iw')throw new Error('WLAN-Scanwerkzeug nicht verfügbar');
    return new Promise((resolve,reject)=>cp.execFile(command[0],command.slice(1).concat(['dev','wlan0','scan']),{encoding:'utf8',timeout:20000,maxBuffer:256*1024},(error,output)=>{
        if(error)return reject(new Error('WLAN-Scan fehlgeschlagen. Bitte erneut versuchen.'));
        resolve({supported:true,networks:parse(output)});
    }));
}
module.exports={parse,scan};
