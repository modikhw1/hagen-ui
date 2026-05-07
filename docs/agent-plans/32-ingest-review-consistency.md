# Phase 32 — Objective Field Review Consistency & script_mode Propagation

## Scope

All four objective ingest fields (`script_mode`, `setup_complexity`, `skill_required`, `setting`) are now fully
editable in concept review. `script_mode` is propagated into `TranslatedConcept` so the customer workspace script
filter can use granular mode values. Headline/description AI preview added to upload-confirm classify step.

## Changed Files

### `artifacts/letrend/src/lib/translator.ts`
- `TranslatedConcept` extended with `script_mode?: ScriptMode`.
- In `translateClipToConcept`: `const script_mode = readScriptMode(clip, override)` computed before the return and
  included in the returned object.
- `hasScript` kept unchanged for backward compatibility.

### `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`
- Added imports: `readSetupComplexity`, `readSkillRequired`, `readSetting` from translator.
- Module-level option arrays: `setupComplexityOptions`, `skillRequiredOptions`, `reviewSettingOptions`.
- Three new nullable state vars: `setupComplexity`, `skillRequired`, `settingVal`.
- Initialized in `loadConcept` using the read helpers (override-first, sigma fallback).
- Saved in `handleSave` newOverrides — only written if non-null to avoid polluting old concepts.
- Three ButtonGroup sections added in the classification `<details>` block after Manusläge:
  Setup (purple, toggle), Skicklighet (rust, toggle), Miljö (blue, toggle) — each marked "(AI-förslag)".
- All three added to `useCallback` dependency array.

### `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `WORKSPACE_SCRIPT_OPTIONS` expanded with granular script_mode options:
  `text_overlay`, `short_dialogue`, `long_dialogue`, `visual_only`, `none`.
- `matchWorkspaceScript(hasScript, scriptMode, filter)` updated — now accepts `scriptMode: string | undefined`:
  - Old `with_script`/`without_script` still work via `hasScript`.
  - New mode values match against `concept.script_mode` when present.
  - Fallback inference from `hasScript` for old concepts without stored `script_mode`.
- Filter call updated: `matchWorkspaceScript(concept.hasScript, concept.script_mode, addConceptScriptFilter)`.

### `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- Added AI-förhandsgranskning panel in the classify phase (before action buttons):
  - Shows `pendingOverrides.headline_sv` (bold) and `pendingOverrides.description_sv` (if set) as read-only.
  - Marked clearly as AI-förslag with a note that it can be edited in the library.

## Overrides Contract (after this phase)

All these fields are stored flat in the `overrides` JSONB column. All are editable post-save via the review page:

| Field | Type | Editable? | Notes |
|---|---|---|---|
| `script_mode` | `ScriptMode` | ✅ required | Replaces legacy `hasScript`-only inference |
| `setup_complexity` | `SigmaSetupComplexity \| null` | ✅ nullable | Skip if null in PATCH |
| `skill_required` | `SigmaSkillLevel \| null` | ✅ nullable | Skip if null in PATCH |
| `setting` | `SigmaBackdrop \| null` | ✅ nullable | Skip if null in PATCH |

## Legacy Fields Still Present

- `hasScript` — still computed and returned from `translateClipToConcept`; still used in the workspace card display
  and the legacy `with_script`/`without_script` filter branches. Safe to keep indefinitely.
- `estimatedBudget`, `trendLevel` — still in `ClipOverride`/`TranslatedConcept`, never written from UI; kept for
  backward compat with existing library data.

## hasScript Remaining Usage

| File | Line | Usage | Action |
|---|---|---|---|
| `CustomerWorkspaceContent.tsx` | 4080 | Card display: "Med manus" / "Utan manus" | Keep — still useful for quick visual scan |
| `CustomerWorkspaceContent.tsx` | matchWorkspaceScript | Legacy filter fallback | Keep — needed for old concepts |
| `translator.ts` | translateClipToConcept return | Legacy computed field | Keep |

## Typecheck Result

Both `@workspace/letrend` and `@workspace/api-server` pass `tsc --noEmit` with 0 errors.
