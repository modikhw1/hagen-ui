# Phase 10a — Candidate nu-slot accept opens MarkProducedDialog

## Problem

`ReconciliationCandidate` accept-knappen i `FeedSlot.tsx` anropade alltid
`onAcceptCandidate(candidate.id)` direkt, oavsett vilket slot kandidaten
pekade på.

För en kandidat med `candidate.target.feed_order === 0` (nu-slotten) innebär
det att klippet länkades till konceptet via DB, men:
- planen avancerades **inte** (ingen `advance_customer_feed_plan` RPC)
- motor-signalen nollställdes **inte** (`auto_resolved_at` sattes inte)
- `renumberImportedRows` kördes **inte**

Det bypassade hela `reconcile → mark-produced`-flödet som byggdes i
Phase 8a–9d.

## Lösning

Nu-slot-kandidater öppnar `MarkProducedDialog` i stället för direkt accept.
CM går igenom det korrekta flödet:
1. Dialog öppnas med nu-konceptets ID + klippets ID som preferred evidence.
2. CM väljer läge (auto/manual) och bekräftar.
3. `onReconcileHistory` länkar klippet till nu-slotten.
4. `onMarkProduced` markerar konceptet producerat + avancerar planen.

## Filer ändrade

### `feedTypes.ts`

`FeedSlotProps.onOpenMarkProducedDialog` utökad med valfri `preferredImportedConceptId`:

```ts
// Förut
onOpenMarkProducedDialog: (conceptId: string) => void;

// Nu
onOpenMarkProducedDialog: (conceptId: string, preferredImportedConceptId?: string) => void;
```

Befintliga anrop med enbart `conceptId` fortsätter fungera (optional second arg).

### `FeedSlot.tsx` — accept-knapp i kandidatpanelen

**Nu-slot-kandidat (`feedOrder === 0`)**:
- `disabled`: `isLoading || !onOpenMarkProducedDialog` (behöver inte `onAcceptCandidate`)
- `onClick`: anropar `onOpenMarkProducedDialog(candidate.target_customer_concept_id, candidate.history_concept_id)` — synkront, inget loading-state sätts
- Label: `'✓ Nu'` (i stället för `'✓'`)
- `title`: `'Bekräfta och flytta: öppnar bekräftelsedialog...'`

**Icke-nu-kandidater (feedOrder ≠ 0)**:
- Beteende oförändrat: `onAcceptCandidate(candidate.id)` med loading-state och fel-hantering
- Label: `'✓'`
- `title`: original svenska

## Varför nu-slot-kandidater öppnar dialog

Nu-slotten är den "aktiva" slotten — att acceptera en kandidat där är
semantiskt identiskt med att markera konceptet producerat och flytta fram
planen. Direkt `onAcceptCandidate` saknar:

| Effekt | `onAcceptCandidate` | Dialog-flödet |
|---|---|---|
| Länkar klipp till nu-slot | ✅ | ✅ |
| Avancerar feed-planen | ❌ | ✅ |
| Sätter `auto_resolved_at` på motor-signal | ❌ | ✅ |
| Kör `renumberImportedRows` | ❌ | ✅ |

## Hur non-nu-kandidater fortsatt fungerar

Kandidater med `feed_order > 0` (framtida slot) accepteras direkt via
`onAcceptCandidate`. Dessa länkar klippet till ett **framtida** koncept —
ingen planflytt ska ske, motor-signalen är inte relevant. Befintligt
beteende behålls oförändrat.

## Teststatus

- `pnpm --filter @workspace/letrend exec tsc --noEmit` — **0 errors**
- `git diff --check HEAD` — **clean**
- API-server orörd.
- `/admin/demos` orörd.
