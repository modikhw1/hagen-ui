begin;

alter table public.customer_profiles
  alter column concepts_per_week set default 2;

alter table public.customer_profiles
  add column if not exists expected_concepts_per_week smallint not null default 2;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_expected_concepts_per_week_check;
alter table public.customer_profiles
  add constraint customer_profiles_expected_concepts_per_week_check
  check (expected_concepts_per_week between 1 and 5);

update public.customer_profiles
set expected_concepts_per_week = coalesce(concepts_per_week, 2)
where expected_concepts_per_week is distinct from coalesce(concepts_per_week, 2);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null default 'info',
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint events_severity_check check (severity in ('info', 'warning', 'critical'))
);

create index if not exists events_created_at_idx
  on public.events (created_at desc);

create index if not exists events_unread_idx
  on public.events (read_at, created_at desc);

create index if not exists events_entity_idx
  on public.events (entity_type, entity_id, created_at desc);

alter table public.events enable row level security;

drop policy if exists "events_admin_manage" on public.events;
create policy "events_admin_manage" on public.events
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

commit;
