import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitMarkers,TrackingError,markers,markerCorners,project,invertHomography,type Detection} from '../src/geometry.ts';
import {TrackingState,RECOVERY_HOLD,processingFrame,processingBudget,FRAME_PAUSE} from '../src/trackingState.ts';
import {trackingMotion} from '../src/cameraPlacement.ts';
const h=[.52,.02,75,.01,.55,40,.0001,.00004];
const make=(ids:number[],transform=h,noise=0):Detection[]=>ids.map(i=>({id:markers[i].id,corners:markerCorners(markers[i]).map((p,j)=>{const q=project(transform,p);return {x:q.x+noise*Math.sin(i*7+j),y:q.y+noise*Math.cos(i*3-j)};})}));
const close=(a:number,b:number,t=.001)=>assert.ok(Math.abs(a-b)<t,a+' != '+b);
function reason(found:Detection[],expected:string,frame?:{width:number;height:number}){assert.throws(()=>fitMarkers(found,frame),(e:unknown)=>e instanceof TrackingError&&e.reason===expected);}
test('five detected markers can retain a valid three-tag edge consensus',()=>{
 const found=make([0,1,2,3,4]);found[3].corners=found[3].corners.map(p=>({x:p.x+90,y:p.y+25}));found[4].corners=found[4].corners.map(p=>({x:p.x-90,y:p.y-30}));
 const fit=fitMarkers(found,{width:1280,height:720,aim:project(h,{x:960,y:100})});assert.equal(fit.detected,5);assert.equal(fit.count,3);assert.deepEqual(fit.ids,markers.slice(0,3).map(m=>m.id));
 const q=project(fit.h,project(h,{x:1100,y:130}));close(q.x,1100);close(q.y,130);
});
for(const ids of [[0,1,2],[0,3,5],[2,4,7],[5,6,7]])test('noisy partial-screen edge '+ids,()=>{
 const centre=markerCorners(markers[ids[1]]).reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0}),aim=project(h,centre);
 const fit=fitMarkers(make(ids,h,.25),{width:1280,height:720,aim});assert.equal(fit.count,3);const q=project(fit.h,aim);assert.ok(Math.hypot(q.x-centre.x,q.y-centre.y)<3);
});
test('all five-marker combinations accepted with a clean projective view',()=>{for(let a=0;a<4;a++)for(let b=a+1;b<5;b++)for(let c=b+1;c<6;c++)for(let d=c+1;d<7;d++)for(let e=d+1;e<8;e++){const fit=fitMarkers(make([a,b,c,d,e]),{width:1280,height:720});assert.equal(fit.count,5);}});
test('known corner geometry, not unseen full-wallpaper horizon, validates close-up aim',()=>{
 const closeView=[.5,0,70,0,.5,60,0,-.00095],fit=fitMarkers(make([0,1,2],closeView),{width:1280,height:720});assert.equal(fit.count,3);
 const aim={x:640,y:360},world=project(fit.h,aim),expected=project(invertHomography(closeView),aim);close(world.x,expected.x);close(world.y,expected.y);
});
test('camera resolution changes do not tighten the same reprojection threshold',()=>{
 const found=make([0,1,2,3,4,5,6,7],h,1.3),low=fitMarkers(found,{width:1280,height:720}),high=fitMarkers(found.map(m=>({...m,corners:m.corners.map(p=>({x:p.x*4,y:p.y*4}))})),{width:5120,height:2880});assert.deepEqual(low.ids,high.ids);close(high.error,low.error*4);close(high.tolerance,low.tolerance*4);
});
test('rejections distinguish detection, malformed geometry and incompatible perspectives',()=>{
 reason(make([0,1]),'insufficient-markers');const malformed=make([0,1,2,3,4]);malformed.forEach(m=>m.corners[0]=m.corners[1]);reason(malformed,'invalid-marker-geometry');
 const poor=make([0,2,5]);poor[1].corners=poor[1].corners.map(p=>({x:p.x+140,y:p.y+90}));reason(poor,'poor-homography');
 const duplicate=make([0,2,5]);reason([...duplicate,duplicate[0]],'invalid-marker-geometry');
});
test('a horizon at the aiming point is rejected explicitly',()=>{
 const f=make([0,1,2],[.5,0,70,0,.5,60,0,-.00095]);
 // Inverse horizon y=-.5/.00095; only the observed top strip is supported.
 assert.throws(()=>fitMarkers(f,{width:1280,height:720,aim:{x:640,y:-.5/.00095}}),e=>e instanceof TrackingError&&e.reason==='invalid-projection');
});
test('motion checks use shared observed tags rather than extrapolated distant corners',()=>{
 const a={inverse:[1,0,0,0,1,0,0,0],width:1280,height:720},b={...a,inverse:[1,0,0,0,1,0,0,-.0008]},support=markers.slice(0,3).flatMap(markerCorners);
 assert.ok(trackingMotion(b,a)>.18);assert.ok(trackingMotion(b,a,support)<.18);assert.equal(trackingMotion(b,a,[]),0);
});
test('changing accepted marker sets and resolution does not toggle valid tracking',()=>{
 const tracking=new TrackingState();for(const [i,ids] of [[0,1,2],[0,1,2,3,4],[1,2,4],[0,2,3,5,7],[5,6,7]].entries()){const fit=fitMarkers(make(ids),{width:1280,height:720});assert.ok(fit.count>=3);assert.deepEqual(tracking.accept(i*100,i*100+180),{phase:'locked',stampable:true});}
});
test('capture processing latency does not consume the dropout recovery window',()=>{
 const tracking=new TrackingState();tracking.accept(0,280);assert.deepEqual(tracking.reject('insufficient-markers',370),{phase:'holding',stampable:true});assert.equal(tracking.read(900).phase,'holding');assert.equal(tracking.read(281+RECOVERY_HOLD).phase,'lost');assert.equal(tracking.lastRejection,'insufficient-markers');
});
test('alternating short failures retain the bounded stampable held transform',()=>{
 const tracking=new TrackingState();for(let i=0;i<20;i++){const at=i*180;assert.equal(tracking.accept(at,at+80).phase,'locked');assert.deepEqual(tracking.reject('poor-homography',at+150),{phase:'holding',stampable:true});}assert.equal(tracking.read(5000).phase,'lost');
});
test('genuine dropout, stale frames and orientation resets disable stamping',()=>{
 const tracking=new TrackingState();tracking.accept(100,180);assert.equal(tracking.read(451).stampable,true);tracking.reject('no-markers',500);assert.equal(tracking.read(1181).phase,'lost');assert.equal(tracking.accept(100,1250).stampable,false);assert.equal(tracking.reason,'stale-frame');assert.equal(tracking.accept(1300,1400).phase,'locked');assert.equal(tracking.reject('view-changed',1401,true).phase,'lost');
});

test('portrait detector frames have the same pixel budget as landscape and remain uncropped',()=>{assert.deepEqual(processingFrame(3840,2160,1280),{width:1280,height:720});assert.deepEqual(processingFrame(2160,3840,1280),{width:720,height:1280});assert.deepEqual(processingFrame(2160,3840,1920),{width:1080,height:1920});assert.deepEqual(processingFrame(640,480,1280),{width:640,height:480});});

test('adaptive budget accounts for capture age across TWO processing intervals',()=>{assert.equal(processingBudget(1280,200,false),960);assert.equal(processingBudget(1920,220,false),1280);assert.equal(processingBudget(1280,100,true),1280);assert.equal(processingBudget(1280,50,true),1920);assert.equal(processingBudget(1280,50,false),1280);assert.equal(processingBudget(960,210,true),960);
 const state=new TrackingState(),latency=200;state.accept(0,latency);assert.equal(state.read(2*latency+FRAME_PAUSE-1).phase,'holding');const faster=latency*(960/1280)**2;state.accept(1000,1000+faster);assert.equal(state.read(1000+2*faster+FRAME_PAUSE-1).stampable,true);
});
