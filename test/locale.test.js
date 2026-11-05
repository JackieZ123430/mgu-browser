'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Events=require('events');
const {BrowserLocale}=require('../src/browser_locale');
test('BMW CurrentVehicleUnits drives language changes, Unicode labels and keyboard',()=>{
    const units=new Events();let value='de_DE',changes=[];units.getLanguage=()=>value;
    const locale=new BrowserLocale({currentVehicleUnits:units},s=>changes.push(s));
    assert.equal(locale.language,'de-DE');assert.equal(locale.text('Zurueck'),'Zurück');assert.equal(locale.text('Oeffnen'),'Öffnen');assert(locale.keyboard().join('').includes('äöüß'));
    value='en_GB';units.emit('languageChanged');assert.equal(locale.text('Einstellungen'),'Settings');assert.equal(locale.keyboard()[0],'qwertyuiop');
    value='fr_FR';units.emit('languageChanged');assert.equal(locale.language,'fr-FR');assert.equal(locale.keyboard()[0],'azertyuiop');
    locale.close();assert.equal(units.listenerCount('languageChanged'),0);assert.equal(changes.length,3);
});
