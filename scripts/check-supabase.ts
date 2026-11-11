// Opt-in service test. Creates three anonymous users and two empty sessions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key)
    throw Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.');
function client() { return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); }
const owner = client(), phone = client(), outsider = client();
async function rpc(c: SupabaseClient, name: string, args = {}) { const r = await c.rpc(name, args); if (r.error)
    throw r.error; return r.data; }
async function subscribe(c: SupabaseClient, id: string) { await c.realtime.setAuth(); const ch = c.channel(`wallpaper:${id}`, { config: { private: true, broadcast: { ack: true } } }); await new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(Error('Realtime subscription timed out')), 15000); ch.subscribe((s, error) => { if (s === 'SUBSCRIBED') {
    clearTimeout(t);
    resolve();
} if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
    clearTimeout(t);
    reject(Error(s + (error ? ': ' + error.message : '')));
} }); }); return ch; }
try {
    for (const c of [owner, phone, outsider]) {
        const { error } = await c.auth.signInAnonymously();
        if (error)
            throw error;
    }
    const a = await rpc(owner, 'create_wallpaper'), b = await rpc(outsider, 'create_wallpaper');
    await rpc(phone, 'join_wallpaper', { code: a.join_code });
    const row = { id: crypto.randomUUID(), session_id: a.id, stamp_type: 'star', position_x: .5, position_y: .5, scale: 160, rotation: 0 };
    assert.equal((await phone.from('wallpaper_stamps').insert(row)).error, null);
    assert.equal((await phone.from('wallpaper_stamps').insert(row)).error?.code, '23505', 'Duplicate request must be idempotent');
    assert.equal((await owner.from('wallpaper_stamps').select('*').eq('id', row.id)).data?.length, 1, 'Owner must see persisted stamp');
    assert.equal((await outsider.from('wallpaper_stamps').select('*').eq('session_id', a.id)).data?.length, 0, 'Unjoined user must not read stamps');
    assert.ok((await outsider.from('wallpaper_stamps').insert({ ...row, id: crypto.randomUUID() })).error, 'Unjoined user must not insert');
    assert.ok((await phone.from('wallpaper_stamps').insert({ ...row, id: crypto.randomUUID(), session_id: b.id })).error, 'Phone must not write another session');
    assert.ok((await phone.rpc('reset_wallpaper', { target: a.id })).error, 'Participant must not reset');
    const receiver = await subscribe(owner, a.id), sender = await subscribe(phone, a.id);
    const received = new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(Error('Preview broadcast not received')), 10000); receiver.on('broadcast', { event: 'preview' }, ({ payload }) => { if (payload.test === row.id) {
        clearTimeout(t);
        resolve();
    } }); });
    assert.equal(await sender.send({ type: 'broadcast', event: 'preview', payload: { test: row.id } }), 'ok');
    await received;
    await rpc(owner, 'reset_wallpaper', { target: a.id });
    assert.equal((await owner.from('wallpaper_stamps').select('*').eq('session_id', a.id)).data?.length, 0);
    console.log('PASS: session isolation, idempotency, persistence, private broadcast, owner reset.');
    console.log('Test sessions (empty):', a.id, b.id, '— remove these and the anonymous test users in Supabase if desired.');
}
finally {
    await Promise.all([owner, phone, outsider].map(c => c.removeAllChannels()));
}
