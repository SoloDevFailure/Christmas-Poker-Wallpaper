-- Run after 202611110002_custom_stamps.sql, before deploying the new controller.
begin;
lock table public.wallpaper_stamps in share row exclusive mode;
-- Keep immutable creation history after artwork deletion. Never store photo pixels here.
-- Clients cannot read/write this table; all eligibility is derived from auth.uid().
create table public.wallpaper_stamp_history (
 stamp_id uuid primary key,
 session_id uuid not null references public.wallpaper_sessions(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 sequence bigint not null unique,
 removed_at timestamptz
);
create index on public.wallpaper_stamp_history(session_id,created_by,sequence desc);
alter table public.wallpaper_stamp_history enable row level security;
revoke all on public.wallpaper_stamp_history from public,anon,authenticated;

insert into public.wallpaper_stamp_history(stamp_id,session_id,created_by,sequence)
 select id,session_id,created_by,sequence from public.wallpaper_stamps;

create function public.track_wallpaper_stamp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' and TG_WHEN='BEFORE' then
  if auth.uid() is null or not public.wallpaper_member(new.session_id) then
   raise exception 'Join this wallpaper first' using errcode='42501';
  end if;
  -- Ignore any supplied creator: the authenticated principal owns the stamp.
  new.created_by:=auth.uid();
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text||':'||auth.uid()::text,0));
  if exists(select 1 from public.wallpaper_stamp_history where stamp_id=new.id) then
   raise exception 'Stamp ID already used' using errcode='23505';
  end if;
  return new;
 elsif TG_OP='INSERT' then
  insert into public.wallpaper_stamp_history(stamp_id,session_id,created_by,sequence)
   values(new.id,new.session_id,new.created_by,new.sequence);
  return new;
 else
  update public.wallpaper_stamp_history set removed_at=clock_timestamp() where stamp_id=old.id;
  return old;
 end if;
end $$;
revoke all on function public.track_wallpaper_stamp() from public,anon,authenticated;
create trigger wallpaper_stamp_owner before insert on public.wallpaper_stamps
 for each row execute function public.track_wallpaper_stamp();
create trigger wallpaper_stamp_history_insert after insert on public.wallpaper_stamps
 for each row execute function public.track_wallpaper_stamp();
create trigger wallpaper_stamp_history_delete after delete on public.wallpaper_stamps
 for each row execute function public.track_wallpaper_stamp();

create function public.wallpaper_undo_history(target uuid) returns table(id uuid,sequence bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.wallpaper_member(target) then
  raise exception 'Join this wallpaper first' using errcode='42501';
 end if;
 return query
  select h.stamp_id,h.sequence from (
   -- LIMIT comes BEFORE removing tombstones: deleted stamps never expose older ones.
   select x.stamp_id,x.sequence,x.removed_at from public.wallpaper_stamp_history x
   where x.session_id=target and x.created_by=auth.uid() order by x.sequence desc limit 5
  ) h join public.wallpaper_stamps s on s.id=h.stamp_id
  where h.removed_at is null order by h.sequence desc;
end $$;

create function public.undo_wallpaper_stamp(target uuid,stamp_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare newest uuid; entry public.wallpaper_stamp_history; deleted_count integer;
begin
 if auth.uid() is null or not public.wallpaper_member(target) then
  raise exception 'Join this wallpaper first' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||':'||auth.uid()::text,0));
 select * into entry from public.wallpaper_stamp_history h
  where h.stamp_id=undo_wallpaper_stamp.stamp_id and h.session_id=target and h.created_by=auth.uid();
 if entry.stamp_id is null then raise exception 'This stamp does not belong to you' using errcode='42501'; end if;
 -- Retrying a successful delete is harmless; never delete the next stamp by accident.
 if entry.removed_at is not null then return false; end if;
 select h.id into newest from public.wallpaper_undo_history(target) h limit 1;
 if newest is distinct from stamp_id then
  raise exception 'Undo history changed. Refresh and try again.' using errcode='40001';
 end if;
 delete from public.wallpaper_stamps s where s.id=stamp_id and s.session_id=target and s.created_by=auth.uid();
 get diagnostics deleted_count = row_count;
 return deleted_count=1;
end $$;
revoke all on function public.wallpaper_undo_history(uuid),public.undo_wallpaper_stamp(uuid,uuid) from public,anon;
grant execute on function public.wallpaper_undo_history(uuid),public.undo_wallpaper_stamp(uuid,uuid) to authenticated;
-- Direct DELETE/UPDATE remain forbidden, even for a stamp's creator.
notify pgrst,'reload schema';
commit;
