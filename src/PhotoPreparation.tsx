import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodePhoto, preparePhoto, type DecodedPhoto } from './photoStamp';
import type { CustomAsset } from './customStamp';

export default function PhotoPreparation({ file, onCancel, onFinish }: { file: File; onCancel: () => void; onFinish: (asset: CustomAsset) => void }) {
  const [photo, setPhoto] = useState<DecodedPhoto | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
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
    return () => { disposed = true; active.current = false; decoded?.dispose(); previous?.focus(); };
  }, [file]);
  async function usePhoto() {
    if (!photo || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const asset = await preparePhoto(photo.image);
      if (active.current) onFinish(asset);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  return createPortal(<div className="photo-backdrop">
    <section className="photo-preparation" role="dialog" aria-modal="true" aria-labelledby="photo-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Tab') {
        const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="settings-title"><h2 id="photo-title">Prepare photo</h2><button ref={close} onClick={onCancel} aria-label="Cancel photo">×</button></div>
      {photo ? <img className="photo-preview" src={photo.url} alt="Selected photo"/> : !error && <p role="status">Opening photo…</p>}
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="photo-options">
        <button disabled>Convert to AI Stamp — Coming soon</button>
        <button className="primary" disabled={!photo || busy} onClick={() => void usePhoto()}>{busy ? 'Preparing photo…' : 'Use Original Photo'}</button>
      </div>
      <small>The whole photo is resized to fit. Nothing is stamped until you press Stamp.</small>
    </section>
  </div>, document.body);
}
