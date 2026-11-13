import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodePhoto, preparePhoto, type DecodedPhoto } from './photoStamp';
import { AiConversionError, convertAiPhoto, prepareAiUpload } from './aiStamp';
import type { CustomAsset } from './customStamp';

export default function PhotoPreparation({ file, onCancel, onFinish, sessionId, convert = convertAiPhoto }: { file: File; onCancel: () => void; onFinish: (asset: CustomAsset) => void; sessionId?: string; convert?: typeof convertAiPhoto }) {
  const [photo, setPhoto] = useState<DecodedPhoto | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [cartoon, setCartoon] = useState<DecodedPhoto | null>(null), [progress, setProgress] = useState(''), [retryable, setRetryable] = useState(true), [attempted, setAttempted] = useState(false);
  const cartoonRef = useRef<DecodedPhoto | null>(null), upload = useRef<File | null>(null);
  const active = useRef(true), working = useRef(false), close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    let disposed = false, decoded: DecodedPhoto | null = null;
    void decodePhoto(file).then(value => {
      decoded = value;
      if (disposed) value.dispose(); else setPhoto(value);
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : String(e)); });
    return () => { disposed = true; active.current = false; decoded?.dispose(); cartoonRef.current?.dispose(); previous?.focus(); };
  }, [file]);
  async function usePhoto(useAi = false) {
    const selected = useAi ? cartoon : photo;
    if (!selected || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const asset = await preparePhoto(selected.image);
      if (active.current) onFinish(asset);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function generate() {
    if (!photo || !sessionId || working.current || !retryable) return;
    working.current = true; setBusy(true); setError(''); setAttempted(true);
    try {
      setProgress('Preparing your photo…');
      upload.current ||= await prepareAiUpload(photo.image);
      if (!active.current) return;
      setProgress('Creating your cartoon… This may take up to two minutes.');
      const result = await convert(upload.current, sessionId, crypto.randomUUID());
      if (!active.current) return;
      setProgress('Checking the cartoon preview…');
      const decoded = await decodePhoto(new File([result], 'ai-stamp.png', { type: 'image/png' }));
      if (!active.current) { decoded.dispose(); return; }
      cartoonRef.current?.dispose(); cartoonRef.current = decoded; setCartoon(decoded);
    } catch (e) {
      if (active.current) { setError(e instanceof Error ? e.message : String(e)); setRetryable(e instanceof AiConversionError ? e.retryable : true); }
    } finally { working.current = false; if (active.current) { setBusy(false); setProgress(''); } }
  }
  return createPortal(<div className="photo-backdrop">
    <section className={'photo-preparation' + (cartoon ? ' has-cartoon' : '')} role="dialog" aria-modal="true" aria-labelledby="photo-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Tab') {
        const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="settings-title"><h2 id="photo-title">Prepare photo</h2><button ref={close} onClick={onCancel} aria-label="Cancel photo">×</button></div>
      {photo ? <img className="photo-preview" src={cartoon?.url || photo.url} alt={cartoon ? "AI cartoon preview" : "Selected photo"}/> : !error && <p role="status">Opening photo…</p>}
      {progress && <p className="ai-progress" role="status">{progress}</p>}
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="photo-options">
        <button disabled={!photo || !sessionId || busy || !retryable} onClick={() => void generate()}>{cartoon || attempted ? 'Retry' : 'Convert to AI Stamp'}</button>
        {cartoon && <button className="primary" disabled={busy} onClick={() => void usePhoto(true)}>Use AI Stamp</button>}
        <button className="primary" disabled={!photo || busy} onClick={() => void usePhoto(false)}>{busy && !progress ? 'Preparing stamp…' : 'Use Original Photo'}</button>
      </div>
      <small>Your original photo stays available. Nothing is stamped until you press Stamp.</small>
    </section>
  </div>, document.body);
}
