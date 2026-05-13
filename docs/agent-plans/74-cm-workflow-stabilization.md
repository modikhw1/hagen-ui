# Phase 74 — CM Workflow Stabilization

**Date:** 2026-05-13  
**Scope:** Stabilize Phase 71–73 UX implementation from commit `be7ed6b`  
**Branch:** main (Replit-local HEAD)

---

## Findings

### 1. Hook Ordering Violation — `UploadConceptModal`

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

The Phase 72 implementation placed `if (!isOpen) return null;` **after** all `useState` calls but **before** the `useEffect` that fetches customers. This violates React's Rules of Hooks: hooks may not be called after a conditional return, because the number of hook calls must be identical on every render regardless of conditions.

**Symptom at runtime:** When opening the modal after it had been closed (i.e., toggling `isOpen` from `false` → `true`), React detects a change in the number of hooks called between renders and throws:

```
Error: Rendered more hooks than during the previous render.
```

**Fix applied:**
- Moved `if (!isOpen) return null;` to **after** the `useEffect` block (all hooks first, then any conditional early return).
- The `useEffect` already guards itself with `if (phase !== 'assign') return;`. When the modal is closed, `phase` is always `'url'` (the initial/reset state), so the effect is a no-op — no spurious fetch occurs while the modal is hidden.
- Derived non-hook values (`platform`, `busy`, `stepIndex`, etc.) remain after the early return; they are only needed for rendering.

---

### 2. Ingest-to-Customer: `feed_order` Defaulting to 1

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` (call site)  
**File:** `artifacts/api-server/src/routes/studio-v2.ts` (POST `/customers/:customerId/concepts`)

When `handleSaveAndAssign` in the modal called:
```ts
body: JSON.stringify({ concept_id: id })
```
...no `feed_order` was included. The API route defaulted:
```ts
const feedOrder = typeof body.feed_order === 'number' ? body.feed_order : isCollaboration ? null : 1;
```
This silently placed the newly ingested concept at **position 1** (feed_order=1) in the customer's active queue, which:
- Potentially displaced an existing concept already at position 1
- Conflicted with the Kundarbete grouping model where position 1 = "Nu" (current slot)

**Decision: Option (b) — assign with `feed_order = null`**

Rationale:
- `feed_order = null` maps to the **"Nästa att göra"** bucket in `UnifiedKundarbeteSection` (unscheduled draft), which is the safest landing zone for a newly ingested concept that has not yet been reviewed by the CM.
- No existing assignment is displaced.
- Consistent with how `row_kind = 'collaboration'` rows are created (also null).
- The CM can explicitly drag/promote the concept to any feed position after reviewing it.

**Fix applied:**
- Modal passes `feed_order: null` explicitly in the POST body.
- API route extended to detect explicit `null` in body: `'feed_order' in body && body.feed_order === null` → `feedOrder = null`.
- Existing callers that omit `feed_order` (e.g., `DraftConceptPicker`, `KonceptSection`) continue to default to `1`, preserving their existing behavior.

---

### 3. Dead Prop: `preSelectedCustomerId`

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

The `preSelectedCustomerId` prop was added to the interface and used for two state initializations, but:
- The **only caller** (`artifacts/letrend/src/app/studio/concepts/page.tsx`) never passes it.
- `UnifiedKundarbeteSection` has no "Ladda upp nytt" action that would pass the current customer id.

**Decision:** Remove now, document as future task.

The prop would be valuable when the modal is opened from a customer's Kundarbete view so the correct customer is pre-selected. The implementation path when ready:
1. Add an "Ladda upp nytt" button to `UnifiedKundarbeteSection` (or `CustomerWorkspaceContent`).
2. Pass the current `customerId` as `preSelectedCustomerId` to `UploadConceptModal`.
3. In the modal, initialize `selectedCustomerId` state with the prop value and reset to it on close.

**Fix applied:** Removed `preSelectedCustomerId` from the interface, destructuring, `useState` initialization, and `reset()`. The comment in the interface documents the intent for the future task.

---

## Verification

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | **0 errors** |
| Frontend build (`PORT=5173 BASE_PATH=/`) | **✅ success** (only chunk-size warnings, no errors) |
| Frontend typecheck (`tsc --noEmit`) | See below |

### Frontend Typecheck

**0 errors.** The Phase 74 fixes resolved all type errors introduced by the hook-ordering change (missing `platform`, `busy`, `stepIndex` declarations after the relocated early return). No pre-existing React 19 type errors remain in the frontend after Phase 74.

---

## Files Changed

| File | Change |
|---|---|
| `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` | Hook order fix; remove `preSelectedCustomerId`; pass `feed_order: null` |
| `artifacts/api-server/src/routes/studio-v2.ts` | Accept explicit `feed_order: null` in POST `/customers/:customerId/concepts` |

## Files Not Changed (per scope)

- No Supabase migrations
- No demo flow changes
- No visual language changes
- No push to origin
