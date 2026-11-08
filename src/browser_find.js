'use strict';
// Use Chromium's rendered-text search. Isolated worlds retain the ordinary
// selection and scrolling behaviour without calling a page-replaced find().
const WORLD='mgu-browser-find',MAX_FRAMES=64;
const search=function(query,caseSensitive,backwards,edge){
    const selection=window.getSelection(),saved=[],anchor=selection&&selection.anchorNode,focus=selection&&selection.focusNode,anchorOffset=selection&&selection.anchorOffset,focusOffset=selection&&selection.focusOffset;
    if(edge&&selection){
        for(let i=0;i<Math.min(selection.rangeCount,16);i++)saved.push(selection.getRangeAt(i).cloneRange());
        const range=document.createRange();range.selectNodeContents(document.documentElement);range.collapse(!backwards);
        selection.removeAllRanges();selection.addRange(range);
    }
    const found=window.find(query,caseSensitive,backwards,false,false,false,false);
    // A failed search in another frame must not destroy its user's selection.
    if(!found&&edge&&selection){selection.removeAllRanges();if(saved.length===1&&anchor&&focus&&selection.setBaseAndExtent)selection.setBaseAndExtent(anchor,anchorOffset,focus,focusOffset);else for(const range of saved)selection.addRange(range);}
    return found;
}.toString();
function options(value){
    if(value===undefined)return {backwards:false,caseSensitive:false};
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['backwards','caseSensitive'].includes(k))||Object.keys(value).some(k=>typeof value[k]!=='boolean'))throw Error('Ungueltige Sucheinstellung');
    return {backwards:value.backwards===true,caseSensitive:value.caseSensitive===true};
}
module.exports={
    findText(query,value){
        let o;
        try{if(typeof query!=='string'||query.length>256||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(query))throw Error('Suchtext darf hoechstens 256 Zeichen enthalten');o=options(value);}catch(e){return Promise.reject(e);}
        if(!query)return Promise.resolve(this.clearFind());
        const serial=this.findSerial=(this.findSerial||0)+1;
        return this.inputTask(async context=>{
            const pipe=this.pipe,main=context.session,frameGeneration=this.inputFrameGeneration||0,deadline=Date.now()+5000;
            const check=()=>{context.check();if(this.findSerial!==serial)throw Error('Suche wurde geschlossen');if((this.inputFrameGeneration||0)!==frameGeneration)throw Error('Suchrahmen wurde gewechselt');if(Date.now()>deadline)throw Error('Suche dauert zu lange');};
            check();
            const send=async(session,method,params)=>{check();const result=await pipe.send(method,params,session,1500);check();return result;};
            const related=typeof this.relatedFrames==='function'?this.relatedFrames(main):[];
            const sessions=[main].concat(related.map(f=>f.session));
            if(sessions.length>MAX_FRAMES)throw Error('Zu viele Rahmen fuer die Seitensuche');
            const trees=new Map(),owners=new Map();
            for(const session of sessions){
                if(session!==main){const owner=this.frameOwner(session);if(!owner||owner.mainSession!==main)continue;owners.set(owner.frameId,session);}
                const result=await send(session,'Page.getFrameTree',{});if(result.frameTree)trees.set(session,result.frameTree);
            }
            const scopes=[],seen=new Set();
            const visit=(tree,session,ancestors)=>{
                if(!tree||!tree.frame||seen.has(tree.frame.id))return;
                const id=tree.frame.id,actual=owners.get(id)||session,owned=trees.get(actual);
                seen.add(id);if(scopes.length>=MAX_FRAMES)throw Error('Zu viele Rahmen fuer die Seitensuche');
                scopes.push({id,session:actual,ancestors});const parents=ancestors.concat([{id,session:actual}]);
                for(const child of (actual!==session&&owned?owned:tree).childFrames||[])visit(child,actual,parents);
                // OOPIF roots are deliberately absent from the parent's CDP
                // frame tree. Include only roots whose recorded parent is this
                // verified active-tab frame, never arbitrary discovered pages.
                for(const child of related)if(child.parentFrame===id&&child.parentSession===actual)visit(trees.get(child.session),child.session,parents);
            };
            visit(trees.get(main),main,[]);
            if(!scopes.length)throw Error('Webseite kann nicht durchsucht werden');
            for(const scope of scopes){
                if(scope.session!==main){const owner=this.frameOwner(scope.session);if(!owner||owner.mainSession!==main||owners.get(owner.frameId)!==scope.session)throw Error('Suchrahmen wurde gewechselt');}
                const created=await send(scope.session,'Page.createIsolatedWorld',{frameId:scope.id,worldName:WORLD});scope.context=created.executionContextId;
            }
            const evaluate=async(scope,expression)=>{
                const result=await send(scope.session,'Runtime.evaluate',{expression,contextId:scope.context,returnByValue:true});
                if(result.exceptionDetails||!result.result||typeof result.result.value!=='boolean')throw Error('Webseite konnte nicht durchsucht werden');
                return result.result.value;
            };
            const previous=this.findState;
            let start=previous&&previous.query===query&&previous.caseSensitive===o.caseSensitive?scopes.findIndex(s=>s.id===previous.frame&&s.session===previous.session):-1;
            if(start<0){
                start=0;
                for(let i=0;i<scopes.length;i++)if(await evaluate(scopes[i],'document.hasFocus()&&!/^(IFRAME|FRAME)$/.test(document.activeElement&&document.activeElement.tagName||"")'))start=i;
            }
            const test=(scope,edge)=>evaluate(scope,'('+search+')('+JSON.stringify(query)+','+o.caseSensitive+','+o.backwards+','+edge+')');
            let selected=scopes[start],found=await test(selected,false);
            for(let n=1;!found&&n<scopes.length;n++){
                const index=(start+(o.backwards?-n:n)+scopes.length)%scopes.length;
                selected=scopes[index];found=await test(selected,true);
            }
            if(!found){selected=scopes[start];found=await test(selected,true);}
            check();
            this.findState={query,caseSensitive:o.caseSensitive,frame:selected.id,session:selected.session,ancestors:selected.ancestors};
            const state={active:true,query,found,backwards:o.backwards,caseSensitive:o.caseSensitive};this.emit('find',state);return state;
        });
    },
    clearFind(){
        this.requireAllowed();return this.resetFindState();
    },
    resetFindState(){
        this.findSerial=(this.findSerial||0)+1;this.findState=null;
        const state={active:false,query:'',found:false};this.emit('find',state);return state;
    },
    retireFind(session,frame){
        const state=this.findState;if(!state)return false;
        const ancestors=state.ancestors||[];
        // Frame IDs are unique throughout this CDP connection. A parent
        // session reports detached OOPIF IDs, so compare the owned frame path
        // rather than assuming the event and selected frame share a session.
        const affected=frame?state.frame===frame||ancestors.some(item=>item.id===frame):state.session===session||ancestors.some(item=>item.session===session);
        if(!affected)return false;this.resetFindState();return true;
    },
    findEvent(event){
        const p=event.params||{},session=event.sessionId;
        if(event.method==='Page.frameNavigated'&&p.frame&&typeof p.frame.id==='string')this.retireFind(session,p.frame.id);
        else if(event.method==='Page.frameDetached'&&typeof p.frameId==='string')this.retireFind(session,p.frameId);
        else if(event.method==='Runtime.executionContextsCleared')this.retireFind(session);
        else if(event.method==='Target.detachedFromTarget'&&typeof p.sessionId==='string')this.retireFind(p.sessionId);
    }
};
