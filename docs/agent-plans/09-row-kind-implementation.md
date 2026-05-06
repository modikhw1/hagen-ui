# Agent-plan 09 — row_kind-implementering (klar)

**Datum:** 2026-05-06
**Commits:** `9287f3e` (implementering), `55e6a03` (docs), patch (mark-produced + DB-typer)
**Status:** Implementerad och testad — 0 typfel, 26/26 tester gröna

---

## DB-migration

**Migration:** `20260506131441_add_customer_concepts_row_kind.sql`
**Status:** ✅ Applicerad live mot Supabase (dev + prod)

```sql
ALTER TABLE customer_concepts
  ADD COLUMN IF NOT EXISTS row_kind TEXT
  CHECK (row_kind IN ('assignment', 'collaboration', 'history_import'));
```

---

## Vad som gjordes

Förberedde hela kodbasen (letrend + api-server) för den explicita DB-kolumnen
`customer_concepts.row_kind` (nullable TEXT, värden: `assignment`, `collaboration`,
`history_import`).

### Berörda filer

| Fil | Ändring |
|---|---|
| `artifacts/letrend/src/types/studio-v2.ts` | Lade till `'collaboration'` i `CustomerConceptRowKind`; ny `CollaborationCustomerConcept`-interface; uppdaterad `CustomerConcept`-union |
| `artifacts/letrend/src/lib/studio/customer-concepts.ts` | Ny `resolveRowKind()` med 5-stegs fallback-kedja; `isCollaborationCustomerConcept` breddat; `row_kind` tillagt i `STUDIO_CUSTOMER_CONCEPT_SELECT`; collaboration-gren i normalizer |
| `artifacts/letrend/src/lib/studio/planner/ingest.ts` | `isVerifiedHistory` returnerar explicit `false` för collaboration; planned-filter ändrat + guard för `feed_order < 0` |
| `artifacts/letrend/src/lib/studio/planner/queue-updates.ts` | `isFutureQueueConcept` och `buildDenseFeedOrderInsertionUpdates` accepterar nu `collaboration` jämsides `assignment` |
| `artifacts/api-server/src/routes/studio-v2.ts` | `POST /concepts` skriver `row_kind`; `isPlannedUpcomingFeedRow` får extra guard; **mark-produced target-select och upcoming-select inkluderar nu `row_kind`** |
| `artifacts/api-server/src/lib/studio/tiktok-sync.ts` | TikTok-inserts får `row_kind: 'history_import'` |
| `artifacts/letrend/src/types/database.ts` | `row_kind: string \| null` tillagt i `Row`, `Insert`, `Update` för `customer_concepts` |
| `artifacts/letrend/src/types/database.gen.ts` | `row_kind: string \| null` tillagt i `Row`, `Insert`, `Update` för `customer_concepts` |
| `artifacts/letrend/src/lib/studio/customer-concepts.test.ts` | 6 nya testfall |
| `artifacts/letrend/src/lib/studio/planner/build-feed-planner-model.test.ts` | 1 nytt testfall för collaboration vid negativt feed_order |

---

## Mark-produced — row_kind-kopplingen (komplett)

Target-select hämtar nu `row_kind`. Guardordning i `/feed/mark-produced`:

1. `status === 'produced'` → 409 (redan producerat)
2. `row_kind === 'history_import'` → 409 (explicit block, prioritet över status-heuristik)
3. `row_kind !== null && row_kind ∉ {'assignment','collaboration'}` → 409 (okänd planningsbar kind)
4. `status === 'archived' || status === 'history_import'` → 409 (legacy-skydd för rader utan `row_kind`)
5. `feed_order !== 0` → 409 (ej i nu-slot)

Upcoming-select hämtar också `row_kind` och filtreras via `isPlannedUpcomingFeedRow`
som blockar `row_kind === 'history_import'`.

---

## Designbeslut

### 1. Namngivning: DB vs frontend
DB-kolumnen använder `history_import`; det befintliga frontend-typsystemet använder
`imported_history`. Normalizer mappar `history_import` → `imported_history` utan att byta
namn på frontend-typen (skulle ha brutit 30+ komponenter). Collaboration heter samma i
båda lagren.

### 2. `resolveRowKind` — 5-stegs fallback-kedja
```
1. DB row_kind = 'assignment'    → 'assignment'
2. DB row_kind = 'collaboration' → 'collaboration'
3. DB row_kind = 'history_import'→ 'imported_history'
4. visual_variant = 'collaboration' → 'collaboration'   (heuristik, befintlig data)
5. status = 'history_import' ELLER history_source present → 'imported_history'
6. concept_id present            → 'assignment'
7. legacy fallback               → 'imported_history'
```
DB-kolumnen prioriteras alltid. Heuristikerna fungerar som bakåtkompatibelt skyddsnät
för rader som skrevs innan kolumnen existerade.

### 3. Collaboration med negativt feed_order
En collaboration-rad med `feed_order < 0` är varken historik (isVerifiedHistory → false)
eller plannable (excluded av `feed_order < 0`-guarden i ingest). Den hamnar utanför
planner-modellen men syns ändå i feed-gridet. Detta är korrekt — det är en past-positionerad
collaboration som CM inte städat upp ännu.

### 4. `isCollaborationCustomerConcept` — bakåtkompatibel utvidgning
Kollar nu `row_kind === 'collaboration' || visual_variant === 'collaboration'`. Signaturen
breddar Pick-typen till att inkludera `row_kind`. Alla anrop skickar full `CustomerConcept`
och påverkas inte.

### 5. `queue-updates.ts` — `isFutureQueueConcept`
Collaboration är nu planningsbara i kön (drag-and-drop, reorder, insert). Collaboration
utan `feed_order` (null) ingår inte i kön, precis som assignments.

### 6. DB-typfiler — manuellt uppdaterade
`database.ts` och `database.gen.ts` är handskrivna (ingen `supabase gen types`-pipeline
finns lokalt). `row_kind: string | null` lagts till i `Row`, `Insert`, `Update` för
`customer_concepts` i båda filerna konsekvent.

---

## Pre-existerande testfel (orelaterade)

Tre testfiler misslyckas sedan tidigare och är **inte** relaterade till row_kind-arbetet:

| Testfil | Fel | Orsak |
|---|---|---|
| `src/lib/admin/time.test.ts` | Tidzonsmatchning | Serverns lokalitet matchar inte testets förväntade UTC+2 |
| `src/lib/admin-derive/cm-pulse.test.ts` | Status `needs_action` vs `watch` | Affärslogik-tröskel ändrades utan att testet uppdaterades |
| `src/lib/admin-derive/demos.test.ts` | Label `'Förberedd'` vs `'Utkast'` | `demoStatusLabel('draft')` returnerar fel sträng |

---

## Vad som INTE gjordes / Återstående

- **`/admin/demos`** — orörd (utanför scope)
- **B-1/B-2 (customer create + TikTok invite)** — fortfarande i plan-dokument
  `08-b1-b2-customer-create-invite-patch.md`, inte implementerat.
- **`CollaborationCard.tsx:isCollaborationConcept`** — Den lokala hjälpfunktionen
  kollar bara `visual_variant`. Kan ersättas med `isCollaborationCustomerConcept` från
  `customer-concepts.ts` om full row_kind-support behövs lokalt.
- **Fixa pre-existerande testfel** — Särskilt `cm-pulse` och `demos` (affärslogik).
