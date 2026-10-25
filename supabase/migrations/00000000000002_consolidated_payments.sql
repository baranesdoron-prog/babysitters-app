-- One payment can now cover several shifts of the same babysitter.
-- When paying, the app finds her other unpaid shifts and offers to pay them together.
-- (No production data yet, so the old one-row-per-shift table is replaced outright.)

drop table if exists public.payments cascade;

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  babysitter_id  uuid not null references public.babysitters(id) on delete restrict,
  amount         numeric(8,2) not null check (amount >= 0),
  method         text not null check (method in ('bit', 'paybox', 'cash', 'transfer', 'other')),
  paid_at        timestamptz not null default now(),
  notes          text,
  created_at     timestamptz not null default now()
);

-- What each shift costs, and which payment settled it (null = still unpaid).
alter table public.shifts
  add column computed_amount  numeric(8,2),   -- from rates: day part + night part (or merged)
  add column actual_amount    numeric(8,2),   -- parent's override, if any
  add column payment_id       uuid references public.payments(id) on delete set null;

create index shifts_unpaid_idx on public.shifts (babysitter_id)
  where payment_id is null and status = 'done';

-- Record one payment for a set of shifts, atomically. Parents only.
-- All shifts must belong to the same babysitter and still be unpaid.
create or replace function public.record_payment(
  p_shift_ids uuid[],
  p_method    text,
  p_amount    numeric default null,   -- null = sum of the shifts' amounts
  p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sitter   uuid;
  v_count    int;
  v_sitters  int;
  v_total    numeric(8,2);
  v_payment  uuid;
begin
  if not public.is_parent() then
    raise exception 'only parents can record payments';
  end if;

  -- Lock the rows first (no two payments for the same shift), then total them.
  perform 1 from public.shifts where id = any(p_shift_ids) for update;

  select count(*), count(distinct babysitter_id), min(babysitter_id::text)::uuid,
         sum(coalesce(actual_amount, computed_amount, 0))
    into v_count, v_sitters, v_sitter, v_total
    from public.shifts
   where id = any(p_shift_ids) and payment_id is null;

  if v_count = 0 or v_count <> coalesce(array_length(p_shift_ids, 1), 0) then
    raise exception 'some shifts are missing or already paid';
  end if;
  if v_sitters <> 1 or v_sitter is null then
    raise exception 'all shifts must belong to the same babysitter';
  end if;

  insert into public.payments (babysitter_id, amount, method, notes)
  values (v_sitter, coalesce(p_amount, v_total), p_method, p_notes)
  returning id into v_payment;

  update public.shifts set payment_id = v_payment where id = any(p_shift_ids);
  return v_payment;
end;
$$;

grant execute on function public.record_payment(uuid[], text, numeric, text) to authenticated;

alter table public.payments enable row level security;
create policy parent_all on public.payments for all using (public.is_parent()) with check (public.is_parent());
create policy sitter_read on public.payments for select using (babysitter_id = public.my_babysitter_id());
