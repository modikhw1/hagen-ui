# LeTrend Admin – Refactor Guide
## Bundle 03: Hooks & Core APIs

> **Syfte:** Sekventiell, kryssbar checklista för en Codex-agent. Fokus på datalagret: query-keys, fetch-orkestrering, deduplikation av domänlogik mellan klient-hooks och server-routes, action-uppdelning av breda endpoints, normaliserade responses.
>
> **Förutsättning:** Bundle 01 (Customer detail + API-decomposition) och Bundle 02 (Billing/Overview/Team) är genomförda eller pågår. Den här guiden bygger på samma mönster — tunna routes, isolerade action-handlers, Zod-schemas, riktade query-invalidations, audit log på skrivande operationer.

---

## Innehåll

- [Fas 0 — Diagnos & invarianter](#fas-0)
- [Fas 1 — Centralt query-key-bibliotek + invalidation-helpers](#fas-1)
- [Fas 2 — Centralt API-fetch-lager (apiClient)](#fas-2)
- [Fas 3 — Centralt response-shape: ta död på `customer`/`profile`-dualismen](#fas-3)
- [Fas 4 — Generera DTOs + zod-runtime-validering (en sanning för shape)](#fas-4)
- [Fas 5 — `useCustomerDetail` + smala child-hooks](#fas-5)
- [Fas 6 — `useCustomers` lättviktslista + selektorer](#fas-6)
- [Fas 7 — `useTeam` — flytta hela aggregeringen server-side](#fas-7)
- [Fas 8 — `useOverviewData` — en endpoint, en payload](#fas-8)
- [Fas 9 — Bryt upp `/api/admin/customers` (lista+create) i action-routes](#fas-9)
- [Fas 10 — Bryt upp `/api/admin/team` (GET+POST+resend+invite)](#fas-10)
- [Fas 11 — `/api/admin/invoices` & `/api/admin/subscriptions` — slim down](#fas-11)
- [Fas 12 — `/api/admin/overview/operational` → ersätts av `/api/admin/overview`](#fas-12)
- [Fas 13 — Schema-fallbacks: konsolidera till migrations + telemetri](#fas-13)
- [Fas 14 — Cross-cutting: caching, errors, audit, RBAC](#fas-14)
- [Bilaga A — File map (Old → New)](#bilaga-a)
- [Bilaga B — Query-keys (kanonisk lista)](#bilaga-b)
- [Bilaga C — Test-checklista per fas](#bilaga-c)

---

<a id="fas-0"></a>
## Fas 0 — Diagnos & invarianter

**Identifierade problem i Bundle 03:**

| Område | Problem |
|---|---|
| Query-keys | Strängliterala keys utspridda. `['admin','customers']`, `['admin','customer',id]`, `['admin','team-members']`, `['admin','team-full']`, `['admin','overview']`, `['admin','billing','invoices', env]` — ingen central lista, hög risk för fel-invalidation. |
| Hooks | Varje `queryFn` har egen `fetch` + `JSON.parse + error throw`-boilerplate (≈10 rader × N hooks). Ingen retry, timeout eller AbortSignal. |
| Response-shape | `useCustomers` accepterar **både** `payload.customers` och `payload.profiles` (legacy). `useCustomerDetail` accepterar `payload.customer || payload.profile`. Detta är duplicerad bakåtkompatibilitet på fel ställe. |
| Mappning | `useCustomerDetail.mapCustomer` är **170 rader manuell `typeof`-narrowing** för en payload som redan är typad i databasen. Bör genereras eller Zod-valideras. |
| `useTeam` | Kör hela aggregeringen klient-side: 90-dagars baseline, 14-dagars dots, MRR-summering, customer-coverage-resolve, assignment-history-mapping. Detta är affärslogik som bör ligga server-side. |
| `useOverviewData` | Gör **5+ parallella fetch-anrop** mot olika endpoints och stiter ihop till `OverviewPayload`. Dubbel-laddar `customers` (även Overview använder `/api/admin/customers`) och `team` som redan finns i andra hooks. |
| `useOverviewData` | Ingen request dedupliceras — om Overview och Customers-listan visas tätt så hämtas `/api/admin/customers` två gånger. |
| `/api/admin/customers` (route-3) | GET + POST i samma fil. POST orkestrerar create + assignment-sync + operational-sync + ev. invite + invite-logging + audit-log. ≈170 rader — för mycket logik per route. |
| `/api/admin/customers` GET | Returnerar **både** `customers` och `profiles` med samma data — bara för att klienten har två-vägs-fallback. Cementerar legacy-shapen. |
| `/api/admin/invoices` | 266 rader. Innehåller fetch + 2 fallback-paths för saknad migration + manuell join mot `customer_profiles` + manuell aggregering av `stripe_credit_notes`/`stripe_refunds` + derived `display_status`-logik. Bör vara en SQL-vy. |
| `/api/admin/subscriptions` | Identiskt mönster: fetch + fallback för saknad kolumn + manuell customer-name-join. |
| `/api/admin/team` (route-7) | GET + POST + `resend`-action i POST + insert med fallback för saknad `commission_rate`-kolumn + invite-flow + profil-skapande. ≈480 rader — bryts upp i Fas 10. |
| `/api/admin/team` POST | `body.resend` växlar hela beteendet utifrån en flagga — inte en separat endpoint. Klienten måste veta detta. |
| `/api/admin/overview/operational` | Använder överallt `(supabase.from('xxx' as never) as never)`-castar för att kringgå typgenerering. Skarp signal att types är out of sync med DB. |
| Schema-fallbacks | `isMissingTableError`/`isMissingColumnError`/`schemaWarnings` återkommer i ≥6 endpoints. Migrationer bör vara obligatoriska — inte runtime-detekterade. |
| Stripe-koppling | Råa fält som `amount_due`, `amount_paid`, `stripe_invoice_id`, `current_period_end` läcker rakt upp till klient-hookar. Ingen DTO-gräns. |

**Invarianter som måste bevaras:**

1. Alla skrivande endpoints loggar till `admin_audit_log` (Bundle 01 Fas 8).
2. Stripe-skrivande operationer: `Idempotency-Key` (admin_id, action, target_id, dag).
3. Pengar i öre överallt; konvertering endast i UI-formatters.
4. Svenska felmeddelanden i UI-throws bevaras (samma strängar som idag).
5. Befintliga query-key-namn får skifta form (Fas 1) men `useCustomers()`-API:et till komponenter ska vara source-compatible — komponentbyten görs i en sista pass.

---

<a id="fas-1"></a>
## Fas 1 — Centralt query-key-bibliotek + invalidation-helpers

### 1.1 Skapa `lib/admin/queryKeys.ts`
```ts
export const qk = {
  customers: {
    list: () => ['admin','customers'] as const,
    detail: (id: string) => ['admin','customers', id] as const,
    invoices: (id: string) => ['admin','customers', id, 'invoices'] as const,
    subscription: (id: string, stripeSubId: string | null) =>
      ['admin','customers', id, 'subscription', stripeSubId] as const,
    tiktok: (id: string) => ['admin','customers', id, 'tiktok'] as const,
    activity: (id: string) => ['admin','customers', id, 'activity'] as const,
  },
  team: {
    list: () => ['admin','team'] as const,                         // lightweight members
    overview: () => ['admin','team','overview'] as const,          // tung aggregering
    member: (id: string) => ['admin','team', id] as const,
  },
  billing: {
    invoices: (env: 'all'|'test'|'live') => ['admin','billing','invoices', env] as const,
    subscriptions: (env: 'all'|'test'|'live') => ['admin','billing','subscriptions', env] as const,
    health: () => ['admin','billing','health'] as const,
  },
  overview: {
    main: () => ['admin','overview'] as const,
    operational: () => ['admin','overview','operational'] as const, // tas bort i Fas 12
  },
  notifications: () => ['admin','notifications'] as const,
};
```

### 1.2 Skapa `lib/admin/invalidate.ts`
- `invalidateCustomer(qc, id)` → invaliderar detail + invoices + subscription + tiktok + activity och listan.
- `invalidateTeam(qc)` → list + overview.
- `invalidateBilling(qc, env?)` → invoices(env) + subscriptions(env) + health.
- `invalidateAfterCustomerWrite(qc, id)` → customer + overview (eftersom KPI och attention beror på det).

### 1.3 Refactor pass
- Sök/ersätt alla `queryKey: ['admin', ...]`-strängliteraler i alla hooks och komponenter mot `qk.*`-helpers.
- Sök/ersätt alla `invalidateQueries({ queryKey: [...] })` i komponenter mot helpers från `invalidate.ts`.

### 1.4 Acceptanskriterier
- `grep -r "queryKey: \['admin'" src/` → 0 träffar utanför `queryKeys.ts`.
- TypeCheck och `bun run build` passerar.

---

<a id="fas-2"></a>
## Fas 2 — Centralt API-fetch-lager (`apiClient`)

### 2.1 Skapa `lib/admin/api-client.ts`
```ts
type ApiOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string,
              public readonly field?: string, public readonly raw?: unknown) {
    super(message);
  }
}

export const apiClient = {
  get<T>(path: string, opts?: ApiOptions): Promise<T> { /* ... */ },
  post<T>(path: string, body: unknown, opts?: ApiOptions): Promise<T> { /* ... */ },
  patch<T>(path: string, body: unknown, opts?: ApiOptions): Promise<T> { /* ... */ },
  delete<T>(path: string, opts?: ApiOptions): Promise<T> { /* ... */ },
};
```

Ansvar:
- `credentials: 'include'` automatiskt.
- Bygg querystring från `opts.query` (filtrera bort `undefined`/`null`).
- Parsa JSON med try/catch; om `!response.ok` → kasta `ApiError(status, payload.error || defaultMsg)`.
- Default `Accept: application/json`, `Content-Type: application/json` för body-metoder.
- Stöd `signal` så React Query kan avbryta in-flight requests.

### 2.2 Refactor pass
- I varje hook (`useCustomers`, `useCustomerDetail`, `useTeam`, `useOverviewData`): ersätt `fetch(...).then(parse).then(throw)` med ett `apiClient.get<T>(path, { signal, query: { ... } })`-anrop.
- React Query `queryFn` får `signal` automatiskt — vidarebefordra det.

### 2.3 Acceptanskriterier
- Inga `fetch(`-anrop direkt i `src/hooks/admin/**`. Alla går via `apiClient`.
- AbortController-test: snabb sidnavigering avbryter pågående requests (inga "setState on unmounted"-warnings).

---

<a id="fas-3"></a>
## Fas 3 — Centralt response-shape: ta död på `customer`/`profile`-dualismen

### 3.1 Endpoint-kontrakt
- `/api/admin/customers` returnerar **endast** `{ customers: CustomerListDTO[], bufferRows: CustomerBufferDTO[] }`. Fältet `profiles` försvinner.
- `/api/admin/customers/:id` returnerar **endast** `{ customer: CustomerDetailDTO }`. Fältet `profile` försvinner.
- Båda routerna får under en migrationsperiod (≤2 weeks) returnera **både** `customers` och `profiles` (alias) — sätt deprecation-header `X-Lovable-Deprecated-Field: profiles`. Logga varje träff på serversidan.
- Efter migrationsperioden: ta bort alias.

### 3.2 Klient
- `useCustomers` läser bara `payload.customers`. Inget `?? payload.profiles`.
- `useCustomerDetail` läser bara `payload.customer`.
- Sök efter alla call sites som tar emot `profile` och rätta typer.

### 3.3 Acceptanskriterier
- `grep -rn "payload.profiles\|payload.profile" src/` → 0 träffar.
- Backend-loggen visar 0 träffar på deprecation-headern efter en vecka.

---

<a id="fas-4"></a>
## Fas 4 — Generera DTOs + Zod-runtime-validering

**Mål:** En sanning för "vad är en Customer på admin-sidan". Slutet på 170-raders manuell `typeof`-mappning.

### 4.1 Skapa kanoniska DTOs
- `lib/admin/dtos/customer.ts` — `customerListSchema`, `customerDetailSchema` (Zod).
- `lib/admin/dtos/team.ts` — `teamMemberSchema`, `teamMemberOverviewSchema`.
- `lib/admin/dtos/billing.ts` — `invoiceSchema`, `subscriptionSchema`.
- `lib/admin/dtos/overview.ts` — `overviewPayloadSchema`.
- Exportera `type CustomerDetailDTO = z.infer<typeof customerDetailSchema>` osv.

### 4.2 Server skickar exakt DTO-shape
- I varje route: bygg upp DTO-objektet explicit (inte `...invoice`, inte spreadar). Servern är källan, inte klienten.
- Server-side: kör `dto.parse(payload)` i development-mode bara, för att fånga drift tidigt.

### 4.3 Klient validerar i dev, lita i prod
```ts
async function parseDto<T>(schema: z.ZodSchema<T>, raw: unknown): Promise<T> {
  if (process.env.NODE_ENV !== 'production') return schema.parse(raw);
  return schema.parse(raw); // eller schema.passthrough() om vi vill vara mjuka i prod
}
```
- I `useCustomerDetail.queryFn`: `return parseDto(customerDetailSchema, await apiClient.get(...))`.
- **Riv hela `mapCustomer`-funktionen** (170 rader). Zod sköter all narrowing.

### 4.4 Acceptanskriterier
- `useCustomerDetail.ts` < 80 rader.
- Inga manuella `typeof x === 'string' ? x : null`-konstruktioner i hooks.

---

<a id="fas-5"></a>
## Fas 5 — `useCustomerDetail` + smala child-hooks

### 5.1 Splitta filen
- `useCustomerDetail.ts` blir tunn — endast huvud-hooken.
- Flytta varje child-hook till egen fil:
  - `hooks/admin/useCustomerInvoices.ts`
  - `hooks/admin/useCustomerSubscription.ts`
  - `hooks/admin/useCustomerTikTokStats.ts`
  - `hooks/admin/useCustomerActivity.ts`

### 5.2 Sätt korrekta `staleTime`/`gcTime`
| Hook | staleTime | refetchOnWindowFocus |
|---|---|---|
| `useCustomerDetail` | 30s | true |
| `useCustomerInvoices` | 60s | false |
| `useCustomerSubscription` | 60s | false |
| `useCustomerTikTokStats` | 5 min | false (TikTok-data ändras sällan) |
| `useCustomerActivity` | 30s | true |

### 5.3 `useCustomerSubscription` — ta bort dubbel-fetching
- Idag: hämtar alla subscriptions för kunden och `find`:ar den med `stripe_subscription_id === stripeSubscriptionId`.
- Skapa istället `GET /api/admin/customers/:id/subscription` som returnerar enbart den aktiva. Frontend behöver inte filtrera.

### 5.4 `useCustomerInvoices` — använd dedikerad endpoint
- Idag: `/api/admin/invoices?customer_profile_id=...&includeLineItems=true&limit=50`.
- Skapa `GET /api/admin/customers/:id/invoices` som returnerar exakt `CustomerInvoiceDTO[]` med line items inline. Snabbare och tydligare ägarskap.

### 5.5 Acceptanskriterier
- 5 hooks i 5 filer, varje fil < 90 rader.
- Ingen hook gör mer än ett `apiClient`-anrop.

---

<a id="fas-6"></a>
## Fas 6 — `useCustomers` lättviktslista + selektorer

### 6.1 Smal endpoint
- `/api/admin/customers` returnerar minimal payload för listan: `id, business_name, contact_email, account_manager, monthly_price, status, onboarding_state, paused_until, concepts_per_week, tiktok_handle, next_invoice_date, created_at, agreed_at, account_manager_profile_id, stripe_customer_id, stripe_subscription_id`.
- Fält som inte används i listan (t.ex. `expected_concepts_per_week`, `subscription_interval` om det inte visas i tabellen) — utelämnas.
- Buffer-rader flyttas till en egen endpoint `GET /api/admin/customers/buffer` (anropas separat av de fåtal vyer som behöver dem).

### 6.2 Selektorer i hooken
- Lägg till `useCustomers({ select })` med React Querys `select`-parameter:
  ```ts
  export function useActiveCustomers() {
    return useCustomers({
      select: (data) => data.customers.filter(c => c.status === 'active'),
    });
  }
  ```
- Komponenter som behöver filtrerade subset slipper klient-side `useMemo` på hela listan.

### 6.3 `useTeamMembers` (lightweight)
- Behåll `useTeamMembers()` mot `/api/admin/team` (endast medlemmar, inte aggregering).
- Den tunga `useTeam()` (med customers + activities + assignments + absences) flyttas till Fas 7.

### 6.4 Acceptanskriterier
- `useCustomers.ts` < 60 rader.
- Network: payload-storlek för `/api/admin/customers` ≥40% mindre än idag.

---

<a id="fas-7"></a>
## Fas 7 — `useTeam` — flytta hela aggregeringen server-side

**Detta är guidens största enskilda vinst.** Klient-hooken gör idag ~200 rader aggregering (baseline, dots, MRR, coverage, history). Allt flyttas till en server-route.

### 7.1 Ny endpoint `GET /api/admin/team/overview` (utökad)
- Returnerar **redan-aggregerad** payload:
  ```ts
  type TeamOverviewDTO = {
    members: TeamMemberView[]; // inkl. activityDots, activitySummary, mrr_ore,
                               // customerCount, customerLoadClass, overloaded, etc.
    asOfDate: string;          // för cache-debug
  };
  ```
- Server-implementation: en SQL-vy `v_team_member_overview` + ett par helpers. Cacha i 30s i Postgres (materialized view om nödvändigt).
- Beräkning av `activityDots` och `baseline90d` kan göras med en SQL `generate_series` + `count` per dag.
- `MRR_ore`-summering: använd `v_admin_billing_mrr` från Bundle 02 Fas 4.1, joinad på `cm_id`.

### 7.2 `useTeam` blir tunn
```ts
export function useTeam(opts?: { sort?: SortMode }) {
  return useQuery({
    queryKey: qk.team.overview(),
    queryFn: ({ signal }) =>
      apiClient.get<TeamOverviewDTO>('/api/admin/team/overview', { signal, query: opts }),
    staleTime: 30_000,
  });
}
```
- Inga `useMemo`, ingen `baseline90d`-import, ingen `resolveEffectiveCustomerCoverage` på klienten.

### 7.3 Coverage-resolution server-side
- Flytta `resolveEffectiveCustomerCoverage`, `findActiveCmAbsence` till `lib/admin/server/coverage.ts` (server-only).
- Klienten ser bara resultatet (`covered_by_absence`, `payout_cm_id`).

### 7.4 Acceptanskriterier
- `useTeam.ts` < 50 rader.
- `lib/admin-derive/team-flow.ts` är inte längre importerad från klient-koden (`grep` ger 0 träffar i `src/components/**`).
- Team-sida laddas ≥50% snabbare på cold load (mätt med React Profiler).

---

<a id="fas-8"></a>
## Fas 8 — `useOverviewData` — en endpoint, en payload

### 8.1 Ny aggregator-endpoint `GET /api/admin/overview`
- Returnerar **hela** `OverviewPayload` deriverat på servern (samma som Bundle 02 Fas 7.1):
  ```ts
  {
    metrics: { revenueCard, activeCard, demosCard, costsCard },
    cmPulse: SortedCmRow[],
    topAttention: AttentionItem[],
    snoozedCount: number,
    costs: { entries, totalOre },
    asOfDate: string,
  }
  ```
- Implementeras med `Promise.all` av interna server-helpers (samma som klient-hooken gör idag, men på servern).
- Använder samma SQL-vyer som Team (`v_admin_billing_mrr`, `v_team_member_overview`).

### 8.2 Riv klient-orkestreringen
- `fetchCustomers`, `fetchTeam`, `fetchOperationalData`, plus 4 inline-fetches → **borta**.
- `useOverviewData` blir:
  ```ts
  export function useOverviewData(sort?: SortMode) {
    return useQuery({
      queryKey: qk.overview.main(),
      queryFn: ({ signal }) =>
        apiClient.get<OverviewDTO>('/api/admin/overview', { signal, query: { sort } }),
      staleTime: 30_000,
    });
  }
  ```

### 8.3 Cache headers
- `Cache-Control: private, max-age=15` på `/api/admin/overview` så browsern dedupar snabba navigationer.

### 8.4 Acceptanskriterier
- `useOverviewData.ts` < 30 rader.
- Network: 1 request per overview-page-load (inte 5+).
- `lib/admin/overview-derive.ts` flyttat till `lib/admin/server/overview-derive.ts` och inte importerat från `src/components/**` eller `src/hooks/**`.

---

<a id="fas-9"></a>
## Fas 9 — Bryt upp `/api/admin/customers` i action-routes

Idag: GET (lista) + POST (create + assignment-sync + operational-sync + invite + audit).

### 9.1 File map
```
app/api/admin/customers/
  route.ts                    ← GET (list, smal payload)
  create/route.ts             ← POST  (skapa kund + ev. invite)
  buffer/route.ts             ← GET  (bufferRows, separat anrop)
  [id]/
    route.ts                  ← GET (detail)
    invoices/route.ts         ← GET (detail-invoices för Fas 5.4)
    subscription/route.ts     ← GET (aktiv subscription för Fas 5.3)
    invite/route.ts           ← POST (skicka/återskicka invite)
    pause/route.ts            ← POST
    resume/route.ts           ← POST
    reassign/route.ts         ← POST  (account_manager-byte)
    archive/route.ts          ← DELETE
    tiktok-stats/route.ts     ← GET (finns)
    activity-log/route.ts     ← GET (finns)
```

### 9.2 `create/route.ts` — handler
- Tar emot `createCustomerSchema` (befintligt).
- Wrappa hela skapelseflödet i en **Postgres-transaktion** via `supabaseAdmin.rpc('admin_create_customer', { ... })`:
  - INSERT customer_profiles
  - syncCustomerAssignmentFromProfile
  - syncOperationalSubscriptionState
  - logCustomerCreated (audit)
- Invite-flödet körs **efter** transaktionen (det är externt till Stripe + email). Returnera `{ customer, invite_sent: boolean, warnings: string[] }`.
- Om invite misslyckas: returnera `customer` + `warnings`, inte 500.

### 9.3 GET `/api/admin/customers` — slim down
- Ta bort `profiles`-aliasen i payloaden (Fas 3).
- Ta bort `bufferRows` från denna endpoint (flyttas till `/buffer`).
- Selektera bara de kolumner Fas 6.1 behöver. Ingen `select('*')`.

### 9.4 Acceptanskriterier
- `app/api/admin/customers/route.ts` < 80 rader (endast GET).
- `app/api/admin/customers/create/route.ts` < 120 rader.
- Test: skapa kund med `send_invite=true`, simulera Stripe-fel → kunden finns kvar i DB, warning returnerad.

---

<a id="fas-10"></a>
## Fas 10 — Bryt upp `/api/admin/team`

Idag: GET (list) + POST (create OR resend, beroende på `body.resend`-flagga).

### 10.1 File map
```
app/api/admin/team/
  route.ts                  ← GET (lightweight list för selectors)
  overview/route.ts         ← GET (tung aggregering — Fas 7.1)
  create/route.ts           ← POST  (skapa team-medlem + ev. invite)
  [cmId]/
    route.ts                ← PATCH/DELETE (Bundle 02 Fas 10)
    invite/route.ts         ← POST (resend invite — ersätter body.resend-flaggan)
    reassign-customers/route.ts  ← POST (Bundle 02 Fas 8)
  absences/
    route.ts                ← POST (skapa) — Bundle 02 Fas 11
    [id]/route.ts           ← DELETE (avsluta)
```

### 10.2 Klient-uppdatering
- `useTeamMembers` → `GET /api/admin/team` (oförändrad path).
- Resend-invite-knappen → `POST /api/admin/team/:cmId/invite` (inte längre `POST /api/admin/team` med `resend: true`).

### 10.3 Acceptanskriterier
- `body.resend`-grenen finns inte längre i create-routen.
- `app/api/admin/team/route.ts` < 80 rader.
- `app/api/admin/team/create/route.ts` < 200 rader.

---

<a id="fas-11"></a>
## Fas 11 — `/api/admin/invoices` & `/api/admin/subscriptions` — slim down

### 11.1 Skapa SQL-vyer
```sql
create or replace view v_admin_invoices as
select
  i.*,
  coalesce(cp.business_name, sc_lookup.business_name, left(i.stripe_customer_id, 18), 'Okänd') as customer_name,
  greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) as refunded_ore,
  case
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <= 0 then null
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <
         greatest(i.amount_paid, i.amount_due) then 'partially_refunded'
    else 'refunded'
  end as refund_state,
  case
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) > 0
     and greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <
         greatest(i.amount_paid, i.amount_due) then 'partially_refunded'
    else i.status
  end as display_status
from invoices i
left join customer_profiles cp on cp.id = i.customer_profile_id
left join customer_profiles sc_lookup on sc_lookup.stripe_customer_id = i.stripe_customer_id
left join (
  select stripe_invoice_id, sum(greatest(0, total)) as total_credits
  from stripe_credit_notes group by stripe_invoice_id
) cn on cn.stripe_invoice_id = i.stripe_invoice_id
left join (
  select stripe_invoice_id, sum(greatest(0, amount)) as total_refunds
  from stripe_refunds group by stripe_invoice_id
) r on r.stripe_invoice_id = i.stripe_invoice_id;

create or replace view v_admin_subscriptions as
select
  s.*,
  coalesce(cp.business_name, sc_lookup.business_name, left(s.stripe_customer_id, 18), 'Okänd') as customer_name
from subscriptions s
left join customer_profiles cp on cp.id = s.customer_profile_id
left join customer_profiles sc_lookup on sc_lookup.stripe_customer_id = s.stripe_customer_id;
```

### 11.2 Endpoints blir tunna
- `/api/admin/invoices/route.ts`: `select * from v_admin_invoices` + filter (`status`, `environment`, `customer_profile_id`) + pagination. Ingen manuell join, ingen aggregering, inga schema-fallbacks.
- `/api/admin/subscriptions/route.ts`: samma princip.

### 11.3 Schema-fallbacks
- Ta bort `isMissingColumnError`-grenen för `environment`. Migration 040 är obligatorisk — om den saknas är det en deploy-bug, inte ett runtime-läge.
- Ta bort `isMissingTableError` för `stripe_credit_notes`/`stripe_refunds`. Vyn `v_admin_invoices` antar att tabellerna finns.
- Add migration check i CI: `select count(*) from information_schema.views where table_name in ('v_admin_invoices','v_admin_subscriptions')` måste = 2.

### 11.4 Acceptanskriterier
- `/api/admin/invoices/route.ts` < 80 rader.
- `/api/admin/subscriptions/route.ts` < 60 rader.
- Performans: 5k fakturor returneras < 300 ms (mätt mot live-DB).

---

<a id="fas-12"></a>
## Fas 12 — `/api/admin/overview/operational` ersätts av `/api/admin/overview`

### 12.1 Ta bort den gamla endpointen
- Ersätts helt av server-aggregator från Fas 8.1.
- Sista konsumenten är `useOverviewData.fetchOperationalData` som ändå försvinner i Fas 8.2.
- Kvarvarande klient-anropare: `grep` → noll. Då tas filen bort.

### 12.2 De anti-typade `as never`-castarna försvinner med endpointen
- Den nya aggregatorn ska använda korrekt typad `Database`-import. Om vissa tabeller saknar genererade typer:
  - Kör `supabase gen types typescript --linked > src/types/database.ts` som CI-step.
  - Vägrar deployas om types är out of sync.

### 12.3 Acceptanskriterier
- `app/api/admin/overview/operational/` är borttagen.
- `grep -rn "as never" src/app/api/admin/` → 0 träffar.

---

<a id="fas-13"></a>
## Fas 13 — Schema-fallbacks: konsolidera till migrations + telemetri

### 13.1 Audit alla `schemaWarnings`
- Sök: `grep -rn "schemaWarnings" src/`.
- Lista varje warning, koppla till exakt migration-fil, dokumentera i `docs/migrations.md`.

### 13.2 Borttagna fallbacks
Efter Fas 11 + 12 ska följande vara borta:
- `isMissingColumnError`-fallback i `invoices`/`subscriptions` (migration 040 obligatorisk).
- `isMissingTableError` för `stripe_credit_notes`/`stripe_refunds` (vyn cementerar dem).
- `commission_rate`-fallback i `team` POST (kolumnen är obligatorisk efter migration X).

### 13.3 CI-guard
Lägg till test som kör mot en frisk DB-instans:
```sh
psql $DATABASE_URL -c "select 1 from information_schema.columns where table_name='team_members' and column_name='commission_rate'" | grep -q 1
```
Misslyckas → bygget faller.

### 13.4 Telemetri på kvarvarande warnings
- För warnings som inte kan elimineras: skicka som Sentry breadcrumb med `level: 'warning'` så vi ser om de triggas i prod. Idag visas de bara i UI.

### 13.5 Acceptanskriterier
- `grep -rn "isMissingColumnError\|isMissingTableError" src/app/api/admin/` ≤ 2 träffar (endast där det är medvetet).
- Inga UI-warnings genereras vid normal drift.

---

<a id="fas-14"></a>
## Fas 14 — Cross-cutting: caching, errors, audit, RBAC

### 14.1 React Query defaults
I `getQueryClient()`:
```ts
defaultOptions: {
  queries: {
    staleTime: 30_000,
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status >= 500 ? failureCount < 2 : false,
    refetchOnWindowFocus: 'always',
  },
}
```
- 4xx → retry inte (det är klientens fel).
- 5xx → 2 retries med exponential backoff.

### 14.2 Global error-boundary för admin
- `app/admin/error.tsx` (Next.js error boundary) som visar `ApiError`-meddelandet snyggt och har en "Försök igen"-knapp.
- Stoppar de generiska "Något gick fel"-strängarna.

### 14.3 RBAC-scopes (forts. från Bundle 01/02)
För nya routes i Fas 9–10:
- `customers.read`, `customers.write`, `customers.invite`, `customers.archive`
- `team.read`, `team.write`, `team.invite`
- `overview.read`

### 14.4 Audit log på alla skrivande endpoints
- Säkerställ att varje POST/PATCH/DELETE i de nya endpoint-filerna anropar `recordAuditLog`. Inga "tyst skrivande" endpoints.

### 14.5 Server Cache-Control
| Endpoint | Cache-Control |
|---|---|
| `/api/admin/overview` | `private, max-age=15` |
| `/api/admin/team/overview` | `private, max-age=30` |
| `/api/admin/customers` | `private, max-age=10` |
| `/api/admin/invoices`, `/subscriptions` | `private, max-age=10` |
| Skrivande endpoints | `no-store` |

### 14.6 Acceptanskriterier
- Lighthouse network audit: huvudvyerna serverar `Cache-Control` korrekt.
- Audit-log innehåller en rad per skrivande action under en testkörning.

---

<a id="bilaga-a"></a>
## Bilaga A — File map (Old → New)

| Idag | Efter refactor |
|---|---|
| `hooks/admin/useCustomers.ts` (`useCustomers`+`useTeamMembers`) | `hooks/admin/useCustomers.ts` (smal) + `hooks/admin/useTeamMembers.ts` |
| `hooks/admin/useCustomerDetail.ts` (5 hooks, 466 r) | 5 filer á < 90 r |
| `hooks/admin/useTeam.ts` (358 r, klient-aggregering) | `hooks/admin/useTeam.ts` (< 50 r) + `lib/admin/server/team-overview.ts` |
| `hooks/admin/useOverviewData.ts` (104 r, 5+ fetches) | `hooks/admin/useOverviewData.ts` (< 30 r) + `app/api/admin/overview/route.ts` |
| `app/api/admin/customers/route.ts` (GET+POST, 241 r) | split: `route.ts` (GET), `create/route.ts`, `buffer/route.ts`, `[id]/{invoices,subscription,invite,pause,resume,reassign,archive}/route.ts` |
| `app/api/admin/team/route.ts` (GET+POST+resend, 477 r) | split: `route.ts` (GET), `overview/route.ts`, `create/route.ts`, `[cmId]/invite/route.ts` |
| `app/api/admin/invoices/route.ts` (266 r, manuell join) | thin (`select from v_admin_invoices`) |
| `app/api/admin/subscriptions/route.ts` (124 r, manuell join) | thin (`select from v_admin_subscriptions`) |
| `app/api/admin/overview/operational/route.ts` | **borttagen** (ersatt av `/api/admin/overview`) |
| `lib/admin-derive/team-flow.ts` (klient) | `lib/admin/server/team-flow.ts` (server-only) |
| `lib/admin/overview-derive.ts` (klient) | `lib/admin/server/overview-derive.ts` (server-only) |
| (saknas) | `lib/admin/queryKeys.ts` |
| (saknas) | `lib/admin/invalidate.ts` |
| (saknas) | `lib/admin/api-client.ts` |
| (saknas) | `lib/admin/dtos/{customer,team,billing,overview}.ts` |
| Strängliterala query-keys i komponenter | `qk.*` från `queryKeys.ts` |

---

<a id="bilaga-b"></a>
## Bilaga B — Query-keys (kanonisk lista)

Alla keys i ett enda objekt — säg upp alla strängliteraler.

```ts
['admin','customers']                                    // listan
['admin','customers', id]                                // detail
['admin','customers', id, 'invoices']                    // fakturor
['admin','customers', id, 'subscription', stripeSubId]   // aktiv sub
['admin','customers', id, 'tiktok']                      // TikTok-stats
['admin','customers', id, 'activity']                    // activity log
['admin','team']                                         // lightweight list
['admin','team','overview']                              // tung aggregering
['admin','team', cmId]                                   // detalj (om behov)
['admin','billing','invoices', env]                      // env-filtrerad
['admin','billing','subscriptions', env]
['admin','billing','health']
['admin','overview']                                     // huvudpayload
['admin','notifications']
```

**Regel:** alla keys produceras endast av `qk.*`-helpers. Om en ny vy behövs — lägg till i `queryKeys.ts` först, sedan i hooken.

---

<a id="bilaga-c"></a>
## Bilaga C — Test-checklista per fas

### Fas 1
- [ ] `grep` ger 0 träffar på literala admin-keys utanför `queryKeys.ts`.
- [ ] Invalidation efter customer-create uppdaterar både list, detail och overview.

### Fas 2
- [ ] Snabb routing-byte avbryter pågående request (no console warning).
- [ ] 401 från en endpoint kastar `ApiError(401, ...)` som UI kan särbehandla.

### Fas 3
- [ ] `payload.profiles` returneras inte längre.
- [ ] Inga `?? payload.profile` finns i klienten.

### Fas 4
- [ ] `useCustomerDetail.ts` < 80 rader.
- [ ] Zod kastar tydligt fel om servern returnerar oförväntat shape (testa med mocked respons).

### Fas 5
- [ ] 5 hooks finns i 5 filer.
- [ ] `useCustomerSubscription` gör 1 fetch (inte filter på lista).

### Fas 6
- [ ] Payload-storlek för `/api/admin/customers` minst 40% mindre.
- [ ] `useActiveCustomers` selector funkar utan extra `useMemo`.

### Fas 7
- [ ] `useTeam` < 50 rader.
- [ ] Cold load av `/admin/team` < 800 ms.
- [ ] `lib/admin-derive/team-flow` inte importerad i `src/components/`.

### Fas 8
- [ ] Network: 1 request per `/admin` page-load.
- [ ] `useOverviewData.ts` < 30 rader.

### Fas 9
- [ ] Skapa kund, simulera Stripe 500 → kund finns, warning returnerad.
- [ ] `app/api/admin/customers/route.ts` < 80 rader.

### Fas 10
- [ ] Resend-invite går mot `/api/admin/team/:cmId/invite`.
- [ ] Inga `body.resend`-grenar kvar.

### Fas 11
- [ ] `/api/admin/invoices` < 80 rader.
- [ ] 5k fakturor: response < 300 ms.
- [ ] MRR i Subscriptions === MRR i Overview.

### Fas 12
- [ ] `app/api/admin/overview/operational/` borta.
- [ ] 0 träffar på `as never` i admin-routes.

### Fas 13
- [ ] CI-test för migration-närvaro grön.
- [ ] Inga `schemaWarnings` triggas i happy-path.

### Fas 14
- [ ] 4xx-fel retryas inte; 5xx retryas 2x.
- [ ] Audit-log har en rad per write under smoke-test.
- [ ] Cache-Control korrekt på alla GET-routes.

---

**När alla faser är gröna:** Bundle 03 är prod-ready. Datalagret är minimalt, typed, server-aggregerat och cachebart. Klient-hookarna är < 90 rader vardera och gör bara ett anrop. API-endpoints är action-orienterade, transaktionella och idempotenta där det krävs.
