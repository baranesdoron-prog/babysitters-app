-- A child's gender, so the app can say "ילד" / "ילדה" and "בן 5" / "בת 5".
-- Null until a parent sets it.
alter table public.children
  add column gender text check (gender in ('boy', 'girl'));
