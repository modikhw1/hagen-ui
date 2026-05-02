begin;

alter table public.team_members
  add column if not exists invited_at timestamptz,
  add column if not exists bio text,
  add column if not exists region text,
  add column if not exists expertise text[],
  add column if not exists start_date date,
  add column if not exists notes text;

commit;
