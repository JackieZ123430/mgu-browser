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
