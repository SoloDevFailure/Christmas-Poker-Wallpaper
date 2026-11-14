begin;
create table public.personal_stamps (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 label text not null check(length(label) between 1 and 80),
 kind text not null check(kind in ('ai','drawing','photo','text')),
 width integer not null check(width between 1 and 512), height integer not null check(height between 1 and 256),
 bytes integer not null check(bytes between 1 and 49134),
 state text not null default 'pending' check(state in ('pending','ready','deleting','deleted')),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 object_path text generated always as (owner_id::text||'/'||id::text||'.png') stored
);
create unique index personal_stamps_unique_content on public.personal_stamps(owner_id,sha256) where state<>'deleted';
create index personal_stamps_owner on public.personal_stamps(owner_id,created_at desc);
alter table public.personal_stamps enable row level security;
revoke all on public.personal_stamps from public,anon,authenticated;
grant select on public.personal_stamps to authenticated;
create policy personal_stamps_read on public.personal_stamps for select to authenticated using(owner_id=(select auth.uid()) and state<>'deleted');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('personal-stamps','personal-stamps',false,49134,array['image/png']);
create policy personal_stamp_objects_read on storage.objects for select to authenticated using(
 bucket_id='personal-stamps' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.personal_stamps p where p.owner_id=(select auth.uid()) and p.object_path=name and p.state='ready')
);
-- Upload/delete are deliberately not granted to clients. The authenticated Edge
-- handler decodes bounded PNG pixels, derives ownership, then invokes these RPCs.
create function public.reserve_personal_stamp(p_owner uuid,p_hash text,p_label text,p_kind text,p_width integer,p_height integer,p_bytes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.personal_stamps; total integer; used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,7321));
 select * into item from public.personal_stamps where owner_id=p_owner and sha256=p_hash and state<>'deleted';
 if item.id is not null then
  if item.state='deleting' then raise exception 'Deletion is in progress. Retry shortly.'; end if;
  return to_jsonb(item);
 end if;
 select count(*),coalesce(sum(bytes),0) into total,used from public.personal_stamps where owner_id=p_owner and state<>'deleted';
 if total>=100 or used+p_bytes>5242880 then raise exception 'My Stamps is full (100 stamps / 5 MiB). Delete an old stamp and retry.'; end if;
 insert into public.personal_stamps(owner_id,sha256,label,kind,width,height,bytes) values(p_owner,p_hash,p_label,p_kind,p_width,p_height,p_bytes) returning * into item;
 return to_jsonb(item);
end $$;
create function public.finish_personal_stamp(p_owner uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.personal_stamps set state='ready',updated_at=clock_timestamp() where owner_id=p_owner and id=p_id and state='pending';
 return exists(select 1 from public.personal_stamps where owner_id=p_owner and id=p_id and state='ready');
end $$;
create function public.delete_personal_stamp(p_owner uuid,p_id uuid,p_finish boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare item public.personal_stamps;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,7321));
 select * into item from public.personal_stamps where owner_id=p_owner and id=p_id for update;
 if item.id is null then raise exception 'Stamp not found in your library.'; end if;
 if item.state='deleted' then return item.object_path; end if;
 update public.personal_stamps set state=case when p_finish then 'deleted' else 'deleting' end,updated_at=clock_timestamp() where id=item.id;
 return item.object_path;
end $$;
revoke all on function public.reserve_personal_stamp(uuid,text,text,text,integer,integer,integer),public.finish_personal_stamp(uuid,uuid),public.delete_personal_stamp(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_personal_stamp(uuid,text,text,text,integer,integer,integer),public.finish_personal_stamp(uuid,uuid),public.delete_personal_stamp(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
