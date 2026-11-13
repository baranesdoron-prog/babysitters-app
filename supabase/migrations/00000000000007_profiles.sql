-- Parents' details (added by another parent from the "הורים" tab), a flag that
-- makes a login change its password on first sign-in, and "my profile" edits.

alter table public.app_users
  add column first_name            text,
  add column last_name             text,
  add column workplace             text,
  add column phone                 text,
  add column must_change_password  boolean not null default false;

-- Anyone clears their own flag after setting a new password
-- (supabase.auth.updateUser). Parents could update the row directly; a
-- babysitter or a child has no UPDATE policy on app_users.
create or replace function public.password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_users set must_change_password = false where id = auth.uid();
$$;

-- A babysitter edits her own name, phone and photo. She has no UPDATE policy
-- on babysitters (rates live there), so this is the only way, and it can't
-- touch anything else on her row.
create or replace function public.update_my_babysitter_profile(
  p_full_name  text,
  p_phone      text,
  p_photo_path text default null   -- null = keep the current photo
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := public.my_babysitter_id();
begin
  if v_id is null then
    raise exception 'only a babysitter can edit her profile';
  end if;
  if length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'name is required';
  end if;
  if p_photo_path is not null and p_photo_path <> 'babysitters/' || v_id || '.jpg' then
    raise exception 'photo must be her own';
  end if;

  update public.babysitters
     set full_name  = trim(p_full_name),
         phone      = nullif(trim(coalesce(p_phone, '')), ''),
         photo_path = coalesce(p_photo_path, photo_path)
   where id = v_id;

  update public.app_users set full_name = trim(p_full_name) where id = auth.uid();
end;
$$;

revoke all on function public.password_changed() from public, anon;
revoke all on function public.update_my_babysitter_profile(text, text, text) from public, anon;
grant execute on function public.password_changed() to authenticated;
grant execute on function public.update_my_babysitter_profile(text, text, text) to authenticated;
