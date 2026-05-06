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

## API-endpoints (behövs efter migration)

### 1. Generera kandidater

```
POST /api/studio-v2/customers/:customerId/reconciliation-candidates/generate
```

- Kräver CM-auth.
- Hämtar alla unreconciled history-rader (concept_id=null, reconciled_customer_concept_id=null) för kunden.
- Hämtar alla aktiva assignment-rader (concept_id IS NOT NULL).
- Avgör vilka targets är already_reconciled via en join.
- Kör `rankCandidates` per history-rad.
- Upsert:ar `feed_reconciliation_candidates` med status='suggested' (skippar 'accepted'/'rejected').
- Returnerar: `{ generated: number, skipped_existing: number }`.

### 2. Lista kandidater per kund

```
GET /api/studio-v2/customers/:customerId/reconciliation-candidates
?status=suggested          // filtrera per status
```

- Returnerar kandidater sorterade per score desc.
- Inkluderar history-metadata (tiktok_url, published_at, tiktok_thumbnail_url) och
  target-metadata (concept title, planned_publish_at, feed_order).

### 3. Acceptera kandidat

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/accept
```

- Sätter `status='accepted'`, `decided_at`, `decided_by`.
- Kör samma logik som `POST /history/reconciliation` (länk + stats-propagering).
- Avvisar automatiskt alla andra kandidater för samma history_concept_id.

### 4. Avvisa kandidat

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/reject
```

- Sätter `status='rejected'`, `decided_at`, `decided_by`.
- History-raden är fortfarande unreconciled — CM kan acceptera en annan kandidat.

### 5. Auto-accept (system)

- Anropas av `runHistorySyncBatch` / `autoReconcileAndAdvance` när exakt 1 klipp + hög konfidens.
- Sätter `status='auto_accepted'`, `decided_by=null`.

---

## Integration med befintlig kod

### Trigger-punkter för kandidatgenerering

| Event | Åtgärd |
|---|---|
| `runHistorySyncBatch` — ny klipp importerad | Generera kandidater för kunden (post-sync hook) |
| `autoReconcileAndAdvance` — auto-accepted | Sätt kandidaten till `auto_accepted`; avvisa övriga |
| CM manuell reconcile | Sätt kandidaten till `accepted` om den finns; avvisa övriga |
| CM ångrar reconcile | Återställ kandidat till `suggested` |

### Beroenden att uppdatera

- `tiktok-sync.ts` — efter import, anropa kandidatgenerering per kund
- `auto-reconcile.ts` — efter auto-link, uppdatera kandidatstatus
- `studio-v2.ts POST /history/reconciliation` — uppdatera kandidatstatus
- `studio-v2.ts DELETE /history/reconciliation` — återställ kandidatstatus
- Cron-health UI / FeedPlanner — visa kandidatlista per kund

---

## Tester (implementerat)

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
| `feed_order_adjacent` | +5 för |Δ|≤1; ingen bonus för |Δ|>1 eller null |
| Kombinerat | 85 poäng för perfekt match; korrekt för icke-nu future slot |
| `rankCandidates` | sorterar desc; exkluderar already_reconciled; exkluderar score=0 |

---

## Kvarvarande arbete

1. **Supabase-migration** — orchestratorn skapar tabellen.
2. **Implement `generate` endpoint** — `POST /reconciliation-candidates/generate` med upsert.
3. **Implement `list` endpoint** — med join till customer_concepts för metadata.
4. **Implement `accept`/`reject` endpoints** — med status-uppdatering + befintlig reconcile-logik.
5. **Integrera trigger-punkter** — `tiktok-sync.ts`, `auto-reconcile.ts`, `studio-v2.ts`.
6. **UI** — kandidatlista i FeedPlanner, "Godkänn" / "Avvisa"-knappar per kandidat.
7. **Bulk-backfill** — generera kandidater för de 335 befintliga unreconciled history_import-raderna.
