'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function validate(ssid,password){
    if(typeof ssid!=='string'||!ssid.length||Buffer.byteLength(ssid,'utf8')>32||/[\x00-\x1f\x7f]/.test(ssid))throw new Error('WLAN-Name muss 1 bis 32 Bytes lang sein');
    if(typeof password!=='string'||/[\x00-\x1f\x7f]/.test(password)||!((Buffer.byteLength(password)>=8&&Buffer.byteLength(password)<=63)||/^[0-9a-fA-F]{64}$/.test(password)))throw new Error('WPA-Passwort muss 8 bis 63 Bytes oder ein 64-stelliger Hex-Schluessel sein');
}
function save(base,ssid,password){
    validate(ssid,password);
    const st=fs.lstatSync(base);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o022))throw new Error('WLAN-Profilordner nicht geschuetzt');
    const target=path.join(base,'wifi.profile'),temp=target+'.'+crypto.randomBytes(8).toString('hex');
    const escaped=password.replace(/\\/g,'\\\\').replace(/ /g,'\\s');
    try{fs.writeFileSync(temp,'[service_mgubrowser]\nType=wifi\nSSID='+Buffer.from(ssid).toString('hex')+'\nPassphrase='+escaped+'\nIPv4=dhcp\nIPv6=auto\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,target);}
    finally{password=null;try{fs.unlinkSync(temp);}catch(e){}}
}
function ssid(base){
    try{const file=path.join(base,'wifi.profile'),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))return '';
        const m=fs.readFileSync(file,'utf8').match(/^SSID=([a-fA-F0-9]{2,64})$/m);return m?Buffer.from(m[1],'hex').toString('utf8'):'';
    }catch(e){return '';}
}
module.exports={validate,save,ssid};
