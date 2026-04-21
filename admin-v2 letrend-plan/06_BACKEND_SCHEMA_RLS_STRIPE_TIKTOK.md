# Kapitel 06 — Backend: Schema, RLS, Stripe Hardening, TikTok & Activities

**Förutsättning:** Kapitel 01–05 klara på UI-sidan (eller pågår parallellt).

**Outcome:** Databasen har all kolumn-stöd som UI behöver, RLS-policies är
strikta, Stripe-webhooken är härdad och idempotent, TikTok-statistik
sparas i en ny tabell med daglig snapshot, och `cm_activities` fylls
automatiskt via DB-triggers + service-side hooks.

> **SQL-kod:** Alla DDL-statements finns färdigformade i
> `07_SQL_MIGRATIONS.sql` — kör den filen i Supabase SQL editor som en
> sammanhållen transaktion. Detta kapitel förklarar **varför** och **hur**
> backend-koden ska använda strukturerna.

---

## 6.1 Schema-tillägg som UI förutsätter

### `customer_profiles` — nya kolumner

| Kolumn | Typ | Default | Användning |
|--------|-----|---------|------------|
| `phone` | `text` | NULL | Visas i Customers-modal & detail |
| `upload_schedule` | `text[]` | `'{}'` | CM-puls "expected per week"-beräkning |
| `last_upload_at` | `timestamptz` | NULL | CM hover "senaste kunduppladdning" |
| `discount_type` | `text` | NULL | rabatttyp (`'percent'`/`'amount'`/`'free_period'`) |
| `discount_value` | `numeric` | NULL | belopp eller procent |
| `discount_duration_months` | `int` | NULL | NULL = ongoing |
| `discount_ends_at` | `timestamptz` | NULL | Beräknad utgång om duration satt |
| `upcoming_price_change_at` | `timestamptz` | NULL | Schemalagd prisändring |
| `upcoming_price_change_value` | `numeric` | NULL | Nytt månadspris |
| `contract_start_date` | `date` | NULL | Wizard-fält |
| `billing_day_of_month` | `int` | 25 | Fakturakörning |
| `account_manager_profile_id` | `uuid` | NULL | FK → `profiles.id` |
| `next_invoice_date` | `date` | NULL | Cache, beräknas av webhook |

### Nya tabeller

#### `tiktok_stats` — daglig snapshot per kund

```sql
create table public.tiktok_stats (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  snapshot_date date not null,
  followers int not null,
  total_videos int not null,
  videos_last_24h int default 0,
  total_views_24h bigint default 0,
  engagement_rate numeric(5,2) default 0,
  raw_payload jsonb,
  fetched_at timestamptz not null default now(),
  unique (customer_profile_id, snapshot_date)
);

create index idx_tiktok_stats_customer_date on public.tiktok_stats (customer_profile_id, snapshot_date desc);
```

`/api/admin/customers/[id]/tiktok-stats` aggregerar från denna tabell:

```ts
// app/api/admin/customers/[id]/tiktok-stats/route.ts
import { withAuth } from '@/lib/auth/api-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(['admin'], async (_req, { params }) => {
  const { id } = params;
  const today = new Date();
  const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('tiktok_stats')
    .select('snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate')
    .eq('customer_profile_id', id)
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json(null);

  const latest = data[data.length - 1];
  const earliest = data[0];
  const last7 = data.slice(-7);

  const followers = latest.followers;
  const follower_delta_7d = last7.length >= 2 ? Math.round(((latest.followers - last7[0].followers) / Math.max(1, last7[0].followers)) * 100 * 10) / 10 : 0;
  const follower_delta_30d = Math.round(((latest.followers - earliest.followers) / Math.max(1, earliest.followers)) * 100 * 10) / 10;

  return Response.json({
    followers,
    follower_delta_7d,
    follower_delta_30d,
    avg_views_7d: Math.round(last7.reduce((s, d) => s + Number(d.total_views_24h), 0) / Math.max(1, last7.length)),
    avg_views_30d: Math.round(data.reduce((s, d) => s + Number(d.total_views_24h), 0) / data.length),
    engagement_rate: Number(latest.engagement_rate),
    total_videos: latest.total_videos,
    videos_last_7d: last7.reduce((s, d) => s + d.videos_last_24h, 0),
    follower_history_30d: data.map(d => d.followers),
    views_history_30d: data.map(d => Number(d.total_views_24h)),
  });
});
```

#### `service_costs` — daglig kostnadssnapshot

```sql
create table public.service_costs (
  id uuid primary key default gen_random_uuid(),
  service text not null,             -- 'gemini', 'tiktok-fetcher', 'supabase', 'stripe', 'resend', 'gcp'
  date date not null,
  calls int not null default 0,
  cost_sek numeric(10,2) not null default 0,
  unique (service, date)
);
create index idx_service_costs_date on public.service_costs (date desc);
```

Endpoint:

```ts
// app/api/admin/service-costs/route.ts
export const GET = withAuth(['admin'], async (req) => {
  const days = Number(new URL(req.url).searchParams.get('days') || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from('service_costs')
    .select('service, date, calls, cost_sek')
    .gte('date', cutoff);

  const byService = new Map<string, { calls_30d: number; cost_30d: number; trend: number[] }>();
  (data ?? []).forEach(row => {
    const e = byService.get(row.service) ?? { calls_30d: 0, cost_30d: 0, trend: [] };
    e.calls_30d += row.calls;
    e.cost_30d += Number(row.cost_sek);
    e.trend.push(Number(row.cost_sek));
    byService.set(row.service, e);
  });

  const entries = Array.from(byService.entries()).map(([service, e]) => ({ service, ...e }));
  return Response.json({ entries, total: entries.reduce((s, e) => s + e.cost_30d, 0) });
});
```

Fyll på `service_costs` via en cron-job (Supabase scheduled function) som
daily summerar API-anrop från respektive logg/metric. Detaljer beror på
externa providers — markera som teknisk skuld om logging saknas.

#### `cm_activities` — om saknas: skapa

```sql
create table if not exists public.cm_activities (
  id uuid primary key default gen_random_uuid(),
  cm_id uuid references public.team_members(id) on delete set null,
  cm_email text,
  cm_name text,
  type text not null,     -- 'concept_created', 'concept_sent', 'feedback', 'mail', 'note', 'upload', 'customer_created', ...
  description text,
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
create index idx_cm_activities_created on public.cm_activities (created_at desc);
create index idx_cm_activities_cm on public.cm_activities (cm_id, created_at desc);
create index idx_cm_activities_customer on public.cm_activities (customer_profile_id, created_at desc);
```

Triggers som auto-loggar (i `07_SQL_MIGRATIONS.sql`):
- När en `customer_concepts`-rad skapas → logga `concept_created`
- När `customer_concepts.status` ändras till `'sent'` → logga `concept_sent`
- När `customer_profiles.last_upload_at` uppdateras → logga `upload`

```sql
create or replace function public.log_concept_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into cm_activities (cm_id, cm_email, type, customer_profile_id, description, metadata)
  values (
    (select id from team_members where profile_id = NEW.created_by),
    (select email from auth.users where id = NEW.created_by),
    case when TG_OP = 'INSERT' then 'concept_created'
         when NEW.status = 'sent' and OLD.status is distinct from 'sent' then 'concept_sent'
         else 'concept_updated' end,
    NEW.customer_profile_id,
    coalesce(NEW.title, 'Koncept'),
    jsonb_build_object('concept_id', NEW.id, 'status', NEW.status)
  );
  return NEW;
end $$;

create trigger trg_concept_insert after insert on customer_concepts
  for each row execute function log_concept_activity();
create trigger trg_concept_update after update of status on customer_concepts
  for each row when (OLD.status is distinct from NEW.status)
  execute function log_concept_activity();
```

---

## 6.2 RLS-policies

### Roll-tabell — om saknas, skapa enligt `<user-roles>`-mönstret

```sql
create type public.app_role as enum ('admin', 'content_manager', 'customer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
```

> **Viktigt:** Om originalrepot redan har en `profiles.role` som används
> av `resolveAppRole`, **migrera in** befintliga roller till `user_roles`
> via en engångskörning i 07-SQL och behåll `resolveAppRole` att läsa
> från `user_roles` istället.

### Policies (tabell-för-tabell)

```sql
-- customer_profiles
alter table customer_profiles enable row level security;

create policy "Admins läser allt" on customer_profiles
  for select to authenticated using (has_role(auth.uid(), 'admin'));

create policy "CMs läser sina kunder" on customer_profiles
  for select to authenticated using (
    has_role(auth.uid(), 'content_manager') and exists (
      select 1 from team_members tm
      where tm.profile_id = auth.uid() and tm.id = customer_profiles.account_manager_profile_id
    )
  );

create policy "Kunder läser sin egen profil" on customer_profiles
  for select to authenticated using (
    has_role(auth.uid(), 'customer') and customer_profiles.user_id = auth.uid()
  );

create policy "Bara admin skriver" on customer_profiles
  for all to authenticated using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin'));

-- team_members, cm_activities, customer_concepts, invoices, subscriptions, tiktok_stats, service_costs
-- analoga policies — admin kan allt; CM kan läsa sitt + sina kunders data; kund kan läsa sin egen.
```

Se `07_SQL_MIGRATIONS.sql` för fullständig policy-uppsättning.

> Originalets browser-Supabase-anrop från admin-overview (`supabase.from('customer_profiles').select(...)`)
> fungerar **bara** om dessa policies finns. Verifiera att inloggad admin
> kan läsa, och att en customer-token INTE kan se andra kunders rader.

---

## 6.3 Stripe webhook hardening

Originalets `app/api/stripe/webhook/route.ts` (bundle 10) hanterar de
viktigaste eventen via `mirror.ts`. Härda enligt följande:

### Krav

1. **Signaturverifiering** — använd `stripe.webhooks.constructEvent(body, sig, secret)`. Avvisa med 400 om fel.
2. **Idempotens** — skapa en tabell `stripe_processed_events`:
   ```sql
   create table stripe_processed_events (
     event_id text primary key,
     event_type text not null,
     processed_at timestamptz not null default now()
   );
   ```
   Före processing: `select 1 from stripe_processed_events where event_id = $1`. Om finns: returnera 200 utan att göra om.
   Efter lyckad processing: `insert ... on conflict do nothing`.
3. **Loggning** — vid både success och failure: skriv till `stripe_sync_log`:
   ```sql
   create table if not exists stripe_sync_log (
     id uuid primary key default gen_random_uuid(),
     event_id text,
     event_type text,
     environment text not null,    -- 'test' | 'live'
     status text not null,          -- 'success' | 'failed'
     error_message text,
     payload_summary jsonb,
     created_at timestamptz not null default now()
   );
   ```
4. **Transaktionalitet** — varje event ska antingen helt skrivas (mirror + processed_events + log) eller rullas tillbaka. Använd `supabaseAdmin.rpc('process_stripe_event', { ... })` om du vill atomisera, annars sätt mönstret att log skrivs sist.
5. **Environment-detection** — `stripe_sync_log.environment` baseras på `process.env.STRIPE_SECRET_KEY` prefix (`sk_test_` → 'test', `sk_live_` → 'live') eller env-var `STRIPE_ENVIRONMENT`.

### Viktiga events att mirra

| Event | Tabell att uppdatera | Logik |
|-------|----------------------|-------|
| `customer.created/updated` | `customer_profiles` | matcha på `stripe_customer_id`, uppsert |
| `customer.subscription.created/updated/deleted` | `subscriptions` | upsert; sätt `customer_profiles.next_invoice_date` |
| `invoice.created/finalized/paid/payment_failed/voided` | `invoices` | upsert; vid `paid` sätt `paid_at`; vid `payment_failed` höj counter |
| `customer.discount.created/updated/deleted` | `customer_profiles.discount_*` | spegla i admin-fält |
| `invoiceitem.created/deleted` | (inget — admin läser direkt från Stripe via pending-items API) | bara logga |

### Sync-routes (manuell)

`/api/studio/stripe/sync-invoices` och `/sync-subscriptions` (bundle 10):
- Pagination med `starting_after`
- Per batch: upsert till respektive tabell
- Skriv en summa-rad till `stripe_sync_log` med `status='success'` och `payload_summary={count, took_ms}`
- Vid fel: skriv `status='failed'` och returnera 500 med detaljer

---

## 6.4 Stripe + öre/SEK — kontrakt-checklista

| Plats | Enhet | Kommentar |
|-------|-------|-----------|
| `customer_profiles.monthly_price` | **SEK heltal** | Admin sätter, UI visar |
| Stripe `Price.unit_amount` | öre | Skapas av `subscription-pricing.ts` med `sekToOre()` |
| Stripe `InvoiceItem.amount` | öre | `createPendingInvoiceItem` |
| `invoices.amount_due/_paid/_total` | öre | Spegel av Stripe-värde, oförändrat |
| `subscriptions.amount` | öre | Spegel av subscription items unit_amount |
| Pending invoice items i UI | input som SEK → API konverterar | `POST` body `{ amount: 250 }` → multiplicera *100 i route |

Ändra `subscription-pricing.ts` om det inte redan kör `Math.round(sek * 100)`
istället för `sek * 100` (för att undvika floating point-fel vid 99.99 etc).

---

## 6.5 TikTok-fetcher

Lägg en Supabase Edge Function (eller separat cron-job i hagen-ui-repots
befintliga jobb-system) som kör en gång/dag per kund med
`tiktok_handle`:

1. Anropa TikTok API (Display API eller Research API beroende på plan)
2. Beräkna `videos_last_24h`, `total_views_24h`, `engagement_rate` (likes+comments+shares / views)
3. Upsert till `tiktok_stats` med dagens datum
4. Uppdatera `customer_profiles.last_upload_at` om senaste video är nyare

Fail-safe: om API:t svarar med fel, skriv en rad till `cm_activities` med
`type='tiktok_fetch_failed'` så billing-health-tab kan visa det.

> Detta är den största potentiella tidsdraken. Om TikTok-credentials inte
> är klara: leverera kapitel 06 utan fetcher-implementation och håll
> `tiktok_stats`-tabellen tom — UI kommer då gömma TikTok-sektionen
> automatiskt (se 4.6 acceptanskriterier).

---

## 6.6 API-endpoints — översikt över vad som finns/saknas

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/admin/customers` | finns | Verifiera RLS täcker det |
| `POST /api/admin/customers` | finns | Lägg till `send_invite_now`, `phone` (kapitel 03) |
| `GET /api/admin/customers/[id]` | finns | |
| `PATCH /api/admin/customers/[id]` | finns | Stöd för fler partial fields |
| `DELETE /api/admin/customers/[id]` | finns | Bekräfta att den arkiverar + cancellerar sub |
| `POST /api/admin/customers/[id]/discount` | finns | |
| `DELETE /api/admin/customers/[id]/discount` | finns | |
| `GET/POST /api/admin/customers/[id]/invoice-items` | finns | |
| `DELETE /api/admin/customers/[id]/invoice-items/[itemId]` | finns | |
| `GET /api/admin/customers/[id]/tiktok-stats` | **NY** | Skapa enligt 6.1 |
| `GET /api/admin/invoices` | finns | Lägg till `customer_profile_id`-filter |
| `POST /api/admin/invoices/create` | finns | |
| `GET /api/admin/subscriptions` | finns | |
| `GET /api/admin/billing-health` | finns | |
| `GET /api/admin/billing-health/log` | **NY** | Senaste 50 sync-log entries |
| `GET /api/admin/team` | finns | |
| `POST /api/admin/team` | finns | Verifiera invite-flow |
| `PATCH /api/admin/team/[id]` | finns | |
| `DELETE /api/admin/team/[id]` | finns | Arkivera, ev. omfördela kunder |
| `GET /api/admin/tiktok-summary` | **NY** | För team-sidan |
| `GET /api/admin/service-costs` | **NY** | För overview |
| `GET /api/admin/demos` | **NY** | För overview |
| `POST /api/studio/stripe/sync-invoices` | finns | Härda enligt 6.3 |
| `POST /api/studio/stripe/sync-subscriptions` | finns | |
| `POST /api/stripe/webhook` | finns | Härda + idempotens |

---

## 6.7 Acceptanskriterier för kapitel 06

- [ ] `07_SQL_MIGRATIONS.sql` körd utan fel mot Supabase-projektet.
- [ ] `customer_profiles` har alla nya kolumner och `phone`/`upload_schedule` syns i klientens TypeScript-typer (`types/database.ts` regenererad via `supabase gen types`).
- [ ] `tiktok_stats`, `service_costs`, `cm_activities`, `stripe_processed_events`, `user_roles` finns och har RLS aktiverat.
- [ ] `has_role()`-funktion finns och används i policies.
- [ ] Admin-användare kan via klient-Supabase läsa `customer_profiles`; CM ser bara sina; kund bara sin egen — verifierat med tre testkonton.
- [ ] Webhook avvisar fel signatur (testa med curl + felaktig signatur).
- [ ] Webhook deduplicerar: skicka samma event-id två gånger → bara en `stripe_sync_log`-rad.
- [ ] Manuell sync upsertar utan att skapa duplikat.
- [ ] Concept-trigger skapar `cm_activities`-rader när du skapar/skickar koncept.
- [ ] `/api/admin/customers/[id]/tiktok-stats` svarar 200 med data när snapshots finns, `null` när ej.
- [ ] `/api/admin/service-costs?days=30` svarar med `{entries, total}` även när tomt (`{entries:[], total:0}`).
- [ ] Stripe-helpers använder `Math.round(sek * 100)` konsekvent.

→ Fortsätt till `07_SQL_MIGRATIONS.sql` (kör den) och `08_SEQUENTIAL_CHECKLIST.md` för slutlig avbockning.
