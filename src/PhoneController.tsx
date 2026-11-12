import { useRef, useState } from 'react';
import Camera from './Camera';
import DrawingEditor from './drawing/DrawingEditor';
import {manipulate,type Gesture} from './manipulation';
import type {CameraHandle,StampSample,PlacementMode} from './cameraPlacement';
import { rasterizeText, MAX_TEXT_LENGTH, MAX_TEXT_LINES } from './customStamp';
import { stampSource } from './art';
import { W, H, type Point } from './geometry';
import { type Placement, type Stamp, stampDimensions } from './types';
type Props = {
    placement: Placement;
    stamps: Stamp[];
    camera: boolean;
    setCamera: (enabled: boolean) => void;
    onChange: (p: Placement) => void;
    onCameraPlacement: (p: Placement | null, at?: number, validUntil?:number) => void;
    onStatus: (s: string) => void;
    online: boolean;
    busy: boolean;
    canPlace: boolean;
    preview: (sample?:StampSample) => void;
    stamp: (sample?:StampSample) => void;
    notice: string;
    error: string;
    dismissError: () => void;
};
export default function PhoneController(p: Props) {
    const [settings, setSettings] = useState(false), [debug, setDebug] = useState(false), [trackingDebug,setTrackingDebug]=useState(false), [calibration, setCalibration] = useState<Point>({ x: 0, y: 0 }), [aimReset, setAimReset] = useState(0);
    const [cameraDebug, setCameraDebug] = useState<Record<string, unknown>>({});
    const [drawingOpen,setDrawingOpen]=useState(false);
    const [textOpen, setTextOpen] = useState(false), [draft, setDraft] = useState(''), [textError, setTextError] = useState(''), [rendering, setRendering] = useState(false);
    const cameraRef=useRef<CameraHandle>(null),[placementMode,setPlacementMode]=useState<PlacementMode>('camera-stamp'),[holding,setHolding]=useState(false);
    const manualPointers=useRef(new Map<number,Point>()),manualGesture=useRef<Gesture|null>(null),manualArtwork=useRef(p.placement);manualArtwork.current=p.placement;
    function manualRebase(){manualGesture.current={placement:{...manualArtwork.current},points:[...manualPointers.current.values()]};}
    function manualPoint(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
    function manualDown(e:React.PointerEvent<HTMLDivElement>){if(p.busy||manualPointers.current.size>=2)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const q=manualPoint(e);if(!manualPointers.current.size){const a=p.placement.rotation*Math.PI/180,dx=q.x-p.placement.position_x*W,dy=q.y-p.placement.position_y*H,{width,height}=stampDimensions(p.placement),inside=Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=width/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=height/2;if(!inside){const next={...p.placement,position_x:q.x/W,position_y:q.y/H};manualArtwork.current=next;p.onChange(next);}}manualPointers.current.set(e.pointerId,q);manualRebase();}
    function manualMove(e:React.PointerEvent<HTMLDivElement>){if(!manualPointers.current.has(e.pointerId)||!manualGesture.current||p.busy)return;e.preventDefault();manualPointers.current.set(e.pointerId,manualPoint(e));const next=manipulate(manualGesture.current,[...manualPointers.current.values()]);manualArtwork.current=next;p.onChange(next);}
    function manualUp(e:React.PointerEvent<HTMLDivElement>){manualPointers.current.delete(e.pointerId);manualRebase();}
    async function placeText() { if (rendering)
        return; setRendering(true); setTextError(''); try {
        const asset = await rasterizeText(draft);
        p.onChange({ ...p.placement, ...asset, stamp_type: 'custom' });
        setTextOpen(false);
    }
    catch (e) {
        setTextError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setRendering(false);
    } }
    function calibrate(x: number, y: number) { setCalibration(c => ({ x: Math.max(-.2, Math.min(.2, c.x + x)), y: Math.max(-.2, Math.min(.2, c.y + y)) })); setAimReset(n => n + 1); }
    function mode(value:PlacementMode){cameraRef.current?.cancelPrecision();setPlacementMode(value);p.setCamera(value!=='manual');setSettings(false);}
    function image(s: Placement, key: string, preview = false) { const { width, height } = stampDimensions(s); return <image key={key} href={stampSource(s)} x={-width / 2} y={-height / 2} width={width} height={height} opacity={preview ? .65 : 1} transform={'translate(' + s.position_x * W + ' ' + s.position_y * H + ') rotate(' + s.rotation + ')'}/>; }
    return <section className={'phone-controller ' + (p.camera ? 'camera-mode' : 'manual-mode')}>
    {p.camera && <Camera ref={cameraRef} mode={placementMode==='legacy'?'legacy':'camera-stamp'} onPrecisionChange={setHolding} placement={p.placement} onPlacement={p.onCameraPlacement} onStatus={p.onStatus} debug={settings && (debug||trackingDebug)} trackingDebug={trackingDebug} onMetrics={setCameraDebug} calibration={calibration} aimReset={aimReset} disabled={p.busy || settings || textOpen || drawingOpen} processingPaused={drawingOpen}/>}
    <header className="phone-toolbar">
      <strong>CHRISTMAS POKER 2026</strong>
      <div className="sticker-picker" aria-label="Choose sticker"><button aria-label="Text or emoji" aria-pressed={p.placement.stamp_type === 'custom'} aria-expanded={textOpen} disabled={p.busy} onClick={() => { setTextOpen(v => !v); setSettings(false); setTextError(''); }}>Aa</button><button aria-label="Draw" disabled={p.busy} onClick={()=>{setTextOpen(false);setSettings(false);setDrawingOpen(true);}}>✎</button></div>
      <span className={'connection ' + (p.online ? 'good' : 'lost')} aria-label={p.online ? 'Connected' : 'Connecting'}>{p.online ? '●' : '○'}</span>
      <button className="settings-button" aria-label="Options" aria-expanded={settings} onClick={() => { setSettings(v => !v); setTextOpen(false); }}>⚙</button>
    </header>
    {drawingOpen&&<DrawingEditor onCancel={()=>setDrawingOpen(false)} onFinish={asset=>{p.onChange({...p.placement,...asset,stamp_type:'custom'});setDrawingOpen(false);}}/>}
    {!p.camera && <div className="manual-content"><h1>Manual placement</h1><div className="manual" onPointerDown={manualDown} onPointerMove={manualMove} onPointerUp={manualUp} onPointerCancel={manualUp} onLostPointerCapture={manualUp}><svg viewBox={'0 0 ' + W + ' ' + H}><rect width={W} height={H} fill="#06281f"/>{p.stamps.map(s => image(s, s.id))}{image(p.placement, 'selected', true)}</svg><span>Tap or drag to place</span></div><label>Size <input aria-label="Manual sticker size" type="range" min="32" max="600" value={p.placement.scale} onChange={e => p.onChange({ ...p.placement, scale: +e.target.value })}/><output>{Math.round(p.placement.scale)}</output></label><label>Rotation <input aria-label="Manual sticker rotation" type="range" min="-180" max="180" value={p.placement.rotation} onChange={e => p.onChange({ ...p.placement, rotation: +e.target.value })}/><output>{Math.round(p.placement.rotation)}°</output></label><button onClick={() => mode('camera-stamp')}>Back to camera</button></div>}
    {p.camera && !settings && !textOpen && <><p className="orientation-hint">{placementMode==='camera-stamp'?'Aim · pinch & turn · tap Stamp':'Drag, pinch & turn · hold Stamp for precision'}</p>{placementMode==='legacy' && <button className="reaim" aria-label="Re-aim at camera centre" onClick={() => setAimReset(n => n + 1)}>⌖ Re-aim</button>}</>}
    {textOpen && <aside className="text-composer" aria-label="Text or emoji stamp"><div className="settings-title"><h2>Text or emoji</h2><button aria-label="Close text input" onClick={() => setTextOpen(false)} disabled={rendering}>✕</button></div><label htmlFor="stamp-text">Type with your keyboard or its emoji picker</label><textarea id="stamp-text" aria-label="Stamp text" autoFocus rows={3} maxLength={MAX_TEXT_LENGTH} value={draft} onChange={e => { setDraft(e.target.value); setTextError(''); }} placeholder="Merry Christmas 🎄"/><div className="text-composer-footer"><small>{draft.length}/{MAX_TEXT_LENGTH} · up to {MAX_TEXT_LINES} lines</small><button className="primary" disabled={rendering || !draft.trim()} onClick={() => void placeText()}>{rendering ? 'Creating…' : 'Place'}</button></div>{textError && <p className="warning" role="alert">{textError}</p>}</aside>}
    {settings && <aside className="phone-settings" aria-label="Placement options"><div className="settings-title"><h2>Options</h2><button aria-label="Close options" onClick={() => setSettings(false)}>✕</button></div><label>Placement mode<select aria-label="Placement mode" value={placementMode} disabled={p.busy} onChange={e=>mode(e.target.value as PlacementMode)}><option value="camera-stamp">Camera Stamp</option><option value="legacy">Legacy Camera</option><option value="manual">Manual Placement</option></select></label>{placementMode==='legacy' && <><h3>Aiming calibration</h3><p>Move the aiming point; stickers you drag stay anchored.</p><div className="calibration-pad"><button aria-label="Move aim left" onClick={() => calibrate(-.01, 0)}>←</button><button aria-label="Move aim up" onClick={() => calibrate(0, -.01)}>↑</button><button aria-label="Move aim down" onClick={() => calibrate(0, .01)}>↓</button><button aria-label="Move aim right" onClick={() => calibrate(.01, 0)}>→</button></div><button onClick={() => { setCalibration({ x: 0, y: 0 }); setAimReset(n => n + 1); }}>Centre aim / reset calibration</button></>}<label><input type="checkbox" checked={trackingDebug} onChange={e=>setTrackingDebug(e.target.checked)}/>Tracking Debug</label>{trackingDebug&&<p>Close Options: marker nodes, connections and bottom-screen diagnostics stay over the camera. Use 1× to see tags cropped by 2×.</p>}<label><input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)}/>Debug information</label>{debug && <pre className="debug">{JSON.stringify(p.camera?cameraDebug:{state:'manual',camera:'Off — no permission needed'},null,2)}</pre>}</aside>}
    <footer className="phone-bottom">{p.error && <div className="phone-error" role="alert">{p.error}<button aria-label="Dismiss error" onClick={p.dismissError}>✕</button></div>}{p.notice && <p className="notice" role="status">{p.notice}</p>}<div className="phone-actions"><button disabled={!p.canPlace || p.busy || settings || textOpen} onClick={()=>{if(!p.camera)p.preview();else{const sample=cameraRef.current?.sample();if(sample)p.preview(sample);}}}>Preview</button><button className="primary" disabled={!p.canPlace || p.busy || settings || textOpen} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(placementMode!=='legacy')return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);cameraRef.current?.beginPrecision();}} onPointerUp={e=>{if(placementMode!=='legacy')return;e.preventDefault();const sample=cameraRef.current?.endPrecision();if(sample)p.stamp(sample);}} onPointerCancel={()=>cameraRef.current?.cancelPrecision()} onLostPointerCapture={()=>cameraRef.current?.cancelPrecision()} onBlur={()=>cameraRef.current?.cancelPrecision()} onKeyDown={e=>{if(placementMode==='legacy'&&!e.repeat&&(e.key===' '||e.key==='Enter')){e.preventDefault();cameraRef.current?.beginPrecision();}}} onKeyUp={e=>{if(placementMode==='legacy'&&(e.key===' '||e.key==='Enter')){e.preventDefault();const sample=cameraRef.current?.endPrecision();if(sample)p.stamp(sample);}}} onClick={()=>{if(placementMode==='manual')p.stamp();else if(placementMode==='camera-stamp'){const sample=cameraRef.current?.sample();if(sample)p.stamp(sample);}}}>{p.busy?'Saving…':holding?'Release to stamp':placementMode==='legacy'?'Hold to stamp':'Stamp'}</button></div></footer>
  </section>;
}
