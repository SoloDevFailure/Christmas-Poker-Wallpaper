import { forwardRef, useImperativeHandle, useEffect, useRef, useState, type PointerEvent } from 'react';
import { fitMarkers, homography, markers, project, W, H, type Point } from './geometry';
import { MAX_TRACKING_AGE, DROPOUT_HOLD, trackingPhase, videoViewport, viewToImage, imageToView, onVideo, manipulate, stickerCorners, type Gesture } from './manipulation';
import { validPlacement, stampAsset, type Placement } from './types';
import { stampSource } from './art';
import { phoneFixedPlacement,screenStampFromWorld,resizePhoneStamp,smoothTracking,trackingMotion,phoneReference,type CameraHandle,type ScreenStamp } from './cameraPlacement';
type Pose = {
    h: number[];
    inverse: number[];
    at: number;
    width: number;
    height: number;
    count: number;
    error: number;
};
type Props = {
    placement: Placement;
    onPlacement: (p: Placement | null, at?: number) => void;
    onStatus: (s: string) => void;
    debug: boolean;
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
    const [status, setStatus] = useState('Opening camera…'), [phase, setPhase] = useState('lost'), [metrics, setMetrics] = useState({ resolution: '', fps: 0, detected: 0, used: 0, error: 0 });
    const [displayZoom,setDisplayZoom]=useState<1|2>(1);
    const zoomRef=useRef<1|2>(1);
    const phoneControls=useRef({size:.28,rotation:0}),phoneGesture=useRef<{base:{size:number;rotation:number};points:Point[]}|null>(null),precision=useRef<ScreenStamp|null>(null);
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
            latest.current.onMetrics({ ...metrics, x: overlay.position_x, y: overlay.position_y, scale: overlay.scale, rotation: overlay.rotation, mode: precision.current ? 'precision hold' : props.mode });
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
        const invalidate = (text: string) => {
            live.current = false;
            cancelPrecision();
            latest.current.onPlacement(null);
            pointers.current.clear();
            gesture.current = null;
            const previous = poseRef.current;
            if (previous && trackingPhase(previous.at, performance.now(), false) === 'holding') {
                setPose(previous);
                report('Hold still · reacquiring', 'holding');
            }
            else {
                setPose(null);
                report(text, 'lost');
            }
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
            invalidate('Finding markers…');
        };
        const observer = new ResizeObserver(resized);
        if (view.current)
            observer.observe(view.current);
        const visibility = () => { epoch.current++; invalidate('Finding markers…'); };
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
                let processingWidth=1280,lastResolutionChange=0,pendingPose:Pose|null=null;
                const frame = () => {
                    if (stopped)
                        return;
                    if (document.visibilityState !== 'visible' || v.readyState < 2) {
                        invalidate('Finding markers…');
                        timer = setTimeout(frame, 150);
                        return;
                    }
                    canvas.width = Math.min(v.videoWidth, processingWidth);
                    canvas.height = Math.round(canvas.width * v.videoHeight / v.videoWidth);
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    worker!.postMessage({ buffer: data.data.buffer, width: canvas.width, height: canvas.height, at: performance.now(), epoch: epoch.current }, [data.data.buffer]);
                };
                worker.onerror = () => { terminalError = 'Camera tracking failed · use Settings to retry or place manually'; invalidate(terminalError); };
                worker.onmessage = ({ data }) => {
                    if (stopped)
                        return;
                    const now = performance.now(), fps = 1000 / (now - last);
                    last = now;
                    if(processingWidth>1280&&now-data.at>275){processingWidth=1280;lastResolutionChange=now+8000;}
                    const found = data.found || [], detected = markers.filter(m => found.some((f: {
                        id: number;
                    }) => f.id === m.id)).length;
                    try {
                        if (data.error)
                            throw Error(data.error);
                        const width = Math.min(v.videoWidth, 1280), height = Math.round(width * v.videoHeight / v.videoWidth);
                        if (data.epoch !== epoch.current || Math.abs(data.width/data.height-width/height)>.01 || now - data.at > MAX_TRACKING_AGE || document.visibilityState !== 'visible')
                            throw Error('Waiting for a fresh camera view');
                        const fit = fitMarkers(found),raw:Pose={...fit,at:data.at,width:data.width,height:data.height},previous=poseRef.current;
                        if(previous&&raw.at-previous.at<700&&trackingMotion(raw,previous)>.18&&(!pendingPose||trackingMotion(raw,pendingPose)>.04)){pendingPose=raw;throw Error('Hold still · checking movement');}
                        pendingPose=null;
                        const p=smoothTracking(raw,previous);
                        if(now-lastResolutionChange>2000&&processingWidth<1920&&fit.count<5){processingWidth=1920;lastResolutionChange=now;}
                        poseRef.current = p;
                        live.current = true;
                        let next = artwork.current;
                        if (latest.current.mode==='camera-stamp'||precision.current) next=updatePhone(p);
                        else if (!anchored.current) {
                            const centre = project(p.h, { x: p.width * (.5 + latest.current.calibration.x), y: p.height * (.5 + latest.current.calibration.y) });
                            next = { ...next, position_x: centre.x / W, position_y: centre.y / H };
                            anchored.current=true;
                        }
                        else if (gesture.current && pointers.current.size)
                            next = manipulate(gesture.current, worldPoints(p));
                        publishRef.current(next, p.at);
                        setPose(p);
                        report(validPlacement(next) ? ('Tracking · ' + fit.count + '/8' + (fit.confidence === 'high' ? ' · strong' : '')) : 'Sticker outside wallpaper', validPlacement(next) ? 'locked' : 'outside');
                        setMetrics({ resolution: v.videoWidth + ' × ' + v.videoHeight, fps, detected, used: fit.count, error: fit.error });
                    }
                    catch (e) {
                        if(now-lastResolutionChange>2000&&processingWidth<1920){processingWidth=1920;lastResolutionChange=now;}
                        invalidate(detected < 3 ? 'Show at least 3 markers' : (e instanceof Error ? e.message : 'Hold still to track'));
                        setMetrics({ resolution: v.videoWidth + ' × ' + v.videoHeight, fps, detected, used: 0, error: 0 });
                    }
                    timer = setTimeout(frame, 60);
                };
                watchdog = setInterval(() => {
                    const previous = poseRef.current;
                    if (previous && performance.now() - previous.at > MAX_TRACKING_AGE)
                        invalidate('Tracking lost · show 3 markers');
                    else if (!live.current && previous && performance.now() - previous.at > DROPOUT_HOLD) {
                        setPose(null);
                        report('Tracking lost · show 3 markers', 'lost');
                    }
                }, 60);
                frame();
            }
            catch (e) {
                if (!stopped) {
                    live.current = false;
                    latest.current.onPlacement(null);
                    terminalError = e instanceof Error ? e.message : String(e);
                    report(terminalError, 'lost');
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
    </div>
    <button className="display-zoom" aria-label="Display zoom" aria-pressed={displayZoom===2} title="Relative display zoom; tracking uses the full frame" disabled={props.disabled} onClick={toggleDisplayZoom}>{displayZoom}×</button>
    <p className={'tracking-status ' + phase} role="status">{status}</p>

  </>;
});
