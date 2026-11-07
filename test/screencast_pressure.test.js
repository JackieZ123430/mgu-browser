'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('zlib');
const Browser=require('../src/browser_session'),PNG=require('../src/png_frame');
const jpeg='/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAQABADASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAFF/f//Z';
function png(){
    const chunk=(name,data)=>{const type=Buffer.from(name),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(PNG.crc(Buffer.concat([type,data])));return Buffer.concat([head,type,data,tail]);};
    const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(10);}assert.fail('Frame did not recover after downstream pressure cleared');}
function make(){
    let ready=false;
    const b=new Browser({gate:{check:()=>({allowed:true})},frameReady:()=>ready,frameInterval:5});
    const ack=[],frames=[],faults=[];b.pipe={closed:false,send:async(method,p)=>{if(method==='Page.screencastFrameAck')ack.push(p.sessionId);},close(){this.closed=true;}};
    b.session='page';b.on('frame',f=>frames.push(f));b.on('fault',e=>faults.push(e));
    return {b,ack,frames,faults,release:()=>{ready=true;},valid:b.performance.codec==='jpeg-native'?jpeg:png()};
}
function send(b,id,data){b.screencastFrame({sessionId:'page',params:{sessionId:id,data}});}

test('Slow frontend holds only the latest compressed frame and recovers without a new Chromium frame',async()=>{
    const {b,ack,frames,faults,release,valid}=make();
    try{
        send(b,1,'not an image');await pause(15);
        assert.equal(b.performance.encodedBytes,0,'Congestion must defer even base64 decoding');assert.equal(frames.length,0);assert.equal(faults.length,0);
        send(b,2,valid);assert.deepEqual(ack,[1],'Superseded encoded frame is acknowledged immediately');
        await pause(15);assert.equal(b.performance.frames,0);release();
        await until(()=>frames.length===1);
        assert.deepEqual(ack,[1,2]);assert.equal(b.performance.dropped,1);assert.equal(b.performance.frames,1);assert.equal(faults.length,0);assert.equal(b.pendingFrame,null);
        assert(frames[0].rgba[0]>200&&frames[0].rgba[1]<30,'Latest real image decoded after pressure clears');
    }finally{b.destroy();}
});

test('A held old-page frame cannot be emitted after navigation',async()=>{
    const {b,ack,frames,faults,release,valid}=make();
    try{send(b,1,valid);b.pageGeneration++;release();await until(()=>ack.length===1);await pause(10);assert.equal(frames.length,0);assert.equal(faults.length,0);assert.equal(b.performance.encodedBytes,0);}
    finally{b.destroy();}
});

test('Shutdown acknowledges and cancels a held compressed frame',async()=>{
    const {b,ack,frames,release,valid}=make();send(b,1,valid);b.destroy();release();await pause(20);
    assert.deepEqual(ack,[1]);assert.equal(b.pendingFrame,null);assert.equal(b.frameTimer,null);assert.equal(frames.length,0);
});
