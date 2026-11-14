import {readArtwork,writeArtwork,recoveryKey} from '../src/artworkRecovery';
import type {SavedStamp,ArtworkKind} from '../src/stampLibrary';
import type {CustomAsset} from '../src/customStamp';
// Local production-browser harness; never imported by application entry points.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Aruco from 'js-aruco2';
import PhoneController from '../src/PhoneController';
import {exportDrawing} from '../src/drawing/exportDrawing';
import {exportArt} from '../src/art';
import Wallpaper from '../src/Wallpaper';
import {markers,SIZE,W,H} from '../src/geometry';
import {screenStampFromWorld} from '../src/cameraPlacement';
import {videoViewport} from '../src/manipulation';
import {withinTrackingGrace} from '../src/trackingState';
import type {Placement,Stamp} from '../src/types';
import '../src/style.css';
const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d')!;
const dictionary=new Aruco.AR.Dictionary('ARUCO');
const images=await Promise.all(markers.map(async m=>{const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(dictionary.generateSVG(m.id).replace('viewBox="0 0 9 9"','viewBox="1 1 7 7"'));await image.decode();return image;}));
const unknownImage=new Image();unknownImage.src='data:image/svg+xml,'+encodeURIComponent(dictionary.generateSVG(999).replace('viewBox="0 0 9 9"','viewBox="1 1 7 7"'));await unknownImage.decode();
let showUnknown=false,freezeReplies=false,mainReads=0,placementUpdates=0;
if(location.search.includes('independent')){
 const fallback=location.search.includes('fallback');if(fallback)Object.defineProperty(window,'createImageBitmap',{configurable:true,value:undefined});
 const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args:Parameters<typeof read>){mainReads++;if(fallback){const at=performance.now();while(performance.now()-at<80){/* Simulated blocking legacy readback. */}}return read.apply(this,args);};
 const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{private deliver:((e:MessageEvent)=>void)|null=null;constructor(url:string|URL,options?:WorkerOptions){super(url,options);super.onmessage=e=>{if(e.data.type==='ready'||!freezeReplies)this.deliver?.(e);else {/* Drop a reply to leave the capture gate busy. */}};}override set onmessage(value:((e:MessageEvent)=>void)|null){this.deliver=value;}override get onmessage(){return this.deliver;}} as typeof Worker;
}
let selection:number[]|null=null;
let count=8,offset=0,requests=0,last:Placement|null=null,previewed:Placement|null=null,saved:Placement[]=[],manual=false;
function draw(){ctx.fillStyle='#06281f';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(96+offset,54);ctx.scale(.9,.9);(selection||[0,2,5,7,1,3,4,6]).slice(0,count).forEach(i=>{const m=markers[i];ctx.fillStyle='white';ctx.fillRect(m.x-24,m.y-24,SIZE+48,SIZE+48);ctx.drawImage(images[i],m.x,m.y,SIZE,SIZE);});if(showUnknown){ctx.fillStyle='white';ctx.fillRect(W/2-78,H/2-78,156,156);ctx.drawImage(unknownImage,W/2-54,H/2-54,108,108);}ctx.restore();}
draw();setInterval(draw,40);
let denyCamera=false,delayCamera=0;const streams:MediaStream[]=[];
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{requests++;if(denyCamera)throw new DOMException('Camera permission denied','NotAllowedError');const stream=canvas.captureStream(20);streams.push(stream);if(delayCamera)await new Promise(r=>setTimeout(r,delayCamera));return stream;}});
// Optional slow-worker delivery regression: same actual detector, delayed results
// proportional to pixel budget, without camera cropping or mocked detections.
if(location.search.includes('slow')){const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {
 private deliver:((e:MessageEvent)=>void)|null=null;
 constructor(url:string|URL,options?:WorkerOptions){super(url,options);super.onmessage=e=>setTimeout(()=>this.deliver?.(e),335*(e.data.width/960)**2);}
 override set onmessage(value:((e:MessageEvent)=>void)|null){this.deliver=value;}
 override get onmessage(){return this.deliver;}
} as typeof Worker;}
const fixtureKey=recoveryKey('test-profile','test-session');let generationCalls=0,saveCalls=0;
const mockLibrary={
 list:async()=>JSON.parse(localStorage.getItem('test-personal-stamps')||'[]') as (SavedStamp&CustomAsset)[],
 save:async(asset:CustomAsset,kind:ArtworkKind)=>{saveCalls++;if(saveCalls===1)throw Error('Mock offline save');let rows=await mockLibrary.list();let row=rows.find(r=>r.image_data===asset.image_data);if(!row){row={...asset,id:crypto.randomUUID(),label:'AI cartoon',kind,object_path:'fixture.png',created_at:new Date().toISOString(),width:asset.image_width,height:asset.image_height,state:'ready',thumbnail:asset.image_data};rows=[row];localStorage.setItem('test-personal-stamps',JSON.stringify(rows));}return row;},
 load:async(row:SavedStamp)=>{const found=(await mockLibrary.list()).find(r=>r.id===row.id)!;return {image_data:found.image_data,image_width:found.image_width,image_height:found.image_height};},
 remove:async(id:string)=>{const rows=(await mockLibrary.list()).filter(r=>r.id!==id);localStorage.setItem('test-personal-stamps',JSON.stringify(rows));},
};
function Harness(){const [p,setP]=useState<Placement>(()=>location.search.includes('resume')?readArtwork(fixtureKey)!:{stamp_type:'star',position_x:.5,position_y:.5,scale:170,rotation:27}),[camera,setCamera]=useState(true),[locked,setLocked]=useState(false);return <PhoneController profileId="test-profile" sessionId="11111111-1111-4111-8111-111111111111" library={mockLibrary} convertPhoto={async()=>{generationCalls++;return await (await fetch(recoveredAsset)).blob();}} placement={p} stamps={[]} camera={camera} setCamera={setCamera} onChange={value=>{last=value;setP(value);writeArtwork(fixtureKey,value);}} onCameraPlacement={value=>{setLocked(!!value);if(value){last=value;setP(value);writeArtwork(fixtureKey,value);}}} onStatus={()=>{}} online busy={false} canPlace={!camera||locked} preview={()=>{}} stamp={()=>{saved.push(p);}} notice="" error="" dismissError={()=>{}}/>;}
const stamp=document.createElement('canvas');stamp.width=64;stamp.height=64;stamp.getContext('2d')!.fillRect(16,16,32,32);const recoveredAsset=stamp.toDataURL('image/png');
const mountedRoot=createRoot(document.getElementById('root')!);mountedRoot.render(<Harness/>);
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));const ensure=(v:unknown,m:string)=>{if(!v)throw Error(m);};
async function check(){const out=document.createElement('output');out.id='recovery-result';document.body.append(out);const until=async(f:()=>unknown)=>{for(let i=0;i<160;i++){if(f())return;await wait(100);}throw Error('Recovery timed out');};const reset=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Reset Tracking')!;try{
 await until(()=>document.querySelector('.tracking-status.locked'));
 if(location.search.includes('resume')){ensure(last?.image_data===recoveredAsset,'Refresh lost selected artwork');ensure(generationCalls===0,'Recovery called AI');ensure((await mockLibrary.list()).length===1,'Saved library did not survive restart');out.textContent='PASS: same-profile refresh/QR recovery restored selected PNG and library without generation.';return;}
 localStorage.removeItem('test-personal-stamps');
 const file=new File([await (await fetch(recoveredAsset)).blob()],'test-photo.png',{type:'image/png'});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector<HTMLInputElement>('[aria-label="Import photo file"]')!;input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!;
 await until(()=>button('Convert to AI Stamp')&&!button('Convert to AI Stamp').disabled);button('Convert to AI Stamp').click();await until(()=>document.querySelector('img[alt="AI cartoon preview"]'));button('Use AI Stamp').click();await until(()=>button('Retry saving'));ensure(generationCalls===1&&saveCalls===1,'Save failure retried AI');ensure(!!readArtwork(fixtureKey),'Failed save lost locally selected artwork');button('Retry saving').click();button('Retry saving')?.click();await until(()=>!document.querySelector('[aria-label="Save artwork"]'));ensure(saveCalls===2&&(await mockLibrary.list()).length===1,'Duplicate accepted save');button('My Stamps')?.click();if(!document.querySelector('[aria-label="Reuse AI cartoon"]'))(document.querySelector('[aria-label="My Stamps"]') as HTMLButtonElement).click();await until(()=>document.querySelector('[aria-label="Reuse AI cartoon"]'));(document.querySelector('[aria-label="Reuse AI cartoon"]') as HTMLButtonElement).click();await until(()=>!document.querySelector('.stamp-library'));ensure(generationCalls===1,'Reusing saved artwork spent AI');
 await until(()=>document.querySelector('.tracking-status.locked'));const stage=document.querySelector('.camera-view') as HTMLElement,centre={x:innerWidth/2,y:innerHeight/2};const pointer=(type:string,id:number,x:number,y:number)=>{stage.setPointerCapture=()=>{};stage.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true,buttons:type==='pointerup'?0:1}));};pointer('pointerdown',1,centre.x-40,centre.y);pointer('pointerdown',2,centre.x+40,centre.y);pointer('pointermove',1,centre.x,centre.y-60);pointer('pointermove',2,centre.x,centre.y+60);pointer('pointerup',2,centre.x,centre.y+60);pointer('pointerup',1,centre.x,centre.y-60);await wait(250);const artworkStyle=document.querySelector<HTMLImageElement>('.camera-stamp')!.style;const beforeTransform=artworkStyle.transform,beforeSize=artworkStyle.width;const oldVideo=document.querySelector('video')!,oldStream=oldVideo.srcObject as MediaStream;const beforeImage=document.querySelector<HTMLImageElement>('.camera-stamp')!.src;const beforeZoom=document.querySelector('.display-zoom')!.textContent;
 freezeReplies=true;await until(()=>document.querySelector('.tracking-recovery.stalled'));ensure(!document.querySelector('.phone-actions .primary:not(:disabled)'),'Stamp stayed enabled during stall');freezeReplies=false;const beforeRequests=requests;reset().click();reset()?.click();await until(()=>document.querySelector('.tracking-status.locked'));ensure(requests===beforeRequests+1,'Repeated reset started multiple streams');ensure(oldStream.getTracks().every(t=>t.readyState==='ended'),'Old tracks not stopped');ensure(document.querySelector<HTMLImageElement>('.camera-stamp')!.src===beforeImage,'Reset lost selected PNG');ensure(document.querySelector('.display-zoom')!.textContent===beforeZoom,'Reset lost zoom');ensure(document.querySelector<HTMLImageElement>('.camera-stamp')!.style.transform===beforeTransform&&document.querySelector<HTMLImageElement>('.camera-stamp')!.style.width===beforeSize,'Reset changed pinch scale or rotation');ensure(last?.image_data===recoveredAsset,'Artwork changed during reset');(document.querySelector('.phone-actions .primary') as HTMLButtonElement).click();ensure(saved.length===1,'Could not stamp after reset');denyCamera=true;reset().click();await until(()=>document.querySelector('.tracking-recovery.stalled'));ensure(!reset().disabled,'Permission failure left reset disabled');ensure(document.querySelector<HTMLImageElement>('.camera-stamp')!.src===beforeImage,'Permission failure lost artwork');denyCamera=false;reset().click();await until(()=>document.querySelector('.tracking-status.locked'));delayCamera=200;reset().click();await wait(50);mountedRoot.unmount();await wait(300);ensure(streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')),'Unmount during camera startup leaked tracks');out.textContent='PASS: imported photo → mock AI preview → Use AI Stamp → failed save/retry → deduplicated My Stamps → reuse without AI; worker stall detected independently of markers, old stream released, repeated resets serialized, same PNG and zoom retained, detection restarted, permission failure/retry, unmount during restart and Stamp works without refresh or AI.';
}catch(e){out.textContent='FAIL: '+String(e);console.error(e);}}
void check();
