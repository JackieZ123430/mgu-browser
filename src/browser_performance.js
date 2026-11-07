'use strict';
// Page-level performance measures for the head unit's software rendering:
//  - known ad, tracking and analytics hosts are not loaded at all (setting,
//    on by default). They are usually the heaviest part of news sites;
//  - pages are asked to reduce animations (prefers-reduced-motion), which
//    saves both rendering and screencast frames;
//  - background tabs are frozen (timers, animations and scripts stop) unless
//    they were playing audio or video when they were left.
const BLOCKED_HOSTS=[
    'doubleclick.net','googlesyndication.com','googleadservices.com','google-analytics.com','adservice.google.com','adservice.google.de',
    'amazon-adsystem.com','adnxs.com','criteo.com','criteo.net','taboola.com','outbrain.com','scorecardresearch.com','quantserve.com',
    'hotjar.com','adsrvr.org','rubiconproject.com','pubmatic.com','openx.net','casalemedia.com','smartadserver.com','yieldlab.net',
    'adform.net','teads.tv','moatads.com','doubleverify.com','adsafeprotected.com','ioam.de','xiti.com','chartbeat.com','chartbeat.net',
    'mouseflow.com','crazyegg.com','bat.bing.com','ads.linkedin.com','ads-twitter.com','static.ads-twitter.com','analytics.tiktok.com',
    'adition.com','stroeerdigitalgroup.de','stroeerdigitalmedia.de','emetriq.de','theadex.com','seedtag.com','sharethrough.com',
    'indexww.com','3lift.com','bidswitch.net','lijit.com','sonobi.com','media.net','zemanta.com','mgid.com','revcontent.com',
];
const BLOCK_PATTERNS=BLOCKED_HOSTS.reduce((list,host)=>list.concat(['*://'+host+'/*','*://*.'+host+'/*']),[]);
module.exports={
    BLOCKED_HOSTS,BLOCK_PATTERNS,
    async applyPagePerformance(session,pipe){
        pipe=pipe||this.pipe;
        await pipe.send('Network.setBlockedURLs',{urls:this.contentBlocking===false?[]:BLOCK_PATTERNS},session).catch(()=>{});
        await pipe.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},session).catch(()=>{});
    },
    async setContentBlocking(enabled){
        this.contentBlocking=enabled!==false;
        if(this.pipe)for(const tab of this.tabs)await this.pipe.send('Network.setBlockedURLs',{urls:this.contentBlocking?BLOCK_PATTERNS:[]},tab.session).catch(()=>{});
        return {enabled:this.contentBlocking};
    },
    // Called while switching tabs: `previous` is left, `next` becomes visible.
    async lifecycle(previous,next){
        const pipe=this.pipe;if(!pipe)return;
        if(next&&next.frozen){next.frozen=false;await pipe.send('Page.setWebLifecycleState',{state:'active'},next.session).catch(()=>{});}
        if(previous&&previous!==next&&!previous.mediaActive){
            const ok=await pipe.send('Page.setWebLifecycleState',{state:'frozen'},previous.session).then(()=>true,()=>false);
            if(ok&&this.tabs.includes(previous)&&this.activeTab!==previous.id)previous.frozen=true;
            else if(ok&&this.activeTab===previous.id)await pipe.send('Page.setWebLifecycleState',{state:'active'},previous.session).catch(()=>{});
        }
    }
};
