'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Cookies=require('../src/browser_cookies');
const base={name:'consent',value:'accepted',domain:'example.org',path:'/',expires:1999999999,secure:true,httpOnly:false,sameSite:'Lax',priority:'Medium',sourceScheme:'Secure',sourcePort:443};
test('Cookie checkpoints detect changed flags and partition scope without a changed token',()=>{
    const first=Cookies.digest([base]);
    for(const change of [{secure:false},{httpOnly:true},{sameSite:'Strict'},{priority:'High'},{sourceScheme:'NonSecure'},{sourcePort:8443},{partitionKey:{topLevelSite:'https://example.net',hasCrossSiteAncestor:true}}]){
        assert.notEqual(Cookies.digest([Object.assign({},base,change)]),first,JSON.stringify(change));
    }
    const partitioned=Object.assign({},base,{partitionKey:{topLevelSite:'https://example.net',hasCrossSiteAncestor:false}});
    assert.notEqual(Cookies.digest([partitioned]),Cookies.digest([Object.assign({},partitioned,{partitionKey:{topLevelSite:'https://example.net',hasCrossSiteAncestor:true}})]));
    assert.equal(Cookies.digest([partitioned]),Cookies.digest([Object.assign({},partitioned,{size:999,partitionKey:{hasCrossSiteAncestor:false,topLevelSite:'https://example.net'}})]),'Ignored diagnostics or property ordering must not create needless checkpoints');
    assert.equal(Cookies.digest([base,partitioned]),Cookies.digest([partitioned,base]));
});
test('A same-value flag update reaches the cookie store once and then remains unchanged',async()=>{
    let current=[base],writes=0,saved;
    const browser={options:{profileStore:{prefs:{rememberSessions:true},saveCookies:async value=>{writes++;saved=value;}}}};
    Object.assign(browser,Cookies);
    const pipe={send:async()=>({cookies:current})};
    assert.equal(await browser.snapshotCookies(pipe),true);
    current=[Object.assign({},base,{httpOnly:true,sameSite:'Strict'})];
    assert.equal(await browser.snapshotCookies(pipe),true);assert.equal(saved[0].httpOnly,true);assert.equal(saved[0].sameSite,'Strict');
    assert.equal(await browser.snapshotCookies(pipe),false);assert.equal(writes,2);
});
