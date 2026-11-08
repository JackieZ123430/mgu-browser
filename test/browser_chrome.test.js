'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EventEmitter=require('node:events');
const Chrome=require('../src/browser_chrome');
function fixture(){
    const browser=new EventEmitter(),calls=[],targets=new Map(),literal=[];browser.request=async(op,args)=>{calls.push({op,args});return {};};
    const chrome=new Chrome({browser,changed(){},close(){},openRemote(){},editPrompt(){},button(c,x,y,w,h,label,run,id,options){if(!options||options.enabled!==false)targets.set(id,run);}});
    const canvas={fillRect(){},text(value,x,y,size,color,options){literal.push({value,options});}};
    return {browser,calls,targets,literal,chrome,draw(mode){targets.clear();chrome.draw(canvas,491,mode);}};
}
test('A previously rendered dialog button cannot answer a replacement dialog',async()=>{
    const f=fixture();f.browser.emit('dialog',{id:'a',type:'confirm',origin:'https://a.example',message:'first'});f.draw();const old=f.targets.get('browser-dialog-accept');
    f.browser.emit('dialog',{id:'b',type:'confirm',origin:'https://b.example',message:'second'});await old();assert.equal(f.calls.length,0);
    f.draw();await f.targets.get('browser-dialog-cancel')();assert.deepEqual(f.calls,[{op:'dialogReply',args:{dialogId:'b',accept:false,promptText:''}}]);
});
test('A prompt preserves literal website text and only sends the explicitly entered response',async()=>{
    const f=fixture();f.browser.emit('dialog',{id:'p',type:'prompt',origin:'https://site.example',message:'<script>not markup</script>',defaultPrompt:'initial'});f.chrome.promptValue('response');f.draw();
    assert(f.literal.some(x=>x.value==='<script>not markup</script>'&&x.options.literal===true));await f.targets.get('browser-dialog-accept')();assert.equal(f.calls[0].args.promptText,'response');
});
test('Permission settings retain the displayed origin and navigation invalidates old controls',async()=>{
    const f=fixture();f.chrome.permissions={available:true,origin:'https://a.example',permissions:[{name:'camera',state:'prompt'}]};f.draw('browser-permissions');const old=f.targets.get('browser-permission-0-0');
    f.browser.emit('navigation','https://b.example');f.chrome.permissions={available:true,origin:'https://b.example',permissions:[{name:'camera',state:'prompt'}]};
    await assert.rejects(old(),/Webseite wurde gewechselt/);assert.equal(f.calls.length,0);f.draw('browser-permissions');await f.targets.get('browser-permission-0-0')();assert.equal(f.calls[0].args.expectedOrigin,'https://b.example');
});
test('Concurrent permission prompts are retained until their exact request resolves',()=>{
    const f=fixture();f.browser.emit('permission',{id:'one',state:'requested',origin:'https://one.example',permissions:['camera']});f.browser.emit('permission',{id:'two',state:'requested',origin:'https://two.example',permissions:['microphone']});
    assert.equal(f.chrome.permission().id,'one');f.browser.emit('permission',{id:'two',state:'resolved'});assert.equal(f.chrome.permission().id,'one');f.browser.emit('permission',{id:'one',state:'resolved'});assert.equal(f.chrome.modal(),false);
});
test('Active downloads offer cancellation and completed files offer deletion',async()=>{
    const f=fixture();f.browser.emit('files',{downloads:[{id:'active',name:'a',state:'downloading'},{id:'done',name:'b',state:'completed'}],chooser:null});f.draw();await f.targets.get('browser-download-0')();await f.targets.get('browser-download-1')();
    assert.deepEqual(f.calls.map(x=>[x.op,x.args.downloadId]),[['cancelDownload','active'],['deleteDownload','done']]);f.browser.emit('dialog',{id:'a',type:'alert'});f.browser.emit('blocked');assert.equal(f.chrome.modal(),false);
});
