'use strict';
const parse5=require('./html5_parser'),URL=require('url').URL;
const omitted=new Set(['script','style','template','svg','video','audio','canvas','iframe','object','embed','head']);
const blocks=new Set(['p','div','section','article','header','footer','nav','li','ul','ol','form','label','button','br']);
const attr=(n,k)=>(n.attrs||[]).find(a=>a.name===k);
function text(n){if(omitted.has(n.tagName))return '';if(n.nodeName==='#text')return n.value;return (n.childNodes||[]).map(text).join(' ');}
function find(n,tag){if(n.tagName===tag)return n;for(const c of n.childNodes||[]){const v=find(c,tag);if(v)return v;}return null;}
function all(n,tag,out){out=out||[];if(n.tagName===tag)out.push(n);(n.childNodes||[]).forEach(c=>all(c,tag,out));return out;}
function page(html,url){
    const doc=parse5.parse(html,{scriptingEnabled:false}),title=find(doc,'title');
    // Some Next pages contain both a noscript/splash main and the actual main.
    const mains=all(doc,'main').sort((a,b)=>text(b).length-text(a).length);
    const root=mains[0]||find(doc,'body')||doc,items=[];let pending='';
    const clean=s=>s.replace(/\s+/g,' ').trim();
    const emit=(kind,value,href)=>{value=clean(value);if(value&&items.length<2000)items.push({kind,text:value.slice(0,8000),href:href||null});};
    const flush=()=>{emit('text',pending);pending='';};
    function walk(n){
        if(omitted.has(n.tagName)||attr(n,'hidden')||(attr(n,'aria-hidden')||{}).value==='true')return;
        const marker=attr(n,'id');if(marker)items.push({kind:'anchor',text:'',href:null,anchor:marker.value.slice(0,128)});
        if(n.nodeName==='#text'){pending+=' '+n.value;return;}
        if(/^h[1-6]$/.test(n.tagName||'')){flush();emit(n.tagName,text(n));return;}
        if(n.tagName==='a'){
            flush();const a=attr(n,'href');let href=null;
            try{const u=new URL(a&&a.value||'',url);if(u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443'))href=u.href;}catch(e){}
            emit(href?'link':'text',text(n),href);return;
        }
        if(n.tagName==='img'){const alt=attr(n,'alt');if(alt&&alt.value){flush();emit('caption','[Bild: '+alt.value+']');}return;}
        if(blocks.has(n.tagName))flush();
        (n.childNodes||[]).forEach(walk);if(blocks.has(n.tagName))flush();
    }
    walk(root);flush();const heading=items.findIndex(i=>i.kind==='h1');
    return {url,title:clean(title?text(title):url),items:heading>=0?items.slice(heading):items};
}
module.exports={page};
