'use strict';
// Self-contained phone control page (no external resources). The access token
// comes from the page path and is sent as a header with every request.
const HTML=`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>BMW Browser – Fernbedienung</title>
<style>
:root{--bg:#0e131a;--card:#18202b;--field:#222c39;--line:#2f3b4b;--text:#f2f5f9;--muted:#9eacbd;--accent:#78bfff;--warn:#ffbc8e;--ok:#7be0b5}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:12px 14px calc(24px + env(safe-area-inset-bottom))}
header{display:flex;align-items:center;gap:10px;margin:4px 0 12px}
header h1{font-size:18px;margin:0;flex:1}
.dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}.dot.on{background:var(--ok)}.dot.off{background:var(--warn)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px}
.card h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;font-weight:600}
.page{font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px}
.page b{color:var(--text);font-weight:600}
.row{display:flex;gap:8px;flex-wrap:wrap}.row>*{flex:1}
input,textarea,select{width:100%;background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px;font:inherit;font-size:17px}
textarea{min-height:76px;resize:vertical}
button{background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:inherit;font-weight:600;min-height:44px}
button.primary{background:#2d5a83;border-color:#3d74a6}button:active{transform:scale(.98)}button:disabled{opacity:.45}
.screen{position:relative;border-radius:10px;overflow:hidden;background:#000;touch-action:none;aspect-ratio:10/3}
.screen img{display:block;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.screen .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;text-align:center;padding:16px}
.ripple{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid var(--accent);pointer-events:none;animation:r .45s ease-out forwards}
@keyframes r{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.6)}}
.tabs{display:flex;flex-direction:column;gap:6px}.tab{text-align:left;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tab.active{border-color:var(--accent)}
label.check{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:14px;margin-top:8px}label.check input{width:auto}
#toast{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#253243;border:1px solid var(--line);padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}
#toast.show{opacity:1}
.small{font-size:13px;color:var(--muted);margin:6px 0 0}
</style></head><body><main>
<header><span id="dot" class="dot"></span><h1>BMW Browser</h1><span id="status" class="small" style="margin:0">Verbinde …</span></header>

<section class="card"><h2>Link senden</h2>
<input id="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Adresse oder Suchbegriff">
<div class="row" style="margin-top:8px"><button id="open" class="primary">Öffnen</button><button id="newtab">In neuem Tab</button></div>
</section>

<section class="card"><h2>Bildschirm</h2>
<div class="page" id="page">–</div>
<div class="screen" id="screen" tabindex="0" role="application" aria-label="Webseite im Fahrzeug steuern"><img id="shot" alt="" draggable="false"><div class="hint" id="hint">Noch kein Bild. Den Browser im iDrive öffnen.</div></div>
<label class="small" for="pointermode">Bildschirm-Geste</label><select id="pointermode"><option value="scroll">Tippen und scrollen</option><option value="drag">Ziehen / Text markieren</option><option value="double">Doppelklick</option><option value="context">Rechtsklick</option></select>
<p class="small">Scrollen wirkt an der berührten Stelle. Zum Markieren oder Verschieben „Ziehen“ wählen.</p>
<div class="row" style="margin-top:8px"><button data-op="back">‹ Zurück</button><button data-op="forward">Vor ›</button><button data-op="reload">Neu laden</button></div>
<div class="row" style="margin-top:8px"><button data-scroll="-300">▲ Hoch</button><button data-scroll="300">▼ Runter</button></div>
<div class="row" style="margin-top:8px"><button data-scroll-x="-300">◀ Links</button><button data-scroll-x="300">Rechts ▶</button></div>
</section>

<section class="card"><h2 id="texttitle">Text eingeben</h2>
<textarea id="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Erst im Bild das Eingabefeld antippen, dann hier tippen"></textarea>
<input id="secret" type="password" autocomplete="current-password" placeholder="Passwort" style="display:none">
<input id="structured" type="date" style="display:none" aria-label="Datum oder Zeit für das ausgewählte Feld">
<label class="check" id="mask-option"><input id="mask" type="checkbox"> Eingabe als Passwort verbergen</label>
<label class="check" id="replace-option"><input id="replace" type="checkbox"> Vorhandenen Text ersetzen</label>
<label class="check" id="enter-option"><input id="enter" type="checkbox"> Danach Enter senden</label>
<div class="row" style="margin-top:8px"><button id="sendtext" class="primary">Senden</button><button id="cleartext">Feld leeren</button></div>
<div class="row" style="margin-top:8px"><button data-key="Tab">Nächstes Feld</button><button data-key="Backspace">⌫</button><button data-key="Enter">Enter</button></div>
<div class="row" style="margin-top:8px"><button data-key="Home">Anfang</button><button data-key="End">Ende</button><button data-key="Delete">Entfernen</button><button data-key="Escape">Esc</button></div>
<div class="row" style="margin-top:8px"><button data-key="ArrowLeft">←</button><button data-key="ArrowUp">↑</button><button data-key="ArrowDown">↓</button><button data-key="ArrowRight">→</button></div>
<div class="row"><label class="check"><input id="mod-shift" type="checkbox"> Shift</label><label class="check"><input id="mod-ctrl" type="checkbox"> Ctrl</label><label class="check"><input id="mod-alt" type="checkbox"> Alt</label><label class="check"><input id="mod-meta" type="checkbox"> Meta</label></div>
<div class="row" style="margin-top:8px"><button data-shortcut="a">Alles markieren</button><button data-shortcut="c">Kopieren</button><button data-shortcut="v">Einfügen</button><button data-shortcut="x">Ausschneiden</button></div>
<p class="small">Kopieren und Einfügen verwenden die Zwischenablage des Browsers im Fahrzeug. Text vom Handy oben eingeben.</p>
</section>

<section class="card"><h2>Tabs</h2><div class="tabs" id="tabs"></div></section>
<p class="small">Die Verbindung bleibt nur im WLAN des Fahrzeugs bzw. Hotspots und endet nach 30 Minuten ohne Nutzung.</p>
</main><div id="toast"></div>
<script>
(function(){
var token=location.pathname.split('/')[2]||'',state={},lastFrame=0,busy=false,shotURL=null,lastPoint=null,frameBusy=false,frameETag='';
var $=function(id){return document.getElementById(id)};
function modifiers(ev){return ev?{ctrl:!!ev.ctrlKey,alt:!!ev.altKey,meta:!!ev.metaKey,shift:!!ev.shiftKey}:{ctrl:$('mod-ctrl').checked,alt:$('mod-alt').checked,meta:$('mod-meta').checked,shift:$('mod-shift').checked}}
function toast(t){var e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){e.classList.remove('show')},2600)}
function api(path,body){
  return fetch(path,{method:body?'POST':'GET',headers:Object.assign({'X-Remote-Token':token},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined,cache:'no-store'})
  .then(function(r){if(r.status===401){stop('Verbindung abgelaufen – am Browser einen neuen QR-Code anzeigen.');throw new Error('expired')}return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Fehler');return j})})
}
var stopped=false;
function stop(t){stopped=true;$('dot').className='dot off';$('status').textContent='Getrennt';toast(t)}
function act(m,ok){if(stopped)return Promise.resolve();return api('/api/action',m).then(function(j){if(j.state)render(j.state);if(ok)toast(ok);refreshFrame(true);return j}).catch(function(e){if(e.message!=='expired')toast(e.message);return {ok:false}})}
function render(s){
  state=s;var on=s.running&&s.foreground;
  $('dot').className='dot '+(on?'on':'off');
  $('status').textContent=!s.foreground?'Browser im iDrive öffnen':s.loading?'Lädt …':'Verbunden';
  $('page').innerHTML='';var b=document.createElement('b');b.textContent=s.title||'Neuer Tab';$('page').appendChild(b);
  if(s.url)$('page').appendChild(document.createTextNode('  '+s.url.replace(/^https:\\/\\//,'')));
  var pw=!!s.password||$('mask').checked,structured=['date','time','month','week','datetime-local'].indexOf(s.type)>=0;
  $('secret').style.display=pw&&!structured?'block':'none';$('text').style.display=!pw&&!structured?'block':'none';$('structured').style.display=structured?'block':'none';
  $('mask-option').style.display=structured||s.password?'none':'flex';$('replace-option').style.display=structured?'none':'flex';$('enter-option').style.display=structured?'none':'flex';
  if(structured&&$('structured').getAttribute('data-field-type')!==s.type){$('structured').setAttribute('data-field-type',s.type);$('structured').type=s.type;$('structured').step='any';$('structured').placeholder=s.type==='week'?'JJJJ-Www':s.type==='month'?'JJJJ-MM':s.type==='time'?'HH:MM':s.type==='date'?'JJJJ-MM-TT':'JJJJ-MM-TTTHH:MM';$('structured').value=''}
  $('texttitle').textContent=structured?'Datum oder Zeit eingeben':pw?'Passwort eingeben':s.editable?'Text für das ausgewählte Feld':'Text eingeben';
  var list=$('tabs');list.innerHTML='';(s.tabs||[]).forEach(function(t){var e=document.createElement('button');e.className='tab'+(t.active?' active':'');e.textContent=(t.title||t.url||'Neuer Tab');e.onclick=function(){act({op:'selectTab',id:t.id})};list.appendChild(e)});
  if(!(s.tabs||[]).length){var p=document.createElement('p');p.className='small';p.textContent='Keine offenen Tabs.';list.appendChild(p)}
}
function poll(){if(stopped)return;api('/api/state').then(render).catch(function(){}).then(function(){setTimeout(poll,1500)})}
function refreshFrame(soon){
  if(stopped||document.hidden||frameBusy)return;frameBusy=true;
  var headers={'X-Remote-Token':token};if(frameETag)headers['If-None-Match']=frameETag;
  fetch('/api/frame',{headers:headers,cache:'no-store'}).then(function(r){
    if(r.status===200)return r.blob().then(function(b){frameETag=r.headers.get('ETag')||'';var u=URL.createObjectURL(b);$('shot').src=u;if(shotURL)URL.revokeObjectURL(shotURL);shotURL=u;$('hint').style.display='none'});
    if(r.status===204){$('hint').style.display='flex'}
  }).catch(function(){}).then(function(){frameBusy=false});
  if(soon){setTimeout(function(){refreshFrame()},350);setTimeout(function(){refreshFrame()},1000)}
}
setInterval(function(){refreshFrame()},250);
document.addEventListener('visibilitychange',function(){if(!document.hidden){refreshFrame();}});
// The default gesture scrolls. Explicit drag mode sends native held-button
// events for text selection, sliders, maps and authored draggable controls.
var screen=$('screen'),start=null;
function pos(ev){var img=$('shot'),r=img.getBoundingClientRect(),nw=img.naturalWidth||1,nh=img.naturalHeight||1,s=Math.min(r.width/nw,r.height/nh),w=nw*s,h=nh*s,ox=r.left+(r.width-w)/2,oy=r.top+(r.height-h)/2;
  return {x:(ev.clientX-ox)/w,y:(ev.clientY-oy)/h,px:ev.clientX-r.left,py:ev.clientY-r.top,h:h}}
function clamped(p){return{x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))}}
screen.addEventListener('contextmenu',function(ev){ev.preventDefault()});
screen.addEventListener('dragstart',function(ev){ev.preventDefault()});
screen.addEventListener('pointerdown',function(ev){if(!state.running||!state.foreground||!$('shot').naturalWidth)return;start=pos(ev);start.last=start.py;start.lastX=start.px;start.moved=false;start.mode=$('pointermode').value;start.points=[clamped(start)];lastPoint=clamped(start);screen.setPointerCapture(ev.pointerId)});
screen.addEventListener('pointermove',function(ev){if(!start)return;var p=pos(ev);if(Math.abs(p.py-start.py)>10||Math.abs(p.px-start.px)>10)start.moved=true;
  if(start.mode==='drag'){if(start.points.length<63)start.points.push(clamped(p));return}
  if(start.mode==='scroll'&&start.moved){var dy=start.last-p.py,dx=start.lastX-p.px;if(Math.abs(dy)>=16||Math.abs(dx)>=16){start.last=p.py;start.lastX=p.px;var vh=(state.viewport&&state.viewport.height)||384;act({op:'scroll',delta:Math.round(dy*vh/p.h),deltaX:Math.round(dx*vh/p.h),x:lastPoint.x,y:lastPoint.y,modifiers:modifiers()})}}});
screen.addEventListener('pointerup',function(ev){if(!start)return;var p=pos(ev),s=start;start=null;
  if(s.mode==='drag'&&s.moved){s.points.push(clamped(p));act({op:'drag',points:s.points,options:{modifiers:modifiers()}});return}
  if(s.mode==='scroll'&&s.moved){var vh=(state.viewport&&state.viewport.height)||384,dy=Math.round((s.last-p.py)*vh/p.h),dx=Math.round((s.lastX-p.px)*vh/p.h);if(dx||dy)act({op:'scroll',delta:dy,deltaX:dx,x:lastPoint.x,y:lastPoint.y,modifiers:modifiers()});return}
  if(!s.moved&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1){var d=document.createElement('div');d.className='ripple';d.style.left=p.px+'px';d.style.top=p.py+'px';screen.appendChild(d);setTimeout(function(){d.remove()},500);
    act({op:'tap',x:p.x,y:p.y,options:{button:s.mode==='context'?'right':'left',clickCount:s.mode==='double'?2:1,modifiers:modifiers()}}).then(function(){setTimeout(function(){api('/api/state').then(render).catch(function(){})},250)})}});
screen.addEventListener('pointercancel',function(){start=null});
screen.addEventListener('keydown',function(ev){if(ev.key==='Unidentified')return;ev.preventDefault();act({op:'key',key:ev.key,modifiers:modifiers(ev)})});
screen.addEventListener('pointermove',function(ev){if(start||ev.pointerType!=='mouse')return;var p=pos(ev);if(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1){lastPoint=clamped(p);clearTimeout(screen.hoverTimer);screen.hoverTimer=setTimeout(function(){act({op:'hover',x:p.x,y:p.y,modifiers:modifiers()})},40)}});
function openURL(newTab){var v=$('url').value.trim();if(!v)return toast('Bitte eine Adresse eingeben');act({op:'open',url:v,newTab:newTab},'Im Fahrzeug geöffnet').then(function(j){if(j&&j.ok)$('url').value=''})}
$('open').onclick=function(){openURL(false)};$('newtab').onclick=function(){openURL(true)};
$('url').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();openURL(false)}});
$('mask').onchange=function(){if($('mask').checked){$('secret').value=$('text').value;$('text').value=''}else if(!state.password){$('text').value=$('secret').value;$('secret').value=''}render(state)};
$('sendtext').onclick=function(){var structured=['date','time','month','week','datetime-local'].indexOf(state.type)>=0,f=structured?$('structured'):state.password||$('mask').checked?$('secret'):$('text'),v=f.value;if(!v)return toast('Bitte einen Wert eingeben');var message=structured?{op:'fillStructured',value:v}:{op:'text',text:v,replace:$('replace').checked,enter:$('enter').checked};act(message,state.password||$('mask').checked?'Passwort übertragen':'Eingabe übertragen').then(function(j){if(j&&j.ok)f.value=''})};
$('cleartext').onclick=function(){var structured=['date','time','month','week','datetime-local'].indexOf(state.type)>=0;act(structured?{op:'fillStructured',value:''}:{op:'text',text:'',replace:true},'Feld geleert')};
Array.prototype.forEach.call(document.querySelectorAll('[data-op]'),function(b){b.onclick=function(){act({op:b.getAttribute('data-op')})}});
Array.prototype.forEach.call(document.querySelectorAll('[data-key]'),function(b){b.onclick=function(){act({op:'key',key:b.getAttribute('data-key'),modifiers:modifiers()})}});
Array.prototype.forEach.call(document.querySelectorAll('[data-shortcut]'),function(b){b.onclick=function(){act({op:'key',key:b.getAttribute('data-shortcut'),modifiers:{ctrl:true}})}});
Array.prototype.forEach.call(document.querySelectorAll('[data-scroll],[data-scroll-x]'),function(b){b.onclick=function(){var m={op:'scroll',delta:Number(b.getAttribute('data-scroll')||0),deltaX:Number(b.getAttribute('data-scroll-x')||0),modifiers:modifiers()};if(lastPoint){m.x=lastPoint.x;m.y=lastPoint.y}act(m)}});
poll();refreshFrame();
})();
</script></body></html>`;
module.exports={html:()=>require('./remote_features').inject(HTML)};
