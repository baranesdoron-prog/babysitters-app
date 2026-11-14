-- Babysitters shared between families.
--
-- A babysitter (babysitters row) is a person with a shared profile: name, phone,
-- photo, nights / homework / pickup / car seat. The family that added her
-- (babysitters.family_id, "the owner") and she herself edit it.
-- Each family that works with her has its own terms in family_babysitters:
-- rates, notes and "active". Other families never see those.
--
-- Sharing is per babysitter (babysitters.shared, set by the owner), and it is
-- give-to-get: a family sees other families' shared babysitters only if it
-- shares at least one of its own. From there it adds one to its own list
-- (a family_babysitters row with its own rates).

create table public.family_babysitters (
  family_id        uuid not null default public.my_family_id() references public.families(id) on delete cascade,
  babysitter_id    uuid not null references public.babysitters(id) on delete cascade,
  day_rate_type    text not null default 'hourly' check (day_rate_type   in ('hourly', 'per_shift')),
  day_rate         numeric(8,2),
  night_rate_type  text not null default 'hourly' check (night_rate_type in ('hourly', 'per_shift')),
  night_rate       numeric(8,2),
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (family_id, babysitter_id)
);
create index family_babysitters_babysitter_idx on public.family_babysitters (babysitter_id);

-- Today's babysitters keep their rates, notes and "active" as their owner family's terms.
insert into public.family_babysitters (family_id, babysitter_id, day_rate_type, day_rate, night_rate_type, night_rate, notes, active)
select family_id, id, day_rate_type, day_rate, night_rate_type, night_rate, notes, active
  from public.babysitters;

alter table public.babysitters
  drop column day_rate_type,
  drop column day_rate,
  drop column night_rate_type,
  drop column night_rate,
  drop column notes,
  drop column active,
  add column shared boolean not null default false;

-- ---------------------------------------------------------------------------
-- Helpers (security definer: they read across families without RLS loops)
-- ---------------------------------------------------------------------------

-- The signed-in parent's family added this babysitter.
create or replace function public.my_family_owns_babysitter(p_babysitter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.babysitters where id = p_babysitter and family_id = public.my_family_id());
$$;

-- The signed-in parent's family has her in its list.
create or replace function public.my_family_uses_babysitter(p_babysitter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_babysitters where babysitter_id = p_babysitter and family_id = public.my_family_id());
$$;

-- Give to get: the family shares at least one of its own babysitters.
create or replace function public.my_family_shares()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.babysitters where family_id = public.my_family_id() and shared);
$$;

-- May the family add her to its list? Its own, or shared while the family shares too.
create or replace function public.babysitter_open_to_my_family(p_babysitter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.babysitters b
     where b.id = p_babysitter
       and (b.family_id = public.my_family_id() or (b.shared and public.my_family_shares()))
  );
$$;

-- The signed-in babysitter has a confirmed shift with this family around now.
create or replace function public.sitter_active_in(p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shifts s
     where s.babysitter_id = public.my_babysitter_id()
       and s.family_id = p_family
       and s.status = 'confirmed'
       and s.start_at < now() + interval '2 days'
       and s.end_at   > now() - interval '12 hours'
  );
$$;

-- The signed-in babysitter works for this family (it has her in its list).
create or replace function public.sitter_works_for(p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_babysitters
     where babysitter_id = public.my_babysitter_id() and family_id = p_family
  );
$$;

-- ---------------------------------------------------------------------------
-- babysitters: see your own, your list's and (if you share) the shared ones;
-- only the owner family changes the profile.
-- ---------------------------------------------------------------------------

drop policy parent_all on public.babysitters;
create policy parent_read on public.babysitters for select
  using (public.is_parent() and (
    family_id = public.my_family_id()
    or public.my_family_uses_babysitter(id)
    or (shared and public.my_family_shares())
  ));
create policy parent_owner on public.babysitters for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id());

-- family_babysitters: each family's own terms; the babysitter reads hers.
alter table public.family_babysitters enable row level security;
create policy parent_all on public.family_babysitters for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id()
              and public.babysitter_open_to_my_family(babysitter_id));
create policy sitter_read on public.family_babysitters for select
  using (babysitter_id = public.my_babysitter_id());

-- availability is hers: families with her in their list read it; the owner
-- family and she herself write it.
drop policy parent_all on public.availability;
create policy parent_read on public.availability for select
  using (public.is_parent() and (public.my_family_owns_babysitter(babysitter_id) or public.my_family_uses_babysitter(babysitter_id)));
create policy parent_owner on public.availability for all
  using (public.is_parent() and public.my_family_owns_babysitter(babysitter_id))
  with check (public.is_parent() and public.my_family_owns_babysitter(babysitter_id));

-- A babysitter sees a family's details only around her confirmed shift with
-- that family, and the settings of families she works for.
do $$
declare t text;
begin
  foreach t in array array['children', 'contacts', 'activities', 'school_schedule'] loop
    execute format('drop policy sitter_read on public.%I', t);
    execute format('create policy sitter_read on public.%I for select using (public.sitter_active_in(family_id))', t);
  end loop;
end $$;

drop policy sitter_read on public.settings;
create policy sitter_read on public.settings for select using (public.sitter_works_for(family_id));

-- ---------------------------------------------------------------------------
-- Photos: a shared babysitter's photo is readable by the families that can see
-- her; only the owner family (or she) writes it. A babysitter sees a family's
-- photos around her shift with that family.
-- ---------------------------------------------------------------------------

create or replace function public.photo_visible_to_my_family(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_name, '/', 1)
    when 'babysitters' then exists (
      select 1 from public.babysitters b
       where b.id = public.photo_owner_id(p_name)
         and (b.family_id = public.my_family_id()
              or public.my_family_uses_babysitter(b.id)
              or (b.shared and public.my_family_shares())))
    else public.photo_in_my_family(p_name)
  end;
$$;

create or replace function public.photo_in_active_shift_family(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_name, '/', 1)
    when 'children' then exists (select 1 from public.children  c where c.id = public.photo_owner_id(p_name) and public.sitter_active_in(c.family_id))
    when 'parents'  then exists (select 1 from public.app_users u where u.id = public.photo_owner_id(p_name) and public.sitter_active_in(u.family_id))
    else false
  end;
$$;

create policy photos_parent_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_parent() and public.photo_visible_to_my_family(name));

drop policy photos_sitter_family on storage.objects;
create policy photos_sitter_family on storage.objects for select
  using (bucket_id = 'photos'
         and split_part(name, '/', 1) in ('children', 'parents')
         and public.photo_in_active_shift_family(name));

do $$
declare f text;
begin
  foreach f in array array[
    'my_family_owns_babysitter(uuid)', 'my_family_uses_babysitter(uuid)', 'my_family_shares()',
    'babysitter_open_to_my_family(uuid)', 'sitter_active_in(uuid)', 'sitter_works_for(uuid)',
    'photo_visible_to_my_family(text)', 'photo_in_active_shift_family(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

grant select, insert, update, delete on public.family_babysitters to authenticated;
grant all on public.family_babysitters to service_role;
