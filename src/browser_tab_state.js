'use strict';
module.exports={
    flushTabs(){const store=this.options.profileStore;if(!store||typeof store.saveTabs!=='function')return Promise.resolve();const tabs=this.tabs.map(t=>({id:t.id,url:t.url||t.requestedURL||''})),active=this.activeTab;return store.saveTabs(tabs,active);},
    checkpointTabs(){clearTimeout(this.tabCheckpointTimer);if(!this.child||this.restoringTabs||this.stoppingTabs)return;const epoch=this.epoch;this.tabCheckpointTimer=setTimeout(()=>{if(this.epoch!==epoch||!this.child||this.stoppingTabs)return;this.flushTabs().catch(()=>this.emit('diagnostic','Gespeicherte Tabs konnten nicht aktualisiert werden'));},250);if(this.tabCheckpointTimer.unref)this.tabCheckpointTimer.unref();}
};
