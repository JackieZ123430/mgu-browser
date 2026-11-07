'use strict';
// Explains why the browser backend cannot be reached, from the status the
// runtime launcher writes. Read-only; '' when there is nothing to report.
const fs=require('fs');
const STATUS='/run/mgu-browser/status.json';
function explain(io){
    io=io||fs;let s=null;
    try{const text=io.readFileSync(STATUS,'utf8');if(text.length<4096)s=JSON.parse(text);}catch(e){s=null;}
    if(!s||typeof s.state!=='string'){
        try{io.statSync('/var/opt/mgu-browser/current');}catch(e){return 'Browser-Laufzeit fehlt: im Store "Browser" über die Quelle "Releases" installieren.';}
        return 'Browser-Dienst startet … (noch kein Status)';
    }
    const updated=Date.parse(s.at),age=Date.now()-updated;
    if(!Number.isFinite(updated)||age>90000||age< -30000)return 'Browser-Dienststatus ist veraltet. Laufzeit im Store prüfen.';
    switch(s.state){
        case 'preparing':return 'Browser-Dienst bereitet die Laufzeit vor …';
        case 'setup_failed':return 'Browser-Dienst kann die Laufzeit nicht vorbereiten. Dateirechte und Installation prüfen; neuer Versuch folgt.';
        case 'waiting_for_app':return 'Browser-Dienst wartet auf die App-Registrierung. Headunit einmal neu starten.';
        case 'starting':return 'Browser-Dienst startet …';
        case 'backend_launch_failed':return 'Browser-Dienst konnte den Backend-Prozess nicht starten. Laufzeit im Store prüfen.';
        case 'backend_exited':{
            const signal=['SIGTERM','SIGINT','SIGKILL','SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGFPE','SIGHUP'].indexOf(s.signal)>=0?s.signal:null;
            const code=Number.isInteger(s.code)&&s.code>=0&&s.code<=255?s.code:'unbekannt';
            return 'Browser-Dienst beendet (Code '+(signal||code)+') – Neustart läuft …';
        }
        case 'stopped':return 'Browser-Dienst ist angehalten. Headunit einmal neu starten.';
        case 'running':return 'Browser-Dienst läuft, App verbindet …';
    }
    return '';
}
module.exports={explain,STATUS};
