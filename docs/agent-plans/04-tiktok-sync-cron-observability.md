# 04: TikTok sync, cron och observability

## Mål

Göra TikTok-speglingen till ett robust och observerbart system. Den ska inte kännas som en lös GitHub Actions-fil, utan som en kontrollerad syncmotor med:

- tydliga jobb,
- budget/kvot,
- locks,
- retries,
- adminstatus,
- reviewbara matchningsbeslut,
- och koppling till feed planner.

## Nuvarande kod

Huvudfil:

- `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

Routes:

- `POST /api/studio-v2/customers/:customerId/fetch-profile-history`
- `POST /api/studio-v2/internal/sync-history-all` — cron-trigger (Bearer CRON_SECRET)
- `GET /api/studio-v2/customers/:customerId/import-history`
- `POST /api/studio-v2/history/reconciliation`
- `DELETE /api/studio-v2/history/reconciliation`
- `GET /api/admin/cron-runs` — admin health: cron_run_log + sync_runs + failed customers
- `POST /api/admin/cron-runs/run-now` — **manual batch trigger** (admin-auth, optional `maxCustomers`, optional `dryRun`)

Admin-vy:

- `artifacts/letrend/src/app/admin/(ops)/cron-health/page.tsx`

## Live-status (2026-05-06)

Verifierat av orchestrator:

| Tabell | Antal rader | Kommentar |
|---|---|---|
| `sync_runs` | 507 | Cron-mode sync körs normalt |
| `cron_run_log` | 0 → fylls vid nästa batch | Insert-shape bekräftad OK live |
| 30 kunder | har TikTok-handle | Eligible kandidater |
| 13 `feed_motor_signals` | öppna | Väntande nudges |

## Rotorsak: cron_run_log var alltid tom

Cron-synken (`runHistorySyncBatch`) avslutades med att skriva en aggregerad rad till
`cron_run_log`. Insert:en misslyckades non-fatalt men loggade bara `cronLogError.message`
— ett tomt eller innehållslöst fält. Supabase `PostgrestError` har även `details`, `code`,
`hint` som innehåller den faktiska felbeskrivningen.

### Åtgärdat (2026-05-06, fas 1 + 2):

**Fas 1 — Observability:**
- `buildCronLogPayload(result, start, finish)` — exporterad typesafe hjälpfunktion med
  `CronRunLogInsert`-interface. Alla kolumner krävs vid kompilering.
- `logger.warn` vid insert-fel loggar nu `{ message, details, code, hint, payload_fields }`.
- `BatchResult.cronLogWritten?: boolean` — svarets `POST /internal/sync-history-all`
  rapporterar om loggraden skrevs.
- `GET /api/admin/cron-runs` — lägger till `thumbnails_refreshed` i SELECT, `has_never_logged`,
  `fallback_cron_sync_runs` (cron-mode sync_runs) när cron_run_log är tom.
- Cron-health UI — distinkt banner för "aldrig loggat" vs "0 kunder matchade".

**Fas 2 — Run control:**
- `runHistorySyncBatch(key, opts)` — accepterar nu `BatchOptions { maxCustomers?: number }`.
  Eligible-filtreringen är extraherad till `filterEligibleCustomers(customers, opts)` (ren funktion).
- `POST /api/admin/cron-runs/run-now` — admin-only endpoint, kräver `RAPIDAPI_KEY`,
  accepterar `{ maxCustomers?: number }` i request body, returnerar hela `BatchResult`
  inkl. `cronLogWritten`.
- Cron-health UI — "Kör sync nu"-knapp med loading state, resultatpanel, varning om
  `cronLogWritten=false`.
- `.github/workflows/sync-history-all.yml` — kommentar uppdaterad med alla BatchResult-fält
  inkl. `cronLogWritten`; workflow varnar i loggen om cronLogWritten=false.

**Fas 3 — dryRun / eligibility preview:**
- `SkipReason` typ: `'missing_handle' | 'recently_synced' | 'quiet_recently_synced'`.
- `SkippedCustomer` interface: `{ id, tiktok_handle, reason, last_history_sync_at }`.
- `EligibilityResult` interface: `{ eligible: EligibleCustomer[], skipped: SkippedCustomer[] }`.
- `classifyCustomers(customers, opts)` — ny exporterad ren funktion; returnerar både eligible
  och skipped med orsak. `filterEligibleCustomers` delegerar till denna.
- `BatchOptions.dryRun?: boolean` — när true: ingen RapidAPI, ingen sync_runs, ingen cron_run_log.
- `BatchResult` — utökat med `dryRun?`, `eligibleCustomers?`, `skippedCustomers?`, `wouldProcessCount?`.
- `runHistorySyncBatch` — när `dryRun=true`: returnerar eligibility-preview direkt efter
  budget-beräkning; ingenting skrivs.
- `POST /api/admin/cron-runs/run-now` — accepterar nu `{ maxCustomers?, dryRun? }`;
  kräver **inte** `RAPIDAPI_KEY` vid dryRun.
- Cron-health UI — "Förhandsgranska (dry run)"-checkbox; visar blå banner, eligible-lista
  (grön) och skipped-lista (grå) med orsakstexter på svenska.

**Tester:**
- `tiktok-sync.test.ts`: 6 testfall för `buildCronLogPayload` + 8 testfall för
  `filterEligibleCustomers` + 9 testfall för `classifyCustomers` inkl. mixed-list och
  skipped-metadata.

## Nuvarande syncflöde

### Per kund

`syncCustomerHistory`:

1. Tar lock via `customer_profiles.operation_lock_until`.
2. Skapar `sync_runs` rad med status `running`.
3. Hämtar TikTok profile/user via RapidAPI `tiktok-scraper7.p.rapidapi.com`.
4. Hämtar `/user/posts` med `unique_id`, `count`, optional `cursor`.
5. Normaliserar TikTok URLs och provider ids.
6. Jämför mot befintliga `customer_concepts` via TikTok URL.
7. Uppdaterar stats på befintliga rader.
8. Insertar nya videos som `customer_concepts`:
   - `concept_id=null`
   - `status='history_import'`
   - `row_kind='history_import'`
   - `history_source='tiktok_profile'`
   - provider metadata + TikTok stats
   - ingen `feed_order`
9. Auto-reconcile om ett nytt klipp och en current LeTrend-rad finns.
10. Emitterar `feed_motor_signals` nudge om nya klipp importerades.
11. Stämplar `sync_runs` till `ok` eller `error`.
12. Släpper lock.

### Batch/cron

`runHistorySyncBatch(rapidApiKey, opts?)`:

1. Rensar stale locks.
2. Väljer kunder med aktiv/inbjuden/agreed status och TikTok-handle.
3. Klassificerar via `classifyCustomers` → `{ eligible, skipped }`.
4. Begränsar till `opts.maxCustomers` om angivet.
5. **Om `opts.dryRun=true`**: returnerar eligibility-preview utan vidare DB-writes.
5. Respekterar daglig budget.
6. Kör `syncCustomerHistory` per kund.
7. Uppdaterar reconciled thumbnails.
8. Bygger `CronRunLogInsert`-payload via `buildCronLogPayload`.
9. Skriver aggregerad rad till `cron_run_log` (full fellogning om insert misslyckas).
10. Sätter `result.cronLogWritten` i BatchResult.

## Kvarvarande luckor

### 1. Scheduler/job table saknas

Appen har ingen `sync_jobs`-tabell. GitHub Actions är enda scheduler. Appen saknar:

- explicit enabled/disabled per kund,
- explicit next_run_at per kund,
- retry/backoff per kund,
- budget ledger per provider (nu approximerat via sync_runs-summa).

### 2. ✅ dryRun implementerat (Fas 3)

`BatchOptions.dryRun=true` returnerar `{ eligibleCustomers, skippedCustomers, wouldProcessCount }`
utan att kalla RapidAPI eller skriva sync_runs/cron_run_log. Admin-UI visar eligible/skipped-listor.

### 3. Matchningslogiken är för smal

Auto-reconcile kräver exakt ett nytt klipp. Ingen scoring för:

- flera nya klipp,
- publiceringsdatum nära planerat datum,
- konceptets hook/topic/format mot klippets metadata,
- manuellt avvisad matchning.

Planerat: `feed_reconciliation_candidates`-tabell med score + CM-godkännande.

### 4. Alerts saknas

Inga automatiska larm för:

- inga cron runs senaste X timmar,
- hög error rate,
- provider rate limit,
- kunder med aktiv TikTok-handle men ingen lyckad sync senaste X dagar.

## Testkrav

- ✅ `buildCronLogPayload` — 6 testfall (payload-shape, mappning, null-errors, timestamps)
- ✅ `filterEligibleCustomers` — 8 testfall (handle-filter, staleness, quiet, maxCustomers-slicing)
- Saknas: URL-normalisering och duplicate detection
- Saknas: auto-reconcile 0/1/multiple imported clips
- Saknas: API-test för manual customer sync
- Saknas: UI-test för cron-health empty/error/success/run-now states

## Öppna affärsfrågor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md), särskilt:

- Hur aggressiv ska auto-matchning vara?
- Ska kunder kunna ha sync disabled medan de är aktiva?
- Hur ofta ska stats refreshas efter att en video publicerats?
- Ska matched TikTok evidence automatiskt bli kund-facing historik, eller kräva CM-godkännande?
