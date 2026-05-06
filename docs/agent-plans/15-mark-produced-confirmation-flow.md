# Plan 15 — Phase 9a: Mark-Produced Confirmation Flow

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/11-confirmation-engine.md`, `docs/agent-plans/14-confirmation-engine-phase-8c.md`

---

## Vad ändrades

### `artifacts/letrend/src/components/studio/customer-detail/MarkProducedDialog.tsx`

#### `mode === 'auto'` — ny tvåstegsordning

**Tidigare beteende**: Anropade bara `onMarkProduced(nuConceptId, clip?.tiktok_url, clip?.published_at)`.
Klippet passades som parametrar till mark-produced men kopplades aldrig till assignment-raden
via `onReconcileHistory`. Länkfältet `reconciled_customer_concept_id` på historik-raden lämnades
tomt.

**Nytt beteende**:

```
if clip finns:
  1. onReconcileHistory(clip.id, { mode: 'use_now_slot' })   ← POST /history/reconciliation
  2. onMarkProduced(nuConceptId, clip.tiktok_url, clip.published_at) ← POST /feed/mark-produced
if inget clip:
  onMarkProduced(nuConceptId)   ← ingen förändring
```

Fel-semantik:
- Om steg 1 misslyckas → generiskt fel visas, steg 2 körs inte (inget att rulla tillbaka).
- Om steg 1 lyckas men steg 2 misslyckas → **specifik feltext** utan rollback:
  > "Klippet kopplades till konceptet men planflytten misslyckades. Kopplingen är sparad — uppdatera sidan och kontrollera att nu-kortet har markerats som gjort."

#### `mode === 'manual'` — verifierad, kommentarer tillagda

Ordningen var redan korrekt (reconcile → mark-produced). Lade till inline-kommentarer
och samma specifika feltext om mark-produced misslyckas efter lyckad länkning.

#### `mode === 'skip'`

Oförändrat — `onMarkProduced(nuConceptId)` utan klipp, utan reconcile.

#### Buggfix: stavfel i fallback-feltext

`'Okant fel'` → `'Okänt fel'` (saknat ä).

---

### `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

Stale-kommentarer i `handleCheckAndMarkProduced` uppdaterade:

**Före**:
```
// Fetches the latest clips from TikTok first. If a new clip was imported,
// auto-reconcile already advanced the plan — no separate mark-produced needed.
// Returns 'advanced' (clip found, plan moved) or 'no_clip' (nothing new on profile).
...
// Auto-reconcile ran inside the fetch and already marked nu as produced.
```

**Nu**:
```
// Fetches the latest clips from TikTok first to update the imported history.
// Returns 'advanced' if new clips were imported — MarkProducedDialog will then
// handle linking the clip and advancing the plan via reconcile + mark-produced.
// Returns 'no_clip' if nothing new was found on the profile.
...
// New clips were imported — refresh concepts so MarkProducedDialog sees them.
```

---

### `artifacts/letrend/src/components/studio/customer-detail/feedTypes.ts`

JSDoc på `FeedSlotProps.onCheckAndMarkProduced` uppdaterad:

**Före**:
```typescript
// Checks TikTok for a new clip before producing. Returns 'advanced' if a clip was found and
// auto-reconcile already advanced the plan, or 'no_clip' if nothing new was found.
```

**Nu**:
```typescript
// Checks TikTok for a new clip before producing. Returns 'advanced' if new clips were
// imported (caller should open MarkProducedDialog to link and advance the plan),
// or 'no_clip' if nothing new was found on the profile.
```

---

## Varför auto-läget nu länkar innan advance

Det tidigare auto-läget passade `tiktok_url` och `published_at` som parametrar till
`mark-produced`, men anropade aldrig `POST /history/reconciliation`. Det innebar att
historik-radens `reconciled_customer_concept_id` aldrig sattes — kopplingen syntes
inte i TikTok-historik-griden och `confirmPublishedConcept`-logiken (Phase 8a) kördes
aldrig.

Med den nya ordningen:

1. `POST /history/reconciliation?mode=use_now_slot` — sätter `reconciled_customer_concept_id`,
   kopierar stats (thumbnail, views etc.) till assignment-raden via `confirmPublishedConcept`.
2. `POST /feed/mark-produced` — kör `advance_customer_feed_plan` RPC, renumberar
   importerade rader (Phase 8c), rensar motor-signals.

Steg 1 och 2 är sekventiella och inte atomiska — om steg 2 misslyckas informeras CM med
ett tydligt meddelande utan rollback av steg 1.

---

## Kvarvarande arbete

### Candidate accept för nu-slot — "bekräfta och flytta"-action

EP-1 (`reconciliation-candidates/:id/accept`) anropar `confirmPublishedConcept` men
avancerar **inte** planen. Om accepterat kandidat är nu-slottens motstycke borde
accept implicit trigga `mark-produced`.

**Föreslagen framtida åtgärd**:
- Lägg till `advanceMode: 'auto_if_now_slot'` i `confirmPublishedConcept`
- Visa confirm-dialog i FeedSlot för nu-slot-kandidater
- Kopplar EP-1-flödet till same advance + renumber + motor-signals som EP-4

**Blockeras av**: produktägarens UX-beslut (bekräftas eller avfärdas i separat task).

### EP-6 — `auto-reconcile.ts` (letrend-sidan)

Fortfarande tre öppna problem (dokumenterade i Plan 14):
- Stats-propagering saknas
- Optimistiskt lås saknas
- Motor-signals rensas inte

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 fel |
| API-server rör inte detta (inga server-ändringar) | ✅ |
| `/admin/demos` orört | ✅ |
| `auto-reconcile.ts` orört | ✅ |
