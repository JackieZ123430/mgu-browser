'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
// Chromium's private ALSA writes PCM only. This child uses the firmware's
// loader/libasound/SmartX plugin, keeping their libc instances separate.
class VehicleAudioBridge {
    constructor(options){this.options=options;this.child=null;this.ready=false;this.open=false;this.error='not-started';this.pending=null;this.closing=Promise.resolve();this.routeQueue=Promise.resolve();}
    status(enabled){return {enabled:enabled!==false,configured:true,route:'mgu-smartx',routeAvailable:enabled!==false&&this.open,prepared:this.ready,
        bridgeReady:this.ready,reason:enabled===false?'media-disabled':this.error||(this.open?'smartx-device-open':'awaiting-audio-route'),speakerVerified:false,testRequired:true};}
    async start(profile){
        await this.stop();this.error='audio-helper-starting';
        const dir=path.join(profile,'mgu-audio');
        try{fs.mkdirSync(dir,0o700);}catch(e){
            if(e.code!=='EEXIST')throw e;
            const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw new Error('Unsicherer Audio-Arbeitsordner');
            // Only our two known, ephemeral files may survive an earlier run.
            // Website storage and arbitrary profile files are never removed.
            const names=fs.readdirSync(dir);if(names.some(n=>n!=='pcm.fifo'&&n!=='alsa.conf'))throw new Error('Unerwartete Audio-Arbeitsdateien');
            for(const name of names){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isSymbolicLink()||s.uid!==process.getuid()||s.nlink!==1||(!s.isFile()&&!s.isFIFO()))throw new Error('Unsichere Audio-Arbeitsdatei');}
            names.forEach(name=>fs.unlinkSync(path.join(dir,name)));
        }
        const fifo=path.join(dir,'pcm.fifo'),config=path.join(dir,'alsa.conf');
        fs.writeFileSync(config,'pcm.null { type null }\npcm.mgu_file { type file slave.pcm null file "'+fifo+'" format raw }\npcm.mgu_browser { type plug slave { pcm mgu_file rate 48000 channels 2 format S16_LE } }\n',{mode:0o600,flag:'wx'});
        const args=['--fifo',fifo,'--device','plug:smartx:CarLifeMedia_CF_48_STEREO','--lock','/run/smartx/smartx_CarLifeMedia_CF_48_STEREO_p.lock','--lock-gid',String(this.options.gid)];
        // Fixtures use a private ALSA file sink; this option is never IPC input.
        if(this.options.fixture){args.splice(4);args[3]=this.options.fixture.device;args.push('--fixture');}
        const command=this.options.loader||this.options.binary;
        if(this.options.loader)args.unshift(this.options.binary);
        const child=this.child=cp.spawn(command,args,{stdio:['pipe','pipe','ignore'],env:Object.assign({},process.env,this.options.fixture?{MGU_EMULATOR_MODE:'1'}:{},this.options.helperEnv||{})});
        child.stdin.on('error',()=>{if(this.child===child)this.fail('audio-helper-pipe');});
        let buffer='';child.stdout.on('data',chunk=>{if(this.child!==child)return;buffer+=chunk.toString('ascii');if(buffer.length>4096){this.fail('audio-helper-protocol');return;}let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);this.message(line);}});
        child.once('error',()=>{if(this.child===child)this.fail('audio-helper-unavailable');});
        child.once('exit',()=>{if(this.child===child){this.child=null;this.ready=false;this.open=false;this.fail('audio-helper-exited');}});
        try{await this.wait('READY',2000);this.error='';return {args:['--alsa-output-device=mgu_browser'],env:{ALSA_CONFIG_PATH:config,PULSE_SERVER:'unix:'+path.join(dir,'no-pulse')}};}
        catch(e){await this.stop();throw e;}
    }
    message(line){
        if(line==='READY'){this.ready=true;this.error='';}
        else if(line==='OPEN'){this.open=true;this.error='';}
        else if(line==='CLOSED'){this.open=false;}
        else if(/^ERROR [a-z0-9-]+$/.test(line)){this.fail(line.slice(6));return;}
        else if(/^STATS \d+ \d+ \d+$/.test(line)){const n=line.split(' ').slice(1).map(Number);this.stats={bytes:n[0],dropped:n[1],errors:n[2]};return;}
        else {this.fail('audio-helper-protocol');return;}
        if(this.pending&&this.pending.event===line){const pending=this.pending;this.pending=null;clearTimeout(pending.timer);pending.resolve();}
    }
    wait(event,timeout){
        if(this.pending)return Promise.reject(new Error('Audioausgabe wird bereits umgeschaltet'));
        return new Promise((resolve,reject)=>{const pending={event,resolve,reject};this.pending=pending;pending.timer=setTimeout(()=>{if(this.pending===pending){this.pending=null;this.error='audio-helper-timeout';reject(new Error('Audioausgabe antwortet nicht'));this.stop();}},timeout);});
    }
    fail(code){this.error=code;this.open=false;if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(new Error('Fahrzeug-Audio nicht verfügbar ('+code+')'));}}
    route(enabled){
        const child=this.child;
        const work=this.routeQueue.catch(()=>{}).then(async()=>{
            if(!child||this.child!==child||!this.ready){
                if(enabled)throw new Error('Fahrzeug-Audio ist nicht vorbereitet');
                // A failed or exited writer must not prevent releasing our
                // AudioManager connection. Never stop a replacement session.
                if(child&&this.child===child)await this.stop();
                return this.status();
            }
            if(enabled===this.open)return this.status();
            const response=this.wait(enabled?'OPEN':'CLOSED',2500);
            try{child.stdin.write(enabled?'1\n':'0\n');}catch(e){this.fail('audio-helper-pipe');}
            await response;return this.status();
        });
        this.routeQueue=work.catch(()=>{});return work;
    }
    stop(){
        const child=this.child;this.child=null;this.ready=false;this.open=false;
        if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(new Error('Audioausgabe beendet'));}
        if(!child)return this.closing;
        this.closing=new Promise(resolve=>{let done=false,kill;const finish=()=>{if(done)return;done=true;clearTimeout(kill);resolve();};child.once('close',finish);child.once('error',finish);try{child.stdin.end('q\n');child.kill('SIGTERM');}catch(e){}kill=setTimeout(()=>{try{child.kill('SIGKILL');}catch(e){}},300);setTimeout(finish,1000);});
        return this.closing;
    }
}
module.exports=VehicleAudioBridge;
