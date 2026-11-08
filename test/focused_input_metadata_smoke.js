'use strict';
// Local authored frames and closed components only. Metadata never contains
// password values; fixture assertions inspect their own generated values.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-focused-input-')),b=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:root,gate:{check:()=>({allowed:true})},viewport:{width:960,height:540}}),servers=[],sockets=new Set(),passed=[];
function remove(dir){for(const n of fs.readdirSync(dir)){const f=path.join(dir,n),s=fs.lstatSync(f);if(s.isDirectory()&&!s.isSymbolicLink())remove(f);else fs.unlinkSync(f);}fs.rmdirSync(dir);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const value=async expression=>{const r=await b.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Authored focus fixture evaluation failed');return r.result.value;};
async function serve(html){const s=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});s.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});servers.push(s);await new Promise(r=>s.listen(0,'0.0.0.0',r));return s.address().port;}
async function until(fn,label){for(let i=0;i<100;i++){try{if(await fn())return;}catch(ignore){}await pause(25);}throw Error(label);}
function password(info){assert(info&&info.editable&&info.password&&info.type==='password','Focused password must open masked native and phone keyboards');assert(!Object.prototype.hasOwnProperty.call(info,'value'),'Focus metadata must not include field values');}
(async()=>{try{
 await b.start('');
 await value('document.body.innerHTML="<div id=h></div>";window.authoredShadow=h.attachShadow({mode:"closed"});authoredShadow.innerHTML="<input id=p type=password>";true');
 password(await b.focusPage(1));password(await b.pressPage());await b.text('own-fixture');assert(await value('authoredShadow.querySelector("input").value==="own-fixture"'));passed.push('closed-shadow password metadata and native typing');
 await value('document.body.innerHTML="<div id=h></div>";window.outerShadow=h.attachShadow({mode:"closed"});outerShadow.innerHTML="<div id=inner></div>";window.innerShadow=outerShadow.querySelector("div").attachShadow({mode:"closed"});innerShadow.innerHTML="<textarea></textarea>";true');
 const multiline=await b.focusPage(1);assert(multiline.editable&&multiline.multiline&&!multiline.password);await b.text('one\ntwo');assert.equal(await value('innerShadow.querySelector("textarea").value'),'one\ntwo');passed.push('nested closed-shadow multiline metadata');
 const child=await serve('<!doctype html><input id=p type=password>');
 for(const host of ['127.0.0.1','127.0.0.2']){
  const parent=await serve('<!doctype html><iframe id=f src="http://'+host+':'+child+'/child"></iframe>');await b.send('Page.navigate',{url:'http://127.0.0.1:'+parent+'/parent'});
  await until(async()=>await value('location.href===' +JSON.stringify('http://127.0.0.1:'+parent+'/parent')+'&&document.readyState==="complete"&&!!document.querySelector("iframe")'),'Parent frame did not load');
  if(host==='127.0.0.2')await until(()=>b.relatedFrames(b.session).length>0,'Verified out-of-process frame owner was not registered');else await pause(150);
  password(await b.focusPage(1));password(await b.pressPage());await b.text('own-frame-fixture');
  const field=await require(backend+'/browser_input_focus').resolve(b,{session:b.session,check:()=>b.requireAllowed(),send:(m,p)=>b.send(m,p)});
  try{const check=await field.send('Runtime.callFunctionOn',{objectId:field.objectId,functionDeclaration:'function(){return this.value==="own-frame-fixture";}',returnByValue:true});assert.equal(check.result.value,true);}finally{await field.cleanup();}
  passed.push(host==='127.0.0.2'?'cross-site OOPIF password metadata via verified persistent owner':'same-site cross-origin password metadata');
 }
 console.log('FOCUSED_INPUT_RESULT '+JSON.stringify({success:true,passed,codec:b.performance.codec}));
}finally{b.destroy();await b.closing;for(const socket of sockets)socket.destroy();for(const server of servers)await new Promise(r=>server.close(r));remove(root);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
