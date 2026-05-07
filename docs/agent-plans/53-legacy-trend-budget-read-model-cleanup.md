# Phase 53 — Legacy trendLevel / estimatedBudget Read-Model Cleanup

## Objective

Remove all active read-model code for the deprecated `trendLevel` and
`estimatedBudget` concept fields. Phase 52 closed the write paths; Phase 53
removes the read plumbing so the fields are truly dead code.

## What Was Removed

### `artifacts/letrend/src/lib/translator.ts`
- `EstimatedBudget` removed from import block (no longer needed)
- `trendLevel: number` removed from `TranslatedConcept` interface
- `estimatedBudget: EstimatedBudget` removed from `TranslatedConcept` interface
- `trendLevel?: number` removed from `ClipOverride` interface
- `estimatedBudget?: EstimatedBudget` removed from `ClipOverride` interface
- `clampTrendLevel()` function deleted
- `translateTrendLevel()` function deleted
- `translateBudget()` function deleted
- `translateWhyItFits()` — removed `estimatedBudget` parameter and the
  budget-based reason (`'Formatet går att producera med låg budget...'`)
- `translateClipToConcept()` — removed `trendLevel` and `estimatedBudget`
  local variables and corresponding return fields

### `artifacts/letrend/src/lib/display.ts`
- `EstimatedBudget` type export deleted
- `TrendLevel` type export deleted
- `display.budget()` function deleted
- `display.trendLevel()` function deleted
- `categoryOptions.budgets()` function deleted

### `artifacts/letrend/src/lib/conceptLoader.ts`
- `trending` dashboard bucket removed (was `concepts.filter(c => c.trendLevel >= 4)`)

### `artifacts/letrend/src/lib/conceptLoaderDB.ts`
- `trending` dashboard bucket removed (same pattern)

### `artifacts/letrend/src/types/index.ts`
- `trendLevel: number` removed from `Concept` interface
- `estimatedBudget?: string` removed from `Concept` interface

### `artifacts/letrend/src/mocks/data.ts`
- `trendLevel` field removed from all 8 `mockConcepts` entries
- `trending` dashboard row removed from `mockDashboardRows`

### `artifacts/letrend/src/data/categories.json`
- `trendLevels` key removed
- `estimatedBudgets` key removed

### `artifacts/letrend/src/data/locale/sv.json`
- `trendLevels` key removed
- `estimatedBudgets` key removed

## What Was Intentionally Left Alone

### Quarantined legacy concept pages
- `src/app/studio/concepts/[id]/page.tsx` — redirect-only shell; contains
  `trendLevel` only in JSDoc deprecation comments, no active form logic
- `src/app/studio/concepts/[id]/edit/page.tsx` — same, redirect-only

### TikTok-sync budget fields
- `artifacts/api-server/src/routes/admin/tiktok.ts`
- `artifacts/letrend/src/lib/tiktok/`

  These reference "budget" in the context of the TikTok ad-spend / cron API
  (campaign budget, not concept production budget). They are completely
  unrelated to the `estimatedBudget` concept field and were not touched.

### Existing DB data
- No migration, no `UPDATE`, no `DELETE`.
- Historical `overrides.trendLevel` and `overrides.estimatedBudget` values
  remain in `customer_concepts.overrides` JSONB columns. They are silently
  ignored at runtime — no code reads them.

## `rg` Results After Cleanup

```
trendLevel        — 0 hits in active TS/TSX (only JSDoc in quarantined pages)
estimatedBudget   — 0 hits in active TS/TSX
EstimatedBudget   — 0 hits in active TS/TSX
TrendLevel        — 0 hits in active TS/TSX
translateTrendLevel — 0 hits
translateBudget   — 0 hits
clampTrendLevel   — 0 hits
trending bucket   — 0 hits (trendLevel >= 4)
trendLevels in categories.json — false
estimatedBudgets in categories.json — false
trendLevels in sv.json — false
estimatedBudgets in sv.json — false
```

## Typecheck Status

```
pnpm --filter @workspace/api-server exec tsc --noEmit  → 0 errors ✅
pnpm --filter @workspace/letrend exec tsc --noEmit     → 0 errors ✅
```
