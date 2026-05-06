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

## API-endpoints (implementerat ✅)

Alla 4 endpoints är implementerade i `artifacts/api-server/src/routes/studio-v2.ts`.

### 1. Generera kandidater ✅

```
POST /api/studio-v2/customers/:customerId/reconciliation-candidates/generate
```

- Kräver CM-auth + `ensureCustomerAccess`.
- Hämtar unreconciled history-rader (`concept_id IS NULL`, `reconciled_customer_concept_id IS NULL`, `tiktok_url IS NOT NULL`).
- Hämtar target-rader (`concept_id IS NOT NULL`, `status != 'archived'`).
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
- Uppdaterar kandidaten: `status='accepted', decided_at, decided_by`.
- Avvisar automatiskt alla andra `suggested`-kandidater för samma `history_concept_id`.

### 4. Avvisa kandidat ✅

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/reject
```

- Fetch candidate → `ensureCustomerAccess(candidate.customer_id)`.
- 409 om redan `rejected`; 409 om `accepted/auto_accepted` (hänvisar till DELETE /history/reconciliation).
- Sätter `status='rejected', decided_at, decided_by`.
- History-raden förblir unreconciled — CM kan acceptera en annan kandidat.

### 5. Auto-accept (system — ej implementerat än)

- Ska anropas av `runHistorySyncBatch` / `autoReconcileAndAdvance` när exakt 1 klipp + hög konfidens.
- Sätter `status='auto_accepted'`, `decided_by=null`.

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
| `runHistorySyncBatch` — ny klipp importerad | ⏳ Ej implementerat | Anropa generate per kund post-sync |
| `autoReconcileAndAdvance` — auto-accepted | ⏳ Ej implementerat | Sätt kandidat till `auto_accepted`; avvisa övriga |
| CM manuell reconcile (POST /history/reconciliation) | ⏳ Ej implementerat | Sätt kandidat till `accepted` om den finns |
| CM ångrar reconcile (DELETE /history/reconciliation) | ⏳ Ej implementerat | Återställ kandidat till `suggested` |
| **accept-endpoint** | ✅ Implementerat | Skriver `reconciled_*` + avvisar competitors |
| **reject-endpoint** | ✅ Implementerat | Sätter `rejected` |

### Beroenden att uppdatera

- `tiktok-sync.ts` — efter import, anropa generate-endpoint per kund
- `auto-reconcile.ts` — efter auto-link, skapa/uppdatera kandidat med `auto_accepted`
- `studio-v2.ts POST /history/reconciliation` — upserta kandidat som `accepted` om den finns
- `studio-v2.ts DELETE /history/reconciliation` — återställ kandidat till `suggested`
- FeedPlanner UI — visa kandidatlista per kund med "Godkänn" / "Avvisa"-knappar

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

### Route-tester (testgap)

Route-tester för de 4 nya endpoints saknas. Orsak: projektet har inget etablerat mönster
för Express route-tester med Supabase-mock (ingen `supertest`/`nock`/`msw`-setup finns).
Dessa routes är ganska tunna (auth-check → DB-anrop → svar) och täcks bättre med
integrationstester mot staging-DB. Dokumenterat som teknisk skuld.

---

## Kvarvarande arbete

1. ✅ ~~Supabase-migration~~ — tabellen är live i produktion.
2. ✅ ~~`generate` endpoint~~ — implementerat.
3. ✅ ~~`list` endpoint~~ — implementerat.
4. ✅ ~~`accept`/`reject` endpoints~~ — implementerat.
5. **Integrera trigger-punkter** — `tiktok-sync.ts` (post-sync generate), `auto-reconcile.ts` (auto_accepted), `POST/DELETE /history/reconciliation` (sync kandidatstatus).
6. **UI** — kandidatlista i FeedPlanner, "Godkänn" / "Avvisa"-knappar per kandidat.
7. **Bulk-backfill** — anropa generate för de ~335 befintliga unreconciled history_import-raderna.
8. **Route-tester** — sätt upp supertest + Supabase-mock om coverage krävs.
