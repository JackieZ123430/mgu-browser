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
test('Native browser controls, permission names and structured input errors have English labels',()=>{
    const units=new Events();units.getLanguage=()=> 'en_GB';const locale=new BrowserLocale({currentVehicleUnits:units});
    for(const [source,expected] of [
        ['Meldung der Webseite','Website message'],['Website-Berechtigungen','Site permissions'],['Zwischenablage lesen','Read clipboard'],['Nicht verfuegbar','Unavailable'],
        ['Datei fuer die Webseite auswaehlen','Select a file for the website'],['Downloads auf dem Handy oeffnen','Open downloads on your phone'],
        ['Datum / Uhrzeit','Date / time'],['Alles','Select all'],['Datum als JJJJ-MM-TT eingeben','Enter a date as YYYY-MM-DD'],
        ['Dieses Zeitfeld unterstuetzt die angegebene Genauigkeit nicht','This time field does not support that precision'],
        ['Website-Dialog ist nicht mehr aktuell','The website dialog has expired'],['Webseite wurde gewechselt','The web page has changed'],['completed','Completed'],
        ['Anmeldung der Webseite','Website sign-in'],['Benutzername eingeben','Enter username'],['Ungültige Anmeldedaten','Invalid sign-in details'],['Auf der Seite suchen','Find on page']
    ])assert.equal(locale.text(source),expected);
    assert.equal(locale.text('https://example.invalid/?q=Antwort'),'https://example.invalid/?q=Antwort','Unknown website text remains untouched');
    locale.close();
});
test('German native labels use proper accents while preserving technical date formats',()=>{
    const units=new Events();units.getLanguage=()=> 'de_DE';const locale=new BrowserLocale({currentVehicleUnits:units});
    assert.equal(locale.text('Berechtigung fuer diese Webseite'),'Berechtigung für diese Webseite');assert.equal(locale.text('Nicht verfuegbar'),'Nicht verfügbar');
    assert.equal(locale.text('Datums- oder Zeitwert konnte nicht vollstaendig gesetzt werden'),'Datums- oder Zeitwert konnte nicht vollständig gesetzt werden');
    assert.equal(locale.text('JJJJ-MM-TTTHH:MM'),'JJJJ-MM-TTTHH:MM');assert.equal(locale.text('completed'),'Abgeschlossen');
    assert.equal(locale.text('Secure website required for permissions'),'Berechtigungen benötigen eine sichere Webseite');locale.close();
});
