'use strict';
class BrowserController {
    constructor(actions){this.actions=actions;this.last=null;}
    reset(){this.last=null;}
    feed(v){
        if(!v||typeof v!=='object')return;
        const now={k:Number(v.frontRotaryEncoderOperation),pb:Number(v.frontRotaryEncoderPushButton),df:Number(v.frontRotaryEncoderDeflection)},old=this.last;
        if(!Number.isInteger(now.k)||now.k<0||now.k>65535||!Number.isInteger(now.pb)||!Number.isInteger(now.df))return;
        if(now.pb===15&&now.df===15)return;
        this.last=now;
        let delta=old?((now.k-old.k+32768)&65535)-32768:0;if(Math.abs(delta)>16)delta=0;
        const down=x=>x===1||x===2,press=down(now.pb)&&!(old&&down(old.pb));
        const dirs={1:'up',2:'up',4:'right',5:'right',7:'down',8:'down',10:'left',11:'left'};
        const tilt=dirs[now.df]&&(!old||dirs[old.df]!==dirs[now.df])?dirs[now.df]:null;
        if(tilt==='left')return this.actions.toolbar();
        if(tilt==='right')return this.actions.keyboard();
        if(tilt==='up'||tilt==='down')return this.actions.scroll(tilt==='up'?-220:220);
        if(delta)this.actions.focus(delta);
        if(press)this.actions.press();
    }
}
module.exports=BrowserController;
