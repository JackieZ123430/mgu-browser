'use strict';
// Bound display copies in UTF-8 bytes, including multibyte scripts.
function text(value,bytes){
    const source=String(value||''),buffer=Buffer.from(source,'utf8');
    if(buffer.length<=bytes)return source;
    let end=Math.max(0,bytes-3);while(end>0&&(buffer[end]&0xc0)===0x80)end--;
    return buffer.slice(0,end).toString('utf8')+'…';
}
module.exports={text,title:value=>text(value,512)};
