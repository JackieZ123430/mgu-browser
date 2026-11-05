const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const Channel=require('../src/ipc_protocol');
test('IPC verarbeitet getrennte Header und Nutzdaten und verweigert übergroße Befehle',()=>{
    const socket=new PassThrough();const c=new Channel(socket);let got;c.on('json',v=>got=v);
    const body=Buffer.from('{"op":"state","allowed":false}'),header=Buffer.alloc(8);header.writeUInt32LE(1);header.writeUInt32LE(body.length,4);
    socket.write(header.slice(0,3));socket.write(Buffer.concat([header.slice(3),body]));assert.equal(got.allowed,false);
    const bad=Buffer.alloc(8);bad.writeUInt32LE(1);bad.writeUInt32LE(999999,4);socket.write(bad);assert.equal(socket.destroyed,true);
});
test('IPC erhält große Pixelframes über viele Teile und den nächsten JSON-Befehl ohne zusätzliche Vollkopien',()=>{
    const socket=new PassThrough(),c=new Channel(socket);let frame,message;c.on('frame',b=>frame=b);c.on('json',m=>message=m);
    const pixels=Buffer.alloc(1280*384*4,117),h=Buffer.alloc(8);h.writeUInt32LE(2);h.writeUInt32LE(pixels.length,4);socket.write(h);
    for(let i=0;i<pixels.length;i+=17003)socket.write(pixels.slice(i,i+17003));
    const text=Buffer.from('{"ready":true}'),j=Buffer.alloc(8);j.writeUInt32LE(1);j.writeUInt32LE(text.length,4);socket.write(Buffer.concat([j,text]));
    assert(frame.equals(pixels));assert.equal(message.ready,true);assert.equal(c.body,null);
});
