alter table public.customer_profiles
  add column if not exists upload_schedule text[] default '{}',
  add column if not exists last_upload_at timestamptz;

create table if not exists public.service_costs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  date date not null,
  calls int not null default 0,
  cost_sek numeric(10,2) not null default 0,
  unique (service, date)
);

alter table public.service_costs enable row level security;

drop policy if exists "sc_select_admin" on public.service_costs;
create policy "sc_select_admin" on public.service_costs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_service_costs_date on public.service_costs (date desc);
