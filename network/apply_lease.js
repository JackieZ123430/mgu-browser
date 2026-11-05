'use strict';
const fs=require('fs'),cp=require('child_process'),net=require('net');
const base='/var/opt/mgu-browser/network',stateFile=base+'/startup-state.json';
if(process.getuid()!==0)throw new Error('Root network service required');
if(!['bound','renew'].includes(process.argv[2]))process.exit(0);
if(process.env.interface!=='wlan0')throw new Error('Unexpected DHCP interface');
function ip(s){if(net.isIP(s)!==4)throw new Error('Invalid IPv4 lease');return s.split('.').reduce((a,n)=>(a*256+Number(n))>>>0,0);}
function dotted(n){return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
const address=process.env.ip,mask=ip(process.env.subnet),value=ip(address),inverse=(~mask)>>>0;
const prefix=32-Math.log2(inverse+1);if((inverse&(inverse+1))!==0||prefix<8||prefix>30||!Number.isInteger(prefix))throw new Error('Unsupported DHCP subnet');
const network=(value&mask)>>>0,router=(process.env.router||'').split(/\s+/)[0];
if(((ip(router)&mask)>>>0)!==network||value===network||value===((network|inverse)>>>0))throw new Error('Invalid DHCP router/address');
const dns=(process.env.dns||router).trim().split(/\s+/).slice(0,3);dns.forEach(ip);
const cidr=address+'/'+prefix,subnet=dotted(network)+'/'+prefix;
const config=JSON.parse(fs.readFileSync(base+'/iproute.json','utf8'));
if(config.command.length!==4||config.command[0]!=='/var/opt/mgu-browser/engine/lib/ld-linux-x86-64.so.2'||!config.command[3].startsWith(base+'/iproute-'))throw new Error('Unexpected private routing tool');
const run=a=>cp.execFileSync(config.command[0],config.command.slice(1).concat(a),{encoding:'utf8',timeout:5000}).trim();
const rules=JSON.parse(run(['-j','rule','show'])),table=JSON.parse(run(['-j','route','show','table','3911']));
// Reject collisions before the first address/route/firewall mutation. Rule218
// is source-scoped, so the entire lease subnet must be foreign-interface free.
require('./lease_policy').assertIsolated(address,prefix,JSON.parse(run(['-j','address','show'])));
let previous={};try{previous=JSON.parse(fs.readFileSync(base+'/lease-state.json','utf8'));}catch(e){}
const own=rules.filter(r=>r.priority===219),reverse=rules.filter(r=>r.priority===218);
if(own.some(r=>r.uid_start!==3911||r.uid_end!==3911||String(r.table)!=='3911'))throw new Error('Browser routing slot occupied');
if(reverse.some(r=>![address,previous.ip].includes(r.src)||String(r.table)!=='3911'))throw new Error('WLAN return routing slot occupied');
if(table.some(r=>r.dev!=='wlan0'||!['default',subnet,previous.subnet].includes(r.dst)))throw new Error('Browser table contains foreign routes');
const current=JSON.parse(run(['-j','address','show','dev','wlan0']))[0].addr_info.filter(a=>a.family==='inet');
if(current.some(a=>a.local!==address&&a.local!==previous.ip))throw new Error('Foreign WLAN address present');
if(previous.ip&&previous.ip!==address&&current.some(a=>a.local===previous.ip))run(['address','del',previous.cidr,'dev','wlan0']);
if(!current.some(a=>a.local===address))run(['address','add',cidr,'dev','wlan0']);
if(previous.subnet&&previous.subnet!==subnet&&table.some(r=>r.dst===previous.subnet))run(['route','del',previous.subnet,'dev','wlan0','table','3911']);
run(['route','replace',subnet,'dev','wlan0','src',address,'table','3911']);
run(['route','replace','default','via',router,'dev','wlan0','table','3911']);
if(reverse.length&&reverse[0].src!==address)run(['rule','del','priority','218','from',reverse[0].src+'/32','lookup','3911']);
if(!reverse.length||reverse[0].src!==address)run(['rule','add','priority','218','from',address+'/32','lookup','3911']);
if(!own.length)run(['rule','add','priority','219','uidrange','3911-3911','lookup','3911']);
const nft=a=>cp.execFileSync('nft',a,{encoding:'utf8',timeout:5000});
const firewall=nft(['list','chain','ip','filter','output']);
for(const [name,ports] of [['tcp','{ 53, 80, 443 }'],['udp','{ 53, 443 }']]){
 const label='mgu_browser_wifi_backend_'+name;if(!firewall.includes('"'+label+'"'))nft(['insert','rule','ip','filter','output','oifname "wlan0" meta skuid 3911 '+name+' dport '+ports+' accept comment "'+label+'"']);
}
// Update in place: the backend's private bind mount refers to this inode.
fs.writeFileSync(base+'/resolv.conf',dns.map(s=>'nameserver '+s+'\n').join('')+'options timeout:2 attempts:2\n',{mode:420});
const state={connected:true,interface:'wlan0',ip:address,cidr,subnet,router,dns,lease:Number(process.env.lease)||0,updated:new Date().toISOString()};
fs.writeFileSync(base+'/lease-state.json',JSON.stringify(state),{mode:384});fs.writeFileSync(stateFile,JSON.stringify(state),{mode:384});
fs.writeFileSync('/var/opt/mgu-browser/network-status.json',JSON.stringify({connected:true,updated:state.updated}),{mode:416});fs.chownSync('/var/opt/mgu-browser/network-status.json',0,12443);
console.log('Browser WLAN ready; private routing and DNS applied');
