'use strict';
// Isolated, locally authored form fixture: no provider, credentials or live session.
const fs=require('fs'),path=require('path'),assert=require('assert');
if(process.platform!=='linux'||process.getuid()===0)throw new Error('Run as the emulator development user');
const base=path.join(process.env.HOME,'bmw-emulator'),config=JSON.parse(fs.readFileSync(base+'/config.json','utf8'));
const Browser=require('../src/browser_session');
const profileRoot=fs.mkdtempSync(base+'/data/input-test-');
const browser=new Browser({gate:{check:()=>({allowed:true})},mediaDisabled:false,binary:config.chromium,profileRoot});
(async()=>{try{
    await browser.start('');
    await browser.send('Runtime.evaluate',{expression:`document.body.innerHTML='<input id="ordinary"><input id="pin" readonly>';
        window.pinDigits='';document.querySelector('#pin').onkeydown=e=>{if(/^[0-9]$/.test(e.key)){window.pinDigits+=e.key;e.preventDefault();}};
        document.querySelector('#ordinary').focus();`});
    const value=async expression=>(await browser.send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
    await browser.text('Aa9#&%!äöüß€');
    assert.equal(await value('document.querySelector("#ordinary").value'),'Aa9#&%!äöüß€','Normal fields must receive case, symbols and Unicode exactly once');
    await browser.send('Runtime.evaluate',{expression:'document.querySelector("#pin").focus()'});
    await browser.text('2468');
    assert.equal(await value('window.pinDigits'),'2468','Key-driven PIN fields must receive each digit through keydown');
    assert.equal(await value('document.querySelector("#pin").value'),'','Prevented or readonly inputs must not receive duplicate inserted text');
    console.log('Real engine input: normal text, symbols, Unicode and key-driven PIN passed');
}finally{browser.destroy();await browser.closing;assert.equal(path.dirname(profileRoot),base+'/data');fs.rmSync(profileRoot,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
