'use strict';
// Optional content blocking is a user preference. Default page animation and
// background scheduling stay under Chromium's normal browser policy: freezing
// a newly hidden tab can strand login popups, polling and pending requests.
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
        await pipe.send('Network.setBlockedURLs',{urls:this.contentBlocking===true?BLOCK_PATTERNS:[]},session).catch(()=>{});
        await pipe.send('Emulation.setEmulatedMedia',{features:[]},session).catch(()=>{});
    },
    async setContentBlocking(enabled){
        this.contentBlocking=enabled!==false;
        if(this.pipe)for(const tab of this.tabs)await this.pipe.send('Network.setBlockedURLs',{urls:this.contentBlocking?BLOCK_PATTERNS:[]},tab.session).catch(()=>{});
        return {enabled:this.contentBlocking};
    },
    // Thaw any legacy frozen target; new tab switches never force a freeze.
    async lifecycle(previous,next){
        const pipe=this.pipe;if(!pipe)return;
        for(const tab of [previous,next]){
            if(!tab||!tab.frozen)continue;
            await pipe.send('Page.setWebLifecycleState',{state:'active'},tab.session).then(()=>{tab.frozen=false;},()=>{});
        }
    }
};
