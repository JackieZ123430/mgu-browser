'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {BrowserState,inputURL}=require('../src/browser_state');
test('browser preferences, bounded history and bookmarks survive reopening',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-browser-state-'));
    try{
        const s=new BrowserState(dir);assert.equal(s.data.homepage,'');s.set('homepage','https://example.net/');s.set('zoom',125);
        s.visit('https://example.net/','');s.visit('https://example.net/','Leon',false);assert.equal(s.frequent()[0].count,1);assert.equal(s.frequent()[0].title,'Leon');
        s.toggleBookmark('https://example.net/','Leon');
        const reopened=new BrowserState(dir);assert.equal(reopened.data.homepage,'https://example.net/');assert.equal(reopened.data.zoom,125);assert(reopened.bookmarked('https://example.net/'));
        reopened.toggleBookmark('https://example.net/');assert(!new BrowserState(dir).bookmarked('https://example.net/'));
        for(let i=0;i<140;i++)s.visit('https://example.org/'+i,'Page '+i);assert.equal(s.data.history.length,120);
        s.visit('javascript:alert(1)','bad');assert.equal(s.data.history.length,120);
        s.visit('https://example.org/login?serverState=fixture-private&lang=de#access_token=fixture','Login');assert.equal(s.data.history[0].url,'https://example.org/login?lang=de');
        s.set('historyEnabled',false);s.clearHistory();s.visit('https://example.org/no-history','Private');assert.equal(s.data.history.length,0);assert.equal(new BrowserState(dir).data.historyEnabled,false);
    }finally{
        assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('mgu-browser-state-'));fs.rmSync(dir,{recursive:true});
    }
});
test('address bar distinguishes HTTPS domains and ordinary search terms',()=>{
    assert.equal(inputURL('example.net/leistungen'),'https://example.net/leistungen');
    assert.equal(inputURL('BMW iDrive'),'https://www.google.com/search?q=BMW%20iDrive');
    assert.equal(inputURL('youtube'),'https://www.google.com/search?q=youtube');
    assert.equal(inputURL('javascript:alert(1)'),null);assert.equal(inputURL(''),null);
});
test('address entry preserves explicit HTTP, host ports and IPv6 without treating hosts as schemes',()=>{
    for(const [input,url] of [
        ['http://example.org:8080/login','http://example.org:8080/login'],
        ['example.org:8443/path','https://example.org:8443/path'],
        ['localhost:8080/','https://localhost:8080/'],
        ['localhost?status=1','https://localhost/?status=1'],
        ['printer:9000/status','https://printer:9000/status'],
        ['[::1]:8080/status','https://[::1]:8080/status'],
        ['2001:db8::1/status','https://[2001:db8::1]/status'],
        ['::1','https://[::1]/']
    ])assert.equal(inputURL(input),url,input);
    for(const input of ['javascript:8080','data:80','file:443','chrome://version','http://u:p@example.org/','localhost:65536/'])assert.equal(inputURL(input),null,input);
    assert.equal(inputURL('printer status'),'https://www.google.com/search?q=printer%20status');
});
test('HTTP and custom-port history, bookmarks and homepage survive reopening',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-browser-web-state-'));
    try{
        const s=new BrowserState(dir),url='http://localhost:8080/status';
        s.set('homepage',url);s.toggleBookmark(url,'Local status');s.visit(url+'?lang=de&auth=private','Local status');
        const reopened=new BrowserState(dir);assert.equal(reopened.data.homepage,url);assert(reopened.bookmarked(url));
        assert.equal(reopened.data.history[0].url,url+'?lang=de','Sensitive query values remain excluded from HTTP history');
        assert.equal(reopened.data.history[0].title,'Local status');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('content blocking defaults off while existing explicit preferences survive',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-browser-blocking-state-'));
    try{
        const fresh=new BrowserState(dir);assert.equal(fresh.data.blockAds,false);
        fresh.set('blockAds',true);assert.equal(new BrowserState(dir).data.blockAds,true);
        fresh.set('blockAds',false);assert.equal(new BrowserState(dir).data.blockAds,false);
        fs.writeFileSync(path.join(dir,'browser-state.json'),JSON.stringify({blockAds:'invalid'}));
        assert.equal(new BrowserState(dir).data.blockAds,false,'Malformed old data does not opt into blocking');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
