'use strict';
const nativeBridge=require('./native_image_bridge');nativeBridge.install();
const mgu=require('./kit/mgu'),{setImage}=require('./kit/record');
require('./browser_fonts').install(require('./kit/fonts'),require('path').join(__dirname,'kit/fonts'));
const Gate=require('./visibility_gate'),Browser=require('./browser_client'),Controller=require('./browser_controller');
const {BrowserState,inputURL}=require('./browser_state'),icon=require('./browser_icons'),installLayout=require('./browser_layout');
const {BrowserLocale}=require('./browser_locale');
const VehicleAudio=require('./browser_vehicle_audio');
const shutdown=require('./browser_shutdown');
const QR=require('./qr_code');
const BrowserChrome=require('./browser_chrome');
const W=1600,H=520,IMAGE=700,QR_IMAGE=701,BAR=58,TABS=42,SIDE=600;
const C={bg:'#11151b',bar:'#181d25',field:'#252d38',panel:'#1b222c',line:'#343e4c',text:'#f4f6f9',muted:'#a2afc0',accent:'#78bfff'};
const displayURL=value=>String(value||'').replace(/^https:\/\//,'').split(/[?#]/)[0];
mgu.run({async start(ctx){
    const {ui,log}=ctx,store=new BrowserState(ctx.dataDir),gate=new Gate();
    installLayout(ctx.display);
    let frame=null,page=null,currentURL='',title='',webMode=false,landing=true,panel=null,keyboard=null,draft='',replaceDraft=false;
    let keyMode='abc',upper=false,starting=false,loading=false,canBack=false,canForward=false,serviceReady=false,pendingLaunch=true;
    let closing=false,wasVisible=false,reading=false,lastAction=Date.now(),toast='',toastUntil=0,resized='',resizeRetry=0,listTab='frequent',listOffset=0;
    let editable=false,password=false,inputType='',multiline=false,tipLabels={};
    let findBar=false,findState={active:false,query:'',found:false};
    let tabs=[],activeTab='',wifiState={},wifiSSID='',wifiPassword='',wifiBusy=false,wifiInternet=null,wifiPoll=0;
    let media={fullscreen:false},mediaIndex=1,mediaUntil=0;
    let mediaCaps=null,mediaBusy=false,audioBusy=false;
    let vehicleAudioStatus={reason:'idle'},audioWanted=false,audioSync=null,audioNote='',audioRetry=0,audioKnownUntil=0,audioUnknownTimer=null;
    let wifiNetworks=[],wifiScanning=false,wifiScanError='',wifiOffset=0;
    let remoteState=null,remoteBusy=false,remoteQR='',remotePoll=0;
    let privacyState=null,privacyBusy=false,logins=[],loginOffset=0,privacyConfirmation=null,vaultSetup='',storageIssue='';
    const videoActions=['back','toggle','forward','mute','exit'];
    const browser=new Browser({gate});
    const locale=new BrowserLocale(ctx.app,language=>{if(serviceReady&&gate.check().allowed)safe(()=>browser.setLocale(language));});
    const ascii=s=>locale.text(s);
    const makeCanvas=ctx.canvas.bind(ctx);
    ctx.canvas=(w,h)=>{
        const canvas=makeCanvas(w,h);
        if(!canvas.browserTextLocalized){
            const text=canvas.text.bind(canvas);
            canvas.text=(value,x,y,size,color,options)=>text(options&&options.literal?String(value):locale.text(value),x,y,size,color,options);
            canvas.browserTextLocalized=true;
        }
        return canvas;
    };
    const activity=()=>{lastAction=Date.now();};
    const note=message=>{toast=message;toastUntil=Date.now()+3300;};
    store.onError=note;
    const safe=task=>Promise.resolve().then(typeof task==='function'?task:()=>task).catch(e=>{note(e.message);log.warn(e.message);});
    let promptId='',keyboardAuthId='';
    const chrome=new BrowserChrome({browser,button,text:ascii,close:()=>{panel='settings';},openRemote:()=>openRemote(false),
        editPrompt:value=>{keyboard='browser-prompt';draft=value;replaceDraft=true;keyMode='abc';upper=false;webMode=false;activity();if(ctx.display)ctx.display.focusKey='tgt:key-0-0';},
        editAuth:(id,field,value)=>{keyboardAuthId=id;keyboard='browser-auth-'+field;draft=value;replaceDraft=true;keyMode='abc';upper=false;webMode=false;activity();if(ctx.display)ctx.display.focusKey='tgt:key-0-0';},
        changed:()=>{
            const next=chrome.dialog&&chrome.dialog.id||chrome.auth&&chrome.auth.id||chrome.permission()&&chrome.permission().id||chrome.filesState.chooser&&chrome.filesState.chooser.id||'';
            if(next!==promptId){promptId=next;browser.cancelController();webMode=false;reading=false;activity();if(String(keyboard).indexOf('browser-')===0){keyboard=null;draft='';keyboardAuthId='';}if(ctx.display&&next)ctx.display.focusKey='tgt:'+(chrome.dialog?'browser-dialog-accept':chrome.auth?'browser-auth-username':chrome.permission()?'browser-permission-deny':'browser-chooser-phone');}
        }
    });
    const nativePrompt=()=>chrome.modal()&&panel!=='remote';
    const vehicleAudio=new VehicleAudio({signals:ctx.signals,visible:()=>gate.check().allowed,
        requestFocus:async()=>{
            const wanted=()=>audioWanted&&!closing&&ui.isVisible('MAIN');
            if(!wanted())throw new Error('audio-not-visible');
            // Request actual HMI foreground through the SDK. Local focus flags
            // alone would not bring the Browser in front of another app.
            await ui.open('MAIN');
            if(!wanted())throw new Error('audio-not-visible');
            if(ui.hasFocus&&!ui.hasFocus('MAIN'))throw new Error('audio-focus-unavailable');
            visible();
        },
        start:()=>browser.request('audioRoute',{enabled:true}),
        stop:()=>browser.child&&gate.check().allowed?browser.request('audioRoute',{enabled:false}):Promise.resolve(),
        onStatus:state=>{vehicleAudioStatus=state;if(state.connected){audioNote='';audioRetry=0;}if(mediaCaps&&mediaCaps.audio)mediaCaps.audio.vehicle=state;}
    });
    function syncVehicleAudio(wanted){
        audioWanted=!!wanted;
        if(!audioWanted){audioSync=null;clearTimeout(audioUnknownTimer);audioUnknownTimer=null;audioKnownUntil=0;return vehicleAudio.release();}
        if(audioSync)return audioSync;
        const work=(async()=>{
            const status=await browser.request('audioStatus');
            if(audioSync!==work||!audioWanted||!gate.check().allowed)throw new Error('audio-not-visible');
            if(status.route==='mgu-smartx'){
                if(status.bridgeReady!==true){await vehicleAudio.release();throw new Error('audio-output-unavailable');}
                await vehicleAudio.acquire();
            }
        })().then(result=>{if(audioSync===work)audioSync=null;return result;},error=>{if(audioSync===work)audioSync=null;throw error;});
        audioSync=work;return work;
    }
    const audioError=error=>({
        'audio-source-busy':'Audioquelle konnte nicht übernommen werden.',
        'audio-takeover-refused':'Audioquelle konnte nicht übernommen werden.',
        'audio-takeover-timeout':'Audioquelle wurde nicht rechtzeitig freigegeben.',
        'audio-focus-unavailable':'Browser konnte nicht in den Vordergrund wechseln.',
        'audio-source-unavailable':'Fahrzeug-Audioquelle nicht verfügbar.',
        'audio-service-unavailable':'Fahrzeug-Audiodienst nicht erreichbar.',
        'audio-connect-refused':'Fahrzeug hat die Audioverbindung abgelehnt.',
        'audio-connect-timeout':'Fahrzeug-Audioverbindung nicht bereit.',
        'audio-output-unavailable':'Fahrzeug-Audioausgabe nicht bereit.',
        'audio-route-interrupted':'Fahrzeug-Audio wurde unterbrochen. Wiedergabe pausieren und erneut starten.',
        'audio-sdk-unavailable':'Fahrzeug-Audio wird von dieser Laufzeit nicht unterstützt.'
    })[error.message]||'Fahrzeug-Audio konnte nicht verbunden werden.';
    function audioLabel(audio){
        if(audio&&audio.route==='mgu-smartx'){
            if(vehicleAudioStatus.connected)return 'Fahrzeug-Audiokanal verbunden';
            if(vehicleAudioStatus.reason==='connecting')return 'Fahrzeug-Audio wird verbunden ...';
            if(vehicleAudioStatus.reason==='audio-source-busy')return 'Fahrzeug-Audiokanal bereits belegt';
            if(vehicleAudioStatus.reason==='audio-route-interrupted')return 'Fahrzeug-Audio wurde unterbrochen';
            if(vehicleAudioStatus.reason!=='idle')return 'Fahrzeug-Audioverbindung nicht bereit';
            return audio.bridgeReady?'Fahrzeug-Audio bereit; startet bei Wiedergabe':'Fahrzeug-Audioausgabe nicht bereit.';
        }
        return audio&&audio.routeAvailable?'Audio-Ausgang erkannt; Fahrzeugton unbestätigt':'Kein Audio-Ausgang erkannt';
    }
    const syncAudio=()=>{
        clearTimeout(audioUnknownTimer);audioUnknownTimer=null;
        const now=Date.now();
        if(media.audible===true)audioKnownUntil=now+4000;
        else if(media.activityUnknown!==true)audioKnownUntil=0;
        // A timed-out player query may briefly keep our existing route. It
        // cannot start a new route or hold one indefinitely without evidence.
        const hold=audioWanted&&media.audible!==true&&media.activityUnknown===true&&now<audioKnownUntil;
        if(hold){audioUnknownTimer=setTimeout(()=>{audioUnknownTimer=null;syncAudio();},audioKnownUntil-now);if(audioUnknownTimer.unref)audioUnknownTimer.unref();}
        const wanted=gate.check().allowed&&(audioBusy||media.audible===true||hold);
        if(wanted&&Date.now()<audioRetry)return;
        syncVehicleAudio(wanted).catch(e=>{if(e.message==='audio-not-visible')return;audioRetry=Date.now()+10000;if(audioNote!==e.message){audioNote=e.message;note(audioError(e));log.warn('vehicle audio: '+e.message);}});
    };
    shutdown.register(()=>{
        closing=true;
        const stop=()=>browser.stop('Browser beendet');
        return syncVehicleAudio(false).then(stop,stop);
    });
    async function navigate(value,launchOptions){
        const url=inputURL(value);if(!url){note('Bitte eine gueltige Webadresse eingeben');return;}
        if(starting)return;starting=true;loading=true;landing=false;keyboard=null;panel=null;reading=false;webMode=false;currentURL=url;activity();
        try{await browser.setLocale(locale.language);await browser.request('contentBlocking',{enabled:store.data.blockAds===true});await(browser.child?browser.navigate(url):browser.start(url,launchOptions));}
        catch(e){loading=false;note(e.message);if(!frame)landing=true;log.warn(e.message);}
        finally{starting=false;}
    }
    function editURL(purpose){
        browser.cancelController();
        keyboard=purpose||'url';draft=keyboard==='homepage'?store.data.homepage:keyboard==='wifi-ssid'?wifiSSID:keyboard==='wifi-password'?wifiPassword:currentURL;
        replaceDraft=true;keyMode='abc';upper=false;webMode=false;reading=false;activity();
        if(ctx.display)ctx.display.focusKey='tgt:key-0-0';
    }
    function openText(){
        if(!browser.child||!editable){note('Zuerst ein Textfeld auf der Webseite auswaehlen');return;}
        browser.cancelController();
        const structured=['date','month','week','time','datetime-local'].includes(inputType);
        keyboard=structured?'structured':'text';if(structured){draft='';replaceDraft=false;}panel=null;keyMode=structured?'123':'abc';webMode=false;reading=false;activity();
        if(ctx.display)ctx.display.focusKey='tgt:key-0-0';
    }
    function dismissKeyboard(){browser.cancelController();if(keyboard==='wifi-password'||String(keyboard).indexOf('vault-')===0||String(keyboard).indexOf('browser-auth-')===0){draft='';vaultSetup='';keyboardAuthId='';}keyboard=null;replaceDraft=false;webMode=false;if(ctx.display)ctx.display.focusKey='tgt:urlbar';activity();}
    async function type(value){
        activity();if(keyboard==='text')return browser.text(value);
        if(replaceDraft){draft='';replaceDraft=false;}draft=(draft+value).slice(0,2048);
    }
    async function finishKeyboard(){
        if(keyboard==='browser-auth-username'||keyboard==='browser-auth-password'){chrome.authValue(keyboardAuthId,keyboard.slice('browser-auth-'.length),draft);draft='';keyboard=null;keyboardAuthId='';return;}
        if(keyboard==='browser-find'){const value=draft;await browser.request('findText',{query:value,options:{caseSensitive:!!findState.caseSensitive}});keyboard=null;draft='';findBar=true;if(ctx.display)ctx.display.focusKey='tgt:find-next';return;}
        if(keyboard==='browser-prompt'){chrome.promptValue(draft);draft='';keyboard=null;return;}
        if(keyboard==='structured'){await browser.fillStructured(draft);draft='';dismissKeyboard();return;}
        if(String(keyboard).indexOf('vault-')===0){
            if(draft.length<12){note('Masterpasswort benötigt mindestens 12 Zeichen');return;}
            if(keyboard==='vault-create'){vaultSetup=draft;draft='';keyboard='vault-confirm';return;}
            if(keyboard==='vault-confirm'&&draft!==vaultSetup){draft='';note('Masterpasswörter stimmen nicht überein');return;}
            const secret=draft;draft='';vaultSetup='';keyboard=null;privacyBusy=true;
            try{setPrivacyState(await browser.request('vaultUnlock',{password:secret}));note('Geschützter Speicher entsperrt');}finally{privacyBusy=false;}return;
        }
        if(keyboard==='text'){dismissKeyboard();return;}
        if(keyboard==='wifi-ssid'||keyboard==='wifi-password'){
            if(keyboard==='wifi-ssid')wifiSSID=draft;else wifiPassword=draft;
            draft='';keyboard=null;activity();return;
        }
        if(keyboard==='homepage'){
            const url=draft.trim()?inputURL(draft):'';if(draft.trim()&&!url){note('Startseitenadresse pruefen');return;}
            store.set('homepage',url);keyboard=null;note(url?'Startseite gespeichert':'Start ohne feste Seite');activity();return;
        }
        return navigate(draft);
    }
    async function home(){
        activity();reading=false;panel=null;keyboard=null;
        if(store.data.homepage)return navigate(store.data.homepage);
        landing=true;webMode=false;currentURL='';title='';frame=null;if(browser.child)await browser.clearTab();loading=false;
    }
    async function closeApp(){
        closing=true;pendingLaunch=false;keyboard=null;draft='';vaultSetup='';wifiPassword='';panel=null;frame=null;landing=true;loading=false;
        await syncVehicleAudio(false).catch(()=>{});await browser.stop('Browser geschlossen');await ui.close('MAIN');
    }
    function launch(){
        if(!pendingLaunch||!serviceReady||!gate.check().allowed||closing)return;
        pendingLaunch=false;if(browser.child)return;
        const resume=currentURL||store.data.homepage;
        if(resume)safe(()=>navigate(resume,{restore:true}));
        else {landing=true;webMode=false;panel=null;safe(async()=>{await browser.setLocale(locale.language);await browser.request('contentBlocking',{enabled:store.data.blockAds===true});await browser.start('',{restore:true});});}
    }
    const visible=()=>{
        const v=ui.isVisible('MAIN')&&(!ui.hasFocus||ui.hasFocus('MAIN'));gate.setVisible(v);
        if(!v&&wasVisible)syncVehicleAudio(false).catch(()=>{});
        if(v&&!wasVisible){closing=false;pendingLaunch=true;launch();}wasVisible=v;
    };
    ui.onVisible(visible);if(ui.onFocus)ui.onFocus(visible);visible();setInterval(visible,100);
    browser.on('ready',()=>{serviceReady=true;resized='';if(!browser.child){pendingLaunch=true;if(!frame)landing=true;}launch();});
    browser.on('frame',f=>{frame=f;setImage(IMAGE,f.width,f.height,f.rgba);nativeBridge.markDirty(IMAGE,f.dirty);});
    browser.on('started',()=>{landing=!currentURL;resized='';activity();safe(()=>browser.request('contentBlocking',{enabled:store.data.blockAds===true}));safe(async()=>setPrivacyState(await browser.request('privacyStatus')));});
    browser.on('remote',v=>{
        if(!v)return;
        if(v.event==='connected'){if(remoteState)remoteState.phoneConnected=true;note('Handy verbunden');if(panel==='remote'){panel=null;landing=landing&&!currentURL;}}
        else if(v.event==='opened'){note('Link vom Handy geöffnet');panel=panel==='remote'?null:panel;}
        else if(v.event==='stopped'){remoteState=null;remoteQR='';}
    });
    browser.on('tabs',value=>{tabs=value;activeTab=(tabs.find(t=>t.active)||{}).id||'';});
    browser.on('tabSelected',t=>{
        currentURL=t.url;title=t.title;landing=!t.url&&!t.popup;frame=null;page=null;finger=null;
        canBack=false;canForward=false;editable=false;loading=!!t.loading;resized='';
        keyboard=null;draft='';panel=null;reading=false;webMode=false;activity();
        if(ctx.display)ctx.display.focusKey='tgt:'+(t.url?'tab-'+t.id:'urlbar');
    });
    browser.on('blocked',reason=>{frame=null;media={fullscreen:false,playing:false,audible:false};editable=false;password=false;inputType='';keyboard=null;draft='';findBar=false;webMode=false;loading=false;resized='';if(ctx.display&&ctx.display.browserSetFullscreen)ctx.display.browserSetFullscreen(false);if(!closing&&!landing&&gate.check().allowed&&reason!=='Start')note(reason);});
    browser.on('blocked',()=>{syncVehicleAudio(false).catch(()=>{});});
    browser.on('media',state=>{
        const changed=!!state.fullscreen!==!!media.fullscreen;media=state;
        syncAudio();
        if(changed){
            browser.cancelController();
            if(ctx.display&&ctx.display.browserSetFullscreen)ctx.display.browserSetFullscreen(!!state.fullscreen);
            resized='';reading=false;keyboard=null;panel=null;webMode=false;mediaIndex=1;mediaUntil=Date.now()+5000;
            if(state.fullscreen){landing=false;webMode=true;}
            else if(ctx.display)ctx.display.focusKey='tgt:tab-'+activeTab;
        }
    });
    browser.on('fault',e=>{loading=false;note(e.message);log.warn(e.message);});
    function setPrivacyState(state){privacyState=state;storageIssue=state&&state.storage&&state.storage.state==='failed'?'Website-Daten sind nicht vollstaendig gespeichert. Datenschutz & Logins oeffnen.':'';if(storageIssue)note(storageIssue);return state;}
    browser.on('privacy',setPrivacyState);
    browser.on('find',value=>{findState=value||{active:false,query:'',found:false};findBar=!!findState.active;});
    browser.on('findOpen',()=>openFind());
    browser.on('navigation',url=>{currentURL=url;landing=false;resized='';resizeRetry=0;store.visit(url,'');});
    browser.on('loading',value=>{loading=value;});
    browser.on('navigationState',s=>{
        canBack=s.canBack;canForward=s.canForward;currentURL=s.url;title=s.title||'';
        if(s.url)landing=false;
        store.visit(s.url,title,false);
    });
    browser.on('input',info=>{
        editable=!!info.editable;password=!!info.password;inputType=info.type||'';multiline=!!info.multiline;
        if(info.adjusting)note('Drehen: Wert ändern. Drücken: fertig. Links: Browserleiste.');
        if(editable&&webMode&&!keyboard&&!panel&&!landing)openText();
    });
    let diagnostic='';browser.on('diagnostic',s=>{if(s!==diagnostic){diagnostic=s;log.warn(s.slice(0,400));}});
    for(const id of ['BTN_OPEN','BTN_BACK','BTN_STOP'])ctx.hideButton(id);
    ui.onClick('BTN_OPEN',()=>safe(home));ui.onClick('BTN_BACK',()=>safe(()=>media.fullscreen?browser.mediaAction('exit'):browser.child?browser.back():home()));ui.onClick('BTN_STOP',()=>safe(closeApp));
    const webActions={
        toolbar:()=>{browser.cancelController();safe(()=>browser.leavePage());webMode=false;reading=false;if(ctx.display&&activeTab)ctx.display.focusKey='tgt:tab-'+activeTab;activity();},
        keyboard:openText,
        scroll:d=>{activity();safe(()=>browser.scroll(d));},
        press:()=>{activity();safe(()=>browser.pressPage());},
        focus:d=>{activity();safe(()=>browser.focusPage(d));}
    };
    const showMedia=()=>{mediaUntil=Date.now()+5000;activity();};
    const mediaActions={
        toolbar:()=>{showMedia();safe(()=>browser.mediaAction('back'));},
        keyboard:()=>{showMedia();safe(()=>browser.mediaAction('forward'));},
        scroll:showMedia,
        focus:d=>{showMedia();mediaIndex=(mediaIndex+d%videoActions.length+videoActions.length)%videoActions.length;},
        press:()=>{showMedia();safe(()=>browser.mediaAction(videoActions[mediaIndex]));}
    };
    const siteMediaActions={
        toolbar:()=>media.fullscreen?safe(()=>browser.mediaAction('exit')):webActions.toolbar(),
        keyboard:()=>safe(()=>browser.key('ArrowRight')),
        scroll:()=>safe(()=>browser.mediaAction('reveal')),
        focus:d=>safe(()=>browser.focusMedia(d)),
        press:()=>safe(()=>browser.pressMedia())
    };
    function focusUI(delta){
        const display=ctx.display,targets=display&&display.pageTargets||[];if(!targets.length)return;
        const index=targets.findIndex(t=>'tgt:'+t.key===display.focusKey);
        const next=index<0?(delta<0?targets.length-1:0):(index+delta%targets.length+targets.length)%targets.length;
        display.focusKey='tgt:'+targets[next].key;activity();if(display._repaint)display._repaint();
    }
    function tiltUI(direction){
        const display=ctx.display;if(!display)return;
        const target=display._toward&&display._toward(direction,0);
        if(target&&display._focus)display._focus(target);else focusUI(direction==='W'||direction==='N'?-1:1);
        activity();if(display._repaint)display._repaint();
    }
    const uiActions={
        focus:focusUI,toolbar:()=>tiltUI('W'),keyboard:()=>tiltUI('E'),scroll:d=>tiltUI(d<0?'N':'S'),
        press:()=>{const display=ctx.display,target=display&&(display.pageTargets||[]).find(t=>'tgt:'+t.key===display.focusKey);if(target)safe(()=>target.run());}
    };
    const fullscreenWebActions=Object.assign({},webActions,{toolbar:()=>safe(()=>browser.mediaAction('exit'))});
    const actions=()=>nativePrompt()||keyboard||panel||findBar&&!webMode?uiActions:media.fullscreen?(media.playerMode?(media.hasSiteControls?siteMediaActions:mediaActions):fullscreenWebActions):webMode&&!landing&&browser.child?(media.playerMode&&media.hasSiteControls?siteMediaActions:webActions):uiActions;
    const controller=new Controller({focus:d=>actions().focus(d),toolbar:()=>actions().toolbar(),keyboard:()=>actions().keyboard(),scroll:d=>actions().scroll(d),press:()=>actions().press()});
    const input=v=>{if(!gate.check().allowed){controller.reset();return false;}controller.feed(v);return true;};
    nativeBridge.setControllerHandler(input);ctx.controller.onInput(input);
    let finger=null;
    const cssViewport=()=>browser.viewport||frame;
    const pagePoint=(x,y)=>{const view=cssViewport();return {x:(x-page.x)*view.width/page.w,y:(y-page.y)*view.height/page.h};};
    if(ctx.display){
        const touch=ctx.display._touch.bind(ctx.display);
        ctx.display._touch=function(phase,x,y){
            const target=(this.pageTargets||[]).some(t=>!t.controllerOnly&&x>=t.x&&x<t.x+t.w&&y>=t.y&&y<t.y+t.h);
            if(phase===1&&!target&&page&&!nativePrompt()&&!panel&&!landing&&frame&&x>=page.x&&x<page.x+page.w&&y>=page.y&&y<page.y+page.h){
                const view=cssViewport();finger={x,y,lastX:x,lastY:y,drag:false,tab:activeTab,url:currentURL,width:view.width,height:view.height};enterPage();return;
            }
            if(finger){
                const view=cssViewport();if(!page||!view||!frame||nativePrompt()||finger.tab!==activeTab||finger.url!==currentURL||finger.width!==view.width||finger.height!==view.height){finger=null;return;}
                if(phase===2){if(Math.abs(y-finger.y)>12||Math.abs(x-finger.x)>12)finger.drag=true;if(finger.drag){const options=Object.assign(pagePoint(finger.x,finger.y),{deltaX:(finger.lastX-x)*view.width/page.w}),delta=(finger.lastY-y)*view.height/page.h;safe(()=>browser.scroll(delta,options));}finger.lastY=y;finger.lastX=x;}
                if(phase===3){const f=finger;finger=null;if(!f.drag){const point=pagePoint(x,y);safe(()=>browser.tap(point.x,point.y));}}
                return;
            }
            return touch(phase,x,y);
        };
    }
    ctx.onTap((x,y)=>{if(!nativePrompt()&&!keyboard&&!panel&&!landing&&page&&frame&&x>=page.x&&x<page.x+page.w&&y>=page.y&&y<page.y+page.h){enterPage();const point=pagePoint(x,y);safe(()=>browser.tap(point.x,point.y));}});
    ctx.onScroll(d=>{activity();if(nativePrompt())return true;if(panel==='library'){listOffset=Math.max(0,listOffset+(d>0?1:-1));return true;}if(browser.child&&!panel){safe(()=>browser.scroll(d));return true;}return false;});
    async function refreshWifi(){
        try{wifiState=await browser.wifiStatus();if(!wifiSSID&&wifiState.ssid)wifiSSID=wifiState.ssid;}
        catch(e){wifiState={supported:false,error:e.message};}
    }
    async function openNetwork(){panel='network';keyboard=null;draft='';webMode=false;reading=false;wifiInternet=null;activity();await refreshWifi();}
    async function connectWifi(reconnect){
        wifiBusy=true;wifiInternet=null;
        try{wifiState=await(reconnect?browser.wifiReconnect():browser.wifiConnect(wifiSSID,wifiPassword));wifiPassword='';note('WLAN-Verbindung wird aufgebaut');}
        finally{wifiBusy=false;}
    }
    async function scanWifi(){
        panel='wifi-list';keyboard=null;webMode=false;wifiScanning=true;wifiScanError='';wifiOffset=0;activity();
        try{const result=await browser.wifiScan();wifiNetworks=result.networks||[];if(result.message)wifiScanError=result.message;}
        catch(e){wifiScanError=e.message;wifiNetworks=[];}
        finally{wifiScanning=false;}
    }
    async function selectTab(id){webMode=false;if(id===activeTab){panel=null;keyboard=null;return;}await browser.selectTab(id);}
    async function closeTab(id){await browser.closeTab(id);webMode=false;if(ctx.display)ctx.display.focusKey='tgt:tab-'+activeTab;}
    function enterPage(){if(!webMode&&browser.child)safe(()=>browser.leavePage());webMode=true;activity();note('Webseite aktiv. Controller nach links: Browserleiste.');if(ctx.display)ctx.display.focusKey=null;}
    async function newTab(){await browser.newTab('');if(ctx.display)ctx.display.focusKey='tgt:urlbar';}
    async function openStreaming(){
        panel='streaming';keyboard=null;webMode=false;reading=false;activity();
        mediaCaps=null;
        mediaCaps=await browser.request('mediaCapabilities');
    }
    async function testAudio(){
        if(audioBusy)return;audioBusy=true;
        try{try{await syncVehicleAudio(true);}catch(e){throw new Error(audioError(e));}await browser.request('audioTest');mediaCaps=await browser.request('mediaCapabilities');if(mediaCaps.audio)mediaCaps.audio.vehicle=vehicleAudioStatus;note('Testton erzeugt. Hörbare Ausgabe am Gerät prüfen.');}
        finally{audioBusy=false;syncAudio();}
    }
    // Phone remote control: show a QR code with a one-time link.
    async function openRemote(fresh){
        panel='remote';keyboard=null;webMode=false;reading=false;remoteBusy=true;activity();
        try{
            const status=await browser.request('remoteStatus');
            remoteState=status.active&&!fresh?status:await browser.request('remoteStart');
            showQR(remoteState.url);
        }catch(e){remoteState={active:false,error:e.message};}
        finally{remoteBusy=false;}
    }
    function showQR(url){
        if(!url||url===remoteQR)return;
        const code=QR.encode(url),scale=Math.max(4,Math.floor(300/(code.size+8))),img=QR.toRGBA(code,scale,[12,17,24],[255,255,255]);
        setImage(QR_IMAGE,img.width,img.height,img.rgba);remoteQR=url;
    }
    async function stopRemote(){remoteState=await browser.request('remoteStop');remoteQR='';panel='settings';}
    function drawRemote(c,bottom){
        c.text('Mit Handy steuern',64,114,36,C.text);
        const s=remoteState||{};
        if(remoteBusy){c.text('Verbindung wird vorbereitet ...',65,170,22,C.muted);}
        else if(!s.active){
            c.text(s.error||'Die Handy-Steuerung ist ausgeschaltet.',65,170,22,'#ffbc8e');
            c.text('Handy und BMW müssen im selben WLAN sein, z. B. über den Hotspot des Handys.',65,206,19,C.muted);
            button(c,64,240,320,44,'Erneut versuchen',()=>openRemote(true),'remote-retry',{primary:true});
        }else{
            const side=300,x=64,y=140;
            c.roundRect(x-8,y-8,side+16,side+16,12,'#ffffff');
            if(remoteQR)c.image(QR_IMAGE,x,y,side,side);
            const tx=420;
            c.text(s.phoneConnected?'Handy ist verbunden':'Mit der Handy-Kamera scannen',tx,170,26,s.phoneConnected?'#7be0b5':C.text);
            c.text('1. Kamera-App öffnen und den Code scannen.',tx,214,20,C.muted);
            c.text('2. Am Handy Links senden, Text und Passwörter eingeben,',tx,246,20,C.muted);
            c.text('    im Live-Bild tippen und scrollen.',tx,274,20,C.muted);
            c.text('Funktioniert im WLAN des Fahrzeugs bzw. im Handy-Hotspot.',tx,314,18,C.muted);
            c.text(String(s.url||'').replace(/^http:\/\//,''),tx,352,18,C.accent,{literal:true});
            c.text('Endet nach 30 Minuten ohne Nutzung. Ein neuer Code macht den alten ungültig.',tx,386,17,C.muted);
            button(c,tx,bottom-60,280,42,'Neuer Code',()=>openRemote(true),'remote-new');
            button(c,tx+296,bottom-60,300,42,'Verbindung beenden',stopRemote,'remote-stop');
        }
        button(c,1288,bottom-60,246,42,'Zurueck',()=>{panel='settings';},'remote-back');
    }
    async function openPrivacy(){panel='privacy';keyboard=null;webMode=false;reading=false;privacyBusy=true;activity();try{setPrivacyState(await browser.request('privacyStatus'));}finally{privacyBusy=false;}}
    async function changePrivacy(name){privacyBusy=true;try{const prefs={};prefs[name]=!privacyState[name];setPrivacyState(await browser.request('privacyConfigure',{prefs}));}finally{privacyBusy=false;}}
    async function openPasswords(){panel='passwords';loginOffset=0;logins=await browser.request('vaultList');}
    function openFind(){
        if(!browser.child||nativePrompt())return;
        browser.cancelController();panel=null;keyboard='browser-find';draft=findState.query||'';replaceDraft=true;keyMode='abc';upper=false;webMode=false;reading=false;findBar=true;activity();if(ctx.display)ctx.display.focusKey='tgt:key-0-0';
    }
    function drawFind(c,top){
        c.roundRect(800,top+8,784,58,8,C.panel);
        c.text((findState.query||'').slice(0,30),816,top+43,21,C.text,{literal:true});
        c.text(findState.found?'Treffer':'Kein Treffer',1130,top+43,17,C.muted);
        button(c,1250,top+16,64,40,'<',()=>browser.request('findText',{query:findState.query,options:{backwards:true,caseSensitive:!!findState.caseSensitive}}),'find-prev');
        button(c,1322,top+16,64,40,'>',()=>browser.request('findText',{query:findState.query,options:{caseSensitive:!!findState.caseSensitive}}),'find-next');
        button(c,1394,top+16,100,40,'Text',openFind,'find-edit');
        button(c,1502,top+16,66,40,'X',()=>browser.request('clearFind'),'find-close');
    }
    function confirmPrivacy(label,run,back){privacyConfirmation={label,run,back:back||'privacy'};panel='privacy-confirm';}
    function button(c,x,y,w,h,label,fn,key,options){
        const o=options||{},enabled=o.enabled!==false;
        if(!o.flat)c.roundRect(x,y,w,h,7,o.primary?'#315d84':C.field);
        c.text(o.literal?String(label):ascii(label),x+w/2,y+h/2+7,19,enabled?C.text:'#566171',{align:'center',literal:!!o.literal});
        if(enabled)c.target(x,y,w,h,()=>{browser.cancelController();activity();return safe(fn);},key);
        tipLabels[key]=o.tip||label;
    }
    function tool(c,x,name,fn,key,enabled,selected){
        if(selected)c.roundRect(x,7,42,42,7,'#293b4d');
        icon(c,name,x+21,28,enabled===false?'#566171':selected?C.accent:C.text);
        if(enabled!==false)c.target(x,6,42,44,()=>{browser.cancelController();activity();return safe(fn);},key);
        tipLabels[key]=({back:'Zurueck',forward:'Vorwaerts',home:'Startseite',reload:'Neu laden',stop:'Laden abbrechen',star:'Lesezeichen',history:'Verlauf und Lesezeichen',keyboard:'Tastatur',settings:'Einstellungen',expand:'Lesemodus',close:'Browser schliessen'})[name]||name;
    }
    function toolbar(c){
        c.fillRect(0,0,W,BAR,C.bar);c.fillRect(0,BAR-1,W,1,C.line);
        tool(c,8,'back',()=>browser.back(),'back',!!browser.child&&canBack);
        tool(c,56,'forward',()=>browser.forward(),'forward',!!browser.child&&canForward);
        tool(c,104,'home',home,'home',true);
        tool(c,152,loading?'stop':'reload',()=>loading?browser.stopLoading():browser.child?browser.reload():home(),'reload',true);
        const editing=keyboard==='url'||keyboard==='homepage',label=editing?draft:currentURL;
        c.roundRect(206,8,1044,40,8,editing?'#263f54':C.field);
        if(!label)icon(c,'search',224,28,C.muted);
        c.clip(222,12,1008,32);
        c.text(label?(editing&&label.length>91?label.slice(-91):label):ascii('Adresse oder Suchbegriff'),label?223:244,35,19,label?C.text:C.muted,{literal:true});c.noclip();
        c.target(206,8,1044,40,()=>editURL('url'),'urlbar');tipLabels.urlbar='Adresse bearbeiten';
        if(loading)c.fillRect(214,47,140+(Date.now()/14%850),2,C.accent);
        tool(c,1264,'star',()=>{store.toggleBookmark(currentURL,title);note(store.bookmarked(currentURL)?'Lesezeichen gespeichert':'Lesezeichen entfernt');},'bookmark',!!currentURL,store.bookmarked(currentURL));
        tool(c,1312,'history',()=>{panel=panel==='library'?null:'library';keyboard=null;webMode=false;listOffset=0;if(ctx.display)ctx.display.focusKey='tgt:'+(panel?'list-'+listTab:'library');},'library',true,panel==='library');
        if(editable||keyboard==='text')tool(c,1360,'keyboard',()=>keyboard?dismissKeyboard():openText(),'text-keyboard',true,!!keyboard);
        else tool(c,1360,'cursor',enterPage,'page-control',!!frame&&!landing);
        tipLabels['page-control']='Webseite steuern';
        tool(c,1408,'settings',()=>{panel=panel==='settings'?null:'settings';keyboard=null;webMode=false;},'settings',true,panel==='settings');
        tool(c,1456,'expand',()=>{enterPage();reading=true;panel=null;keyboard=null;},'reading',!!frame);
        tool(c,1514,'close',closeApp,'close',true);
    }
    function tabstrip(c){
        c.fillRect(0,BAR,W,TABS,'#111820');
        const width=Math.min(360,Math.floor((W-78)/Math.max(1,tabs.length)));
        tabs.forEach((t,i)=>{
            const x=8+i*width,w=width-6,selected=t.id===activeTab;
            c.roundRect(x,BAR+3,w,TABS-5,6,selected?'#31485e':'#202936');
            c.text(((t.loading?'... ':'')+(t.title||displayURL(t.url)||ascii('Neuer Tab'))).slice(0,Math.floor((w-60)/10)),x+14,BAR+27,18,C.text,{literal:true});
            c.target(x,BAR+3,w-39,TABS-5,()=>safe(()=>selectTab(t.id)),'tab-'+t.id);
            icon(c,'close',x+w-20,BAR+21,C.muted);
            c.target(x+w-38,BAR+3,38,TABS-5,()=>safe(()=>closeTab(t.id)),'tab-close-'+t.id);
        });
        const x=8+tabs.length*width;
        c.roundRect(x,BAR+3,54,TABS-5,6,C.field);c.text('+',x+27,BAR+29,28,C.text,{align:'center'});
        if(tabs.length<8)c.target(x,BAR+3,54,TABS-5,()=>safe(newTab),'tab-new');
        tipLabels['tab-new']='Neuer Tab';
    }
    function belowTabs(c,fn){
        // Recorder.xf is an absolute device transform, not a logical translation.
        // Offset drawing and hit targets together so placement scaling stays intact.
        const methods=['text','fillRect','roundRect','target','image'],originals={};
        methods.forEach(name=>{originals[name]=c[name];c[name]=function(){const args=Array.prototype.slice.call(arguments);args[name==='text'||name==='image'?2:1]+=TABS;return originals[name].apply(c,args);};});
        try{fn();}finally{methods.forEach(name=>{c[name]=originals[name];});}
    }
    function drawVideoControls(c,bottom){
        if(Date.now()>mediaUntil&&!media.paused)return;
        c.roundRect(320,bottom-112,960,98,12,'#161f2c');
        const labels=['-10 s',media.paused?'Wiedergabe':'Pause','+10 s',media.muted?'Ton ein':'Stumm','Vollbild verlassen'];
        labels.forEach((label,i)=>button(c,336+i*185,bottom-95,176,44,label,()=>{showMedia();return browser.mediaAction(videoActions[i]);},'video-'+videoActions[i],{primary:i===mediaIndex}));
        const time=s=>Math.floor((s||0)/60)+':'+('0'+Math.floor((s||0)%60)).slice(-2);
        c.text(time(media.currentTime)+' / '+time(media.duration)+'   '+ascii('Drehen: wählen | Drücken: ausführen | Neigen links/rechts: 10 s'),350,bottom-29,17,C.muted);
    }
    function rowsForList(){
        if(listTab==='bookmarks')return store.data.bookmarks;
        if(listTab==='history')return store.data.history;
        return store.frequent();
    }
    function drawStart(c,bottom){
        c.text(panel==='library'?'Deine Seiten':'Browser',64,118,38,C.text);
        c.text('Dein Web. Direkt im iDrive.',65,153,19,C.muted);
        const tabs=[['frequent','Haeufig besucht'],['bookmarks','Lesezeichen'],['history','Verlauf']];
        tabs.forEach((t,i)=>button(c,64+i*238,181,224,42,t[1],()=>{listTab=t[0];listOffset=0;},'list-'+t[0],{primary:listTab===t[0]}));
        const items=rowsForList();
        if(!items.length){
            c.text(listTab==='bookmarks'?'Noch keine Lesezeichen':listTab==='history'?'Dein Verlauf beginnt mit der ersten Seite':'Hier erscheinen deine haeufig besuchten Seiten',65,282,24,C.text);
            c.text('Waehle oben die Adressleiste. Drehen waehlt, Druecken bestaetigt.',65,319,19,C.muted);
            if(listTab==='frequent'){
                c.text('SCHNELLZUGRIFF',65,380,15,C.muted);
                [['example.net','https://example.net/'],['Wikipedia','https://de.wikipedia.org/'],['YouTube','https://www.youtube.com/']].forEach((i,n)=>button(c,64+n*340,402,320,62,i[0],()=>navigate(i[1]),'suggestion-'+n));
            }
            return;
        }
        const count=6,max=Math.max(0,items.length-count);listOffset=Math.min(listOffset,max);
        items.slice(listOffset,listOffset+count).forEach((item,i)=>{
            const col=i%3,row=Math.floor(i/3),x=64+col*492,y=240+row*94;
            c.roundRect(x,y,470,80,10,C.panel);
            c.text((item.title||displayURL(item.url)).slice(0,38),x+18,y+33,21,C.text,{literal:true});
            c.text(displayURL(item.url).slice(0,52),x+18,y+61,16,C.muted,{literal:true});
            c.target(x,y,470,80,()=>safe(()=>navigate(item.url)),'visit-'+i);
        });
        if(items.length>count){button(c,64,bottom-55,135,38,'Zurueck',()=>{listOffset=Math.max(0,listOffset-count);},'list-prev');button(c,212,bottom-55,135,38,'Weitere',()=>{listOffset=Math.min(max,listOffset+count);},'list-next');}
    }
    function drawSettings(c,bottom){
        c.text('Einstellungen',64,114,36,C.text);
        button(c,1170,79,364,42,'Internet / mobiler Hotspot',openNetwork,'network-settings');
        button(c,1170,139,364,42,'Medien & Streaming',openStreaming,'streaming-settings');
        button(c,1170,199,364,42,'Datenschutz & Logins',openPrivacy,'privacy-settings');
        button(c,1170,259,364,42,'Mit Handy steuern (QR)',()=>openRemote(false),'remote-settings',{primary:true});
        button(c,1170,319,364,42,store.data.blockAds?'Werbe- und Trackerblocker: Ein':'Werbe- und Trackerblocker: Aus',()=>{const next=!store.data.blockAds;store.set('blockAds',next);return browser.child?browser.request('contentBlocking',{enabled:next}):null;},'block-ads');
        button(c,1170,379,364,42,'Downloads',async()=>{await chrome.refreshFiles();chrome.offset=0;panel='browser-files';keyboard=null;webMode=false;},'downloads-settings');
        button(c,800,384,344,42,'Website-Berechtigungen',async()=>{await chrome.refreshPermissions();panel='browser-permissions';keyboard=null;webMode=false;},'permissions-settings',{enabled:!!browser.child});
        c.text('STARTSEITE',65,157,15,C.muted);
        const homeText=keyboard==='homepage'?draft:store.data.homepage;
        c.text((homeText||ascii('Keine feste Seite - haeufig besuchte Seiten anzeigen')).slice(0,keyboard?67:115),65,190,21,C.text,{literal:true});
        button(c,64,214,220,42,'Adresse bearbeiten',()=>editURL('homepage'),'home-edit');
        button(c,298,214,244,42,'Aktuelle Seite',()=>{if(currentURL){store.set('homepage',currentURL);note('Startseite gespeichert');}else note('Zuerst eine Webseite oeffnen');},'home-current');
        button(c,556,214,220,42,'Ohne Startseite',()=>{store.set('homepage','');note('Start ohne feste Seite');},'home-empty');
        c.fillRect(64,281,keyboard?880:1472,1,C.line);
        c.text('DARSTELLUNG',65,320,15,C.muted);
        c.text('Seitenzoom',65,355,22,C.text);
        button(c,420,324,210,42,store.data.zoom+' %',()=>{const values=[100,125,150];store.set('zoom',values[(values.indexOf(store.data.zoom)+1)%values.length]);resized='';},'zoom');
        button(c,800,324,344,42,'Auf der Seite suchen',openFind,'find-settings',{enabled:!!browser.child});
        c.text('Leiste beim Lesen ausblenden',65,415,22,C.text);
        button(c,620,384,156,42,store.data.autoHide?'Ein':'Aus',()=>store.set('autoHide',!store.data.autoHide),'auto-hide');
        c.text('Controller nach links oder die kleine Leiste oben holt die Bedienung zurueck.',65,462,17,C.muted);
        if(!keyboard)button(c,1288,bottom-60,246,42,'Fertig',()=>{panel=null;webMode=false;if(ctx.display)ctx.display.focusKey='tgt:settings';activity();},'settings-done',{primary:true});
    }
    function drawPrivacy(c,bottom){
        c.text('Datenschutz & Logins',64,114,34,C.text);
        // Cookies and site data use the device key; only the password vault
        // needs the master password.
        const enabled=!!privacyState&&privacyState.supported&&(privacyState.siteStorage||!privacyState.locked)&&!privacyBusy;
        const vaultEnabled=!!privacyState&&privacyState.supported&&!privacyState.locked&&!privacyBusy;
        c.text(privacyBusy?'Geschützter Speicher wird geprüft ...':privacyState&&privacyState.error?privacyState.error:privacyState&&privacyState.supported?privacyState.locked?'Cookies werden verschlüsselt gesichert. Passwörter: Speicher entsperren':privacyState.protection:'Geschützter Speicher in dieser Laufzeit nicht verfügbar',65,157,18,C.muted);
        if(privacyState&&privacyState.supported&&privacyState.locked&&!keyboard)button(c,1170,178,364,42,privacyState.needsSetup?'Masterpasswort einrichten':'Speicher entsperren',()=>{keyboard=privacyState.needsSetup?'vault-create':'vault-unlock';draft='';vaultSetup='';replaceDraft=false;keyMode='abc';upper=false;},'vault-unlock');
        c.text('Angemeldet bleiben',65,211,23,C.text);
        button(c,850,178,294,42,privacyState&&privacyState.rememberSessions?'Ein':'Aus',()=>changePrivacy('rememberSessions'),'remember-sessions',{enabled});
        c.text('HTTP-Cache behalten',65,268,23,C.text);
        button(c,850,235,294,42,privacyState&&privacyState.rememberCache?'Ein':'Aus',()=>changePrivacy('rememberCache'),'remember-cache',{enabled});
        c.text('Verlauf aufzeichnen',65,325,23,C.text);
        button(c,850,292,294,42,store.data.historyEnabled?'Ein':'Aus',()=>store.set('historyEnabled',!store.data.historyEnabled),'remember-history');
        button(c,64,354,390,42,'Website-Daten löschen / abmelden',()=>confirmPrivacy('Website-Daten löschen und alle Websites abmelden?',async()=>{setPrivacyState(await browser.request('clearBrowserData',{kind:'sites'}));landing=true;currentURL='';title='';}), 'clear-sites',{enabled});
        button(c,470,354,290,42,'HTTP-Cache löschen',()=>confirmPrivacy('Gespeicherten HTTP-Cache löschen?',async()=>{setPrivacyState(await browser.request('clearBrowserData',{kind:'cache'}));}), 'clear-cache',{enabled});
        button(c,776,354,290,42,'Verlauf löschen',()=>confirmPrivacy('Den lokalen Browser-Verlauf löschen?',async()=>store.clearHistory()),'clear-history');
        button(c,1082,354,452,42,'Passwortverwaltung',openPasswords,'passwords',{enabled:vaultEnabled});
        c.text('Cookies und Logins werden laufend gesichert, auch bei Zündung aus. Ohne Sitzungen bleiben sie nur bis zum Schließen.',65,439,17,C.muted);
        button(c,64,bottom-52,680,42,'Sitzungsspeicher zurücksetzen',()=>confirmPrivacy('Gespeicherte Website-Anmeldungen und Cache zurücksetzen? Passwörter bleiben erhalten.',async()=>{setPrivacyState(await browser.request('clearBrowserData',{kind:'sessions-reset'}));landing=true;currentURL='';title='';}),'reset-sessions',{enabled});
        button(c,1288,bottom-52,246,42,'Zurueck',()=>{panel='settings';},'privacy-back');
    }
    function drawPasswords(c,bottom){
        c.text('Passwortverwaltung',64,114,34,C.text);
        c.text('Speichern und Ausfüllen nur auf der passenden HTTPS-Seite. Keine automatische Anmeldung.',65,155,18,C.muted);
        button(c,64,172,544,42,'Zugang aus aktuellem Formular speichern',async()=>{await browser.request('vaultSave');logins=await browser.request('vaultList');note('Zugang verschlüsselt gespeichert');},'vault-save',{enabled:!!browser.child});
        if(!logins.length)c.text('Noch keine gespeicherten Zugänge',65,275,23,C.muted);
        logins.slice(loginOffset,loginOffset+4).forEach((entry,i)=>{
            const x=64+(i%2)*748,y=235+Math.floor(i/2)*88;c.roundRect(x,y,722,76,8,C.panel);
            c.text(entry.origin.slice(0,34),x+14,y+29,20,C.text,{literal:true});
            c.text(entry.username.slice(0,40),x+14,y+55,17,C.muted,{literal:true});
            button(c,x+438,y+18,148,38,'Ausfüllen',async()=>{await browser.request('vaultFill',{loginId:entry.id});panel=null;enterPage();note('Zugang ausgefüllt');},'vault-fill-'+i,{enabled:!!browser.child});
            button(c,x+596,y+18,112,38,'Löschen',()=>confirmPrivacy('Diesen gespeicherten Zugang löschen?',async()=>{await browser.request('vaultRemove',{loginId:entry.id});logins=await browser.request('vaultList');loginOffset=Math.max(0,Math.min(loginOffset,logins.length-1));},'passwords'),'vault-remove-'+i);
        });
        if(logins.length>4)button(c,64,bottom-52,246,42,'Weitere',()=>{loginOffset=loginOffset+4<logins.length?loginOffset+4:0;},'vault-next');
        button(c,1288,bottom-52,246,42,'Zurueck',()=>{panel='privacy';},'vault-back');
    }
    function drawPrivacyConfirmation(c,bottom){
        c.text('Löschen bestätigen',64,114,34,C.text);
        c.text(privacyConfirmation.label,65,198,24,C.text);
        c.text('Diese Aktion lässt sich nicht rückgängig machen.',65,247,20,C.muted);
        button(c,64,310,320,44,'Abbrechen',()=>{panel=privacyConfirmation.back;privacyConfirmation=null;},'privacy-cancel');
        button(c,410,310,320,44,'Löschen',async()=>{const request=privacyConfirmation;await request.run();panel=request.back;privacyConfirmation=null;note('Daten gelöscht');},'privacy-confirm');
    }
    function drawNetwork(c,bottom){
        c.text('Internet / mobiler Hotspot',64,114,34,C.text);
        const ssid=keyboard==='wifi-ssid'?draft:wifiSSID,secret=keyboard==='wifi-password'?draft:wifiPassword;
        c.text('WLAN-Name (SSID)',65,163,18,C.muted);
        button(c,64,178,700,42,ssid||ascii('WLAN-Namen eingeben'),()=>editURL('wifi-ssid'),'wifi-ssid',{literal:true});
        if(!keyboard)button(c,870,178,300,42,'WLAN-Netze suchen',scanWifi,'wifi-scan',{enabled:!!wifiState.supported&&!wifiBusy&&!wifiState.joining});
        c.text('WPA-Passwort',65,250,18,C.muted);
        button(c,64,265,700,42,secret?'*'.repeat(Math.min(38,secret.length)):'Passwort eingeben',()=>editURL('wifi-password'),'wifi-password');
        button(c,64,331,320,44,wifiBusy||wifiState.joining?'Verbindet ...':'Verbinden',()=>connectWifi(false),'wifi-connect',{primary:true,enabled:wifiState.supported&&!wifiBusy&&!wifiState.joining&&!!ssid&&!!secret});
        button(c,400,331,364,44,'Gespeichertes WLAN verbinden',()=>connectWifi(true),'wifi-reconnect',{enabled:wifiState.supported&&wifiState.saved&&!wifiBusy&&!wifiState.joining});
        const status=wifiState.message||wifiState.error||(wifiState.joining?'Verbindung wird aufgebaut ...':wifiState.connected?'WLAN verbunden: '+wifiState.ssid:'Keine WLAN-Verbindung');
        c.text(ascii(status).slice(0,keyboard?78:145),65,412,18,C.muted);
        c.text(wifiInternet===null?'Zugangsdaten bleiben im geschuetzten WLAN-Dienst der Headunit.':wifiInternet?'Internet erreichbar (HTTPS)':'Internet noch nicht erreichbar',65,446,17,C.muted);
        if(!keyboard){
            button(c,870,331,300,44,'Internet pruefen',async()=>{const r=await browser.request('network');wifiInternet=!!r.https;},'wifi-check',{enabled:!!wifiState.supported});
            button(c,1288,bottom-52,246,42,'Zurueck',()=>{panel='settings';wifiPassword='';draft='';},'wifi-back');
        }
    }
    function drawWifiList(c,bottom){
        c.text('WLAN-Netze in der Umgebung',64,114,34,C.text);
        if(wifiScanning)c.text('WLAN-Netze werden gesucht ...',65,164,21,C.muted);
        else if(wifiScanError)c.text(ascii(wifiScanError).slice(0,140),65,164,19,C.muted);
        else if(!wifiNetworks.length)c.text('Keine sichtbaren WLAN-Netze gefunden',65,164,21,C.muted);
        else{
            c.text('Netz auswählen, danach das Passwort eingeben.',65,154,18,C.muted);
            wifiNetworks.slice(wifiOffset,wifiOffset+5).forEach((network,i)=>{
                const label=network.ssid+'   '+network.signal+' dBm   '+ascii(network.secure?'Gesichert':'Offen');
                button(c,64,170+i*51,1472,43,label,()=>{wifiSSID=network.ssid;wifiPassword='';panel='network';editURL('wifi-password');},'wifi-network-'+i,{literal:true});
            });
        }
        if(!wifiScanning&&wifiNetworks.length>5){
            button(c,64,bottom-52,150,42,'Zurueck',()=>{wifiOffset=Math.max(0,wifiOffset-5);},'wifi-list-prev');
            button(c,230,bottom-52,150,42,'Weitere',()=>{wifiOffset=wifiOffset+5<wifiNetworks.length?wifiOffset+5:0;},'wifi-list-next');
        }
        button(c,400,bottom-52,240,42,'Erneut suchen',scanWifi,'wifi-list-refresh',{enabled:!wifiScanning});
        button(c,1288,bottom-52,246,42,'Zurueck',()=>{panel='network';activity();},'wifi-list-back');
    }
    function drawStreaming(c,bottom){
        c.text('Medien & Streaming',64,114,34,C.text);
        c.text('Vollbild zeigt das ganze Video ohne Beschnitt. Drehen und Drücken bleiben aktiv.',65,164,20,C.text);
        if(mediaCaps){
            c.text(mediaCaps.mediaEnabled?'Videowiedergabe in dieser Laufzeit aktiviert':'Videowiedergabe auf der Headunit noch nicht freigegeben',65,205,22,C.text);
            const drm=mediaCaps.drm||{};
            c.text(drm.configuration==='configuration-rejected'?'DRM-Modul nicht verwendbar; Konfiguration prüfen':mediaCaps.secure===false?'Widevine-Prüfung: zuerst eine HTTPS-Seite öffnen':mediaCaps.widevine?'Widevine erkannt - Anbieterwiedergabe noch einzeln zu prüfen':drm.configuration==='no-cdm'?'Kein Widevine-Modul installiert; geschützte Streams benötigen ein eigenes Modul':'Widevine nicht verfügbar - geschützte Streams sind nicht bestätigt',65,235,20,C.muted);
            c.text('H.264: '+(mediaCaps.h264?'Ja':'Nein')+'   VP9: '+(mediaCaps.vp9?'Ja':'Nein'),65,265,18,C.muted);
            c.text(audioLabel(mediaCaps.audio),65,295,18,C.muted);
        }
        [['YouTube','https://www.youtube.com/'],['Netflix','https://www.netflix.com/login'],['Disney+','https://www.disneyplus.com/'],['Prime Video','https://www.primevideo.com/'],['Paramount+','https://www.paramountplus.com/']].forEach((item,i)=>button(c,64+i*296,320,278,44,item[0],()=>browser.newTab(item[1]),'stream-'+i));
        button(c,64,380,352,44,audioBusy?'Testton läuft ...':'Testton (1 s)',testAudio,'audio-test',{enabled:!audioBusy&&!!mediaCaps&&mediaCaps.mediaEnabled});
        button(c,450,380,352,44,'Wiedergabe / Pause',async()=>{await browser.mediaAction('toggle');panel=null;enterPage();},'media-toggle',{enabled:!!mediaCaps&&mediaCaps.mediaEnabled});
        button(c,836,380,352,44,'Video-Vollbild',()=>browser.mediaAction('fullscreen'),'media-fullscreen',{enabled:!!mediaCaps&&mediaCaps.mediaEnabled});
        if(process.env.MGU_EMULATOR_MODE==='1')button(c,644,bottom-52,250,42,mediaBusy?'Video wird erzeugt ...':'Vollbild testen',async()=>{mediaBusy=true;try{await browser.request('mediaDemo');}finally{mediaBusy=false;}},'media-demo',{enabled:!mediaBusy});
        if(process.env.MGU_EMULATOR_MODE==='1')button(c,920,bottom-52,250,42,'Widevine-Test öffnen',()=>browser.newTab('https://shaka-player-demo.appspot.com/demo/'),'drm-demo');
        button(c,1288,bottom-52,246,42,'Zurueck',()=>{panel='settings';},'streaming-back');
    }
    function drawKeyboard(c,bottom){
        const x=W-SIDE;c.fillRect(x,BAR,SIDE,bottom-BAR,C.panel);c.fillRect(x,BAR,1,bottom-BAR,C.line);
        c.text(String(keyboard).indexOf('vault-')===0?keyboard==='vault-confirm'?'Masterpasswort bestätigen':'Masterpasswort':keyboard==='browser-auth-username'?'Benutzername eingeben':keyboard==='browser-auth-password'?'Passwort eingeben':keyboard==='browser-find'?'Auf der Seite suchen':keyboard==='homepage'?'Startseite':keyboard==='url'?'Adresse oder Suche':keyboard==='wifi-ssid'?'WLAN-Name':keyboard==='structured'?'Datum / Uhrzeit':keyboard==='wifi-password'||password?'Passwort eingeben':'Text eingeben',x+22,96,24,C.text);
        button(c,x+SIDE-66,70,44,34,'X',dismissKeyboard,'keyboard-close',{flat:true});
        [['abc','ABC'],['123','123'],['symbols','#+=']].forEach((m,i)=>button(c,x+20+i*146,116,132,36,m[1],()=>{keyMode=m[0];},'mode-'+m[0],{primary:keyMode===m[0]}));
        button(c,x+458,116,122,36,upper?'AA':'Aa',()=>{upper=!upper;},'shift');
        const rows=keyMode==='abc'?locale.keyboard():keyMode==='123'?['1234567890','.,:;?!@-_/','()[]{}%+=']:['.,:;!?@#','%&=+_-~$','/\\|()[]{}','<>*\'"^'];
        rows.forEach((row,r)=>row.split('').forEach((ch,i)=>{
            const value=upper?(ch==='ß'?'ẞ':ch.toUpperCase()):ch;
            button(c,x+20+i*56+(10-row.length)*2,168+r*48,50,40,value,()=>type(value),'key-'+r+'-'+i);
        }));
        if(keyboard==='text')[['Links','ArrowLeft'],['Rechts','ArrowRight'],['Alles','a'],['Tab','Tab'],['Enter','Enter']].forEach((item,i)=>button(c,x+20+i*112,328,104,38,item[0],()=>browser.key(item[1],item[1]==='a'?{ctrl:true}:false),'edit-key-'+i));
        if(keyboard!=='text')c.text(keyboard==='browser-auth-password'?'*'.repeat(Math.min(draft.length,36)):keyboard==='browser-auth-username'||keyboard==='browser-find'?draft.slice(0,58):keyboard==='structured'?(draft||({date:'JJJJ-MM-TT',month:'JJJJ-MM',week:'JJJJ-Www',time:'HH:MM', 'datetime-local':'JJJJ-MM-TTTHH:MM'})[inputType]):keyboard.indexOf('vault-')===0?'*'.repeat(Math.min(draft.length,36)):keyboard.indexOf('wifi-')===0?'WLAN-Daten werden nicht protokolliert.':replaceDraft?'Erstes Zeichen ersetzt die Adresse.':'HTTPS wird automatisch ergaenzt.',x+22,376,16,C.muted,{literal:keyboard==='browser-find'||String(keyboard).indexOf('browser-auth-')===0});
        button(c,x+20,392,172,40,'Leerzeichen',()=>type(' '),'space');
        button(c,x+204,392,172,40,keyboard==='text'||keyboard.indexOf('wifi-')===0?'@':'.com',()=>type(keyboard==='text'||keyboard.indexOf('wifi-')===0?'@':'.com'),'suffix');
        button(c,x+388,392,192,40,'Loeschen',()=>{if(keyboard==='text')return browser.key('Backspace');if(replaceDraft){draft='';replaceDraft=false;}else draft=draft.slice(0,-1);},'delete');
        button(c,x+20,444,172,44,'Abbrechen',dismissKeyboard,'cancel');
        button(c,x+204,444,376,44,starting?'Laedt ...':keyboard==='homepage'?'Speichern':keyboard==='text'||keyboard.indexOf('wifi-')===0||keyboard.indexOf('vault-')===0?'Fertig':'Oeffnen',finishKeyboard,'done',{primary:true});
    }
    ctx.loop('MAIN',12,()=>{
        const cv=ctx.canvas(W,H).clear(C.bg),bottom=H+cv.extra;
        const hidden=!nativePrompt()&&!findBar&&!panel&&!keyboard&&(media.fullscreen||(!landing&&webMode&&frame&&(reading||(store.data.autoHide&&Date.now()-lastAction>6500))));
        const top=hidden?0:BAR+TABS;tipLabels={};page=null;
        const webSurface=!nativePrompt()&&!panel&&!landing&&gate.check().allowed;
        if(webSurface)page={x:0,y:top,w:W-(keyboard?SIDE:0),h:bottom-top};
        if(!hidden){toolbar(cv);tabstrip(cv);}
        if(nativePrompt()||panel==='browser-files'||panel==='browser-permissions')belowTabs(cv,()=>chrome.draw(cv,bottom-TABS,panel));
        else if(panel==='privacy-confirm')belowTabs(cv,()=>drawPrivacyConfirmation(cv,bottom-TABS));
        else if(panel==='passwords')belowTabs(cv,()=>drawPasswords(cv,bottom-TABS));
        else if(panel==='privacy')belowTabs(cv,()=>drawPrivacy(cv,bottom-TABS));
        else if(panel==='wifi-list')belowTabs(cv,()=>drawWifiList(cv,bottom-TABS));
        else if(panel==='streaming')belowTabs(cv,()=>drawStreaming(cv,bottom-TABS));
        else if(panel==='network')belowTabs(cv,()=>drawNetwork(cv,bottom-TABS));
        else if(panel==='settings')belowTabs(cv,()=>drawSettings(cv,bottom-TABS));
        else if(panel==='remote')belowTabs(cv,()=>drawRemote(cv,bottom-TABS));
        else if(landing||panel==='library')belowTabs(cv,()=>drawStart(cv,bottom-TABS));
        else if(frame&&gate.check().allowed){
            page={x:0,y:top,w:W-(keyboard?SIDE:0),h:bottom-top};
            cv.image(IMAGE,page.x,page.y,page.w,page.h);
            if(!keyboard&&!media.fullscreen){cv.target(page.x,page.y,page.w,page.h,enterPage,'page-controller');cv.targets[cv.targets.length-1].controllerOnly=true;tipLabels['page-controller']='Webseite steuern';}
        }else{cv.text(loading||browser.child&&!landing?'Seite wird geladen ...':'Browser bereit',W/2,280,27,C.muted,{align:'center'});}
        // Bootstrap a newly committed native view even before its first frame.
        // Waiting for an image before resizing can leave Ozone with no paint
        // and no hit-test surface after navigation.
        if(webSurface&&browser.child&&page){
            const width=1280,height=Math.max(200,Math.min(720,Math.round(width*page.h/page.w))),zoom=store.data.zoom,key=width+'x'+height+'@'+zoom;
            if(key!==resized&&Date.now()>=resizeRetry){resized=key;safe(async()=>{try{await browser.resize(width,height,zoom);resizeRetry=0;}catch(error){if(resized===key)resized='';resizeRetry=Date.now()+250;throw error;}});}
        }
        if(hidden&&!media.fullscreen){
            cv.roundRect(12,8,60,28,9,'#202833');icon(cv,'more',42,22,C.text);
            cv.target(12,8,60,28,()=>{browser.cancelController();webMode=false;reading=false;activity();},'show-toolbar');tipLabels['show-toolbar']='Browserleiste anzeigen';
        }
        if(media.fullscreen&&media.playerMode&&!nativePrompt()&&!panel&&!keyboard&&!media.hasSiteControls)drawVideoControls(cv,bottom);
        if(keyboard){cv.targets=cv.targets.filter(t=>t.y<BAR+TABS||t.x+t.w<=W-SIDE);belowTabs(cv,()=>drawKeyboard(cv,bottom-TABS));}
        if(findBar&&!nativePrompt()&&!panel&&!keyboard)drawFind(cv,top);
        if(panel==='network'&&!wifiBusy&&Date.now()-wifiPoll>2500){wifiPoll=Date.now();safe(refreshWifi);}
        if(panel==='remote'&&remoteState&&remoteState.active&&!remoteBusy&&Date.now()-remotePoll>2000){remotePoll=Date.now();safe(async()=>{const s=await browser.request('remoteStatus');if(panel==='remote'){remoteState=s;showQR(s.url);}});}
        const focused=ctx.display&&ctx.display.focusKey,focusedKey=focused&&focused.slice(0,4)==='tgt:'?focused.slice(4):'';
        const hint=Date.now()<toastUntil?toast:storageIssue||!webMode&&!keyboard&&!panel&&!landing&&tipLabels[focusedKey];
        if(hint&&!media.fullscreen){const w=Math.min(W-32,ascii(hint).length*10+42);cv.roundRect((W-w)/2,bottom-42,w,31,8,'#253243');cv.text(ascii(hint),(W-w)/2+20,bottom-20,17,C.text);}
        cv.scroll=false;return ui.image('MAIN_GFX',cv);
    });
    process.once('exit',()=>{locale.close();browser.destroy();});
}});
