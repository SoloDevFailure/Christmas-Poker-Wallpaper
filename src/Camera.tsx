import { forwardRef, useImperativeHandle, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { markerCorners, homography, markers, project, W, H, type Point } from './geometry';
import { MAX_TRACKING_AGE, videoViewport, viewToImage, imageToView, onVideo, manipulate, stickerCorners, type Gesture } from './manipulation';
import { validPlacement, stampAsset, type Placement } from './types';
import { stampSource } from './art';
import {screenArtworkStyle} from './screenArtwork';
import {PhoneGesture} from './phoneGesture';
import TrackingDebug from './TrackingDebugger';
import {emptyDebug,frameMarkerDecisions,type DebugSnapshot} from './trackingDebug';
import {TrackingState,processingFrame,FRAME_PAUSE,FrameGate} from './trackingState';
import { phoneFixedPlacement,screenStampFromWorld,smoothTracking,trackingMotion,phoneReference,type CameraHandle,type ScreenStamp } from './cameraPlacement';
type Pose = {
    h: number[];
    inverse: number[];
    at: number;
    width: number;
    height: number;
    count: number;
    ids:number[];
    error: number;
};
type Props = {
    placement: Placement;
    onPlacement: (p: Placement | null, at?: number, validUntil?:number) => void;
    onStatus: (s: string) => void;
    debug: boolean;
    trackingDebug:boolean;
    onMetrics: (metrics: Record<string, unknown>) => void;
    calibration: Point;
    aimReset: number;
    mode: 'camera-stamp'|'legacy';
    onPrecisionChange:(holding:boolean)=>void;
    disabled: boolean;
};
export default forwardRef<CameraHandle,Props>(function Camera(props,ref) {
    const sticker=useRef<HTMLImageElement>(null),paintFrame=useRef<number|null>(null),visual=useRef({width:0,height:0,reference:0});
    const video = useRef<HTMLVideoElement>(null), view = useRef<HTMLDivElement>(null), latest = useRef(props);
    latest.current = props;
    const tracking=useRef(new TrackingState()).current,lastReliable=useRef<Placement|null>(null),needsRebase=useRef(false);
    const artwork = useRef(props.placement), anchored = useRef(true), poseRef = useRef<Pose | null>(null), live = useRef(false), epoch = useRef(0);
    artwork.current = { ...artwork.current, ...stampAsset(props.placement) };
    const pointers = useRef(new Map<number, Point>()), gesture = useRef<Gesture | null>(null);
    const [pose, setPose] = useState<Pose | null>(null), [overlay, setOverlay] = useState(props.placement), [size, setSize] = useState({ width: 0, height: 0 });
    const [status, setStatus] = useState('Opening camera…'), [phase, setPhase] = useState('lost'), [metrics, setMetrics] = useState<Record<string,unknown>>({});
    const debugSnapshot=useRef<DebugSnapshot>({...emptyDebug}),[debugView,setDebugView]=useState<DebugSnapshot>({...emptyDebug}),[debugNow,setDebugNow]=useState(0);
    useEffect(()=>{if(!props.trackingDebug)return;const refresh=()=>{setDebugView({...debugSnapshot.current});setDebugNow(performance.now());};refresh();const timer=setInterval(refresh,125);return()=>clearInterval(timer);},[props.trackingDebug]);
    const [displayZoom,setDisplayZoom]=useState<1|2>(2);
    const zoomRef=useRef<1|2>(2);
    const phoneControls=useRef({size:.56,rotation:0}),phoneGesture=useRef<{base:{size:number;rotation:number};points:Point[]}|null>(null),precision=useRef<ScreenStamp|null>(null);
    const centredGesture=useRef(new PhoneGesture()).current;
    function paintArtwork(){
        if(latest.current.mode!=='camera-stamp'||paintFrame.current!==null)return;
        paintFrame.current=requestAnimationFrame(()=>{paintFrame.current=null;const image=sticker.current;if(image&&latest.current.mode==='camera-stamp')Object.assign(image.style,screenArtworkStyle(latest.current.placement,phoneControls.current,visual.current.reference));});
    }
    function artworkLayout(){
        const box=view.current?.getBoundingClientRect();if(!box)return;
        const v=videoViewport(box.width,box.height,video.current?.videoWidth||W,video.current?.videoHeight||H,'contain',zoomRef.current);
        visual.current={width:box.width,height:box.height,reference:phoneReference(v,zoomRef.current)};paintArtwork();
    }
    useLayoutEffect(()=>{artworkLayout();},[size.width,size.height,props.mode,displayZoom,props.placement.stamp_type,props.placement.image_data,props.placement.image_width,props.placement.image_height]);
    useEffect(()=>()=>{if(paintFrame.current!==null)cancelAnimationFrame(paintFrame.current);},[]);
    function cancelPrecision(){precision.current=null;latest.current.onPrecisionChange(false);}
    function frozenPlacement(){
        const p=lastReliable.current;if(!p)return null;
        const asset=stampAsset(latest.current.placement);
        if(!Object.entries(asset).every(([key,value])=>p[key as keyof Placement]===value))lastReliable.current={...p,...asset};
        return lastReliable.current;
    }
    function sample(){
        const p=poseRef.current,frozen=frozenPlacement(),state=tracking.read(performance.now());
        if(!p||!frozen||!state.stampable)return null;
        let placement={...frozen};
        if(latest.current.mode==='camera-stamp'){
            const intended=updatePhone(p);
            // HELD freezes physical aim. User-controlled size/rotation may change,
            // using that same reliable pose, without extending its deadline.
            placement=state.phase==='locked'?intended:{...intended,position_x:frozen.position_x,position_y:frozen.position_y};
        }
        return validPlacement(placement)?{placement,at:p.at,validUntil:tracking.validUntil}:null;
    }
    useImperativeHandle(ref,()=>({sample,beginPrecision(){const p=poseRef.current;if(latest.current.mode!=='legacy'||!p||!sample())return false;precision.current=screenStampFromWorld(artwork.current,p.inverse,viewport(p));pointers.current.clear();gesture.current=null;latest.current.onPrecisionChange(true);return true;},endPrecision(){const result=precision.current?sample():null;cancelPrecision();return result;},cancelPrecision}));
    function phoneScreen(p:Pose):ScreenStamp {const v=viewport(p);return {centre:{x:v.width/2,y:v.height/2},size:phoneControls.current.size*phoneReference(v,zoomRef.current),rotation:phoneControls.current.rotation};}
    function updatePhone(p:Pose){return phoneFixedPlacement(artwork.current,p.h,viewport(p),precision.current||phoneScreen(p),latest.current.mode!=='camera-stamp');}
    useEffect(()=>{centredGesture.clear();cancelPrecision();pointers.current.clear();gesture.current=null;phoneGesture.current=null;anchored.current=true;const p=poseRef.current;if(p&&props.mode==='camera-stamp'){const s=screenStampFromWorld(artwork.current,p.inverse,viewport(p)),v=viewport(p);phoneControls.current={size:Math.max(.06,Math.min(.85,s.size/phoneReference(v,zoomRef.current))),rotation:s.rotation};}paintArtwork();},[props.mode]);
    useEffect(()=>{if(props.disabled){centredGesture.clear();cancelPrecision();pointers.current.clear();gesture.current=null;}},[props.disabled]);
    const previousReset = useRef(props.aimReset);
    useEffect(() => {
        if (props.debug)
            latest.current.onMetrics({ ...metrics, x: overlay.position_x, y: overlay.position_y, scale: overlay.scale, rotation: overlay.rotation, mode: precision.current ? 'precision hold' : props.mode, lastRejectedMarkers:props.trackingDebug?debugSnapshot.current.lastFailure?.markers.map(({id,status,reason,residual})=>({id,status,reason,residual})):undefined, markerDecisions:props.trackingDebug?frameMarkerDecisions(debugSnapshot.current.markers,debugSnapshot.current.acceptedIds,debugSnapshot.current.reason).map(({id,status,reason,residual})=>({id,status,reason,residual})):undefined });
    }, [props.debug, metrics, overlay]);
    const publishRef = useRef<(p: Placement, at: number) => void>(() => { });
    publishRef.current = (p, at) => { artwork.current = p; if(live.current)lastReliable.current={...p};setOverlay(p); latest.current.onPlacement(validPlacement(p) ? p : null, at, tracking.validUntil); };
    function viewport(p: Pose) { const box = view.current!.getBoundingClientRect(); return videoViewport(box.width, box.height, p.width, p.height,'contain',zoomRef.current); }
    function worldPoints(p: Pose) { const vp = viewport(p); return [...pointers.current.values()].slice(0, 2).map(q => project(p.h, viewToImage(q, vp))); }
    function rebase() {
        const p = poseRef.current;
        if (p && live.current&&tracking.read(performance.now()).phase==='locked')
            gesture.current = { placement: { ...artwork.current }, points: worldPoints(p) };
        else if(tracking.read(performance.now()).phase==='lost')gesture.current=null;
        else needsRebase.current=true;
    }
    useEffect(() => {
        if (previousReset.current !== props.aimReset) {
            anchored.current = false;
            gesture.current = null;
            pointers.current.clear();
            previousReset.current = props.aimReset;
        }
    }, [props.aimReset]);
    useEffect(() => {
        let terminalError: string | null = null;
        let stopped = false, stream: MediaStream | undefined, worker: Worker | undefined, timer: ReturnType<typeof setTimeout>, watchdog: ReturnType<typeof setInterval>, last = performance.now();
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        let badgeTimer:ReturnType<typeof setTimeout>|undefined,badgeHeld=false;
        // Cosmetic debounce only: grace/frozen placement take effect immediately.
        const report = (text:string,kind:string)=>{
            if(kind==='holding'){if(!badgeHeld){badgeHeld=true;badgeTimer=setTimeout(()=>{setStatus(text);setPhase(kind);latest.current.onStatus(text);},120);}return;}
            clearTimeout(badgeTimer);badgeHeld=false;setStatus(text);setPhase(kind);latest.current.onStatus(text);
        };
        let lastRejection='',lastFrame:Record<string,unknown>={},reportedPhase='lost';
        let lastValidAt:number|null=null,rejectionDetail='';
        const gate=new FrameGate();let videoCallback:number|undefined;let consecutiveFailures=0;
        const recent: {id:number;detected:number;accepted:number;outcome:string}[]=[];
        let lastObserved: {at:number;markers:{id:number;corners:Point[]}[];error:number}|null=null;
        function diagnostics(){const state=tracking.read(performance.now());if(latest.current.trackingDebug){debugSnapshot.current={...debugSnapshot.current,phase:state.phase,reason:tracking.reason,detail:rejectionDetail,acquisition:String(lastFrame.acquisition||'waiting for camera'),lastValidAt,lastValidIds:poseRef.current?.ids||[],acceptedIds:state.phase==='locked'?(poseRef.current?.ids||[]):[]};}setMetrics({...lastFrame,state:state.phase,rejection:tracking.reason,lastRejection,stampable:state.stampable&&validPlacement(artwork.current),placementValid:validPlacement(artwork.current),consecutiveFailures,recentDetectionHistory:recent,lastObserved});}
        const invalidate = (text: string,reason='temporary-dropout',immediate=false) => {
            const state=tracking.reject(reason,performance.now(),immediate);
            lastRejection=text+' ('+reason+')';rejectionDetail=text;
            if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,lastFailure:{at:performance.now(),reason:lastRejection,markers:frameMarkerDecisions(debugSnapshot.current.markers,[],reason)}};
            live.current=false;
            if(state.phase==='holding'){
                needsRebase.current=true;
                const frozen=frozenPlacement();
                if(frozen)publishRef.current(frozen,poseRef.current!.at);
                setPose(poseRef.current);report('HELD · last reliable position', 'holding');
            }else{
                cancelPrecision();latest.current.onPlacement(null);pointers.current.clear();gesture.current=null;phoneGesture.current=null;needsRebase.current=false;
                setPose(null);report(lastReliable.current?'LOST · '+text:text,'lost');
            }
            if(immediate)debugSnapshot.current={...debugSnapshot.current,draw:false,markers:[]};
            reportedPhase=state.phase;diagnostics();
        };
        const resized = () => {
            if (terminalError) {
                report(terminalError, 'lost');
                return;
            }
            epoch.current++;
            const r = view.current?.getBoundingClientRect();
            if (r)
                setSize({ width: r.width, height: r.height });
            invalidate('Finding markers…','view-changed');
        };
        const observer = new ResizeObserver(resized);
        if (view.current)
            observer.observe(view.current);
        const visibility = () => { epoch.current++; invalidate('Finding markers…','visibility-changed',true); };
        document.addEventListener('visibilitychange', visibility);
        async function start() {
            try {
                if (!window.isSecureContext)
                    throw Error('Camera needs HTTPS.');
                if (!navigator.mediaDevices?.getUserMedia)
                    throw Error('Open this controller in Safari or Chrome to use the camera.');
                if (!ctx)
                    throw Error('Camera image processing is unavailable.');
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
                if (stopped) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                const v = video.current!;
                v.srcObject = stream;
                await v.play();
                if (stopped)
                    return;
                worker = new Worker(new URL('./tracker.worker.ts', import.meta.url), { type: 'module' });
                const frameCallbacks=typeof v.requestVideoFrameCallback==='function';
                let pendingPose:Pose|null=null,workerCapture=false;
                const schedule=()=>{timer=setTimeout(()=>{if(stopped)return;if(frameCallbacks)videoCallback=v.requestVideoFrameCallback((_,meta)=>frame(meta));else frame();},frameCallbacks?0:FRAME_PAUSE);};
                const frame = async (meta?:VideoFrameCallbackMetadata) => {
                    if (stopped)
                        return;
                    if (document.visibilityState !== 'visible' || v.readyState < 2) {
                        lastFrame={...lastFrame,acquisition:'unavailable: camera not ready or hidden'};
                        invalidate('Waiting for camera frame','camera-not-ready',document.visibilityState!=='visible');
                        timer = setTimeout(frame, 150);
                        return;
                    }
                    if(!v.videoWidth||!v.videoHeight){lastFrame={...lastFrame,acquisition:'unavailable: camera dimensions'};schedule();return;}
                    // Legacy browsers cannot move canvas readback into a worker.
                    // Yield that blocking fallback while fingers are manipulating artwork.
                    if(!workerCapture&&latest.current.mode==='camera-stamp'&&centredGesture.active){
                        if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,acquisition:'deferred: touch interaction (main-thread fallback)'};
                        timer=setTimeout(frame,FRAME_PAUSE);return;
                    }
                    const id=gate.begin(meta?.mediaTime??v.currentTime);
                    if(id===null){lastFrame={...lastFrame,acquisition:'skipped: duplicate or busy'};diagnostics();schedule();return;}
                    // Timestamp before pixel readback, using the presented-frame clock
                    // when available. Worker timings are durations, never cross-context clocks.
                    const captureStarted=performance.now(),at=meta?Math.min(captureStarted,meta.presentationTime):captureStarted;
                    const frameEpoch=epoch.current,captureWidth=v.videoWidth,captureHeight=v.videoHeight;
                    try{
                        const dimensions=processingFrame(captureWidth,captureHeight);
                        if(workerCapture){
                            const bitmap=await createImageBitmap(v).catch(error=>{workerCapture=false;throw error;});
                            if(stopped){bitmap.close();return;}
                            if(bitmap.width!==captureWidth||bitmap.height!==captureHeight){bitmap.close();throw Error('Camera orientation changed during capture');}
                            const bitmapMs=performance.now()-captureStarted;
                            try{worker!.postMessage({bitmap,...dimensions,at,epoch:frameEpoch,id,captureMs:bitmapMs,bitmapMs,resizeMs:0,drawMs:0,pixelsMs:0,captureWidth,captureHeight,capturePath:'worker canvas',trackingDebug:latest.current.trackingDebug,aim:latest.current.mode==='legacy'?{x:dimensions.width*(.5+latest.current.calibration.x),y:dimensions.height*(.5+latest.current.calibration.y)}:undefined},[bitmap]);}catch(error){bitmap.close();workerCapture=false;throw error;}
                        }else{
                        if(canvas.width!==dimensions.width||canvas.height!==dimensions.height){canvas.width=dimensions.width;canvas.height=dimensions.height;}
                        const resizedAt=performance.now(),resizeMs=resizedAt-captureStarted;
                        // Five-argument drawImage resizes the ENTIRE source, never the CSS 2× crop.
                        ctx.drawImage(v,0,0,canvas.width,canvas.height);
                        const drawnAt=performance.now(),drawMs=drawnAt-resizedAt;
                        const data=ctx.getImageData(0,0,canvas.width,canvas.height);
                        const readAt=performance.now(),pixelsMs=readAt-drawnAt,captureMs=readAt-captureStarted;
                        worker!.postMessage({buffer:data.data.buffer,width:canvas.width,height:canvas.height,at,epoch:frameEpoch,id,captureMs,resizeMs,drawMs,pixelsMs,captureWidth,captureHeight,capturePath:'main-thread fallback',trackingDebug:latest.current.trackingDebug,aim:latest.current.mode==='legacy'?{x:canvas.width*(.5+latest.current.calibration.x),y:canvas.height*(.5+latest.current.calibration.y)}:undefined},[data.data.buffer]);
                        }
                        lastFrame={...lastFrame,acquisition:'processing frame '+id};if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,acquisition:'processing frame '+id};
                    }catch(e){gate.cancel();lastFrame={...lastFrame,acquisition:'unavailable: pixel readback'};invalidate(e instanceof Error?e.message:'Camera readback failed','capture-failure');schedule();}
                };
                worker.onerror = () => { terminalError = 'Camera tracking failed · use Options to retry or place manually'; invalidate(terminalError,'worker-error',true); };
                worker.onmessage = ({ data }) => {
                    if (stopped)
                        return;
                    if(data.type==='ready'){workerCapture=!!data.bitmapCapture&&typeof createImageBitmap==='function';schedule();return;}
                    if(data.captureFallback)workerCapture=false;
                    if(!gate.finish(data.id))return; // Ignore unsolicited/late replies; never queue concurrent detection.
                    const now = performance.now(), fps = 1000 / (now - last);
                    last = now;
                    const found = data.found || [], detected = markers.filter(m => found.some((f: {
                        id: number;
                    }) => f.id === m.id)).length;
                    const tagEdges=found.filter((f:{id:number;corners:Point[]})=>markers.some(m=>m.id===f.id)&&f.corners?.length===4).flatMap((f:{corners:Point[]})=>f.corners.map((p:Point,i:number)=>Math.hypot(p.x-f.corners[(i+1)%4].x,p.y-f.corners[(i+1)%4].y)));
                    const smallestTag=tagEdges.length?Math.min(...tagEdges):0;
                    lastFrame={smallestTagPixels:Math.round(smallestTag),resolution:data.captureWidth+' × '+data.captureHeight,processingResolution:data.width+' × '+data.height,frameId:data.id,frameOutcome:data.error?(data.reason==='capture-failure'?'capture failure':'detector failure'):'processed',acquisition:'awaiting next frame',captureMs:data.captureMs,capturePath:data.capturePath,bitmapMs:data.bitmapMs,resizeMs:data.resizeMs,drawMs:data.drawMs,pixelsMs:data.pixelsMs,detectorMs:data.detectorMs,fitMs:data.fitMs,workerMs:data.workerMs,deliveryMs:Math.max(0,now-data.at-(data.workerMs||0)-(data.captureMs||0)),processingMs:Math.round(now-data.at),fps:Math.round(fps),detected:found.length,matched:detected,usable:data.usable||0,inliers:data.fit?.count||0,accepted:0,reprojectionError:data.fit?.error??null,tolerance:data.fit?.tolerance??null,confidence:data.fit?.confidence??null};
                    if(latest.current.trackingDebug){debugSnapshot.current={...debugSnapshot.current,markers:data.trace?.markers||[],detected:found.length,acceptedIds:[],error:data.fit?.error??null,check:data.trace?.check||'',width:data.width||0,height:data.height||0,capture:data.captureWidth+' × '+data.captureHeight,frameId:data.id,outcome:data.error?(data.reason==='capture-failure'?'CAPTURE FAILURE':'DETECTOR FAILURE'):'PROCESSED',detectorMs:data.detectorMs??null,fitMs:data.fitMs??null,workerMs:data.workerMs??null,captureMs:data.captureMs??null,capturePath:data.capturePath,bitmapMs:data.bitmapMs??null,resizeMs:data.resizeMs??null,drawMs:data.drawMs??null,pixelsMs:data.pixelsMs??null,deliveryMs:Math.max(0,now-data.at-(data.workerMs||0)-(data.captureMs||0)),consecutiveFailures,at:data.at??null,draw:data.epoch===epoch.current&&Math.abs(data.width/data.height-v.videoWidth/v.videoHeight)<.01};}
                    let rejectReason='poor-homography';
                    try {
                        if(data.error){rejectReason=data.reason||'detector-failure';throw Error(data.error);}
                        if(data.epoch!==epoch.current||Math.abs(data.width/data.height-v.videoWidth/v.videoHeight)>.01||document.visibilityState!=='visible'){rejectReason='view-changed';throw Error('Waiting for the current camera view');}
                        if(now-data.at>MAX_TRACKING_AGE){rejectReason='stale-frame';throw Error('Camera processing is too slow');}
                        if(!data.fit){rejectReason=data.reason||'poor-homography';throw Error(data.rejection||'Show at least 3 markers');}
                        const fit=data.fit,raw:Pose={...fit,at:data.at,width:data.width,height:data.height},previous=poseRef.current;
                        // Compare only tags seen by BOTH fits, never unobserved full-board corners.
                        const shared=previous?markers.filter(m=>raw.ids.includes(m.id)&&previous.ids.includes(m.id)).flatMap(markerCorners):[];
                        if(previous&&raw.at-previous.at<700&&trackingMotion(raw,previous,shared)>.18&&(!pendingPose||trackingMotion(raw,pendingPose,shared)>.04)){
                            pendingPose=raw;rejectReason='motion-confirmation';throw Error('Confirming camera movement');
                        }
                        pendingPose=null;
                        const centre={x:raw.width/2,y:raw.height/2},r=Math.min(raw.width,raw.height)*.1;
                        const local=[{x:centre.x-r,y:centre.y-r},{x:centre.x+r,y:centre.y-r},{x:centre.x+r,y:centre.y+r},{x:centre.x-r,y:centre.y+r}].map(q=>project(raw.h,q));
                        const p=smoothTracking(raw,previous,local);

                        poseRef.current=p;live.current=true;tracking.accept(p.at,now);consecutiveFailures=0;lastObserved={at:p.at,markers:found.filter((m:{id:number})=>fit.ids.includes(m.id)),error:fit.error};lastFrame.accepted=fit.count;lastValidAt=now;rejectionDetail='';
                        if(needsRebase.current){rebase();phoneGesture.current={base:{...phoneControls.current},points:[...pointers.current.values()]};needsRebase.current=false;}
                        let next=artwork.current;
                        if(latest.current.mode==='camera-stamp'||precision.current)next=updatePhone(p);
                        else if(!anchored.current){const q=project(p.h,{x:p.width*(.5+latest.current.calibration.x),y:p.height*(.5+latest.current.calibration.y)});next={...next,position_x:q.x/W,position_y:q.y/H};anchored.current=true;}
                        else if(gesture.current&&pointers.current.size)next=manipulate(gesture.current,worldPoints(p));
                        publishRef.current(next,p.at);setPose(p);
                        report(validPlacement(next)?'Tracking · '+fit.count+'/8':'Sticker outside wallpaper',validPlacement(next)?'locked':'outside');
                        reportedPhase='locked';diagnostics();
                    }catch(e){
                        consecutiveFailures++;
                        lastFrame.frameOutcome=data.error?(data.reason==='capture-failure'?'capture failure':'detector failure'):'rejected: '+rejectReason;
                        if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,outcome:data.error?(data.reason==='capture-failure'?'CAPTURE FAILURE':'DETECTOR FAILURE'):'REJECTED: '+rejectReason};
                        invalidate(e instanceof Error?e.message:'Hold still to track',rejectReason);
                    }
                    recent.push({id:data.id,detected:found.length,accepted:Number(lastFrame.accepted),outcome:String(lastFrame.frameOutcome)});if(recent.length>8)recent.shift();
                    if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,consecutiveFailures};
                    schedule();
                };
                watchdog = setInterval(()=>{
                    const state=tracking.read(performance.now());
                    if(live.current&&state.phase!=='locked')invalidate('Waiting for a fresh tracking result','stale-frame');
                    else if(!live.current&&state.phase!==reportedPhase)invalidate('Tracking lost · show 3 markers',tracking.reason||'tracking-timeout');
                },40);
                // The worker capability reply starts the single-flight loop.
            }
            catch (e) {
                if (!stopped) {
                    live.current = false;
                    latest.current.onPlacement(null);
                    terminalError = e instanceof Error ? e.message : String(e);
                    invalidate(terminalError,'camera-error',true);
                }
            }
        }
        void start();
        return () => { stopped = true; observer.disconnect(); document.removeEventListener('visibilitychange', visibility); clearTimeout(timer); clearTimeout(badgeTimer); clearInterval(watchdog); gate.cancel();if(videoCallback!==undefined)video.current?.cancelVideoFrameCallback?.(videoCallback);worker?.terminate(); stream?.getTracks().forEach(t => t.stop()); live.current = false; latest.current.onPlacement(null); };
    }, []);
    function toggleDisplayZoom() {
        // Freeze the current wallpaper transform, never scale the stamp itself.
        // Both the display and inverse touch mapping use the same centred crop.
        cancelPrecision();
        if(poseRef.current) anchored.current=true;
        pointers.current.clear();gesture.current=null;
        const oldZoom=zoomRef.current;zoomRef.current=oldZoom===1?2:1;
        phoneControls.current={...phoneControls.current,size:phoneControls.current.size*zoomRef.current/oldZoom};
        setDisplayZoom(zoomRef.current);
    }
    function location(e: PointerEvent<HTMLDivElement>): Point { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function down(e: PointerEvent<HTMLDivElement>) {
        const p = poseRef.current;
        if(props.mode==='camera-stamp'){
            if(props.disabled||precision.current)return;
            if(centredGesture.begin(e.pointerId,{x:e.clientX,y:e.clientY},phoneControls.current)){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}
            return;
        }
        if (props.disabled || precision.current || !p || !tracking.read(performance.now()).stampable || !onVideo(location(e), viewport(p)) || pointers.current.size >= 2)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        anchored.current = true;
        pointers.current.set(e.pointerId, location(e));
        rebase();
        phoneGesture.current={base:{...phoneControls.current},points:[...pointers.current.values()]};
    }
    function move(e: PointerEvent<HTMLDivElement>) {
        if(props.mode==='camera-stamp'){
            if(props.disabled||!centredGesture.has(e.pointerId))return;
            e.preventDefault();
            const next=centredGesture.move(e.pointerId,{x:e.clientX,y:e.clientY});
            if(next){phoneControls.current=next;paintArtwork();}
            return;
        }
        if (props.disabled || !pointers.current.has(e.pointerId))
            return;
        e.preventDefault();
        pointers.current.set(e.pointerId, location(e));
        const p = poseRef.current;
        if (!p || precision.current)return;
        if(!live.current||tracking.read(performance.now()).phase!=='locked'){needsRebase.current=true;return;}
        if(!gesture.current)return;
        publishRef.current(manipulate(gesture.current, worldPoints(p)), p.at);
    }
    function up(e: PointerEvent<HTMLDivElement>) { if(props.mode==='camera-stamp'){const active=centredGesture.has(e.pointerId);centredGesture.end(e.pointerId);if(active&&!centredGesture.active){const current=sample();if(current)publishRef.current(current.placement,current.at);}return;} pointers.current.delete(e.pointerId); rebase();phoneGesture.current={base:{...phoneControls.current},points:[...pointers.current.values()]}; }
    let transform = '';
    if (props.mode==='legacy' && pose && view.current) {
        const vp = videoViewport(size.width || view.current.clientWidth, size.height || view.current.clientHeight, pose.width, pose.height, 'contain', displayZoom);
        const corners = stickerCorners({ ...overlay, ...stampAsset(props.placement) }).map(p => imageToView(project(pose.inverse, p), vp));
        try {
            const m = homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], corners);
            transform = 'matrix3d(' + [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, 1].join(',') + ')';
        }
        catch { /* Hide an invalid projection. */ }

    }
    return <>
    <div ref={view} className="camera-view" aria-label="Camera sticker placement" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <video ref={video} onLoadedMetadata={artworkLayout} onResize={artworkLayout} muted playsInline aria-label="Rear camera" style={{transform: 'scale('+displayZoom+')',transformOrigin:'50% 50%'}}/>
      <img ref={sticker} className="camera-stamp" src={stampSource(props.placement)} alt="Selected sticker" style={props.mode==='camera-stamp'?{left:'50%',top:'50%',transformOrigin:'50% 50%',display:'block',opacity:.85}:{width:'100px',height:'100px',left:0,top:0,transformOrigin:'0 0',transform,display:transform?'block':'none',opacity:.85}}/>
      {props.mode==='camera-stamp'&&<span className="crosshair" style={{left:'50%',top:'50%'}}>+</span>}
      {props.trackingDebug&&<TrackingDebug snapshot={video.current?.videoWidth&&debugView.width&&Math.abs(debugView.width/debugView.height-video.current.videoWidth/video.current.videoHeight)>.01?{...debugView,draw:false}:debugView} now={debugNow} width={size.width} height={size.height} zoom={displayZoom}/>}
    </div>
    <button className="display-zoom" aria-label="Display zoom" aria-pressed={displayZoom===2} title="Relative display zoom; tracking uses the full frame" disabled={props.disabled} onClick={toggleDisplayZoom}>{displayZoom}×</button>
    <p className={'tracking-status ' + phase} role="status">{status}</p>

  </>;
});
