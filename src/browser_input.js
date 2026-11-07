'use strict';
// Use Chromium's native focus order, including cross-origin frames and shadow
// roots. Keep a turn followed by a press in order even over independent IPCs.
const inspectExpression='('+function(mark){
    let root=document,e=null,depth=0,token='';
    while(root&&depth++<20){
        e=root.activeElement;if(!e)break;
        // Build a bounded identity path instead of enumerating every field in
        // a potentially large document for each controller detent.
        let part=e,steps=0,identity='';
        while(part&&steps++<12){let sibling=part.previousElementSibling,index=0;while(sibling&&index<1024){index++;sibling=sibling.previousElementSibling;}identity='/'+part.tagName+':'+index+identity;part=part.parentElement;}
        token+=':'+identity+':'+(e.type||'');
        if(mark&&root.querySelector&&!root.querySelector('style[data-mgu-focus]')){
            const style=document.createElement('style');style.setAttribute('data-mgu-focus','');
            style.textContent=':focus { outline: 3px solid #78bfff !important; outline-offset: 3px !important; }';
            (root.head||root).appendChild(style);
        }
        if(e.shadowRoot){root=e.shadowRoot;continue;}
        if(e.tagName==='IFRAME'||e.tagName==='FRAME'){
            try{if(e.contentDocument){root=e.contentDocument;continue;}}catch(ignore){}
        }
        break;
    }
    const type=(e&&e.type||'').toLowerCase();
    const editable=!!e&&!e.disabled&&!e.readOnly&&(e.isContentEditable||e.tagName==='TEXTAREA'||(e.tagName==='INPUT'&&!/^(button|submit|reset|checkbox|radio|range|file|color|hidden|image)$/.test(type)));
    if(mark&&e&&e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'});
    return {editable,password:type==='password',token:editable?token:'',identity:token,adjustable:e&&e.tagName==='SELECT'?'select':type==='range'?'range':'',focused:!!e&&e.tagName!=='BODY'&&e.tagName!=='HTML',activation:/^(checkbox|radio)$/.test(type)?' ':'Enter'};
}.toString()+')';

module.exports={
    inputTask(fn){
        const pipe=this.pipe,session=this.session,epoch=this.epoch,view=this.pageGeneration;
        const check=()=>{this.requireAllowed();if(!pipe||this.pipe!==pipe||this.session!==session||this.epoch!==epoch||this.pageGeneration!==view)throw new Error('Webseite wurde gewechselt');};
        const send=async(method,params)=>{check();const value=await pipe.send(method,params,session);check();return value;};
        const key=async(value,shift)=>{
            const codes={Tab:9,Enter:13,Backspace:8,Escape:27,ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,' ':32};
            const data={key:value,modifiers:shift?8:0};if(codes[value])data.windowsVirtualKeyCode=codes[value];
            if(value===' '){data.code='Space';data.text=' ';data.unmodifiedText=' ';}
            if(value==='Enter'){data.code='Enter';data.text='\r';data.unmodifiedText='\r';}
            await send('Input.dispatchKeyEvent',Object.assign({type:'keyDown'},data));
            return send('Input.dispatchKeyEvent',Object.assign({type:'keyUp'},data));
        };
        const work=(this.inputQueue||Promise.resolve()).catch(()=>{}).then(()=>{check();return fn({send,key,check});});
        this.inputQueue=work;return work;
    },
    focusPage(delta){
        if(!Number.isInteger(delta)||!delta||Math.abs(delta)>16)return Promise.reject(new Error('Ungueltige Controller-Drehung'));
        return this.inputTask(async context=>{
            let info;
            if(this.rotaryControl){
                info=(await context.send('Runtime.evaluate',{expression:inspectExpression+'(true)',returnByValue:true})).result.value;
                const mode=this.rotaryControl;
                if(info&&mode.session===this.session&&mode.view===this.pageGeneration&&mode.identity===info.identity&&mode.kind===info.adjustable){
                    const key=mode.kind==='range'?(delta<0?'ArrowLeft':'ArrowRight'):(delta<0?'ArrowUp':'ArrowDown');
                    for(let n=0;n<Math.abs(delta);n++)await context.key(key);
                    context.check();info.adjusting=true;this.lastInput=JSON.stringify(info);this.emit('input',info);return info;
                }
                this.rotaryControl=null;
            }
            for(let n=0;n<Math.abs(delta);n++){
                await context.key('Tab',delta<0);
                info=(await context.send('Runtime.evaluate',{expression:inspectExpression+'(true)',returnByValue:true})).result.value;
                // Chromium includes its document boundary in the focus cycle.
                // Skip that boundary so every detent has a visible selection.
                if(info&&!info.focused){await context.key('Tab',delta<0);info=(await context.send('Runtime.evaluate',{expression:inspectExpression+'(true)',returnByValue:true})).result.value;}
            }
            context.check();if(info){this.lastInput=JSON.stringify(info);this.emit('input',info);}return info;
        });
    },
    pressPage(){
        return this.inputTask(async context=>{
            const info=(await context.send('Runtime.evaluate',{expression:inspectExpression+'(false)',returnByValue:true})).result.value;
            if(info&&info.editable){context.check();this.lastInput=JSON.stringify(info);this.emit('input',info);return info;}
            if(info&&info.adjustable){
                const mode=this.rotaryControl;
                const finish=!!mode&&mode.session===this.session&&mode.view===this.pageGeneration&&mode.identity===info.identity;
                // Native arrows change a closed select reliably. Opening its
                // platform popup would hide the choices from the screencast.
                this.rotaryControl=finish?null:{session:this.session,view:this.pageGeneration,identity:info.identity,kind:info.adjustable};
                info.adjusting=!finish;context.check();this.lastInput=JSON.stringify(info);this.emit('input',info);return info;
            }
            this.rotaryControl=null;
            await context.key(info&&info.activation||'Enter');this.inspectInput();
        });
    },
    leavePage(){return this.inputTask(()=>{this.rotaryControl=null;});},
    inputExpression:inspectExpression+'(false)'
};
