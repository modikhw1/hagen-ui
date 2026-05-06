# Agent-plan 09 — row_kind-implementering (klar)

**Datum:** 2026-05-06
**Commit:** `9287f3e468c76b513bc3057aadb0c341d99eb400`
**Status:** Implementerad och testad — 0 typfel, 26/26 tester gröna

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
| `artifacts/api-server/src/routes/studio-v2.ts` | `POST /concepts` skriver `row_kind`; `isPlannedUpcomingFeedRow` får extra guard |
| `artifacts/api-server/src/lib/studio/tiktok-sync.ts` | TikTok-inserts får `row_kind: 'history_import'` |
| `artifacts/letrend/src/lib/studio/customer-concepts.test.ts` | 6 nya testfall |
| `artifacts/letrend/src/lib/studio/planner/build-feed-planner-model.test.ts` | 1 nytt testfall för collaboration vid negativt feed_order |

---

## Designbeslut

### 1. Namngivning: DB vs frontend
DB-kolumnen använder `history_import`; det befintliga frontend-typsystemet använder
`imported_history`. Normalizer mappar `history_import` → `imported_history` utan att byta
namn på frontend-typen (skulle ha brutit 30+ komponenter). Collaboration heter samma i
båda lagren.

### 2. `resolveRowKind` — 5-stegs fallback-kedja
```
1. DB row_kind = 'assignment'   → 'assignment'
2. DB row_kind = 'collaboration' → 'collaboration'
3. DB row_kind = 'history_import'→ 'imported_history'
4. visual_variant = 'collaboration' → 'collaboration'   (heuristik, befintlig data)
5. status = 'history_import' ELLER history_source present → 'imported_history'
6. concept_id present          → 'assignment'
7. legacy fallback             → 'imported_history'
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

---

## Vad som INTE gjordes

- **Ingen DB-migration** — kolumnen antas finnas (nullable) men det finns ingen
  migration i repot. Nästa agent behöver skriva SQL:
  ```sql
  ALTER TABLE customer_concepts
    ADD COLUMN IF NOT EXISTS row_kind TEXT
    CHECK (row_kind IN ('assignment', 'collaboration', 'history_import'));
  ```
- **`/admin/demos`** — orörd (utanför scope)
- **Mark-produced samarbetskoncept** — mark-produced-flödet i `studio-v2.ts` blockerar
  fortfarande på `status = 'history_import'`-check (som täcker legacy-fall). `row_kind`
  hämtas inte i det specifika select-anropet (rad 973). Om man vill låsa samarbetskoncept
  via `row_kind` istf `status` behöver man lägga till `row_kind` i det select och en
  explicit guard.
- **B-1/B-2 (customer create + TikTok invite)** — fortfarande i plan-dokument
  `08-b1-b2-customer-create-invite-patch.md`, inte implementerat.

---

## Pre-existerande testfel (orelaterade)

Tre testfiler misslyckas sedan tidigare och är **inte** relaterade till row_kind-arbetet:

| Testfil | Fel | Orsak |
|---|---|---|
| `src/lib/admin/time.test.ts` | Tidzonsmatchning | Serverns lokalitet matchar inte testets förväntade UTC+2 |
| `src/lib/admin-derive/cm-pulse.test.ts` | Status `needs_action` vs `watch` | Affärslogik-tröskel ändrades utan att testet uppdaterades |
| `src/lib/admin-derive/demos.test.ts` | Label `'Förberedd'` vs `'Utkast'` | `demoStatusLabel('draft')` returnerar fel sträng |

---

## Nästa steg för orkestratorn

1. **DB-migration** — Kör SQL ovan mot Supabase (dev + prod). Utan kolumnen faller
   normalizer tillbaka på heuristiker, vilket är korrekt men inte optimalt.
2. **Backfill** — Uppdatera befintliga rader:
   ```sql
   UPDATE customer_concepts SET row_kind = 'assignment'
     WHERE row_kind IS NULL AND concept_id IS NOT NULL;
   UPDATE customer_concepts SET row_kind = 'history_import'
     WHERE row_kind IS NULL AND status = 'history_import';
   UPDATE customer_concepts SET row_kind = 'collaboration'
     WHERE row_kind IS NULL AND visual_variant = 'collaboration';
   ```
3. **Fixa pre-existerande testfel** — Särskilt `cm-pulse` och `demos` (affärslogik).
4. **Mark-produced för collaboration** — Om collaboration-rader ska kunna markeras som
   producerade: lägg till `row_kind` i select rad 973 i `studio-v2.ts` och lägg till
   `row_kind !== 'history_import'` som explicit guard.
5. **`CollaborationCard.tsx:isCollaborationConcept`** — Den lokala hjälpfunktionen
   kollar bara `visual_variant`. Om full row_kind-support behövs lokalt: importera
   `isCollaborationCustomerConcept` från `customer-concepts.ts` istf.
