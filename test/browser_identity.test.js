'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Identity=require('../src/browser_identity'),Pages=require('../src/browser_pages');
const ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36';
test('Visible Browser preserves actual Linux and Chromium versions in legacy UA and Client Hints',()=>{
    const identity=Identity.create({userAgent:ua,product:'Chrome/156.0.8078.79'},'x64');
    assert.equal(identity.userAgent,ua.replace('HeadlessChrome/','Chrome/'));
    assert.deepEqual(identity.metadata.brands,[{brand:'Chromium',version:'156'}]);
    assert.deepEqual(identity.metadata.fullVersionList,[{brand:'Chromium',version:'156.0.8078.79'}]);
    assert.equal(identity.metadata.platform,'Linux');assert.equal(identity.metadata.bitness,'64');
    assert.equal(identity.metadata.architecture,'x86');assert.equal(identity.metadata.mobile,false);
    assert(!JSON.stringify(identity).includes('Windows'));
});
test('Missing/unknown engine identity cannot invent Chrome versions or leak malformed headers',()=>{
    assert.throws(()=>Identity.create({userAgent:'bad\r\nheader',product:'Chrome/156.1'}),/identity/);
    const identity=Identity.create({userAgent:ua,product:'UnknownProduct'},'x64');assert.equal(identity.metadata,null);
    assert.equal(Identity.create({userAgent:ua,product:'Chrome/156.0.8078.79'},'arm64').metadata,null);
});
test('Every tab and locale update receives matching UA metadata without changing its platform',async()=>{
    const identity=Identity.create({userAgent:ua,product:'Chrome/156.0.8078.79'},'x64'),calls=[];
    const browser={locale:'de-DE',userAgent:identity.userAgent,userAgentMetadata:identity.metadata};
    await Pages.applyLocale.call(browser,'tab-session',{send:async(method,params,session)=>{calls.push({method,params,session});}});
    assert.equal(calls[0].params.acceptLanguage,'de-DE,de;q=0.9');
    assert.equal(calls[0].params.userAgentMetadata,identity.metadata);assert.equal(calls[0].session,'tab-session');
    assert.equal(calls[0].params.platform,'Linux x86_64');
});
