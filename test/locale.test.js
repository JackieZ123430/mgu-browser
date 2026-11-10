'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Events=require('events');
const {BrowserLocale}=require('../src/browser_locale');
const zhCN=require('../src/browser_zh_cn');

test('Simplified Chinese follows vehicle language and preserves English and technical text',()=>{
    const units=new Events();let value='zh_CN';units.getLanguage=()=>value;
    const locale=new BrowserLocale({currentVehicleUnits:units});
    for(const tag of ['zh_CN','zh-SG','zh-Hans','zh-Hans-CN','zh']){
        value=tag;units.emit('languageChanged');
        assert.equal(locale.text('Einstellungen'),'设置');
        assert.equal(locale.text('completed'),'已完成');
        assert.equal(locale.text('Secure website required for permissions'),'网站权限需要安全的网页连接');
        assert.equal(locale.text('JJJJ-MM-TTTHH:MM'),'YYYY-MM-DDTHH:MM');
        assert.equal(locale.text('https://example.invalid/中文?q=Settings'),'https://example.invalid/中文?q=Settings');
        assert.equal(locale.text('未收录的网站标题'),'未收录的网站标题');
        assert.equal(locale.keyboard()[0],'qwertyuiop','Translation does not add a Chinese IME');
    }
    for(const tag of ['zh-TW','zh-Hant','zh-Hant-HK','zh-HK','zh-MO','en-GB']){
        value=tag;units.emit('languageChanged');assert.equal(locale.text('Einstellungen'),'Settings');
    }
    value='de-DE';units.emit('languageChanged');assert.equal(locale.text('Einstellungen'),'Einstellungen');
    locale.close();assert.equal(units.listenerCount('languageChanged'),0);
});

test('Chinese catalog covers every native English label without altering technical formats',()=>{
    const fs=require('fs'),vm=require('vm');
    const source=fs.readFileSync(require.resolve('../src/browser_locale'),'utf8');
    const fixture={exports:{}};
    const sourceRequire=require('module').createRequire(require.resolve('../src/browser_locale'));
    vm.runInNewContext(source+'\nmodule.exports.catalog=en;', {module:fixture,require:sourceRequire,process});
    for(const english of new Set(Object.values(fixture.exports.catalog))){
        assert(Object.prototype.hasOwnProperty.call(zhCN,english),'Missing translation: '+english);
        assert(zhCN[english].length>0);
        if(english.startsWith('YYYY'))assert.equal(zhCN[english],english);
    }
});
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
