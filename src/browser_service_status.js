'use strict';
// Explains why the browser backend cannot be reached, from the status the
// runtime launcher writes. Read-only; '' when there is nothing to report.
const fs=require('fs');
const STATUS='/run/mgu-browser/status.json';
function explain(io){
    io=io||fs;let s=null;
    try{const text=io.readFileSync(STATUS,'utf8');if(text.length<65536)s=JSON.parse(text);}catch(e){s=null;}
    if(!s||typeof s.state!=='string'){
        try{io.statSync('/var/opt/mgu-browser/current');}catch(e){return 'Browser-Laufzeit fehlt: im Store "Browser" über die Quelle "Releases" installieren.';}
        return 'Browser-Dienst startet … (noch kein Status)';
    }
    switch(s.state){
        case 'setup_failed':return 'Browser-Dienst kann nicht starten: '+String(s.error||'').slice(0,90);
        case 'waiting_for_app':return 'Browser-Dienst wartet auf die App-Registrierung. Headunit einmal neu starten.';
        case 'starting':return 'Browser-Dienst startet …';
        case 'backend_launch_failed':return 'Browser-Dienst konnte nicht starten: '+String(s.error||'').slice(0,90);
        case 'backend_exited':return 'Browser-Dienst beendet (Code '+(s.signal||s.code)+') – Neustart läuft …';
        case 'stopped':return 'Browser-Dienst ist angehalten. Headunit einmal neu starten.';
        case 'running':return 'Browser-Dienst läuft, App verbindet …';
    }
    return '';
}
module.exports={explain,STATUS};
