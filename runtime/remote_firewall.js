'use strict';
// Root-only: allow the phone remote control (TCP 39123) of the browser
// backend (UID 3911) from private/link-local addresses on the WLAN interfaces.
// Only rules tagged "mgu-browser-remote" are touched; they are replaced in one
// atomic nft batch on every service start. Missing chains are skipped, and a
// failure never blocks browsing (the remote then just cannot be reached).
const cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const TAG='mgu-browser-remote',PORT=39123,UID=3911;
const CHAINS=[['ip','filter','highprioinput'],['ip','filter','highpriooutput'],['inet','mgu_uplink','input'],['inet','mgu_uplink','output']];
const PRIVATE4=['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16'];
// wlan_bridge: the BMW access point. wlan0/wlan1: the two Wi-Fi station
// backends of mgu-uplink (the phone's hotspot). mgu-uplink rebuilds its table
// on every reconnect, so `watch` re-applies these rules when they go missing.
const INTERFACES=['wlan_bridge','wlan0','wlan1'];
function uplinkInterface(io){
    try{const lease=JSON.parse((io||fs).readFileSync('/run/mgu-uplink/lease.json','utf8'));
        return typeof lease.interface==='string'&&/^wlan[0-9]$/.test(lease.interface)?lease.interface:null;}
    catch(e){return null;}
}
function interfaces(io){const list=INTERFACES.slice(),uplink=uplinkInterface(io);if(uplink&&list.indexOf(uplink)<0)list.push(uplink);return list;}
function nftBinary(){return ['/usr/sbin/nft','/sbin/nft','/usr/bin/nft'].find(p=>{try{return fs.statSync(p).isFile();}catch(e){return false;}})||'nft';}
function rules(names){
    const out=[];
    for(const name of names||INTERFACES)for(const prefix of PRIVATE4){
        out.push({chain:'input',rule:'iifname "'+name+'" ip saddr '+prefix+' tcp dport '+PORT});
        out.push({chain:'output',rule:'oifname "'+name+'" ip daddr '+prefix+' meta skuid '+UID+' tcp sport '+PORT});
    }
    return out;
}
const normalized=line=>line.replace(/# handle \d+\s*$/,'').replace(/\bcounter(?: packets \d+ bytes \d+)?\s*/g,'').replace(/\s+/g,' ').trim();
function plan(listing,names){
    // listing: [{chain:[family,table,name], present, text}]
    const commands=[];
    const desired=c=>{const kind=/output$/.test(c.chain[2])?'output':'input';return rules(names).filter(r=>r.chain===kind).map(r=>r.rule+' accept comment "'+TAG+'"');};
    // Nothing to do while every present chain holds exactly our rule set.
    if(listing.every(c=>!c.present||c.text.split('\n').filter(l=>l.indexOf('comment "'+TAG+'"')>=0).map(normalized).sort().join('\n')===desired(c).map(normalized).sort().join('\n')))return [];
    for(const c of listing)for(const line of c.text.split('\n')){
        const m=/# handle (\d+)\s*$/.exec(line);
        if(m&&line.indexOf('comment "'+TAG+'"')>=0)commands.push('delete rule '+c.chain.join(' ')+' handle '+m[1]);
    }
    for(const c of listing){
        if(!c.present)continue;
        const kind=/output$/.test(c.chain[2])?'output':'input';
        for(const r of rules(names))if(r.chain===kind)commands.push('insert rule '+c.chain.join(' ')+' '+r.rule+' counter accept comment "'+TAG+'"');
    }
    return commands;
}
function apply(io){
    io=io||{spawnSync:cp.spawnSync};
    const nft=nftBinary();
    const listing=CHAINS.map(chain=>{const r=io.spawnSync(nft,['-nn','-a','list','chain'].concat(chain),{encoding:'utf8',timeout:3000});return {chain,present:r.status===0,text:r.stdout||''};});
    if(!listing.some(c=>c.present))return {applied:0,reason:'no-firewall-chains'};
    const commands=plan(listing,interfaces());
    if(!commands.length)return {applied:0,reason:'unchanged'};
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-browser-remote-')),file=path.join(dir,'rules.nft');
    try{
        fs.writeFileSync(file,commands.join('\n')+'\n',{mode:0o600,flag:'wx'});
        for(const args of [['-c','-f',file],['-f',file]]){
            const r=io.spawnSync(nft,args,{encoding:'utf8',timeout:5000});
            if(r.status!==0)throw new Error('nft: '+String(r.stderr||'failed').slice(0,300));
        }
    }finally{try{fs.unlinkSync(file);}catch(e){}try{fs.rmdirSync(dir);}catch(e){}}
    return {applied:commands.length};
}
// Root keeper started by the launcher before it drops privileges.
function watch(){
    const tick=()=>{try{const r=apply();if(r.applied)console.log('Remote control firewall re-applied: '+JSON.stringify(r));}catch(e){console.error('Remote control firewall: '+e.message);}};
    tick();setInterval(tick,5000);
}
module.exports={apply,plan,rules,interfaces,uplinkInterface,watch,TAG,PORT};
if(require.main===module&&process.argv[2]==='watch'){if(process.getuid()!==0)throw Error('root required');watch();}
