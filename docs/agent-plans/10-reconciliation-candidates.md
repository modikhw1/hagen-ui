# 10: Reconciliation Candidates — TikTok history ↔ LeTrend concepts

## Mål

Ersätta den nuvarande heuristiska auto-reconcile-logiken ("exakt 1 klipp → länka till nu-slot")
med ett explicit kandidatsystem. Admin/CM kan se _varför_ en länkning föreslogs, godkänna eller
avvisa den, och systemet kan generera kandidater även för kunder med fler än 1 nytt klipp.

---

## Bakgrund: nuvarande reconciliation-logik

### Begrepp

| Term | Förklaring |
|---|---|
| **History row** | `customer_concepts` rad med `concept_id=null`, `row_kind='imported_history'`. Skapas av TikTok-synk. |
| **Assignment row** | `customer_concepts` rad med `concept_id IS NOT NULL`. En LeTrend-planerad slot. |
| **Reconciliation** | En history-rad länkas till en assignment-rad via `reconciled_customer_concept_id` på history-raden. |
| **Nu-slot** | Assignment-rad med `feed_order=0`. Det aktuella konceptet som ska postas. |

### Befintliga kodvägar

| Fil | Funktion |
|---|---|
| `artifacts/api-server/src/lib/studio/tiktok-sync.ts` | Auto-reconcile inline: om exakt 1 klipp importerades, länka till nu-slot. Skriver ej `cron_run_log` vid dryRun. |
| `artifacts/letrend/src/lib/studio/auto-reconcile.ts` | Mer avancerad auto-reconcile: hittar nyaste unreconciled clip → länka → kör `performMarkProduced`. |
| `artifacts/api-server/src/routes/studio-v2.ts` | `POST /history/reconciliation` — manuell CM-länkning. `DELETE /history/reconciliation` — ångra. |
| `artifacts/letrend/src/components/studio/customer-detail/FeedSlot.tsx` | UI: "Länka till nu", "Välj manuellt", "Ångra koppling". |
| `artifacts/letrend/src/lib/studio/planner/types.ts` | `PlannerReconciliationState`: not_applicable / unlinked_history / linked_history / linked_concept. |

### Svagheter i nuläget

1. **Ambiguitet ignoreras** — om `totalImported > 1` skippas auto-reconcile helt. 335 unreconciled history_import-rader.
2. **Ingen audit trail** — CMs ser inte *varför* en länk skapades eller om den var låg konfidens.
3. **Ingen kandidatlista** — CM måste manuellt hitta rätt assignment-rad i feedplannern.
4. **Ingen status per kandidat** — systemet vet inte om en CM avvisat ett förslag tidigare.

---

## Planerat DB-kontrakt

```sql
CREATE TABLE feed_reconciliation_candidates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                 uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  history_concept_id          uuid NOT NULL REFERENCES customer_concepts(id) ON DELETE CASCADE,
  target_customer_concept_id  uuid NOT NULL REFERENCES customer_concepts(id) ON DELETE CASCADE,
  score                       numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  reasons                     jsonb NOT NULL DEFAULT '[]',
  status                      text NOT NULL DEFAULT 'suggested'
                              CHECK (status IN ('suggested','accepted','rejected','auto_accepted')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  decided_at                  timestamptz,
  decided_by                  uuid REFERENCES auth.users(id),

  UNIQUE (history_concept_id, target_customer_concept_id)
);

CREATE INDEX ON feed_reconciliation_candidates (customer_id, status);
CREATE INDEX ON feed_reconciliation_candidates (history_concept_id);
```

> **Migrationen hanteras av orchestratorn.** Koden är förberedd men tabellen existerar inte ännu.

---

## Scoring-helper (implementerat)

Fil: `artifacts/api-server/src/lib/studio/reconciliation-scoring.ts`

### Input

```typescript
interface HistoryConceptForScoring {
  id: string;
  published_at: string | null;   // faktisk TikTok-publiceringsdatum
  tiktok_url: string | null;
  feed_order: number | null;
}

interface TargetConceptForScoring {
  id: string;
  feed_order: number | null;     // 0=nu-slot, >0=kommande, <0=historik
  planned_publish_at: string | null;
  is_already_reconciled: boolean; // caller avgör från DB
}
```

### Poängsättning (max 100)

| Signal | Poäng | Reason |
|---|---|---|
| Target är nu-slot (`feed_order=0`) | +40 | `current_slot` |
| `published_at` ≤ ±3 dagar från `planned_publish_at` | +40 | `date_proximity_high` |
| `published_at` ≤ ±7 dagar | +25 | `date_proximity_medium` |
| `published_at` ≤ ±14 dagar | +10 | `date_proximity_low` |
| feed_order är adjacent (\|Δ\| ≤ 1) | +5 | `feed_order_adjacent` |
| Inget `published_at` | 0 | `no_published_at` |
| Inget `planned_publish_at` | 0 | `no_planned_date` |
| Target redan länkad | =0, ineligible | `already_reconciled` |

### Exporterade funktioner

```typescript
// Poäng för ett specifikt par
scoreCandidate(history, target): ScoringResult

// Poängsätt alla targets, filtrera eligible, sortera score desc
rankCandidates(history, targets): Array<{ target, result }>
```

---

## API-endpoints (implementerat och stabiliserat ✅)

Alla 4 endpoints är implementerade och stabiliserade i `artifacts/api-server/src/routes/studio-v2.ts`.
Alla routes är registrerade på modulnivå — inte nästlade inuti andra route-handlers.

### 1. Generera kandidater ✅

```
POST /api/studio-v2/customers/:customerId/reconciliation-candidates/generate
```

- Kräver CM-auth + `ensureCustomerAccess`.
- Hämtar unreconciled history-rader (`row_kind='history_import'`, `reconciled_customer_concept_id IS NULL`, `tiktok_url IS NOT NULL`).
- Hämtar target-rader (`row_kind IN ('assignment','collaboration')`, `concept_id IS NOT NULL`, `status != 'archived'`).
- Avgör `is_already_reconciled` via befintliga `reconciled_customer_concept_id`-värden.
- Skippar par med status `accepted/rejected/auto_accepted` i DB.
- Kör `rankCandidates` per history-rad och upsert:ar med `onConflict: 'history_concept_id,target_customer_concept_id'`.
- Returnerar: `{ generated, skipped_locked, history_count }`.

### 2. Lista kandidater per kund ✅

```
GET /api/studio-v2/customers/:customerId/reconciliation-candidates?status=suggested
```

- Filtrerar per `status` (valfritt, valideras mot `suggested|accepted|rejected|auto_accepted`).
- Sorterar `score DESC, created_at DESC`.
- Berikar varje kandidat med `history` (tiktok_url, published_at, tiktok_thumbnail_url, feed_order)
  och `target` (feed_order, planned_publish_at, status, concepts{backend_data, overrides}).
- Returnerar: `{ candidates: EnrichedCandidate[] }`.

### 3. Acceptera kandidat ✅

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/accept
```

- Fetch candidate → `ensureCustomerAccess(candidate.customer_id)`.
- 409 om redan `accepted/auto_accepted`.
- Anropar intern `applyReconciliationLink(supabase, historyId, targetId, actorId, now)` som:
  - Sätter `reconciled_customer_concept_id / reconciled_by_cm_id / reconciled_at` på history-raden.
  - Propagerar TikTok-stats (thumbnail, url, views, likes, comments, published_at) till assignment-raden.
- Anropar `markCandidateAcceptedForLink` (service): UPDATE → INSERT om saknas, avvisar `suggested`-konkurrenter.
- Kontrollerar `MarkResult.ok`: om `ok=false`, returneras **500** med `candidate_sync_error` — UI får aldrig tro att accept är klar om kandidattabellen misslyckades.

### 4. Avvisa kandidat ✅

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/reject
```

- Fetch candidate → `ensureCustomerAccess(candidate.customer_id)`.
- 409 om redan `rejected`; 409 om `accepted/auto_accepted` (hänvisar till DELETE /history/reconciliation).
- Sätter `status='rejected', decided_at, decided_by`.
- History-raden förblir unreconciled — CM kan acceptera en annan kandidat.

### 5. Auto-accept (system ✅)

- Anropas av `syncCustomerHistory` (tiktok-sync) när exakt 1 klipp auto-länkas till nu-slot.
- Anropar `markCandidateAcceptedForLink(..., { auto: true })` → `status='auto_accepted'`, `decided_by=null`.
- Best-effort: synkfel avbryter ej synken.

---

## Intern helper

```typescript
// artifacts/api-server/src/routes/studio-v2.ts (ej exporterad)
async function applyReconciliationLink(
  supabase, historyConceptId, targetConceptId, actorId, now
): Promise<{ error: string | null }>
```

Extraherad från POST /history/reconciliation — återanvänds av accept-endpointen och
kan i framtiden användas av auto-accept-logiken i tiktok-sync.

---

## Integration med befintlig kod

### Trigger-punkter för kandidatgenerering

| Event | Status | Åtgärd |
|---|---|---|
| `runHistorySyncBatch` — ny klipp importerad | ✅ Implementerat | `generateReconciliationCandidates` anropas post-sync (non-fatal) |
| tiktok-sync auto-reconcile | ✅ Implementerat | `markCandidateAcceptedForLink(..., auto: true)` → `auto_accepted` |
| CM manuell reconcile (POST /history/reconciliation) | ✅ Implementerat | `markCandidateAcceptedForLink(..., auto: false)` → `accepted` |
| CM ångrar reconcile (DELETE /history/reconciliation) | ✅ Implementerat | `resetCandidateAfterUndo` → `suggested`, rensar `decided_at/by` |
| **accept-endpoint** | ✅ Implementerat | Använder `markCandidateAcceptedForLink` + avvisar competitors |
| **reject-endpoint** | ✅ Implementerat | Sätter `rejected` |

### Service-lager (implementerat ✅)

Fil: `artifacts/api-server/src/lib/studio/reconciliation-candidates.ts`

Exporterar tre funktioner:

| Funktion | Beskrivning |
|---|---|
| `generateReconciliationCandidates(supabase, customerId)` | Poängsätter alla (history, target)-par och upsert:ar `suggested`-rader; skippar låsta. Alla 4 required queries error-checkade — kastar vid fel (inkl. `lockedRows`-query) så decided-rader aldrig riskerar överskrivning. |
| `markCandidateAcceptedForLink(supabase, histId, tgtId, opts)` | UPDATE befintlig rad (bevarar score) → INSERT om saknas; avvisar `suggested`-konkurrenter. Returnerar `MarkResult { ok, inserted, updated, rejected, error? }`. Kastar aldrig. |
| `resetCandidateAfterUndo(supabase, histId, tgtId)` | Återställer `accepted/auto_accepted` → `suggested`, rensar `decided_at/by`. Best-effort. |

### Beroenden — status

---

## Tester

### Scoring-helper (20 testfall, ✅ alla gröna)

Fil: `artifacts/api-server/src/lib/studio/reconciliation-scoring.test.ts`

| Grupp | Testfall |
|---|---|
| `already_reconciled` | score=0, eligible=false; ignorerar alla andra signaler |
| `current_slot` | +40 för nu-slot; ingen bonus för feed_order≠0 |
| `date_proximity_high` | +40 för ±1 dag; +40 för exakt 3 dagar |
| `date_proximity_medium` | +25 för 5 dagar; inte high |
| `date_proximity_low` | +10 för 10 dagar; 0 för >14 dagar |
| `no_published_at` | no_published_at reason; ingen datumbonus; eligible=false när score=0 |
| `no_planned_date` | no_planned_date reason; ingen datumbonus |
| `feed_order_adjacent` | +5 för \|Δ\|≤1; ingen bonus för \|Δ\|>1 eller null |
| Kombinerat | 85 poäng för perfekt match; korrekt för icke-nu future slot |
| `rankCandidates` | sorterar desc; exkluderar already_reconciled; exkluderar score=0 |

### Route-registreringstester (5 testfall, ✅ alla gröna)

Fil: `artifacts/api-server/src/lib/studio/reconciliation-candidates-routes.test.ts`

Importerar `studio-v2`-routern och inspekterar `router.stack` vid modulnivå — verifierar att
alla 4 endpoints plus `DELETE /history/reconciliation` finns registrerade **utan** att DELETE-handlens
callback behöver köras. Körs med Vitest (samma runner som scoring-testerna).

Full integrationstestning (supertest + Supabase-mock) är inte satt upp i projektet och
täcks bättre med tester mot staging-DB. Dokumenterat som teknisk skuld.

---

## Kvarvarande arbete

1. ✅ ~~Supabase-migration~~ — tabellen är live i produktion.
2. ✅ ~~`generate` endpoint~~ — implementerat med `row_kind` filter.
3. ✅ ~~`list` endpoint~~ — implementerat med berikat metadata.
4. ✅ ~~`accept`/`reject` endpoints~~ — implementerat med full felhantering.
5. ✅ ~~Route-nästlingsbugg~~ — DELETE-handler stängs korrekt; nya routes på modulnivå.
6. ✅ ~~Route-registreringstester~~ — 5 smoke-tester verifierar modulnivå-registrering.
7. ✅ ~~Service-lager~~ — `reconciliation-candidates.ts` med `generateReconciliationCandidates`, `markCandidateAcceptedForLink`, `resetCandidateAfterUndo`.
8. ✅ ~~Post-sync generate hook~~ — tiktok-sync anropar generate efter import (non-fatal).
9. ✅ ~~Auto-reconcile kandidatstatus~~ — tiktok-sync anropar markCandidateAcceptedForLink vid auto-link.
10. ✅ ~~Manual reconciliation status sync~~ — POST/DELETE /history/reconciliation synkar kandidatstatus.
11. ✅ ~~Hardening~~ — `existingLinks`- och `lockedRows`-queries error-checkade; `markCandidateAcceptedForLink` returnerar `MarkResult`; accept-routen returnerar 500 om kandidatsynk misslyckas.
12. ✅ ~~Backfill endpoint~~ — `POST /internal/backfill-reconciliation-candidates` (CRON_SECRET-skyddad) med `dryRun`, `limit`, `customerIds`-stöd. Returnerar `customers_with_history` (rå universe) och `eligible_count` (faktiskt processbart: har både history-rader och target-rader).

**Nästa steg:**

- ✅ ~~Post-sync generate hook~~ — `generateReconciliationCandidates` anropas från `tiktok-sync.ts` post-import.
- ✅ ~~Manual reconciliation status sync~~ — POST/DELETE /history/reconciliation synkar kandidatstatus.
- ✅ ~~Hardening + backfill endpoint~~ — `MarkResult`, error-check alla required queries (inkl. `lockedRows`), `/internal/backfill-reconciliation-candidates` med korrekt `eligible_count`-semantik.
- **Bulk-backfill** — kör backfill-endpoint mot produktion (se runbook nedan). Verifiera med verifieringsquery.
- **FeedPlanner UI** — kandidatlista per historik-rad med Godkänn/Avvisa-knappar; integrera i `FeedSlot.tsx` eller nytt sidopanel.

---

## Backfill Runbook

Endpoint: `POST /api/studio-v2/internal/backfill-reconciliation-candidates`  
Auth: `Authorization: Bearer $CRON_SECRET`

### 1. Dry run — se vilka kunder som berörs

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}' \
  https://<api-host>/api/studio-v2/internal/backfill-reconciliation-candidates | jq .
```

Svar:
```json
{
  "customers_with_history": 42,
  "eligible_count": 38,
  "customers_processed": 0,
  "dry_run": true,
  "errors": []
}
```

- **`customers_with_history`** — kunder med minst en unreconciled `history_import`-rad med `tiktok_url`.
- **`eligible_count`** — faktiskt processbart: har BÅDE history-rader OCH minst en aktiv target-rad
  (`row_kind IN ('assignment','collaboration')`, `concept_id IS NOT NULL`, `status != 'archived'`).
  Det är detta antal som `limit` räknas mot och som orkestratorn bör verifiera mot Supabase.

### 2. Skarp körning — begränsat antal (rekommenderas vid första körning)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "limit": 50}' \
  https://<api-host>/api/studio-v2/internal/backfill-reconciliation-candidates | jq .
```

Svar innehåller bl.a. `customers_processed`, `generated`, `skipped_locked`, `history_count`,
`customers_with_history`, `eligible_count`, `errors[]`, `dry_run: false`.

Kontrollera `errors`-arrayen — om tom är allt OK. Kör igen med nästa batch tills `customers_processed < limit`.

> **Orkestratorn-flöde:** kör alltid dry run först och jämför `eligible_count` mot SQL-verifieringsqueryn
> nedan innan live-körning körs. Om siffrorna inte stämmer, pausa och undersök.

### 3. Skarp körning — alla kunder

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}' \
  https://<api-host>/api/studio-v2/internal/backfill-reconciliation-candidates | jq .
```

### 4. Specificerade kunder

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "customerIds": ["<uuid1>", "<uuid2>"]}' \
  https://<api-host>/api/studio-v2/internal/backfill-reconciliation-candidates | jq .
```

### 5. Verifieringsquery (kör via Supabase SQL Editor)

```sql
-- Kontrollera täckning: kunder med unreconciled history men utan några candidates
SELECT
  cc.customer_profile_id,
  COUNT(*) AS unreconciled_history_count,
  (
    SELECT COUNT(*)
    FROM feed_reconciliation_candidates frc
    WHERE frc.customer_id = cc.customer_profile_id
  ) AS candidate_rows
FROM customer_concepts cc
WHERE cc.row_kind = 'history_import'
  AND cc.reconciled_customer_concept_id IS NULL
  AND cc.tiktok_url IS NOT NULL
GROUP BY cc.customer_profile_id
HAVING (
  SELECT COUNT(*)
  FROM feed_reconciliation_candidates frc
  WHERE frc.customer_id = cc.customer_profile_id
) = 0
ORDER BY unreconciled_history_count DESC;
-- Förväntat resultat efter fullständig backfill: 0 rader
```

```sql
-- Totalt antal kandidater per status efter backfill
SELECT status, COUNT(*) AS cnt
FROM feed_reconciliation_candidates
GROUP BY status
ORDER BY cnt DESC;
```

### 6. Rollback / cleanup om något blir fel

Backfill skriver **enbart** `status='suggested'`-rader och skippar par som redan är locked
(accepted/rejected/auto_accepted). Det är därmed alltid säkert att köra om.

Om du behöver rensa **alla** suggested-kandidater för en kund:

```sql
-- OBS: kör i Supabase med WHERE-filter, aldrig utan
DELETE FROM feed_reconciliation_candidates
WHERE customer_id = '<customer-uuid>'
  AND status = 'suggested';
-- Accepterade/auto_accepted/rejected påverkas INTE av ovanstående.
```

Om du behöver rensa **alla** kandidater för en kund (inkl. beslutade):

```sql
-- VARSAM — tar bort hela kandidathistoriken för kunden
DELETE FROM feed_reconciliation_candidates
WHERE customer_id = '<customer-uuid>';
```

Kör backfill-endpoint igen för att återskapa suggested-kandidater.
