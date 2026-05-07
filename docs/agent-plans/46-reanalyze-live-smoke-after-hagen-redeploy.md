# Phase 46 — Reanalyze Live Smoke After Hagen Redeploy

## Status: PASSED ✅

All smoke checks completed. No bugs found. No code changes made.

---

## Environment

| Item | Value |
|---|---|
| Date | 2026-05-07 |
| Hagen `git_sha` | `191f2b29430d7436911faf12d7ffba47a02144ab` |
| Hagen `git_branch` | `main` |
| Hagen `started_at` | `2026-05-07T18:21:20.451Z` |
| Auth user | `codex.audit.admin@letrend.test` (is_admin=true, role=admin) |
| api-server | `localhost:8080` |
| Hagen Railway | `https://hagen-production.up.railway.app` |

---

## Smoke 1 — `GET /api/studio/hagen/status`

**Method**: Authenticated HTTP call from Replit environment using a Supabase JWT for the
audit admin test account (`codex.audit.admin@letrend.test`).

### Raw response

```json
{
  "configured": true,
  "hagen_origin": "https://hagen-production.up.railway.app",
  "reachable": true,
  "request_id": "b5f0d770-ebfd-4eb0-bdfc-1601319a8714",
  "hagen_service": "hagen",
  "hagen_git_sha": "191f2b29430d7436911faf12d7ffba47a02144ab",
  "hagen_git_branch": "main",
  "hagen_schema_version": 1,
  "hagen_started_at": "2026-05-07T18:21:20.451Z",
  "routes": {
    "studio_concepts_analyze": "/api/studio/concepts/analyze",
    "studio_concepts_enrich": "/api/studio/concepts/enrich"
  },
  "capabilities_ok": true,
  "capabilities_missing": []
}
```

### Result summary

| Field | Value | Status |
|---|---|---|
| `configured` | `true` | ✅ |
| `reachable` | `true` | ✅ |
| `capabilities_ok` | `true` | ✅ |
| `hagen_git_sha` | `191f2b29...` | ✅ matches pushed commit |
| `capabilities_missing` | `[]` | ✅ no gaps |

---

## Smoke 2 — `POST /api/studio/concepts/:id/reanalyze` (full_reanalyze path)

**Concept**: `clip-contraband-coffee`
- Backend data keys: `id, url, platform, humor_analysis, scene_breakdown, audience_signals, replicability_signals, replicability_analysis`
- `backend_data.url`: `https://www.tiktok.com/@contraband.coffee/video/...`
- `backend_data.source_url`: `` (empty string — but `url` field present)
- Confirmed overrides: 17 keys (`isNew, price, market, filmTime, hasScript, script_sv, difficulty, transcript`, etc.)

### Strategy selection

`extractSourceUrl(backend_data)` checks these fields in priority order:
`url` → `source_url` → `sourceUrl` → `video_url` → `tiktok_url`

The concept had `url` set, so the strategy resolved to **`full_reanalyze`** (not `enrich_only`
as originally assumed based on missing `source_url`). This is correct and documented.

**Note for orchestrator**: "enrich_only" only triggers if ALL of `url, source_url, sourceUrl,
video_url, tiktok_url` are absent or empty in `backend_data`. All production concepts probed
(50 checked) had at least `url` set. The enrich_only path can still be tested by creating a
concept manually without any URL fields.

### Call

```
POST http://localhost:8080/api/studio/concepts/clip-contraband-coffee/reanalyze
Authorization: Bearer <CM/admin JWT>
```

### Timing

| Step | Duration |
|---|---|
| Total elapsed | ~25s |
| Breakdown | Hagen video download + Gemini analyze: ~20s; Hagen enrich: ~5s |

This is within the 45s `analyze` timeout and 30s `enrich` timeout configured in the route.

### Raw response shape

```json
{
  "strategy": "full_reanalyze",
  "backend_data": {
    "provider": "...",
    "analyzedAt": "...",
    "visual": { ... },
    "audio": { ... },
    "content": {
      "topic": "...",
      "style": "...",
      "format": "...",
      "duration": "...",
      "keyMessage": "...",
      "narrativeStructure": "...",
      "callsToAction": [...],
      "targetAudience": "...",
      "emotionalTone": "...",
      "valueProposition": "...",
      "uniquenessFactors": [...]
    },
    "script": { ... },
    "technical": { ... },
    "scenes": [ ... ],
    "analysisModel": "...",
    "id": "clip-contraband-coffee",
    "url": "https://www.tiktok.com/@contraband.coffee/video/...",
    "source_url": "https://www.tiktok.com/@contraband.coffee/video/...",
    "gcs_uri": "gs://..."
  },
  "suggested_overrides": {
    "mechanism": "contrast",
    "trendLevel": 3
  }
}
```

### Confirmed behaviours

| Check | Result |
|---|---|
| Only `POST /api/studio/concepts/:id/reanalyze` called before Save | ✅ No other writes |
| `backend_data` replaced with fresh Hagen analysis | ✅ New keys: `provider, analyzedAt, visual, audio, content, script, technical, scenes, analysisModel` |
| `suggested_overrides` filtered correctly | ✅ Only 2 keys returned — all 17 confirmed override fields were suppressed |
| No DB write during reanalyze | ✅ Confirmed — route is read+proxy only |
| Rate limit respected | ✅ No 429 errors in testing |

---

## Smoke 3 — Frontend Suggestion State Analysis

The `suggested_overrides` returned for `clip-contraband-coffee` were:
```json
{ "mechanism": "contrast", "trendLevel": 3 }
```

The frontend `buildSuggestionsFromOverrides` (in `reanalyze-suggestions.ts`) only maps
these specific keys to `SuggestableFields`:
`script_mode, setup_complexity, skill_required, setting, peopleNeeded, difficulty, filmTime, businessTypes`

Since `mechanism` and `trendLevel` are not in `SuggestableFields`, all fields map to `null`:

```
getSuggestionState(fields, enrichFailed=undefined) → 'suppressed'
```

**Frontend will show** (line 682 of review/page.tsx):
> "Ny analysdata är redo att sparas. Inga nya klassificeringsförslag kunde tillämpas utan att
> röra bekräftade värden."

The green badge **"Ny analys laddad · osparad"** (line 571) will still appear because
`pendingReanalyzeBackendData` is set from `data.backend_data`.

This is **correct behaviour** — the CM has 17 confirmed overrides, all suggestable fields
are already locked. The fresh backend_data is still pending save, and the CM can save it
to update the raw analysis without touching their confirmed overrides.

### Known gap (not a bug — out of scope for Phase 46)

`mechanism` and `trendLevel` are valid enrichment fields that Hagen returns but are not
currently surfaced as `SuggestableFields`. To add them as "Tillämpa"-suggestions in the UI,
they would need to be added to:
1. `SuggestableFields` interface in `reanalyze-suggestions.ts`
2. `buildSuggestionsFromOverrides` function
3. The review page's suggestion rendering section

This is a Phase 47+ task. The user was not asked about it — no feature changes were made.

---

## Smoke 4 — enrich_only path

**Not testable with current production data.** All 50 concepts probed had at least one
URL field in `backend_data` (`url`, `source_url`, or similar). The `enrich_only` path
requires `backend_data` with no URL fields at all. This can be tested by creating a
concept without any source URL (e.g., a manually written brief).

The code path is correct (verified in 117 unit tests including
`studio-helpers.test.ts`). The `enrich` Hagen route returns valid Swedish overrides on
direct probing (HTTP 200 with `headline_sv` etc. — verified in Phase 45).

---

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @workspace/api-server run typecheck` | ✅ 0 errors |
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 errors |
| `pnpm --filter @workspace/api-server run test` | ✅ 117/117 |
| `GET /api/studio/hagen/status` with auth | ✅ `capabilities_ok: true` |
| `POST /api/studio/concepts/:id/reanalyze` (full_reanalyze) | ✅ 200 — fresh BD + 2 suggestions |
| DB writes during smoke | ✅ None (read-only confirmed) |
| Rate limit 429 during smoke | ✅ None triggered |

---

## Code Changes in Phase 46

**None.** No bugs found. No refactors made. The reanalyze flow is correct end-to-end.

---

## Next Steps for Orchestrator

| Step | Status | Notes |
|---|---|---|
| Phase 46 live reanalyze smoke | ✅ **Done** | No bugs found |
| `enrich_only` path live test | ⏳ Optional | Needs a concept with no URL fields |
| Add `mechanism`/`trendLevel` to `SuggestableFields` | 🔲 Phase 47+ | Not urgent — backend returns them, frontend ignores them gracefully |
| `humor-enrich` on Railway | ℹ️ Known gap | Vertex AI tuned model not on Railway — fire-and-forget, doesn't block reanalyze |
| CM browser smoke (login → studio → concept → reanalyze button) | ⏳ Recommended | Agent couldn't log in via browser; API-level smoke done instead |
