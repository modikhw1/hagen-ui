# Plan 17 — Phase 9c: FeedAdvanceCue ska använda MarkProducedDialog-flödet

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/15-mark-produced-confirmation-flow.md`, `docs/agent-plans/16-mark-produced-error-propagation.md`

---

## Problem

`FeedAdvanceCue`-knappen "Markera som gjord" anropade direkt `handleMarkProduced(nuConcept.id, linkClip.tiktok_url, linkClip.published_at)`. Det innebar:

1. **Inget reconcile** — `reconciled_customer_concept_id` på historikraden sattes aldrig
2. **Falsk success** — fel sväljes av `handleMarkProduced` (alert-wrapper) utan att CM fick chansen att välja klipp i dialogen
3. **Motorn dismissed direkt** — signalen ackrediterades även om mark-produced misslyckades

---

## Vad ändrades

### `artifacts/letrend/src/components/studio/customer-detail/FeedAdvanceCue.tsx`

- Tog bort `markingProducedFromCue` från `FeedAdvanceCueProps` och destructuring
- Knappen är inte längre `disabled` (öppning av en dialog är omedelbar)
- Knapptext: `"Markera som gjord"` → `"Bekräfta som gjord"` (tydligare att det öppnar ett bekräftelsesteg)
- `cursor: pointer` alltid (inget `'not-allowed'`-läge behövs)

### `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx`

#### `markingProducedFromCue` state borttagen

State var `const [markingProducedFromCue, setMarkingProducedFromCue] = React.useState(false)`.
Borttagen eftersom knappen nu öppnar en dialog (synkront) — inget loading-state behövs.

#### `onMarkProducedFromCue` — ny implementation

```typescript
// Före:
onMarkProducedFromCue={() => {
  void (async () => {
    setMarkingProducedFromCue(true);
    try {
      const linkClip = freshImportedConcepts.length > 0 ? freshImportedConcepts[0] : null;
      await handleMarkProduced(nuConcept!.id, linkClip?.tiktok_url, linkClip?.published_at);
      onDismissAdvanceCue(activeNudges[0]?.id);
    } finally {
      setMarkingProducedFromCue(false);
    }
  })();
}}

// Nu:
onMarkProducedFromCue={() => {
  // Markera färska klipp som evidens i historiken medan dialogen är öppen.
  if (freshImportedIds.size > 0) {
    setFocusedEvidenceIds(freshImportedIds);
  }
  handleOpenMarkProducedDialog(nuConcept!.id);
}}
```

**Skillnad**:
- Motor-signalen dismissas **inte** när knappen klickas — bara dialogen öppnas
- Signal dismissas först när MarkProducedDialog slutför mark-produced (befintlig logik i handleMarkProduced/handleCloseMarkProducedDialog)
- `focusedEvidenceIds` sätts till `freshImportedIds` så CM kan se vilka klipp som importerades medan dialogen är öppen

#### Döda koden borttagen

Blocket `{false && effectiveCue && !deferredAdvanceCue && (...)}` (ca 320 rader) var en gammal alternativ cue-implementation, aldrig renderad. Borttagen helt eftersom:
- TypeScript typ-checkade det ändå (orsakade 9 kompileringsfel efter att `markingProducedFromCue` togs bort)
- Innehöll direktanrop till `handleMarkProduced` (samma felaktiga mönster som vi nu fixar)

---

## Flödesdiagram efter Phase 9c

```
CM klickar "Bekräfta som gjord" i FeedAdvanceCue
  ↓
setFocusedEvidenceIds(freshImportedIds)   ← CM ser klipp markerade i historiken
handleOpenMarkProducedDialog(nuConcept.id) ← dialog öppnas
  ↓
MarkProducedDialog (befintlig logic, Phase 9a+9b):
  auto: reconcileHistoryRequest(freshestClip, use_now_slot) → markProducedRequest(...)
  manual: CM väljer klipp → reconcileHistoryRequest → markProducedRequest
  skip: markProducedRequest utan länk
  ↓
onClose() kallas på success → modal stängs
fetchConcepts(true) → feed uppdateras
setJustProducedConceptId → nu-konceptet highlightas
Motor-signal auto-resolved av mark-produced API (Phase 8c)
```

---

## Vad som INTE ändrades

- `handleMarkProduced` alert-wrapper — oförändrad (används fortfarande av FeedSlot direktknappar)
- `handleReconcileHistory` alert-wrapper — oförändrad
- Motor-signal dismiss-logik — ingen extra dismiss-call från cue-knappen längre; signalen rensas automatiskt av `POST /feed/mark-produced` via `auto_resolved_at`
- API-server — orört
- `/admin/demos` — orört
- `auto-reconcile.ts` — orört

---

## Kvarvarande arbete

### `showCueOverflowMenu` / `setShowCueOverflowMenu`

Variabeln används fortfarande i det aktiva cue-blocket (men inte längre i den döda koden). Den är oförändrad.

### Motor-signal dismiss timing

Med den nya cue-flödet dismissas motorn via `auto_resolved_at` på servern (satt av mark-produced API). Det finns ett litet tidsfönster mellan när CM klickar "Bekräfta" i dialogen och när signalen är borta. FeedAdvanceCue försvinner automatiskt när `activeNudges` töms vid nästa `fetchConcepts`.

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 fel |
| API-server orört | ✅ |
| Döda koden borttagen | ✅ (9 kompileringsfel eliminerade) |
