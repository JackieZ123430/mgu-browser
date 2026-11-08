'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Events=require('../src/input_events'),Structured=require('../src/structured_input');
test('Key modifiers retain Shift boolean compatibility and encode native desktop shortcuts',()=>{
    assert.equal(Events.key('ArrowLeft',true).modifiers,8);assert.equal(Events.key('ArrowLeft',false).modifiers,0);
    assert.deepEqual(Events.key('a',{ctrl:true}),{key:'a',modifiers:2,code:'KeyA',windowsVirtualKeyCode:65});
    assert.equal(Events.key('End',{ctrl:true,shift:true}).modifiers,10);assert.equal(Events.key('F12').windowsVirtualKeyCode,123);
    assert.equal(Events.key('Delete').code,'Delete');assert.equal(Events.key('Enter').text,'\r');assert.equal(Events.key('Enter',{ctrl:true}).text,undefined);
});
test('Malformed key names and unsupported modifier shapes cannot reach Chromium',()=>{
    for(const value of ['','Control+a','InvalidKey',null,{},'x'.repeat(40)])assert.throws(()=>Events.key(value),/Taste/);
    for(const value of [2,[],{ctrl:'yes'},{control:true},{ctrl:true,unexpected:false}])assert.throws(()=>Events.modifiers(value),/modifikatoren/);
});
test('Pointer coordinates and gesture options are finite, bounded and explicit',()=>{
    assert.deepEqual(Events.point(-4,200,{width:100,height:100}),{x:0,y:99});assert.equal(Events.mouse({button:'middle',clickCount:2}).buttons,4);
    for(const value of [{button:'extra'},{clickCount:3},{clickCount:NaN},{unexpected:true},{modifiers:{ctrl:1}}])assert.throws(()=>Events.mouse(value),/Ungueltige/);
    for(const value of [NaN,Infinity,'12',null])assert.throws(()=>Events.point(value,10,{width:100,height:100}),/Zeiger/);
});
test('Structured input validates real calendars and ISO week boundaries before editing',()=>{
    assert.equal(Structured.parse('date','2024-02-29').expected,'2024-02-29');assert.equal(Structured.parse('month','2026-11').fields.month,'11');
    assert.equal(Structured.parse('week','2020-W53').fields.week,'53');assert.equal(Structured.parse('datetime-local','2026-11-08T23:45').fields.hour,'23');
    for(const [type,value] of [['date','2025-02-29'],['date','0000-01-01'],['date','2026-13-01'],['week','2026-W54'],['week','2021-W53'],['time','24:00'],['time','13:60'],['time','12:30Z'],['month','2026-00'],['text','2026-11-08']])assert.throws(()=>Structured.parse(type,value));
    assert.equal(Structured.parse('date','').clear,true);assert.equal(Structured.parse('time','01:02:03.123').expected,'01:02:03.123');
});
