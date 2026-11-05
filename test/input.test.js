'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/browser_controller'),{convert}=require('../src/native_image_bridge');
test('iDrive: Drehen, Drücken und Neigen liefern Browser-Aktionen ohne Doppelbetätigung',()=>{
    const events=[],a={};['toolbar','keyboard','scroll','press','focus'].forEach(k=>a[k]=v=>events.push([k,v]));
    const c=new Controller(a),v=(k,pb,df)=>({frontRotaryEncoderOperation:k,frontRotaryEncoderPushButton:pb,frontRotaryEncoderDeflection:df});
    c.feed(v(10,0,0));c.feed(v(12,0,0));c.feed(v(12,1,0));c.feed(v(12,1,0));c.feed(v(12,0,10));c.feed(v(12,0,0));c.feed(v(12,0,4));c.feed(v(12,0,0));c.feed(v(12,0,7));
    assert.deepEqual(events,[['focus',2],['press',undefined],['toolbar',undefined],['keyboard',undefined],['scroll',220]]);
});
test('Native Bildadaption erhält andere Zeichenoperationen und übersetzt die Pixel-Reihenfolge',()=>{
    const words=new Uint32Array(15),f=new Float32Array(words.buffer);words.set([1,0,18,700,4]);f.set([12,104,1576,420],5);words[9]=2;f.set([0,0,1,1],10);words[14]=0xffffffff;
    const converted=convert(words),out=new Float32Array(converted.buffer);
    assert.deepEqual([...words.slice(0,2)],[1,0]);assert.deepEqual([...converted.slice(0,2)],[1,0]);
    assert.deepEqual([...out.slice(3,7)],[12,104,1576,420]);assert.equal(converted[7],0);assert.equal(converted[8],700);assert.deepEqual([...converted.slice(9)],[...words.slice(9)]);
    assert.throws(()=>convert(new Uint32Array([18,700])),/Invalid/);
});
