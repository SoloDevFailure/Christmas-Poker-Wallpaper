import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { fitMarkers, homography, markers, project, W, H, type Point } from './geometry';
import { MAX_TRACKING_AGE, DROPOUT_HOLD, trackingPhase, videoViewport, viewToImage, imageToView, onVideo, manipulate, stickerCorners, type Gesture } from './manipulation';
import { validPlacement, stampAsset, type Placement } from './types';
import { stampSource } from './art';
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
    initiallyAnchored: boolean;
    disabled: boolean;
};
export default function Camera(props: Props) {
    const video = useRef<HTMLVideoElement>(null), view = useRef<HTMLDivElement>(null), latest = useRef(props);
    latest.current = props;
    const artwork = useRef(props.placement), anchored = useRef(props.initiallyAnchored), poseRef = useRef<Pose | null>(null), live = useRef(false), epoch = useRef(0);
    artwork.current = { ...artwork.current, ...stampAsset(props.placement) };
    const pointers = useRef(new Map<number, Point>()), gesture = useRef<Gesture | null>(null);
    const [pose, setPose] = useState<Pose | null>(null), [overlay, setOverlay] = useState(props.placement), [size, setSize] = useState({ width: 0, height: 0 });
    const [status, setStatus] = useState('Opening camera…'), [phase, setPhase] = useState('lost'), [metrics, setMetrics] = useState({ resolution: '', fps: 0, detected: 0, used: 0, error: 0 });
    const [displayZoom,setDisplayZoom]=useState<1|2>(1);
    const zoomRef=useRef<1|2>(1);
    const previousReset = useRef(props.aimReset);
    useEffect(() => {
        if (props.debug)
            latest.current.onMetrics({ ...metrics, x: overlay.position_x, y: overlay.position_y, scale: overlay.scale, rotation: overlay.rotation, mode: anchored.current ? 'wallpaper anchored' : 'camera aim' });
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
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
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
                const frame = () => {
                    if (stopped)
                        return;
                    if (document.visibilityState !== 'visible' || v.readyState < 2) {
                        invalidate('Finding markers…');
                        timer = setTimeout(frame, 150);
                        return;
                    }
                    canvas.width = Math.min(v.videoWidth, 1280);
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
                    const found = data.found || [], detected = markers.filter(m => found.some((f: {
                        id: number;
                    }) => f.id === m.id)).length;
                    try {
                        if (data.error)
                            throw Error(data.error);
                        const width = Math.min(v.videoWidth, 1280), height = Math.round(width * v.videoHeight / v.videoWidth);
                        if (data.epoch !== epoch.current || data.width !== width || data.height !== height || now - data.at > MAX_TRACKING_AGE || document.visibilityState !== 'visible')
                            throw Error('Waiting for a fresh camera view');
                        const fit = fitMarkers(found), p: Pose = { ...fit, at: data.at, width: data.width, height: data.height };
                        poseRef.current = p;
                        live.current = true;
                        let next = artwork.current;
                        if (!anchored.current) {
                            const centre = project(p.h, { x: p.width * (.5 + latest.current.calibration.x), y: p.height * (.5 + latest.current.calibration.y) });
                            next = { ...next, position_x: centre.x / W, position_y: centre.y / H };
                        }
                        else if (gesture.current && pointers.current.size)
                            next = manipulate(gesture.current, worldPoints(p));
                        publishRef.current(next, p.at);
                        setPose(p);
                        report(validPlacement(next) ? ('Tracking · ' + fit.count + '/4' + (fit.confidence === 'high' ? ' · strong' : '')) : 'Sticker outside wallpaper', validPlacement(next) ? 'locked' : 'outside');
                        setMetrics({ resolution: v.videoWidth + ' × ' + v.videoHeight, fps, detected, used: fit.count, error: fit.error });
                    }
                    catch (e) {
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
        if(poseRef.current) anchored.current=true;
        pointers.current.clear();gesture.current=null;
        zoomRef.current=zoomRef.current===1?2:1;
        setDisplayZoom(zoomRef.current);
    }
    function location(e: PointerEvent<HTMLDivElement>): Point { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function down(e: PointerEvent<HTMLDivElement>) {
        const p = poseRef.current;
        if (props.disabled || !p || !live.current || performance.now() - p.at > MAX_TRACKING_AGE || !onVideo(location(e), viewport(p)) || pointers.current.size >= 2)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        anchored.current = true;
        pointers.current.set(e.pointerId, location(e));
        rebase();
    }
    function move(e: PointerEvent<HTMLDivElement>) {
        if (!pointers.current.has(e.pointerId))
            return;
        e.preventDefault();
        pointers.current.set(e.pointerId, location(e));
        const p = poseRef.current;
        if (!p || !live.current || !gesture.current)
            return;
        publishRef.current(manipulate(gesture.current, worldPoints(p)), p.at);
    }
    function up(e: PointerEvent<HTMLDivElement>) { pointers.current.delete(e.pointerId); rebase(); }
    let transform = '', crosshair: Point | null = null;
    if (pose && view.current) {
        const vp = videoViewport(size.width || view.current.clientWidth, size.height || view.current.clientHeight, pose.width, pose.height, 'contain', displayZoom);
        const corners = stickerCorners({ ...overlay, ...stampAsset(props.placement) }).map(p => imageToView(project(pose.inverse, p), vp));
        try {
            const m = homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], corners);
            transform = 'matrix3d(' + [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, 1].join(',') + ')';
        }
        catch { /* Hide an invalid projection. */ }
        if (!anchored.current)
            crosshair = imageToView({ x: pose.width * (.5 + props.calibration.x), y: pose.height * (.5 + props.calibration.y) }, vp);
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
}
