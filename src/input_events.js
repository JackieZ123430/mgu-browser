'use strict';
const modifierNames={alt:1,ctrl:2,meta:4,shift:8};
function modifiers(value){
    if(value===undefined||value===null||value===false)return 0;if(value===true)return 8;
    if(typeof value!=='object'||Array.isArray(value))throw new Error('Ungueltige Tastenmodifikatoren');
    let mask=0;for(const name of Object.keys(value)){if(!Object.prototype.hasOwnProperty.call(modifierNames,name)||typeof value[name]!=='boolean')throw new Error('Ungueltige Tastenmodifikatoren');if(value[name])mask|=modifierNames[name];}return mask;
}
const special={Backspace:[8,'Backspace'],Tab:[9,'Tab'],Enter:[13,'Enter'],Shift:[16,'ShiftLeft'],Control:[17,'ControlLeft'],Alt:[18,'AltLeft'],Escape:[27,'Escape'],' ':[32,'Space'],PageUp:[33,'PageUp'],PageDown:[34,'PageDown'],End:[35,'End'],Home:[36,'Home'],ArrowLeft:[37,'ArrowLeft'],ArrowUp:[38,'ArrowUp'],ArrowRight:[39,'ArrowRight'],ArrowDown:[40,'ArrowDown'],Insert:[45,'Insert'],Delete:[46,'Delete'],Meta:[91,'MetaLeft']};
function key(value,options){
    if(typeof value!=='string'||!value||value.length>32)throw new Error('Ungueltige Taste');if(value==='Space')value=' ';
    const mask=modifiers(options),data={key:value,modifiers:mask};let known=special[value];
    if(/^F([1-9]|1[0-2])$/.test(value))known=[111+Number(value.slice(1)),value];
    if(known){data.windowsVirtualKeyCode=known[0];data.code=known[1];}
    else if(Array.from(value).length===1){if(/^[a-z]$/i.test(value)){data.code='Key'+value.toUpperCase();data.windowsVirtualKeyCode=value.toUpperCase().charCodeAt(0);}else if(/^[0-9]$/.test(value)){data.code='Digit'+value;data.windowsVirtualKeyCode=value.charCodeAt(0);}}
    else throw new Error('Ungueltige Taste');
    if(!(mask&7)&&(value==='Enter'||value===' '||Array.from(value).length===1)){data.text=value==='Enter'?'\r':value;data.unmodifiedText=data.text;}
    return data;
}
function point(x,y,viewport){if(!Number.isFinite(x)||!Number.isFinite(y)||!viewport)throw new Error('Ungueltige Zeigerposition');return{x:Math.max(0,Math.min(viewport.width-1,x)),y:Math.max(0,Math.min(viewport.height-1,y))};}
function options(value,allowed){if(value===undefined||value===null)return{};if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>allowed.indexOf(k)<0))throw new Error('Ungueltige Zeigeroptionen');return value;}
function mouse(value){const o=options(value,['button','clickCount','modifiers']),button=o.button||'left',count=o.clickCount===undefined?1:o.clickCount;if(['left','right','middle'].indexOf(button)<0||!Number.isInteger(count)||count<1||count>2)throw new Error('Ungueltige Zeigeroptionen');return{button,clickCount:count,modifiers:modifiers(o.modifiers),buttons:{left:1,right:2,middle:4}[button]};}
module.exports={modifiers,key,point,options,mouse};
