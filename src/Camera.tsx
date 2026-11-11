import { forwardRef, useImperativeHandle, useEffect, useRef, useState, type PointerEvent } from 'react';
import { markerCorners, homography, markers, project, W, H, type Point } from './geometry';
import { MAX_TRACKING_AGE, videoViewport, viewToImage, imageToView, onVideo, manipulate, stickerCorners, type Gesture } from './manipulation';
import { validPlacement, stampAsset, type Placement } from './types';
import { stampSource } from './art';
import TrackingDebug from './TrackingDebugger';
import {emptyDebug,frameMarkerDecisions,type DebugSnapshot} from './trackingDebug';
import {TrackingState,processingFrame,processingBudget,FRAME_PAUSE} from './trackingState';
import { phoneFixedPlacement,screenStampFromWorld,resizePhoneStamp,smoothTracking,trackingMotion,phoneReference,type CameraHandle,type ScreenStamp } from './cameraPlacement';
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
    onPlacement: (p: Placement | null, at?: number) => void;
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
    const video = useRef<HTMLVideoElement>(null), view = useRef<HTMLDivElement>(null), latest = useRef(props);
    latest.current = props;
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
    function cancelPrecision(){precision.current=null;latest.current.onPrecisionChange(false);}
    function sample(){const p=poseRef.current;return p&&live.current&&performance.now()-p.at<=MAX_TRACKING_AGE&&validPlacement(artwork.current)?{placement:{...artwork.current},at:p.at}:null;}
    useImperativeHandle(ref,()=>({sample,beginPrecision(){const p=poseRef.current;if(latest.current.mode!=='legacy'||!p||!sample())return false;precision.current=screenStampFromWorld(artwork.current,p.inverse,viewport(p));pointers.current.clear();gesture.current=null;latest.current.onPrecisionChange(true);return true;},endPrecision(){const result=precision.current?sample():null;cancelPrecision();return result;},cancelPrecision}));
    function phoneScreen(p:Pose):ScreenStamp {const v=viewport(p);return {centre:{x:v.width/2,y:v.height/2},size:phoneControls.current.size*phoneReference(v,zoomRef.current),rotation:phoneControls.current.rotation};}
    function updatePhone(p:Pose){return phoneFixedPlacement(artwork.current,p.h,viewport(p),precision.current||phoneScreen(p));}
    useEffect(()=>{cancelPrecision();pointers.current.clear();gesture.current=null;phoneGesture.current=null;anchored.current=true;const p=poseRef.current;if(p&&props.mode==='camera-stamp'){const s=screenStampFromWorld(artwork.current,p.inverse,viewport(p)),v=viewport(p);phoneControls.current={size:Math.max(.06,Math.min(.85,s.size/phoneReference(v,zoomRef.current))),rotation:s.rotation};}},[props.mode]);
    useEffect(()=>{if(props.disabled){cancelPrecision();pointers.current.clear();gesture.current=null;}},[props.disabled]);
    const previousReset = useRef(props.aimReset);
    useEffect(() => {
        if (props.debug)
            latest.current.onMetrics({ ...metrics, x: overlay.position_x, y: overlay.position_y, scale: overlay.scale, rotation: overlay.rotation, mode: precision.current ? 'precision hold' : props.mode, lastRejectedMarkers:props.trackingDebug?debugSnapshot.current.lastFailure?.markers.map(({id,status,reason,residual})=>({id,status,reason,residual})):undefined, markerDecisions:props.trackingDebug?frameMarkerDecisions(debugSnapshot.current.markers,debugSnapshot.current.acceptedIds,debugSnapshot.current.reason).map(({id,status,reason,residual})=>({id,status,reason,residual})):undefined });
    }, [props.debug, metrics, overlay]);
    const publishRef = useRef<(p: Placement, at: number) => void>(() => { });
    publishRef.current = (p, at) => { artwork.current = p; setOverlay(p); latest.current.onPlacement(validPlacement(p) ? p : null, at); };
    function viewport(p: Pose) { const box = view.current!.getBoundingClientRect(); return videoViewport(box.width, box.height, p.width, p.height,'contain',zoomRef.current); }
    function worldPoints(p: Pose) { const vp = viewport(p); return [...pointers.current.values()].slice(0, 2).map(q => project(p.h, viewToImage(q, vp))); }
    function rebase() {
        const p = poseRef.current;
        if (p && live.current)
            gesture.current = { placement: { ...artwork.current }, points: worldPoints(p) };
        else
            gesture.current = null;
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
        const report = (text: string, kind: string) => { setStatus(text); setPhase(kind); latest.current.onStatus(text); };
        const tracking=new TrackingState();
        let lastRejection='',lastFrame:Record<string,unknown>={},reportedPhase='lost';
        let lastValidAt:number|null=null,rejectionDetail='';
        function diagnostics(){const state=tracking.read(performance.now());if(latest.current.trackingDebug){debugSnapshot.current={...debugSnapshot.current,phase:state.phase,reason:tracking.reason,detail:rejectionDetail,lastValidAt,acceptedIds:state.stampable?(poseRef.current?.ids||[]):[]};}setMetrics({...lastFrame,state:state.phase,rejection:tracking.reason,lastRejection,stampable:state.stampable&&validPlacement(artwork.current),placementValid:validPlacement(artwork.current)});}
        const invalidate = (text: string,reason='temporary-dropout',immediate=false) => {
            const state=tracking.reject(reason,performance.now(),immediate);
            lastRejection=text+' ('+reason+')';rejectionDetail=text;
            if(latest.current.trackingDebug)debugSnapshot.current={...debugSnapshot.current,lastFailure:{at:performance.now(),reason:lastRejection,markers:frameMarkerDecisions(debugSnapshot.current.markers,[],reason)}};
            live.current=false;cancelPrecision();latest.current.onPlacement(null);
            if(immediate)debugSnapshot.current={...debugSnapshot.current,draw:false,markers:[]};
            pointers.current.clear();gesture.current=null;
            setPose(state.phase==='holding'?poseRef.current:null);
            report(state.phase==='holding'?'Tracking · recovering':text,state.phase);
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
            invalidate('Finding markers…','view-changed',true);
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
                let processingSize=1280,lastResolutionChange=0,pendingPose:Pose|null=null;
                const frame = () => {
                    if (stopped)
                        return;
                    if (document.visibilityState !== 'visible' || v.readyState < 2) {
                        invalidate('Finding markers…','camera-not-ready',true);
                        timer = setTimeout(frame, 150);
                        return;
                    }
                    const dimensions=processingFrame(v.videoWidth,v.videoHeight,processingSize);
                    canvas.width=dimensions.width;canvas.height=dimensions.height;
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    worker!.postMessage({ buffer: data.data.buffer, width: canvas.width, height: canvas.height, at: performance.now(), epoch: epoch.current,trackingDebug:latest.current.trackingDebug,aim:latest.current.mode==='legacy'?{x:canvas.width*(.5+latest.current.calibration.x),y:canvas.height*(.5+latest.current.calibration.y)}:undefined }, [data.data.buffer]);
                };
                worker.onerror = () => { terminalError = 'Camera tracking failed · use Options to retry or place manually'; invalidate(terminalError,'worker-error',true); };
                worker.onmessage = ({ data }) => {
                    if (stopped)
                        return;
                    const now = performance.now(), fps = 1000 / (now - last);
                    last = now;
                    const found = data.found || [], detected = markers.filter(m => found.some((f: {
                        id: number;
                    }) => f.id === m.id)).length;
                    const tagEdges=found.filter((f:{id:number;corners:Point[]})=>markers.some(m=>m.id===f.id)&&f.corners?.length===4).flatMap((f:{corners:Point[]})=>f.corners.map((p:Point,i:number)=>Math.hypot(p.x-f.corners[(i+1)%4].x,p.y-f.corners[(i+1)%4].y)));
                    const smallestTag=tagEdges.length?Math.min(...tagEdges):0;
                    const needDetail=detected<3||smallestTag>0&&smallestTag<24;
                    const nextBudget=processingBudget(processingSize,now-data.at,needDetail);
                    if(nextBudget!==processingSize&&(nextBudget<processingSize||now-lastResolutionChange>2000)){lastResolutionChange=now+(nextBudget<processingSize?8000:0);processingSize=nextBudget;}
                    lastFrame={smallestTagPixels:Math.round(smallestTag),resolution:v.videoWidth+' × '+v.videoHeight,processingResolution:data.width+' × '+data.height,processingMs:Math.round(now-data.at),fps:Math.round(fps),detected:found.length,matched:detected,usable:data.usable||0,inliers:data.fit?.count||0,accepted:0,reprojectionError:data.fit?.error??null,tolerance:data.fit?.tolerance??null,confidence:data.fit?.confidence??null};
                    if(latest.current.trackingDebug){debugSnapshot.current={...debugSnapshot.current,markers:data.trace?.markers||[],detected:found.length,acceptedIds:[],error:data.fit?.error??null,check:data.trace?.check||'',width:data.width||0,height:data.height||0,capture:v.videoWidth+' × '+v.videoHeight,at:data.at??null,draw:data.epoch===epoch.current&&Math.abs(data.width/data.height-v.videoWidth/v.videoHeight)<.01};}
                    let rejectReason='poor-homography';
                    try {
                        if(data.error){rejectReason='worker-error';throw Error(data.error);}
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

                        poseRef.current=p;live.current=true;tracking.accept(p.at,now);lastFrame.accepted=fit.count;lastValidAt=now;rejectionDetail='';
                        let next=artwork.current;
                        if(latest.current.mode==='camera-stamp'||precision.current)next=updatePhone(p);
                        else if(!anchored.current){const q=project(p.h,{x:p.width*(.5+latest.current.calibration.x),y:p.height*(.5+latest.current.calibration.y)});next={...next,position_x:q.x/W,position_y:q.y/H};anchored.current=true;}
                        else if(gesture.current&&pointers.current.size)next=manipulate(gesture.current,worldPoints(p));
                        publishRef.current(next,p.at);setPose(p);
                        report(validPlacement(next)?'Tracking · '+fit.count+'/8':'Sticker outside wallpaper',validPlacement(next)?'locked':'outside');
                        reportedPhase='locked';diagnostics();
                    }catch(e){
                        invalidate(e instanceof Error?e.message:'Hold still to track',rejectReason);
                    }
                    timer = setTimeout(frame, FRAME_PAUSE);
                };
                watchdog = setInterval(()=>{
                    const state=tracking.read(performance.now());
                    if(live.current&&!state.stampable){invalidate('Waiting for a fresh camera solution','stale-frame');}
                    else if(!live.current&&state.phase!==reportedPhase){setPose(state.phase==='holding'?poseRef.current:null);report(state.phase==='holding'?'Tracking · recovering':'Tracking lost · show 3 markers',state.phase);reportedPhase=state.phase;diagnostics();}
                },60);
                frame();
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
        return () => { stopped = true; observer.disconnect(); document.removeEventListener('visibilitychange', visibility); clearTimeout(timer); clearInterval(watchdog); worker?.terminate(); stream?.getTracks().forEach(t => t.stop()); live.current = false; latest.current.onPlacement(null); };
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
        if (props.disabled || precision.current || !p || !live.current || performance.now() - p.at > MAX_TRACKING_AGE || !onVideo(location(e), viewport(p)) || pointers.current.size >= 2)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        anchored.current = true;
        pointers.current.set(e.pointerId, location(e));
        rebase();
        phoneGesture.current={base:{...phoneControls.current},points:[...pointers.current.values()]};
    }
    function move(e: PointerEvent<HTMLDivElement>) {
        if (props.disabled || !pointers.current.has(e.pointerId))
            return;
        e.preventDefault();
        pointers.current.set(e.pointerId, location(e));
        const p = poseRef.current;
        if (!p || !live.current || precision.current || !gesture.current)
            return;
        if(props.mode==='camera-stamp'){const g=phoneGesture.current;if(g)phoneControls.current=resizePhoneStamp(g.base,g.points,[...pointers.current.values()]);publishRef.current(updatePhone(p),p.at);}
        else publishRef.current(manipulate(gesture.current, worldPoints(p)), p.at);
    }
    function up(e: PointerEvent<HTMLDivElement>) { pointers.current.delete(e.pointerId); rebase();phoneGesture.current={base:{...phoneControls.current},points:[...pointers.current.values()]}; }
    let transform = '', crosshair: Point | null = null;
    if (pose && view.current) {
        const vp = videoViewport(size.width || view.current.clientWidth, size.height || view.current.clientHeight, pose.width, pose.height, 'contain', displayZoom);
        const corners = stickerCorners({ ...overlay, ...stampAsset(props.placement) }).map(p => imageToView(project(pose.inverse, p), vp));
        try {
            const m = homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], corners);
            transform = 'matrix3d(' + [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, 1].join(',') + ')';
        }
        catch { /* Hide an invalid projection. */ }
        if (props.mode==='camera-stamp')
            crosshair = imageToView({ x: pose.width * .5, y: pose.height * .5 }, vp);
    }
    return <>
    <div ref={view} className="camera-view" aria-label="Camera sticker placement" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <video ref={video} muted playsInline aria-label="Rear camera" style={{transform: 'scale('+displayZoom+')',transformOrigin:'50% 50%'}}/>
      <img className="camera-stamp" src={stampSource(props.placement)} alt="Selected sticker" style={{ transform, display: transform ? 'block' : 'none', opacity: phase === 'holding' ? .35 : .85 }}/>
      {crosshair && <span className="crosshair" style={{ left: crosshair.x, top: crosshair.y }}>+</span>}
      {props.trackingDebug&&<TrackingDebug snapshot={debugView} now={debugNow} width={size.width} height={size.height} zoom={displayZoom}/>}
    </div>
    <button className="display-zoom" aria-label="Display zoom" aria-pressed={displayZoom===2} title="Relative display zoom; tracking uses the full frame" disabled={props.disabled} onClick={toggleDisplayZoom}>{displayZoom}×</button>
    <p className={'tracking-status ' + phase} role="status">{status}</p>

  </>;
});
