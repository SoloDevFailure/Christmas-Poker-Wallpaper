import {H,W,project,homography,invertHomography,type Point} from './geometry';
import {imageToView,viewToImage,wrapAngle,type Viewport} from './manipulation';
import {stampDimensions,type Placement} from './types';
export type PlacementMode='camera-stamp'|'legacy'|'manual';
export type ScreenStamp={centre:Point;size:number;rotation:number};
export type StampSample={placement:Placement;at:number;validUntil:number};
export type CameraHandle={sample:()=>StampSample|null;beginPrecision:()=>boolean;endPrecision:()=>StampSample|null;cancelPrecision:()=>void};
export function screenStampFromWorld(p:Placement,inverse:number[],v:Viewport):ScreenStamp {
 const c={x:p.position_x*W,y:p.position_y*H},r=p.rotation*Math.PI/180,{width,height}=stampDimensions(p);
 const map=(x:number,y:number)=>imageToView(project(inverse,{x:c.x+x*Math.cos(r)-y*Math.sin(r),y:c.y+x*Math.sin(r)+y*Math.cos(r)}),v);
 const left=map(-width/2,0),right=map(width/2,0),top=map(0,-height/2),bottom=map(0,height/2);
 return {centre:map(0,0),size:Math.max(Math.hypot(right.x-left.x,right.y-left.y),Math.hypot(bottom.x-top.x,bottom.y-top.y)),rotation:Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI};
}
export function phoneFixedPlacement(base:Placement,h:number[],v:Viewport,screen:ScreenStamp):Placement {
 const r=screen.rotation*Math.PI/180,{width,height}=stampDimensions({...base,scale:screen.size});
 const map=(x:number,y:number)=>project(h,viewToImage({x:screen.centre.x+x*Math.cos(r)-y*Math.sin(r),y:screen.centre.y+x*Math.sin(r)+y*Math.cos(r)},v));
 const c=map(0,0),left=map(-width/2,0),right=map(width/2,0),top=map(0,-height/2),bottom=map(0,height/2);
 const scale=width>=height?Math.hypot(right.x-left.x,right.y-left.y):Math.hypot(bottom.x-top.x,bottom.y-top.y);
 return {...base,position_x:c.x/W,position_y:c.y/H,scale:Math.max(32,Math.min(600,scale)),rotation:wrapAngle(Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI)};
}
export function resizePhoneStamp(base:{size:number;rotation:number},start:Point[],current:Point[]){
 if(start.length<2||current.length<2)return base;
 const a={x:start[1].x-start[0].x,y:start[1].y-start[0].y},b={x:current[1].x-current[0].x,y:current[1].y-current[0].y},distance=Math.hypot(a.x,a.y);
 if(distance<1)return base;
 return {size:Math.max(.06,Math.min(.85,base.size*Math.hypot(b.x,b.y)/distance)),rotation:wrapAngle(base.rotation+(Math.atan2(b.y,b.x)-Math.atan2(a.y,a.x))*180/Math.PI)};
}
export function smoothTracking<T extends {h:number[];inverse:number[];width:number;height:number;at:number}>(next:T,previous:T|null,support?:Point[]):T {
 if(!previous||next.at-previous.at>250||Math.abs(next.width/next.height-previous.width/previous.height)>.01)return next;
 const board=support||[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}];
 const a=board.map(p=>project(next.inverse,p)),b=board.map(p=>{const q=project(previous.inverse,p);return {x:q.x*next.width/previous.width,y:q.y*next.height/previous.height};});
 if(Math.max(...a.map((p,i)=>Math.hypot((p.x-b[i].x)/next.width,(p.y-b[i].y)/next.height)))>.002)return next;
 const inverse=homography(board,a.map((p,i)=>({x:.7*p.x+.3*b[i].x,y:.7*p.y+.3*b[i].y})));
 return {...next,inverse,h:invertHomography(inverse)};
}

// Compare projected board corners in normalized camera coordinates across resolutions.
export function trackingMotion(next:{inverse:number[];width:number;height:number},previous:{inverse:number[];width:number;height:number},support:Point[]=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}]) {
 return Math.max(0,...support.map(p=>{const a=project(next.inverse,p),b=project(previous.inverse,p);return Math.hypot(a.x/next.width-b.x/previous.width,a.y/next.height-b.y/previous.height);}));
}

export function phoneReference(v:Viewport,displayZoom:1|2){return Math.min(v.width,v.height,v.imageWidth*v.scale/displayZoom,v.imageHeight*v.scale/displayZoom);}
