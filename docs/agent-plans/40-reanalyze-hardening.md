# Phase 40 — Reanalyze/Review Flow Hardening

## Summary

Phase 40 hardened the reanalyze/review flow introduced in Phase 39. The goals were:

1. Make the `POST /api/studio/concepts/:id/reanalyze` route provably read-only.
2. Extract reusable pure helpers for URL/GCS extraction, suggestion merging, and error normalization.
3. Widen source URL and GCS URI extraction to cover more backend_data key variants.
4. Extend the review page suggestion panel to surface `peopleNeeded`, `difficulty`, `filmTime`, and `businessTypes`.
5. Harden Hagen error handling so raw HTML never surfaces as the primary error string.
6. Add unit tests for all critical pure helpers.

## Files Changed

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/studio-helpers.ts` | New file — exported pure helpers (no Supabase/Hagen imports) |
| `artifacts/api-server/src/routes/studio-helpers.test.ts` | New file — 37 unit tests covering all helpers |
| `artifacts/api-server/src/routes/studio.ts` | Uses helpers; no longer inlines URL/GCS extraction or error normalization |
| `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx` | Extended `ReanalyzeSuggestions` interface + suggestions panel |
| `docs/agent-plans/39-existing-concept-reingest-review-workflow.md` | New Phase 39 documentation |

## Pure Helpers (`studio-helpers.ts`)

### `extractSourceUrl(bd)`
Checks, in priority order: `url`, `source_url`, `sourceUrl`, `video_url`, `tiktok_url`. Returns the first non-empty string (trimmed), or `''` if none found. The `enrich_only` strategy still triggers when this returns `''` but `backend_data` has content.

### `extractGcsUri(bd)`
Checks, in priority order: `gcs_uri`, `gcsUri`, `gcsUrl`, `video_gcs_uri`. Returns the first non-empty string (trimmed), or `''`.

### `normalizeHagenError(body)`
Detects HTML responses (strings starting with `<`, `<!doctype`, `<html`) and replaces them with a generic Swedish message. Never forwards raw HTML as the primary error. Falls back to `'Analysen misslyckades.'` when both `error` and `message` are absent.

### `buildSuggestedOverrides(enrichOverrides, confirmedOverrides)`
Returns only the subset of enrichment suggestions where the key does **not** already exist in `confirmedOverrides`. Guaranteed that confirmed CM overrides are never proposed for overwriting.

### `buildReanalyzeResponse(opts)`
Assembles the final JSON shape for the route response. Pure, no side effects.

## Read-Only Guarantee

`POST /api/studio/concepts/:id/reanalyze` contains exactly one Supabase call:

```typescript
supabase.from('concepts').select('id, backend_data, overrides, source').eq('id', conceptId).single()
```

No `.update()`, `.insert()`, `.upsert()`, or `.delete()` calls appear in the route handler. The helper functions imported by the route (`studio-helpers.ts`) have no Supabase imports at all.

## Review Page Extended Suggestions

The suggestion panel in `review/page.tsx` now surfaces all eight objective fields:

| Field | Type | Notes |
|---|---|---|
| `script_mode` | string | Scripted / text overlay / visual only |
| `setup_complexity` | string | Point-and-shoot → elaborate staging |
| `skill_required` | string | Anyone → professional actor |
| `setting` | string | Any venue → specific setting |
| `peopleNeeded` | string | Solo → crowd (new in Phase 40) |
| `difficulty` | string | Easy → hard (new in Phase 40) |
| `filmTime` | string | Time estimate (new in Phase 40) |
| `businessTypes` | string[] | Array; rendered as comma-joined labels (new in Phase 40) |

All suggestions remain display-only until the CM clicks "Tillämpa" or "Tillämpa alla". None auto-apply. The "Sparas med konceptet nästa gång du klickar Spara." disclaimer is shown whenever the suggestion panel is open.

When `enrich_failed: true`, the panel shows an inline notice: "Video analyserad — AI-förädling misslyckades." — still allowing the CM to save the partial `backend_data`.

## Test Results

```
 ✓ src/lib/studio/reconciliation-scoring.test.ts  (20 tests)
 ✓ src/lib/admin-derive/attention.test.ts          (17 tests)
 ✓ src/lib/studio/tiktok-sync.test.ts              (24 tests)
 ✓ src/routes/studio-helpers.test.ts               (37 tests)  ← new
 ✓ src/lib/ingest-runs.test.ts                     (9 tests)
 ✓ src/lib/studio/reconciliation-candidates-routes.test.ts (5 tests)

 Test Files  6 passed (6)
      Tests  112 passed (112)
```

## Typecheck Results

- `pnpm --filter @workspace/api-server exec tsc --noEmit` — **0 errors**
- `pnpm --filter @workspace/letrend exec tsc --noEmit` — **0 errors**

## Remaining Risks / Next Recommended Steps

1. **Live Hagen validation** — the expanded URL extraction and `buildSuggestedOverrides` logic have not been tested against real Hagen responses. A smoke test with a concept that has `video_url` or `tiktok_url` in `backend_data` would confirm the extraction path.
2. **`businessTypes` display in suggestions** — currently rendered as a comma-joined string for the diff view. A multi-chip rendering (like the main classification section) would be cleaner UX.
3. **Rate limit feedback** — the 429 response from the rate limiter surfaces a Swedish message in the error banner, but does not show a countdown timer in the UI.
4. **Concept locking** — two CMs could reanalyze the same concept simultaneously and see conflicting pending data. A soft lock or last-write-wins warning would reduce confusion.
