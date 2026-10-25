-- Parent accounts are paired by reciprocal, email-verified requests and
-- remain unprivileged until an administrator approves the pair.

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in ('parent', 'babysitter', 'child', 'admin'));

create table public.parent_pairings (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique,
  requester_user_id uuid not null references public.app_users(id) on delete cascade,
  requester_name text not null,
  requester_email text not null,
  partner_name text not null,
  partner_email text not null,
  partner_user_id uuid references public.app_users(id) on delete set null,
  status text not null default 'awaiting_partner'
    check (status in ('awaiting_partner', 'awaiting_admin', 'approved', 'declined')),
  reviewed_by uuid references public.app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint parent_pairings_distinct_emails check (requester_email <> partner_email),
  constraint parent_pairings_distinct_users check (partner_user_id is null or requester_user_id <> partner_user_id)
);

alter table public.parent_pairings enable row level security;

create or replace function public.is_pair_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy parent_pairings_admin_read on public.parent_pairings
  for select using (public.is_pair_admin());

revoke all on public.parent_pairings from anon, authenticated;
grant select on public.parent_pairings to authenticated;

create or replace function public.submit_parent_pair_request(
  p_requester_name text,
  p_partner_name text,
  p_partner_email text
)
returns public.parent_pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_requester_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_partner_email text := lower(trim(coalesce(p_partner_email, '')));
  v_pair_key text;
  v_pair public.parent_pairings;
  v_role text;
begin
  if v_user_id is null or v_requester_email = '' then
    raise exception 'Sign in with a verified email before requesting parent access';
  end if;
  if length(trim(coalesce(p_requester_name, ''))) not between 1 and 100
     or length(trim(coalesce(p_partner_name, ''))) not between 1 and 100
     or v_partner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or v_partner_email = v_requester_email then
    raise exception 'Enter both names and a different valid partner email';
  end if;

  select role into v_role from public.app_users where id = v_user_id;
  if v_role is not null and v_role <> 'admin' then
    raise exception 'This account already has an assigned role';
  end if;

  v_pair_key := least(v_requester_email, v_partner_email) || '|' || greatest(v_requester_email, v_partner_email);

  select * into v_pair
  from public.parent_pairings
  where pair_key = v_pair_key
  for update;

  if found then
    if v_pair.status in ('approved', 'declined') then
      return v_pair;
    end if;

    if v_pair.requester_user_id = v_user_id then
      update public.parent_pairings
      set requester_name = trim(p_requester_name),
          partner_name = trim(p_partner_name)
      where id = v_pair.id
      returning * into v_pair;
      return v_pair;
    end if;

    if v_pair.partner_user_id = v_user_id and v_pair.status = 'awaiting_admin' then
      return v_pair;
    end if;

    if v_pair.requester_email = v_partner_email
       and v_pair.partner_email = v_requester_email
       and v_pair.status = 'awaiting_partner' then
      update public.parent_pairings
      set partner_user_id = v_user_id,
          partner_name = trim(p_requester_name),
          status = 'awaiting_admin'
      where id = v_pair.id
      returning * into v_pair;
      update public.app_users set full_name = trim(p_requester_name) where id = v_user_id;
      return v_pair;
    end if;

    raise exception 'A parent-pair request already exists for these email addresses';
  end if;

  insert into public.parent_pairings (
    pair_key, requester_user_id, requester_name, requester_email,
    partner_name, partner_email
  ) values (
    v_pair_key, v_user_id, trim(p_requester_name), v_requester_email,
    trim(p_partner_name), v_partner_email
  ) returning * into v_pair;

  update public.app_users set full_name = trim(p_requester_name) where id = v_user_id;
  return v_pair;
end;
$$;

create or replace function public.review_parent_pairing(p_pairing_id uuid, p_approve boolean)
returns public.parent_pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair public.parent_pairings;
begin
  if not public.is_pair_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_pair
  from public.parent_pairings
  where id = p_pairing_id
  for update;

  if not found or v_pair.status <> 'awaiting_admin' or v_pair.partner_user_id is null then
    raise exception 'This pair is not ready for review';
  end if;

  if p_approve then
    update public.app_users
    set role = 'parent', full_name = v_pair.requester_name
    where id = v_pair.requester_user_id and lower(email) = v_pair.requester_email;
    if not found then
      raise exception 'The first parent account no longer matches the request';
    end if;

    update public.app_users
    set role = 'parent', full_name = v_pair.partner_name
    where id = v_pair.partner_user_id and lower(email) = v_pair.partner_email;
    if not found then
      raise exception 'The invited parent account no longer matches the request';
    end if;
  end if;

  update public.parent_pairings
  set status = case when p_approve then 'approved' else 'declined' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_pairing_id
  returning * into v_pair;

  return v_pair;
end;
$$;

revoke all on function public.submit_parent_pair_request(text, text, text) from public;
revoke all on function public.review_parent_pairing(uuid, boolean) from public;
grant execute on function public.submit_parent_pair_request(text, text, text) to authenticated;
grant execute on function public.review_parent_pairing(uuid, boolean) to authenticated;