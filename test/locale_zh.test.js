'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Events=require('events');
const fs=require('fs'),path=require('path');
const {BrowserLocale,normalize}=require('../src/browser_locale');
test('Chinese follows the vehicle language and switches back without rewriting site text',()=>{
    const units=new Events();let language='zh_CN';units.getLanguage=()=>language;
    const locale=new BrowserLocale({currentVehicleUnits:units});
    assert.equal(locale.text('Einstellungen'),'设置');
    assert.equal(locale.text('Fahrzeug-Audiokanal verbunden'),'车辆音频通道已连接');
    assert.equal(locale.text('Website-Anmeldung ist nicht mehr aktuell'),'网站登录请求已过期');
    const url='https://example.invalid/Settings?q=Cancel';
    assert.equal(locale.text(url),url);
    assert.equal(locale.text('A website article'), 'A website article');
    language='en_GB';units.emit('languageChanged');assert.equal(locale.text('Einstellungen'),'Settings');
    language='de_DE';units.emit('languageChanged');assert.equal(locale.text('Einstellungen'),'Einstellungen');
    locale.close();assert.equal(units.listenerCount('languageChanged'),0);
    assert.equal(normalize('CHINESISCH_SIMPLE'),'zh-CN');
    assert.equal(normalize('KANTONESISCH_SIMPLE'),'zh-CN');
});
test('Chinese native labels have glyphs inside the renderer texture budget',()=>{
    const folder=path.join(__dirname,'../localization');
    const words=JSON.parse(fs.readFileSync(path.join(folder,'zh-CN.json'),'utf8'));
    const atlas=JSON.parse(fs.readFileSync(path.join(folder,'cjk.json'),'utf8')).sizes[0];
    assert(atlas.atlasW<=1024&&atlas.atlasH<=2048);
    for(const text of Object.values(words))for(const char of text){
        if(char.codePointAt(0)>=0x3400&&char.codePointAt(0)<=0x9fff)
            assert(atlas.glyphs[char.codePointAt(0)],'Missing glyph '+char);
    }
});
