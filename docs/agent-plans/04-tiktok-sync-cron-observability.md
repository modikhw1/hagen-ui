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
- `POST /api/studio-v2/internal/sync-history-all`
- `GET /api/studio-v2/customers/:customerId/import-history`
- `POST /api/studio-v2/history/reconciliation`
- `DELETE /api/studio-v2/history/reconciliation`

Admin-vy:

- `artifacts/letrend/src/app/admin/(ops)/cron-health/page.tsx`

## Live-status (2026-05-06)

Verifierat av orchestrator:

| Tabell | Antal rader | Kommentar |
|---|---|---|
| `sync_runs` | 507 | Cron-mode sync körs normalt |
| `cron_run_log` | 0 | Raden skrivs aldrig — se rotorsak nedan |
| `tiktok_videos` | — | Synk av TikTok-videos |
| `customer_concepts` | — | 30 kunder med TikTok-handle |
| `feed_motor_signals` (öppna) | 13 | Aktiva nudges |

## Rotorsak: cron_run_log är alltid tom

Cron-synken (`runHistorySyncBatch`) avslutas med att skriva en aggregerad rad till `cron_run_log`. Insert:en kan misslyckas non-fatalt och flödet fortsätter utan att logga den faktiska felorsaken.

### Vad som saknades (före fix):

1. **Felloggen loggade bara `cronLogError.message`** — ett tomt eller innehållslöst fält. Supabase `PostgrestError` har även `details`, `code`, `hint` som innehåller den faktiska felbeskrivningen.
2. **`thumbnails_refreshed`-kolumnen** saknades i insert när migrationen `20260505120000_cron_run_log_thumbnails_refreshed` ej var applicerad. Nu bekräftad live.
3. **Ingen schemaguard** — det var lätt att glömma en kolumn eller fejlstava ett fältnamn.
4. **Adminvyn** — visade "Inga körningar registrerade ännu" utan att skilja på "aldrig loggat" och "cron kördes men 0 kunder matchade".

### Vad som fixats (2026-05-06):

- `buildCronLogPayload(result, start, finish)` — exporterad typesafe hjälpfunktion med `CronRunLogInsert`-interface. Alla kolumner krävs vid kompilering.
- `logger.warn` vid insert-fel loggar nu `{ message, details, code, hint }` (full PostgrestError).
- `BatchResult.cronLogWritten: boolean` — svarets `POST /internal/sync-history-all` rapporterar om loggraden skrevs.
- `GET /api/admin/cron-runs` — lägger till `thumbnails_refreshed` i select, `has_never_logged`-flagga, och `fallback_cron_sync_runs` (cron-mode sync_runs) när cron_run_log är tom.
- Cron-health UI — visar distinkt banner för "aldrig loggat" vs "0 kunder", samt fallback-tabell med sync_runs per kund.
- Test: `artifacts/api-server/src/lib/studio/tiktok-sync.test.ts` — 6 testfall för `buildCronLogPayload`.

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

`runHistorySyncBatch`:

1. Rensar stale locks.
2. Väljer kunder med aktiv/inbjuden/agreed status och TikTok-handle.
3. Respekterar staleness/quiet hours/budget.
4. Kör `syncCustomerHistory` per kund.
5. Uppdaterar reconciled thumbnails.
6. Bygger `CronRunLogInsert`-payload via `buildCronLogPayload`.
7. Skriver aggregerad rad till `cron_run_log` (full fellogning om insert misslyckas).

## Kvarvarande luckor (att åtgärda)

### 1. Rotorsaken till att cron_run_log är tom är ännu inte bekräftad

Nu när felloggen är förbättrad: nästa gång cron körs och insert misslyckas, syns den faktiska felorsaken (`details`, `code`, `hint`) i server-loggar. Kontrollera server-loggar efter nästa batch-körning.

### 2. Matchningslogiken är för smal

Auto-reconcile kräver exakt ett nytt klipp. Det finns ingen robust scoring för:

- flera nya klipp,
- publiceringsdatum nära planerat datum,
- konceptets hook/topic/format mot klippets metadata,
- manuellt avvisad matchning.

### 3. Cron-kontroll ligger utanför appen

GitHub Actions kan vara okej som scheduler, men appen saknar:

- explicit enabled/disabled per kund,
- run status i admin per invokation (utöver cron_run_log),
- retry/backoff per kund,
- budget ledger per provider,
- operator-action för "run now".

### 4. Data bör separeras från display

TikTok-providerdata, raw stats, sync events och feed planner evidence bör inte bara vara displayfält på `customer_concepts`. Planerat: `feed_reconciliation_candidates`.

## Testkrav

- ✅ Unit-test för `buildCronLogPayload` payload-shape (6 testfall, `tiktok-sync.test.ts`)
- Saknas: URL-normalisering och duplicate detection
- Saknas: auto-reconcile 0/1/multiple imported clips
- Saknas: API-test för manual customer sync
- Saknas: UI-test för cron-health empty/error/success states

## Öppna affärsfrågor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md), särskilt:

- Hur aggressiv ska auto-matchning vara?
- Ska kunder kunna ha sync disabled medan de är aktiva?
- Hur ofta ska stats refreshas efter att en video publicerats?
- Ska matched TikTok evidence automatiskt bli kund-facing historik, eller kräva CM-godkännande?
