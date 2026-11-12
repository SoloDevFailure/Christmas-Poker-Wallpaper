import type {MarkerDiagnostic,Point} from './geometry';
import {imageToView,videoViewport} from './manipulation';
export type DebugSnapshot={acquisition?:string;frameId?:number;outcome?:string;detectorMs?:number|null;fitMs?:number|null;workerMs?:number|null;captureMs?:number|null;deliveryMs?:number|null;consecutiveFailures?:number;markers:MarkerDiagnostic[];detected:number;acceptedIds:number[];phase:string;reason:string;detail:string;check:string;error:number|null;at:number|null;lastValidAt:number|null;lastValidIds?:number[];width:number;height:number;capture:string;draw:boolean;lastFailure?:{at:number;reason:string;markers:MarkerDiagnostic[]}};
export const emptyDebug:DebugSnapshot={markers:[],detected:0,acceptedIds:[],phase:'lost',reason:'Waiting for camera result',detail:'',check:'',error:null,at:null,lastValidAt:null,width:0,height:0,capture:'—',draw:false};
export const debugColors={accepted:'#62f28c',rejected:'#ff7373',pending:'#ffdd57'};
export function detectedCorners(corners:Point[],view:{width:number;height:number},frame:{width:number;height:number},zoom:1|2){
 const v=videoViewport(view.width,view.height,frame.width,frame.height,'contain',zoom);
 return corners.map(p=>imageToView(p,v));
}
export function frameMarkerDecisions(markers:MarkerDiagnostic[],acceptedIds:number[],frameReason:string){
 return markers.map(m=>m.status==='accepted'&&!acceptedIds.includes(m.id)?{...m,status:frameReason==='motion-confirmation'?'pending' as const:'rejected' as const,reason:'Frame '+(frameReason==='motion-confirmation'?'awaiting movement confirmation':frameReason)}:m);
}

// A light ring connects only centres measured from current accepted detections.
export function markerConnections(markers:MarkerDiagnostic[],ids:number[],view:{width:number;height:number},frame:{width:number;height:number},zoom:1|2){
 const centres=markers.filter(m=>m.status==='accepted'&&ids.includes(m.id)&&m.corners.length===4&&m.corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).map(m=>{const corners=detectedCorners(m.corners,view,frame,zoom);return {id:m.id,x:corners.reduce((s,p)=>s+p.x,0)/4,y:corners.reduce((s,p)=>s+p.y,0)/4};});
 if(centres.length<2)return [];
 const centre={x:centres.reduce((s,p)=>s+p.x,0)/centres.length,y:centres.reduce((s,p)=>s+p.y,0)/centres.length};
 centres.sort((a,b)=>Math.atan2(a.y-centre.y,a.x-centre.x)-Math.atan2(b.y-centre.y,b.x-centre.x));
 return centres.slice(0,centres.length===2?1:centres.length).map((p,i)=>({from:p,to:centres[(i+1)%centres.length]}));
}
