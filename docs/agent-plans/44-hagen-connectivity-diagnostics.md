# Phase 44 — Hagen Connectivity Diagnostics

## Summary

Phase 44 investigates why live smoke for the reanalyze/review flow was blocked, maps the full
Hagen proxy chain in the api-server, establishes the actual root cause of the connectivity
concern, and adds a minimal authenticated diagnostics endpoint.

---

## Root Cause Finding

**`HAGEN_BASE_URL` is set and valid in the current Replit process environment.**

```
HAGEN_BASE_URL=https://hagen-production.up.railway.app
```

The orchestrator's concern about `app/.env.local` was based on a misread of the environment:
- Replit injects secrets directly into `process.env` at startup — no `.env` file loading is
  needed or performed.
- `artifacts/api-server/src/index.ts` does NOT load any `.env` file. It reads `process.env`
  directly, which already contains all Replit-managed secrets.
- `app/.env.local` does not exist in this workspace (confirmed via `ls .env*` in root).
- The `artifacts/hagen/.env.example` is a template for the Hagen repo itself (Next.js), not
  for the api-server.

**The live smoke blocker was therefore not a missing env var.** The blocker was that the
orchestrator agent did not have an authenticated browser session to run the review UI.

---

## Dev/Startup Configuration

### How `artifacts/api-server` starts

```
dev script: export NODE_ENV=development && pnpm run build && pnpm run start
build:       node ./build.mjs   (esbuild — bundles src/ → dist/index.mjs)
start:       node --enable-source-maps ./dist/index.mjs
```

`build.mjs` does NOT load any `.env` file — it is a pure esbuild configuration script.
`src/index.ts` starts the Express server and reads `process.env` for `PORT`, `GEMINI_API_KEY`,
etc. **No dotenv** is imported anywhere in the api-server.

### Which env files are loaded

None. Replit provides all env vars (including secrets) in `process.env` at process start.
If `HAGEN_BASE_URL` were missing from Replit Secrets, `getHagenBase()` would return `null`
and every Hagen proxy call would immediately return:

```json
{ "error": "hagen-not-configured", "message": "HAGEN_BASE_URL is not configured on api-server" }
```

with HTTP 503 — no silent failure.

---

## Hagen Proxy Chain

### `getHagenBase()` — `src/lib/upstream-proxy.ts:27`

```typescript
export function getHagenBase(): string | null {
  return process.env['HAGEN_BASE_URL']?.trim() || null;
}
```

Single source of truth. Called by every proxy helper.

### `fetchHagenJson()` — `src/lib/upstream-proxy.ts:68`

All Hagen calls go through this function. It:
1. Calls `getHagenBase()` — returns 503 immediately if null.
2. Generates a `requestId` (UUID) for log correlation.
3. Issues a fetch with `AbortSignal.timeout(timeoutMs)` (default 15s).
4. Maps failure modes: network error → 503, non-JSON → 502, 4xx/5xx → passthrough.
5. Returns a discriminated `UpstreamResult` — never throws.

### Route map

| API-server route | Hagen path | Timeout | Function |
|---|---|---|---|
| `POST /api/studio/concepts/analyze` | `POST /api/studio/concepts/analyze` | 45 s | `studio.ts:142` |
| `POST /api/studio/concepts/enrich` | `POST /api/studio/concepts/enrich` | 15 s | `studio.ts:215` |
| `POST /api/studio/concepts/:id/reanalyze` | analyze + enrich internally | 45 s + 15 s | `studio.ts:443` |
| `GET /api/letrend/version` | `GET /api/letrend/version` | 15 s | `letrend.ts:85` |
| `GET /api/studio/hagen/status` *(new)* | `GET /api/letrend/version` | 8 s | `studio.ts:69` |

### Reanalyze route strategy

`POST /api/studio/concepts/:id/reanalyze` (studio.ts:443) is read-only:

1. Fetches concept from Supabase (SELECT only — no write).
2. If `backend_data` contains a source URL → `strategy = 'full_reanalyze'`:
   - Rate-limit check (5/min/user).
   - `fetchHagenJson({ path: '/api/studio/concepts/analyze', body: { videoUrl } })`.
   - `fetchHagenJson({ path: '/api/studio/concepts/enrich', body: { ... } })`.
3. If no source URL → `strategy = 'enrich_only'`:
   - `fetchHagenJson({ path: '/api/studio/concepts/enrich', body: { ... } })`.
4. Returns `{ strategy, backend_data, suggested_overrides, enrich_failed? }` — **no DB write**.

### Hagen version handshake (`GET /api/letrend/version`)

Hagen advertises its available routes in the version response. Used to detect route drift
without SSHing into Railway.

Expected response from the production Hagen build:

```json
{
  "service": "hagen",
  "git_sha": "<sha>",
  "git_branch": "main",
  "schema_version": 1,
  "routes": {
    "studio_concepts_analyze": "/api/studio/concepts/analyze",
    "studio_concepts_enrich": "/api/studio/concepts/enrich",
    "letrend_concept_prepare": "/api/letrend/concept/prepare",
    ...
  }
}
```

---

## New Diagnostics Endpoint

### `GET /api/studio/hagen/status`

Added to `artifacts/api-server/src/routes/studio.ts`. Authenticated (requireAuth + CM_ONLY).
**Does not expose `HAGEN_API_KEY` or any secret** — only shows the URL origin.

**When `HAGEN_BASE_URL` is not set:**
```json
{
  "configured": false,
  "error": "HAGEN_BASE_URL is not set on api-server",
  "hint": "Add HAGEN_BASE_URL to Replit Secrets or the deployment environment. ..."
}
```

**When Hagen is unreachable:**
```json
{
  "configured": true,
  "hagen_origin": "https://hagen-production.up.railway.app",
  "reachable": false,
  "request_id": "<uuid>",
  "error": "hagen-timeout | hagen-unreachable | hagen-non-json",
  "message": "..."
}
```

**When healthy:**
```json
{
  "configured": true,
  "hagen_origin": "https://hagen-production.up.railway.app",
  "reachable": true,
  "request_id": "<uuid>",
  "hagen_service": "hagen",
  "hagen_git_sha": "<sha>",
  "hagen_git_branch": "main",
  "hagen_schema_version": 1,
  "hagen_started_at": "<iso>",
  "routes": {
    "studio_concepts_analyze": "/api/studio/concepts/analyze",
    "studio_concepts_enrich": "/api/studio/concepts/enrich"
  },
  "capabilities_ok": true,
  "capabilities_missing": []
}
```

**How to call (with auth token):**
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://<REPLIT_DEV_DOMAIN>/api/studio/hagen/status | jq
```

Or from the browser DevTools console while logged in as CM/admin:
```javascript
const s = (await (await fetch('/api/studio/hagen/status', {
  headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
})).json()); console.log(s);
```

---

## How Local Env Should Be Set

**For Replit (current environment):**
The variable is already present in Replit Secrets and injected into `process.env` automatically.
No action needed.

**For a non-Replit dev environment:**
Create `artifacts/api-server/.env.local` and add:
```
HAGEN_BASE_URL=https://hagen-production.up.railway.app
```
Then load it in `src/index.ts` by adding (before any other imports):
```typescript
import 'dotenv/config';
```
And installing: `pnpm --filter @workspace/api-server add -D dotenv`.

Note: For Replit deployments, this is unnecessary — never commit `.env.local` with real values.

---

## How to Verify Hagen Connectivity

### Quick check (curl)
```bash
# Health check (unauthenticated)
curl http://localhost:8080/api/healthz

# Hagen status (requires CM auth token)
curl -H "Authorization: Bearer $TOKEN" \
  https://$REPLIT_DEV_DOMAIN/api/studio/hagen/status
```

### What to look for

| Field | Expected | Problem if not |
|---|---|---|
| `configured` | `true` | HAGEN_BASE_URL missing from Replit Secrets |
| `reachable` | `true` | Railway is down, URL wrong, or network blocked |
| `capabilities_ok` | `true` | Hagen was redeployed with renamed routes |
| `capabilities_missing` | `[]` | Route drift — api-server and hagen are out of sync |
| `hagen_git_branch` | `main` | Pointing at a staging/feature branch build |

---

## Impact on Reanalyze / Live Smoke

The live smoke from Phase 43 was blocked only by the absence of an authenticated CM browser
session — not by a missing env var. With `HAGEN_BASE_URL` correctly set:

- `POST /api/studio/concepts/:id/reanalyze` will reach Hagen's analyze + enrich routes.
- The `/api/studio/hagen/status` endpoint can confirm readiness before smoke testing.

**Recommended pre-smoke-test sequence:**
1. Call `GET /api/studio/hagen/status` — confirm `capabilities_ok: true`.
2. Open a concept in the review UI.
3. Click "Reanalysera video med AI".
4. Observe network: POST to `/api/studio/concepts/:id/reanalyze` — no PATCH.
5. If Hagen returns an error, the `request_id` in the response correlates to api-server logs.

---

## Remaining Risks

1. **Railway cold starts** — Hagen on Railway may have an initial cold-start delay of 5–30s.
   The analyze route uses a 45s timeout which should cover this, but the status endpoint has
   an 8s probe timeout — a Railway cold start could cause a false-negative there.

2. **Route drift** — If Hagen is redeployed with a renamed route (e.g. `analyze` →
   `analyze-v2`), the status endpoint will surface this via `capabilities_missing`.
   The `request_id` in every proxy call helps correlate api-server ↔ Hagen logs.

3. **HAGEN_API_KEY** — `upstream-proxy.ts` does NOT currently send a Hagen API key header.
   If Hagen adds authentication, all proxy calls will start returning 401 silently.

4. **No retry logic** — A transient Railway network blip will immediately fail the reanalyze
   route. No retry or backoff is implemented.

5. **Live Scenario B** — Still needs a CM to confirm `script_mode` / `setup_complexity` /
   `skill_required` / `setting` on at least one concept before it can be smoke-tested.

---

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @workspace/api-server run typecheck` | ✅ 0 errors |
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 errors |
| `pnpm --filter @workspace/api-server run test` | ✅ 117 pass |
| `pnpm --filter @workspace/letrend exec vitest run src/lib/reanalyze-suggestions.test.ts` | ✅ 26 pass |
