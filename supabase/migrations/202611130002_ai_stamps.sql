begin;
create table public.ai_stamp_events (
 id text primary key,
 enabled boolean not null default false,
 success_limit integer not null default 100 check(success_limit between 1 and 100),
 user_success_limit integer not null default 5 check(user_success_limit between 1 and 5),
 attempt_limit integer not null default 150 check(attempt_limit between 1 and 500),
 user_attempt_limit integer not null default 10 check(user_attempt_limit between 1 and 20),
 active_limit integer not null default 3 check(active_limit between 1 and 5),
 cooldown_seconds integer not null default 30 check(cooldown_seconds between 10 and 3600),
 budget_usd numeric(10,4) not null default 10 check(budget_usd>=0),
 attempt_reserve_usd numeric(10,4) not null default .10 check(attempt_reserve_usd>0),
 estimated_committed_usd numeric(10,4) not null default 0 check(estimated_committed_usd>=0)
);
create table public.ai_stamp_jobs (
 id uuid primary key,
 event_id text not null references public.ai_stamp_events(id),
 user_id uuid not null references auth.users(id),
 session_id uuid not null references public.wallpaper_sessions(id),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 model text not null,
 status text not null default 'running' check(status in ('running','succeeded','failed','unknown')),
 reserved_usd numeric(10,4) not null,
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 error_code text,
 usage jsonb
);
create unique index ai_stamp_one_active_user on public.ai_stamp_jobs(user_id) where status in ('running','unknown');
create index on public.ai_stamp_jobs(event_id,user_id,started_at);
alter table public.ai_stamp_events enable row level security;
alter table public.ai_stamp_jobs enable row level security;
revoke all on public.ai_stamp_events,public.ai_stamp_jobs from public,anon,authenticated;
-- No photo/output blobs or API credentials are stored in these tables.
insert into public.ai_stamp_events(id) values('christmas-poker-2026');

create function public.reserve_ai_stamp(p_event text,p_user uuid,p_session uuid,p_request uuid,p_hash text,p_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ai_stamp_events; j public.ai_stamp_jobs; user_slots integer; event_slots integer; user_attempts integer; event_attempts integer;
begin
 -- Only the Edge Function's service role can execute. User identity is validated
 -- through Auth by the Edge Function, never read from a browser-supplied owner ID.
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
 if not e.enabled then raise exception 'AI_EVENT_DISABLED'; end if;
 -- A crashed worker's upstream outcome is unknown. Keep its slot, active-user
 -- lock and spending reservation until an administrator reconciles it.
 update public.ai_stamp_jobs set status='unknown',error_code='worker_expired'
  where event_id=p_event and status='running' and started_at<clock_timestamp()-interval '3 minutes';
 if exists(select 1 from public.ai_stamp_jobs where user_id=p_user and status in ('running','unknown')) then
  raise exception 'AI_USER_ACTIVE';
 end if;
 if (select count(*) from public.ai_stamp_jobs where event_id=p_event and status in ('running','unknown'))>=e.active_limit then
  raise exception 'AI_EVENT_BUSY';
 end if;
 select count(*),count(*) filter(where status in ('running','unknown','succeeded')) into user_attempts,user_slots
  from public.ai_stamp_jobs where event_id=p_event and user_id=p_user;
 select count(*),count(*) filter(where status in ('running','unknown','succeeded')) into event_attempts,event_slots
  from public.ai_stamp_jobs where event_id=p_event;
 if user_slots>=e.user_success_limit then raise exception 'AI_USER_LIMIT'; end if;
 if event_slots>=e.success_limit then raise exception 'AI_EVENT_LIMIT'; end if;
 if user_attempts>=e.user_attempt_limit or event_attempts>=e.attempt_limit then raise exception 'AI_ATTEMPT_LIMIT'; end if;
 if exists(select 1 from public.ai_stamp_jobs where event_id=p_event and user_id=p_user
   and started_at>clock_timestamp()-make_interval(secs=>e.cooldown_seconds)) then raise exception 'AI_COOLDOWN'; end if;
 -- Each admitted attempt is debited, including failed/uncertain requests.
 -- This is an estimated spending stop, not an OpenAI billing hard cap.
 if e.estimated_committed_usd+e.attempt_reserve_usd>e.budget_usd then raise exception 'AI_BUDGET_LIMIT'; end if;
 insert into public.ai_stamp_jobs(id,event_id,user_id,session_id,source_hash,model,reserved_usd)
  values(p_request,p_event,p_user,p_session,p_hash,p_model,e.attempt_reserve_usd);
 update public.ai_stamp_events set estimated_committed_usd=estimated_committed_usd+e.attempt_reserve_usd where id=p_event;
 return jsonb_build_object('status','admitted','remaining',e.user_success_limit-user_slots-1);
end $$;

create function public.finish_ai_stamp(p_request uuid,p_status text,p_error text default null,p_usage jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare event text; j public.ai_stamp_jobs;
begin
 if p_status not in ('succeeded','failed','unknown') then raise exception 'Invalid outcome'; end if;
 select event_id into event from public.ai_stamp_jobs where id=p_request;
 perform 1 from public.ai_stamp_events where id=event for update;
 select * into j from public.ai_stamp_jobs where id=p_request for update;
 if j.id is null then raise exception 'Unknown AI request'; end if;
 if j.status not in ('running','unknown') then return false; end if;
 update public.ai_stamp_jobs set status=p_status,finished_at=clock_timestamp(),error_code=left(p_error,80),usage=p_usage where id=p_request;
 return true;
end $$;
revoke all on function public.reserve_ai_stamp(text,uuid,uuid,uuid,text,text),public.finish_ai_stamp(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_ai_stamp(text,uuid,uuid,uuid,text,text),public.finish_ai_stamp(uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
