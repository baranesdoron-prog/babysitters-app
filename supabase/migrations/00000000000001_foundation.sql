-- Babysitters app — foundation schema
-- Mirrors the spec doc: babysitters, availability, children, contacts,
-- activities, school schedule, shifts (+ ordered requests), shift items,
-- item templates, payments, settings. All access is enforced with RLS.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.babysitters (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  phone            text,
  photo_url        text,
  active           boolean not null default true,
  night_ok         boolean not null default false,  -- willing to do night shifts
  helps_homework   boolean not null default false,
  can_pickup       boolean not null default false,  -- can collect from kindergarten / school
  has_child_seat   boolean not null default false,  -- asked when the babysitter is defined
  day_rate_type    text not null default 'hourly'  check (day_rate_type   in ('hourly', 'per_shift')),
  day_rate         numeric(8,2),
  night_rate_type  text not null default 'hourly'  check (night_rate_type in ('hourly', 'per_shift')),
  night_rate       numeric(8,2),
  notes            text,
  created_at       timestamptz not null default now()
);

-- One row per login. role is null until a parent assigns it.
create table public.app_users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  role           text check (role in ('parent', 'babysitter')),
  babysitter_id  uuid unique references public.babysitters(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint babysitter_role_has_link
    check (role is distinct from 'babysitter' or babysitter_id is not null)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'parent' from public.app_users where id = auth.uid()),
    false
  );
$$;

create or replace function public.my_babysitter_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select babysitter_id from public.app_users
  where id = auth.uid() and role = 'babysitter';
$$;

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------

create table public.settings (
  id                        boolean primary key default true check (id),
  night_start               time not null default '20:00',
  default_wait_minutes      integer not null default 120,
  default_reminder_minutes  integer not null default 15
);
insert into public.settings default values;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

create table public.availability (
  id             uuid primary key default gen_random_uuid(),
  babysitter_id  uuid not null references public.babysitters(id) on delete cascade,
  kind           text not null check (kind in ('weekly', 'available_on', 'unavailable_on')),
  weekday        smallint check (weekday between 0 and 6),  -- 0 = Sunday, for 'weekly'
  on_date        date,                                       -- for date exceptions
  start_time     time not null,
  end_time       time not null,
  constraint availability_shape check (
    (kind = 'weekly' and weekday is not null and on_date is null)
    or (kind <> 'weekly' and on_date is not null and weekday is null)
  )
);

-- ---------------------------------------------------------------------------
-- Children and everything fixed about them
-- ---------------------------------------------------------------------------

create table public.children (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  birth_date         date,
  allergies          text,
  bedtime            time,
  framework_type     text check (framework_type in ('kindergarten', 'school')),
  framework_name     text,
  needs_child_seat   boolean not null default false,
  notes              text
);

create table public.contacts (
  id        uuid primary key default gen_random_uuid(),
  child_id  uuid references public.children(id) on delete cascade,  -- null = family-wide
  name      text not null,
  phone     text not null,
  kind      text not null check (kind in ('friend', 'friend_parent', 'emergency', 'activity', 'other')),
  notes     text
);

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  name        text not null,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time,
  location    text,
  driver      text   -- who takes her; babysitters don't drive to activities
);

-- When each child finishes kindergarten / school, and where she is collected from.
create table public.school_schedule (
  id               uuid primary key default gen_random_uuid(),
  child_id         uuid not null references public.children(id) on delete cascade,
  weekday          smallint not null check (weekday between 0 and 6),
  end_time         time not null,
  pickup_location  text,
  unique (child_id, weekday)
);

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------

create table public.shifts (
  id                uuid primary key default gen_random_uuid(),
  start_at          timestamptz not null,
  end_at            timestamptz not null check (end_at > start_at),
  babysitter_id     uuid references public.babysitters(id) on delete set null,
  status            text not null default 'draft'
                    check (status in ('draft', 'requested', 'confirmed', 'done', 'cancelled')),
  -- A shift crossing night_start is billed as a day part + a night part,
  -- unless the parent merges it into one.
  merged            boolean not null default false,
  pickup_by         text not null default 'parent' check (pickup_by in ('parent', 'babysitter')),
  wait_minutes      integer,   -- null = settings.default_wait_minutes
  reminder_minutes  integer,   -- null = settings.default_reminder_minutes
  notes             text,
  created_at        timestamptz not null default now()
);

-- Requests go to one babysitter at a time, in the order the parent picks.
create table public.shift_requests (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references public.shifts(id) on delete cascade,
  babysitter_id  uuid not null references public.babysitters(id) on delete cascade,
  position       smallint not null,
  status         text not null default 'queued'
                 check (status in ('queued', 'sent', 'accepted', 'declined', 'skipped')),
  sent_at        timestamptz,
  deadline_at    timestamptz,
  responded_at   timestamptz,
  unique (shift_id, position),
  unique (shift_id, babysitter_id)
);

create table public.item_templates (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('prepare', 'leave', 'homework', 'morning', 'other')),
  description  text not null,
  auto_on      text check (auto_on in ('night')),  -- 'night' = added to every night shift
  child_id     uuid references public.children(id) on delete cascade
);

create table public.shift_items (
  id           uuid primary key default gen_random_uuid(),
  shift_id     uuid not null references public.shifts(id) on delete cascade,
  kind         text not null check (kind in ('prepare', 'leave', 'homework', 'morning', 'other')),
  description  text not null,
  child_id     uuid references public.children(id) on delete set null,
  done         boolean not null default false
);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  shift_id         uuid not null unique references public.shifts(id) on delete cascade,
  computed_amount  numeric(8,2),
  actual_amount    numeric(8,2),
  paid             boolean not null default false,
  paid_at          timestamptz,
  method           text check (method in ('cash', 'bit', 'paybox', 'transfer', 'other'))
);

-- Is this shift one the current babysitter is (or was) asked about?
create or replace function public.shift_visible_to_me(p_shift uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shifts s
    where s.id = p_shift and s.babysitter_id = public.my_babysitter_id()
  ) or exists (
    select 1 from public.shift_requests r
    where r.shift_id = p_shift
      and r.babysitter_id = public.my_babysitter_id()
      and r.status <> 'queued'
  );
$$;

-- Children's details are shown to a babysitter only around a confirmed shift.
create or replace function public.has_active_shift()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shifts s
    where s.babysitter_id = public.my_babysitter_id()
      and s.status = 'confirmed'
      and s.start_at < now() + interval '2 days'
      and s.end_at   > now() - interval '12 hours'
  );
$$;

-- A babysitter answers a request through this function only
-- (no direct UPDATE on shifts / shift_requests).
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
  end if;
end;
$$;

-- A babysitter ticks items on her own shift through this function only.
create or replace function public.set_item_done(p_item uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shift_items i
     set done = p_done
    from public.shifts s
   where i.id = p_item
     and s.id = i.shift_id
     and s.babysitter_id = public.my_babysitter_id();
  if not found then
    raise exception 'item not found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_users        enable row level security;
alter table public.babysitters      enable row level security;
alter table public.settings         enable row level security;
alter table public.availability     enable row level security;
alter table public.children         enable row level security;
alter table public.contacts         enable row level security;
alter table public.activities       enable row level security;
alter table public.school_schedule  enable row level security;
alter table public.shifts           enable row level security;
alter table public.shift_requests   enable row level security;
alter table public.item_templates   enable row level security;
alter table public.shift_items      enable row level security;
alter table public.payments         enable row level security;

-- Parents: full access everywhere.
create policy parent_all on public.app_users       for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.babysitters     for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.settings        for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.availability    for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.children        for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.contacts        for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.activities      for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.school_schedule for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.shifts          for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.shift_requests  for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.item_templates  for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.shift_items     for all using (public.is_parent()) with check (public.is_parent());
create policy parent_all on public.payments        for all using (public.is_parent()) with check (public.is_parent());

-- Everyone sees their own app_users row.
create policy self_read on public.app_users for select using (id = auth.uid());

-- Babysitter: her own profile only (never other babysitters' rates).
create policy sitter_self on public.babysitters for select using (id = public.my_babysitter_id());

-- Babysitter: reads settings, manages her own availability.
create policy sitter_read on public.settings for select using (public.my_babysitter_id() is not null);
create policy sitter_own on public.availability for all
  using (babysitter_id = public.my_babysitter_id())
  with check (babysitter_id = public.my_babysitter_id());

-- Babysitter: shifts she is on or was asked about, and their items.
create policy sitter_read on public.shifts for select using (public.shift_visible_to_me(id));
create policy sitter_read on public.shift_requests for select using (babysitter_id = public.my_babysitter_id());
create policy sitter_read on public.shift_items for select using (public.shift_visible_to_me(shift_id));
create policy sitter_read on public.payments for select
  using (shift_id in (select id from public.shifts where babysitter_id = public.my_babysitter_id()));

-- Babysitter: children's details only around a confirmed shift.
create policy sitter_read on public.children        for select using (public.has_active_shift());
create policy sitter_read on public.contacts        for select using (public.has_active_shift());
create policy sitter_read on public.activities      for select using (public.has_active_shift());
create policy sitter_read on public.school_schedule for select using (public.has_active_shift());

-- Functions callable from the app.
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.set_item_done(uuid, boolean) to authenticated;
