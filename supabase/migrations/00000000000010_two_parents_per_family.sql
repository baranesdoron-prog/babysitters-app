-- A family has at most two parents (any genders). Enforced here, whoever
-- adds the parent (manage-login, the SQL editor, anything else).

create or replace function public.limit_parents_per_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from 'parent' or new.family_id is null then
    return new;
  end if;
  -- Nothing changes for a row that was already a parent of this family.
  if tg_op = 'UPDATE' and old.role = 'parent' and old.family_id = new.family_id then
    return new;
  end if;

  -- Serialize parent changes per family, so two at once can't both pass.
  perform 1 from public.families where id = new.family_id for update;

  if (select count(*) from public.app_users
       where family_id = new.family_id and role = 'parent' and id <> new.id) >= 2 then
    raise exception 'family_full: a family can have at most two parents'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger limit_parents_per_family
  before insert or update of role, family_id on public.app_users
  for each row execute function public.limit_parents_per_family();
