'use strict';
const fs=require('fs'),path=require('path'),Policy=require('./url_policy');
const Metadata=require('./browser_metadata'),MAX_STATE=256*1024;
function historyURL(url){try{const parsed=new (require('url').URL)(url);for(const key of Array.from(parsed.searchParams.keys()))if(/token|auth|password|session|serverstate|nonce|^state$|^code$|^pin$/i.test(key))parsed.searchParams.delete(key);if(/token|auth|password|session|code=/i.test(parsed.hash))parsed.hash='';return parsed.href;}catch(e){return '';}}
class BrowserState{
    constructor(directory){
        this.file=path.join(directory,'browser-state.json');this.data={homepage:'',autoHide:false,zoom:100,historyEnabled:true,history:[],bookmarks:[]};
        try{if(fs.statSync(this.file).size<524288){const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const key of Object.keys(this.data))if(saved&&Object.prototype.hasOwnProperty.call(saved,key))this.data[key]=saved[key];}}catch(e){}
        this.data.history=(Array.isArray(this.data.history)?this.data.history:[]).filter(i=>i&&Policy.allowed(i.url)).map(i=>({url:historyURL(i.url),title:Metadata.title(i.title),count:Number.isFinite(i.count)?Math.max(0,i.count):0,at:Number.isFinite(i.at)?i.at:0})).slice(0,120);
        this.data.bookmarks=(Array.isArray(this.data.bookmarks)?this.data.bookmarks:[]).filter(i=>i&&Policy.allowed(i.url)).map(i=>({url:i.url,title:Metadata.title(i.title)})).slice(0,80);
        if(!Policy.allowed(this.data.homepage))this.data.homepage='';
        if([100,125,150].indexOf(this.data.zoom)<0)this.data.zoom=100;
    }
    save(){try{let encoded=JSON.stringify(this.data);while(Buffer.byteLength(encoded)>MAX_STATE&&(this.data.history.length||this.data.bookmarks.length)){if(this.data.history.length)this.data.history.pop();else this.data.bookmarks.pop();encoded=JSON.stringify(this.data);}if(Buffer.byteLength(encoded)>MAX_STATE)throw new Error('State limit');fs.writeFileSync(this.file+'.partial',encoded,{mode:0o600});fs.renameSync(this.file+'.partial',this.file);this.error='';return true;}catch(e){this.error='Browser-Einstellungen konnten nicht gespeichert werden';if(this.onError)this.onError(this.error);return false;}}
    set(key,value){if(['homepage','autoHide','zoom','historyEnabled'].indexOf(key)<0)return;if(key==='homepage'&&value&&!Policy.allowed(value))return;if(key==='zoom'&&[100,125,150].indexOf(value)<0)return;this.data[key]=value;this.save();}
    clearHistory(){this.data.history=[];this.save();}
    visit(url,title,count){
        if(!Policy.allowed(url)||!this.data.historyEnabled)return;
        url=historyURL(url);if(!url)return;
        const now=Date.now(),old=this.data.history.find(i=>i.url===url),entry=old||{url,count:0};
        if(!old||(count!==false&&now-old.at>2000))entry.count++;
        entry.at=now;if(title)entry.title=String(title).slice(0,140);
        this.data.history=[entry].concat(this.data.history.filter(i=>i!==entry)).slice(0,120);this.save();
    }
    bookmarked(url){return this.data.bookmarks.some(i=>i.url===url);}
    toggleBookmark(url,title){
        if(!Policy.allowed(url))return;
        if(this.bookmarked(url))this.data.bookmarks=this.data.bookmarks.filter(i=>i.url!==url);
        else this.data.bookmarks.unshift({url,title:Metadata.title(title||url)});
        this.data.bookmarks=this.data.bookmarks.slice(0,80);this.save();
    }
    frequent(){return this.data.history.slice().sort((a,b)=>b.count-a.count||b.at-a.at).slice(0,9);}
}
function inputURL(value){
    const v=String(value||'').trim();if(!v)return null;
    if(/^[a-z][a-z0-9+.-]*:/i.test(v))return Policy.normalize(v);
    if(!/\s/.test(v)&&(/[.]/.test(v)||/^localhost([/:]|$)/i.test(v)))return Policy.normalize(v);
    return 'https://www.google.com/search?q='+encodeURIComponent(v);
}
module.exports={BrowserState,inputURL};
