begin;

create table if not exists public.customer_subscription_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  stripe_subscription_id text,
  stripe_schedule_id text,
  stripe_price_id text,
  mode text not null check (mode in ('now', 'next_period')),
  previous_price_ore integer not null default 0 check (previous_price_ore >= 0),
  next_price_ore integer not null check (next_price_ore >= 0),
  effective_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_subscription_history_customer_created_idx
  on public.customer_subscription_history (customer_id, created_at desc);

create table if not exists public.customer_upcoming_price_changes (
  customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
  stripe_subscription_id text,
  stripe_schedule_id text,
  price_ore integer not null check (price_ore >= 0),
  effective_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_upcoming_price_changes_customer_effective_idx
  on public.customer_upcoming_price_changes (customer_id, effective_date desc);

create table if not exists public.customer_discounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  discount_type text not null check (discount_type in ('percent', 'amount', 'free_months')),
  value integer not null default 0 check (value >= 0),
  duration_months integer check (duration_months is null or duration_months > 0),
  ongoing boolean not null default false,
  start_date date,
  end_date date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_discounts_one_active_per_customer_idx
  on public.customer_discounts (customer_id)
  where active = true;

create index if not exists customer_discounts_customer_created_idx
  on public.customer_discounts (customer_id, created_at desc);

create table if not exists public.customer_invites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  email text not null,
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  provider text not null default 'supabase_invite',
  invite_link text,
  expires_at timestamptz,
  consumed_at timestamptz,
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_invites_customer_created_idx
  on public.customer_invites (customer_id, created_at desc);

create index if not exists customer_invites_customer_active_idx
  on public.customer_invites (customer_id, created_at desc)
  where consumed_at is null and superseded_at is null;

drop trigger if exists trg_customer_upcoming_price_changes_updated_at on public.customer_upcoming_price_changes;
create trigger trg_customer_upcoming_price_changes_updated_at
before update on public.customer_upcoming_price_changes
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_discounts_updated_at on public.customer_discounts;
create trigger trg_customer_discounts_updated_at
before update on public.customer_discounts
for each row execute function public.set_updated_at();

insert into public.customer_upcoming_price_changes (
  customer_id,
  stripe_subscription_id,
  price_ore,
  effective_date,
  created_at,
  updated_at
)
select
  cp.id,
  cp.stripe_subscription_id,
  cp.upcoming_monthly_price * 100,
  cp.upcoming_price_effective_date,
  coalesce(cp.updated_at, cp.created_at, now()),
  coalesce(cp.updated_at, cp.created_at, now())
from public.customer_profiles cp
where cp.upcoming_monthly_price is not null
  and cp.upcoming_price_effective_date is not null
on conflict (customer_id) do update
set
  stripe_subscription_id = excluded.stripe_subscription_id,
  price_ore = excluded.price_ore,
  effective_date = excluded.effective_date,
  updated_at = excluded.updated_at;

insert into public.customer_discounts (
  customer_id,
  discount_type,
  value,
  duration_months,
  ongoing,
  start_date,
  end_date,
  active,
  created_at,
  updated_at
)
select
  cp.id,
  cp.discount_type,
  coalesce(cp.discount_value, 0),
  cp.discount_duration_months,
  cp.discount_duration_months is null,
  cp.discount_start_date,
  cp.discount_end_date,
  true,
  coalesce(cp.updated_at, cp.created_at, now()),
  coalesce(cp.updated_at, cp.created_at, now())
from public.customer_profiles cp
where cp.discount_type is not null
  and cp.discount_type <> 'none'
  and not exists (
    select 1
    from public.customer_discounts cd
    where cd.customer_id = cp.id
      and cd.active = true
  );

alter table public.customer_subscription_history enable row level security;
alter table public.customer_upcoming_price_changes enable row level security;
alter table public.customer_discounts enable row level security;
alter table public.customer_invites enable row level security;

drop policy if exists "customer_subscription_history_admin_manage" on public.customer_subscription_history;
create policy "customer_subscription_history_admin_manage" on public.customer_subscription_history
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "customer_upcoming_price_changes_admin_manage" on public.customer_upcoming_price_changes;
create policy "customer_upcoming_price_changes_admin_manage" on public.customer_upcoming_price_changes
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "customer_discounts_admin_manage" on public.customer_discounts;
create policy "customer_discounts_admin_manage" on public.customer_discounts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "customer_invites_admin_manage" on public.customer_invites;
create policy "customer_invites_admin_manage" on public.customer_invites
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

commit;
