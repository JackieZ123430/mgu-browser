'use strict';
const Events=require('./input_events'),Structured=require('./structured_input'),Focus=require('./browser_input_focus'),Viewport=require('./browser_viewport');
// Use Chromium's native focus order, including cross-origin frames and shadow
// roots. Keep a turn followed by a press in order even over independent IPCs.
const inspectExpression='('+function(mark){
    let root=document,e=null,depth=0,token='',prefix='',embedded=false;
    const identityOf=e=>{let part=e,steps=0,identity='';while(part&&steps++<12){let sibling=part.previousElementSibling,index=0;while(sibling&&index<1024){index++;sibling=sibling.previousElementSibling;}identity='/'+part.tagName+':'+index+identity;part=part.parentElement;}return identity;};
    while(root&&depth++<20){
        e=root.activeElement;if(!e)break;
        // Build a bounded identity path instead of enumerating every field in
        // a potentially large document for each controller detent.
        prefix=token;token+=':'+identityOf(e)+':'+(e.type||'');
        if(mark&&root.querySelector&&!root.querySelector('style[data-mgu-focus]')){
            const style=document.createElement('style');style.setAttribute('data-mgu-focus','');
            style.textContent=':focus { outline: 3px solid #78bfff !important; outline-offset: 3px !important; }';
            (root.head||root).appendChild(style);
        }
        if(e.shadowRoot){root=e.shadowRoot;continue;}
        if(e.tagName==='IFRAME'||e.tagName==='FRAME'){
            try{if(e.contentDocument){embedded=true;root=e.contentDocument;continue;}}catch(ignore){}
        }
        break;
    }
    const type=(e&&e.type||'').toLowerCase();
    const editable=!!e&&!e.disabled&&!e.readOnly&&(e.isContentEditable||e.tagName==='TEXTAREA'||(e.tagName==='INPUT'&&!/^(button|submit|reset|checkbox|radio|range|file|color|hidden|image)$/.test(type)));
    if(mark&&e&&e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'});
    const adjustable=e&&e.tagName==='SELECT'?'select':type==='range'?'range':type==='radio'?'radio':'';
    let adjustmentIdentity=token;if(adjustable==='radio'&&e.name){const group=e.name+'\0'+identityOf(e.form);let hash=2166136261;for(let i=0;i<group.length;i++)hash=Math.imul(hash^group.charCodeAt(i),16777619);adjustmentIdentity=prefix+':radio:'+(hash>>>0);}
    return {editable,password:type==='password',type,embedded,nativePdf:document.contentType==='application/pdf',tag:e&&e.tagName||'',multiline:!!e&&(e.tagName==='TEXTAREA'||e.isContentEditable),token:editable?token:'',identity:token,adjustmentIdentity,adjustable,focused:!!e&&e.tagName!=='BODY'&&e.tagName!=='HTML',activation:/^(checkbox|radio)$/.test(type)?' ':'Enter'};
}.toString()+')';

module.exports={
    inputTask(fn){
        const pipe=this.pipe,session=this.session,epoch=this.epoch,view=this.pageGeneration,frameView=this.inputFrameGeneration||0;
        const check=()=>{this.requireAllowed();if(!pipe||this.pipe!==pipe||this.session!==session||this.epoch!==epoch||this.pageGeneration!==view||(this.inputFrameGeneration||0)!==frameView)throw new Error('Webseite wurde gewechselt');};
        const send=async(method,params)=>{check();const value=await pipe.send(method,Viewport.inputParams(this.viewport,method,params),session);check();return value;};
        const key=async(value,shift)=>{
            const data=Events.key(value,shift);
            await send('Input.dispatchKeyEvent',Object.assign({type:'keyDown'},data));
            return send('Input.dispatchKeyEvent',Object.assign({type:'keyUp'},data));
        };
        const work=(this.inputQueue||Promise.resolve()).catch(()=>{}).then(()=>{check();return fn({send,key,check,session});});
        this.inputQueue=work;return work;
    },
    focusPage(delta){
        if(!Number.isInteger(delta)||!delta||Math.abs(delta)>16)return Promise.reject(new Error('Ungueltige Controller-Drehung'));
        return this.inputTask(async context=>{
            let info;
            if(this.rotaryControl){
                info=await this.inspectFocusedInput(context,true);
                const mode=this.rotaryControl;
                if(info&&mode.session===this.session&&mode.view===this.pageGeneration&&mode.identity===(info.adjustmentIdentity||info.identity)&&mode.kind===info.adjustable){
                    const key=(mode.kind==='range'||mode.kind==='radio')?(delta<0?'ArrowLeft':'ArrowRight'):(delta<0?'ArrowUp':'ArrowDown');
                    for(let n=0;n<Math.abs(delta);n++)await context.key(key);
                    context.check();info.adjusting=true;this.lastInput=JSON.stringify(info);this.emit('input',info);return info;
                }
                this.rotaryControl=null;
            }
            for(let n=0;n<Math.abs(delta);n++){
                await context.key('Tab',delta<0);
                info=await this.inspectFocusedInput(context,true);
                // Chromium includes its document boundary in the focus cycle.
                // Skip that boundary so every detent has a visible selection.
                if(info&&!info.focused&&!info.nativePdf){await context.key('Tab',delta<0);info=await this.inspectFocusedInput(context,true);}
            }
            context.check();if(info){this.lastInput=JSON.stringify(info);this.emit('input',info);}return info;
        });
    },
    pressPage(){
        return this.inputTask(async context=>{
            const info=await this.inspectFocusedInput(context,false);
            if(info&&info.editable){context.check();this.lastInput=JSON.stringify(info);this.emit('input',info);return info;}
            if(info&&info.adjustable){
                const mode=this.rotaryControl;
                const finish=!!mode&&mode.session===this.session&&mode.view===this.pageGeneration&&mode.identity===(info.adjustmentIdentity||info.identity);
                // Native arrows change a closed select reliably. Opening its
                // platform popup would hide the choices from the screencast.
                if(!finish&&info.adjustable==='radio')await context.key(' ');
                this.rotaryControl=finish?null:{session:this.session,view:this.pageGeneration,identity:info.adjustmentIdentity||info.identity,kind:info.adjustable};
                info.adjusting=!finish;context.check();this.lastInput=JSON.stringify(info);this.emit('input',info);return info;
            }
            this.rotaryControl=null;
            await context.key(info&&info.activation||'Enter');this.inspectInput();
        });
    },
    inspectFocusedInput(context,mark){return Focus.inspect(this,context,mark,inspectExpression+'('+!!mark+')');},
    fillStructured(value){return this.inputTask(async context=>{const result=await Structured.fill(this,context,value);this.inspectInput();return result;});},
    leavePage(){return this.inputTask(()=>{this.rotaryControl=null;});},
    inputExpression:inspectExpression+'(false)'
};
