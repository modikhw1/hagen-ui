# 02: Feed planner och reconciliation

## Mal

Gora feed planner till en explicit planmotor, inte en samling utspridda UI-handlers, DB-heuristiker och cron-side effects.

Planmotorn ska svara pa:

- Vad ar historik?
- Vad ar nu?
- Vad ar kommande?
- Nar far planen flyttas fram?
- Vad betyder att en TikTok-video matchar en LeTrend-rekommendation?
- Vad ska UI visa medan sync, ingest eller mark-produced pagar?

## Nuvarande planner-pipeline

Kod:

- `artifacts/letrend/src/lib/studio/planner/build-feed-planner-model.ts`
- `artifacts/letrend/src/lib/studio/planner/ingest.ts`
- `artifacts/letrend/src/lib/studio/planner/ordering.ts`
- `artifacts/letrend/src/lib/studio/planner/projection.ts`
- `artifacts/letrend/src/lib/studio/planner/grid-projection.ts`
- `artifacts/letrend/src/lib/studio/planner/queue-updates.ts`
- `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

Flodet ar:

```text
CustomerConcept[] 
  -> normalizePlannerInput
  -> buildPlannerOrdering
  -> buildFeedPlannerViewModel
  -> projectPlannerGrid
  -> FeedPlannerSection
```

### Klassificering idag

`ingest.ts`:

- `readCardKind` returnerar `history` om `concept.row_kind === 'imported_history'`.
- Annars returneras `collaboration` om `isCollaborationCustomerConcept`.
- Annars `concept`.

`isVerifiedHistory`:

- `row_kind === imported_history` ar alltid historik.
- Annars ar `feed_order < 0` historik.

Problem: Om `row_kind` harletts fran `concept_id=null`, kan en collaboration klassas som imported history innan collaboration-checken. Detta ska fixas via explicit row contract.

### Ordering idag

`ordering.ts` delar normalized entries i:

- `past`: historik eller produced/negativ feed_order.
- `future`: assignments med `feed_order !== null`.

Reconciliation-state:

- Imported history + reconciled -> `linked_history`.
- Imported history + inte reconciled -> `unlinked_history`.
- Assignment med `reconciled_clip_id` -> `linked_concept` eller `linked_collaboration`.
- Annars `unlinked_history`.

### Grid idag

`grid-projection.ts` ritar ett 3-kolumners rutnat med nu-cell pa index 4 och minst 9 celler.

Viktigt beteende:

- Celler fore current visar upcoming enligt visuell distans.
- Celler efter current visar past, latest-first.
- Detta ar UI-projektion, inte affarslogik. Den bor inte bestamma vad som ar producerat eller matchat.

## Nuvarande actions

`CustomerWorkspaceContent.tsx` agerar controller:

- Fetchar `/api/studio-v2/customers/:customerId/concepts`.
- Normaliserar med `normalizeStudioCustomerConcept`.
- `handleAssignToSlot` bygger dense updates via `buildDenseFeedOrderInsertionUpdates`.
- `handleSwapFeedOrder` bygger dense swap updates.
- `handleMarkProduced` postar `/api/studio-v2/feed/mark-produced`.
- `handleCheckAndMarkProduced` postar `/api/studio-v2/customers/:customerId/fetch-profile-history`.
- `handleReconcileHistory` postar `/api/studio-v2/history/reconciliation`.
- `handleUndoHistoryReconciliation` kallar DELETE pa samma route.
- `feed_motor_signals` lases och skrivs delvis direkt fran frontend/Supabase.

## Nuvarande mark-produced drift

Det finns tva implementationsspar.

### Aktiv Express-route

`artifacts/api-server/src/routes/studio-v2.ts`, `POST /api/studio-v2/feed/mark-produced`:

1. Uppdaterar vald rad till:
   - `status='produced'`
   - `produced_at=now`
   - `published_at`
   - `tiktok_url`
   - `feed_order=-1`
2. Hamta alla upcoming med `feed_order > 0`.
3. Satt forsta upcoming till `feed_order=0`.
4. Skifta resterande ned med JS-loop.

Detta ar aktiv serverlogik.

### Separat service

`artifacts/letrend/src/lib/studio/perform-mark-produced.ts`:

- Kommentaren sager att den ska anvandas av HTTP route och auto-reconcile cron.
- Satter `pending_history_advance_at`.
- Kallar RPC `shift_feed_order`.
- Stamplar producerad rad.
- Clearar `feed_motor_signals`.

Men Express-routen anvander inte denna service. Den ligger dessutom under `artifacts/letrend`, inte under `artifacts/api-server`, vilket gor anvandning fran Express oklar.

### RPC-risk

Supabase-funktionen `shift_feed_order` ar:

```sql
update public.customer_concepts
set feed_order = feed_order - p_advance_count
where customer_profile_id = p_customer_id
  and feed_order is not null;
```

Den flyttar alla rader med `feed_order`, inte bara assignments. Om historik eller collaboration har `feed_order` kan de flyttas med.

## Nuvarande auto-reconcile

`artifacts/api-server/src/lib/studio/tiktok-sync.ts`:

Efter sync, om:

1. exakt ett nytt klipp importerades,
2. det finns en nu-slot med `feed_order=0` och `concept_id IS NOT NULL`,
3. ingen historikrad redan ar länkad till den nu-slotten,

da:

- Satt `reconciled_customer_concept_id` pa historikraden.
- Satt `reconciled_at`.
- Kopiera TikTok-url, thumbnail, stats och `published_at` till assignment-raden.
- Emittera nudge med `auto_reconciled`.

Den avancerar inte planen.

Problem: `CustomerWorkspaceContent.tsx` har kommentar/logik runt `handleCheckAndMarkProduced` som antar att auto-reconcile redan avancerar planen om nya klipp importerats. Det ar inte sant i nuvarande API-serverkod.

## Target: central planmotor

Skapa en server-side service i `artifacts/api-server`, exempelvis:

```text
src/lib/studio/feed-plan-engine.ts
```

Den ska aga alla write-beslut for:

- assign concept to slot
- reorder/swap
- mark produced
- import history
- reconcile history
- unreconcile history
- advance plan
- emit/resolve feed motor signals

Frontend ska bara anropa kommandon och visa resultat.

## Foreslagna kommandon

### `markProduced`

Input:

- `customerId`
- `customerConceptId`
- optional `tiktokUrl`
- optional `publishedAt`
- `actorProfileId`
- `mode`: `manual_no_evidence` eller `manual_with_evidence`

Output:

- updated current row
- new current row
- changed feed orders
- resolved signal ids

Regel:

- Endast `row_kind='assignment'` eller `row_kind='collaboration'` ska markeras produced.
- Planen avanceras i samma transaktion.
- Imported history ska inte flyttas av feed_order-shift.

### `reconcileHistory`

Input:

- `customerId`
- `historyConceptId`
- `assignmentConceptId`
- `actorProfileId | null`
- `mode`: `manual` eller `auto_candidate`

Output:

- linked history row
- patched assignment row
- nudge/signal state

Regel:

- Reconcile lankar bevis till rekommendation.
- Reconcile ska inte automatiskt flytta planen om inte affarsbeslutet sager det.

### `advanceFromTikTokEvidence`

Detta ar det affarskritiska beslutet. Om exakt ett nytt TikTok-klipp dyker upp medan en current recommendation finns, ska systemet:

- bara skapa "review required",
- auto-lanka men inte flytta,
- eller auto-lanka och flytta current till produced?

Detta maste beslutas innan implementering.

## Rekommenderad implementation

### Fas 1: Stoppa inkonsekvensen

1. Flytta `performMarkProduced`-liknande logik till `artifacts/api-server/src/lib/studio/feed-plan-engine.ts`.
2. Låt `/api/studio-v2/feed/mark-produced` kalla den servicen.
3. Ersatt JS-loop med transaktionell RPC eller explicit server-loop som bara flyttar `row_kind='assignment'`/`collaboration`.
4. Uppdatera `handleCheckAndMarkProduced` sa den inte pastar "advanced" om API:t bara importerade/länkade.

### Fas 2: Enhetliga API-svar

Alla write-routes ska returnera:

```ts
{
  success: true,
  plan: {
    current: CustomerConcept | null,
    changedConcepts: CustomerConcept[],
    signals: FeedMotorSignal[]
  },
  action: {
    kind: string,
    advanced: boolean,
    reconciled: boolean,
    reviewRequired: boolean
  }
}
```

Frontend ska re-fetch eller patcha utifran detta, inte gissa.

### Fas 3: UI-status

Alla async-actions i planner ska ha lokal progress:

- fetching TikTok history
- reconciling
- marking produced
- advancing plan
- undoing reconciliation

Spinner/badge ska sluta nar servern svarar och feeden har uppdaterats.

## Testkrav

- Planner unit tests:
  - collaboration med `concept_id=null` klassas som collaboration.
  - history_import utan reconciliation visas som history.
  - linked history och linked assignment far korrekt state.
- Engine tests:
  - markProduced flyttar bara assignments/collaborations.
  - markProduced ar idempotent nog att inte dubbel-shifta vid retry.
  - reconcile kopierar TikTok metadata men flyttar inte plan om mode inte sager det.
  - auto-reconcile med 0, 1 och flera nya klipp.
- API tests:
  - `/feed/mark-produced`
  - `/history/reconciliation`
  - `/customers/:id/fetch-profile-history`

## Oppna affarsfragor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md). De viktigaste for denna fil:

- Ska exakt ett nytt TikTok-klipp auto-advance:a planen?
- Ska mark-produced vara tillatet utan TikTok-bevis?
- Vad hander nar flera nya klipp kommer in samtidigt?
- Ska imported history synas i grid direkt, eller bara i review-lista tills reconciliation?
