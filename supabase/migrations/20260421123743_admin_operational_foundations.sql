begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type public.admin_role as enum ('super_admin', 'operations_admin');
  end if;
end $$;

alter table public.subscriptions
  add column if not exists pause_until date,
  add column if not exists scheduled_price_change jsonb;

alter table public.team_members
  add column if not exists commission_rate numeric(5,4) not null default 0.2000;

alter table public.team_members
  drop constraint if exists team_members_commission_rate_check;
alter table public.team_members
  add constraint team_members_commission_rate_check
  check (commission_rate >= 0 and commission_rate <= 1);

create table if not exists public.settings (
  id boolean primary key default true,
  default_billing_interval text not null default 'month',
  default_payment_terms_days integer not null default 14,
  default_currency text not null default 'SEK',
  default_commission_rate numeric(5,4) not null default 0.2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_single_row check (id = true),
  constraint settings_default_billing_interval_check check (default_billing_interval in ('month', 'quarter', 'year')),
  constraint settings_default_payment_terms_days_check check (default_payment_terms_days between 1 and 90),
  constraint settings_default_commission_rate_check check (default_commission_rate >= 0 and default_commission_rate <= 1)
);

create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.admin_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cm_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  cm_id uuid references public.team_members(id) on delete set null,
  valid_from date not null default current_date,
  valid_to date,
  scheduled_change jsonb,
  handover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cm_assignments_valid_range_check check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists cm_assignments_one_active_per_customer
  on public.cm_assignments (customer_id)
  where valid_to is null;

create index if not exists cm_assignments_cm_id_idx
  on public.cm_assignments (cm_id, valid_from desc);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

insert into public.settings (id)
values (true)
on conflict (id) do nothing;

update public.settings
set default_commission_rate = 0.2000
where default_commission_rate is null;

insert into public.admin_user_roles (user_id, role)
select distinct ur.user_id, 'operations_admin'::public.admin_role
from public.user_roles ur
where ur.role = 'admin'
on conflict (user_id, role) do nothing;

insert into public.cm_assignments (customer_id, cm_id, valid_from, valid_to, handover_note)
select
  cp.id,
  tm.id,
  coalesce(cp.contract_start_date, cp.created_at::date, current_date),
  null,
  'Backfilled from customer_profiles.account_manager'
from public.customer_profiles cp
join lateral (
  select team_members.id
  from public.team_members
  where (
    cp.account_manager_profile_id is not null
    and team_members.profile_id = cp.account_manager_profile_id
  )
  or (
    cp.account_manager_profile_id is null
    and cp.account_manager is not null
    and lower(team_members.name) = lower(cp.account_manager)
  )
  order by team_members.created_at asc nulls last
  limit 1
) tm on true
where not exists (
  select 1
  from public.cm_assignments existing
  where existing.customer_id = cp.id
    and existing.valid_to is null
);

update public.subscriptions s
set
  pause_until = cp.paused_until,
  scheduled_price_change = case
    when cp.upcoming_monthly_price is not null and cp.upcoming_price_effective_date is not null then
      jsonb_build_object(
        'current_monthly_price', cp.monthly_price,
        'next_monthly_price', cp.upcoming_monthly_price,
        'effective_date', cp.upcoming_price_effective_date
      )
    else null
  end
from public.customer_profiles cp
where cp.id = s.customer_profile_id;

alter table public.settings enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.cm_assignments enable row level security;

drop policy if exists "settings_admin_manage" on public.settings;
create policy "settings_admin_manage" on public.settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admin_user_roles_admin_manage" on public.admin_user_roles;
create policy "admin_user_roles_admin_manage" on public.admin_user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "audit_log_admin_read" on public.audit_log;
create policy "audit_log_admin_read" on public.audit_log
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "audit_log_admin_insert" on public.audit_log;
create policy "audit_log_admin_insert" on public.audit_log
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cm_assignments_admin_manage" on public.cm_assignments;
create policy "cm_assignments_admin_manage" on public.cm_assignments
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_admin_user_roles_updated_at on public.admin_user_roles;
create trigger trg_admin_user_roles_updated_at
before update on public.admin_user_roles
for each row execute function public.set_updated_at();

drop trigger if exists trg_cm_assignments_updated_at on public.cm_assignments;
create trigger trg_cm_assignments_updated_at
before update on public.cm_assignments
for each row execute function public.set_updated_at();

commit;
