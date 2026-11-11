import { useEffect, useRef, useState } from 'react';
import { fitMarkers, homography, markers, project, W, H, type Point } from './geometry';
import type { Placement } from './types';
import { sources } from './art';
type Tracking = {
    h: number[];
    inverse: number[];
    error: number;
    at: number;
    width: number;
    height: number;
};
export default function Camera({ placement, onPlacement, onStatus, debug }: {
    placement: Placement;
    onPlacement: (p: Placement | null, at?: number) => void;
    onStatus: (s: string) => void;
    debug: boolean;
}) {
    const video = useRef<HTMLVideoElement>(null), view = useRef<HTMLDivElement>(null), current = useRef(placement), callback = useRef(onPlacement), status = useRef(onStatus);
    current.current = placement;
    callback.current = onPlacement;
    status.current = onStatus;
    const [tracking, setTracking] = useState<Tracking | null>(null), [stats, setStats] = useState({ width: 0, height: 0, count: 0, error: 0, fps: 0 }), [message, setMessage] = useState('Requesting rear camera…');
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const offsetRef = useRef(offset);
    offsetRef.current = offset;
    const pointers = useRef(new Map<number, Point>()), gesture = useRef<{
        distance: number;
        angle: number;
        scale: number;
        rotation: number;
    } | null>(null);
    const adjust = useRef<(scale: number, rotation: number) => void>(() => { });
    // Scale is logical wallpaper pixels. Rotation follows the camera's screen-space direction.
    const [rotation, setRotation] = useState(0), [size, setSize] = useState(placement.scale);
    const controls = useRef({ rotation, size });
    controls.current = { rotation, size };
    adjust.current = (s, r) => { setSize(Math.max(32, Math.min(600, s))); setRotation(((r + 180) % 360 + 360) % 360 - 180); };
    useEffect(() => {
        let stopped = false, stream: MediaStream | undefined, worker: Worker | undefined, timer: ReturnType<typeof setTimeout>, watchdog: ReturnType<typeof setInterval>, last = performance.now(), lastGood = 0;
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const report = (s: string) => { setMessage(s); status.current(s); };
        async function start() {
            try {
                if (!window.isSecureContext)
                    throw Error('Camera requires HTTPS (or localhost on this device).');
                if (!navigator.mediaDevices?.getUserMedia)
                    throw Error('Camera API unavailable. Open this page in Safari or Chrome.');
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
                const frame = () => { if (stopped)
                    return; if (document.visibilityState !== 'visible') {
                    callback.current(null);
                    setTracking(null);
                    timer = setTimeout(frame, 300);
                    return;
                } if (v.readyState < 2) {
                    timer = setTimeout(frame, 100);
                    return;
                } canvas.width = Math.min(v.videoWidth, 1280); canvas.height = Math.round(canvas.width * v.videoHeight / v.videoWidth); ctx.drawImage(v, 0, 0, canvas.width, canvas.height); const data = ctx.getImageData(0, 0, canvas.width, canvas.height); worker!.postMessage({ buffer: data.data.buffer, width: canvas.width, height: canvas.height, at: performance.now() }, [data.data.buffer]); };
                worker.onerror = () => { report('Tracking worker failed. Reload or use manual mode.'); callback.current(null); };
                worker.onmessage = ({ data }) => {
                    if (stopped)
                        return;
                    const now = performance.now(), fps = 1000 / (now - last);
                    last = now;
                    const found = data.found || [], count = markers.filter(m => found.some((f: {
                        id: number;
                    }) => f.id === m.id)).length;
                    try {
                        if (data.error)
                            throw Error(data.error);
                        if (now - data.at > 650 || document.visibilityState !== 'visible')
                            throw Error('Camera frame is stale · wait for fresh tracking');
                        const { h, inverse, error } = fitMarkers(found);
                        if (error > 5)
                            throw Error('Unstable perspective: hold still and face the screen');
                        const t = { h, inverse, error, at: now, width: canvas.width, height: canvas.height };
                        const centre = { x: canvas.width * (.5 + offsetRef.current.x), y: canvas.height * (.5 + offsetRef.current.y) }, p = project(h, centre), angle = controls.current.rotation * Math.PI / 180, q = project(h, { x: centre.x + Math.cos(angle) * 20, y: centre.y + Math.sin(angle) * 20 });
                        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > W || p.y < 0 || p.y > H)
                            throw Error('Crosshair is outside the wallpaper');
                        const placement = { ...current.current, position_x: p.x / W, position_y: p.y / H, scale: controls.current.size, rotation: Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI };
                        lastGood = data.at;
                        setTracking(t);
                        callback.current(placement, data.at);
                        report('Tracking locked · 4/4 markers');
                        setStats({ width: v.videoWidth, height: v.videoHeight, count, error, fps });
                    }
                    catch (e) {
                        lastGood = 0;
                        setTracking(null);
                        callback.current(null);
                        report(count < 4 ? `Tracking lost · ${count}/4 markers visible` : String(e));
                        setStats({ width: v.videoWidth, height: v.videoHeight, count, error: 0, fps });
                    }
                    timer = setTimeout(frame, 80);
                };
                watchdog = setInterval(() => { if (performance.now() - lastGood > 650) {
                    callback.current(null);
                    setTracking(null);
                } }, 100);
                frame();
            }
            catch (e) {
                if (!stopped) {
                    report(e instanceof Error ? e.message : String(e));
                    callback.current(null);
                }
            }
        }
        void start();
        return () => { stopped = true; clearTimeout(timer); clearInterval(watchdog); worker?.terminate(); stream?.getTracks().forEach(t => t.stop()); callback.current(null); };
    }, []);
    let transform = '', visible = false;
    let crosshair: React.CSSProperties = { left: '50%', top: '50%' };
    if (tracking && view.current) {
        const rect = view.current.getBoundingClientRect(), ratio = Math.min(rect.width / tracking.width, rect.height / tracking.height), ox = (rect.width - tracking.width * ratio) / 2, oy = (rect.height - tracking.height * ratio) / 2;
        crosshair = { left: ox + tracking.width * (.5 + offset.x) * ratio, top: oy + tracking.height * (.5 + offset.y) * ratio };
        const p = placement, r = p.rotation * Math.PI / 180, s = p.scale;
        const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => { const q = project(tracking.inverse, { x: p.position_x * W + s * (x * Math.cos(r) - y * Math.sin(r)), y: p.position_y * H + s * (x * Math.sin(r) + y * Math.cos(r)) }); return { x: q.x * ratio + ox, y: q.y * ratio + oy }; });
        try {
            const m = homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], corners);
            transform = `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
            visible = true;
        }
        catch { /* invalid fit remains hidden */ }
    }
    function touch(e: React.PointerEvent<HTMLDivElement>) { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); e.currentTarget.setPointerCapture(e.pointerId); if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), scale: size, rotation };
    } }
    function move(e: React.PointerEvent<HTMLDivElement>) { if (!pointers.current.has(e.pointerId))
        return; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2 && gesture.current) {
        const [a, b] = [...pointers.current.values()], g = gesture.current;
        adjust.current(g.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.distance, g.rotation + (Math.atan2(b.y - a.y, b.x - a.x) - g.angle) * 180 / Math.PI);
    } }
    function end(e: React.PointerEvent<HTMLDivElement>) { pointers.current.delete(e.pointerId); gesture.current = null; }
    return <><div ref={view} className="camera" onPointerDown={touch} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><video ref={video} muted playsInline/><img className="camera-stamp" alt="Placement preview" src={sources[placement.stamp_type]} style={{ transform, display: visible ? 'block' : 'none' }}/><div className="crosshair" style={crosshair}>＋</div><div className={`tracking ${tracking ? 'good' : 'lost'}`} role="status">{message}</div></div><div className="camera-tools"><label>Size <input aria-label="Camera stamp size" type="range" min="32" max="600" value={size} onChange={e => setSize(+e.target.value)}/></label><label>Turn <input aria-label="Camera stamp rotation" type="range" min="-180" max="180" value={rotation} onChange={e => setRotation(+e.target.value)}/></label><details><summary>Aiming offset</summary><label>Horizontal<input type="range" min="-.2" max=".2" step=".005" value={offset.x} onChange={e => setOffset({ ...offset, x: +e.target.value })}/></label><label>Vertical<input type="range" min="-.2" max=".2" step=".005" value={offset.y} onChange={e => setOffset({ ...offset, y: +e.target.value })}/></label><button onClick={() => setOffset({ x: 0, y: 0 })}>Centre aim</button></details></div>{debug && <pre className="debug">{JSON.stringify(stats, null, 2)}{'\n'}Processing at ≤1280px · RMS in camera pixels</pre>}</>;
}
