import { useRef, useState } from 'react';
import Camera from './Camera';
import { sources } from './art';
import { W, H, type Point } from './geometry';
import { icons, type Placement, type Stamp, type StampType } from './types';
type Props = {
    placement: Placement;
    stamps: Stamp[];
    camera: boolean;
    setCamera: (enabled: boolean) => void;
    onChange: (p: Placement) => void;
    onCameraPlacement: (p: Placement | null, at?: number) => void;
    onStatus: (s: string) => void;
    online: boolean;
    busy: boolean;
    canPlace: boolean;
    preview: () => void;
    stamp: () => void;
    notice: string;
    error: string;
    dismissError: () => void;
};
export default function PhoneController(p: Props) {
    const [settings, setSettings] = useState(false), [debug, setDebug] = useState(false), [calibration, setCalibration] = useState<Point>({ x: 0, y: 0 }), [aimReset, setAimReset] = useState(0);
    const [cameraDebug,setCameraDebug]=useState<Record<string,unknown>>({});
    const usedManual = useRef(false);
    function calibrate(x: number, y: number) { setCalibration(c => ({ x: Math.max(-.2, Math.min(.2, c.x + x)), y: Math.max(-.2, Math.min(.2, c.y + y)) })); setAimReset(n => n + 1); }
    function mode(camera: boolean) { if (!camera)
        usedManual.current = true; p.setCamera(camera); setSettings(false); }
    function manualPosition(e: React.PointerEvent<HTMLDivElement>) { if (p.busy)
        return; const r = e.currentTarget.getBoundingClientRect(); p.onChange({ ...p.placement, position_x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), position_y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }); }
    function image(s: Placement, key: string, preview = false) { return <image key={key} href={sources[s.stamp_type]} x={-s.scale / 2} y={-s.scale / 2} width={s.scale} height={s.scale} opacity={preview ? .65 : 1} transform={'translate(' + s.position_x * W + ' ' + s.position_y * H + ') rotate(' + s.rotation + ')'}/>; }
    return <section className={'phone-controller ' + (p.camera ? 'camera-mode' : 'manual-mode')}>
    {p.camera && <Camera placement={p.placement} onPlacement={p.onCameraPlacement} onStatus={p.onStatus} debug={settings && debug} onMetrics={setCameraDebug} calibration={calibration} aimReset={aimReset} initiallyAnchored={usedManual.current} disabled={p.busy || settings}/>}
    <header className="phone-toolbar">
      <strong>CHRISTMAS POKER 2026</strong>
      <div className="sticker-picker" aria-label="Choose sticker">{(Object.keys(icons) as StampType[]).map(k => <button key={k} aria-label={'Choose ' + k} aria-pressed={p.placement.stamp_type === k} disabled={p.busy} onClick={() => p.onChange({ ...p.placement, stamp_type: k })}><img src={sources[k]} alt=""/></button>)}</div>
      <span className={'connection ' + (p.online ? 'good' : 'lost')} aria-label={p.online ? 'Connected' : 'Connecting'}>{p.online ? '●' : '○'}</span>
      <button className="settings-button" aria-label="Settings" aria-expanded={settings} onClick={() => setSettings(v => !v)}>⚙</button>
    </header>
    {!p.camera && <div className="manual-content"><h1>Manual placement</h1><div className="manual" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); manualPosition(e); }} onPointerMove={e => { if (e.buttons)
        manualPosition(e); }}><svg viewBox={'0 0 ' + W + ' ' + H}><rect width={W} height={H} fill="#06281f"/>{p.stamps.map(s => image(s, s.id))}{image(p.placement, 'selected', true)}</svg><span>Tap or drag to place</span></div><label>Size <input aria-label="Manual sticker size" type="range" min="32" max="600" value={p.placement.scale} onChange={e => p.onChange({ ...p.placement, scale: +e.target.value })}/><output>{Math.round(p.placement.scale)}</output></label><label>Rotation <input aria-label="Manual sticker rotation" type="range" min="-180" max="180" value={p.placement.rotation} onChange={e => p.onChange({ ...p.placement, rotation: +e.target.value })}/><output>{Math.round(p.placement.rotation)}°</output></label><button onClick={() => mode(true)}>Back to camera</button></div>}
    {p.camera && !settings && <><p className="orientation-hint">Landscape works best · drag, pinch &amp; turn</p><button className="reaim" aria-label="Re-aim at camera centre" onClick={() => setAimReset(n => n + 1)}>⌖ Re-aim</button></>}
    {settings && <aside className="phone-settings" aria-label="Placement settings"><div className="settings-title"><h2>Settings</h2><button aria-label="Close settings" onClick={() => setSettings(false)}>✕</button></div><button onClick={() => mode(!p.camera)}>{p.camera ? 'Manual placement' : 'Use camera'}</button><h3>Aiming calibration</h3><p>Move the aiming point; stickers you drag stay anchored.</p><div className="calibration-pad"><button aria-label="Move aim left" onClick={() => calibrate(-.01, 0)}>←</button><button aria-label="Move aim up" onClick={() => calibrate(0, -.01)}>↑</button><button aria-label="Move aim down" onClick={() => calibrate(0, .01)}>↓</button><button aria-label="Move aim right" onClick={() => calibrate(.01, 0)}>→</button></div><button onClick={() => { setCalibration({ x: 0, y: 0 }); setAimReset(n => n + 1); }}>Centre aim / reset calibration</button><label><input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)}/>Debug information</label>{debug && <pre className="debug">{JSON.stringify({camera:cameraDebug,placement:p.placement,calibration}, null, 2)}</pre>}</aside>}
    <footer className="phone-bottom">{p.error && <div className="phone-error" role="alert">{p.error}<button aria-label="Dismiss error" onClick={p.dismissError}>✕</button></div>}{p.notice && <p className="notice" role="status">{p.notice}</p>}<div className="phone-actions"><button disabled={!p.canPlace || p.busy || settings} onClick={p.preview}>Preview</button><button className="primary" disabled={!p.canPlace || p.busy || settings} onClick={p.stamp}>{p.busy ? 'Saving…' : 'Stamp'}</button></div></footer>
  </section>;
}
