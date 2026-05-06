# 01: Core customer concept contract

## Mal

Skapa ett explicit grundobjekt for hur appen forstar:

- Ett globalt koncept i biblioteket.
- Ett kundspecifikt koncept i feeden.
- Ett kundspecifikt samarbete.
- En importerad TikTok-historikrad.
- En producerad/reconciled koppling mellan LeTrend-rekommendation och kundens faktiska TikTok-post.

Idag ligger detta implicit i `concepts`, `customer_concepts`, `feed_order`, `concept_id`, `status`, `visual_variant`, `history_source` och flera normalizers. Det gor appen svar att resonera om och gor att UI-display, ingest och timeline-logik blandas.

## Nuvarande topologi

### Tabeller

Verifierat via Supabase MCP:

- `concepts`: 27 rader. Globalt bibliotek av koncept.
- `customer_concepts`: 473 rader. Kundspecifika assignments, historikimporter och samarbeten.
- `feed_spans`: 5 rader. Planerade intervall/perioder i feed planner.
- `feed_motor_signals`: 17 rader. Nudges/signaler fran syncmotor.
- `tiktok_videos`: 431 rader. TikTok-videoobjekt.
- `tiktok_stats`: 109 rader. TikTok-statistik.

Viktiga constraints:

- `concepts.id` ar `text not null` utan default.
- `concepts.source` tillater `hagen` eller `cm_created`.
- `customer_concepts.status` tillater bara `draft`, `sent`, `produced`, `archived`, `history_import`.
- `customer_concepts` har unique constraint pa `(customer_profile_id, concept_id)`.
- `customer_concepts.concept_id` far vara `null`, men foreign key finns nar den inte ar null.

### Kod som definierar implicit kontrakt

- `artifacts/letrend/src/types/studio-v2.ts`  
  Frontendens huvudtyp `CustomerConcept`.

- `artifacts/letrend/src/lib/studio/customer-concepts.ts`  
  Normaliserar DB-rader och har `getStudioCustomerConceptRowKind`.

- `artifacts/letrend/src/lib/customer-feed.ts`  
  Customer facing projection av koncept/feed.

- `artifacts/letrend/src/lib/studio/planner/*`  
  Feed planner-projektion ovanpa `CustomerConcept`.

- `artifacts/api-server/src/routes/studio-v2.ts`  
  Skapar, uppdaterar, flyttar och reconcilar `customer_concepts`.

- `artifacts/api-server/src/lib/studio/tiktok-sync.ts`  
  Importerar TikTok-klipp som `customer_concepts` med `status='history_import'` och `concept_id=null`.

## Nuvarande implicit modell

| Fall | Hur det uttrycks idag | Problem |
| --- | --- | --- |
| Globalt koncept | `concepts` med `source='hagen'` eller `source='cm_created'` | `id` maste skapas av appen, men vissa routes gor inte det. |
| Kund-assignment | `customer_concepts.concept_id != null` | `status='assigned'` anvands i API men ar ogiltigt i DB. |
| Collaboration | `customer_concepts.concept_id=null`, `visual_variant='collaboration'` | Krockar med importerad historik eftersom bada saknar `concept_id`. |
| TikTok-historik | `customer_concepts.concept_id=null`, `status='history_import'`, `history_source='tiktok_profile'` | Borjar som historik men ligger i samma tabell som planerade koncept. |
| Producerad LeTrend-rad | `status='produced'`, `feed_order=-1`, ev. `tiktok_url`, `published_at` | Blandas med timeline-position och TikTok-bevis. |
| Reconciled historik | enligt dagens routes ska importerad historikrad ha `reconciled_customer_concept_id` till assignment | Nuvarande DB avviker: 4 rader har länken, men de ligger pa `status='produced'`; `history_import` har 0 länkade rader. |

## Konkreta kodfel att fixa tidigt

### 1. Ogiltig status vid assignment

`artifacts/api-server/src/routes/studio-v2.ts` satter:

```ts
status: isCollaboration ? 'draft' : 'assigned'
```

Men DB-checken tillater inte `assigned`. Antingen ska `assigned` in i constrainten med tydlig state machine, eller sa ska API:t anvanda `draft`/`sent` enligt nuvarande schema. Rekommendation: anvand inte `assigned` utan att forst skriva ner en full state machine. For ett snabbt stabiliserande steg: spara nya assignments som `draft`.

### 2. `POST /api/admin/concepts` saknar `id`

`artifacts/api-server/src/routes/admin/concepts.ts` insertar `source`, `created_by`, `backend_data`, `overrides`, `is_active`, `version`, men inget `id`.

DB har `concepts.id text not null` utan default. Antingen ska migrationen ge default, eller sa ska servern skapa deterministiskt/UUID-baserat id. Rekommendation: skapa id server-side med prefix, till exempel `cm_${uuid}` eller `hagen_${sourceId}` beroende pa source.

### 3. `concept_id IS NULL` betyder for mycket

`normalizeStudioCustomerConcept` har en row-kind-harledning baserad pa `concept_id`. Det racker inte, eftersom:

- TikTok historik saknar `concept_id`.
- Collaboration saknar ocksa `concept_id`.
- Eventuella framtida importerade externa koncept kan ocksa sakna `concept_id`.

Lagg till explicit `row_kind` eller `source_type` i DB, alternativt bygg en central server-side read model som konsekvent harleder:

- `assignment`
- `collaboration`
- `history_import`

Rekommendation: DB-kolumn `row_kind` med check constraint och backfill. Det ar tydligare an att fortsatta sprida heuristiken.

### 4. Reconciliation-riktningen maste normaliseras

Dagens manual route och TikTok-sync skriver `reconciled_customer_concept_id` pa imported-history-raden och pekar mot assignment-raden. Nuvarande Supabase-data visar daremot att de 4 befintliga länkade raderna har `status='produced'`, medan `history_import`-raderna inte har nagon link.

En agent ska inte anta att all befintlig data foljer nuvarande route-intention. Migrations/backfill behover identifiera vilken riktning som ar sann for gamla rader innan UI eller planmotor byggs ovanpa fältet.

## Foreslaget mal-kontrakt

### `concepts`

Globalt bibliotek. Ska inte veta kundens timeline-position eller om nagot har publicerats.

Obligatoriska falt:

- `id`
- `source`
- `backend_data`
- `overrides`
- `created_by`
- `is_active`
- `version`

Rekommenderade tillagg:

- `external_source_id` for Hagen video id eller annat upstream-id.
- `schema_version` for backend_data.
- `metadata_quality_status`: `raw`, `enriched`, `reviewed`, `deprecated`.

### `customer_concepts`

Kundens instans av ett koncept eller en kundspecifik rad i feeden.

Rekommenderad explicit state:

- `row_kind`: `assignment`, `collaboration`, `history_import`.
- `timeline_state`: `unplaced`, `planned`, `current`, `produced`, `archived`.
- `evidence_state`: `none`, `candidate_history`, `linked_history`, `manual_tiktok`, `verified_tiktok`.

`feed_order` kan finnas kvar, men bor bara betyda relativ planposition inom assignments. Historik ska inte bevisas genom negativa `feed_order` ensamt.

### `customer_concept_events` eller audit-logg

For att gora flodet begripligt i admin:

- `assigned_to_customer`
- `moved_in_feed`
- `marked_produced`
- `tiktok_history_imported`
- `history_reconciled`
- `history_unreconciled`
- `plan_advanced`

Detta kan borja som befintlig `events`/`audit_log` om det finns en etablerad modell, men feeden behover en lasbar event trail.

## Implementeringsplan for agent

### Fas 1: Stabiliserande schema/API-fixar

1. Andra `POST /api/studio-v2/customers/:customerId/concepts` sa vanliga koncept sparas med giltig status.
2. Andra `POST /api/admin/concepts` sa `id` alltid skickas.
3. Lagg test som visar att ny concept insert och ny customer assignment lyckas mot mockad Supabase-klient.
4. Generera/uppdatera Supabase types om migrationer andras.

### Fas 2: Explicit row contract

1. Migration: lagg `row_kind` pa `customer_concepts`.
2. Backfill:
   - `status='history_import'` eller `history_source is not null` -> `history_import`.
   - `visual_variant='collaboration'` -> `collaboration`.
   - annars -> `assignment`.
3. Check constraint for `row_kind`.
4. Uppdatera inserts i:
   - `studio-v2.ts`
   - `tiktok-sync.ts`
   - eventuell demo/customer creation
5. Uppdatera normalizer:
   - Anvand DB `row_kind` nar den finns.
   - Ha fallback bara for gamla rader under migreringsperiod.

### Fas 3: Read models

Skapa en central projection, exempelvis:

- `lib/studio/customer-concept-contract.ts`
- `lib/studio/customer-concept-read-model.ts`

Den ska returnera:

- `kind`
- `timelineState`
- `evidenceState`
- `content`
- `placement`
- `tiktokEvidence`
- `reconciliation`

Frontend-komponenter ska inte sjalva tolka `concept_id`, `status`, `feed_order` och `visual_variant` pa olika satt.

## Testkrav

- Unit-test for row-kind-harledning och backfill edge cases.
- API-test for create concept och assign concept.
- Planner-test for collaboration med `concept_id=null`.
- Customer-facing projection-test for imported history vs produced assignment.
- Migration smoke-test mot Supabase branch innan production.

## Oppna affarsfragor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md), framfor allt fragorna om:

- Ska imported TikTok-historik bo i `customer_concepts` eller i egen tabell?
- Ska collaboration vara en variant av assignment eller eget objekt?
- Vilka statusar ska vara synliga affarsstatusar kontra interna tekniska states?
