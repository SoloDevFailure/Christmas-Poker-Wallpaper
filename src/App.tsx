import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { db, identity, loadStamps, openSession, saveStamp } from './backend';
import { exportArt } from './art';
import Wallpaper from './Wallpaper';
import type {StampSample} from './cameraPlacement';
import { type Placement, type Preview, type Session, type Stamp, validPlacement } from './types';
import PhoneController from './PhoneController';
import {RECOVERY_HOLD,withinTrackingGrace} from './trackingState';
const initial: Placement = { stamp_type: 'star', position_x: .5, position_y: .5, scale: 160, rotation: 0 };
export default function App() {
    const phone = location.pathname.replace(/\/$/, '').endsWith('/phone');
    const [code, setCode] = useState(new URLSearchParams(location.search).get('session') || (!phone ? localStorage.getItem('wallpaper-code') || '' : ''));
    const [session, setSession] = useState<Session | null>(null), [user, setUser] = useState(''), [stamps, setStamps] = useState<Stamp[]>([]), [previews, setPreviews] = useState<Record<string, Preview>>({}), [qr, setQr] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(false), [debug, setDebug] = useState(false), [placement, setPlacement] = useState(initial), [camera, setCamera] = useState(true), [locked, setLocked] = useState(false), [trackingStatus, setTrackingStatus] = useState(''), [notice, setNotice] = useState('');
    const channel = useRef<RealtimeChannel | null>(null), requestId = useRef<string | null>(null), sending = useRef(false), lastStamp = useRef(0), placementDeadline = useRef(0);
    const phoneUrl = session ? `${import.meta.env.VITE_PUBLIC_URL?.replace(/\/$/, '') || new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '')}/phone/?session=${encodeURIComponent(session.join_code)}` : '';
    async function connect(join?: string) {
        setBusy(true);
        setError('');
        try {
            const id = await identity(), s = await openSession(join);
            setUser(id);
            setSession(s);
            setCode(s.join_code);
            if (!phone)
                localStorage.setItem('wallpaper-code', s.join_code);
            const u = new URL(location.href);
            u.searchParams.set('session', s.join_code);
            history.replaceState({}, '', u);
            setStamps(await loadStamps(s.id));
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        if (code)
            void connect(code);
    }, []);
    useEffect(() => {
        if (!session || phone)
            return;
        QRCode.toDataURL(phoneUrl, { width: 256, margin: 2, errorCorrectionLevel: 'M' }).then(setQr).catch(e => setError(message(e)));
    }, [phoneUrl, session?.id]);
    useEffect(() => {
        if (!session || !db)
            return;
        let disposed = false, loadRunning = false, reloadAgain = false;
        const s = session;
        async function reload() {
            if (loadRunning) {
                reloadAgain = true;
                return;
            }
            loadRunning = true;
            try {
                do {
                    reloadAgain = false;
                    const rows = await loadStamps(s.id);
                    if (!disposed)
                        setStamps(rows);
                } while (reloadAgain && !disposed);
            }
            catch (e) {
                if (!disposed)
                    setError(message(e));
            }
            finally {
                loadRunning = false;
            }
        }
        const c = db.channel(`wallpaper:${s.id}`, { config: { private: true, broadcast: { self: false, ack: true } } });
        channel.current = c;
        c.on('broadcast', { event: 'preview' }, ({ payload }) => {
            const p = payload as Preview;
            if (validPlacement(p) && typeof p.sender === 'string' && Number.isFinite(p.expires) && p.expires > Date.now())
                setPreviews(prev => ({ ...prev, [p.sender]: { ...p, expires: Math.min(p.expires, Date.now() + 12000) } }));
        });
        c.on('postgres_changes', { event: '*', schema: 'public', table: 'wallpaper_stamps', filter: `session_id=eq.${s.id}` }, () => void reload());
        c.on('broadcast', { event: 'reset' }, () => { setPreviews({}); void reload(); });
        c.on('broadcast', { event: 'clear-preview' }, ({ payload }) => {
            if (typeof payload.sender === 'string')
                setPreviews(prev => { const next = { ...prev }; delete next[payload.sender]; return next; });
        });
        void db.realtime.setAuth().then(() => {
            if (!disposed)
                c.subscribe(state => {
                    if (disposed)
                        return;
                    setOnline(state === 'SUBSCRIBED');
                    if (state === 'SUBSCRIBED')
                        void reload();
                    if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT')
                        setError('Realtime disconnected. Check Supabase setup and connection.');
                });
        }).catch(e => setError(message(e)));
        const expiry = setInterval(() => setPreviews(prev => Object.fromEntries(Object.entries(prev).filter(([, p]) => p.expires > Date.now()))), 500);
        // Reconcile after reconnect, tab resume, and missed delete events (RLS limits DELETE filters).
        const reconcile = setInterval(() => void reload(), 15000), resume = () => {
            if (document.visibilityState === 'visible')
                void reload();
        };
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('online', resume);
        return () => { disposed = true; clearInterval(expiry); clearInterval(reconcile); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); void db!.removeChannel(c); channel.current = null; };
    }, [session?.id]);
    function message(e: unknown) { return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e); }
    const canPlace = !!session && online && (!phone || !camera || locked) && validPlacement(placement);
    async function preview(sample?:StampSample) {
        const submitted=sample?.placement||placement;
        if (!canPlace || !validPlacement(submitted) || camera && !withinTrackingGrace(sample?.validUntil??placementDeadline.current,performance.now()))
            return;
        setError('');
        try {
            const response = await channel.current!.send({ type: 'broadcast', event: 'preview', payload: { ...submitted, sender: user, expires: Date.now() + 10000 } });
            if (response !== 'ok')
                throw Error('Preview was not delivered. Try again.');
            setNotice('Preview sent · visible for 10 seconds');
        }
        catch (e) {
            setError(message(e));
        }
    }
    async function stamp(sample?:StampSample) {
        const submitted=sample?.placement||placement;
        if (!canPlace || !validPlacement(submitted) || sending.current || performance.now() - lastStamp.current < 1000 || camera && !withinTrackingGrace(sample?.validUntil??placementDeadline.current,performance.now()))
            return;
        sending.current = true;
        setBusy(true);
        setError('');
        const id = requestId.current || crypto.randomUUID();
        requestId.current = id;
        try {
            await saveStamp(session!.id, submitted, id);
            setStamps(await loadStamps(session!.id));
            requestId.current = null;
            lastStamp.current = performance.now();
            setNotice('Stamped! Ready for the next one.');
            await channel.current?.send({ type: 'broadcast', event: 'clear-preview', payload: { sender: user } });
        }
        catch (e) {
            setError(message(e) + ' · Retry uses the same stamp ID.');
        }
        finally {
            setBusy(false);
            sending.current = false;
        }
    }
    function change(p: Placement) {
        if (sending.current)
            return;
        setPlacement(p);
        requestId.current = null;
        setNotice('');
    }
    function cameraPlacement(p: Placement | null, at = performance.now(), validUntil=at+RECOVERY_HOLD) {
        if (p) {
            placementDeadline.current = validUntil;
            setPlacement(p);
            setLocked(true);
        }
        else {
            setLocked(false);
            placementDeadline.current = 0;
        }
    }
    async function reset() {
        if (!confirm('Permanently remove every stamp from this session?'))
            return;
        setBusy(true);
        try {
            const { error } = await db!.rpc('reset_wallpaper', { target: session!.id });
            if (error)
                throw error;
            setStamps([]);
            setPreviews({});
            await channel.current?.send({ type: 'broadcast', event: 'reset', payload: {} });
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    if (!session)
        return <main className="setup"><h1>CHRISTMAS POKER 2026</h1><p>{phone ? 'Join the shared wallpaper.' : 'A shared canvas for questionable Christmas creativity.'}</p>{!db && <p className="warning">Supabase is not configured. Add your public project URL and key to .env.local. See README.md.</p>}<form onSubmit={e => { e.preventDefault(); void connect(code.trim()); }}><label>Session code<input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off" required/></label><button disabled={busy || !db}>Join session</button></form>{!phone && <button disabled={busy || !db} onClick={() => void connect()}>Create new wallpaper</button>}{error && <p role="alert" className="warning">{error}</p>}<p className="muted">Eight markers. Unlimited questionable creativity.</p></main>;
    return <main className={phone ? 'phone-root' : 'desktop'}>{phone ? <PhoneController placement={placement} stamps={stamps} camera={camera} setCamera={enabled => { setLocked(false); setCamera(enabled); }} onChange={change} onCameraPlacement={cameraPlacement} onStatus={setTrackingStatus} online={online} busy={busy} canPlace={canPlace} preview={sample => void preview(sample)} stamp={sample => void stamp(sample)} notice={notice} error={error} dismissError={() => setError('')}/> : <><div className="wallpaper-wrap"><Wallpaper stamps={stamps} previews={Object.values(previews)} qr={qr}/></div><nav className="desktop-tools"><span className={online ? 'good' : 'lost'}>{online ? '● Live' : '● Connecting'}</span><span>{stamps.length} stamps</span><button onClick={() => document.documentElement.requestFullscreen().catch(e => setError(message(e)))}>Fullscreen</button><button onClick={() => void exportArt(stamps).catch(e => setError(message(e)))}>Export PNG</button>{user === session.owner_id && <button disabled={busy} onClick={() => void reset()}>Reset artwork</button>}<a href={phoneUrl} target="_blank" rel="noreferrer">Open phone controller</a></nav></>}
    {!phone && error && <p role="alert" className="warning">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
    {!phone && <><label className="debug-toggle"><input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)}/>Debug</label>{debug && <pre className="debug">{JSON.stringify({ session: session.id, receivedPreviews: Object.values(previews) }, null, 2)}</pre>}</>}
    </main>;
}
