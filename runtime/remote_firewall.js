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
const INTERFACES=['wlan0','wlan_bridge'];
function nftBinary(){return ['/usr/sbin/nft','/sbin/nft','/usr/bin/nft'].find(p=>{try{return fs.statSync(p).isFile();}catch(e){return false;}})||'nft';}
function rules(){
    const out=[];
    for(const name of INTERFACES)for(const prefix of PRIVATE4){
        out.push({chain:'input',rule:'iifname "'+name+'" ip saddr '+prefix+' tcp dport '+PORT});
        out.push({chain:'output',rule:'oifname "'+name+'" ip daddr '+prefix+' meta skuid '+UID+' tcp sport '+PORT});
    }
    return out;
}
function plan(listing){
    // listing: [{chain:[family,table,name], present, text}]
    const commands=[];
    for(const c of listing)for(const line of c.text.split('\n')){
        const m=/# handle (\d+)\s*$/.exec(line);
        if(m&&line.indexOf('comment "'+TAG+'"')>=0)commands.push('delete rule '+c.chain.join(' ')+' handle '+m[1]);
    }
    for(const c of listing){
        if(!c.present)continue;
        const kind=/output$/.test(c.chain[2])?'output':'input';
        for(const r of rules())if(r.chain===kind)commands.push('insert rule '+c.chain.join(' ')+' '+r.rule+' counter accept comment "'+TAG+'"');
    }
    return commands;
}
function apply(io){
    io=io||{spawnSync:cp.spawnSync};
    const nft=nftBinary();
    const listing=CHAINS.map(chain=>{const r=io.spawnSync(nft,['-a','list','chain'].concat(chain),{encoding:'utf8',timeout:3000});return {chain,present:r.status===0,text:r.stdout||''};});
    if(!listing.some(c=>c.present))return {applied:0,reason:'no-firewall-chains'};
    const commands=plan(listing);
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
module.exports={apply,plan,rules,TAG,PORT};
