import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoViewport,imageToView,viewToImage,cameraPoint,manipulate,stickerCorners} from '../src/manipulation.ts';
import {homography,project,W,H} from '../src/geometry.ts';
function close(a:number,b:number){assert.ok(Math.abs(a-b)<1e-6,a+' vs '+b);}
for(const [width,height] of [[390,844],[844,390]])test('display crop preserves image/touch alignment at '+width+'x'+height,()=>{
 const one=videoViewport(width,height,1280,720,'contain',1),two=videoViewport(width,height,1280,720,'contain',2);
 close(two.scale,one.scale*2);
 for(const p of [{x:640,y:360},{x:520,y:310},{x:800,y:430}]){
  const a=imageToView(p,one),b=imageToView(p,two),q=viewToImage(b,two);
  close(b.x-width/2,(a.x-width/2)*2);close(b.y-height/2,(a.y-height/2)*2);close(q.x,p.x);close(q.y,p.y);
 }
});
test('zoom changes view size, never anchored wallpaper position, scale or rotation',()=>{
 const board=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}],camera=[{x:120,y:50},{x:1150,y:100},{x:1050,y:640},{x:180,y:690}];
 const forward=homography(board,camera),inverse=homography(camera,board);
 const p={stamp_type:'star' as const,position_x:.55,position_y:.4,scale:200,rotation:38},snapshot=JSON.stringify(p);
 for(const [width,height] of [[390,844],[844,390]])for(const zoom of [1,2] as const){
  const viewport=videoViewport(width,height,1280,720,'contain',zoom);
  for(const corner of stickerCorners(p)){const screen=imageToView(project(forward,corner),viewport),actual=cameraPoint(inverse,screen,viewport);close(actual.x,corner.x);close(actual.y,corner.y);}
 }
 assert.equal(JSON.stringify(p),snapshot);
});
test('drag sensitivity follows displayed magnification without changing scale/rotation',()=>{
 const p={stamp_type:'star' as const,position_x:.5,position_y:.5,scale:160,rotation:20};
 const identity=[1,0,0,0,1,0,0,0];
 const moves=[1,2].map(z=>{const v=videoViewport(844,390,1920,1080,'contain',z as 1|2);const a=cameraPoint(identity,{x:422,y:195},v),b=cameraPoint(identity,{x:462,y:215},v);return manipulate({placement:p,points:[a]},[b]);});
 close((moves[0].position_x-p.position_x),2*(moves[1].position_x-p.position_x));
 close((moves[0].position_y-p.position_y),2*(moves[1].position_y-p.position_y));
 for(const moved of moves){assert.equal(moved.scale,p.scale);assert.equal(moved.rotation,p.rotation);}
});
