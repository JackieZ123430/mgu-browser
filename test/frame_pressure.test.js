'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const FrameDelta=require('../src/frame_delta');

test('Frame pressure is exposed before decode and a rejected frame never advances the delta reference',()=>{
    let pending=0,allowed=true,generation=7;
    const packets=[],owner={frameProtocol:2,pending:()=>pending,sendParts:(type,parts)=>packets.push(Buffer.concat(parts))};
    let current=owner;
    const sender=FrameDelta.sender({owner:()=>current,allowed:()=>allowed,generation:()=>generation,maxPending:100});
    const frame=value=>({width:16,height:16,rgba:Buffer.alloc(16*16*4,value)});
    assert.equal(sender.canSend(),true);
    const first=frame(5);assert.equal(sender.send(first),true);
    pending=101;assert.equal(sender.canSend(),false);
    assert.equal(sender.send(frame(90)),false);assert.equal(packets.length,1);
    pending=0;assert.equal(sender.canSend(),true);
    const latest=frame(5);latest.rgba.fill(7,16*4,3*16*4);
    assert.equal(sender.send(latest),true);
    assert.equal(packets[1].readUInt32LE(12),1,'Compare against the delivered frame, not the rejected one');
    assert.equal(packets[1].readUInt32LE(16),2);
    allowed=false;assert.equal(sender.canSend(),false);assert.equal(sender.send(frame(0)),false);
    allowed=true;current=null;assert.equal(sender.canSend(),false);
    current=owner;generation++;assert.equal(sender.send(latest),true);
    assert.equal(packets[2].readUInt32LE(12),0);assert.equal(packets[2].readUInt32LE(16),16,'New foreground generation starts with a full frame');
});
