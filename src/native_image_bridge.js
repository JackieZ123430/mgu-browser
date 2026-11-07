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
// Every setImage() bumps the image version. markDirty() records which rows
// that version changed; the upload then sends the union of all bands since the
// version this renderer connection already has, or the full image when the
// record does not reach back far enough.
const DIRTY_LOG=24;
function markDirty(id,dirty){
    const rec=require('./kit/record'),im=rec.imageById.get(id);if(!im)return;
    const log=im.dirtyLog||(im.dirtyLog=[]);
    if(!dirty||!(dirty.rows>0)){log.length=0;return;}
    log.push({ver:im.ver,y:dirty.y,end:dirty.y+dirty.rows,w:im.w,h:im.h});if(log.length>DIRTY_LOG)log.shift();
}
function dirtySince(im,sentVer){
    const log=im.dirtyLog;if(!log||!log.length||typeof sentVer!=='number')return null;
    let y=Infinity,end=0,expected=(sentVer+1)>>>0,found=false;
    for(const entry of log){
        if(!found){if(entry.ver!==expected)continue;found=true;}
        else if(entry.ver!==expected)return null;
        if(entry.w!==im.w||entry.h!==im.h)return null;
        y=Math.min(y,entry.y);end=Math.max(end,entry.end);expected=(expected+1)>>>0;
    }
    // Every version up to the current one must be covered.
    if(!found||((expected-1)>>>0)!==im.ver)return null;
    return {y,rows:end-y};
}
function install(){
    const rec=require('./kit/record'),{RenderClient}=require('./kit/renderd'),{Display}=require('./kit/display');
    const oldImage=RenderClient.prototype._ensureImage,oldFrame=RenderClient.prototype.frame;
    RenderClient.prototype._ensureImage=function(id){
        if(!this.native)return oldImage.call(this,id);
        const im=rec.imageById.get(id);if(!im||!im.data||this.sent.image.get(id)===im.ver)return;
        this.browserShapes=this.browserShapes||new Map();const shape=im.w+'x'+im.h;
        let rect=null;
        if(!this.sent.image.has(id)||this.browserShapes.get(id)!==shape){
            this._write(packet(0x4d520003,ints([id,im.w,im.h,2,1])));this.browserShapes.set(id,shape);
        }else rect=dirtySince(im,this.sent.image.get(id));
        if(!rect)rect={y:0,rows:im.h};
        // X_PIXELS: id, one rect (x, y, w, h), then that rect's rows. Header and
        // pixels are written separately so the band is not copied again.
        const stride=im.w*4,pixels=Buffer.from(im.data.buffer,im.data.byteOffset+rect.y*stride,rect.rows*stride);
        const head=Buffer.alloc(8);head.writeUInt32LE(0x4d520004);head.writeUInt32LE(24+pixels.length,4);
        this._write(Buffer.concat([head,ints([id,1,0,rect.y,im.w,rect.rows])]));this._write(pixels);
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
module.exports={install,convert,markDirty,dirtySince,setControllerHandler:fn=>{controllerHandler=fn;}};
