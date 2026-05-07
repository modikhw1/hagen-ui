# Phase 36 — script_mode Filter Provenance Fix

## Problem

Phase 35 introduced provenance-safe concept badges: objective field badges on `ConceptCard` only appear when the field exists in `raw_overrides` (CM-confirmed), not for sigma/AI-inferred values.

However, the `script_mode` filter in `/studio/concepts` and the customer workspace `addConcept` library still used `concept.script_mode` for matching. Because `translateClipToConcept` → `readScriptMode` **always** computes a `script_mode` value (never null — it falls back through sigma beat types, hasScript, etc.), specific-mode filters like `text_overlay`, `short_dialogue`, `long_dialogue`, `visual_only`, and `none` could match sigma-inferred values as if they were CM-confirmed choices.

**Example bug:** A concept with `hasScript=true` and sigma-inferred `script_mode='text_overlay'` (but no `script_mode` in `raw_overrides`) would appear in the `text_overlay` filter — a false positive, since no CM confirmed that classification.

---

## Changes

### 1. New shared helper — `artifacts/letrend/src/lib/script-mode-filter.ts`

Extracted provenance-safe filter logic into a standalone, testable module.

**Signature:**
```typescript
export function matchScriptMode(
  hasScript: boolean | undefined,
  explicitScriptMode: string | undefined,  // from raw_overrides['script_mode']
  filter: string,
): boolean
```

**Filter rules:**

| Filter | Behaviour |
|---|---|
| `all` | Always `true` |
| `with_script` | If `explicitScriptMode` is set: match `text_overlay \| short_dialogue \| long_dialogue`. Otherwise fall back to `Boolean(hasScript)`. |
| `without_script` | If `explicitScriptMode` is set: match `visual_only \| none`. Otherwise fall back to `!hasScript`. |
| `text_overlay` / `short_dialogue` / `long_dialogue` / `visual_only` / `none` | **Only match when `explicitScriptMode` is defined and equals the filter.** Returns `false` for sigma-inferred or old hasScript-only concepts. |

### 2. New type — `ConceptWithProvenance` in `artifacts/letrend/src/lib/conceptLoaderDB.ts`

```typescript
export type ConceptWithProvenance = TranslatedConcept & {
  raw_overrides: Record<string, unknown>;
};
```

Updated `loadConcepts`, `loadMyConcepts`, and `loadRecentlyAssigned` to return `ConceptWithProvenance[]` by including `raw_overrides: (row.overrides as Record<string, unknown>) ?? {}` in each map transform.

### 3. Updated `/studio/concepts` library — `concepts/page.tsx`

- Removed inline `matchScriptMode` function (was non-provenance-aware).
- Imported shared `matchScriptMode` from `@/lib/script-mode-filter`.
- Removed `ScriptMode` type import (no longer needed here).
- Filter call updated:
  ```typescript
  // Before:
  matchScriptMode(concept.hasScript, concept.script_mode, scriptModeFilter)
  // After:
  matchScriptMode(concept.hasScript, concept.raw_overrides['script_mode'] as string | undefined, scriptModeFilter)
  ```

### 4. Updated customer workspace — `CustomerWorkspaceContent.tsx`

- `WorkspaceLibraryConcept` changed from `TranslatedConcept & { source }` to `ConceptWithProvenance & { source }` — workspace library concepts now carry `raw_overrides`.
- Removed inline `matchWorkspaceScript` function.
- Imported `matchScriptMode` from `@/lib/script-mode-filter` and `ConceptWithProvenance` from `@/lib/conceptLoaderDB`.
- Filter call updated:
  ```typescript
  // Before:
  matchWorkspaceScript(concept.hasScript, concept.script_mode, addConceptScriptFilter)
  // After:
  matchScriptMode(concept.hasScript, concept.raw_overrides?.['script_mode'] as string | undefined, addConceptScriptFilter)
  ```

---

## Backward Compatibility — Old Concepts

Old concepts that were ingested before the objective field flow (Phase 34+) have no `script_mode` in their DB overrides. They get `raw_overrides = {}` from the loader, so `raw_overrides['script_mode']` is `undefined`.

| Filter | Old concept (hasScript=true) | Old concept (hasScript=false) |
|---|---|---|
| `all` | ✅ matches | ✅ matches |
| `with_script` | ✅ matches (hasScript fallback) | ❌ no match |
| `without_script` | ❌ no match | ✅ matches (hasScript fallback) |
| `text_overlay` | ❌ no match (correct — not confirmed) | ❌ no match |
| `short_dialogue` | ❌ no match (correct) | ❌ no match |
| `long_dialogue` | ❌ no match (correct) | ❌ no match |
| `visual_only` | ❌ no match (correct) | ❌ no match (correct) |
| `none` | ❌ no match (correct) | ❌ no match (correct) |

The `with_script` / `without_script` group filters continue to work for the entire library via the `hasScript` fallback. Specific-mode filters only return CM-confirmed concepts, which is the correct behaviour — a CM who wants to find only `text_overlay` concepts should only see those that a CM explicitly classified.

---

## Unit Tests Added

**File:** `artifacts/letrend/src/lib/__tests__/script-mode-filter.test.ts`

27 tests across 4 `describe` blocks — all pass:

| Suite | Tests |
|---|---|
| `filter: all` | 3 cases — always true regardless of inputs |
| `filter: with_script` | 6 cases — explicit scripted/non-scripted modes + hasScript fallback |
| `filter: without_script` | 6 cases — explicit visual/none + hasScript fallback |
| `filter: specific modes (provenance-safe)` | 12 cases — exact match only when explicit; no false positives for inferred or old concepts |

Key provenance test cases:
- `explicit text_overlay` → matches `text_overlay` ✅
- `inferred text_overlay (no override)` → does NOT match `text_overlay` ✅
- `old hasScript=true` → matches `with_script` ✅
- `old hasScript=false` → matches `without_script` ✅
- `explicit visual_only` → matches both `without_script` AND `visual_only` ✅

---

## Remaining Risks

1. **No bulk backfill** — old library concepts without `script_mode` in overrides never appear under specific mode filters. This is correct behaviour, but CMs who want to use those filters for their full catalog need to re-ingest concepts through the review flow.

2. **`loadConceptById` not updated** — the single-concept loader still returns plain `TranslatedConcept`. It is only used for concept detail views (not for filtering), so this is safe. If provenance is ever needed on the detail page, update it separately.

3. **`loadRecentlyAssigned`** — return type updated to `ConceptWithProvenance[]`. Only used internally; consumers that previously typed the result as `TranslatedConcept[]` are compatible since `ConceptWithProvenance` extends `TranslatedConcept`.

4. **`conceptLoaderDB.ts` has `@ts-nocheck`** — the file has a top-level `// @ts-nocheck` directive. Type changes are structural and correct but not verified by tsc inside that file.
