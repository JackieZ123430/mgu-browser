'use strict';
// Chromium duplicates upload bodies in request events. Keep those copies out
// of the application without changing the browser's original HTTP request.
const METHODS=['Fetch.requestPaused','Fetch.authRequired','Network.requestWillBeSent'];
const BODY=['postData','postDataEntries'],NIL=Buffer.from('null'),BLOCK=65536;
function whitespace(b){return b===32||b===9||b===10||b===13;}
function hex(b){return b>=48&&b<=57||b>=65&&b<=70||b>=97&&b<=102;}
class RequestFilter {
    constructor(maxBytes){this.maxBytes=maxBytes;this.size=0;this.chunks=[];this.block=null;this.used=0;this.mode='probe';this.stack=[];this.done=false;this.token=null;this.skipping=false;this.skipDepth=0;this.filtered=false;}
    append(data,copy){
        if(!data.length)return;if(this.size+data.length>this.maxBytes)throw Error('Browser-Nachricht zu groß');this.size+=data.length;
        if(!copy){this.flush();this.chunks.push(data);return;}
        let at=0;while(at<data.length){if(!this.block){this.block=Buffer.allocUnsafe(Math.min(BLOCK,this.maxBytes,Math.max(1024,data.length-at)));this.used=0;}const count=Math.min(data.length-at,this.block.length-this.used);data.copy(this.block,this.used,at,at+count);this.used+=count;at+=count;if(this.used===this.block.length)this.flush();}
    }
    flush(){if(this.block){this.chunks.push(this.used===this.block.length?this.block:Buffer.from(this.block.slice(0,this.used)));this.block=null;this.used=0;}}
    complete(){
        const parent=this.stack[this.stack.length-1];if(parent){parent.state='comma';parent.key=null;}else this.done=true;
        if(this.skipping&&this.stack.length===this.skipDepth)this.skipping=false;
    }
    string(key){
        const parent=this.stack[this.stack.length-1],capture=key&&parent.role!=='other'||!key&&parent&&parent.role==='root'&&parent.key==='method';
        this.token={kind:'string',key,capture,raw:capture?[34]:null,overflow:false,escape:false,unicode:0};
    }
    stringEnd(token){
        let value=null;if(token.capture&&!token.overflow)value=JSON.parse(Buffer.from(token.raw).toString('utf8'));
        const parent=this.stack[this.stack.length-1];
        if(token.key){parent.key=value;parent.state='colon';if(parent.role==='root'&&value==='id'&&this.mode==='probe')this.mode='pass';}
        else{
            if(parent&&parent.role==='root'&&parent.key==='method'){
                if(this.filtered)throw Error('Ungültige Browser-Nachricht');
                this.mode=METHODS.indexOf(value)>=0?'filter':'pass';this.filtered=this.mode==='filter';
            }
            this.complete();
        }
        this.token=null;
    }
    value(b){
        const parent=this.stack[this.stack.length-1];
        if(!this.skipping&&this.mode==='filter'&&parent&&parent.role==='request'&&BODY.indexOf(parent.key)>=0){this.skipping=true;this.skipDepth=this.stack.length;}
        if(b===34){this.string(false);return;}
        if(b===123||b===91){
            if(this.stack.length>=128)throw Error('Ungültige Browser-Nachricht');
            const role=b===123?(!parent?'root':parent.role==='root'&&parent.key==='params'?'params':parent.role==='params'&&parent.key==='request'?'request':'other'):'other';
            this.stack.push({kind:b===123?'object':'array',role,state:b===123?'firstKey':'firstValue',key:null});return;
        }
        if(b===116||b===102||b===110){this.token={kind:'literal',text:b===116?'true':b===102?'false':'null',at:1};return;}
        if(b===45||b>=48&&b<=57){this.token={kind:'number',state:b===45?'minus':b===48?'zero':'int'};return;}
        throw Error('Ungültige Browser-Nachricht');
    }
    number(b){
        const t=this.token,s=t.state,digit=b>=48&&b<=57;
        if(s==='minus'&&digit)t.state=b===48?'zero':'int';
        else if(s==='int'&&digit){}
        else if((s==='int'||s==='zero')&&b===46)t.state='dot';
        else if(s==='dot'&&digit)t.state='frac';
        else if(s==='frac'&&digit){}
        else if((s==='int'||s==='zero'||s==='frac')&&(b===101||b===69))t.state='exp';
        else if(s==='exp'&&(b===43||b===45))t.state='expSign';
        else if((s==='exp'||s==='expSign'||s==='expDigits')&&digit)t.state='expDigits';
        else{if(['zero','int','frac','expDigits'].indexOf(s)<0)throw Error('Ungültige Browser-Nachricht');this.token=null;this.complete();return false;}return true;
    }
    byte(b){
        const token=this.token;
        if(token&&token.kind==='literal'){if(b!==token.text.charCodeAt(token.at++))throw Error('Ungültige Browser-Nachricht');if(token.at===token.text.length){this.token=null;this.complete();}return true;}
        if(token&&token.kind==='number')return this.number(b);
        if(whitespace(b))return true;
        if(this.done)throw Error('Ungültige Browser-Nachricht');
        const parent=this.stack[this.stack.length-1];if(!parent){this.value(b);return true;}
        const state=parent.state;
        if(parent.kind==='object'){
            if(state==='firstKey'||state==='key'){if(b===125&&state==='firstKey'){this.stack.pop();this.complete();}else if(b===34)this.string(true);else throw Error('Ungültige Browser-Nachricht');}
            else if(state==='colon'){if(b!==58)throw Error('Ungültige Browser-Nachricht');parent.state='value';}
            else if(state==='value')this.value(b);
            else if(b===44)parent.state='key';else if(b===125){this.stack.pop();this.complete();}else throw Error('Ungültige Browser-Nachricht');
        }else{
            if(state==='firstValue'||state==='value'){if(b===93&&state==='firstValue'){this.stack.pop();this.complete();}else this.value(b);}
            else if(b===44)parent.state='value';else if(b===93){this.stack.pop();this.complete();}else throw Error('Ungültige Browser-Nachricht');
        }return true;
    }
    write(data){
        if(this.mode==='pass'){this.append(data,false);return;}
        let at=0,start=this.skipping?-1:0;
        while(at<data.length){
            const t=this.token;
            if(t&&t.kind==='string'){
                // Long copied body strings need no decoding or allocation.
                if(!t.capture&&!t.escape&&!t.unicode){while(at<data.length&&data[at]>=32&&data[at]!==34&&data[at]!==92)at++;if(at===data.length)break;}
                const b=data[at];
                if(t.capture&&!t.overflow){if(t.raw.length<512)t.raw.push(b);else{t.raw=null;t.overflow=true;}}
                if(t.unicode){if(!hex(b))throw Error('Ungültige Browser-Nachricht');t.unicode--;}
                else if(t.escape){t.escape=false;if(b===117)t.unicode=4;else if([34,92,47,98,102,110,114,116].indexOf(b)<0)throw Error('Ungültige Browser-Nachricht');}
                else if(b===92)t.escape=true;else if(b===34){const before=this.skipping;this.stringEnd(t);if(before&&!this.skipping)start=at+1;}else if(b<32)throw Error('Ungültige Browser-Nachricht');
                at++;
            }else{
                const before=this.skipping,consumed=this.byte(data[at]);
                if(!before&&this.skipping){if(start>=0)this.append(data.slice(start,at),true);this.append(NIL,true);start=-1;}
                if(before&&!this.skipping)start=at+(consumed?1:0);
                if(consumed)at++;
            }
            if(this.mode==='pass'){if(start>=0)this.append(data.slice(start),false);return;}
        }
        if(start>=0)this.append(data.slice(start),true);
    }
    finish(){
        if(this.mode!=='pass'){
            if(this.token&&this.token.kind==='number'){if(['zero','int','frac','expDigits'].indexOf(this.token.state)<0)throw Error('Ungültige Browser-Nachricht');this.token=null;this.complete();}
            if(this.token||this.stack.length||!this.done||this.skipping)throw Error('Ungültige Browser-Nachricht');
        }
        this.flush();return this.chunks.length===1?this.chunks[0]:Buffer.concat(this.chunks,this.size);
    }
    static strip(message){
        if(message&&METHODS.indexOf(message.method)>=0&&message.params&&message.params.request&&typeof message.params.request==='object')for(const name of BODY)delete message.params.request[name];
        return message;
    }
}
module.exports=RequestFilter;
