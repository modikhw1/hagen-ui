# Phase 45 — Hagen Status Endpoint Smoke Results

## Execution Method

**Live network probe** — `curl` calls issued directly from the Replit environment to
`$HAGEN_BASE_URL` (Railway) and to the local api-server on `localhost:8080`.

No authenticated browser session was available. The api-server `GET /api/studio/hagen/status`
endpoint was confirmed registered (auth guard returned `{"error":"Du måste logga in"}` on
unauthenticated call), so the route is correctly wired.

---

## Endpoint Status

### `GET /api/studio/hagen/status` (local api-server)

| Check | Result |
|---|---|
| Route registered | ✅ Returns auth error for unauthenticated call |
| Auth guard working | ✅ `{"error":"Du måste logga in"}` on no token |
| Live authenticated call | ❌ No CM session available in this environment |

### `GET $HAGEN_BASE_URL/api/letrend/version` (direct to Railway)

```
HTTP 404  content-type: text/html; charset=utf-8
x-powered-by: Next.js
x-railway-edge: railway/us-east4-eqdc4a
```

**Result: Hagen is reachable (Railway responds), but route does not exist in the deployed build.**

---

## Full Route Probe Results

All known Hagen API routes were probed directly:

| Hagen path | HTTP | Content-Type | Status |
|---|---|---|---|
| `/api/letrend/version` | 404 | `text/html` | ❌ Route drift |
| `/api/studio/concepts/analyze` | 404 | `text/html` | ❌ Route drift |
| `/api/studio/concepts/enrich` | 404 | `text/html` | ❌ Route drift |
| `/api/letrend/concept/prepare` | 404 | `text/html` | ❌ Route drift |
| `/api/letrend/library` | 404 | `text/html` | ❌ Route drift |
| `/api/videos/library` | **200** | `application/json` | ✅ Working |

**One route working confirms: Railway is up and Hagen is running. The missing routes are a deployment gap — the current live build is an older version.**

---

## Root Cause

**Route drift: Hagen on Railway is running a stale build** that predates the studio API routes.

Evidence:
- Next.js buildId in 404 pages: `oM_SSCXpu0aB564seONTT` — a stale deployment
- Nav items in 404 HTML: `analyze-rate`, `brand-analysis`, `brand-profile` — matches older UI
- `/api/videos/library` returns 200 JSON — an older route that was deployed
- `/api/studio/concepts/analyze` and `/api/studio/concepts/enrich` exist in
  `artifacts/hagen/src/app/api/studio/` (mirror source) but are **not deployed**
- `/api/letrend/version` exists in source (`artifacts/hagen/src/app/api/letrend/version/route.ts`)
  but is **not deployed**

### What `GET /api/studio/hagen/status` Would Return (simulated)

Based on how `fetchHagenJson` handles non-JSON responses (see `upstream-proxy.ts:131`):

```json
{
  "configured": true,
  "hagen_origin": "https://hagen-production.up.railway.app",
  "reachable": false,
  "request_id": "<uuid>",
  "error": "hagen-non-json",
  "message": "Hagen returned non-JSON (404 text/html; charset=utf-8)"
}
```

HTTP 502 — which is the correct `hagen-non-json` error from `fetchHagenJson`.

### Impact on Reanalyze

Every call to `POST /api/studio/concepts/:id/reanalyze` that involves a source URL will fail:

1. `fetchHagenJson({ path: '/api/studio/concepts/analyze', ... })` → 404 HTML → `hagen-non-json` 502
2. The reanalyze route returns the 502 upstream error to the review page.
3. The review page shows the error banner (`reanalyzeState = 'error'`).

For concepts without a source URL (`enrich_only` strategy):
1. `fetchHagenJson({ path: '/api/studio/concepts/enrich', ... })` → 404 HTML → same 502.
2. Same result.

**All reanalyze calls fail until Hagen is redeployed.**

---

## Problem Classification

| Layer | Status | Notes |
|---|---|---|
| `HAGEN_BASE_URL` env var | ✅ Correct | Set in Replit Secrets, present in process.env |
| Railway server reachable | ✅ Yes | `/api/videos/library` returns 200 |
| Studio API routes deployed | ❌ Not deployed | All return 404 HTML |
| api-server code | ✅ Correct | Phase 40–44 code is correct, typechecks pass |
| `upstream-proxy.ts` | ✅ Correct | 502 `hagen-non-json` returned correctly |
| Auth (CM session) | ⚠️ Not tested | No CM session available in agent environment |

---

## Fix Required

**This is a Railway/GitHub deployment issue, not a code issue in hagen-ui.**

The api-server code is correct and cannot unblock this. The Hagen repo at
`modikhw1/hagen` needs to be pushed and redeployed on Railway with the current source.

### Steps for the operator

1. **Confirm the Hagen source is up to date** in the GitHub repo `modikhw1/hagen`.
   The required routes exist in `artifacts/hagen` (mirror):
   - `src/app/api/studio/concepts/analyze/route.ts`
   - `src/app/api/studio/concepts/enrich/route.ts`
   - `src/app/api/letrend/version/route.ts`

2. **Trigger a Railway redeploy** of the Hagen service. Options:
   - Push a commit to the `main` branch of `modikhw1/hagen` (Railway auto-deploys).
   - Or manually trigger a redeploy in the Railway dashboard.

3. **Verify the deployment** by running:
   ```bash
   curl -s "$HAGEN_BASE_URL/api/letrend/version" | jq .service
   # Expected: "hagen"
   ```

4. **Then call the status endpoint** with a CM token:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     https://$REPLIT_DEV_DOMAIN/api/studio/hagen/status | jq .
   # Expected: { "configured": true, "reachable": true, "capabilities_ok": true, ... }
   ```

5. **Then proceed with Phase 46 reanalyze live smoke** (Phase 43 procedure).

---

## No Code Changes in Phase 45

The api-server code correctly handles the 404-HTML response from Hagen with a 502
`hagen-non-json` error. No fix needed in hagen-ui. The issue is entirely in the
Railway deployment of the Hagen repo.

---

## Next Steps

| Step | Owner | Blocker |
|---|---|---|
| Redeploy Hagen on Railway | Human/operator | Requires Railway access |
| Verify `capabilities_ok: true` via hagen/status | CM | After Railway redeploy |
| Phase 46: live reanalyze smoke | CM | After Hagen is healthy |
| Phase 46B: Scenario B (save objective fields + reanalyze) | CM | Requires healthy Hagen |

---

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @workspace/api-server run typecheck` | ✅ 0 errors |
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 errors |
| `pnpm --filter @workspace/api-server run test` | ✅ 117 pass |
| Hagen production `/api/letrend/version` | ❌ 404 HTML — deployment needed |
| Hagen production `/api/studio/concepts/analyze` | ❌ 404 HTML — deployment needed |
| Hagen production `/api/videos/library` | ✅ 200 JSON — server is up |
