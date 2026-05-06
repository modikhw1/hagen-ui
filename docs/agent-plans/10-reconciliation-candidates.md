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

---

## QA-manuell (Phase 4b)

### Förutsättningar

- Logga in som Admin eller CM.
- Navigera till en kund med `imported_history`-rader i Feed-fliken.
- Kund med candidates: minst en unreconciled history-rad som har `status='suggested'` i `feed_reconciliation_candidates`.

### Scenario A — Accept

1. Öppna en kund med ett eller flera "Förslag"-märkta historik-kort.
2. Varje kort visar en lista med kandidater (en per `suggested`-rad), sorterade score desc.
   - Varje rad visar: målkonceptets titel (eller Nu-slot/+N), score, anledningschip, plannerat datum.
3. Klicka ✓ (Acceptera) på en kandidat.
   - Knappen visar "..." medan requesten pågår.
   - Vid success: historik-kortet uppdateras (kandidatlistan försvinner; kortet markeras som rekonsilierat i FeedPlanner).
   - Inga alert()-dialoger visas.
4. Om endpointen returnerar fel: ett inline-felmeddelande visas under den aktuella kandidatens knappar; övriga kandidater förblir opåverkade.

### Scenario B — Reject

1. Klicka ✕ (Avvisa) på en kandidat.
   - Knappen visar "..." under requestens gång.
   - Vid success: kandidaten försvinner ur listan; övriga kandidater kvarstår.
   - Vid fel: inline-felmeddelande under den aktuella kandidatens knappar.
2. Inga andra kandidater eller kortets rekonsileringsstatus påverkas.

### Scenario C — Generera förslag

1. Högerklicka (eller öppna kontextmenyn via ⋮) på ett unreconciled history-kort.
2. Välj "Generera förslag".
   - Menyknappen visar "Genererar..." och är inaktiverad under generering.
   - Inga andra menyval ska gå att klicka under genereringen.
3. Vid success: ett kort resultatmeddelande visas i menyn ("N förslag genererade" eller "Inga nya förslag"), menyn stängs automatiskt efter ~1,8 s och kandidatpanelen på kortet uppdateras.
4. Vid fel: feltext visas i menyn; menyn stängs inte automatiskt — CM kan läsa felet och stänga manuellt.

### Scenario D — Kund utan candidates (manuella flöden)

1. Öppna en kund där inga `suggested`-kandidater finns.
2. History-kort saknar "Förslag"-badge och kandidatpanel.
3. Kontextmenyn för history-kort innehåller fortfarande:
   - "Markera som LeTrend" / "Ångra koppling"
   - "Välj LeTrend-koncept..."
   - "Generera förslag" (om kunden har aktiva targets — triggar genereringen på nytt)
4. Manuell rekonsiliering via "Välj LeTrend-koncept..." fungerar som vanligt och uppdaterar FeedPlanner direkt.

### Scenario E — Accept uppdaterar planner direkt

1. Acceptera en kandidat (Scenario A, steg 3 success).
2. FeedPlanner refreshas omedelbart utan manuell sidomladdning.
3. History-kortets rekonsileringsstatus ändras till `linked_history`; TikTok-statistik (thumbnail, views, likes) propageras till den länkade assignment-raden.

### Negativa/robustfallen

- `candidate.target` är null: kortet kraschar inte — slotLabel fallback visas ("Koncept").
- `candidate.history` är null: inline-panel renderas utan TikTok-thumbnail-data.
- `candidate.target.concepts` är null: `getConceptDetails` anropas inte; `slotLabel` eller "Koncept" visas som titel.
- Dubbel-klick på Accept/Reject: andra klicket ignoreras (knapparna inaktiverade under loading).


---

## Phase 5 QA-rapport (2026-05-06)

### Statisk kod-QA utförd på

- `FeedSlot.tsx` — komplett genomgång av kandidatpanel, badge, generate-meny
- `CustomerWorkspaceContent.tsx` — accept/reject/generate handlers
- `feedTypes.ts` — propgränssnittet
- `FeedPlannerSection.tsx` — pass-through av props

### Buggar hittade och åtgärdade

#### Bug 1 — Kandidatpanelens maxHeight för hög (KRITISK layout-bugg)

**Problem**: Panelen hade `maxHeight: 200px`. 9:16-kort har `maxHeight: 280px` och
är typiskt 210–230px höga vid normala kolumnbredder (~130px). Med tags + titel +
datum + stats = ca 50–70px icke-kandidat-innehåll kvarstår ungefär 100–110px för
kandidatpanelen. En panel på 200px riskerade att trycka ut innehåll utanför kortets
bounding box eller överlappa toppraden (TikTok-ikonen).

**Fix**: `maxHeight: 200` → `maxHeight: 100`. Vid 1 kandidat (~76px) ryms den utan
scroll; vid 2+ visas scrollbar automatiskt via `overflowY: 'auto'`.

#### Bug 2 — Onödig overflowY-condition

**Problem**: `overflowY: candidates.length > 2 ? 'auto' : undefined`. Redundant
eftersom `overflowY: 'auto'` ändå bara visar scrollbar när innehållet överstiger
maxHeight. Skapar ingen synlig skillnad men lägger logik som förvirrar.

**Fix**: `overflowY: 'auto'` alltid.

### Samtliga 10 testfall — statisk verifiering

| # | Testfall | Status | Notering |
|---|---|---|---|
| 1 | "Förslag"-badge på history-kort med candidates | ✅ | Amberchip, absolute top-right, döljs om isFreshEvidence=true |
| 2 | Panel visar flera kandidater sorterade score desc | ✅ | Sortering sker server-side; alla visas i scroll-container |
| 3 | Titel/fallback, score, reason, planned date | ✅ | getConceptDetails → headline_sv/headline → slotLabel → 'Koncept' |
| 4 | Långa titlar/reasons spräcker inte kortet | ✅ | `textOverflow:'ellipsis', whiteSpace:'nowrap'`; reasons: `flexWrap:'wrap'` |
| 5 | Missing target/concepts/tom reasons — ingen krasch | ✅ | Null-safe optional chaining; `reasons[0] ?? ''`; empty string ej renderat |
| 6 | Generate visar loading, hanterar error, refreshar | ✅ | generateFeedback.loading → "Genererar..."; .catch → "Fel: ..."; .then → fetchCandidates |
| 7 | Accept refreshar concepts + candidates direkt | ✅ | clearClientCache + fetchConcepts(true) + fetchCandidates() parallellt |
| 8 | Reject refreshar candidates | ✅ | fetchCandidates() anropas efter success |
| 9 | Accept/reject error inline, state korrekt | ✅ | candidateErrors[id] visas under knappar; ingen alert(); candidates behålls i state |
| 10 | Manuella reconciliation-flöden orörda | ✅ | handleMarkHistoryAsLeTrend, handleUndoLinkedHistory, reconciliationPicker, clipPicker ej berörda |

### Kvarvarande risker

1. **HTTP-cache efter mutation** — Fetch API (default cache mode) skickar
   If-None-Match med senaste etag. Om Express inte räknar om etag korrekt efter
   accept/reject kan `fetchCandidates()` returnera cachad 304 med gammal data.
   Express `etag: true` (default) beräknar etag från response body — bör fungera,
   men testades inte end-to-end mot live-kandidater (se instruktionen: accept/reject
   ej utförda mot riktiga kandidater).

2. **Scroll-UX på mobilvy** — Scroll-container inuti touch-ytan (kort-onClick) kan
   ge problem på mobil om touch-event tolkas som kortklick istället för scroll.
   `onClick: e.stopPropagation()` på panelens wrapper förhindrar detta på desktop;
   mobil touch kan kräva ytterligare `onTouchStart: e.stopPropagation()` om problem
   uppstår i produktion.

3. **Kandidatpanel + thumbnailkort** — Glasstyle-panelen (`backdrop-filter: blur`)
   kräver att kortet inte har `overflow: hidden` (vilket det inte har). Fungerar i
   moderna browsers; Safari <14 stödjer inte `backdrop-filter` utan prefix.

4. **Produce-integration** — Om en CM "markerar som producerat" en history-rad som
   har candidates, uppdateras inte kandidatstatus automatiskt utöver vad
   `POST /history/reconciliation` redan hanterar. Inga nya risker jämfört med
   föregående fas.

### Testade kunder (statisk/kod-QA; ingen accept/reject mot live-data)

- Kund med candidates: customer_id=0480dae5-7010-478c-87c6-b0bfaad29f85 (API-loggar
  visar aktiva GET /reconciliation-candidates?status=suggested-anrop för denna kund)
- Kund utan candidates: verifierat kodväg — badge och panel döljs, kontextmeny
  visar "Generera förslag" för orekonsilierade history-kort


---

## Phase 6 — Affärssemantik, statsmodell och UI-språk (2026-05-06)

### Domänmodell: vad rekonciliering faktiskt betyder

**Rekonciliering är INTE en matchning mellan två historikkort.**

Det är ett CM-beslut som bekräftar att ett specifikt TikTok-klipp är den publicerade
outputen för ett specifikt LeTrend-planerat koncept.

```
TikTok-klipp (raw evidence)  ──bekräftas som output för──►  LeT-planerat koncept
     imported_history row                                      assignment row
   (feed_order saknas eller                                  (feed_order ≥ 0,
    är negativt; concept_id=null)                            concept_id IS NOT NULL)
```

---

### Statsmodell: fem tillstånd

| Tillstånd | Databas-representation | Vem äger | Visas i UI |
|---|---|---|---|
| **TikTok history / raw evidence** | `customer_concepts` med `row_kind='imported_history'`, `concept_id=null`, `reconciled_customer_concept_id=null` | TikTok-synk | FeedPlanner historik-kolumn, omarkerat |
| **LeT planned concept** | `customer_concepts` med `row_kind='assignment'` eller `'collaboration'`, `concept_id IS NOT NULL`, `feed_order ≥ 0` | CM / Admin | FeedPlanner koncept-kolumn, nu/+N slot |
| **Bekräftelseförslag** | `feed_reconciliation_candidates` rad med `status='suggested'` | Scoring-motor | FeedSlot: "Bekräfta"-badge + kandidatpanel |
| **Bekräftad LeT-historik** | `imported_history`-rad med `reconciled_customer_concept_id IS NOT NULL`; assignment-raden har `tiktok_url`, `published_at`, statistik propagerat | CM (accept) eller auto | FeedPlanner historik-kolumn, grön border |
| **TikTok-only / kundägd** | `imported_history`-rad explicit markerad av CM som ej LeT-output; `reconciled_customer_concept_id=null` fortsatt | CM (avvisa alla förslag) | FeedPlanner historik-kolumn, inget förslag |

> **Bekräftad LeT-historik** är det enda tillståndet som triggar `advance_customer_feed_plan`
> (timeline shift). Acceptera en kandidat länkar idag klippen men kallar **inte** per automatik
> advance-motorn — se Engine-gap nedan.

---

### Beslutsträd för CM vid kandidatgranskning

```
Finns kandidater för detta TikTok-klipp?
│
├─ JA: target.feed_order = 0 (nu-slot)
│      └─ Semantik: "detta klipp är output för vår nuvarande planerade post"
│         ✓ Bekräfta → confirm-dialog → applyReconciliationLink + performMarkProduced + advance
│         Confirm-dialogen visar: konceptets titel, klippets publiceringsdatum, valfritt länkfält
│         (länk kan lämnas tom om CM redan har sett och godkänt klippet)
│         Efter advance: nu-slotten skiftar till historik; nästa slot kliver upp till feed_order=0
│
├─ JA: target.feed_order > 0 (kommande slot / scoring-signal)
│      └─ Semantik: scoring-motorn tror att klippet kan kopplas till ett framtida koncept,
│         men i det normala flödet är det alltid nu-slotten (feed_order=0) som är relevant target.
│         Feed_order > 0 blockerar INTE accept — det är en svagare signal, inte ett out-of-order-fel.
│         ✓ Bekräfta → samma flöde; advance triggas INTE (target är ej nu-slot)
│         CM kan sedan manuellt markera producerat om önskat
│
├─ JA: target.feed_order < 0 (historisk slot)
│      └─ Scoring ger normalt låg poäng (already_reconciled-guard exkluderar dessa)
│         Visas bara om manuell koppling gjorts fel — kräver CM-verifiering
│
└─ NEJ / alla avvisade / kunden gick sin egna väg
       └─ CM-alternativ:
            a) "Hitta LeT-bekräftelse" i kontextmenyn → scoring-motorn söker igen
            b) "Välj LeTrend-koncept..." → manuell koppling
            c) Logga som TikTok-only → kunden valde att producera något annat
               → Originalrekommendationen (LeT-konceptet) bör kunna läggas i idle
                  eller återladdas i feed planner vid ett senare tillfälle
```

**Stegvis matchning vid N > 1 nya klipp (det normala flödet)**

Kunden laddar ibland upp flera klipp sedan senaste synk. Det avsedda flödet:

1. Varje klipp får en scored candidate-lista mot nu-slotten (och övriga targets).
2. CM (eller cron) bekräftar det senaste klippet mot nu-slotten → advance → nästa slot kliver upp.
3. Nästa "markera som gjord" tar nästa oklippta klipp och matchar mot den nya nu-slotten.
4. Detta upprepas tills alla klipp är kopplade eller markerade TikTok-only.

Om ett klipp matchades fel: CM ångrar (DELETE /history/reconciliation → resetCandidateAfterUndo)
och kan därefter bekräfta rätt koncept. Ångra-stöd är ett krav — se Designbeslut 4 nedan.

---

### Engine-gap: vad accept gör idag vs vad det bör göra

#### Vad `POST /reconciliation-candidates/:id/accept` gör idag

1. Sätter `reconciled_customer_concept_id` + stats (thumbnail, views, etc.) på history-raden.
2. Propagerar TikTok-stats till assignment-raden.
3. Markerar kandidaten `accepted`, avvisar `suggested`-konkurrenter.

#### Vad det INTE gör

- Kallar **inte** `performMarkProduced` → tidslinjen (feed_order) skiftas **inte**.
- Kallar **inte** `advance_customer_feed_plan` RPC → nu-slotten stannar på feed_order=0.
- Sätter **inte** `pending_history_advance_at` → inget "syncing..."-badge i UI.
- Rensar **inte** aktiva `feed_motor_signals` → motorns nudge kvarstår.

#### Konsekvens

Accept via kandidatpanelen skapar en korrekt TikTok↔LeT-länk men lämnar
feed_order-tidslinjen oförändrad. CM måste fortfarande manuellt "markera som producerat"
(via "Markera som LeTrend"-flödet eller cronens `autoReconcileAndAdvance`) för att
driva planen framåt.

Detta är **medvetet** för Phase 6 — funktionaliteten är säker men ofullständig.

#### Vad som behöver implementeras för full automation

| Steg | Fil | Status |
|---|---|---|
| accept-endpoint kallar `performMarkProduced` när target är nu-slot | `artifacts/api-server/src/routes/studio-v2.ts` | ❌ Ej implementerat |
| accept-endpoint skickar `{ advanced: true/false }` i response | `studio-v2.ts` | ❌ Ej implementerat |
| Confirm-dialog i FeedSlot vid accept av nu-slot-kandidat | `FeedSlot.tsx` | ❌ Ej implementerat |
| FeedSlot visar "Tidslinjen uppdaterad" vid advance=true | `FeedSlot.tsx` | ❌ Ej implementerat |
| TikTok-only-markering: idle-flagga på LeT-konceptet | `studio-v2.ts` / DB | ❌ Ej implementerat |
| Ångra-stöd för advance (återställ feed_order efter felaktig advance) | Nytt endpoint | ❌ Ej implementerat |
| Manual CM-bekräftelse av nu-slot triggar samma advance som cron | `performMarkProduced` | ✅ Finns; behöver kopplas |

---

### Designbeslut (bekräftade 2026-05-06)

**1. Nu-slot accept → implicit advance med confirm-dialog**

Accept av en kandidat där `target.feed_order = 0` ska trigga `performMarkProduced`
(advance_customer_feed_plan RPC) direkt i accept-endpointen, **efter** en confirm-dialog i UI.
Dialogen visar konceptets titel och klippets publiceringsdatum. Ett valfritt länkfält kan inkluderas
men är inte obligatoriskt — CM förväntas ha sett och godkänt klippet innan de bekräftar.

**2. feed_order > 0 blockerar inte — stegvis matchning är det avsedda flödet**

Kandidater med `feed_order > 0` är scoring-signaler, inte out-of-order-varningar.
Det normala flödet vid N > 1 nya klipp:
- Varje "markera som gjord" (manuellt eller cron) tar det senaste oklippta klippet mot nu-slotten.
- Steg för steg kliver tidslinjen framåt.
- Ingen modal blockerar CM för `feed_order > 0` — accept sker direkt men triggar ej advance
  (eftersom target inte är nu-slot).
Om ett klipp matchades fel hanteras det via ångra-flödet (punkt 4).

**3. TikTok-only: kunden producerade något eget — originalkonceptet till idle**

När CM väljer att logga ett klipp som TikTok-only (kunden gick sin egna väg):
- Klippet markeras som ej LeT-output (candidates avvisas, tiktok_only-flagga sätts om implementerat).
- Det ursprungliga LeT-konceptet (assignment-raden) bör kunna läggas i `idle`-status
  eller återladdas i feed planner vid ett senare tillfälle.
- Detta möjliggör: plan-kontinuitet utan att konceptet försvinner ur biblioteket.

**4. Ångra-stöd för advance är ett krav — CM ska känna att det "bara fungerar"**

`DELETE /history/reconciliation` återställer länken och kör `resetCandidateAfterUndo`.
Men `advance_customer_feed_plan` är idag inte reversibel. Behov:
- En "ångra advance"-endpoint (eller RPC) som återställer feed_order till föregående tillstånd.
- CM-upplevelsen ska inte kräva manuell feed_order-redigering — backend hanterar allt.
- Vanlig CM i dagligt flöde ska aldrig behöva förstå feed_order-siffror.

**5. Motor-signal vid accept utan advance — ännu inte beslutat**

Om accept sker utan advance (target är ej nu-slot) kvarstår eventuella aktiva
`feed_motor_signals`. Huruvida dessa ska rensas vid accept utan advance är ännu inte beslutat.
Behöver utvärderas när motor-signal-UX är klarare.

