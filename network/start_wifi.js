'use strict';
const fs=require('fs'),cp=require('child_process'),base='/var/opt/mgu-browser/network';
if(process.getuid()!==0)throw new Error('Root network service required');
const state=base+'/startup-state.json';fs.writeFileSync(state,JSON.stringify({connected:false}),{mode:384});
fs.writeFileSync('/var/opt/mgu-browser/network-status.json',JSON.stringify({connected:false,updated:new Date().toISOString()}),{mode:416});fs.chownSync('/var/opt/mgu-browser/network-status.json',0,12443);
try{
    let result;
    for(let attempt=0;attempt<9;attempt++){
        result=cp.spawnSync(base+'/wifi-join',[base+'/wifi.profile'],{encoding:'utf8',timeout:48000});
        if(result.status!==3)break;
        // The supplicant may be running before the existing managed wlan0
        // interface has been registered. This does not delay the HMI target.
        if(attempt<8)cp.spawnSync('/bin/sleep',['3'],{timeout:4000});
    }
    if(result.status!==0)throw new Error('WLAN association unavailable');
    const radio=JSON.parse(fs.readFileSync(base+'/radio.json','utf8')).command;
    if(radio[0]!=='/var/opt/mgu-browser/engine/lib/ld-linux-x86-64.so.2'||radio[3]!==base+'/radio-tools/iw')throw new Error('Unexpected station power tool');
    cp.execFileSync(radio[0],radio.slice(1).concat(['dev','wlan0','set','power_save','off']),{timeout:5000});
    const lease=cp.spawnSync('/sbin/udhcpc',['-i','wlan0','-n','-q','-t','3','-T','4','-s',base+'/lease-hook.sh'],{encoding:'utf8',timeout:18000});
    const actual=JSON.parse(fs.readFileSync(state,'utf8'));
    if(lease.status!==0||!actual.connected)throw new Error('WLAN DHCP/routing unavailable');
    // Applying the station address can reapply driver power settings. Set it
    // after DHCP too; the station-only helper maintains it for our SSID.
    require('./station_power')();
    console.log('Browser WLAN startup complete');
}catch(e){
    // A missing hotspot is an ordinary offline state, with no restart loop.
    fs.writeFileSync('/var/opt/mgu-browser/network-status.json',JSON.stringify({connected:false,error:e.message,updated:new Date().toISOString()}),{mode:416});fs.chownSync('/var/opt/mgu-browser/network-status.json',0,12443);
    console.error(e.message);
}
