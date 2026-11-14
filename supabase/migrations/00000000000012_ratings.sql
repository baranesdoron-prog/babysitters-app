-- Mutual ratings, per shift. After a shift with a babysitter has ended, the
-- family rates her and she rates the family: 1–5 stars and an optional comment,
-- once per side per shift (it can be changed later).
--
-- Who sees what:
--   - Her average (from all families) is seen by every family that can see her.
--   - A family's average (from all babysitters) is seen by the babysitters it
--     sends requests to or books.
--   - A comment is seen only by the two sides of that shift.
-- Written only through rate_shift(); there are no direct write policies.

create table public.shift_ratings (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references public.shifts(id) on delete cascade,
  family_id      uuid not null references public.families(id) on delete cascade,
  babysitter_id  uuid not null references public.babysitters(id) on delete cascade,
  rater          text not null check (rater in ('family', 'babysitter')),
  stars          smallint not null check (stars between 1 and 5),
  comment        text check (comment is null or length(comment) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (shift_id, rater)
);
create index shift_ratings_babysitter_idx on public.shift_ratings (babysitter_id);
create index shift_ratings_family_idx on public.shift_ratings (family_id);

alter table public.shift_ratings enable row level security;
-- The two sides of a shift read its ratings (both directions, with comments).
create policy parent_read on public.shift_ratings for select
  using (public.is_parent() and family_id = public.my_family_id());
create policy sitter_read on public.shift_ratings for select
  using (babysitter_id = public.my_babysitter_id());

-- Rate a shift as whichever side the caller is.
create or replace function public.rate_shift(p_shift uuid, p_stars integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.shifts;
  v_rater text;
begin
  select * into s from public.shifts where id = p_shift;
  if not found then
    raise exception 'shift not found';
  end if;

  if public.is_parent() and s.family_id = public.my_family_id() then
    v_rater := 'family';
  elsif s.babysitter_id is not null and s.babysitter_id = public.my_babysitter_id() then
    v_rater := 'babysitter';
  else
    raise exception 'not your shift';
  end if;

  if s.babysitter_id is null or s.status not in ('confirmed', 'done') or s.end_at > now() then
    raise exception 'a shift can be rated after it ends';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'stars must be 1 to 5';
  end if;

  insert into public.shift_ratings (shift_id, family_id, babysitter_id, rater, stars, comment)
  values (s.id, s.family_id, s.babysitter_id, v_rater, p_stars, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (shift_id, rater) do update
    set stars = excluded.stars, comment = excluded.comment, updated_at = now();
end;
$$;

-- Babysitters' averages (from families), for those the caller can see:
-- a family sees its own, its list's and (while it shares) the shared ones;
-- a babysitter sees her own.
create or replace function public.babysitter_ratings(p_ids uuid[])
returns table (babysitter_id uuid, average numeric, count integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.babysitter_id, round(avg(r.stars)::numeric, 1), count(*)::integer
    from public.shift_ratings r
    join public.babysitters b on b.id = r.babysitter_id
   where r.rater = 'family'
     and r.babysitter_id = any(p_ids)
     and (
       (public.is_parent() and (b.family_id = public.my_family_id()
                                or public.my_family_uses_babysitter(b.id)
                                or (b.shared and public.my_family_shares())))
       or b.id = public.my_babysitter_id()
     )
   group by r.babysitter_id;
$$;

-- Families' averages (from babysitters): a family sees its own; a babysitter
-- sees those of families that sent her a request or booked her.
create or replace function public.family_ratings(p_ids uuid[])
returns table (family_id uuid, average numeric, count integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.family_id, round(avg(r.stars)::numeric, 1), count(*)::integer
    from public.shift_ratings r
   where r.rater = 'babysitter'
     and r.family_id = any(p_ids)
     and (
       (public.is_parent() and r.family_id = public.my_family_id())
       or exists (
         select 1 from public.shifts s
          where s.family_id = r.family_id and public.shift_visible_to_me(s.id)
       )
     )
   group by r.family_id;
$$;

revoke all on function public.rate_shift(uuid, integer, text) from public, anon;
revoke all on function public.babysitter_ratings(uuid[]) from public, anon;
revoke all on function public.family_ratings(uuid[]) from public, anon;
grant execute on function public.rate_shift(uuid, integer, text) to authenticated;
grant execute on function public.babysitter_ratings(uuid[]) to authenticated;
grant execute on function public.family_ratings(uuid[]) to authenticated;
grant select on public.shift_ratings to authenticated;
grant all on public.shift_ratings to service_role;
