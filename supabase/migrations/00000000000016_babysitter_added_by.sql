-- Which parent added a babysitter, so another family can tell her "I got
-- your number from <parent>" in its WhatsApp introduction message.

alter table public.babysitters
  add column created_by uuid default auth.uid() references public.app_users(id) on delete set null;

-- Babysitters added before this: the first parent of the family that added her.
update public.babysitters b
   set created_by = (
     select u.id from public.app_users u
      where u.family_id = b.family_id and u.role = 'parent'
      order by u.created_at
      limit 1)
 where created_by is null;

-- The name of the parent who added her, for families that can see her
-- (own list, or the shared list while sharing). Nothing else about that parent.
create or replace function public.babysitter_added_by(p_babysitter uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.full_name, '')), '')
    from public.babysitters b
    join public.app_users u on u.id = coalesce(
      b.created_by,
      (select x.id from public.app_users x where x.family_id = b.family_id and x.role = 'parent' order by x.created_at limit 1))
   where b.id = p_babysitter
     and public.is_parent()
     and (b.family_id = public.my_family_id()
          or public.my_family_uses_babysitter(b.id)
          or (b.shared and public.my_family_shares()));
$$;

revoke all on function public.babysitter_added_by(uuid) from public, anon;
grant execute on function public.babysitter_added_by(uuid) to authenticated;
