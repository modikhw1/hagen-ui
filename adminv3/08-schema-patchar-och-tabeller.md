# 08 – Schemapatchar (logik-driven)

> **Källa:** `07_SCHEMA_PATCHES.md`. Levereras som **separata migrationsfiler ovanpå** dokument 01. Skriv inte om 01.

Skapa varje block som egen fil under `supabase/migrations/` i originalrepot, med tidsstämpel-prefix (`YYYYMMDDHHMMSS_namn.sql`). Migrationsordningen längst ned är bindande.

---

## 1. `customers` – patch

```sql
-- 20251101120000_customers_patch.sql
alter table public.customers
  add column tiktok_handle text,
  add column tiktok_profile_pic_url text,
  add column tiktok_profile_synced_at timestamptz,
  add column concepts_per_week smallint not null default 3,
  add column paused_until date,
  add column onboarding_state text not null default 'invited'
    check (onboarding_state in ('invited','cm_ready','live','settled')),
  add column onboarding_state_changed_at timestamptz default now(),
  add column from_demo_id uuid;  -- FK aktiveras efter demos-tabellen finns

create index customers_onboarding_state_idx
  on public.customers (onboarding_state)
  where onboarding_state <> 'settled';

create index customers_paused_until_idx
  on public.customers (paused_until)
  where paused_until is not null;

-- Trigger: bumpa onboarding_state_changed_at
create or replace function public.touch_onboarding_state_changed_at()
returns trigger language plpgsql as $$
begin
  if new.onboarding_state is distinct from old.onboarding_state then
    new.onboarding_state_changed_at := now();
  end if;
  return new;
end $$;

create trigger trg_customers_onboarding_state
before update on public.customers
for each row execute function public.touch_onboarding_state_changed_at();
```

---

## 2. `feedplan_concepts` – patch (skapas om saknas)

```sql
-- 20251101120100_feedplan_concepts_patch.sql
create table if not exists public.feedplan_concepts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text,
  body jsonb,
  created_by_cm_id uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

alter table public.feedplan_concepts
  add column if not exists planned_publish_date date,
  add column if not exists status text not null default 'draft'
    check (status in ('draft','ready','published','skipped'));

create index if not exists feedplan_concepts_buffer_idx
  on public.feedplan_concepts (customer_id, planned_publish_date)
  where status in ('draft','ready');
```

**Buffer-fråga (används i view + per-kund-API):**
```sql
select greatest(0, max(planned_publish_date) - current_date) as buffer_days
from public.feedplan_concepts
where customer_id = $1 and status in ('draft','ready');
```

---

## 3. `cm_interactions` – central interaktionslogg

```sql
-- 20251101120200_cm_interactions.sql
create table public.cm_interactions (
  id uuid primary key default gen_random_uuid(),
  cm_id uuid not null references public.team_members(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  type text not null check (type in (
    'login','feedplan_edit','concept_added','email_sent','note_added','tiktok_upload_synced'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index cm_interactions_cm_time_idx on public.cm_interactions (cm_id, created_at desc);
create index cm_interactions_customer_time_idx on public.cm_interactions (customer_id, created_at desc);
create index cm_interactions_cm_type_time_idx on public.cm_interactions (cm_id, type, created_at desc);

alter table public.cm_interactions enable row level security;

create policy "cm_interactions_self_select"
on public.cm_interactions for select to authenticated
using (
  cm_id in (select id from public.team_members where user_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);

create policy "cm_interactions_self_insert"
on public.cm_interactions for insert to authenticated
with check (
  cm_id in (select id from public.team_members where user_id = auth.uid())
);
```

**Helper för att logga från app-koden (TS):**
```ts
// src/lib/interactions.ts
export async function logInteraction(input: {
  cmId: string;
  customerId?: string;
  type: 'login'|'feedplan_edit'|'concept_added'|'email_sent'|'note_added'|'tiktok_upload_synced';
  metadata?: Record<string, unknown>;
}) {
  return supabase.from('cm_interactions').insert({
    cm_id: input.cmId,
    customer_id: input.customerId ?? null,
    type: input.type,
    metadata: input.metadata ?? null,
  });
}
```

Anropa `logInteraction` på alla relevanta points i appen (login-hook, feedplan-mutation, concept-create, mail-send, note-create, tiktok-sync).

---

## 4. `tiktok_publications` – för blockerings-detektion

```sql
-- 20251101120300_tiktok_publications.sql
create table public.tiktok_publications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  tiktok_video_id text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (customer_id, tiktok_video_id)
);

create index tiktok_publications_customer_time_idx
  on public.tiktok_publications (customer_id, published_at desc);

alter table public.tiktok_publications enable row level security;

create policy "tiktok_publications_admin_or_assigned_select"
on public.tiktok_publications for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or customer_id in (
    select c.id from public.customers c
    join public.team_members tm on tm.id = c.assigned_cm_id
    where tm.user_id = auth.uid()
  )
);
-- Insert/Update: enbart service_role (edge function). Ingen policy = endast service_role.
```

**Blockering = `current_date - max(published_at)::date > 7` per kund.** Se dokument 09 §3.

---

## 5. `demos` – ny tabell

```sql
-- 20251101120400_demos.sql
create type public.demo_status as enum ('draft','sent','opened','responded','won','lost','expired');

create table public.demos (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  tiktok_handle text,
  tiktok_profile_pic_url text,
  proposed_concepts_per_week smallint check (proposed_concepts_per_week between 1 and 5),
  proposed_price_sek integer,
  preliminary_feedplan jsonb,
  status public.demo_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz,
  lost_reason text,
  owner_admin_id uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

create index demos_status_time_idx on public.demos (status, status_changed_at desc);

create or replace function public.touch_demos_status_changed_at()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'sent' and new.sent_at is null then new.sent_at := now(); end if;
    if new.status = 'opened' and new.opened_at is null then new.opened_at := now(); end if;
    if new.status = 'responded' and new.responded_at is null then new.responded_at := now(); end if;
    if new.status in ('won','lost','expired') and new.resolved_at is null then new.resolved_at := now(); end if;
  end if;
  return new;
end $$;

create trigger trg_demos_status before update on public.demos
for each row execute function public.touch_demos_status_changed_at();

-- Aktivera FK från customers nu när demos finns
alter table public.customers
  add constraint customers_from_demo_id_fkey
  foreign key (from_demo_id) references public.demos(id);

alter table public.demos enable row level security;

create policy "demos_admin_all" on public.demos
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

---

## 6. `cm_notifications` – CM → admin

```sql
-- 20251101120500_cm_notifications.sql
create type public.cm_notification_priority as enum ('normal','urgent');

create table public.cm_notifications (
  id uuid primary key default gen_random_uuid(),
  from_cm_id uuid not null references public.team_members(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  message text not null,
  priority public.cm_notification_priority not null default 'normal',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_admin_id uuid references public.team_members(id),
  resolution_note text
);

create index cm_notifications_open_idx
  on public.cm_notifications (resolved_at, priority, created_at desc)
  where resolved_at is null;

alter table public.cm_notifications enable row level security;

create policy "cm_notifications_cm_insert"
on public.cm_notifications for insert to authenticated
with check (from_cm_id in (select id from public.team_members where user_id = auth.uid()));

create policy "cm_notifications_cm_select_own"
on public.cm_notifications for select to authenticated
using (
  from_cm_id in (select id from public.team_members where user_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);

create policy "cm_notifications_admin_update"
on public.cm_notifications for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

---

## 7. `attention_snoozes` – polymorf "markerad som hanteras"

```sql
-- 20251101120600_attention_snoozes.sql
create type public.attention_subject_type as enum (
  'invoice','onboarding','cm_notification','customer_blocking','demo_response'
);

create table public.attention_snoozes (
  id uuid primary key default gen_random_uuid(),
  subject_type public.attention_subject_type not null,
  subject_id text not null,                   -- text för Stripe-IDn
  snoozed_until timestamptz,                  -- null = tills status ändras
  note text,
  snoozed_by_admin_id uuid not null references public.team_members(id),
  snoozed_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text check (release_reason in ('expired','escalated','manual') or release_reason is null)
);

create unique index attention_snoozes_active_unique
  on public.attention_snoozes (subject_type, subject_id)
  where released_at is null;

alter table public.attention_snoozes enable row level security;

create policy "attention_snoozes_admin_all"
on public.attention_snoozes for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
```

**Auto-release-jobb** (cron edge function, kör var 15:e min):

```sql
-- Kandidater att release:a
update public.attention_snoozes
set released_at = now(), release_reason = 'expired'
where released_at is null
  and snoozed_until is not null
  and snoozed_until < now();
```

Eskalering (faktura blivit 14d äldre, ny faktura för samma kund, etc.) hanteras som logik i edge function — den UPDATE:ar `released_at + release_reason='escalated'` när villkor uppfylls. Se dokument 03 (Stripe-webhook).

---

## 8. RLS-sammanfattning

| Tabell | Select | Insert | Update | Delete |
|---|---|---|---|---|
| `cm_interactions` | egna + admin | egna | – | – |
| `cm_notifications` | egna + admin | egna (CM) | admin | – |
| `attention_snoozes` | admin | admin | admin | admin |
| `demos` | admin | admin | admin | admin |
| `tiktok_publications` | admin + tilldelad CM | service_role | service_role | service_role |
| `feedplan_concepts` | tilldelad CM + admin | tilldelad CM + admin | tilldelad CM + admin | admin |

Följer mönstret från `has_role()` security-definer i dokument 01.

---

## 9. Migrationsordning (bindande)

1. `customers_patch`
2. `feedplan_concepts_patch`
3. `cm_interactions`
4. `tiktok_publications`
5. `demos` (FK till `customers.from_demo_id` aktiveras här)
6. `cm_notifications`
7. `attention_snoozes`

Varje som **egen fil**, prefixad enligt Supabase CLI-konvention.
