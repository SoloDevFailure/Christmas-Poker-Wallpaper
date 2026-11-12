import {TrackerEngine} from './trackerEngine';
const engine=new TrackerEngine();
self.onmessage=(event:MessageEvent<{buffer:ArrayBuffer;width:number;height:number;at:number;epoch:number;id:number;captureMs:number;captureWidth:number;captureHeight:number;aim?:{x:number;y:number};trackingDebug?:boolean}>)=>{
 const {buffer,width,height,...meta}=event.data,started=performance.now();
 try{
  const result=engine.process(new ImageData(new Uint8ClampedArray(buffer),width,height),meta.trackingDebug,meta.aim);
  self.postMessage({...meta,width,height,...result});
 }catch(e){self.postMessage({...meta,width,height,error:String(e),reason:'detector-failure',workerMs:performance.now()-started});}
};
