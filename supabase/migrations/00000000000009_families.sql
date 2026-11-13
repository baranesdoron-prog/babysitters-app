-- Several families on one system. Every row belongs to a family; a parent sees
-- and changes only their own family's rows. The system admin (app_users.is_admin)
-- creates families and invites their first parent; after that the family's
-- parents add each other (manage-login), with no approval step.
-- Everything that exists today becomes the first family.

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  created_at  timestamptz not null default now()
);
alter table public.families enable row level security;

insert into public.families (name) values ('המשפחה הראשונה');

-- Which family a login belongs to (null only for a login without a role yet).
alter table public.app_users
  add column family_id uuid references public.families(id) on delete restrict;
update public.app_users set family_id = (select id from public.families) where role is not null;

create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.app_users where id = auth.uid();
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.app_users where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- family_id on every family table, filled for today's rows, defaulted on insert
-- from the signed-in user, and the parent policy scoped to the family.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  first_family uuid := (select id from public.families);
begin
  foreach t in array array[
    'babysitters', 'availability', 'children', 'contacts', 'activities',
    'school_schedule', 'shifts', 'shift_requests', 'item_templates',
    'shift_items', 'payments', 'settings'
  ] loop
    execute format('alter table public.%I add column family_id uuid references public.families(id) on delete cascade', t);
    execute format('update public.%I set family_id = %L', t, first_family);
    execute format('alter table public.%I alter column family_id set not null, alter column family_id set default public.my_family_id()', t);
    execute format('create index %I on public.%I (family_id)', t || '_family_idx', t);
    execute format('drop policy parent_all on public.%I', t);
    execute format(
      'create policy parent_all on public.%I for all
         using (public.is_parent() and family_id = public.my_family_id())
         with check (public.is_parent() and family_id = public.my_family_id())', t);
  end loop;
end $$;

-- Settings: one row per family instead of one row in all.
alter table public.settings drop constraint settings_pkey;
alter table public.settings drop column id;
alter table public.settings add primary key (family_id);

drop policy sitter_read on public.settings;
create policy sitter_read on public.settings for select
  using (public.my_babysitter_id() is not null and family_id = public.my_family_id());

-- A babysitter sees the family's children details only around a confirmed
-- shift, and only her own family's.
do $$
declare t text;
begin
  foreach t in array array['children', 'contacts', 'activities', 'school_schedule'] loop
    execute format('drop policy sitter_read on public.%I', t);
    execute format(
      'create policy sitter_read on public.%I for select
         using (public.has_active_shift() and family_id = public.my_family_id())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- app_users: parents see their own family; the admin sees every family's parents
-- (names and usernames only, through the same rows). System fields can't be
-- changed from the app — only by the manage-login function (service role).
-- ---------------------------------------------------------------------------

drop policy parent_all on public.app_users;
create policy parent_family on public.app_users for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id());
create policy admin_read_parents on public.app_users for select
  using (public.is_system_admin() and role = 'parent');

create or replace function public.protect_app_user_system_fields()
returns trigger
language plpgsql
as $$
begin
  -- Two separate checks: SQL doesn't promise to evaluate `or` left to right.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.role          is distinct from old.role
  or new.family_id     is distinct from old.family_id
  or new.is_admin      is distinct from old.is_admin
  or new.babysitter_id is distinct from old.babysitter_id
  or new.child_id      is distinct from old.child_id
  or new.email         is distinct from old.email then
    raise exception 'role, family, admin, links and username are managed by the system';
  end if;
  return new;
end;
$$;

create trigger protect_app_user_system_fields
  before update on public.app_users
  for each row execute function public.protect_app_user_system_fields();

-- families: a parent reads their own; the admin manages all.
create policy family_read on public.families for select using (id = public.my_family_id());
create policy admin_all on public.families for all
  using (public.is_system_admin()) with check (public.is_system_admin());

-- ---------------------------------------------------------------------------
-- Functions that read across rows: keep them inside the family.
-- ---------------------------------------------------------------------------

-- The child's screen: only her own family's confirmed shifts.
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
     and s.family_id = public.my_family_id()
     and s.status = 'confirmed'
     and s.end_at   > now()
     and s.start_at < now() + interval '7 days'
   order by s.start_at;
$$;

-- Accepting a request: the car-seat item only for the shift's own family's children.
create or replace function public.respond_to_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.shift_requests;
begin
  select * into r from public.shift_requests
  where id = p_request and babysitter_id = public.my_babysitter_id() and status = 'sent'
  for update;
  if not found then
    raise exception 'request not found or no longer open';
  end if;

  update public.shift_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = r.id;

  if p_accept then
    update public.shifts
       set babysitter_id = r.babysitter_id, status = 'confirmed'
     where id = r.shift_id;

    insert into public.shift_items (shift_id, kind, description, child_id, family_id)
    select s.id, 'leave', 'להשאיר כיסא לאוטו', c.id, s.family_id
      from public.shifts s
      join public.babysitters b on b.id = r.babysitter_id
      join public.children c on c.needs_child_seat and c.family_id = s.family_id
     where s.id = r.shift_id
       and s.pickup_by = 'babysitter'
       and not b.has_child_seat
       and not exists (
         select 1 from public.shift_items i
          where i.shift_id = s.id and i.kind = 'leave' and i.description = 'להשאיר כיסא לאוטו'
       );
  end if;
end;
$$;

-- Payments: only the caller's family's shifts.
create or replace function public.record_payment(
  p_shift_ids uuid[],
  p_method    text,
  p_amount    numeric default null,
  p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sitter   uuid;
  v_count    int;
  v_sitters  int;
  v_total    numeric(8,2);
  v_payment  uuid;
  v_family   uuid := public.my_family_id();
begin
  if not public.is_parent() then
    raise exception 'only parents can record payments';
  end if;

  perform 1 from public.shifts where id = any(p_shift_ids) and family_id = v_family for update;

  select count(*), count(distinct babysitter_id), min(babysitter_id::text)::uuid,
         sum(coalesce(actual_amount, computed_amount, 0))
    into v_count, v_sitters, v_sitter, v_total
    from public.shifts
   where id = any(p_shift_ids) and payment_id is null and family_id = v_family;

  if v_count = 0 or v_count <> coalesce(array_length(p_shift_ids, 1), 0) then
    raise exception 'some shifts are missing or already paid';
  end if;
  if v_sitters <> 1 or v_sitter is null then
    raise exception 'all shifts must belong to the same babysitter';
  end if;

  insert into public.payments (babysitter_id, amount, method, notes, family_id)
  values (v_sitter, coalesce(p_amount, v_total), p_method, p_notes, v_family)
  returning id into v_payment;

  update public.shifts set payment_id = v_payment where id = any(p_shift_ids);
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos: a parent reaches only their own family's photos.
-- ---------------------------------------------------------------------------

create or replace function public.photo_in_my_family(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_name, '/', 1)
    when 'parents'     then exists (select 1 from public.app_users   where id = public.photo_owner_id(p_name) and family_id = public.my_family_id())
    when 'babysitters' then exists (select 1 from public.babysitters where id = public.photo_owner_id(p_name) and family_id = public.my_family_id())
    when 'children'    then exists (select 1 from public.children    where id = public.photo_owner_id(p_name) and family_id = public.my_family_id())
    else false
  end;
$$;

drop policy photos_parent_all on storage.objects;
create policy photos_parent_family on storage.objects for all
  using (bucket_id = 'photos' and public.is_parent() and public.photo_in_my_family(name))
  with check (bucket_id = 'photos' and public.is_parent() and public.photo_in_my_family(name));

drop policy photos_sitter_family on storage.objects;
create policy photos_sitter_family on storage.objects for select
  using (bucket_id = 'photos'
         and split_part(name, '/', 1) in ('children', 'parents')
         and public.has_active_shift()
         and public.photo_in_my_family(name));

revoke all on function public.my_family_id() from public, anon;
revoke all on function public.is_system_admin() from public, anon;
revoke all on function public.photo_in_my_family(text) from public, anon;
grant execute on function public.my_family_id() to authenticated, service_role;
grant execute on function public.is_system_admin() to authenticated, service_role;
grant execute on function public.photo_in_my_family(text) to authenticated, service_role;
grant execute on function public.child_upcoming_shifts() to authenticated;
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.record_payment(uuid[], text, numeric, text) to authenticated;
