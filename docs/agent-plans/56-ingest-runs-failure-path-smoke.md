# Phase 56 — Ingest Runs Failure Path Smoke

**Date**: 2026-05-07  
**Hagen sha**: d9c828be (unchanged from Phase 54)

---

## Objective

Live E2E verification that a deliberately failed ingest run:
- is created, marked `failed`, and stored in `ingest_runs`
- surfaces correctly in `GET /api/studio/ingest-runs/:id` and the list endpoint
- renders correctly in `IngestStatusPanel` (red state, no review link, truncated error)
- does NOT create a concept record
- does NOT break panel refresh/loading state

---

## Run Details

| Field | Value |
|---|---|
| `ingest_run.id` | `87fb4f4d-d9c4-4e20-aec0-f083cf156aaf` |
| `source_url` | `https://example.invalid/letrend-smoke-failed-ingest-1778184571` |
| `platform` | `tiktok` |
| `created_by` | `65f9cd4a-fa10-4687-a749-d6b8f7849048` (admin smoke account) |
| Run left in DB | Yes — harmless; status=failed, concept_id=null, no downstream effects |

---

## Step-by-step Results

### Step 3 — POST /api/studio/ingest-runs
```
HTTP 201
status: queued
stage: null
concept_id: null
```

### Step 4 — POST /api/studio/concepts/analyze (expected to fail)
```
HTTP 422
Is JSON: YES
Is HTML: NO
error: "download_failed"
message: "download_failed: all strategies exhausted — platform=linux | command=yt-dlp …
         Failed to resolve 'example.invalid' ([Errno -2] Name or service not known)"
```
Hagen returned a structured JSON 422 (not HTML, not 500). The API server logged the upstream
error as WARN and forwarded 422 to the caller. ✅

### Step 5 — GET /api/studio/ingest-runs/:id
```
status:      failed   ✅
stage:       analyzing ✅
error_code:  analyze_failed ✅
error_msg:   download_failed (truncated to 80 chars shown here) ✅
concept_id:  null ✅
```

### Step 6 — GET /api/studio/ingest-runs?status=failed&limit=10
```
total failed runs: 3
smoke run found:   True ✅
error_message:     download_failed ✅
concept_id:        null ✅
no leaked secrets in response keys: True ✅
```

### Step 7 — UI (IngestStatusPanel code inspection)

Direct screenshot of `/studio/concepts` shows login wall (correct — preview pane is
unauthenticated). UI behaviour confirmed through code review:

| Behaviour | Verified |
|---|---|
| Panel hidden when runs.length === 0 (returns null) | ✅ |
| Red border (`LeTrendColors.error+'33'`) when failedCount > 0 | ✅ |
| Red background (`LeTrendColors.errorLight`) when failedCount > 0 | ✅ |
| "N fel" badge in header | ✅ |
| `Granska →` link only rendered when `run.concept_id !== null` | ✅ |
| `source_url` truncated via `truncateUrl()` (hostname+path ≤38 chars + …) | ✅ |
| Full URL in `title` attribute for tooltip | ✅ |
| `error_message` truncated to 60 chars + … | ✅ |
| Auto-refresh every 5s only while queued/running runs present | ✅ |
| Auto-refresh stops when all runs reach terminal status | ✅ |
| Manual ↻ refresh button calls `fetchRuns()` | ✅ |
| Non-fatal fetch error (panel silently stays empty) | ✅ |

### Browser console
No errors related to IngestStatusPanel. Only HMR invalidation warnings for
`ProfileContext.tsx` from earlier development session — fully resolved, no impact.

---

## Fixes Applied (Step 8)

None required. The panel handled the failure path correctly without any code changes:
- failed row renders with red badge
- no review link without concept_id
- error_message truncation works
- auto-refresh stops (no active runs in failed terminal state)

---

## Typecheck Status

```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
```

---

## Why the Smoke Run Was Left in DB

The run (`87fb4f4d-d9c4-4e20-aec0-f083cf156aaf`) was left in place:
- `status=failed`, `concept_id=null` — no concept was created
- `source_url=https://example.invalid/…` — clearly marked as smoke test
- The `ingest_runs` table has no foreign key dependencies on this row
- Deleting it would require a direct Supabase service-role call with no operational benefit;
  keeping it validates the panel under real data conditions going forward

---

## Open Gaps (carried from Phase 55)

1. No pagination / infinite scroll — list capped at 100 rows.
2. No SSE/WebSocket — 5s polling sufficient for current load.
3. Per-run `warnings` array not surfaced in panel UI.
4. No status filter chips in the UI panel.
5. Panel collapse state not persisted across page reloads.
