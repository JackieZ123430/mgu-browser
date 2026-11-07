'use strict';
// Finds the changed row band between the frame the frontend already has and a
// newly decoded one. Static pages, blinking cursors and small animations then
// cost a few KiB instead of a full 1280x384 RGBA frame (about 2 MiB) per update.
// JPEG blocks are coded independently, so unchanged areas decode to identical
// bytes and a plain row comparison (memcmp) is exact.
class FrameDelta {
    constructor(){this.reset();}
    reset(){this.sent=null;}
    // Returns null when nothing changed, otherwise {y, rows, full}.
    diff(frame){
        const prev=this.sent,width=frame.width,height=frame.height,stride=width*4,a=frame.rgba;
        if(!prev||prev.width!==width||prev.height!==height)return {y:0,rows:height,full:true};
        const b=prev.rgba;
        let top=0;
        while(top<height&&a.compare(b,top*stride,(top+1)*stride,top*stride,(top+1)*stride)===0)top++;
        if(top===height)return null;
        let bottom=height;
        while(bottom>top&&a.compare(b,(bottom-1)*stride,bottom*stride,(bottom-1)*stride,bottom*stride)===0)bottom--;
        return {y:top,rows:bottom-top,full:top===0&&bottom===height};
    }
    // Only a frame that was really written becomes the new reference, so a
    // frame dropped for backpressure never leaves the frontend behind.
    commit(frame){this.sent=frame;}
}
FrameDelta.HEADER=20;
// Wire format of a type-2 message: u32 generation, width, height, y, rows,
// followed by rows*width*4 RGBA bytes for that band.
FrameDelta.header=(generation,frame,band)=>{
    const h=Buffer.alloc(FrameDelta.HEADER);
    h.writeUInt32LE(generation>>>0,0);h.writeUInt32LE(frame.width,4);h.writeUInt32LE(frame.height,8);h.writeUInt32LE(band.y,12);h.writeUInt32LE(band.rows,16);
    return h;
};
FrameDelta.band=(frame,band)=>{const stride=frame.width*4;return frame.rgba.slice(band.y*stride,(band.y+band.rows)*stride);};
module.exports=FrameDelta;
// Sends decoded frames to the frontend channel: only the changed band, never
// a frame for an unchanged picture, and a full frame after any reset
// (new connection, new foreground generation, keyframe request).
FrameDelta.sender=function(options){
    const delta=new FrameDelta();let channel=null,generation=null;
    const maxPending=options.maxPending||2*1024*1024;
    // Let the decoder wait before allocating an RGBA frame when the frontend
    // socket is already backed up. send() rechecks this after decoding too.
    const canSend=owner=>!!owner&&options.allowed()&&owner.pending()<=maxPending;
    return {
        reset(){delta.reset();},
        canSend(){return canSend(options.owner());},
        send(frame){
            const owner=options.owner();if(!canSend(owner))return false;
            const gen=options.generation()>>>0;
            if(owner!==channel||gen!==generation){channel=owner;generation=gen;delta.reset();}
            // A 0.12 frontend does not announce protocol 2 and gets the old
            // full-frame format, so updating runtime and app in either order
            // never shows a black page.
            if(owner.frameProtocol!==2){
                const h=Buffer.alloc(12);h.writeUInt32LE(gen,0);h.writeUInt32LE(frame.width,4);h.writeUInt32LE(frame.height,8);
                owner.sendParts(2,[h,frame.rgba]);return true;
            }
            const band=delta.diff(frame);if(!band)return false;
            owner.sendParts(2,[FrameDelta.header(gen,frame,band),FrameDelta.band(frame,band)]);delta.commit(frame);return true;
        }
    };
};
