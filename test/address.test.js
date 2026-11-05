'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{normalize}=require('../src/url_policy');
test('controller address entry accepts domains, paths and HTTPS, rejects other schemes',()=>{
    assert.equal(normalize(' example.net '),'https://example.net/');
    assert.equal(normalize('example.org/a-b?q=test&x=2#main'),'https://example.org/a-b?q=test&x=2#main');
    for(const v of ['', 'http://example.org','javascript:alert(1)','https://a:b@example.org','https://example.org:8080','bad host'])assert.equal(normalize(v),null);
});
