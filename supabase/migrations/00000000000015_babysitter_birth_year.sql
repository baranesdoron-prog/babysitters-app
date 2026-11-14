-- A babysitter's year of birth, on her shared profile, so families have a
-- record of her age. Edited like the rest of her profile: by the family that
-- added her, or by her through update_my_babysitter_profile().

alter table public.babysitters
  add column birth_year smallint
    check (birth_year is null or birth_year between 1940 and 2100);

-- Same function, plus her year of birth (null = keep the current value).
drop function public.update_my_babysitter_profile(text, text, text);
create function public.update_my_babysitter_profile(
  p_full_name  text,
  p_phone      text,
  p_photo_path text default null,     -- null = keep the current photo
  p_birth_year integer default null   -- null = keep the current year
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
         photo_path = coalesce(p_photo_path, photo_path),
         birth_year = coalesce(p_birth_year::smallint, birth_year)
   where id = v_id;

  update public.app_users set full_name = trim(p_full_name) where id = auth.uid();
end;
$$;

revoke all on function public.update_my_babysitter_profile(text, text, text, integer) from public, anon;
grant execute on function public.update_my_babysitter_profile(text, text, text, integer) to authenticated;
