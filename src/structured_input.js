'use strict';
const Focus=require('./browser_input_focus');
const TYPES=['date','month','week','time','datetime-local'];
function parse(type,value){
    if(TYPES.indexOf(type)<0||typeof value!=='string'||value.length>32)throw new Error('Ungueltiges Datums- oder Zeitfeld');
    if(value==='')return{expected:'',fields:{},clear:true};
    const fields={};let time=value,date=value;
    const calendar=text=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!m)throw new Error('Datum als JJJJ-MM-TT eingeben');const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),d=new Date(0);d.setUTCFullYear(y,month-1,day);if(y<1||d.getUTCFullYear()!==y||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)throw new Error('Ungueltiges Datum');Object.assign(fields,{year:m[1],month:m[2],day:m[3]});};
    if(type==='datetime-local'){const parts=value.split('T');if(parts.length!==2)throw new Error('Datum und Zeit als JJJJ-MM-TTTHH:MM eingeben');date=parts[0];time=parts[1];}
    if(type==='date'||type==='datetime-local')calendar(date);
    if(type==='month'){const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);if(!m||Number(m[1])<1)throw new Error('Monat als JJJJ-MM eingeben');Object.assign(fields,{year:m[1],month:m[2]});}
    if(type==='week'){const m=/^(\d{4})-W(\d{2})$/.exec(value);if(!m||Number(m[1])<1)throw new Error('Woche als JJJJ-Www eingeben');const y=Number(m[1]),d=new Date(0);d.setUTCFullYear(y,0,1);const leap=y%4===0&&(y%100!==0||y%400===0),weeks=d.getUTCDay()===4||d.getUTCDay()===3&&leap?53:52;if(Number(m[2])<1||Number(m[2])>weeks)throw new Error('Ungueltige Kalenderwoche');Object.assign(fields,{year:m[1],week:m[2]});}
    let canonical=value;
    if(type==='time'||type==='datetime-local'){
        const m=/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(time);if(!m)throw new Error('Zeit als HH:MM eingeben');Object.assign(fields,{hour:m[1],minute:m[2]});if(m[3])fields.second=m[3];if(m[4])fields.millisecond=(m[4]+'00').slice(0,3);
        const seconds=m[3]&&Number(m[3]),millis=m[4]&&Number(m[4]);canonical=(type==='datetime-local'?date+'T':'')+m[1]+':'+m[2]+(seconds||millis?':'+(m[3]||'00'):'')+(millis?'.'+(m[4]+'00').slice(0,3):'');
    }
    return{expected:canonical,fields};
}
async function fill(browser,context,value){
    const field=await Focus.resolve(browser,context),objectId=field.objectId;if(!objectId){await field.cleanup();throw new Error('Zuerst ein Datums- oder Zeitfeld auswaehlen');}
    const native={send:field.send,key:context.key};context=native;
    try{
        const state=await context.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return{type:this.type||"",disabled:!!this.disabled,readOnly:!!this.readOnly,connected:!!this.isConnected};}',returnByValue:true}),info=state.result.value;
        if(!info.connected||info.disabled||info.readOnly)throw new Error('Dieses Eingabefeld ist nicht bearbeitbar');const parsed=parse(info.type,value);
        const tree=await context.send('DOM.describeNode',{objectId,depth:10,pierce:true}),shadow=(tree.node.shadowRoots||[]).find(n=>n.shadowRootType==='user-agent'),fields={};let budget=128;
        const visit=node=>{if(!node||budget--<=0)return;const a=node.attributes||[],attrs={};for(let i=0;i<a.length;i+=2)attrs[a[i]]=a[i+1];const m=/^-webkit-datetime-edit-(year|month|day|week|hour|minute|second|millisecond|ampm)-field$/.exec(attrs.pseudo||'');if(m)fields[m[1]]={id:node.backendNodeId,attrs};for(const child of node.children||[])visit(child);};visit(shadow);
        if(!shadow)throw new Error('Datums- oder Zeitsteuerung nicht verfuegbar');
        for(const name of Object.keys(parsed.fields))if(!fields[name]&&Number(parsed.fields[name])!==0)throw new Error('Dieses Zeitfeld unterstuetzt die angegebene Genauigkeit nicht');
        const assertFocus=async()=>{const r=await context.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this.isConnected&&!this.disabled&&!this.readOnly&&this.ownerDocument.hasFocus()&&this.getRootNode().activeElement===this;}',returnByValue:true});if(!r.result.value)throw new Error('Eingabefeld wurde gewechselt');};
        const names=parsed.clear?Object.keys(fields):Object.keys(parsed.fields);
        for(const name of names){const field=fields[name];if(!field)continue;await context.send('DOM.focus',{backendNodeId:field.id});await assertFocus();await context.key('Backspace');if(!parsed.clear){const text=name==='hour'&&field.attrs['aria-valuemax']==='12'?('0'+(Number(parsed.fields.hour)%12||12)).slice(-2):parsed.fields[name];for(const digit of text){await assertFocus();await context.key(digit);}}}
        if(!parsed.clear&&fields.ampm&&parsed.fields.hour!==undefined){
            const desired=Number(parsed.fields.hour)>=12?2:1,field=fields.ampm;await context.send('DOM.focus',{backendNodeId:field.id});
            for(let i=0;i<3;i++){const current=await context.send('DOM.describeNode',{backendNodeId:field.id,depth:0}),a=current.node.attributes||[];let actual;for(let n=0;n<a.length;n+=2)if(a[n]==='aria-valuenow')actual=Number(a[n+1]);if(actual===desired)break;await assertFocus();await context.key('ArrowUp');}
        }
        const result=await context.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(expected){return{matches:this.value===expected,valid:this.validity.valid};}',arguments:[{value:parsed.expected}],returnByValue:true});
        if(!result.result.value.matches)throw new Error('Datums- oder Zeitwert konnte nicht vollstaendig gesetzt werden');return{filled:true,type:info.type,valid:result.result.value.valid};
    }finally{await field.cleanup();}
}
module.exports={TYPES,parse,fill};
