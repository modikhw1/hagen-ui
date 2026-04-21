# 01 – Supabase-schema, RLS och triggers

> Komplett SQL-källa för LeTrend admin. Bundlen innehöll generated
> `types/database.ts` men inte själva schema-migrationerna.
> Detta dokument återskapar dem så att en agent kan applicera dem rent
> i en tom Supabase-instans (eller ovanpå en befintlig — `IF NOT EXISTS`
> används överallt det går).
>
> Migrationerna är numrerade `001`…`045`. Numreringen följer hur original-
> repots kommentarer i koden refererar dem (t.ex. "Migration 040 saknas").
> Du kan slå ihop dem i en enda migration om du föredrar — viktigast är
> ordningen.

## Innehåll

- 1. Förberedelser (extensions, enums, helpers)
- 2. Auth & roller (profiles, user_roles, has_role)
- 3. Customer profiles
- 4. Team members
- 5. CM activities
- 6. Concepts + customer_concepts + concept_versions
- 7. Stripe-spegel (invoices, invoice_line_items, subscriptions, stripe_sync_log)
- 8. Service costs (overview)
- 9. TikTok stats (full spec i 05)
- 10. Triggers (updated_at, profile-creation, role-sync, concept-version)
- 11. RLS-policies för alla tabeller
- 12. Seed-data för utveckling
- 13. Realtime-config (valfritt)
- Checklista i slutet

---

## 1. Förberedelser

### `001_extensions.sql`

```sql
-- Krävs för gen_random_uuid()
create extension if not exists "pgcrypto";
-- Krävs för citext (case-insensitive emails)
create extension if not exists "citext";
```

### `002_enums.sql`

```sql
-- Användarroller
do $$ begin
  create type public.user_role as enum ('admin', 'content_manager', 'customer', 'user');
exception when duplicate_object then null; end $$;

-- Kundstatus
do $$ begin
  create type public.customer_status as enum (
    'pending',           -- skapad, inte invited
    'invited',           -- inbjudan skickad
    'pending_payment',   -- avtal nekat / väntar på betalning
    'agreed',            -- accepterat avtal, ej fullt aktiv
    'active',            -- abonnemang aktivt
    'past_due',
    'cancelled',
    'archived'
  );
exception when duplicate_object then null; end $$;

-- Stripe-miljö
do $$ begin
  create type public.stripe_env as enum ('test', 'live');
exception when duplicate_object then null; end $$;

-- Sync-status
do $$ begin
  create type public.sync_status as enum ('success', 'failed', 'skipped', 'in_progress');
exception when duplicate_object then null; end $$;

-- Sync-riktning
do $$ begin
  create type public.sync_direction as enum ('stripe_to_supabase', 'supabase_to_stripe');
exception when duplicate_object then null; end $$;

-- Aktivitetstyper för CM
do $$ begin
  create type public.activity_type as enum (
    'concept_added',
    'concept_removed',
    'concept_customized',
    'email_sent',
    'gameplan_updated',
    'customer_created',
    'customer_updated',
    'customer_invited'
  );
exception when duplicate_object then null; end $$;

-- Subscription interval
do $$ begin
  create type public.sub_interval as enum ('month', 'quarter', 'year');
exception when duplicate_object then null; end $$;

-- Pricing status
do $$ begin
  create type public.pricing_status as enum ('fixed', 'unknown');
exception when duplicate_object then null; end $$;

-- First invoice behavior
do $$ begin
  create type public.first_invoice_behavior as enum ('prorated', 'full', 'free_until_anchor');
exception when duplicate_object then null; end $$;

-- Discount type
do $$ begin
  create type public.discount_type as enum ('none', 'percent', 'amount', 'free_months');
exception when duplicate_object then null; end $$;
```

### `003_helpers.sql`

```sql
-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

---

## 2. Auth & roller

### `010_profiles.sql`

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext,
  business_name text,
  business_description text,
  social_links jsonb not null default '{}'::jsonb,
  tone text[] not null default '{}',
  energy text,
  industry text,
  matching_data jsonb not null default '{}'::jsonb,
  has_paid boolean not null default false,
  has_concepts boolean not null default false,
  has_onboarded boolean not null default false,
  is_admin boolean not null default false,
  role public.user_role not null default 'user',
  stripe_customer_id text,
  subscription_id text,
  subscription_status text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profiles_role on public.profiles (role);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
```

### `011_user_roles.sql` (säker källa, används av `has_role`)

```sql
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user on public.user_roles (user_id);

create or replace function public.has_role(_user_id uuid, _role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'admin'
  );
$$;
```

### `012_handle_new_user.sql` – auto-skapa profile vid signup

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_role public.user_role;
begin
  -- Kolla om användaren matchar en team_member -> CM/admin-roll
  select tm.role::public.user_role into team_role
  from public.team_members tm
  where lower(tm.email) = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, role, is_admin)
  values (
    new.id,
    new.email,
    coalesce(team_role, 'customer'),
    coalesce(team_role = 'admin', false)
  )
  on conflict (id) do update
    set email = excluded.email;

  -- Säker rolltabell
  if team_role is not null then
    insert into public.user_roles (user_id, role) values (new.id, team_role)
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'customer')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

### `013_sync_profile_role.sql` – håll `profiles.role` i synk med `user_roles`

```sql
create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    update public.profiles
       set role = new.role,
           is_admin = (new.role = 'admin')
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_roles_sync_profile on public.user_roles;
create trigger trg_user_roles_sync_profile
after insert or update on public.user_roles
for each row execute function public.sync_profile_role();
```

---

## 3. Customer profiles

### `020_customer_profiles.sql`

```sql
create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_email citext not null,
  customer_contact_name text,
  phone text,

  -- Tilldelning
  account_manager text,                          -- legacy: namn
  account_manager_profile_id uuid references public.profiles(id) on delete set null,

  -- Pris & abonnemang
  monthly_price numeric(10, 2) not null default 0,
  pricing_status public.pricing_status not null default 'fixed',
  subscription_interval public.sub_interval not null default 'month',
  contract_start_date date,
  billing_day_of_month smallint not null default 25 check (billing_day_of_month between 1 and 28),
  first_invoice_behavior public.first_invoice_behavior not null default 'prorated',

  -- Upcoming pris
  upcoming_monthly_price numeric(10, 2),
  upcoming_price_effective_date date,

  -- Faktureringstext / scope
  invoice_text text,
  scope_items jsonb not null default '[]'::jsonb,

  -- Rabatt (legacy-fält, modern rabatt skickas direkt mot Stripe coupon)
  discount_type public.discount_type default 'none',
  discount_value numeric(10, 2) default 0,
  discount_duration_months smallint,
  discount_start_date date,
  discount_end_date date,

  -- Stripe-länkar
  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  -- TikTok
  tiktok_handle text,
  tiktok_user_id text,
  upload_schedule text[],
  last_upload_at timestamptz,

  -- Flöde
  status public.customer_status not null default 'pending',
  invited_at timestamptz,
  agreed_at timestamptz,
  declined_at timestamptz,
  next_invoice_date timestamptz,

  -- Spel-plan / övrigt
  game_plan jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cp_status on public.customer_profiles (status);
create index if not exists idx_cp_account_manager on public.customer_profiles (account_manager_profile_id);
create index if not exists idx_cp_contact_email on public.customer_profiles (contact_email);
create index if not exists idx_cp_stripe_customer on public.customer_profiles (stripe_customer_id);
create index if not exists idx_cp_stripe_subscription on public.customer_profiles (stripe_subscription_id);

drop trigger if exists trg_customer_profiles_updated_at on public.customer_profiles;
create trigger trg_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();
```

---

## 4. Team members

### `025_team_members.sql`

```sql
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,

  name text not null,
  email citext,
  phone text,
  role public.user_role not null default 'content_manager',

  color text,
  bio text,
  region text,
  expertise text[],
  start_date date,
  notes text,
  avatar_url text,

  is_active boolean not null default true,
  invited_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (email)
);

create index if not exists idx_team_members_active on public.team_members (is_active);
create index if not exists idx_team_members_profile on public.team_members (profile_id);

drop trigger if exists trg_team_members_updated_at on public.team_members;
create trigger trg_team_members_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();
```

---

## 5. CM activities

### `030_cm_activities.sql`

```sql
create table if not exists public.cm_activities (
  id uuid primary key default gen_random_uuid(),
  cm_user_id uuid references public.profiles(id) on delete set null,
  cm_email citext not null,
  cm_id uuid references public.team_members(id) on delete set null,  -- nyare fält, används av useTeam
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,
  activity_type public.activity_type not null,
  type text generated always as (activity_type::text) stored,        -- alias för läsning
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cm_activities_user on public.cm_activities (cm_user_id);
create index if not exists idx_cm_activities_team on public.cm_activities (cm_id);
create index if not exists idx_cm_activities_customer on public.cm_activities (customer_profile_id);
create index if not exists idx_cm_activities_created on public.cm_activities (created_at desc);
```

> **Notera:** `useOverviewData.ts` och `useTeam.ts` läser både `cm_id`
> och `cm_user_id`/`cm_email` för bakåtkompatibilitet. Logger
> (`lib/activity/logger.ts`) skriver `cm_user_id` + `cm_email`. Nyare
> kod bör skriva `cm_id` också. En migration kan backfilla:
>
> ```sql
> update public.cm_activities ca
> set cm_id = tm.id
> from public.team_members tm
> where ca.cm_id is null
>   and lower(tm.email) = lower(ca.cm_email);
> ```

---

## 6. Concepts

### `035_concepts.sql`

```sql
create table if not exists public.concepts (
  id text primary key,
  source text not null,                 -- 'hagen' | 'cm_created' | 'vertex'
  created_by uuid references public.profiles(id) on delete set null,
  backend_data jsonb not null,
  overrides jsonb not null default '{}'::jsonb,
  previous_version jsonb,
  is_active boolean default false,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  version integer default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_concepts_source on public.concepts (source);
create index if not exists idx_concepts_active on public.concepts (is_active);

drop trigger if exists trg_concepts_updated_at on public.concepts;
create trigger trg_concepts_updated_at
before update on public.concepts
for each row execute function public.set_updated_at();

-- Versions
create table if not exists public.concept_versions (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null references public.concepts(id) on delete cascade,
  version integer not null,
  backend_data jsonb not null,
  overrides jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_summary text,
  created_at timestamptz not null default now(),
  unique (concept_id, version)
);

-- RPC som API-routen anropar
create or replace function public.update_concept_with_version(
  p_concept_id text,
  p_backend_data jsonb,
  p_overrides jsonb,
  p_changed_by uuid,
  p_change_summary text
) returns public.concepts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
  result public.concepts;
begin
  -- Spara nuvarande version till history
  insert into public.concept_versions (concept_id, version, backend_data, overrides, changed_by, change_summary)
  select c.id, coalesce(c.version, 1), c.backend_data, c.overrides, p_changed_by, p_change_summary
  from public.concepts c
  where c.id = p_concept_id;

  -- Update + bump version
  update public.concepts
     set backend_data = p_backend_data,
         overrides = p_overrides,
         version = coalesce(version, 1) + 1,
         previous_version = jsonb_build_object(
           'backend_data', backend_data,
           'overrides', overrides,
           'version', version
         ),
         updated_at = now()
   where id = p_concept_id
   returning * into result;

  return result;
end;
$$;

-- Customer-koncept-koppling (förenklad — original-types har fler fält)
create table if not exists public.customer_concepts (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  concept_id text not null references public.concepts(id) on delete cascade,
  cm_id uuid references public.profiles(id) on delete set null,
  base_concept_version integer,
  status text default 'pending',
  cm_note text,
  collection_id uuid,
  added_at timestamptz not null default now(),
  content_loaded_at timestamptz,
  content_loaded_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_cc_customer on public.customer_concepts (customer_profile_id);
create index if not exists idx_cc_concept on public.customer_concepts (concept_id);
create index if not exists idx_cc_status on public.customer_concepts (status);
```

---

## 7. Stripe-spegel

> **Migration 040** refereras i kod (`isMissingColumnError` ⇒ "Migration
> 040 saknas"). Det är just `environment`-kolumnen + `invoice_line_items`-
> tabellen. Den här migrationen är obligatorisk för att test/live-toggling
> ska fungera och för att `includeLineItems`-läget i InvoicesTab ska
> rendera fakturarader.

### `040_stripe_mirror.sql`

```sql
-- Invoices
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  stripe_invoice_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,

  amount_due integer not null default 0,            -- öre
  amount_paid integer not null default 0,           -- öre
  currency text not null default 'sek',
  status text not null,                             -- draft|open|paid|void|uncollectible

  hosted_invoice_url text,
  invoice_pdf text,

  due_date timestamptz,
  paid_at timestamptz,

  environment public.stripe_env not null default 'test',
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inv_customer_profile on public.invoices (customer_profile_id);
create index if not exists idx_inv_subscription on public.invoices (stripe_subscription_id);
create index if not exists idx_inv_status on public.invoices (status);
create index if not exists idx_inv_env_created on public.invoices (environment, created_at desc);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

-- Invoice line items
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  stripe_line_item_id text not null unique,
  stripe_invoice_id text not null,
  stripe_invoice_item_id text,                      -- pending invoice item / sub item
  description text not null default '',
  amount integer not null default 0,                -- öre
  currency text not null default 'sek',
  quantity integer not null default 1,
  period_start timestamptz,
  period_end timestamptz,
  data jsonb,
  environment public.stripe_env not null default 'test',
  created_at timestamptz not null default now()
);
create index if not exists idx_ili_invoice on public.invoice_line_items (stripe_invoice_id);

-- Subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,

  status text not null,                             -- active|trialing|past_due|canceled|incomplete|paused
  cancel_at_period_end boolean not null default false,
  amount integer not null default 0,                -- öre / period
  interval text,                                    -- month|year
  interval_count integer not null default 1,        -- 3 = quarter
  current_period_start timestamptz,
  current_period_end timestamptz,
  pause_collection jsonb,
  environment public.stripe_env not null default 'test',
  raw jsonb,
  created timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sub_customer_profile on public.subscriptions (customer_profile_id);
create index if not exists idx_sub_status on public.subscriptions (status);
create index if not exists idx_sub_env on public.subscriptions (environment);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- Sync log
create table if not exists public.stripe_sync_log (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text,
  event_type text not null,
  object_type text,                                 -- invoice|subscription|customer
  object_id text,
  sync_direction public.sync_direction not null,
  status public.sync_status not null,
  error_message text,
  payload_summary jsonb,
  environment public.stripe_env,
  created_at timestamptz not null default now(),
  unique (stripe_event_id)
);
create index if not exists idx_ssl_created on public.stripe_sync_log (created_at desc);
create index if not exists idx_ssl_status on public.stripe_sync_log (status);
create index if not exists idx_ssl_event_type on public.stripe_sync_log (event_type);
```

---

## 8. Service costs

### `045_service_costs.sql`

```sql
-- Daglig aggregering per tjänst (Vertex, Gemini, Stripe, Resend, Supabase…)
create table if not exists public.service_costs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  date date not null,
  calls integer not null default 0,
  cost_sek numeric(10, 4) not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (service, date)
);
create index if not exists idx_service_costs_date on public.service_costs (date desc);
create index if not exists idx_service_costs_service on public.service_costs (service);
```

> Fyll på via cron (Edge Function eller scheduled GCP job). Avsaknad
> hanteras gracefully av `api/admin/service-costs` som returnerar
> `{ entries: [], total: 0 }`.

---

## 9. TikTok stats (profil-URL + provider-sync, se `05-tiktok-integration.md`)

### `050_tiktok_stats.sql` (minimum for admin/studio utan OAuth-sparet)

```sql
create table if not exists public.tiktok_stats (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  snapshot_date date not null,
  followers integer not null default 0,
  total_videos integer not null default 0,
  videos_last_24h integer not null default 0,
  total_views_24h bigint not null default 0,
  engagement_rate numeric(5, 2) not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (customer_profile_id, snapshot_date)
);
create index if not exists idx_tts_customer_date on public.tiktok_stats (customer_profile_id, snapshot_date desc);

create table if not exists public.tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  video_id text not null,
  uploaded_at timestamptz not null,
  views bigint not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  cover_image_url text,
  share_url text,
  raw jsonb,
  fetched_at timestamptz not null default now(),
  unique (customer_profile_id, video_id)
);
create index if not exists idx_ttv_customer_uploaded on public.tiktok_videos (customer_profile_id, uploaded_at desc);
```

> Obs: `tiktok_oauth_tokens` hor inte till malbilden langre.
> Historisk schemarest kan forekomma i aldre migrationsfiler, men ny
> dokumentation och nya migrationer ska utga fran profil-URL +
> provider-sync och inte skapa eller anvanda OAuth-tokenlagring.

---

## 10. Triggers (sammanställning)

Alla triggers ovan har redan inkluderats. Sammanfattning:

| Tabell | Trigger |
|--------|---------|
| `auth.users` | `on_auth_user_created` → `handle_new_user()` |
| `user_roles` | `trg_user_roles_sync_profile` → `sync_profile_role()` |
| `profiles`, `customer_profiles`, `team_members`, `concepts`, `invoices`, `subscriptions` | `trg_*_updated_at` → `set_updated_at()` |

---

## 11. RLS-policies

> **All RLS måste vara på.** Använd `has_role(auth.uid(), '...')` —
> aldrig `select role from profiles where id = auth.uid()` (recursive).

### `060_rls_enable.sql`

```sql
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.cm_activities enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_versions enable row level security;
alter table public.customer_concepts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_sync_log enable row level security;
alter table public.service_costs enable row level security;
alter table public.tiktok_stats enable row level security;
alter table public.tiktok_videos enable row level security;
```

### `061_rls_profiles.sql`

```sql
-- Användaren ser sig själv. Admins ser alla. CM ser alla (för aktivitetsdashboard).
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
for update to authenticated
using (id = auth.uid() or public.has_role(auth.uid(), 'admin'))
with check (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Admins kan skapa/radera (server gör detta annars via service role)
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

### `062_rls_user_roles.sql`

```sql
drop policy if exists "user_roles_self_select" on public.user_roles;
create policy "user_roles_self_select" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

### `063_rls_customer_profiles.sql`

```sql
-- Admin: full access. CM: läs (för aktivitetsdashboard). Customer: läs sin egen.
drop policy if exists "cp_admin_all" on public.customer_profiles;
create policy "cp_admin_all" on public.customer_profiles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cp_cm_read" on public.customer_profiles;
create policy "cp_cm_read" on public.customer_profiles
for select to authenticated
using (public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "cp_customer_self" on public.customer_profiles;
create policy "cp_customer_self" on public.customer_profiles
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(p.email) = lower(customer_profiles.contact_email)
  )
);
```

### `064_rls_team_members.sql`

```sql
-- Alla autentiserade kan läsa team (visas i kunddetalj). Skrivning bara admin.
drop policy if exists "tm_read" on public.team_members;
create policy "tm_read" on public.team_members
for select to authenticated using (true);

drop policy if exists "tm_admin_write" on public.team_members;
create policy "tm_admin_write" on public.team_members
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

### `065_rls_cm_activities.sql`

```sql
drop policy if exists "act_admin_all" on public.cm_activities;
create policy "act_admin_all" on public.cm_activities
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "act_cm_read_own" on public.cm_activities;
create policy "act_cm_read_own" on public.cm_activities
for select to authenticated
using (
  public.has_role(auth.uid(), 'content_manager')
  and (cm_user_id = auth.uid() or lower(cm_email) = (select lower(email) from public.profiles where id = auth.uid()))
);

drop policy if exists "act_cm_insert_self" on public.cm_activities;
create policy "act_cm_insert_self" on public.cm_activities
for insert to authenticated
with check (
  cm_user_id = auth.uid() and public.has_role(auth.uid(), 'content_manager')
);
```

### `066_rls_concepts.sql`

```sql
-- Admin + CM kan läsa. Endast admin kan radera. CM kan skapa cm_created.
drop policy if exists "concepts_read" on public.concepts;
create policy "concepts_read" on public.concepts
for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "concepts_admin_write" on public.concepts;
create policy "concepts_admin_write" on public.concepts
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "concepts_cm_insert" on public.concepts;
create policy "concepts_cm_insert" on public.concepts
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'content_manager')
  and source = 'cm_created'
  and created_by = auth.uid()
);

drop policy if exists "concepts_cm_update_overrides" on public.concepts;
create policy "concepts_cm_update_overrides" on public.concepts
for update to authenticated
using (public.has_role(auth.uid(), 'content_manager'))
with check (public.has_role(auth.uid(), 'content_manager'));

-- Versions
drop policy if exists "cv_read" on public.concept_versions;
create policy "cv_read" on public.concept_versions
for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "cv_insert" on public.concept_versions;
create policy "cv_insert" on public.concept_versions
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));
```

### `067_rls_stripe_mirror.sql`

```sql
-- Endast admin (för billing-vyer). Service role bypassar RLS.
drop policy if exists "inv_admin_read" on public.invoices;
create policy "inv_admin_read" on public.invoices
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "inv_customer_self" on public.invoices;
create policy "inv_customer_self" on public.invoices
for select to authenticated
using (
  customer_profile_id in (
    select id from public.customer_profiles cp
    where exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower(cp.contact_email)
    )
  )
);

drop policy if exists "ili_admin_read" on public.invoice_line_items;
create policy "ili_admin_read" on public.invoice_line_items
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "sub_admin_read" on public.subscriptions;
create policy "sub_admin_read" on public.subscriptions
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "sub_customer_self" on public.subscriptions;
create policy "sub_customer_self" on public.subscriptions
for select to authenticated
using (
  customer_profile_id in (
    select id from public.customer_profiles cp
    where exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower(cp.contact_email)
    )
  )
);

drop policy if exists "ssl_admin_read" on public.stripe_sync_log;
create policy "ssl_admin_read" on public.stripe_sync_log
for select to authenticated using (public.has_role(auth.uid(), 'admin'));
```

### `068_rls_service_costs.sql`

```sql
drop policy if exists "sc_admin_read" on public.service_costs;
create policy "sc_admin_read" on public.service_costs
for select to authenticated using (public.has_role(auth.uid(), 'admin'));
```

### `069_rls_tiktok.sql`

```sql

drop policy if exists "tt_stats_admin_read" on public.tiktok_stats;
create policy "tt_stats_admin_read" on public.tiktok_stats
for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "tt_videos_admin_read" on public.tiktok_videos;
create policy "tt_videos_admin_read" on public.tiktok_videos
for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'content_manager'));

-- Customer kan se sin egen TikTok-data
drop policy if exists "tt_stats_customer_self" on public.tiktok_stats;
create policy "tt_stats_customer_self" on public.tiktok_stats
for select to authenticated
using (
  customer_profile_id in (
    select id from public.customer_profiles cp
    where exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower(cp.contact_email)
    )
  )
);
```

### `070_rls_customer_concepts.sql`

```sql
drop policy if exists "cc_admin_all" on public.customer_concepts;
create policy "cc_admin_all" on public.customer_concepts
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "cc_cm_all" on public.customer_concepts;
create policy "cc_cm_all" on public.customer_concepts
for all to authenticated
using (public.has_role(auth.uid(), 'content_manager'))
with check (public.has_role(auth.uid(), 'content_manager'));

drop policy if exists "cc_customer_read" on public.customer_concepts;
create policy "cc_customer_read" on public.customer_concepts
for select to authenticated
using (
  customer_profile_id in (
    select id from public.customer_profiles cp
    where exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower(cp.contact_email)
    )
  )
);
```

---

## 12. Seed-data för utveckling

### `099_seed_dev.sql` (kör endast i dev/test)

```sql
-- Skapa en första admin (byt e-post mot din egen efter signup)
-- 1. Signa upp via Supabase Auth med admin@letrend.se
-- 2. Kör:
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'admin@letrend.se'
on conflict do nothing;

-- Seed CMs
insert into public.team_members (name, email, role, color, is_active, region) values
  ('Alma Lindqvist', 'alma@letrend.se', 'content_manager', '#6B4423', true, 'Stockholm'),
  ('Erik Sandström', 'erik@letrend.se', 'content_manager', '#8B6914', true, 'Göteborg'),
  ('Nora Beijer',    'nora@letrend.se', 'content_manager', '#5A8F5A', true, 'Malmö')
on conflict (email) do nothing;

-- Seed två test-kunder
insert into public.customer_profiles
  (business_name, contact_email, customer_contact_name, monthly_price, status, account_manager)
values
  ('Café Rosé',     'info@caferose.se',    'Maria Holm', 3500, 'active', 'Alma Lindqvist'),
  ('Bar Centrale',  'hej@barcentrale.se',  'Johan Berg', 4200, 'active', 'Alma Lindqvist')
on conflict do nothing;
```

---

## 13. Realtime-config (valfritt)

Om billing-vyerna ska uppdateras live när webhooks landar:

```sql
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.subscriptions;
alter publication supabase_realtime add table public.stripe_sync_log;
```

UI:t lyssnar via React Query `invalidateQueries(['admin','billing','*'])`
i en `useEffect`-hook (se dok 04 för exempelkod).

---

## Checklista

Bocka av i ordning:

- [ ] **001** extensions
- [ ] **002** enums
- [ ] **003** helpers
- [ ] **010** profiles
- [ ] **011** user_roles + has_role + is_admin
- [ ] **012** handle_new_user trigger
- [ ] **013** sync_profile_role trigger
- [ ] **020** customer_profiles
- [ ] **025** team_members
- [ ] **030** cm_activities (+ backfill `cm_id`)
- [ ] **035** concepts + concept_versions + customer_concepts + RPC
- [ ] **040** invoices + invoice_line_items + subscriptions + stripe_sync_log (**migration 040** — refereras i kod)
- [ ] **045** service_costs
- [ ] **050** tiktok_* tabeller (full spec i 05)
- [ ] **060** RLS enable
- [ ] **061–070** RLS-policies för varje tabell
- [ ] **099** seed-data (endast dev)
- [ ] Realtime publication (valfritt)
- [ ] Verifiera: `select public.has_role('<din-uuid>', 'admin');` ⇒ `true`
- [ ] Verifiera: `select * from public.customer_profiles` som inloggad admin returnerar rader
- [ ] Verifiera: samma query som anonym ⇒ tom (RLS-blockerad)
- [ ] Regenerera `types/database.ts`: `supabase gen types typescript --project-id <id> > app/src/types/database.ts`

Klart? Gå till `02-stripe-byok-sync-webhooks.md`.
