# LeTrend Admin – Refactor Guide
## Bundle 02: Billing, Overview & Team

> **Syfte:** Sekventiell, kryssbar checklista för en Codex-agent. Fokus på arkitektur, datalager, prestanda och säkerhet — **inte** på design. Designspråket från `admin/` och `admin/customers` är referensen och ska bevaras (semantiska tokens: `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `font-heading`, `text-success`, `text-warning`, `text-destructive`, `text-info`, runda hörn `rounded-md`/`rounded-lg`, padding `p-4/p-5`).
>
> **Förutsättning:** Bundle 01 (Customers + API-decomposition) är genomförd. Den här guiden bygger på samma mönster: tunna pages, isolerade action-handlers per endpoint, Zod-validering, idempotenta Stripe-anrop, riktade query-invalidations.

---

## Innehåll

- [Fas 0 — Diagnos & invarianter](#fas-0)
- [Fas 1 — Delad ops-bas (sync, summary, table)](#fas-1)
- [Fas 2 — Billing: route-drivna tabbar + ops-lager](#fas-2)
- [Fas 3 — Billing: InvoicesTab refactor](#fas-3)
- [Fas 4 — Billing: SubscriptionsTab refactor](#fas-4)
- [Fas 5 — Billing: HealthTab + retry-säkerhet](#fas-5)
- [Fas 6 — Overview: separation från Notifications](#fas-6)
- [Fas 7 — Overview: derive-pipeline & prefetch](#fas-7)
- [Fas 8 — Team: ownership-boundary mot Customers](#fas-8)
- [Fas 9 — Team: presentational-components extraherade](#fas-9)
- [Fas 10 — Team: CMEditDialog som transaktion](#fas-10)
- [Fas 11 — CMAbsenceModal: server-validering & payroll-koppling](#fas-11)
- [Fas 12 — Cross-cutting: prestanda, RBAC, audit, telemetri](#fas-12)
- [Bilaga A — File map (Old → New)](#bilaga-a)
- [Bilaga B — Test-checklista per fas](#bilaga-b)

---

<a id="fas-0"></a>
## Fas 0 — Diagnos & invarianter

**Identifierade problem i Bundle 02:**

| Område | Problem |
|---|---|
| `BillingHub` | Tabs hanteras via `initialTab` + lokal state. Ingen URL-källa → ingen deep-link, ingen browser-back, ingen prefetch per tabb. |
| `BillingHub` | Prefetchar `health` oavsett aktiv tabb → onödig last. |
| `InvoicesTab` / `SubscriptionsTab` | Två nästan identiska tabeller, summary-cards och sync-knappar. ~80% kopierad kod. |
| Sync-actions | Inline `useMutation` i varje tab. Olika invalidation-strategier. Ingen optimistic feedback. |
| `InvoicesTab` | Filtrering sker helt klient-side på 200 rader. Skala bryts vid >1k. |
| `SubscriptionsTab` | MRR beräknas i komponenten — inkonsistent mot `overview` som har egen MRR-källa. |
| `HealthTab` | Retry-mutation utan idempotency-key → kan trigga dubblettkörningar. |
| `admin/page.tsx` (Overview) | Blandar metrics, CM-puls, attention-list, kostnader och snoozed-list. Ingen modul-gräns. |
| Overview & Notifications | Använder båda `deriveOverview` — överlapp i ansvar; oklar ägarskap för "Hanteras nu". |
| `admin/team/page.tsx` | 445 rader. Ren presentation blandas med fetch, sortering, async-actions, focus-scroll. |
| Team | `clearAbsence` och `reassignCustomers` patchar `/api/admin/customers/:id` direkt → kringgår team-domänen. Coupling. |
| `CMEditDialog` | Reassign + PATCH + DELETE körs som **separata** HTTP-anrop utan transaktion. Crash mitt i = inkonsistent state. |
| `CMAbsenceModal` | Ingen server-validering av att `backup_cm_id` är aktiv. Datumvalidering bara klient-side. |
| Aktivitetspuls | `ActivityDotMatrix`, `CustomerLoadPill`, `WorkflowDot` lever inline i page.tsx → inte återanvändbara. |

**Invarianter som måste bevaras genom hela refactoren:**

1. Designtokens: använd **endast** semantiska tokens från `styles.css`. Inga nya färger.
2. Svenska UI-strängar och svensk talformat (`sv-SE`, `formatSek`, `shortDateSv`, `timeAgoSv`).
3. Pengar lagras och flödar i **öre** (`*_ore`). Konvertering sker i `formatSek` och i Stripe-adapter — ingen annanstans.
4. Stripe-skrivande operationer: alltid `Idempotency-Key` baserad på (admin_id, action, target_id, dag).
5. Endast admins med `roles.scope` som motsvarar resp. action får anropa endpoints (RBAC i Fas 12).
6. Alla skrivande endpoints loggar till `admin_audit_log` (se Bundle 01 Fas 8).

---

<a id="fas-1"></a>
## Fas 1 — Delad ops-bas

Skapa en återanvändbar bas som InvoicesTab, SubscriptionsTab och Health delar.

### 1.1 Skapa `app/src/components/admin/_shared/SummaryCard.tsx`
- En enda källa för det som idag är duplicerat i `InvoicesTab.SummaryCard`, `SubscriptionsTab.SummaryCard` och `HealthTab.HealthCard`.
- Props: `label`, `value`, `tone?: 'neutral' | 'success' | 'warning' | 'info' | 'destructive'`.
- Ingen ny styling; mappa `tone` till befintlig token.

### 1.2 Skapa `app/src/components/admin/_shared/AdminTable.tsx`
- Generisk `<AdminTable<T>>` med:
  - `columns: { key, header, width, align, render(row) }[]`
  - `rows: T[]`, `getRowKey(row)`, `onRowClick?(row)`, `rowHrefBuilder?(row)` (valfritt — render som `<Link>` istället för `onClick + router.push`).
  - `loadingRows?: number`, `emptyLabel`.
- Bevara grid-layouten `grid-cols-[2fr_1fr_1fr_1fr_140px_120px]` som CSS-variabel via prop.
- Internal: använd `<AdminTableRow>` med `border-b border-border`, `hover:bg-accent/30`.

### 1.3 Skapa `app/src/components/admin/_shared/StatusPill.tsx`
- En komponent: `<StatusPill config={{ label, className }} />`.
- Konsumerar redan befintliga `invoiceStatusConfig`/`subscriptionStatusConfig`.

### 1.4 Skapa `app/src/lib/admin/billing-ops.ts`
- Centraliserade hooks som ersätter inline-mutations:
  - `useStripeSyncInvoices()` → POST `/api/admin/billing/sync-invoices` (flyttad från `/api/studio/...` se 2.3).
  - `useStripeSyncSubscriptions()` → POST `/api/admin/billing/sync-subscriptions`.
  - `useBillingHealthRetry()` → POST `/api/admin/billing/health-retry`.
- Varje hook returnerar `{ run, isPending, error, lastRunAt }` och hanterar **riktade** invalidations:
  ```ts
  // Endast den env-variant som faktiskt kördes
  qc.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices', env] });
  ```
- `mutationFn` läser `Idempotency-Key` från svaret och visar i toast (för felsökning).

### 1.5 Acceptanskriterier
- `SummaryCard` och `HealthCard` är borttagna från `InvoicesTab`/`SubscriptionsTab`/`HealthTab`.
- Inga `useMutation` ligger längre direkt i tabs.
- TypeCheck och `bun run build` passerar.

---

<a id="fas-2"></a>
## Fas 2 — Billing: route-drivna tabbar + ops-lager

### 2.1 Konvertera tabbar till riktiga routes
Ersätt `BillingHub`+`initialTab` med Next.js parallel routes / nested routes:

```
app/admin/billing/
  layout.tsx              ← <BillingShell> (header, env-filter, <Tabs/Nav>, <Outlet/>)
  page.tsx                ← redirect("/admin/billing/invoices")
  invoices/page.tsx       ← server component, loaderar invoices
  subscriptions/page.tsx  ← server component, loaderar subscriptions
  health/page.tsx         ← server component, loaderar health
```

- Tabs blir `<Link>` (inte radix-`Tabs`) och använder `usePathname()` för aktiv state.
- Bevara visuellt: `border-b-2 border-transparent data-[active]:border-primary` (mappa till `aria-current="page"`).
- `env`-filtret går från `useState` till query param `?env=test|live|all`. Lägg i URL via `useSearchParams` + `router.replace` med `scroll: false`.
- **Vinst:** deep-linkbar, prefetch per route, browser-back fungerar, SSR-färdig.

### 2.2 BillingShell ansvar
- Header (titel, beskrivning).
- Env-toggle som skriver `?env=` till URL (inte lokal state).
- Top-level prefetch: bara den **aktiva** routen prefetchas. Ta bort `useEffect` som blint prefetchar `health`.

### 2.3 Flytta sync-endpoints från `/api/studio/stripe/*` till `/api/admin/billing/*`
- Idag: `POST /api/studio/stripe/sync-invoices` är ett admin-actions-endpoint men ligger i fel namespace → fel RBAC-paraply.
- Skapa `/api/admin/billing/sync-invoices/route.ts` och `/api/admin/billing/sync-subscriptions/route.ts`.
- Båda ska:
  - Läsa `env` från body (Zod: `'test' | 'live' | 'all'`).
  - Anropa `stripeSyncService.syncInvoices({ env, idempotencyKey })`.
  - Returnera `{ ok, syncedCount, skippedCount, idempotencyKey }`.
  - Logga till `admin_audit_log` (`action: 'billing.sync_invoices'`).
- Behåll en thin wrapper i `/api/studio/stripe/...` som proxar till nya endpointen i en migrationsperiod (eller döda den om inga andra konsumenter finns).

### 2.4 Acceptanskriterier
- `BillingHub.tsx` är borta. Layouten är ren.
- URL `/admin/billing/subscriptions?env=live` visar abonnemang för live-env, deep-link funkar, refresh funkar.
- Sync-knappar går mot nya `/api/admin/billing/*`.

---

<a id="fas-3"></a>
## Fas 3 — Billing: InvoicesTab refactor

### 3.1 Server-side filtrering
- Lägg till query-params i `/api/admin/invoices`:
  - `status` (`open | paid | partially_refunded | all`), `env`, `q` (kund-sök), `from`, `to`, `cursor`, `limit`.
- Klienten skickar aktuella filter direkt → bort med `useMemo(filter)` på 200 rader.
- Använd `useInfiniteQuery` med `cursor`-paginering om vi vill.

### 3.2 Riv ut komponenterna
- Använd `<AdminTable>` och `<SummaryCard>` från Fas 1.
- Ta bort lokal `SummaryCard`-funktion.
- Status-filter blir en `<FilterChips>` (extrahera från InvoicesTab till `_shared/FilterChips.tsx` — den används också i Subscriptions och Customers).

### 3.3 Bryt ut sync till delat ops-lager
- Ersätt inline `useMutation` med `const { run: syncInvoices, isPending } = useStripeSyncInvoices(env)`.

### 3.4 Korrigera UX-bugg: rad-klick
- Idag: `onClick` på hela raden + `event.stopPropagation()` på "Korrigera"-knappen. Funkar men är fragilt.
- Använd `<AdminTable rowHrefBuilder={(r) => r.customer_profile_id ? '/admin/customers/' + r.customer_profile_id : null}>`.
- Action-cellen renderas utanför `<Link>` (eller använd `<button onPointerDown={stopPropagation}>`).

### 3.5 Acceptanskriterier
- `InvoicesTab.tsx` < ~120 rader.
- Status-filter och `env`-filter går via URL/server.
- Första render < 200 ms vid 5k fakturor (mätt med React Profiler).

---

<a id="fas-4"></a>
## Fas 4 — Billing: SubscriptionsTab refactor

### 4.1 Flytta MRR-beräkning till backend
- Idag beräknar tabben själv `monthlyRecurringOre` med interval-logik. **Sanningen lever på två ställen** (även Overview räknar MRR).
- Skapa Postgres-vy `v_admin_billing_mrr`:
  ```sql
  create or replace view v_admin_billing_mrr as
  select
    environment,
    sum(case
      when interval = 'year' then round(amount / 12)
      when interval_count = 3 then round(amount / 3)
      else amount
    end)::bigint as mrr_ore
  from billing_subscriptions
  where status = 'active' and not cancel_at_period_end
  group by environment;
  ```
- API: `GET /api/admin/billing/subscriptions?env=...` returnerar `{ subscriptions, summary: { activeCount, expiringCount, mrrOre } }`.
- Klienten visar `summary.mrrOre` direkt — ingen klient-beräkning.

### 4.2 Återanvänd `<AdminTable>` + `<SummaryCard>`
Samma som Fas 3.

### 4.3 SubscriptionPriceChangeModal
- Den får idag `currentPriceSek` med tre olika divisorer beroende på interval. Flytta detta till en helper `subscriptionPricePerInterval(subscription) -> { sek, suffix }` i `lib/admin/billing.ts` och använd både i listan och i modalen.

### 4.4 Acceptanskriterier
- `SubscriptionsTab.tsx` < ~110 rader.
- MRR i Overview, BillingHub och Notifications matchar exakt (en källa).

---

<a id="fas-5"></a>
## Fas 5 — Billing: HealthTab + retry-säkerhet

### 5.1 Idempotent retry
- Lägg till `Idempotency-Key` i `POST /api/admin/billing/health-retry`. Generera `health-retry:{admin_id}:{yyyy-mm-dd-HH}`.
- Om samma key kommer in inom 60 s → returnera senaste resultatet utan att köra om.

### 5.2 Server-Sent Events (eller polling med backoff)
- Idag måste användaren klicka "Kör om" och sedan vänta. Lägg till `useQuery({ refetchInterval: data?.stats.failedSyncs > 0 ? 15_000 : 60_000 })` så Health-vyn själv noterar när failed_syncs sjunker.

### 5.3 Bryt ut `<HealthCard>` → använd `<SummaryCard tone>` (Fas 1).

### 5.4 Bryt ut `<SyncLogList>` och `<RecentFailuresList>` till egna komponenter under `app/src/components/admin/billing/health/`.

### 5.5 Acceptanskriterier
- Två snabba klick på "Kör om billing-sync" → endast ett verkligt jobb i loggen.
- HealthTab uppdateras automatiskt utan manuell refresh när jobb klar.

---

<a id="fas-6"></a>
## Fas 6 — Overview: separation från Notifications

**Mål:** Tydlig ägarskap. Overview = situationsrapport. Notifications = inkorg.

### 6.1 Definiera kontrakt
- `Overview` visar **bara**:
  1. KPI-kort (Revenue, Active, Demos, Costs)
  2. CM-puls (snapshot, högst 5 i förhandsvisning)
  3. **Top-3** "Kräver uppmärksamhet" + "Visa alla i Notifications"-länk
  4. Kostnadsöversikt
- `Notifications` visar:
  1. Hela `attentionItems` (full lista)
  2. `snoozedAttentionItems` ("Hanteras nu")
  3. `attentionFeedSeenAt`-tracking sker **endast här** (det är inkorgen)

### 6.2 Implementation
- I `app/admin/page.tsx`: visa max 3 attention-items, knapp `<Link href="/admin/notifications">Se alla {n} ärenden</Link>`.
- Ta bort `trackSeen` och `lastSeenAt`-prop från Overview-instansen av `<AttentionList>`. Behåll i Notifications.
- "Hanteras nu"-sektionen flyttas **bort** från Overview helt — den hör hemma i Notifications-inkorgen.

### 6.3 Acceptanskriterier
- Overview render < 800 ms på cold load (inga onödiga listor).
- `attention_feed_seen_at` uppdateras endast när användaren öppnar `/admin/notifications`.

---

<a id="fas-7"></a>
## Fas 7 — Overview: derive-pipeline & prefetch

### 7.1 Flytta `deriveOverview` server-side
- Idag: rå data hämtas, klienten kör `useMemo(deriveOverview(...), [data, sortMode])` på varje rendering.
- Ny endpoint: `GET /api/admin/overview?sort=standard|lowest_activity` som returnerar **redan-deriverad** payload med fält:
  ```ts
  {
    metrics: { revenueCard, activeCard, demosCard, costsCard },
    cmPulse: SortedCmRow[],
    topAttention: AttentionItem[],   // top 3
    snoozedCount: number,
    costs: { entries, totalOre }
  }
  ```
- Klienten blir ren render — `useMemo`/`deriveOverview` försvinner från komponenten.

### 7.2 React Query-konfiguration
- `staleTime: 30_000` (mätbara ändringar är ovanliga inom 30 s).
- `refetchOnWindowFocus: true`.
- Prefetcha overview vid sidlast via TanStack Router loader (eller Next.js `loader.ts` om Next-app — ange ramverk i agentens kontext).

### 7.3 CM-puls-sortering
- `sortMode` lever nu i URL (`?sort=lowest_activity`) → bookmarkbart.

### 7.4 Acceptanskriterier
- `admin/page.tsx` < 130 rader, ingen `useMemo` på derived data.
- Network: 1 request per page-load (inte 3).

---

<a id="fas-8"></a>
## Fas 8 — Team: ownership-boundary mot Customers

**Problem:** `CMEditDialog.reassignCustomers` patchar `account_manager`-strängen direkt på varje kund. Det är fel domän.

### 8.1 Skapa team-domän-endpoints
- `POST /api/admin/team/:cmId/reassign-customers` body: `{ targetCmId: string, customerIds?: string[] | 'all' }`.
- Implementation:
  - Kör i en **enda** Postgres-transaktion.
  - Skapar `customer_assignment` rader (versionerade ownership-historik) — ersätter implicit historik som idag finns i `assignmentHistory`.
  - Stänger gamla assignments med `valid_to = now()`, öppnar nya med `valid_from = now()`.
  - Loggar `admin.team.reassign` per kund i `admin_audit_log`.
- `DELETE /api/admin/team/:cmId` får ny invariant: returnerar 409 om CM har öppna assignments. Klienten måste anropa reassign **först**.

### 8.2 Klient
- `CMEditDialog.handleArchive` → anropar reassign-endpointen + sedan DELETE. Visar tydligt fel om reassign saknas.
- Ta bort all `customers.map(fetch ...)`-kod.

### 8.3 Acceptanskriterier
- Inga komponenter under `team/` patchar `/api/admin/customers/:id` längre. Sökning i koden ger 0 träffar.

---

<a id="fas-9"></a>
## Fas 9 — Team: presentational-komponenter extraherade

Bryt ner `app/admin/team/page.tsx` (445 rader) i ~100 raders shell + delkomponenter.

### 9.1 Skapa
- `components/admin/team/TeamMemberCard.tsx` — kortet (avatar, namn, MRR-hover, kunder, historik).
- `components/admin/team/ActivityDotMatrix.tsx` — flytta in `dotClassName`.
- `components/admin/team/CustomerLoadPill.tsx`.
- `components/admin/team/WorkflowDot.tsx`.
- `components/admin/team/CmStat.tsx`.
- `components/admin/team/TeamCustomerRow.tsx` — kund-raden inom kortet.
- `components/admin/team/TeamMemberHistoryList.tsx` — historik & handovers.

### 9.2 Page-shell
`app/admin/team/page.tsx` består sedan av:
- Header + actions (`Payroll`, sortering, `Lägg till`).
- `team.map(member => <TeamMemberCard member={...} onSetAbsence={...} onEdit={...} />)`.
- Modaler.

### 9.3 Sortering & focus-scroll
- Flytta `useFocusedTeamMember(focusedMemberId)`-logiken till en hook i `hooks/admin/useFocusedTeamMember.ts`.
- Sorteringen flyttas till `useTeam`-hooken (returnera redan sorterad lista, `sortMode` som arg).

### 9.4 Acceptanskriterier
- `app/admin/team/page.tsx` < 130 rader.
- Inga inline-funktioner med JSX > 30 rader i page-filen.

---

<a id="fas-10"></a>
## Fas 10 — Team: CMEditDialog som transaktion

### 10.1 En endpoint, en transaktion
- Skapa `PATCH /api/admin/team/:cmId` som tar **alla** ändringar i en payload:
  ```ts
  z.object({
    profile: z.object({ name, email, phone, city, bio, avatar_url }).partial(),
    commission_rate: z.number().min(0).max(1).optional(),
    reassign_to_cm_id: z.string().uuid().nullable().optional(),
  })
  ```
- Server: kör profile-update + reassign i en transaktion, returnera ny CM + assignment-resultat.
- Vid `archive=true` flagga eller separat `DELETE`-endpoint som **kräver** att inga öppna assignments finns (Fas 8).

### 10.2 Validering
- `commission_rate`: server enforce 0–100% (klienten har bara `Number.isFinite`-check).
- `email`: Zod `.email()`.
- `avatar_url`: Zod `.url()` eller tom sträng.

### 10.3 Klient
- Ersätt `handleSave`+`reassignCustomers` med en `useMutation` som anropar nya endpointen.
- Ta bort de tre fetch-anropen (PATCH cm, mapa kunder, DELETE).

### 10.4 Acceptanskriterier
- Crash mitt i en save → state är fortfarande konsistent (verifiera via test som dödar requesten med `AbortController` halvvägs).

---

<a id="fas-11"></a>
## Fas 11 — CMAbsenceModal: server-validering & payroll-koppling

### 11.1 Server-side guards
- `POST /api/admin/team/absences` Zod-schema:
  ```ts
  z.object({
    cm_id: z.string().uuid(),
    backup_cm_id: z.string().uuid().nullable(),
    absence_type: z.enum(['vacation','sick','parental_leave','training','other']),
    compensation_mode: z.enum(['covering_cm','primary_cm']),
    starts_on: z.string().date(),
    ends_on: z.string().date(),
    note: z.string().max(500).nullable(),
  }).refine(d => d.ends_on >= d.starts_on, 'ends_on får inte vara före starts_on')
    .refine(d => d.compensation_mode === 'primary_cm' || !!d.backup_cm_id,
      'covering_cm kräver backup_cm_id');
  ```
- Server kontrollerar att `backup_cm_id` är `is_active = true`.
- Server kontrollerar att perioden inte överlappar befintlig franvaro för samma CM.

### 11.2 Payroll-koppling synlig
- Returnera i svaret en `payrollImpact: { primaryCmEarnsDuringAbsence: boolean, coveringCmEarns: boolean }` så klienten kan visa exakt vad som händer.

### 11.3 Klient
- `CMAbsenceModal` blir tunn — bara form. All affärslogik på servern.
- "Avsluta franvaro" → `DELETE /api/admin/team/absences/:id` (finns redan), men endpointen ska skriva `admin_audit_log`.

### 11.4 Acceptanskriterier
- Ogiltig payload (slut före start, saknad backup) avvisas av servern även om man manipulerar requesten.

---

<a id="fas-12"></a>
## Fas 12 — Cross-cutting: prestanda, RBAC, audit, telemetri

### 12.1 RBAC scopes (forts. från Bundle 01 Fas 8)
- Lägg till scopes:
  - `billing.invoices.read`, `billing.invoices.write`
  - `billing.subscriptions.read`, `billing.subscriptions.write`
  - `billing.health.read`, `billing.health.retry`
  - `team.read`, `team.write`, `team.archive`, `team.absences.write`
  - `overview.read`
- Wrappa varje admin-endpoint med `requireScope(scope)`.

### 12.2 Audit log
Logga (minimum):
- Alla `billing.*` skrivande actions med `target_id`, `idempotency_key`, `before/after` (för pris-change).
- `team.reassign`, `team.archive`, `absence.create`, `absence.delete`.

### 12.3 Riktade invalidations
Etablera en namnkonvention och en helper:
```ts
// lib/admin/queryKeys.ts
export const qk = {
  billing: {
    invoices: (env: EnvFilter) => ['admin','billing','invoices', env] as const,
    subscriptions: (env: EnvFilter) => ['admin','billing','subscriptions', env] as const,
    health: () => ['admin','billing','health'] as const,
  },
  overview: (sort: SortMode) => ['admin','overview', sort] as const,
  team: () => ['admin','team'] as const,
  notifications: () => ['admin','notifications'] as const,
};
```
Inga string-literal querykeys i komponenterna efter denna fas.

### 12.4 Prestanda
- Server-side filtrering i Invoices/Subscriptions (Fas 3/4).
- Lazy-load `HealthTab` ramverk för dess underliggande komponenter (`React.lazy`).
- Virtualisera kund-listan i `TeamMemberCard` när `customers.length > 50` (`@tanstack/react-virtual`).
- Sätt `Cache-Control: private, max-age=15` på `GET /api/admin/overview` och `…/health` för att låta browsern dedupa snabba navigationer.

### 12.5 Telemetri
- `Sentry`/`PostHog` breadcrumbs på alla `admin.*` actions.
- Mät tid: `overview_load_ms`, `billing_invoices_load_ms`, `team_reassign_ms`.

---

<a id="bilaga-a"></a>
## Bilaga A — File map (Old → New)

| Idag | Efter refactor |
|---|---|
| `components/admin/billing/BillingHub.tsx` | **borttagen** → `app/admin/billing/layout.tsx` (`BillingShell`) |
| `components/admin/billing/tabs/InvoicesTab.tsx` | `app/admin/billing/invoices/page.tsx` + `components/admin/billing/invoices/{InvoiceListTable,InvoiceFilters}.tsx` |
| `components/admin/billing/tabs/SubscriptionsTab.tsx` | `app/admin/billing/subscriptions/page.tsx` + `components/admin/billing/subscriptions/{SubscriptionListTable}.tsx` |
| `components/admin/billing/tabs/HealthTab.tsx` | `app/admin/billing/health/page.tsx` + `components/admin/billing/health/{SyncLogList,RecentFailuresList}.tsx` |
| inline `SummaryCard` × 3 | `components/admin/_shared/SummaryCard.tsx` |
| inline `HealthCard` | `components/admin/_shared/SummaryCard.tsx` (tone-variant) |
| inline `useMutation` (sync) × 3 | `lib/admin/billing-ops.ts` (`useStripeSyncInvoices`, `useStripeSyncSubscriptions`, `useBillingHealthRetry`) |
| `app/admin/page.tsx` (Overview) | tunn shell + `components/admin/overview/{KpiGrid,CmPulseSection,TopAttentionPreview,CostsGrid}.tsx` |
| `lib/admin/overview-derive.ts` (klient) | flyttas till server: `lib/admin/server/overview-derive.ts` |
| `app/admin/notifications/page.tsx` | äger ensam `attentionFeedSeenAt`-tracking och "Hanteras nu" |
| `app/admin/team/page.tsx` (445 r) | tunn shell + `components/admin/team/{TeamMemberCard,ActivityDotMatrix,CustomerLoadPill,WorkflowDot,CmStat,TeamCustomerRow,TeamMemberHistoryList}.tsx` |
| `components/admin/team/CMEditDialog.tsx` (reassign loop) | tunn form, en mutation mot `PATCH /api/admin/team/:cmId` |
| `components/admin/team/CMAbsenceModal.tsx` | tunn form, server-validerad |
| `/api/studio/stripe/sync-invoices` | `/api/admin/billing/sync-invoices` |
| `/api/studio/stripe/sync-subscriptions` | `/api/admin/billing/sync-subscriptions` |
| `/api/admin/billing-health/retry` | `/api/admin/billing/health-retry` (idempotent) |
| `PATCH /api/admin/customers/:id` (för account_manager) | **endast** Customers-domänen → Team använder `/api/admin/team/:cmId/reassign-customers` |

---

<a id="bilaga-b"></a>
## Bilaga B — Test-checklista per fas

### Fas 1
- [ ] `SummaryCard` renderar 5 toner korrekt.
- [ ] `AdminTable` snapshot matchar tidigare grid-layout pixelmässigt.

### Fas 2
- [ ] `/admin/billing` redirectar till `/admin/billing/invoices`.
- [ ] `/admin/billing/subscriptions?env=live` SSR:ar med rätt env.
- [ ] Browser back mellan tabs fungerar.
- [ ] Refresh på en tabb visar samma tabb.

### Fas 3
- [ ] `?status=open` i URL filtrerar server-side.
- [ ] Klick på rad → går till kunddetalj. Klick på "Korrigera" → öppnar modal **utan** att navigera.
- [ ] Empty state visas vid 0 fakturor.

### Fas 4
- [ ] MRR i Overview === MRR i Subscriptions === MRR i Notifications.
- [ ] Pris-change-modal får rätt `currentPriceSek` för month, quarter, year.

### Fas 5
- [ ] Två klick på retry inom 60 s → en körning i Postgres-loggen.
- [ ] Health auto-refreshar var 15:e sek när `failedSyncs > 0`.

### Fas 6
- [ ] Overview visar max 3 attention-items.
- [ ] `attention_feed_seen_at` ändras endast när Notifications-sidan öppnas.

### Fas 7
- [ ] Network-fliken visar 1 request för `/api/admin/overview`.
- [ ] `?sort=lowest_activity` deep-linkar.

### Fas 8
- [ ] `grep -r "/api/admin/customers" app/src/components/admin/team/` → 0 träffar.
- [ ] Reassign skapar nya `customer_assignment`-rader, gamla får `valid_to`.

### Fas 9
- [ ] `app/admin/team/page.tsx` < 130 rader.
- [ ] Storybook (eller test-render) för varje ny komponent.

### Fas 10
- [ ] Mid-request abort → DB är konsistent (profile inte uppdaterad om reassign failade).
- [ ] Ogiltig email avvisas på server.

### Fas 11
- [ ] POST franvaro med `ends_on < starts_on` → 422.
- [ ] POST franvaro med inaktiv backup → 422.
- [ ] Överlappande franvaro → 409.

### Fas 12
- [ ] Admin utan `billing.invoices.write` får 403 på sync.
- [ ] `admin_audit_log` har en rad per skrivande action.
- [ ] Lighthouse-score för `/admin` > 85.

---

**När alla faser är gröna:** Bundle 02 är prod-ready. Fortsätt med Bundle 03 (om sådan finns) eller kör smoke-test på end-to-end flow: skapa CM → tilldela kund → fakturera → pausa → reassign → arkivera.
