# Phase 41 — Reanalyze Suggestion Fallback Fix

## Problem

Phase 40 hardened the backend: `buildSuggestedOverrides` in `studio-helpers.ts` filters out any
key that already exists in the CM's confirmed `overrides`. This means the backend never proposes
overwriting a field the CM has already set.

However, the review page **still bypassed this guarantee on the frontend** by falling back to
`readX(backend_data)` when the backend omitted a field from `suggested_overrides`:

```typescript
// Phase 40 code — BUGGY
script_mode: (sug['script_mode'] as string | undefined) ?? readScriptMode(newBd),      // BUG
setup_complexity: (sug['setup_complexity'] as string | undefined) ?? readSetupComplexity(newBd) ?? null,  // BUG
skill_required: (sug['skill_required'] as string | undefined) ?? readSkillRequired(newBd) ?? null,        // BUG
setting: (sug['setting'] as string | undefined) ?? readSetting(newBd) ?? null,                            // BUG
```

If the backend filtered `script_mode` (because the CM had confirmed it), the frontend would still
read the value from the new `backend_data` via `readScriptMode(newBd)` and show it as an
applicable "Tillämpa"-suggestion — effectively proposing to overwrite the CM's decision.

Additionally, "Tillämpa alla" called `setSetupComplexity(null)` / `setSkillRequired(null)` /
`setSettingVal(null)` unconditionally when those fields were absent from suggestions, which could
silently clear CM-confirmed nullable fields.

## Fix

### New pure helper: `src/lib/reanalyze-suggestions.ts`

```typescript
export function buildSuggestionsFromOverrides(sug: Record<string, unknown>): SuggestableFields
export function hasApplicableSuggestions(fields: SuggestableFields): boolean
```

`buildSuggestionsFromOverrides` reads **only from `suggested_overrides`**. A field is non-null
only when present in the server's response. No `readX(backend_data)` fallback. If the backend
filtered a key, the field is null and will not appear as a suggestion.

`hasApplicableSuggestions` returns `true` if at least one field is non-null — used to distinguish
the two "no diff" states:

| State | `hasApplicableSuggestions` | `hasDiff` | UI message |
|---|---|---|---|
| Suggestions present, values match current | `true` | `false` | "Inga ändringar att tillämpa — formuläret är redan uppdaterat." |
| All suggestions suppressed (all confirmed) | `false` | `false` | "Ny analysdata är redo att sparas. Inga nya klassificeringsförslag kunde tillämpas utan att röra bekräftade värden." |
| `enrich_failed` | — | `false` | Amber warning banner (existing) |

### Changes to `review/page.tsx`

1. **`ReanalyzeSuggestions` interface** — all suggestion fields changed from required `string` to
   optional `string | null`. `script_mode` was particularly harmful as a required field.

2. **`handleReanalyze`** — the `proposed` object is now built with:
   ```typescript
   const proposed: ReanalyzeSuggestions = {
     strategy: data.strategy,
     ...buildSuggestionsFromOverrides(sug),
     enrich_failed: data.enrich_failed,
   };
   ```
   No `readX(backend_data)` calls for suggestion building. `readScriptMode` / `readSetupComplexity`
   / `readSkillRequired` / `readSetting` are still used in `loadConcept` to display the current
   form state — that usage is correct and unchanged.

3. **Suggestions array** — `apply` callbacks are all null-guarded. Previously `setSetupComplexity`,
   `setSkillRequired`, and `setSettingVal` were called unconditionally (could clear confirmed
   nullable values when applying "all").

4. **UI copy** — new three-way branch instead of two-way for the no-diff state.

5. **"Sparas med konceptet"-disclaimer** — still shown at the bottom of the panel whenever
   `reanalyzeSuggestions` is non-null, reminding the CM that pending `backend_data` is persisted
   on the next explicit Save.

## Safety Contract

| Guarantee | Phase 40 | Phase 41 |
|---|---|---|
| Backend never proposes confirmed overrides | ✅ `buildSuggestedOverrides` | ✅ unchanged |
| Frontend never proposes confirmed overrides | ❌ `readX(newBd)` fallback | ✅ `buildSuggestionsFromOverrides` |
| "Tillämpa alla" never clears confirmed nullable fields | ❌ unconditional `setX(null)` | ✅ null-guarded |
| No DB write until CM clicks Spara | ✅ | ✅ unchanged |
| Subjective fields (headline, script, description) never auto-applied | ✅ | ✅ unchanged |

## Test Status

### New tests: `src/lib/reanalyze-suggestions.test.ts` (15 tests)

All tests run with `pnpm --filter @workspace/letrend run test`:

| Suite | Tests |
|---|---|
| `buildSuggestionsFromOverrides` | 8 tests |
| `hasApplicableSuggestions` | 7 tests |

Key test cases:
- Confirmed/suppressed field absent from `suggested_overrides` → null → not shown as suggestion
- `businessTypes` built correctly as filtered string array
- No applicable suggestions + pending `backend_data` → helper returns all-null → UI shows "no suggestions" copy
- Unknown/subjective keys (e.g. `headline_sv`) do not leak into the `SuggestableFields` shape

### Frontend test environment

Vitest is configured for `@workspace/letrend` (`pnpm test`). No Rollup optional dependency
issues were observed when running the pure helper tests (no Vite/DOM imports in the helper).

## Phase 42 — Live Smoke Readiness (follow-on)

Phase 42 added two more pure helpers to `reanalyze-suggestions.ts`:

- **`countApplicableSuggestions(fields)`** — returns the number of non-null applicable suggestion
  fields. Used to show a discrete `"N förslag"` count badge next to the strategy label.
- **`getSuggestionState(fields, enrichFailed)`** — returns `'enrich_failed' | 'has_suggestions' | 'suppressed'`.
  Drives the count badge and the suppressed-state copy in the panel.

The `"Ny analys laddad"` pill was extended to `"Ny analys laddad · osparad"` to make the
unsaved state explicit.

Full live smoke procedure: `docs/agent-plans/42-reanalyze-live-smoke-readiness.md`.

## Remaining Risks / Next Steps

1. **Rate limit countdown** — 429 responses surface a Swedish message but no live timer.
2. **Concept locking** — two CMs can still reanalyze simultaneously; last write wins.
3. **`businessTypes` diff display** — currently comma-joined. Multi-chip rendering would be cleaner.
4. **Live smoke test** — see `docs/agent-plans/42-reanalyze-live-smoke-readiness.md` for full procedure.

## Recommended Live Smoke Procedure

The following steps verify the full read-only + suggestion-suppression contract on production:

1. Open a concept in the review UI that has confirmed `overrides` with at least one of:
   `script_mode`, `setup_complexity`, `skill_required`, `setting`.
2. Click **"Reanalysera video med AI"**.
3. Confirm the network tab shows a `POST /api/studio/concepts/:id/reanalyze` — no PATCH.
4. When the panel appears:
   - Confirmed fields must **not** appear as "Tillämpa"-suggestions.
   - If all fields were confirmed: the panel shows "Ny analysdata är redo att sparas.
     Inga nya klassificeringsförslag kunde tillämpas utan att röra bekräftade värden."
5. Click **Spara** (without applying any suggestions).
   - Confirm the PATCH body contains `backend_data` but no unintended `overrides` changes.
6. Reload the page. Confirm confirmed field values are unchanged.
