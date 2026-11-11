import Aruco from 'js-aruco2';
import {fitMarkers,TrackingError,type FitDiagnostics} from './geometry';
const { AR } = Aruco;
const detector = new AR.Detector({ dictionaryName: 'ARUCO' });
self.onmessage = (event: MessageEvent<{
    buffer: ArrayBuffer;
    width: number;
    height: number;
    at: number;
    epoch: number;
    aim?:{x:number;y:number};
    trackingDebug?:boolean;
}>) => {
    try {
        const { buffer, width, height, at, epoch } = event.data;
        const found = detector.detect(new ImageData(new Uint8ClampedArray(buffer), width, height));
        let fit:ReturnType<typeof fitMarkers>|undefined,rejection:string|undefined,reason:string|undefined,usable=0;
        const trace:FitDiagnostics|undefined=event.data.trackingDebug?{markers:[],candidateIds:[],check:''}:undefined;
        try{fit=fitMarkers(found,{width,height,aim:event.data.aim},trace);usable=fit.usable;}
        catch(e){rejection=e instanceof Error?e.message:String(e);reason=e instanceof TrackingError?e.reason:'poor-homography';usable=e instanceof TrackingError?e.usable:0;}
        self.postMessage({found,fit,rejection,reason,usable,trace,at,width,height,epoch});
    }
    catch (e) {
        self.postMessage({ error: String(e),at:event.data.at,width:event.data.width,height:event.data.height,epoch:event.data.epoch });
    }
};
