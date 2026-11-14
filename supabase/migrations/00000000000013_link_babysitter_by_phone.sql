-- Adding a babysitter who is already in the app (same phone number) doesn't
-- create a copy: the family gets her existing profile in its list and sets
-- only its own terms. Knowing her number is enough, shared or not. Her
-- profile stays with the family that added her first.

-- One format for comparing phone numbers: digits only, without the country
-- code, starting with a single 0. "+972 52-123 4567", "+972 052-1234567",
-- "00972521234567", "052-1234567" and "52-1234567" all become "0521234567".
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when d = '' then ''
    when d like '0%' then d
    else '0' || d
  end
  from (
    select regexp_replace(                                   -- the country code
             regexp_replace(                                 -- the international prefix
               regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
               '^00', ''),
             '^972', '') as d
  ) x;
$$;

create index babysitters_phone_idx on public.babysitters (public.normalize_phone(phone));

-- Find a babysitter by phone and add her to my family's list (no terms yet
-- if she's new to it). Returns nothing when the number isn't in the app.
create or replace function public.link_babysitter_by_phone(p_phone text)
returns table (babysitter_id uuid, full_name text, owned boolean, already_listed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := public.my_family_id();
  v_phone  text := public.normalize_phone(p_phone);
  b        public.babysitters;
  v_listed boolean;
begin
  if not public.is_parent() or v_family is null then
    raise exception 'only parents can add babysitters';
  end if;
  if length(v_phone) < 9 then
    return;
  end if;

  select * into b from public.babysitters
   where public.normalize_phone(phone) = v_phone
   order by created_at
   limit 1;
  if not found then
    return;
  end if;

  select exists (
    select 1 from public.family_babysitters fb where fb.family_id = v_family and fb.babysitter_id = b.id
  ) into v_listed;
  if not v_listed then
    insert into public.family_babysitters (family_id, babysitter_id) values (v_family, b.id);
  end if;

  return query select b.id, b.full_name, b.family_id = v_family, v_listed;
end;
$$;

revoke all on function public.link_babysitter_by_phone(text) from public, anon;
grant execute on function public.link_babysitter_by_phone(text) to authenticated;
