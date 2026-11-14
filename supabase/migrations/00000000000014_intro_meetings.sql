-- Introduction meetings. A family may book a babysitter it didn't add itself
-- (taken from the shared list, or added by phone) only after meeting her:
-- it schedules one or more introduction meetings, and once one has taken
-- place it confirms "we met" (confirm_met_babysitter()). Until then she can't
-- be put on a shift or sent a request. A babysitter the family added itself
-- counts as met from the start.

alter table public.family_babysitters add column met_at timestamptz;

-- Today's rows: a family's own babysitters are met.
update public.family_babysitters fb
   set met_at = coalesce(fb.created_at, now())
  from public.babysitters b
 where b.id = fb.babysitter_id and b.family_id = fb.family_id;

-- met_at is set by the system only: on insert, own babysitters are met and
-- others aren't; afterwards only confirm_met_babysitter() may change it.
create or replace function public.guard_family_babysitter_met()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.met_at := case
      when exists (select 1 from public.babysitters b where b.id = new.babysitter_id and b.family_id = new.family_id)
      then now()
      else null
    end;
  elsif new.met_at is distinct from old.met_at
        and coalesce(current_setting('app.confirming_met', true), '') <> 'on' then
    raise exception 'confirm the introduction meeting first';
  end if;
  return new;
end;
$$;

create trigger guard_family_babysitter_met
  before insert or update on public.family_babysitters
  for each row execute function public.guard_family_babysitter_met();

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------

create table public.intro_meetings (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null default public.my_family_id() references public.families(id) on delete cascade,
  babysitter_id  uuid not null references public.babysitters(id) on delete cascade,
  start_at       timestamptz not null,
  place          text check (place is null or length(place) <= 200),
  contact_name   text check (contact_name is null or length(contact_name) <= 100),
  contact_phone  text check (contact_phone is null or length(contact_phone) <= 30),
  notes          text check (notes is null or length(notes) <= 500),
  cancelled      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index intro_meetings_family_idx on public.intro_meetings (family_id, babysitter_id);
create index intro_meetings_babysitter_idx on public.intro_meetings (babysitter_id);

alter table public.intro_meetings enable row level security;
-- A family schedules meetings with babysitters in its list; she reads hers.
create policy parent_all on public.intro_meetings for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id()
              and public.my_family_uses_babysitter(babysitter_id));
create policy sitter_read on public.intro_meetings for select
  using (babysitter_id = public.my_babysitter_id());

-- "We met her": allowed once a (not cancelled) meeting with her has started.
create or replace function public.confirm_met_babysitter(p_babysitter uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := public.my_family_id();
begin
  if not public.is_parent() or v_family is null then
    raise exception 'only parents can confirm';
  end if;
  if not exists (
    select 1 from public.intro_meetings
     where family_id = v_family and babysitter_id = p_babysitter
       and not cancelled and start_at <= now()
  ) then
    raise exception 'meet her first: no introduction meeting has taken place';
  end if;

  perform set_config('app.confirming_met', 'on', true);
  update public.family_babysitters
     set met_at = now()
   where family_id = v_family and babysitter_id = p_babysitter and met_at is null;
  perform set_config('app.confirming_met', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking needs a met babysitter: shifts and requests.
-- ---------------------------------------------------------------------------

-- May my family book her? Its own, or one it has met.
create or replace function public.my_family_may_book(p_babysitter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_babysitters
     where family_id = public.my_family_id() and babysitter_id = p_babysitter and met_at is not null
  ) or public.my_family_owns_babysitter(p_babysitter);
$$;

drop policy parent_all on public.shifts;
create policy parent_all on public.shifts for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id()
              and (babysitter_id is null or public.my_family_may_book(babysitter_id)));

drop policy parent_all on public.shift_requests;
create policy parent_all on public.shift_requests for all
  using (public.is_parent() and family_id = public.my_family_id())
  with check (public.is_parent() and family_id = public.my_family_id()
              and public.my_family_may_book(babysitter_id));

revoke all on function public.confirm_met_babysitter(uuid) from public, anon;
revoke all on function public.my_family_may_book(uuid) from public, anon;
grant execute on function public.confirm_met_babysitter(uuid) to authenticated;
grant execute on function public.my_family_may_book(uuid) to authenticated, service_role;
grant select, insert, update, delete on public.intro_meetings to authenticated;
grant all on public.intro_meetings to service_role;
