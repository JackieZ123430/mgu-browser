'use strict';
// Website text and filenames are inserted only through textContent. The page
// shares the existing paired session and never sends host filesystem paths.
const section=`
<section class="card" id="web-auth" hidden><h2 id="web-auth-title">Anmeldung der Webseite</h2><p id="web-auth-origin" class="small"></p><p id="web-auth-realm" style="overflow-wrap:anywhere"></p><input id="web-auth-user" autocomplete="username" placeholder="Benutzername"><input id="web-auth-password" type="password" autocomplete="current-password" placeholder="Passwort" style="margin-top:8px"><div class="row" style="margin-top:8px"><button id="web-auth-cancel">Abbrechen</button><button id="web-auth-submit" class="primary">Anmelden</button></div></section>
<section class="card" id="web-dialog" hidden><h2>Website-Dialog</h2><p id="web-dialog-origin" class="small"></p><p id="web-dialog-message" style="white-space:pre-wrap;overflow-wrap:anywhere"></p><input id="web-dialog-answer" autocomplete="off"><div class="row" style="margin-top:8px"><button id="web-dialog-no">Abbrechen</button><button id="web-dialog-yes" class="primary">OK</button></div></section>
<section class="card" id="web-permission" hidden><h2>Website-Berechtigung</h2><p id="web-permission-origin" class="small"></p><p id="web-permission-names"></p><div class="row"><button id="web-permission-no">Blockieren</button><button id="web-permission-yes" class="primary">Erlauben</button></div></section>
<section class="card" id="web-chooser" hidden><h2>Datei an die Webseite senden</h2><p id="web-chooser-origin" class="small"></p><input id="web-upload" type="file"><p id="web-upload-limit" class="small"></p><button id="web-upload-stage">Dateien vom Handy uebertragen</button><div id="web-staged"></div><div class="row" style="margin-top:8px"><button id="web-chooser-cancel">Abbrechen</button><button id="web-chooser-send" class="primary">Auswahl an Webseite senden</button></div><p class="small">Die Webseite erhaelt die Dateien erst nach dem Senden der Auswahl.</p></section>
<section class="card"><h2>Auf der Seite suchen</h2><input id="web-find-text" maxlength="256" autocomplete="off" placeholder="Suchtext"><label class="check"><input id="web-find-case" type="checkbox"> Gross-/Kleinschreibung beachten</label><div class="row" style="margin-top:8px"><button id="web-find-prev">Vorheriger</button><button id="web-find-next" class="primary">Suchen / Naechster</button><button id="web-find-close">Schliessen</button></div><p id="web-find-status" class="small"></p></section>
<section class="card"><h2>Downloads</h2><div id="web-downloads"></div></section>
<section class="card"><h2>Website-Berechtigungen</h2><button id="web-permissions-load">Berechtigungen der aktuellen Webseite</button><div id="web-permissions-settings"></div></section>
<p id="web-features-note" role="status" class="small" style="overflow-wrap:anywhere"></p>
`;
const script=`<script>
(function(){
var token=location.pathname.split('/')[2]||'',current={},permissions=null,chooserId='',selected={},staged={},uploading=false,authId='',authSending=false,revealed='';
var $=function(id){return document.getElementById(id)},names={geolocation:'Standort',notifications:'Benachrichtigungen',camera:'Kamera',microphone:'Mikrofon','clipboard-read':'Zwischenablage lesen','clipboard-write':'Zwischenablage schreiben'};
function note(value){$('web-features-note').textContent=value||''}
function request(path,options){options=options||{};options.headers=Object.assign({'X-Remote-Token':token},options.headers||{});options.cache='no-store';return fetch(path,options).then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||'Aktion fehlgeschlagen');return data})})}
function refresh(){return request('/api/state').then(render)}
function action(message){return request('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)}).then(function(result){note('');if(result.state)render(result.state);return result}).catch(function(error){note(error.message);throw error})}
function run(message){action(message).catch(function(){})}
function button(label,handler){var element=document.createElement('button');element.textContent=label;element.onclick=handler;return element}
function text(value,parent){var element=document.createElement('p');element.className='small';element.textContent=value;parent.appendChild(element);return element}
function render(state){
  current=state||{};
  var auth=current.auth;$('web-auth').hidden=!auth;
  if(auth){if(authId!==auth.id){authId=auth.id;$('web-auth-user').value='';$('web-auth-password').value=''}$('web-auth-title').textContent=auth.isProxy?'Proxy-Anmeldung':'Anmeldung der Webseite';$('web-auth-origin').textContent=auth.origin||'';$('web-auth-realm').textContent=auth.realm||'';$('web-auth-user').disabled=$('web-auth-password').disabled=$('web-auth-submit').disabled=authSending||!!auth.busy;$('web-auth-submit').onclick=function(){if(authSending)return;authSending=true;var password=$('web-auth-password').value;$('web-auth-password').value='';action({op:'authReply',authId:auth.id,username:$('web-auth-user').value,password:password,cancel:false}).catch(function(){}).then(function(){authSending=false;refresh().catch(function(){})});render(current)};$('web-auth-cancel').onclick=function(){run({op:'authReply',authId:auth.id,cancel:true})}}else{authId='';$('web-auth-user').value='';$('web-auth-password').value=''}
  var dialog=current.dialog;$('web-dialog').hidden=!dialog;
  if(dialog){$('web-dialog-origin').textContent=dialog.origin||'';$('web-dialog-message').textContent=dialog.message||'';var input=$('web-dialog-answer');if(input.dataset.dialog!==dialog.id){input.dataset.dialog=dialog.id;input.value=dialog.defaultPrompt||''}input.hidden=dialog.type!=='prompt';$('web-dialog-no').hidden=dialog.type==='alert';$('web-dialog-yes').textContent=dialog.type==='beforeunload'?'Verlassen':'OK';$('web-dialog-yes').onclick=function(){run({op:'dialogReply',dialogId:dialog.id,accept:true,promptText:input.value})};$('web-dialog-no').onclick=function(){run({op:'dialogReply',dialogId:dialog.id,accept:false})}}
  var permission=current.permission;$('web-permission').hidden=!permission;
  if(permission){$('web-permission-origin').textContent=permission.origin+(permission.embeddingOrigin!==permission.origin?' in '+permission.embeddingOrigin:'');$('web-permission-names').textContent=(permission.permissions||[]).map(function(name){return names[name]||name}).join(', ');$('web-permission-yes').onclick=function(){run({op:'permissionAnswer',permissionId:permission.id,setting:'granted'})};$('web-permission-no').onclick=function(){run({op:'permissionAnswer',permissionId:permission.id,setting:'denied'})}}
  var files=current.files||{},chooser=files.chooser;$('web-chooser').hidden=!chooser;
  if(chooser){
    if(chooserId!==chooser.id){chooserId=chooser.id;selected={};staged={};$('web-upload').value=''}
    $('web-chooser-origin').textContent=chooser.origin||'';$('web-upload').accept=Array.isArray(chooser.accept)?chooser.accept.join(','):chooser.accept||'';$('web-upload').multiple=!!chooser.multiple;
    $('web-upload-limit').textContent='Maximal '+Math.round(((files.limits||{}).upload||0)/1048576)+' MiB pro Datei.';
    var list=$('web-staged');list.textContent='';(chooser.files||[]).forEach(function(file){if(!staged[file.id]){if(!chooser.multiple)selected={};selected[file.id]=true;staged[file.id]=true}var label=document.createElement('label');label.className='check';var check=document.createElement('input');check.type=chooser.multiple?'checkbox':'radio';check.name='web-staged-file';check.checked=!!selected[file.id];check.onchange=function(){if(!chooser.multiple)selected={};selected[file.id]=check.checked};label.appendChild(check);label.appendChild(document.createTextNode(file.name+' ('+Math.ceil(file.size/1024)+' KiB)'));list.appendChild(label)});
    $('web-chooser-send').disabled=uploading||!(chooser.files||[]).length;
    $('web-chooser-send').onclick=function(){var ids=(chooser.files||[]).filter(function(file){return selected[file.id]}).map(function(file){return file.id});run({op:'chooseFiles',chooserId:chooser.id,stagedIds:ids})};
    $('web-chooser-cancel').onclick=function(){run({op:'cancelFileChooser',chooserId:chooser.id})};
  }else{chooserId='';selected={};staged={}}
  var downloads=$('web-downloads');downloads.textContent='';if(!(files.downloads||[]).length)text('Noch keine Downloads.',downloads);
  (files.downloads||[]).forEach(function(file){var row=document.createElement('div');row.className='row';text(file.name+' · '+Math.ceil((file.received||file.size||0)/1024)+' KiB · '+file.state,row);if(file.state==='completed'){var link=document.createElement('a');link.textContent='Herunterladen';link.href='/api/download?id='+encodeURIComponent(file.id)+'&t='+encodeURIComponent(token);link.style.color='var(--accent)';link.setAttribute('download',file.name);row.appendChild(link)}row.appendChild(button(file.state==='downloading'?'Abbrechen':'Loeschen',function(){run({op:file.state==='downloading'?'cancelDownload':'deleteDownload',downloadId:file.id})}));downloads.appendChild(row)});
  if(files.error)note(files.error);
  var found=current.find;$('web-find-status').textContent=found&&found.active?(found.found?'Treffer gefunden.':'Kein Treffer.'):'Suche ist geschlossen.';
  var pending=dialog?{key:'dialog:'+dialog.id,node:$('web-dialog')}:auth?{key:'auth:'+auth.id,node:$('web-auth')}:permission?{key:'permission:'+permission.id,node:$('web-permission')}:chooser?{key:'chooser:'+chooser.id,node:$('web-chooser')}:null,key=pending?pending.key:'';
  if(key!==revealed){var previous=revealed;revealed=key;var target=pending?pending.node:previous?$('screen'):null;if(target&&!target.hidden)target.scrollIntoView({behavior:'auto',block:'start'})}
  if(permissions){try{if(new URL(current.url).origin!==permissions.origin){permissions=null;renderPermissions()}}catch(ignore){permissions=null;renderPermissions()}}
}
function find(backwards){run({op:'findText',query:$('web-find-text').value,options:{backwards:backwards,caseSensitive:$('web-find-case').checked}})}
$('web-find-next').onclick=function(){find(false)};$('web-find-prev').onclick=function(){find(true)};$('web-find-close').onclick=function(){run({op:'clearFind'})};$('web-find-text').addEventListener('keydown',function(event){if(event.key==='Enter'){event.preventDefault();find(event.shiftKey)}});
function renderPermissions(){var box=$('web-permissions-settings');box.textContent='';if(!permissions)return;var data=permissions;text(data.origin||data.reason||'',box);(data.permissions||[]).forEach(function(item){var row=document.createElement('div');row.className='row';text((names[item.name]||item.name)+' · '+item.state,row);[['Erlauben','granted'],['Blockieren','denied'],['Fragen','prompt']].forEach(function(choice){var control=button(choice[0],function(){action({op:'permissionSet',name:item.name,setting:choice[1],expectedOrigin:data.origin}).then(function(result){permissions=result.permissions;renderPermissions()}).catch(function(){})});control.disabled=!data.available||item.state==='unsupported';row.appendChild(control)});box.appendChild(row)})}
$('web-permissions-load').onclick=function(){action({op:'permissionStatus'}).then(function(result){permissions=result.permissions;renderPermissions()}).catch(function(){})};
$('web-upload-stage').onclick=function(){
  var chooser=(current.files||{}).chooser,files=Array.prototype.slice.call($('web-upload').files||[]);if(!chooser||!files.length||uploading)return;
  var id=chooser.id,limit=((current.files||{}).limits||{}).upload||0;if(files.some(function(file){return file.size>limit})){note('Eine Datei ist groesser als die erlaubte Dateigroesse.');return}
  uploading=true;$('web-upload-stage').disabled=true;
  files.reduce(function(previous,file){return previous.then(function(){if(!current.files||!current.files.chooser||current.files.chooser.id!==id)throw new Error('Dateiauswahl ist abgelaufen');return request('/api/upload?chooser='+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file}).then(function(result){if(result.state)render(result.state)})})},Promise.resolve()).then(function(){note('Dateien uebertragen. Jetzt die Auswahl an die Webseite senden.');$('web-upload').value=''},function(error){note(error.message)}).then(function(){uploading=false;$('web-upload-stage').disabled=false;refresh().catch(function(){})})
};
window.mguFeaturesRender=render;
refresh().catch(function(error){note(error.message)});
})();
</script>`;
function inject(html){
    if(!html.includes('</main>')||!html.includes('</body>')||!html.includes('state=s;'))throw new Error('Phone template integration changed');
    return html.replace('</main>',section+'</main>').replace('</body>',script+'</body>').replace('state=s;','state=s;if(window.mguFeaturesRender)window.mguFeaturesRender(s);');
}
module.exports={inject};
