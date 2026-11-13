// Opt-in integration test against a migrated Supabase test project.
// Creates anonymous identities/session, resets its own artwork in finally.
// Run: node --env-file=.env.local --import tsx scripts/check-undo.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { STAMPS_CHANGED_EVENT } from '../src/stampUndo';
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!;
assert.ok(url && key, 'Set the public Supabase URL and anon key');
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const owner = client(), phone = client(), peer = client(), outsider = client(), anonymous = client();
const clients = [owner, phone, peer, outsider, anonymous];
async function rpc(c: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const result = await c.rpc(name, args); if (result.error) throw result.error; return result.data;
}
let session: { id: string; join_code: string } | undefined;
try {
  for (const c of [owner, phone, peer, outsider]) assert.equal((await c.auth.signInAnonymously()).error, null);
  session = await rpc(owner, 'create_wallpaper');
  const target = session!.id;
  for (const c of [phone, peer]) await rpc(c, 'join_wallpaper', { code: session!.join_code });
  const insert = (c: SupabaseClient, id: string = crypto.randomUUID()) => c.from('wallpaper_stamps').insert({ id, session_id: target, stamp_type: 'star', position_x: .5, position_y: .5, scale: 160, rotation: 0 });
  const history = (c = phone) => rpc(c, 'wallpaper_undo_history', { target }) as Promise<{ id: string; sequence: number }[]>;
  const undo = (id: string, c = phone) => rpc(c, 'undo_wallpaper_stamp', { target, stamp_id: id });
  const own: string[] = [], others: string[] = [];
  for (let i = 0; i < 6; i++) {
    own.push(crypto.randomUUID()); others.push(crypto.randomUUID());
    assert.equal((await insert(phone, own[i])).error, null);
    assert.equal((await insert(peer, others[i])).error, null);
  }
  assert.deepEqual((await history()).map(r => r.id), own.slice(1).reverse(), 'Only the latest five own creations are eligible');
  assert.ok((await anonymous.rpc('wallpaper_undo_history', { target })).error, 'Unauthenticated RPC denied');
  assert.ok((await outsider.rpc('wallpaper_undo_history', { target })).error, 'Nonmember history denied');
  for (const id of [others[5], own[0], own[2]]) assert.ok((await phone.rpc('undo_wallpaper_stamp', { target, stamp_id: id })).error, 'Other owner, old or out-of-order delete denied');
  assert.ok((await phone.from('wallpaper_stamp_history').select('*')).error, 'Ledger is private');
  assert.ok((await phone.from('wallpaper_stamps').delete().eq('id', own[5])).error, 'Direct DELETE denied');
  const peerUser = (await peer.auth.getSession()).data.session!.user.id;
  assert.ok((await phone.from('wallpaper_stamps').insert({ id: crypto.randomUUID(), session_id: target, created_by: peerUser, stamp_type: 'star', position_x: .5, position_y: .5, scale: 160, rotation: 0 })).error, 'Forged owner denied');
  assert.equal(await undo(own[5]), true);
  assert.equal(await undo(own[5]), false, 'Repeated undo must not remove the next stamp');
  assert.equal((await history()).length, 4);
  const auth = (await phone.auth.getSession()).data.session!;
  const restored = client(); clients.push(restored);
  assert.equal((await restored.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token })).error, null);
  assert.deepEqual(await history(restored), await history(), 'A restored auth session retains undo eligibility');
  const newest = crypto.randomUUID(); assert.equal((await insert(phone, newest)).error, null);
  assert.deepEqual((await history()).map(r => r.id), [newest, own[4], own[3], own[2]], 'New stamps evict older history including tombstones');
  const repeated = await Promise.all([undo(newest), undo(newest)]);
  assert.equal(repeated.filter(Boolean).length, 1, 'Concurrent duplicate undos remove one stamp');
  for (const entry of await history()) await undo(entry.id);
  assert.deepEqual(await history(), [], 'Old surviving stamps never become undoable');
  const remaining = await phone.from('wallpaper_stamps').select('id,created_by').eq('session_id', target);
  assert.equal(remaining.error, null);
  assert.deepEqual(new Set(remaining.data!.map(r => r.id)), new Set([...others, own[0], own[1]]), 'Interleaved peers and expired history remain');
  const duplicate = crypto.randomUUID();
  const inserts = await Promise.all([insert(phone, duplicate), insert(phone, duplicate)]);
  assert.equal(inserts.filter(r => !r.error).length, 1);
  assert.equal(inserts.find(r => r.error)?.error?.code, '23505');
  assert.equal((await history()).filter(r => r.id === duplicate).length, 1, 'Duplicate submissions consume one history slot');
  await Promise.all([owner.realtime.setAuth(), phone.realtime.setAuth()]);
  const receiver = owner.channel(`wallpaper:${target}`, { config: { private: true } });
  let observe!: () => void, fail!: (e: unknown) => void;
  const received = new Promise<void>((resolve, reject) => { observe = resolve; fail = reject; });
  receiver.on('broadcast', { event: STAMPS_CHANGED_EVENT }, () => {
    void owner.from('wallpaper_stamps').select('id').eq('id', duplicate).then(result => {
      try { assert.equal(result.error, null); assert.deepEqual(result.data, []); observe(); } catch (e) { fail(e); }
    });
  });
  const sender = phone.channel(`wallpaper:${target}`, { config: { private: true, broadcast: { ack: true } } });
  for (const channel of [receiver, sender]) await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Realtime subscribe timed out')), 15000);
    channel.subscribe(state => { if (state === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') { clearTimeout(timeout); reject(Error(state)); } });
  });
  await undo(duplicate);
  assert.ok((await insert(phone, duplicate)).error, 'An undone ID cannot be replayed');
  assert.equal(await sender.send({ type: 'broadcast', event: STAMPS_CHANGED_EVENT, payload: {} }), 'ok');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([received, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Realtime removal hint not received')), 10000); })]); }
  finally { clearTimeout(timeout); }
  console.log('PASS: authenticated ownership, immutable five-creation window, newest-first undo, interleaving, duplicates, retries, restored auth, persisted removal and private realtime refresh.');
} finally {
  if (session) await rpc(owner, 'reset_wallpaper', { target: session.id });
  await Promise.all(clients.map(c => c.removeAllChannels()));
  console.log('The isolated test session and anonymous test accounts remain; test artwork was reset.');
}
