import type {MarkerDiagnostic,Point} from './geometry';
import {imageToView,videoViewport} from './manipulation';
export type DebugSnapshot={markers:MarkerDiagnostic[];detected:number;acceptedIds:number[];phase:string;reason:string;detail:string;check:string;error:number|null;at:number|null;lastValidAt:number|null;width:number;height:number;capture:string;draw:boolean;lastFailure?:{at:number;reason:string;markers:MarkerDiagnostic[]}};
export const emptyDebug:DebugSnapshot={markers:[],detected:0,acceptedIds:[],phase:'lost',reason:'Waiting for camera result',detail:'',check:'',error:null,at:null,lastValidAt:null,width:0,height:0,capture:'—',draw:false};
export const debugColors={accepted:'#62f28c',rejected:'#ff7373',pending:'#ffdd57'};
export function detectedCorners(corners:Point[],view:{width:number;height:number},frame:{width:number;height:number},zoom:1|2){
 const v=videoViewport(view.width,view.height,frame.width,frame.height,'contain',zoom);
 return corners.map(p=>imageToView(p,v));
}
export function frameMarkerDecisions(markers:MarkerDiagnostic[],acceptedIds:number[],frameReason:string){
 return markers.map(m=>m.status==='accepted'&&!acceptedIds.includes(m.id)?{...m,status:frameReason==='motion-confirmation'?'pending' as const:'rejected' as const,reason:'Frame '+(frameReason==='motion-confirmation'?'awaiting movement confirmation':frameReason)}:m);
}
