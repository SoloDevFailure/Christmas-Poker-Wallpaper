import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phoneFixedPlacement,screenStampFromWorld,resizePhoneStamp,smoothTracking,trackingMotion,phoneReference} from '../src/cameraPlacement.ts';
import {videoViewport,viewToImage} from '../src/manipulation.ts';
import {project,invertHomography,canvasToPresentation,presentationToCanvas,markers,markerCorners,fitMarkers,wellDistributed,W,H,SIZE,QUIET} from '../src/geometry.ts';
const base={stamp_type:'star' as const,position_x:.4,position_y:.6,scale:160,rotation:20};
const close=(a:number,b:number,t=1e-6)=>assert.ok(Math.abs(a-b)<t,a+' != '+b);
for(const [width,height] of [[390,844],[844,390]])for(const zoom of [1,2] as const)test('phone-centred mapping '+width+'x'+height+' zoom '+zoom,()=>{
 const v=videoViewport(width,height,1920,1080,'contain',zoom),screen={centre:{x:width/2,y:height/2},size:100,rotation:27};
 for(const h of [[1,0,0,0,1,0,0,0],[.8,.04,80,.03,.9,40,.0001,.00004]]){
  const p=phoneFixedPlacement(base,h,v,screen),q=project(h,viewToImage(screen.centre,v));close(p.position_x*W,q.x);close(p.position_y*H,q.y);
  const rendered=screenStampFromWorld(p,invertHomography(h),v);close(rendered.centre.x,width/2);close(rendered.centre.y,height/2);
 }
});
test('physical aiming changes wallpaper position; legacy placement stays anchored until hold',()=>{
 const v=videoViewport(844,390,1920,1080),screen={centre:{x:422,y:195},size:100,rotation:0},a=[1,0,0,0,1,0,0,0],b=[1,0,110,0,1,-45,0,0];
 const p=phoneFixedPlacement(base,a,v,screen),q=phoneFixedPlacement(base,b,v,screen);close((q.position_x-p.position_x)*W,110);close((q.position_y-p.position_y)*H,-45);
 // Mode switch / precision snapshot uses the legacy sticker's present screen centre.
 const frozen=screenStampFromWorld(base,invertHomography(a),v),hold=phoneFixedPlacement(base,b,v,frozen);close(hold.position_x*W,base.position_x*W+110);close(hold.position_y*H,base.position_y*H-45);close(hold.scale,base.scale);close(hold.rotation,base.rotation);
 const legacy={...hold};screenStampFromWorld(legacy,invertHomography(a),v);assert.deepEqual(legacy,hold);
});
test('centred pinch and rotation ignore translated gesture centre and single fingers',()=>{
 const state={size:.2,rotation:10},start=[{x:10,y:20},{x:110,y:20}],end=[{x:400,y:100},{x:400,y:250}];
 const q=resizePhoneStamp(state,start,end);close(q.size,.3);close(q.rotation,100);assert.deepEqual(resizePhoneStamp(state,[start[0]],[end[0]]),state);
 close(resizePhoneStamp(q,[{x:0,y:0}],[{x:10,y:10}]).size,.3);
});
test('display zoom preserves stamp position, rotation and scale under perspective',()=>{
 const h=[.8,.04,80,.03,.9,40,.0001,.00004],screen={centre:{x:422,y:195},size:100,rotation:35};
 const a=phoneFixedPlacement(base,h,videoViewport(844,390,1920,1080,'contain',1),screen),b=phoneFixedPlacement(base,h,videoViewport(844,390,1920,1080,'contain',2),{...screen,size:200});
 close(a.position_x,b.position_x);close(a.position_y,b.position_y);close(a.scale,b.scale);close(a.rotation,b.rotation);
});
test('presentation inset preserves stored artwork coordinates and marker geometry',()=>{
 for(const p of [{x:0,y:0},{x:W,y:H},{x:731,y:483}]){const q=presentationToCanvas(canvasToPresentation(p));close(q.x,p.x);close(q.y,p.y);}
 assert.deepEqual(canvasToPresentation({x:0,y:0}),{x:96,y:54});assert.deepEqual(canvasToPresentation({x:W,y:H}),{x:1824,y:1026});
 assert.equal(new Set(markers.map(m=>m.id)).size,8);
 for(const m of markers){assert.ok(m.x-QUIET>=0&&m.y-QUIET>=0&&m.x+SIZE+QUIET<=W&&m.y+SIZE+QUIET<=H);const corner=canvasToPresentation(markerCorners(m)[0]);close(corner.x,m.x);close(corner.y,m.y);}
});
test('all distributed three-marker combinations recover perspective, collinear sets rejected',()=>{
 const h=[.5,.04,90,.02,.55,40,.00012,.00008],found=markers.map(m=>({id:m.id,corners:markerCorners(m).map(p=>project(h,p))}));let accepted=0,rejected=0;
 for(let a=0;a<6;a++)for(let b=a+1;b<7;b++)for(let c=b+1;c<8;c++){
 const indices=[a,b,c];if(!wellDistributed(indices.map(i=>markers[i]))){assert.throws(()=>fitMarkers(indices.map(i=>found[i])));rejected++;continue;}
 const fit=fitMarkers(indices.map(i=>found[i]));const q=project(fit.h,project(h,{x:1200,y:800}));close(q.x,1200,.001);close(q.y,800,.001);accepted++;
 }assert.ok(accepted>40&&rejected>=2);assert.equal(fitMarkers(found).count,8);
 found[3].corners=found[3].corners.map(p=>({x:p.x+70,y:p.y-35}));assert.equal(fitMarkers(found).count,7);
});
test('smoothing reduces subpixel jitter but never lags deliberate movement or stale poses',()=>{
 const pose=(x:number,at:number)=>({h:[1,0,-x,0,1,0,0,0],inverse:[1,0,x,0,1,0,0,0],width:1920,height:1080,at});
 const old=pose(0,10),small=pose(1,100),fast=pose(30,100),stale=pose(1,500);const q=smoothTracking(small,old);close(q.inverse[2],.7);assert.equal(smoothTracking(fast,old),fast);assert.equal(smoothTracking(stale,old),stale);
});

test('unstable perspective jumps are measured independently of processing resolution',()=>{const a={inverse:[1,0,0,0,1,0,0,0],width:1920,height:1080},b={inverse:[.5,0,0,0,.5,0,0,0],width:960,height:540},jump={...a,inverse:[1,0,700,0,1,0,0,0]};close(trackingMotion(a,b),0);assert.ok(trackingMotion(jump,a)>.18);});

test('default artwork fits the contained camera image in either orientation without hitting size limit',()=>{for(const [w,h] of [[390,844],[844,390]]){const v=videoViewport(w,h,1920,1080),hcam=[1/.81,0,0,0,1/.81,0,0,0],size=.28*phoneReference(v,1),p=phoneFixedPlacement(base,hcam,v,{centre:{x:w/2,y:h/2},size,rotation:0});assert.ok(p.scale<400&&p.scale>300);close(phoneReference(v,1),phoneReference(videoViewport(w,h,1920,1080,'contain',2),2));}});
