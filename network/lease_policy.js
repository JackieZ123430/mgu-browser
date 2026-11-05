'use strict';
const net=require('net');
function number(ip){if(net.isIP(ip)!==4)throw new Error('Invalid IPv4 address');return ip.split('.').reduce((a,n)=>(a*256+Number(n))>>>0,0);}
function assertIsolated(address,prefix,interfaces){
    const value=number(address),mask=(0xffffffff<<(32-prefix))>>>0,start=(value&mask)>>>0,end=(start|(~mask))>>>0;
    if(!Number.isInteger(prefix)||prefix<8||prefix>30||!Array.isArray(interfaces))throw new Error('Invalid WLAN topology');
    if((value>>>24)===0||(value>>>24)===127||(value>>>24)>=224)throw new Error('Invalid WLAN unicast address');
    for(const iface of interfaces){
        if(iface.ifname==='wlan0')continue;
        if(!Array.isArray(iface.addr_info))throw new Error('Incomplete interface inventory');
        for(const entry of iface.addr_info){
            if(entry.family!=='inet')continue;
            if(!Number.isInteger(entry.prefixlen)||entry.prefixlen<0||entry.prefixlen>32)throw new Error('Invalid interface prefix');
            const other=number(entry.local),otherMask=entry.prefixlen===0?0:(0xffffffff<<(32-entry.prefixlen))>>>0,otherStart=(other&otherMask)>>>0,otherEnd=(otherStart|(~otherMask))>>>0;
            if(start<=otherEnd&&otherStart<=end)throw new Error('WLAN-Subnetz überschneidet sich mit einem anderen Fahrzeugnetz');
        }
    }
}
module.exports={assertIsolated};
