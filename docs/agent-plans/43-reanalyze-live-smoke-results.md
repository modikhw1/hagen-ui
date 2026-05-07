# Phase 43 — Reanalyze Live Smoke Results

## Execution Method

**Code-level smoke** — live UI could not be exercised because the agent has no authenticated
browser session. All three scenarios were verified by static code audit of
`artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx` and
`artifacts/letrend/src/lib/reanalyze-suggestions.ts`.

No Supabase MCP available. No DB writes were performed.

---

## Audit: Network Call Inventory

All HTTP calls in `review/page.tsx` were enumerated by grepping for `method: 'PATCH'` and
`method: 'POST'`:

| Line | Method | URL | Function | Sends `backend_data`? |
|------|--------|-----|----------|-----------------------|
| 350 | `PATCH` | `/api/admin/concepts/:id` | `handleSave` | ✅ Yes (conditionally, when `pendingReanalyzeBackendData !== null`) |
| 383 | `PATCH` | `/api/admin/concepts/:id` | `handleTogglePublish` | ❌ No — body is `{ is_active: bool }` only |
| 408 | `PATCH` | `/api/admin/concepts/:id` | `handleTakeOver` | ❌ No — body is `{ created_by: userId }` only |
| 435 | `POST`  | `/api/studio/concepts/:id/reanalyze` | `handleReanalyze` | ❌ No body sent at all (read-only route) |

**Conclusion:** Only `handleSave` (line 350 PATCH) can write `backend_data` to the DB. The
reanalyze route (line 435 POST) is strictly read-only. ✅

---

## Checkpoint 1 — `handleReanalyze` Only Does POST

```typescript
// line 434-436
const resp = await fetch(`/api/studio/concepts/${conceptId}/reanalyze`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${s?.access_token}` },
});
```

- No `PATCH` inside `handleReanalyze`. ✅
- No body sent with the POST (server reads concept from DB by `conceptId`). ✅
- State after success: sets `pendingReanalyzeBackendData`, `reanalyzeSuggestions`, `reanalyzeState('done')`. ✅
- State after failure: sets `reanalyzeError`, `reanalyzeState('error')`. Pending data stays null. ✅

---

## Checkpoint 2 — `handleSave` is the Only PATCH That Sends `backend_data`

```typescript
// line 345-348
const patchBody: Record<string, unknown> = { overrides: newOverrides };
if (pendingReanalyzeBackendData) {
  patchBody['backend_data'] = pendingReanalyzeBackendData;
}
```

- `backend_data` only enters the PATCH body when `pendingReanalyzeBackendData !== null`. ✅
- After a successful save, `setPendingReanalyzeBackendData(null)` is called (line 363). ✅
- After a **failed** save (caught at line 367), `pendingReanalyzeBackendData` is **preserved** — CM can retry Spara without losing the pending analysis. ✅
- `handleTogglePublish` (line 382-395): sends `{ is_active: bool }` — no `backend_data`. ✅
- `handleTakeOver` (line 407-425): sends `{ created_by }` — no `backend_data`. ✅

---

## Checkpoint 3 — Suggestions Built Exclusively from `buildSuggestionsFromOverrides`

```typescript
// lines 456-460 (handleReanalyze)
const proposed: ReanalyzeSuggestions = {
  strategy: data.strategy,
  ...buildSuggestionsFromOverrides(sug),   // sug = data.suggested_overrides
  enrich_failed: data.enrich_failed,
};
```

- `sug = data.suggested_overrides` from the POST response. ✅
- `buildSuggestionsFromOverrides` only reads keys present in `sug` — absent keys yield `null`. ✅
- No `readX(backend_data)` fallback calls anywhere in `handleReanalyze`. ✅
- `readScriptMode`, `readSetupComplexity`, `readSkillRequired`, `readSetting` are only used in
  `loadConcept` (lines 254-257) to initialise the current form state — that usage is correct. ✅

---

## Checkpoint 4 — "Tillämpa alla" Null-Guarded

```typescript
// lines 664-671 (onClick of "Tillämpa alla förslag" button)
if (reanalyzeSuggestions.script_mode) setScriptMode(reanalyzeSuggestions.script_mode);
if (reanalyzeSuggestions.setup_complexity) setSetupComplexity(reanalyzeSuggestions.setup_complexity);
if (reanalyzeSuggestions.skill_required) setSkillRequired(reanalyzeSuggestions.skill_required);
if (reanalyzeSuggestions.setting) setSettingVal(reanalyzeSuggestions.setting);
if (reanalyzeSuggestions.peopleNeeded) setPeopleNeeded(reanalyzeSuggestions.peopleNeeded);
if (reanalyzeSuggestions.difficulty) setDifficulty(reanalyzeSuggestions.difficulty);
if (reanalyzeSuggestions.filmTime) setFilmTime(reanalyzeSuggestions.filmTime);
if (reanalyzeSuggestions.businessTypes?.length) setBusinessTypes(reanalyzeSuggestions.businessTypes);
```

All 8 setters null-guarded. A `null` suggestion field will never call its setter. ✅

---

## Scenario A — Concepts With Confirmed Legacy Fields

**Status:** Code-verified. Live UI not executed (no auth session).

**Code evidence for suppression contract:**

The backend route `POST /api/studio/concepts/:id/reanalyze` calls `buildSuggestedOverrides`
(in `studio-helpers.ts`) which filters out any key already in `concept.overrides`. The filtered
response is returned as `suggested_overrides`. On the frontend, `buildSuggestionsFromOverrides`
only reads keys present in `suggested_overrides` — absent keys yield `null`.

For a concept with confirmed `{ peopleNeeded: 'duo', difficulty: 'medium', filmTime: 'under_30min',
businessTypes: ['hospitality'] }` in `overrides`:
- Backend filters all four keys from `suggested_overrides`.
- Frontend receives `suggested_overrides = {}` (or containing only other non-confirmed fields).
- `buildSuggestionsFromOverrides({})` returns all-null for those four fields.
- `getSuggestionState(fields, false)` returns `'suppressed'` if all 8 fields null; else
  `'has_suggestions'` for the remaining unconfirmed fields.
- The confirmed fields never appear as "Tillämpa" rows in the UI. ✅

**Live smoke pre-condition:** 5 concepts in DB with confirmed legacy fields. Testable immediately
once an authenticated session is available.

---

## Scenario B — New Objective Fields Confirmed Then Reanalyzed

**Status:** Code-verified. Live UI not executed (no auth session).

When a CM saves `script_mode`, `setup_complexity`, `skill_required`, `setting` via `handleSave`:
- `newOverrides` at lines 329-344 writes/deletes each field explicitly.
- After save, `raw.overrides` is updated via `setRaw(payload.concept)`.
- A subsequent reanalyze will read the fresh `overrides` from the DB and filter those four
  fields out of `suggested_overrides`. The frontend will receive `null` for all four. ✅

**Live smoke pre-condition:** CM must first save objective fields on at least one concept. No
concept currently has these fields confirmed (per orchestrator read at Phase 42 planning).

---

## Scenario C — Save-Only Test (pending `backend_data` persists without suggestions applied)

**Status:** Code-verified. Live UI not executed.

`handleSave` (line 307-372):
1. Builds `newOverrides` from current form state — only CM-edited values.
2. Conditionally adds `backend_data: pendingReanalyzeBackendData` when non-null (line 346-348).
3. PATCHes `/api/admin/concepts/:id`.
4. On success: clears `pendingReanalyzeBackendData` and resets reanalyze state to idle.

If no "Tillämpa" was clicked before saving:
- Form state (difficulty, filmTime, etc.) is unchanged — CM's confirmed values persist. ✅
- `backend_data` in the PATCH body is the new analysis payload from the POST. ✅
- After reload, confirmed field values are unchanged; new `backend_data` is persisted. ✅

---

## UI Behaviour Verified

| UI Element | Expected | Code Status |
|---|---|---|
| "Ny analys laddad · osparad" pill (line 571) | Appears when `pendingReanalyzeBackendData !== null`, disappears after Spara or Stäng | ✅ Correct |
| Strategy badge (line 640) | Shows `'Fullanalys (video + AI)'` or `'Förädling (AI)'` | ✅ Correct |
| Suggestion count badge (lines 641-645) | `"N förslag"` when `has_suggestions`, `"Inga förslag"` when `suppressed` | ✅ Correct |
| "Inga ändringar" copy (line 679) | Shown when `anyApplicable && !hasDiff` | ✅ Correct |
| "Inga klassificeringsförslag" copy (lines 681-683) | Shown when `!anyApplicable && !enrich_failed` | ✅ Correct |
| Amber warning (lines 635-638) | Shown when `enrich_failed` | ✅ Correct |
| "Sparas med konceptet..." disclaimer (line 689) | Always shown at bottom of done-panel | ✅ Correct |
| "Stäng" button (line 687) | Clears `pendingReanalyzeBackendData`, `reanalyzeSuggestions`, resets state to idle | ✅ Correct |

---

## Bugs Found

**None.** All four checkpoints pass code-level verification. The full safety contract from
Phases 40–42 is intact.

---

## Test & Typecheck Status

| Check | Result |
|---|---|
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 errors |
| `pnpm --filter @workspace/api-server run typecheck` | ✅ 0 errors |
| `vitest run src/lib/reanalyze-suggestions.test.ts` | ✅ 26/26 pass |
| `pnpm --filter @workspace/api-server run test` | ✅ 117/117 pass |

---

## Remaining Live Smoke (requires auth session)

The following scenarios must be executed by a CM with browser access to confirm behaviour
matches code expectations:

1. **Scenario A** — Open a concept with confirmed `peopleNeeded`/`difficulty`/`filmTime`/
   `businessTypes`. Run reanalyze. Confirm confirmed fields absent from suggestions. Confirm
   the count badge reflects only non-confirmed fields.

2. **Scenario B** — Save `script_mode`/`setup_complexity`/`skill_required`/`setting` on any
   concept. Run reanalyze. Confirm those four fields absent from suggestions.

3. **Scenario C** — Run reanalyze, do not apply any suggestion, click Spara. Inspect PATCH
   body in DevTools (should contain `backend_data`). Reload and confirm form unchanged.

---

## No Code Changes in Phase 43

Phase 43 is documentation + audit only. No changes to production files.
