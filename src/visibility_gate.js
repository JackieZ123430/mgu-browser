'use strict';
// Used only by the Chromium mode with media loading disabled in the engine.
// This controls foreground lifetime; it performs no vehicle signal queries.
class VisibilityGate {
    constructor(){this.visible=false;this.wasAllowed=false;this.onBlock=null;}
    setVisible(v){this.visible=v===true;return this.check();}
    check(){const allowed=this.visible,block=this.wasAllowed&&!allowed;this.wasAllowed=allowed;if(block&&this.onBlock)this.onBlock('Browser nicht im Vordergrund');return {allowed,reason:allowed?null:'Browser nicht im Vordergrund'};}
}
module.exports=VisibilityGate;
