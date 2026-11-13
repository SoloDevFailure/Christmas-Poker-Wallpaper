begin;
-- Preserve every existing job, reservation debit, outcome and timestamp.
alter table public.ai_stamp_events drop constraint ai_stamp_events_success_limit_check,
 drop constraint ai_stamp_events_user_success_limit_check, drop constraint ai_stamp_events_user_attempt_limit_check;
alter table public.ai_stamp_events add constraint ai_stamp_events_success_limit_check check(success_limit between 1 and 10000),
 add constraint ai_stamp_events_user_success_limit_check check(user_success_limit between 1 and 1000),
 add constraint ai_stamp_events_user_attempt_limit_check check(user_attempt_limit between 1 and 1000);
alter table public.ai_stamp_events alter column success_limit set default 150,
 alter column user_success_limit set default 15, alter column user_attempt_limit set default 40,
 alter column attempt_limit set default 500, alter column budget_usd set default 4,
 alter column attempt_reserve_usd set default .05;
update public.ai_stamp_events set success_limit=150,user_success_limit=15,user_attempt_limit=40,
 attempt_limit=500,budget_usd=4,attempt_reserve_usd=.05 where id='christmas-poker-2026';
create index ai_stamp_user_success_window on public.ai_stamp_jobs(event_id,user_id,finished_at) where status='succeeded';

-- Private, read-only status RPC. Identity/membership is still verified by the
-- Edge Function and this RPC; only service_role can execute it. A status read
-- is advisory. reserve_ai_stamp locks the event row before using this result.
create function public.ai_stamp_allowance(p_event text,p_user uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ai_stamp_events; t timestamptz:=clock_timestamp(); boundary timestamptz;
 user_attempts integer; user_successes integer; event_attempts integer; event_slots integer;
 active_jobs integer; next_attempt timestamptz; next_success timestamptz; cooldown_until timestamptz;
 ready_at timestamptz; code text; result jsonb;
begin
 select * into e from public.ai_stamp_events where id=p_event;
 if e.id is null then raise exception 'AI_EVENT_DISABLED'; end if;
 if not exists(select 1 from public.wallpaper_members m join public.wallpaper_sessions s on s.id=m.session_id
   where m.session_id=p_session and m.user_id=p_user and s.status='active') then
  raise exception 'AI_NOT_MEMBER' using errcode='42501';
 end if;
 boundary:=t-interval '30 minutes';
 select count(*) into user_attempts from public.ai_stamp_jobs
  where event_id=p_event and user_id=p_user and started_at>boundary;
 select count(*) into user_successes from public.ai_stamp_jobs
  where event_id=p_event and user_id=p_user and status='succeeded' and finished_at>boundary;
 select count(*),count(*) filter(where status in ('running','unknown','succeeded')),
  count(*) filter(where status in ('running','unknown')) into event_attempts,event_slots,active_jobs
  from public.ai_stamp_jobs where event_id=p_event;
 if user_attempts>=e.user_attempt_limit then
  select started_at+interval '30 minutes' into next_attempt from public.ai_stamp_jobs
   where event_id=p_event and user_id=p_user and started_at>boundary
   order by started_at offset (user_attempts-e.user_attempt_limit) limit 1;
 end if;
 if user_successes>=e.user_success_limit then
  select finished_at+interval '30 minutes' into next_success from public.ai_stamp_jobs
   where event_id=p_event and user_id=p_user and status='succeeded' and finished_at>boundary
   order by finished_at offset (user_successes-e.user_success_limit) limit 1;
 end if;
 select max(started_at)+make_interval(secs=>e.cooldown_seconds) into cooldown_until
  from public.ai_stamp_jobs where event_id=p_event and user_id=p_user;
 ready_at:=greatest(t,next_attempt,next_success,cooldown_until);
 -- Permanent/event/uncertain blocks take precedence: no misleading reset timer.
 if not e.enabled then code:='AI_EVENT_DISABLED';
 elsif exists(select 1 from public.ai_stamp_jobs where user_id=p_user and status in ('running','unknown')) then code:='AI_USER_ACTIVE';
 elsif event_slots>=e.success_limit then code:='AI_EVENT_LIMIT';
 elsif event_attempts>=e.attempt_limit then code:='AI_EVENT_ATTEMPT_LIMIT';
 elsif e.estimated_committed_usd+e.attempt_reserve_usd>e.budget_usd then code:='AI_BUDGET_LIMIT';
 elsif active_jobs>=e.active_limit then code:='AI_EVENT_BUSY';
 elsif next_attempt is not null then code:='AI_USER_ATTEMPT_LIMIT';
 elsif next_success is not null then code:='AI_USER_LIMIT';
 elsif cooldown_until>t then code:='AI_COOLDOWN';
 end if;
 result:=jsonb_build_object('status',case when code is null then 'ready' else 'blocked' end,
  'code',code,'remaining',greatest(0,e.user_success_limit-user_successes),
  'attempts_remaining',greatest(0,e.user_attempt_limit-user_attempts),'server_time',t);
 if code in ('AI_USER_ATTEMPT_LIMIT','AI_USER_LIMIT','AI_COOLDOWN') then
  result:=result||jsonb_build_object('retry_at',ready_at,'retry_after_seconds',greatest(1,ceil(extract(epoch from ready_at-t))::integer));
 end if;
 return result;
end $$;

create or replace function public.reserve_ai_stamp(p_event text,p_user uuid,p_session uuid,p_request uuid,p_hash text,p_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ai_stamp_events; j public.ai_stamp_jobs; allowance jsonb;
begin
 -- All admissions, completions and cumulative debits serialize on this row.
 select * into e from public.ai_stamp_events where id=p_event for update;
 if e.id is null then raise exception 'AI_EVENT_DISABLED'; end if;
 if not exists(select 1 from public.wallpaper_members m join public.wallpaper_sessions s on s.id=m.session_id
   where m.session_id=p_session and m.user_id=p_user and s.status='active') then
  raise exception 'AI_NOT_MEMBER' using errcode='42501';
 end if;
 select * into j from public.ai_stamp_jobs where id=p_request;
 if j.id is not null then
  if j.user_id<>p_user or j.event_id<>p_event or j.session_id<>p_session or j.source_hash<>p_hash then
   raise exception 'AI_REQUEST_CONFLICT' using errcode='42501';
  end if;
  return jsonb_build_object('status',j.status);
 end if;
 update public.ai_stamp_jobs set status='unknown',error_code='worker_expired'
  where event_id=p_event and status='running' and started_at<clock_timestamp()-interval '3 minutes';
 allowance:=public.ai_stamp_allowance(p_event,p_user,p_session);
 if allowance->>'status'<>'ready' then return allowance; end if;
 insert into public.ai_stamp_jobs(id,event_id,user_id,session_id,source_hash,model,reserved_usd)
  values(p_request,p_event,p_user,p_session,p_hash,p_model,e.attempt_reserve_usd);
 update public.ai_stamp_events set estimated_committed_usd=estimated_committed_usd+e.attempt_reserve_usd where id=p_event;
 return allowance||jsonb_build_object('status','admitted','remaining',(allowance->>'remaining')::integer-1,
  'attempts_remaining',(allowance->>'attempts_remaining')::integer-1);
end $$;
revoke all on function public.ai_stamp_allowance(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_stamp_allowance(text,uuid,uuid) to service_role;
-- CREATE OR REPLACE retains the existing service-role-only reservation grants.
notify pgrst,'reload schema';
commit;
