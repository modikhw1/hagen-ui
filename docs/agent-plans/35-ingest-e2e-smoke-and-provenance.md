# Phase 35 — Ingest E2E Smoke Test & Objective Field Provenance Audit

## What Was Verified

Complete static walk-through of the ingest pipeline:

```
UploadConceptModal
  → /api/studio/concepts/analyze   (POST, returns BackendClip + overrides)
  → /api/studio/concepts/enrich    (POST, writes sigma_taste to backend_data)
  → classify step                  (CM confirms fields in UI)
  → POST /api/admin/concepts        (writes backend_data + overrides + is_active:true)
  → /studio/concepts/:id/review     (CM can read/edit all fields)
  → /studio/concepts library        (concept visible with CM-confirmed badges)
  → customer workspace              (concept selectable, script_mode filter works)
```

---

## Bugs Found & Fixed

### Bug 1 — UploadConceptModal: overrides not passed to read helpers

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` (lines 294-297)

**Before:**
```typescript
script_mode: ((overrides as ...).script_mode as ...) ?? readScriptMode(backendData),
setup_complexity: readSetupComplexity(backendData) ?? rd?.env... ?? null,
skill_required:   readSkillRequired(backendData) ?? rd?.actor... ?? null,
setting:          readSetting(backendData) ?? rd?.env... ?? null,
```

**Problem:** All four read helpers were called WITHOUT passing `overrides`. This meant:
- If a concept already has `setup_complexity` etc. saved in its overrides (e.g., re-ingest flow),
  the modal would ignore them and recompute from sigma signals, discarding the CM's previous choice.
- The `script_mode` line was an inconsistent mess with a manual override check + fallback.

**After:**
```typescript
script_mode:      readScriptMode(backendData, overrides as ClipOverride),
setup_complexity: readSetupComplexity(backendData, overrides as ClipOverride),
skill_required:   readSkillRequired(backendData, overrides as ClipOverride),
setting:          readSetting(backendData, overrides as ClipOverride),
```

Clean, consistent: all four helpers use override-first logic internally.

**Also added:** `ClipOverride` to the type imports (was missing, causing TS error).

---

### Bug 2 — ConceptCard badges: sigma-inferred values shown as CM-confirmed

**File:** `artifacts/letrend/src/app/studio/concepts/page.tsx`

**Problem:** After Phase 34, `translateClipToConcept` computes `setup_complexity`, `skill_required`,
and `setting` via read helpers that fall back to sigma. The `script_mode` field is ALWAYS computed
(never null). This meant concept cards displayed objective badges for fields that might be purely
AI/sigma inferences, not CM-confirmed choices.

**Fix:**
1. Added `raw_overrides: Record<string, unknown>` to `ConceptLibraryItem` type.
2. Populated it in `loadConceptsData` map: `raw_overrides: (row.overrides as ...) ?? {}`.
3. Updated badge display to gate on `concept.raw_overrides['field_name']` — badge only shows
   when the CM explicitly wrote the field to the DB overrides.

**Result:** Old concepts (no objective fields in overrides) show no objective badges.
Concepts where CM confirmed the fields at ingest show the correct coloured badges.

---

## Data Contract Through the Pipeline

| Step | Fields written | Source |
|---|---|---|
| analyze | BackendClip (sigma_taste from hagen) | Hagen API |
| enrich | BackendClip.sigma_taste.replicability_decomposed | Gemini/Hagen |
| classify (modal) | `classification.{script_mode, setup_complexity, skill_required, setting}` | CM choice, seeded from read helpers |
| POST /api/admin/concepts | `overrides.{script_mode, setup_complexity, skill_required, setting}` | CM-confirmed |
| review page save | same overrides + nullable delete for clearing | CM-confirmed |
| library badge | only shown if field in `raw_overrides` | CM-confirmed only |
| workspace filter | matchScriptMode with hasScript fallback for old concepts | hybrid |

---

## Objective Field Provenance Classification

| Field | Source hierarchy | Badge shown when |
|---|---|---|
| `script_mode` | 1. override, 2. sigma beat/hook inference, 3. hasScript fallback → always returns a value | `raw_overrides.script_mode` set |
| `setup_complexity` | 1. override, 2. sigma environment_requirements.setup_complexity, 3. null | `raw_overrides.setup_complexity` set |
| `skill_required` | 1. override, 2. sigma actor_requirements.skill_level, 3. null | `raw_overrides.skill_required` set |
| `setting` | 1. override, 2. sigma environment_requirements.backdrop_interchangeability, 3. null | `raw_overrides.setting` set |

All four fields are CM-confirmed at the classify step of UploadConceptModal, where they are
seeded from AI/sigma but require explicit CM submission to be persisted. After Phase 35,
badges only show when CM has actually saved the field to overrides.

---

## script_mode Filter Verification

### `/studio/concepts` library
| Filter | Matches | Legacy fallback |
|---|---|---|
| `with_script` | `text_overlay \| short_dialogue \| long_dialogue` | `hasScript === true` |
| `without_script` | `visual_only \| none` | `hasScript === false` |
| `text_overlay` / `short_dialogue` / etc. | exact `script_mode` match only | no fallback (returns false for old concepts) |

**Assessment:** Correct. Specific mode filters intentionally exclude old concepts without `script_mode`
in overrides — no false positives.

### Customer workspace
Same `matchWorkspaceScript` logic from Phase 32 — consistent with library filter.

---

## Review Page Save Loop Verification

- `script_mode` — always written (required, never null) ✅
- `setup_complexity` — written if non-null, deleted from overrides if null ✅ (Phase 33 fix)
- `skill_required` — written if non-null, deleted if null ✅ (Phase 33 fix)
- `setting` — written if non-null, deleted if null ✅ (Phase 33 fix)
- `businessTypes` — always written ✅
- `is_active: true` — set on POST, not touched in review PATCH ✅
- `estimatedBudget` — NOT written by review page ✅ (legacy field, read-only)
- `trendLevel` — NOT written by review page ✅ (legacy field, read-only)

---

## Unit Tests Added

**File:** `artifacts/letrend/src/lib/__tests__/translator.test.ts`

17 tests across 4 `describe` blocks — all pass:

| Suite | Tests |
|---|---|
| `readScriptMode` | override priority, sigma dialogue_escalation, short transcript, visual_only, override wins |
| `readSetupComplexity` | null when empty, sigma value, override, override wins |
| `readSkillRequired` | null when empty, sigma value, override, override wins |
| `readSetting` | null when empty, sigma value, override, override wins |

Pre-existing test failures in `cm-pulse.test.ts` and `demos.test.ts` are unrelated to ingest
and were introduced in commit `dcd0113` (Next.js migration). Not fixed in this phase.

---

## Remaining Runtime Risks

1. **`rd?.environment_requirements`** double-fallback removed from UploadConceptModal — the sigma
   fallback now happens inside the read helpers (via `getSigma(clip)` which normalises
   `sigma_taste`). If `sigma_taste` is absent from `backendData` at classify time (e.g., if the
   enrich step hasn't completed), `setup_complexity`/`skill_required`/`setting` will be null,
   and the CM can still confirm or skip them. No data loss risk.

2. **`matchScriptMode` is co-located in page.tsx** — not unit-tested due to the lack of a simple
   extraction path. The logic is simple (15 lines) and mirrors the well-tested `readScriptMode` patterns.

3. **No bulk backfill** — old concepts in the library without `script_mode` in overrides will not
   show badges until re-ingested or manually reviewed. The filter `matchScriptMode` handles this
   gracefully via `hasScript` fallback for the group filters.

---

## Recommended Next Steps

1. **Legacy page removal** (`/studio/concepts/:id` and `:id/edit`) — no longer needed since the
   review page covers all editing flows. Reduces routing confusion.
2. **Bulk backfill script** — read sigma signals and write `script_mode` (at minimum) to
   `overrides` for all active library concepts without it. Would make filter + badge useful for
   the full library.
3. **Fix `cm-pulse.test.ts` and `demos.test.ts`** — pre-existing failures unrelated to ingest.
4. **`matchScriptMode` extraction** — move to a shared lib file if it needs to be reused across
   more surfaces. Unit-testable independently at that point.
