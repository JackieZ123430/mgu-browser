'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{allowed,normalize}=require('../src/url_policy');
test('controller address entry accepts ordinary web URLs, paths and nondefault ports',()=>{
    assert.equal(normalize(' example.net '),'https://example.net/');
    assert.equal(normalize('example.org/a-b?q=test&x=2#main'),'https://example.org/a-b?q=test&x=2#main');
    assert.equal(normalize('http://example.org:8080/a?q=1#part'),'http://example.org:8080/a?q=1#part');
    assert.equal(normalize('https://example.org:8443/'),'https://example.org:8443/');
    assert.equal(normalize('example.org:8080/path'),'https://example.org:8080/path');
    assert.equal(normalize('localhost:8000/?q=1'),'https://localhost:8000/?q=1');
    assert.equal(normalize('printer:8000/status'),'https://printer:8000/status');
    assert.equal(normalize('[::1]:8080/path'),'https://[::1]:8080/path');
    assert.equal(normalize('http://[::1]:8080/'),'http://[::1]:8080/');
    assert.equal(normalize('2001:db8::1/path'),'https://[2001:db8::1]/path');
    assert.equal(normalize('::1'),'https://[::1]/');
    assert.equal(normalize('bücher.example:8443/'),'https://xn--bcher-kva.example:8443/');
});
test('navigation accepts web schemes but rejects credentials, malformed ports and active or local schemes',()=>{
    for(const v of ['http://example.org/','https://example.org:8443/','http://[::1]:8080/'])assert.equal(allowed(v),true,v);
    for(const v of ['', 'javascript:alert(1)','javascript:8080','data:80','file:443','file:///etc/passwd','chrome://settings',
        'about:blank','blob:https://example.org/id','mailto:a@example.org','tel:123','intent:123','ftp://example.org/',
        'https://a:b@example.org','http://user@example.org/','https://example.org:65536/','https://example.org:abc/',
        'https://[broken]/','bad host','https://example.org/\r\nnext'])assert.equal(normalize(v),null,v);
    for(const v of [null,{},'javascript:alert(1)','file:///etc/passwd','https://example.org/\0','http://u:p@example.org/'])assert.equal(allowed(v),false,String(v));
});
