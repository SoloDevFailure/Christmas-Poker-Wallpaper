import {TrackerEngine} from './trackerEngine';
const engine=new TrackerEngine();
let canvas:OffscreenCanvas|undefined,context:OffscreenCanvasRenderingContext2D|null=null;
type Frame={buffer?:ArrayBuffer;bitmap?:ImageBitmap;width:number;height:number;at:number;epoch:number;id:number;captureMs:number;resizeMs:number;drawMs:number;pixelsMs:number;captureWidth:number;captureHeight:number;aim?:{x:number;y:number};trackingDebug?:boolean;capturePath?:string;bitmapMs?:number};
// Capability handshake: unsupported browsers keep the existing RGBA path.
self.postMessage({type:'ready',bitmapCapture:typeof OffscreenCanvas==='function'});
self.onmessage=(event:MessageEvent<Frame>)=>{
 const {buffer,bitmap,width,height,...meta}=event.data,started=performance.now();
 let stage:'capture'|'detector'='capture';
 try{
  let image:ImageData;
  if(bitmap){
   const resizeStarted=performance.now();
   canvas??=new OffscreenCanvas(width,height);
   context??=canvas.getContext('2d',{willReadFrequently:true});
   if(!context)throw Error('Worker camera canvas unavailable');
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
   const resized=performance.now();context.drawImage(bitmap,0,0,width,height);
   const drawn=performance.now();image=context.getImageData(0,0,width,height);
   const read=performance.now();
   meta.resizeMs=resized-resizeStarted;meta.drawMs=drawn-resized;meta.pixelsMs=read-drawn;
   meta.captureMs=(meta.bitmapMs||0)+read-started;
  }else{
   if(!buffer)throw Error('Missing camera pixel buffer');
   image=new ImageData(new Uint8ClampedArray(buffer),width,height);
  }
  stage='detector';
  const result=engine.process(image,meta.trackingDebug,meta.aim);
  self.postMessage({...meta,width,height,...result});
 }catch(e){self.postMessage({...meta,width,height,error:String(e),reason:stage==='capture'?'capture-failure':'detector-failure',captureFallback:!!bitmap&&stage==='capture',workerMs:performance.now()-started});}
 finally{bitmap?.close();}
};
