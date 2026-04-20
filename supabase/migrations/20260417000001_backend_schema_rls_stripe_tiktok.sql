begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'content_manager', 'customer');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    insert into public.user_roles (user_id, role)
    select id, role::text::public.app_role
    from public.profiles
    where role is not null
    on conflict (user_id, role) do nothing;
  end if;
end $$;

alter table public.customer_profiles
  add column if not exists phone text,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric,
  add column if not exists discount_duration_months int,
  add column if not exists discount_ends_at timestamptz,
  add column if not exists upcoming_price_change_at timestamptz,
  add column if not exists upcoming_price_change_value numeric,
  add column if not exists contract_start_date date,
  add column if not exists billing_day_of_month int default 25,
  add column if not exists account_manager_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists next_invoice_date date,
  add column if not exists tiktok_handle text,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_billing_day_check;
alter table public.customer_profiles
  add constraint customer_profiles_billing_day_check
  check (billing_day_of_month is null or billing_day_of_month between 1 and 28);

alter table public.customer_profiles
  drop constraint if exists customer_profiles_discount_type_check;

update public.customer_profiles
set discount_type = null
where discount_type is not null
  and discount_type not in ('none', 'percent', 'amount', 'free_months');

update public.customer_profiles
set discount_type = 'free_months'
where discount_type = 'free_period';

alter table public.customer_profiles
  add constraint customer_profiles_discount_type_check
  check (
    discount_type is null
    or discount_type in ('none', 'percent', 'amount', 'free_months')
  );

create table if not exists public.tiktok_stats (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  snapshot_date date not null,
  followers int not null default 0,
  total_videos int not null default 0,
  videos_last_24h int not null default 0,
  total_views_24h bigint not null default 0,
  engagement_rate numeric(5,2) not null default 0,
  raw_payload jsonb,
  fetched_at timestamptz not null default now(),
  unique (customer_profile_id, snapshot_date)
);

create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.stripe_sync_log (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_type text,
  environment text not null default 'test',
  status text not null default 'success',
  error_message text,
  payload_summary jsonb,
  created_at timestamptz not null default now()
);

alter table public.stripe_sync_log
  add column if not exists event_id text,
  add column if not exists environment text not null default 'test',
  add column if not exists payload_summary jsonb;

create or replace function public.log_concept_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cm_id uuid;
  v_cm_email text;
  v_cm_name text;
  v_type text;
begin
  select tm.id, u.email, tm.name
    into v_cm_id, v_cm_email, v_cm_name
  from public.team_members tm
  left join auth.users u on u.id = tm.profile_id
  where tm.profile_id = NEW.created_by
  limit 1;

  if TG_OP = 'INSERT' then
    v_type := 'concept_created';
  elsif NEW.status = 'sent' and OLD.status is distinct from 'sent' then
    v_type := 'concept_sent';
  else
    v_type := 'concept_updated';
  end if;

  insert into public.cm_activities (cm_id, cm_email, cm_name, type, customer_profile_id, description, metadata)
  values (
    v_cm_id,
    v_cm_email,
    v_cm_name,
    v_type,
    NEW.customer_profile_id,
    coalesce(NEW.title, 'Koncept'),
    jsonb_build_object('concept_id', NEW.id, 'status', NEW.status)
  );

  return NEW;
end $$;

drop trigger if exists trg_concept_insert on public.customer_concepts;
create trigger trg_concept_insert
  after insert on public.customer_concepts
  for each row execute function public.log_concept_activity();

drop trigger if exists trg_concept_status on public.customer_concepts;
create trigger trg_concept_status
  after update of status on public.customer_concepts
  for each row when (OLD.status is distinct from NEW.status)
  execute function public.log_concept_activity();

alter table public.customer_profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.cm_activities enable row level security;
alter table public.tiktok_stats enable row level security;
alter table public.service_costs enable row level security;
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.customer_concepts enable row level security;
alter table public.stripe_processed_events enable row level security;
alter table public.stripe_sync_log enable row level security;

drop policy if exists "Read own roles" on public.user_roles;
create policy "Read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admin manage roles" on public.user_roles;
create policy "Admin manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cp_select_admin" on public.customer_profiles;
create policy "cp_select_admin" on public.customer_profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cp_select_cm" on public.customer_profiles;
create policy "cp_select_cm" on public.customer_profiles
  for select to authenticated using (
    public.has_role(auth.uid(), 'content_manager') and exists (
      select 1 from public.team_members tm
      where tm.profile_id = auth.uid()
        and (
          tm.id = customer_profiles.account_manager_profile_id
          or tm.email = customer_profiles.account_manager
          or tm.name = customer_profiles.account_manager
        )
    )
  );

drop policy if exists "cp_select_customer" on public.customer_profiles;
create policy "cp_select_customer" on public.customer_profiles
  for select to authenticated using (
    public.has_role(auth.uid(), 'customer') and customer_profiles.user_id = auth.uid()
  );

drop policy if exists "cp_write_admin" on public.customer_profiles;
create policy "cp_write_admin" on public.customer_profiles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "tm_select_admin" on public.team_members;
create policy "tm_select_admin" on public.team_members
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "tm_select_own" on public.team_members;
create policy "tm_select_own" on public.team_members
  for select to authenticated using (
    public.has_role(auth.uid(), 'content_manager') and profile_id = auth.uid()
  );

drop policy if exists "tm_write_admin" on public.team_members;
create policy "tm_write_admin" on public.team_members
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ca_select_admin" on public.cm_activities;
create policy "ca_select_admin" on public.cm_activities
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ca_select_own" on public.cm_activities;
create policy "ca_select_own" on public.cm_activities
  for select to authenticated using (
    public.has_role(auth.uid(), 'content_manager') and exists (
      select 1 from public.team_members tm
      where tm.profile_id = auth.uid() and tm.id = cm_activities.cm_id
    )
  );

drop policy if exists "ca_insert_service" on public.cm_activities;
create policy "ca_insert_service" on public.cm_activities
  for insert to authenticated with check (true);

drop policy if exists "ts_select_admin" on public.tiktok_stats;
create policy "ts_select_admin" on public.tiktok_stats
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ts_select_cm" on public.tiktok_stats;
create policy "ts_select_cm" on public.tiktok_stats
  for select to authenticated using (
    public.has_role(auth.uid(), 'content_manager') and exists (
      select 1
      from public.customer_profiles cp
      join public.team_members tm
        on tm.id = cp.account_manager_profile_id
        or tm.email = cp.account_manager
        or tm.name = cp.account_manager
      where cp.id = tiktok_stats.customer_profile_id
        and tm.profile_id = auth.uid()
    )
  );

drop policy if exists "sc_select_admin" on public.service_costs;
create policy "sc_select_admin" on public.service_costs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "inv_select_admin" on public.invoices;
create policy "inv_select_admin" on public.invoices
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "inv_select_customer" on public.invoices;
create policy "inv_select_customer" on public.invoices
  for select to authenticated using (
    public.has_role(auth.uid(), 'customer') and exists (
      select 1 from public.customer_profiles cp
      where cp.id = invoices.customer_profile_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "sub_select_admin" on public.subscriptions;
create policy "sub_select_admin" on public.subscriptions
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "sub_select_customer" on public.subscriptions;
create policy "sub_select_customer" on public.subscriptions
  for select to authenticated using (
    public.has_role(auth.uid(), 'customer') and exists (
      select 1 from public.customer_profiles cp
      where cp.id = subscriptions.customer_profile_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "cc_select_admin" on public.customer_concepts;
create policy "cc_select_admin" on public.customer_concepts
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cc_select_cm" on public.customer_concepts;
create policy "cc_select_cm" on public.customer_concepts
  for select to authenticated using (
    public.has_role(auth.uid(), 'content_manager') and exists (
      select 1
      from public.customer_profiles cp
      join public.team_members tm
        on tm.id = cp.account_manager_profile_id
        or tm.email = cp.account_manager
        or tm.name = cp.account_manager
      where cp.id = customer_concepts.customer_profile_id
        and tm.profile_id = auth.uid()
    )
  );

drop policy if exists "cc_write_cm_admin" on public.customer_concepts;
create policy "cc_write_cm_admin" on public.customer_concepts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "spe_select_admin" on public.stripe_processed_events;
create policy "spe_select_admin" on public.stripe_processed_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ssl_select_admin" on public.stripe_sync_log;
create policy "ssl_select_admin" on public.stripe_sync_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_tiktok_stats_customer_date
  on public.tiktok_stats (customer_profile_id, snapshot_date desc);

create index if not exists idx_customer_profiles_next_invoice
  on public.customer_profiles (next_invoice_date);

create index if not exists idx_customer_profiles_account_manager
  on public.customer_profiles (account_manager_profile_id);

create index if not exists idx_stripe_processed_events_processed_at
  on public.stripe_processed_events (processed_at desc);

create index if not exists idx_stripe_sync_log_created
  on public.stripe_sync_log (created_at desc);

create index if not exists idx_stripe_sync_log_status
  on public.stripe_sync_log (status, created_at desc);

commit;
