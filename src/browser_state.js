'use strict';
const fs=require('fs'),path=require('path'),Policy=require('./url_policy');
class BrowserState{
    constructor(directory){
        this.file=path.join(directory,'browser-state.json');this.data={homepage:'',autoHide:false,zoom:100,history:[],bookmarks:[]};
        try{if(fs.statSync(this.file).size<524288)Object.assign(this.data,JSON.parse(fs.readFileSync(this.file,'utf8')));}catch(e){}
        this.data.history=(Array.isArray(this.data.history)?this.data.history:[]).filter(i=>i&&Policy.allowed(i.url)).slice(0,120);
        this.data.bookmarks=(Array.isArray(this.data.bookmarks)?this.data.bookmarks:[]).filter(i=>i&&Policy.allowed(i.url)).slice(0,80);
        if(!Policy.allowed(this.data.homepage))this.data.homepage='';
        if([100,125,150].indexOf(this.data.zoom)<0)this.data.zoom=100;
    }
    save(){try{fs.writeFileSync(this.file+'.partial',JSON.stringify(this.data),{mode:0o600});fs.renameSync(this.file+'.partial',this.file);}catch(e){}}
    set(key,value){if(['homepage','autoHide','zoom'].indexOf(key)<0)return;this.data[key]=value;this.save();}
    visit(url,title,count){
        if(!Policy.allowed(url))return;
        const now=Date.now(),old=this.data.history.find(i=>i.url===url),entry=old||{url,count:0};
        if(!old||(count!==false&&now-old.at>2000))entry.count++;
        entry.at=now;if(title)entry.title=String(title).slice(0,140);
        this.data.history=[entry].concat(this.data.history.filter(i=>i!==entry)).slice(0,120);this.save();
    }
    bookmarked(url){return this.data.bookmarks.some(i=>i.url===url);}
    toggleBookmark(url,title){
        if(!Policy.allowed(url))return;
        if(this.bookmarked(url))this.data.bookmarks=this.data.bookmarks.filter(i=>i.url!==url);
        else this.data.bookmarks.unshift({url,title:title||url});
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
