'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Media=require('../src/browser_media');
test('AX media focus preserves all merged detents before the first selection',async()=>{
    const candidates=Array.from({length:18},(_,index)=>({node:100+index,name:'Control '+index,x:index*10,y:20}));
    const context={view:4,session:'s',valid:()=>true,send:async(method,params)=>method==='DOM.resolveNode'?{object:{objectId:'node-'+params.backendNodeId}}:{result:{value:true}}};
    const browser=Object.assign({},Media,{accessibleMediaControls:async()=>candidates});
    for(const [delta,index] of [[1,0],[-1,17],[16,15],[-16,2],[20,1],[-20,16]]){
        browser.focusedMediaControl=null;browser.focusedMediaObject=null;
        await browser.focusAccessibleMediaControl(delta,context);
        assert.equal(browser.focusedMediaControl.node,candidates[index].node,'Initial '+delta+' detents');
    }
    browser.focusedMediaControl=candidates[2];await browser.focusAccessibleMediaControl(16,context);assert.equal(browser.focusedMediaControl.node,candidates[0].node,'Existing selection retains normal wrap');
});
