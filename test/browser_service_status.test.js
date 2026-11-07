'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {explain,STATUS}=require('../src/browser_service_status');
const io=(status,runtime)=>({readFileSync:f=>{if(f===STATUS&&status)return JSON.stringify(status);throw Object.assign(Error('ENOENT'),{code:'ENOENT'});},statSync:f=>{if(runtime)return {};throw Error('ENOENT');}});
test('The app explains why the browser backend is unreachable',()=>{
    assert.match(explain(io(null,false)),/Laufzeit fehlt/);
    assert.match(explain(io(null,true)),/noch kein Status/);
    assert.match(explain(io({state:'setup_failed',error:'Existing Browser data belongs to another account'},true)),/belongs to another account/);
    assert.match(explain(io({state:'backend_exited',code:125},true)),/Code 125/);
    assert.match(explain(io({state:'waiting_for_app'},true)),/App-Registrierung/);
});
