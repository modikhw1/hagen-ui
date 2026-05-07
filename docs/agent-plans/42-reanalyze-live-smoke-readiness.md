# Phase 42 — Reanalyze Live Smoke Readiness

## Goal

Add minimal debug/readiness instrumentation to the review page's reanalyze panel so that live
smoke testing can verify the Phase 40–41 safety contract without technical tooling. No DB writes
from the orchestrator.

## Live Environment Context (as of 2026-05-07)

- 26 active concepts in the DB.
- 0 concepts have confirmed `script_mode`, `setup_complexity`, `skill_required`, or `setting`.
- 5 concepts have confirmed legacy filter fields: `peopleNeeded`, `difficulty`, `filmTime`, `businessTypes`.

**Implication:** Smoke scenario A (suppression of confirmed legacy fields) is immediately
testable. Smoke scenario B (suppression of new objective fields) requires a CM to save those
fields on a concept first.

---

## Phase 42 Changes

### New pure helpers (`src/lib/reanalyze-suggestions.ts`)

**`countApplicableSuggestions(fields: SuggestableFields): number`**

Counts non-null fields in a `SuggestableFields` object. `businessTypes` counts as 1 when
non-empty. Used for the suggestion-count badge in the UI.

**`getSuggestionState(fields, enrichFailed): SuggestionState`**

Returns a high-level state string for the panel:

| Return value | Condition |
|---|---|
| `'enrich_failed'` | `enrichFailed === true` |
| `'has_suggestions'` | ≥1 non-null field (backend sent at least one suggestion) |
| `'suppressed'` | all fields null (backend filtered everything — all confirmed) |

### UI instrumentation (`review/page.tsx`)

Three discrete additions to the reanalyze panel, all low-visual-weight:

1. **Suggestion count badge** — next to the strategy label when `state === 'has_suggestions'`:
   - `"N förslag"` in indigo — shows total non-null fields returned by backend.
   - `"Inga förslag"` in gray — shown when state is `'suppressed'` (all confirmed).

2. **"Pending backend_data" indicator** — the existing `"Ny analys laddad"` pill (line 571) is
   already in place. Phase 42 extends it with `"· osparad"` suffix so CMs know the new data
   hasn't been persisted yet (cleared on Save or Stäng).

3. **Suppressed-state copy** — the `!anyApplicable` branch now also references the suggestion
   state label to help the CM understand why no "Tillämpa" rows appear.

---

## Live Smoke Procedure

### Scenario A — Confirmed Legacy Fields (testable immediately)

**Pre-condition:** Find one of the 5 concepts with confirmed `peopleNeeded`, `difficulty`,
`filmTime`, or `businessTypes` in `overrides`. Open it in the review UI.

**Steps:**

1. Open the concept's review page (`/studio/concepts/:id/review`).
2. Open browser DevTools → Network tab (filter by XHR/Fetch).
3. Click **"Reanalysera video med AI"**.
4. **Verify network:** Only a `POST /api/studio/concepts/:id/reanalyze` should fire. No `PATCH`
   before you click Spara.
5. When the panel shows results:
   - The `"Pending backend_data"` pill appears as `"Ny analys laddad · osparad"`.
   - If the backend filtered the confirmed fields: the suggestion count badge shows a number
     reflecting only the *unconfirmed* fields sent back. The confirmed fields do NOT appear
     as `"Tillämpa"` rows.
   - If all suggestable fields were confirmed: the badge shows `"Inga förslag"` and the copy
     reads: *"Ny analysdata är redo att sparas. Inga nya klassificeringsförslag kunde tillämpas
     utan att röra bekräftade värden."*
6. Click **Spara** without applying any suggestions.
7. Verify network: the `PATCH` body includes `backend_data` (inspect in DevTools → Request payload).
8. Reload the page. Confirm:
   - The previously confirmed field values are unchanged.
   - The `"Ny analys laddad · osparad"` pill is gone.

**Expected result:** The safety contract holds — confirmed fields are never overwritten.

---

### Scenario B — New Objective Fields (requires CM setup first)

**Pre-condition:** Pick any concept without confirmed objective fields. Go to its review page.

**Setup (CM action):**

1. Set `script_mode`, `setup_complexity`, `skill_required`, and `setting` manually in the form.
2. Click **Spara**. Verify the PATCH fires and the fields persist on reload.

**Steps:**

3. Click **"Reanalysera video med AI"** again on the same concept.
4. Observe the suggestion panel. The four newly confirmed fields must NOT appear as
   `"Tillämpa"` rows.
5. The suggestion count badge should reflect only the remaining unconfirmed fields.
6. If the AI proposed values for those four fields, the backend's `buildSuggestedOverrides`
   will have filtered them; `buildSuggestionsFromOverrides` will see them as `null`.

**Expected result:** Backend + frontend pipeline correctly suppresses all four new objective
fields after the CM confirms them.

---

### Scenario C — Save-Only Test (no suggestions applied)

**Goal:** Verify pending `backend_data` is persisted even when no "Tillämpa" is clicked.

**Steps:**

1. Run a reanalyze on any concept. Wait for the panel to show results.
2. Do NOT click any "Tillämpa" button.
3. Click **Spara**.
4. In DevTools, inspect the PATCH request body. It should contain `backend_data` (the new
   analysis payload). It should NOT contain `overrides` changes for confirmed fields.
5. Reload. The form should reflect the same classification values as before the reanalyze.

**Expected result:** `backend_data` persists silently on Save; CM-confirmed `overrides` are
untouched.

---

## Verification Commands

```bash
# Typecheck both packages (must be 0 errors)
pnpm --filter @workspace/letrend exec tsc --noEmit
pnpm --filter @workspace/api-server run typecheck

# Run new helper tests (must all pass)
pnpm --filter @workspace/letrend exec vitest run src/lib/reanalyze-suggestions.test.ts

# Run full api-server test suite (117 tests, 0 failures expected)
pnpm --filter @workspace/api-server run test
```

---

## Safety Contract Summary (Phases 40–42)

| Layer | Guarantee | Since |
|---|---|---|
| Backend `buildSuggestedOverrides` | Never proposes a field already in `overrides` | Phase 40 |
| Frontend `buildSuggestionsFromOverrides` | Never reads `backend_data` as fallback | Phase 41 |
| Frontend "Tillämpa alla" | All setters null-guarded | Phase 41 |
| UI count badge | Shows exact number of applicable suggestions | Phase 42 |
| UI state helper | Distinguishes `has_suggestions` / `suppressed` / `enrich_failed` | Phase 42 |
| UI pending indicator | `"Ny analys laddad · osparad"` pill until Spara or Stäng | Phase 42 |

---

## Next Steps / Open Issues

1. **Scenario B setup** — needs a CM to confirm objective fields on at least one concept before
   the full suppression contract can be verified in production for those fields.
2. **Concept locking** — two CMs can still reanalyze the same concept simultaneously. Last
   write wins. A soft lock or a "someone else is editing" warning remains outstanding.
3. **Rate limit countdown** — 429 surfaces a Swedish error but no live timer in the UI.
4. **`businessTypes` diff chip display** — comma-joined today; multi-chip would be cleaner UX.
