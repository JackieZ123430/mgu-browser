'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Identity=require('../src/browser_identity'),Pages=require('../src/browser_pages');
const ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
test('The observed engine identity is preserved without fabricated UA or Client Hints',()=>{
    assert.deepEqual(Identity.create({userAgent:ua,product:'Chrome/156.0.8078.79'}),{userAgent:ua});
    const different=ua.replace('Chrome/','HeadlessChrome/');
    assert.equal(Identity.create({userAgent:different}).userAgent,different,'Changing launch architecture is separate from rewriting identity');
    assert.throws(()=>Identity.create({userAgent:'bad\r\nheader'}),/identity/);
    assert.throws(()=>Identity.create({}),/identity/);
});
test('Locale selection changes language while clearing every CDP identity override',async()=>{
    const calls=[],browser={locale:'de-DE',userAgent:'must-not-be-applied',userAgentMetadata:{brands:[{brand:'must-not-be-applied'}]}};
    await Pages.applyLocale.call(browser,'tab-session',{send:async(method,params,session)=>{calls.push({method,params,session});}});
    assert.deepEqual(calls[0],{method:'Network.setUserAgentOverride',params:{userAgent:'',acceptLanguage:'de-DE,de;q=0.9'},session:'tab-session'});
    assert.deepEqual(calls[1],{method:'Emulation.setLocaleOverride',params:{locale:'de-DE'},session:'tab-session'});
    assert.deepEqual(Identity.languages('en-GB'),['en-GB','en']);
    assert.deepEqual(Identity.localeOverride('de'),{userAgent:'',acceptLanguage:'de'});
    assert.throws(()=>Identity.localeOverride('de-DE\r\nX-Test: unsafe'),/locale/);
});
