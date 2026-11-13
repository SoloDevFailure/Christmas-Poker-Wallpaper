// Real PostgreSQL migrations/RLS/RPC checks, isolated in PGlite. No paid calls.
import base from '../supabase/migrations/202611110001_wallpaper.sql?raw';
import custom from '../supabase/migrations/202611110002_custom_stamps.sql?raw';
import undo from '../supabase/migrations/202611130001_individual_undo.sql?raw';
import ai from '../supabase/migrations/202611130002_ai_stamps.sql?raw';
import rolling from '../supabase/migrations/20261113123928_ai_stamp_rolling_quotas.sql?raw';
type Engine = { exec: (sql: string) => Promise<unknown>; query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }>; close: () => Promise<void> };
const output = document.getElementById('result')!;
let checks = 0;
const ensure = (value: unknown, message: string) => { if (!value) throw Error(message); checks++; };
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
    const users = Array.from({ length: 6 }, () => crypto.randomUUID());
    for (const id of users) await db.query('insert into auth.users values($1)', [id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]]); await db.exec('set role authenticated');
    const session = (await db.query('select public.create_wallpaper() as value')).rows[0].value;
    for (const id of users.slice(1, 5)) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.query('select public.join_wallpaper($1)', [session.join_code]); }
    await db.exec('reset role');
    await db.exec("update public.ai_stamp_events set estimated_committed_usd=.5");
    await db.exec(rolling);
    const event = (await db.query('select * from public.ai_stamp_events')).rows[0];
    ensure(Number(event.estimated_committed_usd)===.5 && Number(event.budget_usd)===4 && event.user_success_limit===15 && event.user_attempt_limit===40 && event.success_limit===150 && Number(event.attempt_reserve_usd)===.05,'Migration reset spend or misconfigured caps');
    async function admin(sql: string, params: unknown[] = []) { await db.exec('reset role'); const value = await db.query(sql, params); await db.exec('set role service_role'); return value; }
    const denied = async (sql: string, params: unknown[] = []) => { try { await db.query(sql, params); } catch (e) { ensure((e as {code:string}).code==='42501','Wrong access rejection'); return; } throw Error('Unauthorized RPC/table access'); };
    const reserveSql='select public.reserve_ai_stamp($1,$2,$3,$4,$5,$6) as value';
    const args=(event:string,user=users[0],id=crypto.randomUUID())=>[event,user,session.id,id,'a'.repeat(64),'gpt-image-2.5-flare'];
    for(const role of ['anon','authenticated']) {
      await db.exec('set role '+role);
      await denied(reserveSql,args('christmas-poker-2026'));
      await denied('select public.ai_stamp_allowance($1,$2,$3)',['christmas-poker-2026',users[0],session.id]);
      await denied('select * from public.ai_stamp_jobs'); await denied('select * from public.ai_stamp_events');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const state=async(event:string,user=users[0])=>(await db.query('select public.ai_stamp_allowance($1,$2,$3) as value',[event,user,session.id])).rows[0].value;
    const reserve=async(event:string,user=users[0],id=crypto.randomUUID())=>(await db.query(reserveSql,args(event,user,id))).rows[0].value;
    const finish=async(id:string,status:string)=>(await db.query('select public.finish_ai_stamp($1,$2) as value',[id,status])).rows[0].value;
    const addEvent=async(event:string)=>admin('insert into public.ai_stamp_events(id,enabled,budget_usd) values($1,true,100)',[event]);
    const seed=async(event:string,count:number,status='failed',startedAge=60,finishedAge=startedAge)=>admin(`insert into public.ai_stamp_jobs(id,event_id,user_id,session_id,source_hash,model,status,reserved_usd,started_at,finished_at)
      select gen_random_uuid(),$1,$2,$3,repeat('a',64),'gpt-image-2.5-flare',$4,.05,clock_timestamp()-make_interval(secs=>$6),clock_timestamp()-make_interval(secs=>$7) from generate_series(1,$5)`,[event,users[0],session.id,status,count,startedAge,finishedAge]);
    await addEvent('permissions');
    try { await state('permissions',users[5]); throw Error('Nonmember admitted'); } catch(e) { ensure(String(e).includes('AI_NOT_MEMBER'),'Membership not enforced'); }
    await addEvent('attempts'); await seed('attempts',40,'failed',1790);
    let s=await state('attempts'); ensure(s.code==='AI_USER_ATTEMPT_LIMIT' && s.retry_after_seconds>0 && s.retry_after_seconds<=10,'40 failed attempts not blocked/timed');
    ensure((await reserve('attempts')).code==='AI_USER_ATTEMPT_LIMIT','Blocked attempt dispatched');
    await admin("update public.ai_stamp_jobs set started_at=clock_timestamp()-interval '30 minutes' where event_id='attempts'");
    s=await state('attempts'); ensure(s.status==='ready' && s.attempts_remaining===40,'Exact 30-minute boundary did not expire attempts');
    await addEvent('successes'); await seed('successes',15,'succeeded',1801,60);
    s=await state('successes'); ensure(s.code==='AI_USER_LIMIT' && s.attempts_remaining===40 && s.remaining===0,'Success window must use completion timestamps');
    await admin("update public.ai_stamp_jobs set finished_at=clock_timestamp()-interval '30 minutes' where event_id='successes'");
    ensure((await state('successes')).status==='ready','Successful allowance failed to replenish');
    await addEvent('overfull'); await seed('overfull',45);
    await admin("with ranked as (select id,row_number() over(order by id) as n from public.ai_stamp_jobs where event_id='overfull') update public.ai_stamp_jobs j set started_at=clock_timestamp()-interval '30 minutes'+ranked.n*interval '10 seconds' from ranked where j.id=ranked.id");
    s=await state('overfull'); ensure(s.retry_after_seconds>=59 && s.retry_after_seconds<=60,'Overfull window must expire enough requests, not just its oldest');
    await addEvent('both'); await seed('both',15,'succeeded',1790,1700); await seed('both',25,'failed',1600);
    s=await state('both'); ensure(s.code==='AI_USER_ATTEMPT_LIMIT' && s.retry_after_seconds>=99 && s.retry_after_seconds<=100,'Refill timer must cover both rolling limits');
    await addEvent('failed'); const failed=crypto.randomUUID(); await reserve('failed',users[0],failed); await finish(failed,'failed');
    s=await state('failed'); ensure(s.remaining===15 && s.attempts_remaining===39 && s.code==='AI_COOLDOWN' && s.retry_after_seconds<=30,'Moderation failure consumed success or lost cooldown');
    ensure(Number((await admin("select estimated_committed_usd from public.ai_stamp_events where id='failed'")).rows[0].estimated_committed_usd)===.05,'Failed debit refunded');
    await addEvent('concurrent'); const ids=[crypto.randomUUID(),crypto.randomUUID()];
    const pair=await Promise.all(ids.map(id=>reserve('concurrent',users[0],id)));
    ensure(pair.filter(x=>x.status==='admitted').length===1 && pair.some(x=>x.code==='AI_USER_ACTIVE'),'Two active jobs admitted');
    const active=ids[pair.findIndex(x=>x.status==='admitted')]; ensure((await reserve('concurrent',users[0],active)).status==='running','Duplicate dispatched again');
    const forged=args('concurrent',users[1],active); await denied(reserveSql,forged);
    await admin("update public.ai_stamp_jobs set started_at=clock_timestamp()-interval '40 minutes' where id=$1",[active]);
    ensure((await reserve('concurrent')).code==='AI_USER_ACTIVE','Old uncertain generation expired automatically');
    await finish(active,'failed'); ensure(await finish(active,'failed')===false,'Duplicate finalization changed history');
    ensure((await state('concurrent')).status==='ready','Reconciled old active job blocked rolling allowance');
    await addEvent('event'); await seed('event',149,'succeeded',1900);
    const eventPair=await Promise.all([reserve('event',users[1]),reserve('event',users[2])]);
    ensure(eventPair.filter(x=>x.status==='admitted').length===1 && eventPair.some(x=>x.code==='AI_EVENT_LIMIT'),'Cumulative 150-event ceiling bypassed');
    s=await state('event'); ensure(s.code==='AI_EVENT_LIMIT' && !s.retry_after_seconds,'Event limit misleadingly replenished');
    await addEvent('event-attempts'); await seed('event-attempts',500,'failed',1900);
    ensure((await state('event-attempts')).code==='AI_EVENT_ATTEMPT_LIMIT','Event attempt ceiling reset');
    await addEvent('budget'); await admin("update public.ai_stamp_events set budget_usd=.05 where id='budget'");
    const budgetPair=await Promise.all([reserve('budget',users[3]),reserve('budget',users[4])]);
    ensure(budgetPair.filter(x=>x.status==='admitted').length===1 && budgetPair.some(x=>x.code==='AI_BUDGET_LIMIT'),'Concurrent budget overspend');
    await admin("update public.ai_stamp_jobs set started_at=clock_timestamp()-interval '40 minutes' where event_id='budget'");
    s=await state('budget'); ensure(s.code==='AI_BUDGET_LIMIT' && !s.retry_after_seconds,'Event budget reset with user window');
    output.textContent='PASS: '+checks+' PostgreSQL assertions: rolling boundaries, expired/failed attempts, completion-time successes, automatic replenishment, one active user, duplicate IDs, concurrent admission queues, cumulative 150/event and attempt caps, retained failure debits, budget exhaustion, RLS/membership and migration preservation. No OpenAI calls. PGlite uses one connection; live multi-connection checks are separate.';
  } finally { await db.close(); }
}
void check().catch(e=>{output.textContent='FAIL: '+String(e);console.error(e);});
