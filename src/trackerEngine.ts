import Aruco from 'js-aruco2';
import {fitMarkers,TrackingError,type FitDiagnostics,type Point} from './geometry';
// js-aruco2 grows its plain arrays but never shrinks them. Adaptive resizing
// otherwise makes thresholding scan the previous high-resolution image tail.
export function trimDetectorBuffers(detector:{grey:{data:number[]};thres:{data:number[]};binary:number[]},width:number,height:number){
 detector.grey.data.length=width*height;detector.thres.data.length=width*height;detector.binary.length=(width+2)*(height+2);
}
export class TrackerEngine {
 private detector=new Aruco.AR.Detector({dictionaryName:'ARUCO'});
 process(image:ImageData,debug=false,aim?:Point){
  const started=performance.now();
  if(!image.width||!image.height||image.data.length!==image.width*image.height*4)throw Error('Invalid camera RGBA frame');
  trimDetectorBuffers(this.detector,image.width,image.height);
  const found=this.detector.detect(image),detectorMs=performance.now()-started;
  let fit:ReturnType<typeof fitMarkers>|undefined,rejection:string|undefined,reason:string|undefined,usable=0;
  const trace:FitDiagnostics|undefined=debug?{markers:[],candidateIds:[],check:''}:undefined;
  const fitStarted=performance.now();
  try{fit=fitMarkers(found,{width:image.width,height:image.height,aim},trace);usable=fit.usable;}
  catch(e){rejection=e instanceof Error?e.message:String(e);reason=e instanceof TrackingError?e.reason:'poor-homography';usable=e instanceof TrackingError?e.usable:0;}
  return {found,fit,rejection,reason,usable,trace,detectorMs,fitMs:performance.now()-fitStarted,workerMs:performance.now()-started};
 }
}
