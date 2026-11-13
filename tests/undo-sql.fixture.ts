// Optional browser-only real PostgreSQL regression. The pinned PGlite runtime is
// downloaded from npm's CDN; SQL and test data execute locally, never on Supabase.
// This fixture is not imported by the production app and adds no runtime dependency.
import base from '../supabase/migrations/202611110001_wallpaper.sql?raw';
import custom from '../supabase/migrations/202611110002_custom_stamps.sql?raw';
import undoMigration from '../supabase/migrations/202611130001_individual_undo.sql?raw';
type Engine = { exec: (sql: string) => Promise<unknown>; query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
const output = document.getElementById('result')!;
const ensure = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
async function check() {
  const source = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.3.14/dist/index.js';
  const { PGlite } = await import(/* @vite-ignore */ source);
  const db: Engine = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth; create schema realtime;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table realtime.messages(id uuid,extension text);
      alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      grant usage on schema public,auth to authenticated,anon;
      create publication supabase_realtime;`);
    await db.exec(base); await db.exec(custom);
    const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID();
    await db.query('insert into auth.users values($1),($2),($3)', [a, b, c]);
    async function as(user: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('set role authenticated');
    }
    async function denied(sql: string, params: unknown[] = [], code = '42501') {
      try { await db.query(sql, params); }
      catch (e) { ensure((e as { code: string }).code === code, `Wrong rejection: ${String(e)}`); return; }
      throw Error('Unauthorized query succeeded: ' + sql);
    }
    await as(a);
    const session = (await db.query('select public.create_wallpaper() as value')).rows[0].value as { id: string; join_code: string };
    const legacy = crypto.randomUUID();
    await db.query("insert into public.wallpaper_stamps(id,session_id,stamp_type,position_x,position_y,scale,rotation) values($1,$2,'star',.5,.5,160,0)", [legacy, session.id]);
    await db.exec('reset role'); await db.exec(undoMigration);
    output.textContent = 'Migrations applied; checking authenticated roles…';
    await as(b); await db.query('select public.join_wallpaper($1)', [session.join_code]);
    const insert = (id: string) => db.query("insert into public.wallpaper_stamps(id,session_id,stamp_type,position_x,position_y,scale,rotation) values($1,$2,'star',.5,.5,160,0)", [id, session.id]);
    const history = async () => (await db.query('select * from public.wallpaper_undo_history($1)', [session.id])).rows.map(row => row.id as string);
    const remove = async (id: string) => (await db.query('select public.undo_wallpaper_stamp($1,$2) as removed', [session.id, id])).rows[0].removed;
    const own: string[] = [], peer: string[] = [];
    await as(a); ensure(JSON.stringify(await history()) === JSON.stringify([legacy]), 'Existing artwork was not backfilled');
    for (let i = 0; i < 6; i++) {
      own.push(crypto.randomUUID()); peer.push(crypto.randomUUID());
      await as(a); await insert(own[i]); await as(b); await insert(peer[i]);
    }
    await as(a);
    ensure(JSON.stringify(await history()) === JSON.stringify(own.slice(1).reverse()), 'Interleaving changed the five-stamp window');
    await denied('select * from public.wallpaper_stamp_history');
    await denied('delete from public.wallpaper_stamps where id=$1', [own[5]]);
    await denied("insert into public.wallpaper_stamps(id,session_id,created_by,stamp_type,position_x,position_y,scale,rotation) values($1,$2,$3,'star',.5,.5,160,0)", [crypto.randomUUID(), session.id, b]);
    await denied('select public.undo_wallpaper_stamp($1,$2)', [session.id, peer[5]]);
    for (const id of [own[0], own[2]]) await denied('select public.undo_wallpaper_stamp($1,$2)', [session.id, id], '40001');
    ensure(await remove(own[5]) === true, 'Newest undo failed');
    ensure(await remove(own[5]) === false, 'Repeated undo removed another stamp');
    ensure((await history()).length === 4, 'Deleted stamp exposed older history');
    await as(c); await denied('select * from public.wallpaper_undo_history($1)', [session.id]);
    await denied('select public.undo_wallpaper_stamp($1,$2)', [session.id, own[4]]);
    await as(a);
    ensure((await history()).length === 4, 'Restored authenticated identity lost history');
    const seventh = crypto.randomUUID(); await insert(seventh);
    ensure(JSON.stringify(await history()) === JSON.stringify([seventh, own[4], own[3], own[2]]), 'New stamp failed to advance the immutable window');
    await remove(seventh);
    for (const id of await history()) await remove(id);
    ensure((await history()).length === 0, 'Old stamps resurrected');
    const remaining = (await db.query('select id from public.wallpaper_stamps where session_id=$1', [session.id])).rows.map(r => r.id);
    ensure(remaining.length === 9 && [...peer, own[0], own[1], legacy].every(id => remaining.includes(id)), 'Undo removed someone else or expired artwork');
    const fresh = crypto.randomUUID(); await insert(fresh);
    await denied("insert into public.wallpaper_stamps(id,session_id,stamp_type,position_x,position_y,scale,rotation) values($1,$2,'star',.5,.5,160,0)", [fresh, session.id], '23505');
    ensure((await history()).length === 1, 'Duplicate stamp consumed history');
    await remove(fresh);
    await denied("insert into public.wallpaper_stamps(id,session_id,stamp_type,position_x,position_y,scale,rotation) values($1,$2,'star',.5,.5,160,0)", [fresh, session.id], '23505');
    ensure((await history()).length === 0, 'Replayed removed ID restored artwork');
    await db.query('select public.reset_wallpaper($1)', [session.id]);
    ensure((await history()).length === 0, 'Owner reset retained eligible deleted rows');
    await insert(crypto.randomUUID());
    ensure((await history()).length === 1, 'Stamping after reset exposed previous history');
    await db.exec('reset role; set role anon');
    await denied('select * from public.wallpaper_undo_history($1)', [session.id]);
    output.textContent = 'PASS: all three migrations, real PostgreSQL RLS/grants/triggers, authenticated ownership, peer/nonmember/anon denial, immutable latest-five window, newest-first deletion, no older resurrection, interleaved owners, restored identity, persistent deletion and duplicate/replay protection. Live Supabase concurrency/realtime still requires scripts/check-undo.ts.';
  } finally { await db.close(); }
}
void check().catch(e => { output.textContent = 'FAIL: ' + String(e); console.error(e); });
