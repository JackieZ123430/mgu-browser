'use strict';
// Preserve the running engine's own identity. Normal Chromium supplies its UA,
// platform, brands and Client Hints; the Browser only selects its language.
function create(version){
    const userAgent=version&&version.userAgent;
    if(typeof userAgent!=='string'||!userAgent||userAgent.length>2048||/[\r\n\0]/.test(userAgent))throw new Error('Browser identity unavailable');
    return {userAgent};
}
function languages(locale){
    if(typeof locale!=='string'||!(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)))throw new Error('Invalid browser locale');
    const language=locale.split('-')[0];
    return language===locale?[locale]:[locale,language];
}
function localeOverride(locale){
    return {userAgent:'',acceptLanguage:languages(locale).map((language,index)=>language+(index?';q=0.9':'')).join(',')};
}
module.exports={create,languages,localeOverride};
