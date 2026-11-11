-- Run in Supabase SQL Editor or via `supabase db push`.
begin;
create table public.wallpaper_sessions (
 id uuid primary key default gen_random_uuid(),
 join_code text not null unique default replace(gen_random_uuid()::text,'-',''),
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 status text not null default 'active' check(status in ('active','closed'))
);
create table public.wallpaper_members (
 session_id uuid not null references public.wallpaper_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(session_id,user_id)
);
create index on public.wallpaper_members(user_id);
create table public.wallpaper_stamps (
 id uuid primary key,
 session_id uuid not null references public.wallpaper_sessions(id) on delete cascade,
 created_by uuid not null default auth.uid() references auth.users(id),
 stamp_type text not null check(stamp_type in ('star','tree','eggplant')),
 position_x double precision not null check(position_x>=0 and position_x<=1),
 position_y double precision not null check(position_y>=0 and position_y<=1),
 scale double precision not null check(scale>=32 and scale<=600),
 rotation double precision not null check(rotation>=-360 and rotation<=360),
 created_at timestamptz not null default now(),
 sequence bigint generated always as identity unique
);
create index on public.wallpaper_stamps(session_id,sequence);
alter table public.wallpaper_sessions enable row level security;
alter table public.wallpaper_members enable row level security;
alter table public.wallpaper_stamps enable row level security;

create function public.wallpaper_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wallpaper_members m
 join public.wallpaper_sessions s on s.id=m.session_id
 where m.session_id=target and m.user_id=auth.uid() and s.status='active');
$$;
create policy session_read on public.wallpaper_sessions for select to authenticated using(public.wallpaper_member(id));
create policy own_membership on public.wallpaper_members for select to authenticated using(user_id=auth.uid());
create policy stamps_read on public.wallpaper_stamps for select to authenticated using(public.wallpaper_member(session_id));
create policy stamps_insert on public.wallpaper_stamps for insert to authenticated with check(public.wallpaper_member(session_id) and created_by=auth.uid());
-- No direct session/member writes, stamp edits or stamp deletes are permitted.
revoke all on public.wallpaper_sessions,public.wallpaper_members,public.wallpaper_stamps from anon,authenticated;
grant select on public.wallpaper_sessions,public.wallpaper_members,public.wallpaper_stamps to authenticated;
grant insert(id,session_id,stamp_type,position_x,position_y,scale,rotation) on public.wallpaper_stamps to authenticated;
grant usage on sequence public.wallpaper_stamps_sequence_seq to authenticated;

create function public.create_wallpaper() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.wallpaper_sessions;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 insert into public.wallpaper_sessions(owner_id) values(auth.uid()) returning * into s;
 insert into public.wallpaper_members(session_id,user_id) values(s.id,auth.uid());
 return to_jsonb(s);
end $$;
create function public.join_wallpaper(code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.wallpaper_sessions;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into s from public.wallpaper_sessions where join_code=code and status='active';
 if s.id is null then raise exception 'Invalid or closed session'; end if;
 insert into public.wallpaper_members(session_id,user_id) values(s.id,auth.uid()) on conflict do nothing;
 return to_jsonb(s);
end $$;
create function public.reset_wallpaper(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wallpaper_sessions where id=target and owner_id=auth.uid()) then raise exception 'Only the session owner can reset artwork'; end if;
 delete from public.wallpaper_stamps where session_id=target;
end $$;
revoke all on function public.wallpaper_member(uuid),public.create_wallpaper(),public.join_wallpaper(text),public.reset_wallpaper(uuid) from public,anon;
grant execute on function public.wallpaper_member(uuid),public.create_wallpaper(),public.join_wallpaper(text),public.reset_wallpaper(uuid) to authenticated;

-- Private broadcast: possession of a channel name alone does not grant access.
create policy wallpaper_broadcast_read on realtime.messages for select to authenticated
 using(extension='broadcast' and exists(select 1 from public.wallpaper_members m
 where m.user_id=auth.uid() and realtime.topic()='wallpaper:'||m.session_id::text
 and public.wallpaper_member(m.session_id)));
create policy wallpaper_broadcast_write on realtime.messages for insert to authenticated
 with check(extension='broadcast' and exists(select 1 from public.wallpaper_members m
 where m.user_id=auth.uid() and realtime.topic()='wallpaper:'||m.session_id::text
 and public.wallpaper_member(m.session_id)));
alter publication supabase_realtime add table public.wallpaper_stamps;
commit;
