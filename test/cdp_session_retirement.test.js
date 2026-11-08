'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),stream=require('node:stream'),CdpPipe=require('../src/cdp_pipe');
test('retiring one CDP session rejects only its stale renderer work and ignores late replies',async()=>{
    const input=new stream.PassThrough(),output=new stream.PassThrough(),pipe=new CdpPipe(input,output);
    const old=pipe.send('Runtime.evaluate',{},'old'),current=pipe.send('Runtime.evaluate',{},'current');
    pipe.cancelSession('old');await assert.rejects(old,/beendet/);assert.equal(pipe.pending.size,1);
    pipe.receive(Buffer.from(JSON.stringify({id:1,result:{wrong:true}})+'\0'+JSON.stringify({id:2,result:{right:true}})+'\0'));
    assert.deepEqual(await current,{right:true});assert.equal(pipe.pending.size,0);pipe.close();input.destroy();output.destroy();
});
test('native close and modal-answer acknowledgments retain their own bounded lifecycle',async()=>{
    const input=new stream.PassThrough(),output=new stream.PassThrough(),pipe=new CdpPipe(input,output);
    const close=pipe.send('Page.close',{},'old'),reply=pipe.send('Page.handleJavaScriptDialog',{accept:false},'old');pipe.cancelSession('old');assert.equal(pipe.pending.size,2);
    pipe.receive(Buffer.from(JSON.stringify({id:1,result:{}})+'\0'+JSON.stringify({id:2,result:{}})+'\0'));await Promise.all([close,reply]);pipe.close();input.destroy();output.destroy();
});
