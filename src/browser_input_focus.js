'use strict';
// Read only focused-element metadata, including authored closed shadow roots
// and the focused cross-origin frame. Never enumerate field values or AX text.
const focused='document.activeElement';
async function resolve(browser,context){
    const pipe=browser.pipe,refs=[],mainSession=context.session||browser.session;let send=context.send,currentSession=mainSession,currentTarget=browser.target,currentFrame=browser.mainFrame||browser.target,prefix='';
    const check=()=>{if(context.check)context.check();if(browser.pipe!==pipe)throw new Error('Webseite wurde gewechselt');};
    const keep=(result,scoped)=>{const objectId=result&&result.objectId;if(objectId)refs.push({objectId,send:scoped});return objectId;};
    const cleanup=async()=>{for(let i=refs.length-1;i>=0;i--)await refs[i].send('Runtime.releaseObject',{objectId:refs[i].objectId}).catch(()=>{});};
    try{
        let r=await send('Runtime.evaluate',{expression:focused}),objectId=keep(r.result,send);
        for(let depth=0;objectId&&depth<12;depth++){
            const brief=await send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return{tag:this.tagName||"",type:this.type||"",editable:!!this.isContentEditable};}',returnByValue:true}),info=brief.result.value;
            if(info.type||info.editable)return{objectId,send,prefix,session:currentSession,frameId:currentFrame,cleanup};
            const described=await send('DOM.describeNode',{objectId,depth:0,pierce:true}),node=described.node;
            const shadow=(node.shadowRoots||[]).find(s=>s.shadowRootType==='closed'||s.shadowRootType==='open');
            if(shadow){
                const root=await send('DOM.resolveNode',{backendNodeId:shadow.backendNodeId}),rootId=keep(root.object,send);if(!rootId)break;
                r=await send('Runtime.callFunctionOn',{objectId:rootId,functionDeclaration:'function(){return this.activeElement;}'});const next=keep(r.result,send);if(!next)break;prefix+=':shadow:'+node.backendNodeId;objectId=next;continue;
            }
            if((info.tag==='IFRAME'||info.tag==='FRAME')&&node.contentDocument){
                const root=await send('DOM.resolveNode',{backendNodeId:node.contentDocument.backendNodeId}),rootId=keep(root.object,send);if(!rootId)break;
                r=await send('Runtime.callFunctionOn',{objectId:rootId,functionDeclaration:'function(){return this.activeElement;}'});const next=keep(r.result,send);if(!next)break;prefix+=':frame:'+node.frameId+':document:'+node.contentDocument.backendNodeId;currentFrame=node.frameId;objectId=next;continue;
            }
            if((info.tag==='IFRAME'||info.tag==='FRAME')&&node.frameId){
                const frames=typeof browser.relatedFrames==='function'?browser.relatedFrames(mainSession):[],target=frames.find(f=>f.target===node.frameId&&f.parentSession===currentSession&&f.parentTarget===currentTarget);
                if(!target)break;const sid=target.session,captured={target:target.target,epoch:target.epoch,generation:target.generation};
                send=async(method,params)=>{check();const owner=browser.frameOwner(sid);if(!owner||owner.target!==captured.target||owner.epoch!==captured.epoch||owner.generation!==captured.generation)throw new Error('Eingaberahmen wurde gewechselt');const value=await pipe.send(method,params,sid,1500);check();const current=browser.frameOwner(sid);if(!current||current.target!==captured.target||current.epoch!==captured.epoch||current.generation!==captured.generation)throw new Error('Eingaberahmen wurde gewechselt');return value;};currentTarget=target.target;currentSession=sid;currentFrame=target.frameId;
                r=await send('Runtime.evaluate',{expression:'document.hasFocus()?document.activeElement:null'});const next=keep(r.result,send);if(!next)break;prefix+=':frame:'+target.target+':generation:'+target.generation;objectId=next;continue;
            }
            return{objectId,send,prefix,session:currentSession,frameId:currentFrame,cleanup};
        }
        return{objectId:null,send,prefix,session:currentSession,frameId:currentFrame,cleanup};
    }catch(error){await cleanup();throw error;}
}
const metadata=function(mark,prefix){
    const e=this,root=e.getRootNode(),type=(e.type||'').toLowerCase();
    if(!e.isConnected||!e.ownerDocument.hasFocus()||root.activeElement!==e)return null;
    const identityOf=n=>{let text='',count=0;while(n&&count++<12){let p=n.previousElementSibling,index=0;while(p&&index<1024){index++;p=p.previousElementSibling;}text='/'+n.tagName+':'+index+text;n=n.parentElement;}return text;};
    const identity=prefix+':'+identityOf(e)+':'+type,editable=!e.disabled&&!e.readOnly&&(e.isContentEditable||e.tagName==='TEXTAREA'||e.tagName==='INPUT'&&!/^(button|submit|reset|checkbox|radio|range|file|color|hidden|image)$/.test(type));
    const adjustable=e.tagName==='SELECT'?'select':type==='range'?'range':type==='radio'?'radio':'';let adjustmentIdentity=identity;
    if(adjustable==='radio'&&e.name){const text=e.name+'\0'+identityOf(e.form);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);adjustmentIdentity=prefix+':radio:'+(hash>>>0);}
    if(mark){if(root.querySelector&&!root.querySelector('style[data-mgu-focus]')){const style=e.ownerDocument.createElement('style');style.setAttribute('data-mgu-focus','');style.textContent=':focus{outline:3px solid #78bfff!important;outline-offset:3px!important}';(root.head||root).appendChild(style);}if(e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'});}
    return{editable:!!editable,password:type==='password',type,tag:e.tagName||'',multiline:!!(e.tagName==='TEXTAREA'||e.isContentEditable),token:editable?identity:'',identity,adjustmentIdentity,adjustable,focused:e.tagName!=='BODY'&&e.tagName!=='HTML',activation:/^(checkbox|radio)$/.test(type)?' ':'Enter'};
}.toString();
async function inspect(browser,context,mark,expression){
    const result=await context.send('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails||!result.result||!result.result.value)throw new Error('Eingabefeld konnte nicht geprueft werden');const info=result.result.value;
    if(!info.embedded&&(info.editable||info.adjustable||info.type||!info.focused||/^(A|AREA|SUMMARY|DETAILS|AUDIO|VIDEO|OBJECT|EMBED)$/.test(info.tag||''))){browser.inputFocusedFrame={session:context.session||browser.session,frameId:browser.mainFrame||browser.target};return info;}
    const field=await resolve(browser,context);
    try{if(!field.objectId){browser.inputFocusedFrame=null;if(info.embedded||/^(IFRAME|FRAME)$/.test(info.tag||''))throw new Error('Eingaberahmen wurde gewechselt');return info;}const r=await field.send('Runtime.callFunctionOn',{objectId:field.objectId,functionDeclaration:metadata,arguments:[{value:!!mark},{value:info.identity+field.prefix}],returnByValue:true});if(r.exceptionDetails||!r.result||!r.result.value){browser.inputFocusedFrame=null;throw new Error('Eingabefeld wurde gewechselt');}browser.inputFocusedFrame={session:field.session,frameId:field.frameId};return r.result.value;}
    finally{await field.cleanup();}
}
module.exports={resolve,inspect};
