'use strict';
class BrowserController {
    constructor(actions){this.actions=actions;this.last=null;}
    feed(v){
        const now={k:Number(v.frontRotaryEncoderOperation),pb:Number(v.frontRotaryEncoderPushButton),df:Number(v.frontRotaryEncoderDeflection)},old=this.last;this.last=now;
        if(now.pb===15&&now.df===15)return;
        let delta=old?((now.k-old.k+32768)&65535)-32768:0;if(Math.abs(delta)>16)delta=0;
        const down=x=>x===1||x===2,press=down(now.pb)&&!(old&&down(old.pb));
        const dirs={1:'up',2:'up',4:'right',5:'right',7:'down',8:'down',10:'left',11:'left'};
        const tilt=dirs[now.df]&&(!old||dirs[old.df]!==dirs[now.df])?dirs[now.df]:null;
        if(tilt==='left')return this.actions.toolbar();
        if(tilt==='right')return this.actions.keyboard();
        if(tilt==='up'||tilt==='down')return this.actions.scroll(tilt==='up'?-220:220);
        if(press)this.actions.press();
        if(delta)this.actions.focus(delta);
    }
}
module.exports=BrowserController;
