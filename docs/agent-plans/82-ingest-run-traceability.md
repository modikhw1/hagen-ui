# Phase 82 — Ingest Run Traceability

**Datum:** 2026-05-13  
**Typ:** Observability improvement — no DB migrations, no dependency/runtime config changes  
**Baseras på:** Phase 81 (`c4f3192`), Supabase schema note from orchestrator

---

## Goal

Make `/studio` upload ingest runs traceable end-to-end across all five stages:

1. Hagen analyze  
2. Hagen enrich  
3. CM save to library  
4. Optional assignment to customer  
5. Fire-and-forget humor enrich

---

## Files Changed

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/ingest-runs.ts` | Add `'assigned'` to `IngestRunStage`; add `customer_profile_id` to `IngestRunPatch` |
| `artifacts/api-server/src/routes/studio.ts` | Import `HAGEN_CONTRACT_VERSION`; write traceability fields at analyze/enrich/humor-enrich stages; expand GET select |
| `artifacts/api-server/src/routes/admin/concepts.ts` | Expand `save_summary` in POST success handler |
| `artifacts/api-server/src/routes/studio-v2.ts` | Import `updateIngestRun`/`safeRunId`; accept `ingest_run_id` in POST; write assigned stage non-fatally |
| `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` | Pass `ingest_run_id` in `handleSaveAndAssign` POST body |

---

## Behavior Before → After

### 1. ingest-runs.ts

**Before:** `IngestRunStage` had `analyzing | enriching | classifying | saving | humor_enriching`. `IngestRunPatch` had no `customer_profile_id` scalar field.

**After:** Added `'assigned'` stage. Added `customer_profile_id?: string | null` to `IngestRunPatch` scalars so it can be written directly without a JSON merge.

---

### 2. studio.ts — analyze stage

**Before:**
- Start write: `{ status: 'running', stage: 'analyzing', started_at }`
- Success write: `{ mergeResult: { analyze_summary: { gcs_uri, has_analysis } } }`
- Failure write: `{ status: 'failed', stage: 'analyzing', finished_at, error_code, error_message }`

**After:**
- Start write: adds `hagen_contract_version: HAGEN_CONTRACT_VERSION` — captures contract version before the call starts
- Success write: adds `hagen_request_id`, `hagen_contract_version` as scalars; `hagen_video_id` if `videoId` is a string in the analysis envelope; `analyze_summary.request_id`, `analyze_summary.hagen_contract_version`
- Failure write: adds `hagen_request_id`, `hagen_contract_version` — so failed runs are still traceable to their Hagen request

---

### 3. studio.ts — enrich stage

**Before:**
- Success write: `{ status: 'ready_for_review', stage: 'classifying', mergeResult: { enrich_summary: { has_overrides } } }`
- Failure write: `{ status: 'failed', stage: 'enriching', finished_at, error_code, error_message }`

**After:**
- Success write: adds `hagen_request_id`, `hagen_contract_version` as scalars; `enrich_summary.request_id`, `enrich_summary.hagen_contract_version`
- Failure write: adds `hagen_request_id`, `hagen_contract_version`

---

### 4. studio.ts — humor-enrich stage

**Before:**
- Success: `{ mergeResult: { humor_enrich: { status: 'completed', fields } } }`
- Failure: `{ mergeResult: { humor_enrich: { status: 'failed', error } }, appendWarning }`

**After:**
- Success: adds `request_id`, `hagen_contract_version` inside `humor_enrich` merge object
- Failure: adds `request_id`, `hagen_contract_version` inside `humor_enrich` merge object
- Top-level `status`/`stage` intentionally not changed (concept already saved; humor-enrich is fire-and-forget)

---

### 5. studio.ts — GET /api/studio/ingest-runs

**Before:** Select string did not include `hagen_request_id`, `hagen_contract_version`, `hagen_video_id`, `customer_profile_id`.

**After:** All four columns added to the list select so ops/status views can correlate runs without fetching individual detail rows.

---

### 6. admin/concepts.ts — POST save_summary

**Before:**
```json
{ "save_summary": { "concept_id": "..." } }
```

**After:**
```json
{
  "save_summary": {
    "concept_id": "...",
    "source": "tiktok",
    "is_active": true,
    "overrides_version": "v1",
    "scene_count": 5
  }
}
```

`scene_count` is only included if `backend_data.scene_breakdown` is an array. `overrides_version` comes from the normalized overrides JSONB (`normalizeOverrides` always adds it). CM-correctable 400 validation errors (bad classification input) are **not** marked as ingest failures — the run stays at `ready_for_review` so the CM can fix and retry.

---

### 7. UploadConceptModal.tsx — handleSaveAndAssign

**Before:** `{ concept_id, feed_order: null }`  
**After:** `{ concept_id, feed_order: null, ingest_run_id: ingestRunId }`

`ingestRunId` is already tracked in component state from the analyze step (line 165). If `ingestRunId` is null (run not instrumented), the extra field is ignored by the API.

---

### 8. studio-v2.ts — POST /customers/:customerId/concepts

**Before:** No ingest run instrumentation at all.

**After:**
- Accepts optional `ingest_run_id` in request body.
- On **successful** insert: writes `stage: 'assigned'`, `status: 'completed'`, `customer_profile_id`, `finished_at`, and `mergeResult.assignment_summary` with `customer_id`, `customer_concept_id`, `concept_id`, `feed_order`, `row_kind` — all non-fatally (fire-and-forget `void`).
- On **insert error**: appends a warning to the run (`appendWarning`) instead of overwriting the top-level status. This preserves `completed` on the run if the library save already succeeded.

---

## Ingest Run Fields Written Per Stage

| Stage | Scalar fields written | result.* key written |
|---|---|---|
| analyze start | `status=running`, `stage=analyzing`, `started_at`, `hagen_contract_version` | — |
| analyze success | `hagen_request_id`, `hagen_contract_version`, `hagen_video_id` (if present) | `result.analyze_summary` |
| analyze failure | `status=failed`, `stage=analyzing`, `finished_at`, `hagen_request_id`, `hagen_contract_version`, `error_code`, `error_message` | — |
| enrich start | `stage=enriching` | — |
| enrich success | `status=ready_for_review`, `stage=classifying`, `hagen_request_id`, `hagen_contract_version` | `result.enrich_summary` |
| enrich failure | `status=failed`, `stage=enriching`, `finished_at`, `hagen_request_id`, `hagen_contract_version`, `error_code`, `error_message` | — |
| save start | `status=running`, `stage=saving` | — |
| save success | `status=completed`, `stage` unchanged, `concept_id`, `finished_at` | `result.save_summary` |
| save failure | `status=failed`, `stage=saving`, `finished_at`, `error_code`, `error_message` | — |
| assigned success | `stage=assigned`, `status=completed`, `customer_profile_id`, `finished_at` | `result.assignment_summary` |
| assigned failure | — (warning only) | appended to `warnings[]` |
| humor-enrich running | — (no top-level status change) | `result.humor_enrich.status=running` |
| humor-enrich success | — | `result.humor_enrich.status=completed` + fields + request_id + hagen_contract_version |
| humor-enrich failure | — | `result.humor_enrich.status=failed` + appended to `warnings[]` |

---

## scene_breakdown Round-Trip

`backend_data` is stored as a JSONB column on the `concepts` table. No transformation occurs during save or retrieval — the entire object is written as-is and read back as-is. `scene_breakdown` (an array of scene objects from Hagen) survives the round-trip inside `backend_data`.

The GET `/api/admin/concepts/:id` returns `backend_data` in full (via `select('*')`). The library list GET in studio-v2 (`STUDIO_CONCEPT_SELECT`) explicitly includes `backend_data` in the join select, so `concept.backend_data.scene_breakdown` is accessible on the frontend without a DB column change.

`scene_count` is surfaced in `save_summary` at ingest time (so ops can see it in the run record without re-fetching the concept). The library card itself can derive `scene_count` from `concept.backend_data?.scene_breakdown?.length ?? 0` without an additional API field.

---

## No Changes Made To

| Item | Reason |
|---|---|
| DB schema | `hagen_contract_version`, `hagen_request_id`, `hagen_video_id`, `customer_profile_id` already exist as nullable columns on `ingest_runs` |
| `package.json` / `pnpm-lock.yaml` / Dockerfile | Not touched |
| `/admin/demos` | Out of scope |
| Ingest run top-level status after save | Humor-enrich deliberately leaves `status=completed` |
| Validation 400 errors in POST /api/admin/concepts | Correctly leave run at `ready_for_review` — CM can fix and retry |

---

## Verification

```bash
# pnpm local override applied (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/api-server" run typecheck
# → 0 errors

pnpm --filter "./artifacts/letrend" run typecheck
# → 0 errors

PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
# → ✓ built

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```
