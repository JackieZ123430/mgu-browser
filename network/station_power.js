'use strict';
const fs=require('fs'),cp=require('child_process'),base='/var/opt/mgu-browser/network';
function start(){
    if(process.getuid()!==0)throw new Error('Station power service needs root');
    const radio=JSON.parse(fs.readFileSync(base+'/radio.json','utf8')).command;
    if(radio[0]!=='/var/opt/mgu-browser/engine/lib/ld-linux-x86-64.so.2'||radio[3]!==base+'/radio-tools/iw')throw new Error('Unexpected station tool');
    const profile=fs.lstatSync(base+'/wifi.profile');
    if(!profile.isFile()||profile.isSymbolicLink()||profile.uid!==0||(profile.mode&63))throw new Error('Unexpected profile permissions');
    const line=fs.readFileSync(base+'/wifi.profile','utf8').split('\n').find(l=>l.indexOf('SSID=')===0);
    if(!line||!/^SSID=[0-9a-fA-F]{2,64}$/.test(line.trim()))throw new Error('SSID unavailable');
    const expected=Buffer.from(line.slice(5).trim(),'hex').toString('utf8');
    let changed=0,lastError=false;
    const run=args=>cp.execFileSync(radio[0],radio.slice(1).concat(args),{encoding:'utf8',timeout:3000});
    const check=()=>{
        try{
            const link=run(['dev','wlan0','link']),match=link.match(/SSID: ([^\r\n]+)/);
            if(!match||match[1]!==expected)return;
            const power=run(['dev','wlan0','get','power_save']);
            if(/Power save: on/.test(power)){run(['dev','wlan0','set','power_save','off']);changed++;}
            fs.writeFileSync(base+'/station-power-state.json',JSON.stringify({interface:'wlan0',managedSSID:true,powerSave:'off',corrections:changed,updated:new Date().toISOString()}),{mode:384});
            lastError=false;
        }catch(e){if(!lastError)console.error('Browser station power check unavailable');lastError=true;}
    };
    check();return setInterval(check,15000);
}
module.exports=start;
if(require.main===module)start();
