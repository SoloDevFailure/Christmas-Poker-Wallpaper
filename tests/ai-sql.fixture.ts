// Actual PostgreSQL migrations/RLS/RPC tests. No Supabase writes or OpenAI calls.
import base from '../supabase/migrations/202611110001_wallpaper.sql?raw';
import custom from '../supabase/migrations/202611110002_custom_stamps.sql?raw';
import undo from '../supabase/migrations/202611130001_individual_undo.sql?raw';
import ai from '../supabase/migrations/202611130002_ai_stamps.sql?raw';
type Engine = { exec: (sql: string) => Promise<unknown>; query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
const output = document.getElementById('result')!;
const ensure = (value: unknown, message: string) => { if (!value) throw Error(message); };
async function check() {
  const source = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.3.14/dist/index.js';
  const { PGlite } = await import(/* @vite-ignore */ source); const db: Engine = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create schema realtime;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table realtime.messages(id uuid,extension text); alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      grant usage on schema public,auth to authenticated,anon,service_role; create publication supabase_realtime;`);
    for (const migration of [base, custom, undo, ai]) await db.exec(migration);
    const users = Array.from({ length: 23 }, () => crypto.randomUUID());
    for (const id of users) await db.query('insert into auth.users values($1)', [id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]]); await db.exec('set role authenticated');
    const session = (await db.query('select public.create_wallpaper() as value')).rows[0].value as { id: string; join_code: string };
    for (const id of users.slice(1, 22)) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.query('select public.join_wallpaper($1)', [session.join_code]); }
    const denied = async (sql: string, params: unknown[] = [], code?: string) => {
      try { await db.query(sql, params); } catch (e) { if (code) ensure((e as { code: string }).code === code, `Unexpected rejection: ${String(e)}`); return String(e); }
      throw Error('Query should have been denied: ' + sql);
    };
    const args = (user: string, request = crypto.randomUUID(), event = 'christmas-poker-2026') => [event, user, session.id, request, 'a'.repeat(64), 'gpt-image-2'];
    const reserveSql = 'select public.reserve_ai_stamp($1,$2,$3,$4,$5,$6) as value';
    await denied(reserveSql, args(users[0]), '42501');
    await denied('select * from public.ai_stamp_jobs', [], '42501');
    await denied('select * from public.ai_stamp_events', [], '42501');
    await denied("select public.finish_ai_stamp($1,'succeeded')", [crypto.randomUUID()], '42501');
    await db.exec('reset role; set role anon'); await denied(reserveSql, args(users[0]), '42501');
    async function admin(sql: string, params: unknown[] = []) {
      await db.exec('reset role'); const result = await db.query(sql, params); await db.exec('set role service_role'); return result;
    }
    await admin('update public.ai_stamp_events set enabled=true,budget_usd=100');
    ensure((await denied(reserveSql, args(users[22]))).includes('AI_NOT_MEMBER'), 'Nonmember admitted');
    const reserve = async (user: string, request = crypto.randomUUID(), event = 'christmas-poker-2026') => (await db.query(reserveSql, args(user, request, event))).rows[0].value as { status: string };
    const finish = async (request: string, status: string) => (await db.query('select public.finish_ai_stamp($1,$2) as value', [request, status])).rows[0].value;
    const age = () => admin("update public.ai_stamp_jobs set started_at=clock_timestamp()-interval '31 seconds' where status in ('failed','succeeded')");
    const first = crypto.randomUUID(); ensure((await reserve(users[0], first)).status === 'admitted', 'First request denied');
    ensure((await reserve(users[0], first)).status === 'running', 'Duplicate request resubmitted');
    const mismatch = args(users[0], first); mismatch[4] = 'b'.repeat(64); await denied(reserveSql, mismatch, '42501');
    ensure((await denied(reserveSql, args(users[0]))).includes('AI_USER_ACTIVE'), 'Two active jobs per user');
    ensure(await finish(first, 'succeeded') === true && await finish(first, 'succeeded') === false, 'Finalization not idempotent');
    ensure((await denied(reserveSql, args(users[0]))).includes('AI_COOLDOWN'), 'Cooldown not enforced');
    await age();
    const duplicateIds = [crypto.randomUUID(), crypto.randomUUID()];
    const concurrent = await Promise.allSettled(duplicateIds.map(id => reserve(users[1], id)));
    ensure(concurrent.filter(r => r.status === 'fulfilled').length === 1, 'Concurrent user admissions were not serialized');
    const admitted = duplicateIds[concurrent.findIndex(r => r.status === 'fulfilled')]; await finish(admitted, 'failed'); await age();
    output.textContent = 'Checking five-user and 100-event ceilings…';
    for (let person = 0; person < 20; person++) for (let count = person === 0 ? 1 : 0; count < 5; count++) {
      const id = crypto.randomUUID(); await reserve(users[person], id); await finish(id, 'succeeded'); await age();
    }
    ensure((await denied(reserveSql, args(users[0]))).includes('AI_USER_LIMIT'), 'User exceeded five successes');
    ensure((await denied(reserveSql, args(users[20]))).includes('AI_EVENT_LIMIT'), 'Event exceeded 100 successes');
    const counts = (await admin("select count(*) filter(where status='succeeded') as success,count(*) as attempts from public.ai_stamp_jobs")).rows[0];
    ensure(Number(counts.success) === 100 && Number(counts.attempts) === 101, 'Failed job consumed a success allowance');
    await admin("insert into public.ai_stamp_events(id,enabled,user_attempt_limit) values('attempts',true,2)");
    for (let i = 0; i < 2; i++) { const id = crypto.randomUUID(); await reserve(users[21], id, 'attempts'); await finish(id, 'failed'); await age(); }
    ensure((await denied(reserveSql, args(users[21], undefined, 'attempts'))).includes('AI_ATTEMPT_LIMIT'), 'Unlimited failed attempts');
    await admin("insert into public.ai_stamp_events(id,enabled,budget_usd) values('budget',true,.1)");
    const budget = crypto.randomUUID(); await reserve(users[21], budget, 'budget'); await finish(budget, 'failed'); await age();
    ensure((await denied(reserveSql, args(users[21], undefined, 'budget'))).includes('AI_BUDGET_LIMIT'), 'Failed spend reservation refunded');
    await admin("insert into public.ai_stamp_events(id,enabled,active_limit) values('active',true,1)");
    const stale = crypto.randomUUID(); await reserve(users[20], stale, 'active');
    await admin("update public.ai_stamp_jobs set started_at=clock_timestamp()-interval '4 minutes' where id=$1", [stale]);
    ensure((await denied(reserveSql, args(users[21], undefined, 'active'))).includes('AI_EVENT_BUSY'), 'Uncertain outcome released event reservation');
    // A rejected reservation rolls its housekeeping update back; finish unknown
    // is the explicit Edge path after a timeout and must block subsequent calls.
    await finish(stale, 'unknown');
    ensure((await denied(reserveSql, args(users[20], undefined, 'active'))).includes('AI_USER_ACTIVE'), 'Unknown outcome allowed a duplicate generation');
    await finish(stale, 'failed'); ensure((await reserve(users[21], crypto.randomUUID(), 'active')).status === 'admitted', 'Operator reconciliation did not unblock event');
    output.textContent = 'PASS: all four migrations, authenticated/anon denial, membership, atomic reservations, concurrent requests, one active per user, 5/100 success ceilings, failed-attempt ceiling, cooldown, duplicate IDs, idempotent completion, budget reservations and unknown-outcome reconciliation. No paid API calls. PGlite serializes one PostgreSQL connection; live multi-connection testing remains separate.';
  } finally { await db.close(); }
}
void check().catch(e => { output.textContent = 'FAIL: ' + String(e); console.error(e); });
