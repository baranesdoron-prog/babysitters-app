-- Admin is an extra privilege, not a mutually exclusive application role.
alter table public.app_users
  add column is_admin boolean not null default false;

update public.app_users
set is_admin = true,
    role = 'parent'
where role = 'admin';

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in ('parent', 'babysitter', 'child'));

create or replace function public.is_pair_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and is_admin
  );
$$;