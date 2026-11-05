const test=require('node:test'),assert=require('node:assert/strict'),Gate=require('../src/visibility_gate');
test('Mediengesperrter Chromium-Modus braucht nur Vordergrundstatus und keine Fahrzeugwerte',()=>{
    const g=new Gate();assert.equal(g.check().allowed,false);g.setVisible(true);assert.equal(g.check().allowed,true);
    let blocked=0;g.onBlock=()=>blocked++;g.setVisible(false);g.check();assert.equal(blocked,1);assert.equal(g.check().allowed,false);
});
