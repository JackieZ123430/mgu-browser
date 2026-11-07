'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Input=require('../src/browser_input'),Controller=require('../src/browser_controller');
test('iDrive ignores unavailable samples and rotates before activating a combined sample',()=>{
    const calls=[],actions={focus:d=>calls.push(['focus',d]),press:()=>calls.push(['press'])};
    const controller=new Controller(actions),sample=(k,pb,df)=>({frontRotaryEncoderOperation:k,frontRotaryEncoderPushButton:pb||0,frontRotaryEncoderDeflection:df||0});
    controller.feed(sample(65535));controller.feed(sample(300,15,15));controller.feed({});controller.feed(null);
    controller.feed(sample(0,1));controller.feed(sample(0,1));assert.deepEqual(calls,[['focus',1],['press']]);
    controller.reset();controller.feed(sample(40));assert.equal(calls.length,2);
});
test('Input work keeps turns and presses ordered and rejects work queued for an old tab',async()=>{
    const calls=[];let finish;const pending=new Promise(r=>finish=r);
    const browser=Object.assign({session:'a',epoch:1,pageGeneration:1,requireAllowed(){},pipe:{send:async(method,params,session)=>{calls.push({method,session});return pending;}}},Input);
    const first=browser.inputTask(async context=>{await context.send('first');});
    const second=browser.inputTask(async context=>{await context.send('second');});
    await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);
    browser.session='b';browser.pageGeneration++;finish({});
    await assert.rejects(first,/gewechselt/);await assert.rejects(second,/gewechselt/);assert.equal(calls.length,1);
    const order=[];await Promise.all([browser.inputTask(async()=>{await new Promise(r=>setImmediate(r));order.push('turn');}),browser.inputTask(async()=>order.push('press'))]);assert.deepEqual(order,['turn','press']);
});
test('Page focus rejects unbounded or malformed controller rotations',async()=>{
    for(const delta of [0,NaN,Infinity,17,-17,'1',1.5])await assert.rejects(()=>Input.focusPage.call({},delta),/Controller/);
});
