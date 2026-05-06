# Phase 9d — MarkProducedDialog: preferred evidence from cue context

## Problem

`FeedAdvanceCue` highlighted `freshImportedConcepts` but `handleOpenMarkProducedDialog(nuConcept.id)` passed only the nu-concept ID. `CustomerWorkspaceContent` then selected `freshestImportedConcept` globally (most recently published unreconciled clip across **all** cue contexts). With multiple unreconciled clips the dialog could pre-select the wrong TikTok clip.

## Solution overview

Added an optional `preferredImportedConceptId` that travels from cue click → dialog state → clip selection logic. Five files changed; API server untouched.

---

## Files changed

### `artifacts/letrend/src/hooks/useFeedPlannerState.ts`

- Added `preferredImportedConceptId: string | null` state (default `null`).
- `handleOpenMarkProducedDialog(conceptId, preferredClipId?)` — sets both IDs atomically.
- `handleCloseMarkProducedDialog()` — resets `preferredImportedConceptId` to `null` on close.
- `preferredImportedConceptId` and `setPreferredImportedConceptId` added to return object.

### `artifacts/letrend/src/components/studio/customer-detail/feedTypes.ts`

- `FeedPlannerSectionProps.handleOpenMarkProducedDialog` signature extended:
  ```ts
  (conceptId: string, preferredImportedConceptId?: string) => void
  ```
  (was `(conceptId: string) => void`).
  `FeedSlotProps.onOpenMarkProducedDialog` is unchanged — FeedSlot has no cue context.

### `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx`

**Preferred evidence** — `onMarkProducedFromCue` now passes `freshImportedConcepts[0]?.id` as the preferred clip:
```ts
handleOpenMarkProducedDialog(
  nuConcept!.id,
  freshImportedConcepts[0]?.id,   // ← new
);
```

**Dead cue stubs removed** (previously declared but never read after the 320-line block was removed in Phase 9c):
| Removed | Was |
|---|---|
| `advancingPlan` | `const advancingPlan = false;` |
| `onAdvancePlan` | `React.useCallback(() => {}, [])` |
| `showCueOverflowMenu` | `const showCueOverflowMenu = false;` |
| `setShowCueOverflowMenu` | no-op `(_value?) => { void _value; }` |

### `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

- Destructures `preferredImportedConceptId` from `useFeedPlannerState()`.
- `freshestImportedConcept` prop to `<MarkProducedDialog>` now uses an IIFE:

```ts
freshestImportedConcept={(() => {
  const unreconciled = concepts.filter(
    (c) => c.row_kind === 'imported_history' && !c.reconciliation.is_reconciled
  );
  if (preferredImportedConceptId) {
    const preferred = unreconciled.find((c) => c.id === preferredImportedConceptId);
    if (preferred) return preferred;
  }
  // Fallback: globally freshest unreconciled clip sorted by published_at.
  return unreconciled
    .filter((c) => c.result.published_at)
    .sort((a, b) => new Date(b.result.published_at!).getTime() - new Date(a.result.published_at!).getTime())[0] ?? null;
})()}
```

### `artifacts/letrend/src/components/studio/customer-detail/MarkProducedDialog.tsx`

Mojibake corrected (visible user-facing labels only):
| Before | After |
|---|---|
| `Kunden filmade ratt koncept` | `Kunden filmade rätt koncept` |
| `Valj vilket importerat klipp som ska kopplas.` | `Välj vilket importerat klipp som ska kopplas.` |
| `<option value="">Valj klipp...</option>` | `<option value="">Välj klipp...</option>` |
| `Bekrafta` (submit button) | `Bekräfta` |

---

## How preferred clip is selected

1. `FeedAdvanceCue` fires `onMarkProducedFromCue()`.
2. `FeedPlannerSection` calls `handleOpenMarkProducedDialog(nuConceptId, freshImportedConcepts[0]?.id)`.
   - `freshImportedConcepts[0]` is the cue's first fresh clip (sorted by `published_at` desc, same order as cue display).
3. `useFeedPlannerState` stores the ID in `preferredImportedConceptId`.
4. `CustomerWorkspaceContent` evaluates `freshestImportedConcept`:
   - **Primary**: find `preferredImportedConceptId` among unreconciled imported_history concepts.
   - **Fallback**: if preferred ID not found (already reconciled, or dialog opened from FeedSlot without a preferred ID), pick the globally freshest unreconciled clip by `published_at`.
5. On dialog close (`handleCloseMarkProducedDialog`) `preferredImportedConceptId` is reset to `null`.

---

## Fallback behaviour

| Scenario | Result |
|---|---|
| Dialog opened from FeedAdvanceCue, preferred clip still unreconciled | Preferred clip pre-selected in auto/manual mode |
| Dialog opened from FeedAdvanceCue, preferred clip already reconciled | Falls back to globally freshest unreconciled clip |
| Dialog opened from FeedSlot (no preferred ID) | Falls back to globally freshest unreconciled clip |
| No unreconciled clips at all | `null` → dialog shows "markera utan klippkoppling" path |

---

## Test status

- `pnpm --filter @workspace/letrend exec tsc --noEmit` — **0 errors**
- `git diff --check HEAD` — **clean** (no trailing whitespace)
- No API server changes.
- No `/admin/demos` changes.
