const test=require('node:test'),assert=require('node:assert/strict');
const {page}=require('../src/html_page');
test('Native HTML-Ansicht übernimmt Inhalt und HTTPS-Links, führt keinen Seitencode aus und stellt keine Medien dar',()=>{
    const p=page('<title>Test &amp; Titel</title><nav>ausserhalb</nav><main><h1>Hallo Welt</h1><p>Text &lt; 10</p><a href="/kontakt">Kontakt</a><video>MEDIA</video><audio>AUDIO</audio><iframe>IFRAME</iframe><script>global.compromised=true</script><a href="javascript:alert(1)">Kein Skript</a></main>','https://example.net/');
    assert.equal(p.title,'Test & Titel');assert.equal(p.items.find(i=>i.kind==='link').href,'https://example.net/kontakt');
    const text=p.items.map(i=>i.text).join(' ');assert.match(text,/Hallo Welt/);assert.match(text,/Text < 10/);assert.doesNotMatch(text,/MEDIA|AUDIO|IFRAME|compromised|ausserhalb/);assert.equal(global.compromised,undefined);
    assert.equal(p.items.find(i=>i.text==='Kein Skript').href,null);
});
test('Eine vorgeschaltete Lade-/noscript-Ansicht verdrängt nicht den eigentlichen Seiteninhalt',()=>{
    const p=page('<main>Loading</main><main><h1>Echter Inhalt</h1><p>Die vollstaendige Website.</p><a href="/mehr">Mehr</a></main>','https://example.net/');
    assert.match(p.items.map(i=>i.text).join(' '),/Echter Inhalt/);assert.equal(p.items.filter(i=>i.kind==='link').length,1);
});
test('Sprungziele innerhalb der Website bleiben für die native Navigation erhalten',()=>{
    const p=page('<main><h1>Start</h1><a href="#kontakt">Kontakt</a><section id="kontakt"><h2>Kontakt</h2></section></main>','https://example.net/');
    assert(p.items.some(i=>i.kind==='anchor'&&i.anchor==='kontakt'));
    assert(p.items.some(i=>i.href==='https://example.net/#kontakt'));
});
