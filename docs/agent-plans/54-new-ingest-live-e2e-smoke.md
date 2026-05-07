# Phase 54 — New Ingest Live E2E Smoke

## Date
2026-05-07

## Purpose

Verify the complete new ingest flow end-to-end after Phase 52 (write-path
quarantine) and Phase 53 (read-model cleanup) — confirming no trendLevel or
estimatedBudget surfaces anywhere in the pipeline.

## Config

| Key | Value |
|---|---|
| Source URL | `https://www.tiktok.com/@aveny.cafe/video/7575529523970690326` |
| Platform | `tiktok` |
| Hagen git_sha | `d9c828becc191f7aeebae51495301a621fa04a01` |
| Hagen origin | `https://hagen-production.up.railway.app` |
| Ingest run ID | `6c771ccc-3313-47b9-8289-d705d3e87c3e` |
| Smoke concept ID | `smoke-ingest-1778183831` |

## Step-by-Step Results

### Step 2 — Hagen Status
```json
{
  "configured": true,
  "reachable": true,
  "capabilities_ok": true,
  "hagen_git_sha": "d9c828becc191f7aeebae51495301a621fa04a01",
  "hagen_schema_version": 1,
  "capabilities_missing": []
}
```
✅ All checks passed.

### Step 3 — Create Ingest Run
`POST /api/studio/ingest-runs`
```json
{ "status": "queued", "id": "6c771ccc-3313-47b9-8289-d705d3e87c3e" }
```
✅ Run created.

### Step 4 — Analyze
`POST /api/studio/concepts/analyze`

| Check | Result |
|---|---|
| Response is JSON | ✅ |
| `upload.gcsUri` present | ✅ `https://generativelanguage.googleapis.com/v1beta/files/3itvb8f4o0rc` |
| `analysis` present | ✅ keys: provider, analyzedAt, visual, audio, content, script, technical, scenes, analysisModel |
| No HTML/404 | ✅ |
| `trendLevel` absent | ✅ |
| `estimatedBudget` absent | ✅ |

### Step 6 — Enrich
`POST /api/studio/concepts/enrich`

| Field | Value | OK |
|---|---|---|
| `script_mode` | `short_dialogue` | ✅ |
| `setup_complexity` | `point_and_shoot` | ✅ |
| `skill_required` | `comfortable_on_camera` | ✅ |
| `setting` | `similar_venue_type` | ✅ |
| `businessTypes` | `["restaurang"]` (1 of max 5) | ✅ |
| `trendLevel` | absent | ✅ |
| `estimatedBudget` | absent | ✅ |

Humor-enrich: not invoked separately — enrich pipeline ran as single step via
`/api/studio/concepts/enrich`, which includes all objective signal extraction.

### Step 7 — Classify + Save
`POST /api/admin/concepts`

```json
{ "id": "smoke-ingest-1778183831", "is_active": true }
```
✅ Concept saved with backend_data and overrides.

### Step 8 — Verify Saved Concept
`GET /api/admin/concepts/smoke-ingest-1778183831`

| Field | Value | OK |
|---|---|---|
| `is_active` | `true` | ✅ |
| `backend_data` | present | ✅ |
| `overrides.script_mode` | `short_dialogue` | ✅ |
| `overrides.setup_complexity` | `point_and_shoot` | ✅ |
| `overrides.skill_required` | `comfortable_on_camera` | ✅ |
| `overrides.setting` | `similar_venue_type` | ✅ |
| `overrides.trendLevel` | absent | ✅ |
| `overrides.estimatedBudget` | absent | ✅ |

### Step 9 — Library Visibility
`GET /api/admin/concepts?is_active=true&limit=500`

- Total active concepts: 28
- Smoke concept found in library: ✅
- All four objective fields visible in overrides: ✅

### Step 10 — Ingest Run Status
`GET /api/studio/ingest-runs/6c771ccc-3313-47b9-8289-d705d3e87c3e`

| Field | Value |
|---|---|
| `status` | `completed` ✅ |
| `stage` | `saving` |
| `concept_id` | `smoke-ingest-1778183831` ✅ |
| `result` keys | `analyze_summary`, `enrich_summary`, `save_summary` |

### Step 11 — Cleanup
`DELETE /api/admin/concepts/smoke-ingest-1778183831`

- Response: `{"success": true}` ✅
- Subsequent GET: `is_active: false` ✅
- No permanent test data left active in library.

## Bugs / Fixes

None. The pipeline ran cleanly end-to-end without code changes.

## Typecheck Status

```
pnpm --filter @workspace/api-server exec tsc --noEmit  → 0 errors ✅
pnpm --filter @workspace/letrend exec tsc --noEmit     → 0 errors ✅
```

## Summary

The new ingest flow (URL → ingest_run → analyze → enrich → classify/save →
library → cleanup) works correctly end-to-end. The four V1 objective signals
(`script_mode`, `setup_complexity`, `skill_required`, `setting`) are present
throughout. Neither `trendLevel` nor `estimatedBudget` appear anywhere in the
pipeline — Phases 52 and 53 are fully effective.
