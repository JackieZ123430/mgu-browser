'use strict';
const fs=require('fs');

// Inspect the backend's own permissions. A reachable Linux output is only a
// prerequisite: it does not prove routing through BMW's AVB speaker service.
function output(env,io){
    io=io||fs;env=env||process.env;
    const device=env.MGU_BROWSER_ALSA_DEVICE||'';
    if(device&&!/^[a-zA-Z0-9][a-zA-Z0-9_,:.=-]{0,127}$/.test(device))throw new Error('Ungültiges ALSA-Ausgabegerät');
    let lastError='';
    const accessible=(file,socket)=>{try{const st=io.statSync(file);if(socket?!st.isSocket():!st.isCharacterDevice())return false;io.accessSync(file,fs.constants.R_OK|fs.constants.W_OK);return true;}catch(e){return false;}};
    return {
        args:device?['--alsa-output-device='+device]:[],
        reset(){lastError='';},
        observe(text){
            // Fixed codes only; never return page text, paths or server names.
            if(/(?:alsa|pulse|audio).*(?:failed|error)|(?:failed|error).*(?:alsa|pulse|audio)/i.test(String(text)))lastError='audio-stream-failed';
        },
        status(enabled){
            const pulse=env.PULSE_SERVER||'',uid=typeof process.getuid==='function'?process.getuid():0,socket=pulse.indexOf('unix:')===0?pulse.slice(5):!pulse?(env.XDG_RUNTIME_DIR||('/run/user/'+uid))+'/pulse/native':'';
            let alsa=false;
            try{alsa=io.readdirSync('/dev/snd').filter(n=>/^pcmC\d+D\d+p$/.test(n)).slice(0,32).some(n=>accessible('/dev/snd/'+n,false));}catch(e){}
            const pulseAvailable=!!socket&&accessible(socket,true),route=device?'alsa':pulseAvailable||pulse?'pulse':alsa?'alsa':'none';
            // Custom ALSA PCMs may use network plugins and cannot be inferred
            // from /dev/snd; their success must be checked with explicit playback.
            const direct=device&&/^(?:plug)?hw:(\d+),(\d+)$/.exec(device);
            const routeAvailable=route==='pulse'?pulseAvailable:device?!!direct&&accessible('/dev/snd/pcmC'+direct[1]+'D'+direct[2]+'p',false):alsa;
            const reason=enabled===false?'media-disabled':lastError||(routeAvailable?(route==='pulse'?'pulse-socket-accessible':'alsa-playback-accessible'):device||pulse?'configured-route-unverified':'no-accessible-output');
            return {enabled:enabled!==false,configured:!!device||!!pulse,route,routeAvailable:enabled!==false&&routeAvailable,
                reason,
                speakerVerified:false,testRequired:true};
        }
    };
}

// The tone runs only after a deliberate IPC action with a Chromium user gesture.
// Its graph is short, quiet and closed even when resuming the device fails.
const tone='(async()=>{const A=window.AudioContext||window.webkitAudioContext;if(!A)throw new Error("AudioContext unavailable");const c=new A();let timer;try{await Promise.race([c.resume(),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error("Audio resume timeout")),1800))]);clearTimeout(timer);if(c.state!=="running")throw new Error("Audio not running");const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.frequency.value=440;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.03);g.gain.setValueAtTime(.035,t+.95);g.gain.linearRampToValueAtTime(0,t+1);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+1);await new Promise(resolve=>setTimeout(resolve,1100));return JSON.stringify({generated:true,durationMs:1000,audibleVerified:false});}finally{clearTimeout(timer);await c.close();}})()';
const methods={
    audioStatus(){return this.vehicleAudio?this.vehicleAudio.status(!this.options.mediaDisabled):this.audio.status(!this.options.mediaDisabled);},
    async audioRoute(enabled){
        if(typeof enabled!=='boolean')throw new Error('Ungültiger Audiozustand');
        if(enabled){this.requireAllowed();if(this.options.mediaDisabled)throw new Error('Medien sind deaktiviert');}
        if(!this.vehicleAudio)throw new Error('Fahrzeug-Audio ist in dieser Laufzeit nicht verfügbar');
        return this.vehicleAudio.route(enabled);
    },
    async audioTest(){
        this.requireAllowed();if(this.options.mediaDisabled)throw new Error('Medien sind deaktiviert');
        if(this.audioTestPending)throw new Error('Testton läuft bereits');
        const context=this.mediaContext();if(!this.session)throw new Error('Zuerst eine Webseite öffnen');
        this.audioTestPending=true;
        try{const r=await context.send('Runtime.evaluate',{expression:tone,awaitPromise:true,returnByValue:true,userGesture:true},5000);
            if(r.exceptionDetails||!r.result||typeof r.result.value!=='string')throw new Error('Testton konnte nicht erzeugt werden. Audio-Ausgabe prüfen.');
            return JSON.parse(r.result.value);
        }finally{this.audioTestPending=false;}
    }
};
module.exports={output,methods,tone};
