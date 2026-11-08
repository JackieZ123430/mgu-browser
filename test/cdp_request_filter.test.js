'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),PassThrough=require('node:stream').PassThrough,Filter=require('../src/cdp_request_filter'),CdpPipe=require('../src/cdp_pipe');
function filtered(raw,step,max){const f=new Filter(max||4096),bytes=Buffer.from(raw);for(let at=0;at<bytes.length;at+=step)f.write(bytes.slice(at,at+step));return{filter:f,value:Filter.strip(JSON.parse(f.finish().toString('utf8')))};}
function event(method,body){return{method,params:{requestId:'owned-request',frameId:'owned-frame',request:Object.assign({url:'https://example.invalid/upload',method:'POST',headers:{postData:'header stays',escaped:'"\\漢😀'}},body),other:{postData:'unrelated metadata'}},sessionId:'owned-session'};}

test('Only native request event body copies are removed, with byte-split UTF-8 and escaped JSON',()=>{
    for(const method of ['Fetch.requestPaused','Fetch.authRequired','Network.requestWillBeSent']){
        const input=event(method,{postData:'quote"slash\\\r\n漢😀',postDataEntries:[{bytes:'YWJj',nested:[{postData:'discard with its body entry'}]}],hasPostData:true}),expected=JSON.parse(JSON.stringify(input));delete expected.params.request.postData;delete expected.params.request.postDataEntries;
        for(const step of [1,2,3,7,64,4096])assert.deepEqual(filtered(JSON.stringify(input),step).value,expected);
    }
});

test('Escaped protocol key names select the same exact request object, without touching other scopes',()=>{
    const input=event('Fetch.authRequired',{postData:'body',postDataEntries:[{bytes:'Ym9keQ=='}]});input.params.authChallenge={origin:'https://example.invalid',realm:'owned',scheme:'basic'};
    const raw=JSON.stringify(input).replace('"request":','"requ\\u0065st":').replace('"postData":"body"','"\\u0070ostData":"body"').replace('"postDataEntries"','"postDataEntr\\u0069es"');
    const result=filtered(raw,1).value;assert(!('postData' in result.params.request));assert(!('postDataEntries' in result.params.request));assert.equal(result.params.request.headers.postData,'header stays');assert.deepEqual(result.params.authChallenge,input.params.authChallenge);
    for(const input of [{id:1,result:{value:{method:'Fetch.requestPaused',params:{request:{postData:'Runtime response stays'}}}}},{method:'Runtime.bindingCalled',params:{request:{postData:'unrelated event stays',postDataEntries:['also stays']}}},{method:'Other.event',params:{method:'Fetch.requestPaused',request:{postData:'nested method stays'}}}])assert.deepEqual(filtered(JSON.stringify(input),1).value,input);
});

test('Large body copies stream within the unchanged retained-output cap',()=>{
    const f=new Filter(1024),prefix=Buffer.from('{"method":"Fetch.requestPaused","params":{"request":{"url":"https://example.invalid","postData":"'),body=Buffer.alloc(65536,120);
    f.write(prefix);for(let n=0;n<256;n++){f.write(body);assert(f.size<1024);assert(f.chunks.length<3);}
    f.write(Buffer.from('","postDataEntries":[{"bytes":"'));for(let n=0;n<256;n++)f.write(body);f.write(Buffer.from('"}],"method":"POST"},"requestId":"one"},"sessionId":"session"}'));
    const result=Filter.strip(JSON.parse(f.finish().toString()));assert.equal(result.params.request.method,'POST');assert.equal(result.params.requestId,'one');assert(!('postData' in result.params.request));assert.equal(f.size<1024,true);
    assert.throws(()=>filtered(JSON.stringify(event('Fetch.requestPaused',{postData:'x',otherMetadata:'y'.repeat(2048)})),7,1024),/zu groß/);
    assert.throws(()=>filtered(JSON.stringify({method:'Runtime.consoleAPICalled',params:{request:{postData:'y'.repeat(2048)}}}),7,1024),/zu groß/);
});

test('Body values remain syntactically checked and late or malformed packet state cannot escape bounds',()=>{
    for(const value of ['"bad\\q"','"bad\nline"','[1,]','{"a":}','01','1e','tru','"unfinished'])assert.throws(()=>filtered('{"method":"Fetch.requestPaused","params":{"request":{"postData":'+value+'}}}',1),/Ungültige|JSON/);
    const late={params:{request:{postData:'body',url:'https://example.invalid'}},method:'Fetch.requestPaused'};assert.equal(filtered(JSON.stringify(late),1).value.params.request.postData,undefined);
    assert.throws(()=>filtered(JSON.stringify({params:{request:{postData:'x'.repeat(2048)}},method:'Fetch.requestPaused'}),7,1024),/zu groß/);
    assert.throws(()=>filtered('{"method":"Fetch.requestPaused","params":{"request":{"postData":"body"}},"method":"Runtime.bindingCalled"}',3),/Ungültige/);
    for(const value of [null,true,0,{},[],[1,{},null],{nested:{array:['quote"',false,2.5e-3]}}])assert.equal(filtered(JSON.stringify(event('Fetch.requestPaused',{postData:value})),1).value.params.request.postData,undefined);
});

test('Several NUL packets, cancelled sessions, unchanged responses and errors retain their framing',async()=>{
    const input=new PassThrough(),output=new PassThrough(),pipe=new CdpPipe(input,output,{maxBytes:1024}),events=[];pipe.on('event',e=>events.push(e));
    const pending=pipe.send('Runtime.evaluate',{},'session');
    const first=JSON.stringify(event('Fetch.requestPaused',{postData:'body'})),second=JSON.stringify({id:1,result:{value:{postData:'returned Runtime body stays'}}});
    const packets=Buffer.from(first+'\0'+second+'\0\0'+JSON.stringify({method:'Page.loadEventFired',params:{timestamp:1}})+'\0');
    for(let at=0;at<packets.length;at+=3)pipe.receive(packets.slice(at,at+3));assert.equal((await pending).value.postData,'returned Runtime body stays');assert.equal(events.length,2);assert.equal(events[0].params.request.postData,undefined);assert.equal(events[1].method,'Page.loadEventFired');assert.equal(pipe.closed,false);
    pipe.receive(Buffer.from('{"method":"Fetch.requestPaused","params":{"request":{"postData":"bad\\q"}}}\0'));assert.equal(pipe.closed,true);assert.equal(pipe.filter,null);assert.equal(pipe.size,0);input.destroy();output.destroy();
});

test('Non-object JSON roots close the pipe without dispatching or throwing into the caller',()=>{
    for(const root of ['null','[]','42','true','"text"']){
        const input=new PassThrough(),output=new PassThrough(),pipe=new CdpPipe(input,output);let error;pipe.on('closed',value=>error=value);
        assert.doesNotThrow(()=>pipe.receive(Buffer.from(root+'\0')));assert.equal(pipe.closed,true);assert.match(error.message,/Ungültige/);input.destroy();output.destroy();
    }
});
