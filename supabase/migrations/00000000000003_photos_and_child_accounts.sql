-- Photos for parents, babysitters and children (private Storage bucket),
-- and a 'child' login that sees only who is with her / picking her up.

-- Photo columns (path inside the private 'photos' bucket; see below).
alter table public.babysitters rename column photo_url to photo_path;
alter table public.children  add column photo_path text;
alter table public.app_users add column photo_path text;   -- parents' own photo

-- ---------------------------------------------------------------------------
-- Child accounts
-- ---------------------------------------------------------------------------

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in ('parent', 'babysitter', 'child'));

alter table public.app_users
  add column child_id uuid unique references public.children(id) on delete set null,
  add constraint child_role_has_link
    check (role is distinct from 'child' or child_id is not null);

create or replace function public.my_child_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select child_id from public.app_users
  where id = auth.uid() and role = 'child';
$$;

-- A child reads her own row only. She has NO direct access to shifts or
-- babysitters (those rows hold rates); she gets child_upcoming_shifts() instead.
create policy child_self on public.children for select using (id = public.my_child_id());

-- What the child sees: confirmed shifts from now to 7 days ahead —
-- who is coming, when, her phone and photo, and whether she picks her up.
create or replace function public.child_upcoming_shifts()
returns table (
  shift_id          uuid,
  start_at          timestamptz,
  end_at            timestamptz,
  babysitter_id     uuid,
  babysitter_name   text,
  babysitter_phone  text,
  babysitter_photo  text,
  pickup_by         text,
  pickup_location   text,
  pickup_time       time
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.start_at, s.end_at,
         b.id, b.full_name, b.phone, b.photo_path,
         s.pickup_by, ss.pickup_location, ss.end_time
    from public.shifts s
    join public.babysitters b on b.id = s.babysitter_id
    left join public.school_schedule ss
           on ss.child_id = public.my_child_id()
          and ss.weekday = extract(dow from s.start_at at time zone 'Asia/Jerusalem')::smallint
   where public.my_child_id() is not null
     and s.status = 'confirmed'
     and s.end_at   > now()
     and s.start_at < now() + interval '7 days'
   order by s.start_at;
$$;

grant execute on function public.child_upcoming_shifts() to authenticated;

-- Can the current child see this babysitter's photo? (only one coming soon)
create or replace function public.child_can_see_sitter(p_sitter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.child_upcoming_shifts() u where u.babysitter_id = p_sitter);
$$;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
-- Stored in the private bucket 'photos' at:
--   parents/<auth user id>.jpg   babysitters/<babysitter id>.jpg   children/<child id>.jpg
-- The column holds that path; the app shows it through a short-lived signed URL.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Which top-level folder and which id an object path refers to.
create or replace function public.photo_owner_id(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(split_part(p_name, '/', 2), '.', 1) ~ '^[0-9a-f-]{36}$'
    then split_part(split_part(p_name, '/', 2), '.', 1)::uuid
  end;
$$;

-- Parents: everything in the bucket.
create policy photos_parent_all on storage.objects for all
  using (bucket_id = 'photos' and public.is_parent())
  with check (bucket_id = 'photos' and public.is_parent());

-- Babysitter: upload / replace / read her own photo.
create policy photos_sitter_own on storage.objects for all
  using (bucket_id = 'photos'
         and split_part(name, '/', 1) = 'babysitters'
         and public.photo_owner_id(name) = public.my_babysitter_id())
  with check (bucket_id = 'photos'
         and split_part(name, '/', 1) = 'babysitters'
         and public.photo_owner_id(name) = public.my_babysitter_id());

-- Babysitter: the girls' and parents' photos, only around a confirmed shift.
create policy photos_sitter_family on storage.objects for select
  using (bucket_id = 'photos'
         and split_part(name, '/', 1) in ('children', 'parents')
         and public.has_active_shift());

-- Child: her own photo, and the photo of a babysitter coming in the next 7 days.
create policy photos_child on storage.objects for select
  using (bucket_id = 'photos' and public.my_child_id() is not null and (
          (split_part(name, '/', 1) = 'children'    and public.photo_owner_id(name) = public.my_child_id())
       or (split_part(name, '/', 1) = 'babysitters' and public.child_can_see_sitter(public.photo_owner_id(name)))
        ));

-- Parents' own app_users row: a parent may set any photo_path (covered by parent_all).
