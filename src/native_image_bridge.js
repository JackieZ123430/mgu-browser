'use strict';
// Adapt this app's pixel images to the repo renderer's documented native pixmap
// protocol. Keeps the framework's native touch, layout and controller handling.
let controllerHandler=null;
const fixed={1:2,2:6,4:7,5:8,7:9,8:12,9:7,12:4,13:5,14:1,15:10,16:2,17:4,18:7};
function convert(words) {
    const out=new Uint32Array(words);let i=0;
    while(i<out.length){
        const op=words[i];let size=fixed[op];
        if(op===3)size=6+2*words[i+5];else if(op===6)size=7+2*words[i+6];
        else if(op===10)size=2+9*words[i+1];else if(op===11)size=4+8*words[i+3];
        if(!size||i+size>words.length)throw new Error('Invalid renderer recording');
        if(op===18){out[i+1]=words[i+3];out[i+2]=words[i+4];out[i+3]=words[i+5];out[i+4]=words[i+6];out[i+5]=0;out[i+6]=words[i+1];}
        i+=size;
    }
    return out;
}
function packet(type,payload){const head=Buffer.alloc(8);head.writeUInt32LE(type);head.writeUInt32LE(payload.length,4);return Buffer.concat([head,payload]);}
function ints(values){const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b;}
function install(){
    const rec=require('./kit/record'),{RenderClient}=require('./kit/renderd'),{Display}=require('./kit/display');
    const oldImage=RenderClient.prototype._ensureImage,oldFrame=RenderClient.prototype.frame;
    RenderClient.prototype._ensureImage=function(id){
        if(!this.native)return oldImage.call(this,id);
        const im=rec.imageById.get(id);if(!im||!im.data||this.sent.image.get(id)===im.ver)return;
        this.browserShapes=this.browserShapes||new Map();const shape=im.w+'x'+im.h;
        if(!this.sent.image.has(id)||this.browserShapes.get(id)!==shape){
            this._write(packet(0x4d520003,ints([id,im.w,im.h,2,1])));this.browserShapes.set(id,shape);
        }
        const pixels=Buffer.from(im.data.buffer,im.data.byteOffset,im.w*im.h*4);
        this._write(packet(0x4d520004,Buffer.concat([ints([id,1,0,0,im.w,im.h]),pixels])));
        this.sent.image.set(id,im.ver);
    };
    RenderClient.prototype.frame=function(r){
        if(!this.native)return oldFrame.call(this,r);
        return oldFrame.call(this,Object.assign({},r,{words:()=>convert(r.words())}));
    };
    const oldCcu=Display.prototype._ccu;
    Display.prototype._ccu=function(v){
        if(controllerHandler&&controllerHandler(v)){
            this.ccuLast={k:Number(v.frontRotaryEncoderOperation),pb:Number(v.frontRotaryEncoderPushButton),df:Number(v.frontRotaryEncoderDeflection)};return;
        }
        return oldCcu.call(this,v);
    };
}
module.exports={install,convert,setControllerHandler:fn=>{controllerHandler=fn;}};
