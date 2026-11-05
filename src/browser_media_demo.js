'use strict';
// Laptop-only caller. Generates a silent original WebM; no external media or accounts.
module.exports=async function demo(browser){
    if(process.env.MGU_EMULATOR_MODE!=='1')throw new Error('Laptop emulator required');
    await browser.newTab('');
    const tree=await browser.send('Page.getFrameTree');
    await browser.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html><html><head><meta charset="utf-8"><title>Vollbild-Videotest</title><style>html,body{margin:0;background:#000;height:100%}video{width:100%;height:100%;object-fit:contain;background:#000}</style></head><body><video id="video" muted loop></video></body></html>'});
    const result=await browser.send('Runtime.evaluate',{expression:'(async()=>{const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;const c=canvas.getContext("2d"),stream=canvas.captureStream(20),parts=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});let n=0;const paint=()=>{c.fillStyle="#17334f";c.fillRect(0,0,640,360);c.strokeStyle="#60d9ff";c.lineWidth=8;c.strokeRect(8,8,624,344);c.fillStyle="#fff";c.font="28px sans-serif";c.fillText("BMW Browser · 16:9 · Vollbild",95,150);c.font="20px sans-serif";c.fillText("Alle vier Bildränder bleiben sichtbar",126,190);c.fillStyle="#ff695c";c.fillRect(35+n++%560,240,35,35);};paint();const timer=setInterval(paint,50);recorder.ondataavailable=e=>parts.push(e.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await new Promise(resolve=>setTimeout(resolve,12000));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());const video=document.getElementById("video");video.src=URL.createObjectURL(new Blob(parts,{type:"video/webm"}));await video.play();return true;})()',awaitPromise:true,returnByValue:true,userGesture:true},25000);
    if(result.exceptionDetails)throw new Error('Lokaler Videotest konnte nicht erzeugt werden');
    await browser.send('Runtime.evaluate',{expression:'document.getElementById("video").requestFullscreen()',awaitPromise:true,userGesture:true});
    await browser.inspectMedia();return {ready:true};
};
