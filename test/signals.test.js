const test=require('node:test'),assert=require('node:assert/strict');
const {powerTrainPark}=require('../src/vehicle_signals');
test('DataPowerTrain2 bestätigt nur eindeutig P; NP und ungültige Werte löschen die Freigabe',()=>{
    assert.equal(powerTrainPark('P'),'P');assert.equal(powerTrainPark(3),'P');
    ['NP',4,'N',1,'R',2,'_1',5,'_9',13,0,255,null,undefined,'3'].forEach(v=>assert.equal(powerTrainPark(v),null));
});
