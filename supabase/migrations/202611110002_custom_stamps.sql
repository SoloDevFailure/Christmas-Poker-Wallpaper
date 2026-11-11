-- Additive migration: existing preset stamps and RLS remain unchanged.
begin;
alter table public.wallpaper_stamps
  add column if not exists image_data text,
  add column if not exists image_width integer,
  add column if not exists image_height integer;

create or replace function public.valid_wallpaper_png(data text, width integer, height integer)
returns boolean language plpgsql immutable strict set search_path='' as $$
declare payload bytea; png_width bigint; png_height bigint;
begin
  if width<1 or width>512 or height<1 or height>256 or length(data)>65536
     or data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  payload:=decode(substring(data from 23),'base64');
  if octet_length(payload)<45 then return false; end if;
  if substring(payload from 1 for 8)<>decode('89504e470d0a1a0a','hex')
     or substring(payload from 13 for 4)<>decode('49484452','hex') then return false; end if;
  png_width:=get_byte(payload,16)::bigint*16777216+get_byte(payload,17)*65536+get_byte(payload,18)*256+get_byte(payload,19);
  png_height:=get_byte(payload,20)::bigint*16777216+get_byte(payload,21)*65536+get_byte(payload,22)*256+get_byte(payload,23);
  return png_width=width and png_height=height;
exception when others then return false;
end $$;
revoke all on function public.valid_wallpaper_png(text,integer,integer) from public,anon;
grant execute on function public.valid_wallpaper_png(text,integer,integer) to authenticated;
alter table public.wallpaper_stamps drop constraint if exists wallpaper_stamps_stamp_type_check;
alter table public.wallpaper_stamps add constraint wallpaper_stamps_stamp_type_check
  check(stamp_type in ('star','tree','eggplant','custom'));
alter table public.wallpaper_stamps drop constraint if exists wallpaper_stamps_image_check;
alter table public.wallpaper_stamps add constraint wallpaper_stamps_image_check check (
  (stamp_type<>'custom' and image_data is null and image_width is null and image_height is null)
  or (stamp_type='custom' and coalesce(public.valid_wallpaper_png(image_data,image_width,image_height),false))
);
grant insert(image_data,image_width,image_height) on public.wallpaper_stamps to authenticated;
notify pgrst,'reload schema';
commit;
