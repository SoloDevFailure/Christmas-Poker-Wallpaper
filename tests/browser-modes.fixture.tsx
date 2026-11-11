// Local production-browser harness; never imported by application entry points.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Aruco from 'js-aruco2';
import PhoneController from '../src/PhoneController';
import Wallpaper from '../src/Wallpaper';
import {markers,SIZE,W,H} from '../src/geometry';
import type {Placement,Stamp} from '../src/types';
import '../src/style.css';
const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d')!;
const dictionary=new Aruco.AR.Dictionary('ARUCO');
const images=await Promise.all(markers.map(async m=>{const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(dictionary.generateSVG(m.id).replace('viewBox="0 0 9 9"','viewBox="1 1 7 7"'));await image.decode();return image;}));
const unknownImage=new Image();unknownImage.src='data:image/svg+xml,'+encodeURIComponent(dictionary.generateSVG(999).replace('viewBox="0 0 9 9"','viewBox="1 1 7 7"'));await unknownImage.decode();
let showUnknown=false;
let selection:number[]|null=null;
let count=8,offset=0,requests=0,last:Placement|null=null,saved:Placement[]=[],manual=false;
function draw(){ctx.fillStyle='#06281f';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(96+offset,54);ctx.scale(.9,.9);(selection||[0,2,5,7,1,3,4,6]).slice(0,count).forEach(i=>{const m=markers[i];ctx.fillStyle='white';ctx.fillRect(m.x-24,m.y-24,SIZE+48,SIZE+48);ctx.drawImage(images[i],m.x,m.y,SIZE,SIZE);});if(showUnknown){ctx.fillStyle='white';ctx.fillRect(W/2-78,H/2-78,156,156);ctx.drawImage(unknownImage,W/2-54,H/2-54,108,108);}ctx.restore();}
draw();setInterval(draw,40);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{requests++;return canvas.captureStream(20);}});
function Harness(){const [p,setP]=useState<Placement>({stamp_type:'star',position_x:.5,position_y:.5,scale:160,rotation:0}),[camera,setCamera]=useState(true),[locked,setLocked]=useState(false),[stamps,setStamps]=useState<Stamp[]>([]);
 return <PhoneController placement={p} stamps={stamps} camera={camera} setCamera={value=>{manual=!value;setCamera(value);}} onChange={value=>{last=value;setP(value);}} onCameraPlacement={value=>{setLocked(!!value);if(value){last=value;setP(value);}}} onStatus={()=>{}} online busy={false} canPlace={!camera||locked} preview={()=>{}} stamp={sample=>{const value=sample?.placement||p;saved.push(value);setStamps(rows=>[...rows,{...value,id:String(rows.length),session_id:'test',created_at:'',sequence:rows.length}]);}} notice="" error="" dismissError={()=>{}}/>;
}
if(location.search.includes('wallpaper'))createRoot(document.getElementById('root')!).render(<Wallpaper stamps={[]} previews={[]} qr=""/>);
else{createRoot(document.getElementById('root')!).render(<Harness/>);setTimeout(()=>void check(),0);}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function check(){const output=document.createElement('output');output.id='qa-test-result';output.style.cssText='position:fixed;left:8px;bottom:80px;z-index:99;background:#111;color:white;font:11px monospace;padding:8px;max-width:95vw';document.body.append(output);
 const ensure=(value:unknown,message:string)=>{if(!value)throw Error(message);};
 async function locked(){for(let i=0;i<100;i++){if(document.querySelector('.tracking-status.locked'))return;await wait(100);}throw Error('Camera failed to lock');}
 function pointer(target:HTMLElement,type:string,id:number,x:number,y:number){target.setPointerCapture=()=>{};target.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true,buttons:type==='pointerup'?0:1}));}
 async function choose(value:string){(document.querySelector('button[aria-label="Options"]') as HTMLElement).click();await wait(50);const select=document.querySelector('select')!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(80);}
 const nearly=(a:number,b:number,t=.002)=>Math.abs(a-b)<t;
 try{await locked();ensure(!document.querySelector('select'),'Mode selector leaked onto main screen');ensure(document.querySelector('.display-zoom')?.textContent==='2×','Camera did not start at 2×');const stage=document.querySelector('.camera-view') as HTMLElement;const centre={x:innerWidth/2,y:innerHeight/2};const original={...last!};
 ensure(!document.querySelector('.tracking-debug'),'Tracking Debug was not disabled by default');
 (document.querySelector('button[aria-label="Options"]') as HTMLElement).click();await wait(60);
 const toggle=[...document.querySelectorAll('label')].find(l=>l.textContent==='Tracking Debug')?.querySelector('input');ensure(toggle,'Tracking Debug toggle missing');(toggle as HTMLElement).click();await wait(60);(document.querySelector('button[aria-label="Close options"]') as HTMLElement).click();await wait(300);
 ensure(document.querySelectorAll('[data-marker-status="accepted"]').length===8,'Accepted outlines missing');
 ensure(getComputedStyle(document.querySelector('.tracking-debug')!).pointerEvents==='none','Debugger intercepts gestures');
 showUnknown=true;draw();await wait(300);const unknown=document.querySelector('[data-marker-id="999"]');ensure(unknown?.getAttribute('data-marker-status')==='rejected'&&unknown.textContent?.includes('Unknown marker ID'),'Unknown tag not shown as rejected');showUnknown=false;draw();await wait(180);

 for(const n of [5,8,5,8]){count=n;draw();await wait(230);ensure(!!document.querySelector('.tracking-status.locked'),'Five/eight marker transition lost tracking');}
 selection=[0,1,2];count=3;draw();await wait(300);ensure(!!document.querySelector('.tracking-status.locked'),'Three top-edge tags were rejected');selection=null;count=8;draw();await wait(230);

 pointer(stage,'pointerdown',1,centre.x,centre.y);pointer(stage,'pointermove',1,centre.x+45,centre.y+20);pointer(stage,'pointerup',1,centre.x+45,centre.y+20);await wait(180);ensure(nearly(last!.position_x,original.position_x),'Default mode dragged');
 pointer(stage,'pointerdown',1,centre.x-30,centre.y);pointer(stage,'pointerdown',2,centre.x+30,centre.y);pointer(stage,'pointermove',1,centre.x,centre.y-45);pointer(stage,'pointermove',2,centre.x,centre.y+45);pointer(stage,'pointerup',2,centre.x,centre.y+45);pointer(stage,'pointerup',1,centre.x,centre.y-45);await wait(180);ensure(nearly(last!.scale/original.scale,1.5,.03)&&nearly(last!.rotation,90,1),'Default pinch / rotation');ensure(nearly(last!.position_x,.5)&&nearly(last!.position_y,.5),'Default pinch moved centre');
 const zoomBefore={...last!};(document.querySelector('.display-zoom') as HTMLElement).click();await wait(180);ensure(nearly(last!.scale,zoomBefore.scale,1)&&nearly(last!.rotation,zoomBefore.rotation,1)&&nearly(last!.position_x,zoomBefore.position_x),'Zoom changed saved transform');
 offset=40;draw();await wait(250);ensure(last!.position_x<.49,'Physical aim did not move canvas position');const image=document.querySelector('.camera-stamp') as HTMLElement,rect=image.getBoundingClientRect();ensure(Math.hypot(rect.x+rect.width/2-centre.x,rect.y+rect.height/2-centre.y)<2,'Sticker not screen centred');
 (document.querySelector('.phone-actions button:last-child') as HTMLElement).click();await wait(50);ensure(saved.length===1,'Default tap did not stamp');
 await choose('legacy');await wait(180);ensure(requests===1,'Camera restarted switching camera modes');const anchored={...last!};offset=0;draw();await wait(250);ensure(nearly(last!.position_x,anchored.position_x),'Legacy not anchored');
 pointer(stage,'pointerdown',1,centre.x,centre.y);pointer(stage,'pointermove',1,centre.x+20,centre.y+10);pointer(stage,'pointerup',1,centre.x+20,centre.y+10);await wait(180);ensure(last!.position_x>anchored.position_x,'Legacy drag failed');
 const stamp=document.querySelector('.phone-actions button:last-child') as HTMLElement;pointer(stamp,'pointerdown',7,0,0);await wait(80);const hold={...last!};offset=35;draw();await wait(250);ensure(last!.position_x<hold.position_x-.005,'Precision hold not phone fixed');pointer(stamp,'pointerup',7,0,0);await wait(80);ensure(saved.length===2&&nearly(saved[1].position_x,last!.position_x),'Release did not save final sample');
 pointer(stamp,'pointerdown',8,0,0);count=2;draw();await wait(400);pointer(stamp,'pointerup',8,0,0);await wait(80);ensure(saved.length===2,'Invalid tracking committed hold');ensure((stamp as HTMLButtonElement).disabled,'Invalid tracking enabled Stamp');
 count=3;draw();await locked();await choose('camera-stamp');await wait(180);ensure(requests===1,'Camera restarted after recovery');await choose('manual');await wait(180);ensure(manual&&!document.querySelector('video')&&document.querySelectorAll('.manual image').length===3,'Manual miniature missing saved stamps');
 const mini=document.querySelector('.manual') as HTMLElement,r=mini.getBoundingClientRect(),beforeDrag=last!.position_x;pointer(mini,'pointerdown',1,r.x+r.width*beforeDrag,r.y+r.height*last!.position_y);pointer(mini,'pointermove',1,r.x+r.width*(beforeDrag+.05),r.y+r.height*last!.position_y);pointer(mini,'pointerup',1,r.x+r.width*(beforeDrag+.05),r.y+r.height*last!.position_y);await wait(50);ensure(nearly(last!.position_x,beforeDrag+.05),'Manual drag failed');
 const manualBefore=last!.scale;pointer(mini,'pointerdown',1,r.x+r.width*.45,r.y+r.height*.5);pointer(mini,'pointerdown',2,r.x+r.width*.55,r.y+r.height*.5);pointer(mini,'pointermove',1,r.x+r.width*.4,r.y+r.height*.5);pointer(mini,'pointermove',2,r.x+r.width*.6,r.y+r.height*.5);pointer(mini,'pointerup',2,0,0);pointer(mini,'pointerup',1,0,0);await wait(80);ensure(nearly(last!.scale,Math.min(600,manualBefore*2),2),'Manual pinch failed');
 output.textContent='PASS: opt-in actual-corner debugger + accepted/unknown IDs + zoom alignment + gestures/stamping + three-tag tracking + legacy/manual modes';
 }catch(e){output.textContent='FAIL: '+String(e);console.error(e);}}
