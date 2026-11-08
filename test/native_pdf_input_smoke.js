'use strict';
// Original one-page PDF fixture; native PDF toolbar stays on Chromium's normal
// Tab order even when its component UI is outside the page's public DOM.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const backend=process.env.MGU_BROWSER_BACKEND||path.resolve(__dirname,'../src'),Browser=require(backend+'/browser_session'),PNG=require(backend+'/png_frame');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Unprivileged Linux required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-native-pdf-')),b=new Browser({binary:process.env.MGU_BROWSER_BINARY||'/usr/bin/chromium',profileRoot:root,gate:{check:()=>({allowed:true})},viewport:{width:960,height:540}}),sockets=new Set();
function remove(dir){for(const n of fs.readdirSync(dir)){const f=path.join(dir,n),s=fs.lstatSync(f);if(s.isDirectory()&&!s.isSymbolicLink())remove(f);else fs.unlinkSync(f);}fs.rmdirSync(dir);}
function pdf(){const stream='BT /F1 18 Tf 40 240 Td (Original browser PDF fixture) Tj ET\n',parts=['%PDF-1.4\n'],offsets=[0];for(const body of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']){offsets.push(Buffer.byteLength(parts.join('')));parts.push((offsets.length-1)+' 0 obj\n'+body+'\nendobj\n');}const at=Buffer.byteLength(parts.join(''));parts.push('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>('0000000000'+n).slice(-10)+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF\n');return Buffer.from(parts.join(''));}
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/pdf','Connection':'close'});res.end(pdf());});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function shot(){const r=await b.send('Page.captureScreenshot',{format:'png'});return PNG.decode(Buffer.from(r.data,'base64'));}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));await b.start('http://127.0.0.1:'+server.address().port+'/original.pdf');await pause(1800);
 const original=b.pipe.send;let tabs=0;b.pipe.send=function(method,params){if(method==='Input.dispatchKeyEvent'&&params.key==='Tab')tabs++;return original.apply(this,arguments);};
 const before=await shot(),info=await b.focusPage(1);await pause(80);const after=await shot();assert(info.nativePdf,'Native PDF document must be identified without pretending its BODY is a focused input');assert.equal(tabs,2,'One detent sends exactly one native Tab key down/up pair');
 let changed=0;for(let i=0;i<before.rgba.length;i+=4)if(before.rgba[i]!==after.rgba[i]||before.rgba[i+1]!==after.rgba[i+1]||before.rgba[i+2]!==after.rgba[i+2])changed++;
 assert(changed>0,'Native PDF toolbar focus must produce visible changed pixels');await b.focusPage(1);await b.focusPage(1);assert.equal(tabs,6,'Three detents must not skip alternate PDF toolbar controls');
 console.log('NATIVE_PDF_INPUT_RESULT '+JSON.stringify({success:true,detents:3,tabKeyEvents:tabs,changedFocusPixels:changed,codec:b.performance.codec}));
}finally{b.destroy();await b.closing;for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(r=>server.close(r));remove(root);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
