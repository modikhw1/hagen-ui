# Phase 31 — Ingest Objective Fields

## Scope

Add `script_mode`, `setup_complexity`, `skill_required`, and `setting` to the upload-confirm classify step; wire `script_mode` to the concept review page; remove residual budget filter from customer workspace.

## Changes

### `artifacts/letrend/src/lib/translator.ts`
- Added `setup_complexity?: SigmaSetupComplexity`, `skill_required?: SigmaSkillLevel`, `setting?: SigmaBackdrop` to `ClipOverride`.
- Added `readSetupComplexity`, `readSkillRequired`, `readSetting` helpers (override-first, sigma fallback).

### `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- `ClassificationDraft` extended with `script_mode`, `setup_complexity`, `skill_required`, `setting`.
- Module-level option arrays with Swedish labels for all 4 new fields.
- Prefill in `handleAnalyze` → `setClassification`: `script_mode` from overrides/readScriptMode, sigma signals for the 3 objective fields.
- `handleSaveWithClassification` overrides include all 4 new fields (objective fields omitted if null).
- Classify phase UI: 4 new ButtonGroup rows (Manusläge required, Setup/Skicklighet/Miljö nullable with "(AI-förslag)" label).

### `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`
- `SCRIPT_MODE_VALUES` imported from concept-enrichment; `readScriptMode` imported from translator.
- `scriptMode` state added; initialised from `overrides.script_mode ?? readScriptMode(backend_data, overrides)`.
- Saved in `handleSave` overrides; added to dependency array.
- Manusläge ButtonGroup added in classification section (between Marknad grid and Branschtyper).

### `artifacts/letrend/src/hooks/useConceptWorkspace.ts`
- `addConceptBudgetFilter` / `setAddConceptBudgetFilter` state removed.
- `resetAddConceptFilters` updated accordingly.

### `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `WORKSPACE_BUDGET_OPTIONS` constant removed.
- Budget predicate removed from `filteredAddConcepts` useMemo.
- `addConceptBudgetFilter` removed from useMemo deps and `activeAddConceptFilterCount`.
- `WorkspaceLibraryFilter` Budget row removed from UI.
- `addConceptBudgetFilter` / `setAddConceptBudgetFilter` removed from `useConceptWorkspace` destructure.

## Contract

- No DB migrations — all new fields live in `overrides` JSONB.
- `setup_complexity`, `skill_required`, `setting` are nullable at save time; omitted from overrides when null to avoid bloating old concepts.
- Backward compat: `estimatedBudget`, `trendLevel`, `hasScript` remain in `ClipOverride`/DB — never removed.

## Typecheck result

Both `@workspace/letrend` and `@workspace/api-server` pass `tsc --noEmit` with 0 errors.
