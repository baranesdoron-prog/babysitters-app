-- When a babysitter accepts a shift where she picks up and has no child seat,
-- while one of the girls needs one, add the item "להשאיר כיסא לאוטו" so the
-- parents leave the seat for her. Same function signature, same rules as 0001.

create or replace function public.respond_to_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.shift_requests;
begin
  select * into r from public.shift_requests
  where id = p_request and babysitter_id = public.my_babysitter_id() and status = 'sent'
  for update;
  if not found then
    raise exception 'request not found or no longer open';
  end if;

  update public.shift_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = r.id;

  if p_accept then
    update public.shifts
       set babysitter_id = r.babysitter_id, status = 'confirmed'
     where id = r.shift_id;

    insert into public.shift_items (shift_id, kind, description, child_id)
    select s.id, 'leave', 'להשאיר כיסא לאוטו', c.id
      from public.shifts s
      join public.babysitters b on b.id = r.babysitter_id
      join public.children c on c.needs_child_seat
     where s.id = r.shift_id
       and s.pickup_by = 'babysitter'
       and not b.has_child_seat
       and not exists (
         select 1 from public.shift_items i
          where i.shift_id = s.id and i.kind = 'leave' and i.description = 'להשאיר כיסא לאוטו'
       );
  end if;
end;
$$;

grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
