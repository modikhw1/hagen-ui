# 04: TikTok sync, cron och observability

## Mal

Gora TikTok-speglingen till ett robust och observerbart system. Den ska inte kannas som en los GitHub Actions-fil, utan som en kontrollerad syncmotor med:

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

## Nuvarande syncflode

### Per customer

`syncCustomerHistory`:

1. Tar lock via `customer_profiles.operation_lock_until`.
2. Skapar `sync_runs` rad med status `running`.
3. Hamtar TikTok profile/user via RapidAPI `tiktok-scraper7.p.rapidapi.com`.
4. Hamtar `/user/posts` med `unique_id`, `count`, optional `cursor`.
5. Normaliserar TikTok URLs och provider ids.
6. Jämfor mot befintliga `customer_concepts` via TikTok URL.
7. Uppdaterar stats pa befintliga rader.
8. Insertar nya videos som `customer_concepts`:
   - `concept_id=null`
   - `status='history_import'`
   - `history_source='tiktok_profile'`
   - provider metadata
   - TikTok stats
   - ingen `feed_order`
9. Auto-reconcile om exakt ett nytt klipp och en current LeTrend-rad finns.
10. Emittera `feed_motor_signals` nudge om nya klipp importerades.
11. Stämpla `sync_runs` till `ok` eller `error`.
12. Slapp lock.

### Batch/cron

`runHistorySyncBatch`:

1. Rensar stale locks.
2. Valjer kunder med aktiv/inbjuden/agreed status och TikTok-handle.
3. Respekterar staleness/quiet hours/budget.
4. Kor `syncCustomerHistory` per kund.
5. Uppdaterar reconciled thumbnails.
6. Skriver aggregerad rad till `cron_run_log`.

## Supabase-lage

Verifierat via MCP:

- `sync_runs`: 506 rader.
- `cron_run_log`: 0 rader.
- `tiktok_videos`: 431 rader.
- `tiktok_stats`: 109 rader.
- `customer_concepts`: 473 rader.
- `history_import` i `customer_concepts`: 335 rader.
- rader med `reconciled_customer_concept_id`: 4.
- `history_import`-rader med `reconciled_customer_concept_id`: 0 i aktuell DB.
- `history_import`-rader utan reconciliation target: 335.

`cron_run_log` i databasen har kolumner:

- `id`
- `started_at`
- `finished_at`
- `processed`
- `imported`
- `stats_updated`
- `calls_used`
- `budget_remaining`
- `budget_exceeded`
- `stale_locks_cleared`
- `errors`

Repo-migrationen `supabase/migrations/20260505120000_cron_run_log_thumbnails_refreshed.sql` lagger till `thumbnails_refreshed`, och `tiktok-sync.ts` insertar den kolumnen. Den ar inte applicerad i nuvarande MCP-databas. Det forklarar varfor `cron_run_log` kan faila non-fatal och fortsatta vara tom.

Reconciliation-datan ar ocksa vard att validera fore migration: dagens kod skriver länken pa imported-history-raden, men aktuell DB visar de befintliga 4 länkarna pa producerade rader. Det kan vara gammal data, en tidigare motsatt riktning eller ett annat flode som fortfarande skriver fältet.

## Nuvarande problem

### 1. Observability drift

`sync_runs` visar att per-customer sync sker, men `cron_run_log` saknar rader. Admin cron health kan da inte ge en korrekt bild av cron-invokationer.

### 2. Auto-reconcile ar inte plan-advance

Syncen kan lanka en historikrad till current assignment och kopiera stats, men den flyttar inte feeden. UI-kommentarer antyder motsatsen.

### 3. Matchningslogiken ar for smal

Nuvarande auto-match:

- exakt ett nytt klipp
- current slot finns
- ingen befintlig link

Det finns ingen robust scoring for:

- flera nya klipp,
- publiceringsdatum nara planerat datum,
- konceptets hook/topic/format mot klippets metadata,
- manuellt avvisad matchning,
- kundens tiktok-historik som redan fanns innan plan skapades.

### 4. Cron-kontroll ligger utanfor appen

GitHub Actions kan vara okej som scheduler, men appen saknar:

- job definition i databasen,
- explicit enabled/disabled per kund,
- run status i admin,
- retry/backoff per kund,
- budget ledger per provider,
- operator-action for "run now".

### 5. Data bor separeras fran display

TikTok-providerdata, raw stats, sync events och feed planner evidence bor inte bara vara displayfalt pa `customer_concepts`. `customer_concepts` kan ha projection/cached fields, men syncmotorn behover egna sanningskallor.

## Target architecture

### Tables

Antingen bygg vidare pa befintliga tabeller eller skapa tydliga nya:

- `tiktok_profiles`
  - customer id
  - handle
  - provider profile id
  - avatar/followers
  - last fetched

- `tiktok_videos`
  - provider video id
  - canonical url
  - published at
  - caption/metadata/thumbnail
  - customer/profile relation

- `tiktok_video_stats`
  - video id
  - observed at
  - views/likes/comments/shares

- `sync_jobs`
  - type: `profile_history`, `stats_refresh`, `thumbnail_refresh`
  - customer id
  - status
  - locked until
  - attempts
  - next run at

- `sync_run_log`
  - per invocation and per customer runs
  - provider call counts
  - failure reason

- `feed_reconciliation_candidates`
  - assignment id
  - tiktok video id/history row id
  - score
  - reasons
  - status: `suggested`, `accepted`, `rejected`, `auto_accepted`

Om tiden inte racker, borja med att reparera `cron_run_log` och skapa `feed_reconciliation_candidates` senare.

### Services

- `TikTokProviderClient`
  - inga DB writes.

- `TikTokSyncService`
  - import/update raw TikTok data.

- `ReconciliationService`
  - foresla/lanka historik till assignments.

- `FeedPlanEngine`
  - beslutar om plan advance.

- `CronSchedulerFacade`
  - GitHub Actions, Supabase scheduled functions eller annan scheduler anropar samma API.

## Implementeringsplan for agent

### Fas 1: Reparera observability

1. Applicera eller verifiera migrationen for `cron_run_log.thumbnails_refreshed`.
2. Lagg API/server-test som misslyckas om insert-payloaden inte matchar DB-schema.
3. Visa senaste `cron_run_log` i admin med tydligt "ingen cron-run registrerad" om tabellen ar tom.
4. Skilj pa "cron kallades inte" och "cron kallades men inga kunder matchade".

### Fas 2: Run control

1. Lagg admin action "run sync now" per kund.
2. Lagg global action "run batch now" for admin.
3. Lagg `dry_run`/`max_customers` for debugging.
4. Visa RapidAPI budget/calls used fran senaste 24h.

### Fas 3: Reconciliation candidates

1. Vid import av nya klipp, skapa candidate(s) mot current/nearby assignments.
2. Score:a pa:
   - publiceringsdatum relativt plan,
   - current feed slot,
   - URL/provider id,
   - metadata om format/topic/hook nar Hagen-signaler finns,
   - tidigare rejection.
3. UI visar "suggested match" och CM kan acceptera/avvisa.

### Fas 4: Scheduler hardening

1. Behall GitHub Actions som initial scheduler om den fungerar, men lat den bara anropa ett idempotent API.
2. Flytta all affarslogik till servern.
3. Lagg alerts pa:
   - inga cron runs senaste X timmar,
   - hog error rate,
   - provider rate limit,
   - stale locks,
   - kunder med aktiv TikTok handle men ingen lyckad sync senaste X dagar.

## Testkrav

- Unit-test for URL-normalisering och duplicate detection.
- Unit-test for auto-reconcile 0/1/multiple imported clips.
- Integration-test for `cron_run_log` insert shape mot schema.
- API-test for manual customer sync.
- UI-test for cron-health empty/error/success states.

## Oppna affarsfragor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md), sarskilt:

- Hur aggressiv ska auto-matchning vara?
- Ska kunder kunna ha sync disabled medan de ar aktiva?
- Hur ofta ska stats refreshas efter att en video publicerats?
- Ska matched TikTok evidence automatiskt bli kund-facing historik, eller krava CM-godkannande?
