'use strict';
const zlib=require('zlib');
const table=new Uint32Array(256);
for (let n=0;n<256;n++) { let c=n;for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0; }
function crc(data) { let c=0xffffffff;for(let i=0;i<data.length;i++) c=table[(c^data[i])&255]^(c>>>8);return (c^0xffffffff)>>>0; }
function paeth(a,b,c) { const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
function decode(png) {
    return new Promise((resolve,reject)=>{
        let width,height,channels;const chunks=[];
        try {
            if (!Buffer.isBuffer(png)||png.length>8*1024*1024||!png.slice(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('PNG-Signatur');
            let at=8,ended=false;
            while(at<png.length) {
                if(at+12>png.length) throw new Error('PNG abgeschnitten');
                const size=png.readUInt32BE(at),end=at+12+size;
                if(end>png.length) throw new Error('PNG-Länge');
                const type=png.toString('ascii',at+4,at+8),data=png.slice(at+8,end-4);
                if(crc(png.slice(at+4,end-4))!==png.readUInt32BE(end-4)) throw new Error('PNG-Prüfsumme');
                if(type==='IHDR') {
                    if(width||size!==13||at!==8) throw new Error('PNG-Header');
                    width=data.readUInt32BE(0);height=data.readUInt32BE(4);
                    channels=data[9]===2?3:data[9]===6?4:0;
                    if(width<1||height<1||width>1280||height>720||!channels||data[8]!==8||data[10]||data[11]||data[12]) throw new Error('PNG-Format');
                } else if(type==='IDAT') { if(!width)throw new Error('PNG-Reihenfolge');chunks.push(data); }
                else if(type==='IEND') { if(size)throw new Error('PNG-Ende');ended=true;if(end!==png.length)throw new Error('PNG-Nachlauf');break; }
                else if((png[at+4]&32)===0) throw new Error('Unbekannter PNG-Pflichtblock');
                at=end;
            }
            if(!ended||!width||!chunks.length) throw new Error('PNG unvollständig');
        } catch(e) { reject(e);return; }
        const expected=(width*channels+1)*height,parts=[];let total=0,done=false;
        const inflater=zlib.createInflate();
        const fail=e=>{if(done)return;done=true;inflater.destroy();reject(e);};
        inflater.on('error',fail);
        inflater.on('data',p=>{total+=p.length;if(total>expected)fail(new Error('PNG-Dekompressionslimit'));else parts.push(p);});
        inflater.on('end',()=>{
            if(done)return;
            if(total!==expected)return fail(new Error('PNG-Pixellänge'));
            try {
                const raw=Buffer.concat(parts),stride=width*channels,rows=Buffer.alloc(stride*height),rgba=Buffer.alloc(width*height*4);let src=0;
                for(let y=0;y<height;y++) {
                    const filter=raw[src++];if(filter>4)throw new Error('PNG-Zeilenfilter');
                    for(let x=0;x<stride;x++) {
                        const off=y*stride+x,a=x>=channels?rows[off-channels]:0,b=y?rows[off-stride]:0,c=y&&x>=channels?rows[off-stride-channels]:0;
                        const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
                        rows[off]=(raw[src++]+prediction)&255;
                    }
                }
                for(let i=0,j=0;i<rows.length;i+=channels,j+=4) { rgba[j]=rows[i];rgba[j+1]=rows[i+1];rgba[j+2]=rows[i+2];rgba[j+3]=255; }
                done=true;resolve({width,height,rgba});
            } catch(e) { fail(e); }
        });
        inflater.end(Buffer.concat(chunks));
    });
}
module.exports={decode,crc};
