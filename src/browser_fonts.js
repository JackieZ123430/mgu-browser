'use strict';
// Keep the sharp menu atlas; use a broader atlas when literal titles need it.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
function install(fonts,directory){
    const original=fonts.get;
    const data=JSON.parse(fs.readFileSync(path.join(directory,'cjk-titles.json'),'utf8'));
    const title=Object.assign({},data.sizes[0],{family:'browser-cjk-titles',cacheKey:data.cacheKey,alpha:null});
    fonts.get=function(name,size,text){
        const normal=original(name,size,text);
        const chars=Array.from(String(text||''));
        if(normal&&chars.some(ch=>!normal.glyphs[ch.codePointAt(0)])&&chars.every(ch=>title.glyphs[ch.codePointAt(0)])){
            if(!title.alpha)title.alpha=zlib.inflateSync(Buffer.from(data.sizes[0].alpha,'base64'));
            return title;
        }
        return normal;
    };
    return ()=>{fonts.get=original;};
}
module.exports={install};
