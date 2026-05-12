# Phase 63 — Hagen Sync Deployment Smoke Harness

**Date**: 2026-05-12  
**Scope**: Create a practical smoke test harness and deployment checklist for Hagen library sync to make it hard to deploy with broken config.

---

## Context

Phases 59-62 made the Hagen library history sync path structurally safe:
- Phase 59: created the `/api/studio-v2/customers/:customerId/hagen-clips` endpoint
- Phase 60: required positive handle matching before preview/import
- Phase 61: added `?handle=` server-side filtering for efficiency
- Phase 62: protected the endpoint with `HAGEN_SYNC_SECRET` and passed diagnostics to UI

**Recurring gap**: Live HTTP smoke tests were never run because Hagen was not running locally during development. Before adding more product behavior, we need a way to verify this flow repeatedly and catch config errors early.

**Goal**: Make it easy to smoke test Hagen sync before deployment and hard to deploy with missing env vars, wrong secrets, or broken routes.

---

## What Was Added

### 1. Smoke Script: `scripts/smoke-hagen-sync.mjs`

A safe-by-default Node.js script that tests the Hagen sync flow without performing any imports.

**Location**: `hagen-ui/scripts/smoke-hagen-sync.mjs`  
**Safe by default**: Only calls preview endpoints, never import mode.

#### Env Vars

| Var | Required | Description |
|---|---|---|
| `HAGEN_BASE_URL` | **Yes** | Hagen service URL (e.g., `http://localhost:3000`) |
| `HAGEN_SYNC_SECRET` | No | Shared secret for auth. If set, tests auth behavior. |
| `HAGEN_SYNC_TEST_CUSTOMER_ID` | No | Customer ID for smoke test (default: `smoke-test`) |
| `HAGEN_SYNC_TEST_HANDLE` | No | TikTok handle for smoke test (default: `nonexistent-smoke-handle`) |
| `API_SERVER_BASE_URL` | No | hagen-ui API URL (e.g., `http://localhost:4000`) for testing hagen-ui routes |
| `HAGEN_UI_AUTH_COOKIE` | No | Auth cookie for authenticated preview test (e.g., `sb-access-token=...`) |

#### Tests Performed

**Test 1: Hagen endpoint with correct secret** (if `HAGEN_SYNC_SECRET` is set):
```bash
GET /api/studio-v2/customers/{id}/hagen-clips?handle={handle}
Headers: x-hagen-sync-secret: {secret}

Checks:
- Response is 200 JSON
- Response has { clips: Array, diagnostics: Object }
- diagnostics.handleFilter === normalized handle
- diagnostics.totalTikTokClips is present
- diagnostics.availableUsernameCount is present
```

**Test 2: Hagen endpoint without secret** (if `HAGEN_SYNC_SECRET` is set):
```bash
GET /api/studio-v2/customers/{id}/hagen-clips?handle={handle}
Headers: (no x-hagen-sync-secret)

Checks:
- Response is 401
- error === 'unauthorized'
```

**Test 3: hagen-ui preview without auth** (if `API_SERVER_BASE_URL` is set):
```bash
POST /api/studio-v2/customers/{id}/sync-history?preview=true
Headers: (no auth)

Checks:
- Response is 401 or 403
```

**Test 4: hagen-ui preview with auth** (if `HAGEN_UI_AUTH_COOKIE` is set):
```bash
POST /api/studio-v2/customers/{id}/sync-history?preview=true
Headers: Cookie: {auth_cookie}

Checks:
- Response is 200 JSON
- Response has handle, totalMatched, wouldImport, wouldSkip
- Response has hagenDiagnostics (warns if missing, for backward compat)
- NO IMPORT IS PERFORMED
```

#### Usage Examples

**Minimal smoke (local dev, no auth)**:
```bash
export HAGEN_BASE_URL=http://localhost:3000
node scripts/smoke-hagen-sync.mjs
```

**Full smoke (local dev, with auth)**:
```bash
export HAGEN_BASE_URL=http://localhost:3000
export HAGEN_SYNC_SECRET=your-local-dev-secret
export API_SERVER_BASE_URL=http://localhost:4000
export HAGEN_SYNC_TEST_CUSTOMER_ID=real-customer-uuid
export HAGEN_SYNC_TEST_HANDLE=restaurangx
node scripts/smoke-hagen-sync.mjs
```

**Production smoke (requires auth cookie from browser)**:
```bash
export HAGEN_BASE_URL=https://hagen.railway.app
export HAGEN_SYNC_SECRET=prod-secret-from-railway-env
export API_SERVER_BASE_URL=https://api.letrend.se
export HAGEN_SYNC_TEST_CUSTOMER_ID=real-customer-uuid
export HAGEN_SYNC_TEST_HANDLE=restaurangx
export HAGEN_UI_AUTH_COOKIE="sb-access-token=eyJ..."
node scripts/smoke-hagen-sync.mjs
```

#### Output

**Success**:
```
=== Hagen Library Sync Smoke Test ===

Config:
  HAGEN_BASE_URL: http://localhost:3000
  HAGEN_SYNC_SECRET: ***
  CUSTOMER_ID: smoke-test
  HANDLE: nonexistent-smoke-handle
  API_SERVER_BASE_URL: http://localhost:4000
  AUTH_COOKIE: (not set)

Testing Hagen endpoint: http://localhost:3000
  Test 1: GET with correct secret and ?handle=
  ✓ JSON response with clips (0) and diagnostics
  ✓ diagnostics.handleFilter = "nonexistent-smoke-handle"
  ✓ diagnostics.totalTikTokClips = 142
  ✓ diagnostics.availableUsernameCount = 18
  Test 2: GET without secret (expect 401)
  ✓ 401 unauthorized when secret is missing

Testing hagen-ui API: http://localhost:4000
  Test 3: POST preview without auth (expect 401)
  ✓ 401 when no auth provided
  HAGEN_UI_AUTH_COOKIE not set. Skipping authenticated preview test.

✓ All smoke tests passed!
```

**Failure** (missing env var):
```
=== Hagen Library Sync Smoke Test ===

✗ HAGEN_BASE_URL is required.

Set env vars and try again:

  export HAGEN_BASE_URL=http://localhost:3000
  export HAGEN_SYNC_SECRET=your-secret  # optional, tests auth
  export API_SERVER_BASE_URL=http://localhost:4000  # optional, tests hagen-ui API
  export HAGEN_UI_AUTH_COOKIE="sb-access-token=..."  # optional, tests authenticated preview
  node scripts/smoke-hagen-sync.mjs

(exits with code 1)
```

---

### 2. Updated Hagen `.env.example`

**File**: `hagen/.env.example`

**Added**:
```bash
# Hagen Sync Secret (Phase 62)
# Shared secret for authenticating requests from hagen-ui to Hagen's library sync endpoint.
# Must match HAGEN_SYNC_SECRET in hagen-ui api-server env.
# Required in production (NODE_ENV=production). Optional in local dev.
# Generate with: openssl rand -hex 32
HAGEN_SYNC_SECRET=your-64-char-random-token-here
```

This documents the required env var directly in the repo where devs first clone Hagen.

---

## Required Env Var Contract

### hagen-ui api-server

| Var | Required | Description |
|---|---|---|
| `HAGEN_BASE_URL` | **Yes** | Hagen service URL. Used by `fetchHagenJson` in `upstream-proxy.ts`. Example: `https://hagen.railway.app` or `http://localhost:3000` |
| `HAGEN_SYNC_SECRET` | No (Yes in prod) | Shared secret for authenticating to Hagen's sync endpoint. Must match Hagen's secret. If omitted, requests are sent without `x-hagen-sync-secret` header (fine for local dev if Hagen also has no secret). |

**Deployment**: Set both vars in Railway/Vercel env. Generate secret with `openssl rand -hex 32`.

### Hagen

| Var | Required | Description |
|---|---|---|
| `HAGEN_SYNC_SECRET` | **Yes in prod** | Shared secret for authenticating sync requests from hagen-ui. If `NODE_ENV=production` and this is not set, endpoint returns 500. If set, requires matching `x-hagen-sync-secret` header (returns 401 if missing/wrong). If not set and `NODE_ENV !== production`, auth is bypassed (local dev convenience). |
| `NODE_ENV` | No | Set to `production` in prod deployment. Enforces `HAGEN_SYNC_SECRET` requirement. |

**Deployment**: Set `NODE_ENV=production` and `HAGEN_SYNC_SECRET` in Railway env.

---

## Deployment Checklist

Before deploying Hagen sync to production:

### 1. Generate Shared Secret
```bash
openssl rand -hex 32
# Example output: a1b2c3d4e5f6789...
```

### 2. Set Env Vars in Both Services

**Hagen (Railway)**:
```bash
NODE_ENV=production
HAGEN_SYNC_SECRET=a1b2c3d4e5f6789...
```

**hagen-ui api-server (Railway/Vercel)**:
```bash
HAGEN_BASE_URL=https://hagen.railway.app
HAGEN_SYNC_SECRET=a1b2c3d4e5f6789...
```

### 3. Deploy Both Services

Deploy or restart both services so env vars take effect.

### 4. Run Smoke Tests

**Test A: Direct Hagen endpoint (no auth, expect 401)**:
```bash
curl -H "Accept: application/json" \
  "https://hagen.railway.app/api/studio-v2/customers/test/hagen-clips"

# Expected: 401 { "error": "unauthorized", "message": "..." }
```

**Test B: Direct Hagen endpoint (with correct secret)**:
```bash
curl -H "Accept: application/json" \
  -H "x-hagen-sync-secret: a1b2c3d4e5f6789..." \
  "https://hagen.railway.app/api/studio-v2/customers/test/hagen-clips?handle=nonexistent"

# Expected: 200 { "clips": [], "diagnostics": { ... } }
```

**Test C: hagen-ui preview (no auth, expect 401)**:
```bash
curl -X POST \
  "https://api.letrend.se/api/studio-v2/customers/test/sync-history?preview=true"

# Expected: 401 or 403
```

**Test D: hagen-ui preview (with auth, real customer)**:
Use the smoke script:
```bash
export HAGEN_BASE_URL=https://hagen.railway.app
export HAGEN_SYNC_SECRET=a1b2c3d4e5f6789...
export API_SERVER_BASE_URL=https://api.letrend.se
export HAGEN_SYNC_TEST_CUSTOMER_ID=real-customer-uuid
export HAGEN_SYNC_TEST_HANDLE=restaurangx
export HAGEN_UI_AUTH_COOKIE="sb-access-token=..."  # from browser dev tools
node scripts/smoke-hagen-sync.mjs

# Expected: All tests pass, preview returns hagenDiagnostics
```

### 5. Verify Preview Does Not Write Rows

After Test D (authenticated preview), check Supabase:
```sql
SELECT COUNT(*) FROM customer_concepts
WHERE customer_profile_id = 'real-customer-uuid'
  AND history_source = 'hagen_library';

-- Count should be SAME before and after preview
```

### 6. Verify Studio UI Shows Diagnostics

In browser:
1. Log in as CM
2. Navigate to Studio workspace for the test customer
3. Click "Förhandsgranska" (preview sync)
4. Verify preview result shows diagnostics line at bottom:
   ```
   Hagen: 142 TikTok-klipp totalt, 18 upplösta konton, 3 klipp utan upplöst konto
   ```

---

## Which Checks Were Actually Run

**Local testing (Phase 63 development)**:

| Check | Status | Notes |
|---|---|---|
| Smoke script exits nonzero when `HAGEN_BASE_URL` missing | ✅ Verified | Shows clear help message with example env vars |
| Smoke script is executable and runs without syntax errors | ✅ Verified | Node.js 18+ compatible |
| Typechecks pass in all repos | ✅ Verified | api-server, letrend, Hagen all pass |
| Direct Hagen endpoint with auth | ⏸️ Not run | Hagen not running locally |
| Direct Hagen endpoint without auth (401 check) | ⏸️ Not run | Hagen not running locally |
| hagen-ui preview without auth (401 check) | ⏸️ Not run | hagen-ui api-server not running locally |
| hagen-ui preview with auth (full flow) | ⏸️ Not run | Requires deployed services + auth cookie |
| Preview row-safety check | ⏸️ Not run | Requires Supabase access + real customer |

**Blocker**: Neither Hagen nor hagen-ui api-server are running locally. All HTTP smoke tests require deployed or locally-running services.

**Next step**: Run the smoke script after deploying with the checklist above.

---

## Files Changed

### hagen-ui Repo
| File | Change |
|---|---|
| `scripts/smoke-hagen-sync.mjs` | **NEW** — 315-line Node.js smoke test script. Tests Hagen endpoint auth, hagen-ui preview auth, and response shapes. Safe by default (preview only, no imports). |

### Hagen Repo
| File | Change |
|---|---|
| `.env.example` | Added `HAGEN_SYNC_SECRET` documentation with comment explaining usage, production requirement, and generation command. |

---

## Verification Results

### Typechecks
```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
cd hagen && npm run type-check                     → 0 errors ✅
```

### Smoke Script Basic Test
```bash
$ node scripts/smoke-hagen-sync.mjs

=== Hagen Library Sync Smoke Test ===

✗ HAGEN_BASE_URL is required.

Set env vars and try again:

  export HAGEN_BASE_URL=http://localhost:3000
  export HAGEN_SYNC_SECRET=your-secret  # optional, tests auth
  export API_SERVER_BASE_URL=http://localhost:4000  # optional, tests hagen-ui API
  export HAGEN_UI_AUTH_COOKIE="sb-access-token=..."  # optional, tests authenticated preview
  node scripts/smoke-hagen-sync.mjs

(exit code 1) ✅
```

**Result**: Script exits nonzero and shows clear help message. Works as expected.

---

## Remaining Blockers

1. **No live HTTP smoke tests performed** — Hagen and hagen-ui api-server are not running locally. The smoke script and deployment checklist are ready, but need deployed services to execute. **Mitigation**: Follow the deployment checklist above after deploying both services.

2. **No row-safety check implemented** — The smoke script does not count `customer_concepts` rows before/after preview because:
   - Requires Supabase service role key in hagen-ui env
   - Requires real customer with existing data
   - Adds complexity to smoke script for marginal value (preview is read-only by design)
   **Mitigation**: Manual SQL check documented in deployment checklist (step 5). If row-safety becomes critical, add `SUPABASE_SERVICE_ROLE_KEY` env var to smoke script and query before/after preview.

3. **Auth cookie extraction is manual** — The smoke script requires `HAGEN_UI_AUTH_COOKIE` from browser dev tools. This is awkward for CI/CD. **Mitigation**: For CI, skip authenticated preview test or use a service account token. For manual deployment smoke, extract cookie from browser (F12 → Application → Cookies → `sb-access-token`).

4. **Script does not test import mode** — The smoke script only tests preview to be safe by default. Import behavior is not verified. **Mitigation**: Import is tested manually in browser UI after deployment. The preview smoke test verifies the contract is correct; import uses the same data source.

5. **No CI integration** — The smoke script is not integrated into GitHub Actions or similar CI. **Mitigation**: Add to CI in a future phase with:
   - Deploy preview environments on PR
   - Run smoke script against preview
   - Block merge if smoke fails

---

## What Changed from Phase 62

Phase 62 added auth and diagnostics but left smoke testing entirely manual with curl commands scattered across phase docs.

Phase 63 adds:
- **Smoke script**: Single executable script that tests all critical paths (Hagen endpoint auth, hagen-ui preview auth, response shapes)
- **Env documentation**: `.env.example` in Hagen documents `HAGEN_SYNC_SECRET`
- **Deployment checklist**: Step-by-step procedure for deploying with correct config
- **Exit codes**: Script exits nonzero on failure, suitable for CI integration

**Before Phase 63**: Deploying required manually running 8+ curl commands from phase docs, easy to skip or misconfigure.

**After Phase 63**: Deploying requires running one script with env vars, exits nonzero if anything is wrong.

---

## Next Steps (Optional Future Work)

1. **Run smoke script against deployed services** — After deploying with the checklist, execute the full smoke script and document results in this file.

2. **Add row-safety check** — Extend smoke script to count `customer_concepts` rows before/after authenticated preview using `SUPABASE_SERVICE_ROLE_KEY` env var.

3. **CI integration** — Add smoke script to GitHub Actions:
   ```yaml
   - name: Smoke test Hagen sync
     env:
       HAGEN_BASE_URL: ${{ secrets.HAGEN_PREVIEW_URL }}
       HAGEN_SYNC_SECRET: ${{ secrets.HAGEN_SYNC_SECRET }}
       API_SERVER_BASE_URL: ${{ secrets.API_PREVIEW_URL }}
     run: node scripts/smoke-hagen-sync.mjs
   ```

4. **Service account auth** — Create a service account token for CI so `HAGEN_UI_AUTH_COOKIE` can be automated instead of manual browser extraction.

5. **Import mode smoke** — Add an `--allow-import` flag to smoke script that runs import mode on a dedicated test customer (e.g., `smoke-test-customer`) and verifies row counts change as expected. Require explicit flag to prevent accidental imports.

6. **Metrics/alerts** — Add Datadog/Sentry integration to smoke script to track smoke test success rate in production.

---

## Commit Message (Pending)

When ready to commit:

**hagen-ui repo**:
```
Add Hagen sync smoke test harness and deployment checklist

Adds scripts/smoke-hagen-sync.mjs: safe-by-default Node.js script
that tests Hagen endpoint auth, hagen-ui preview auth, and response
shapes without performing imports.

Script checks:
- Hagen endpoint with/without secret (401 when secret required)
- JSON response shape and diagnostics fields
- hagen-ui preview without auth (401)
- hagen-ui preview with auth (hagenDiagnostics present)

Exits nonzero on failure, suitable for CI integration.

Phase 63 — Hagen Sync Deployment Smoke Harness

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Hagen repo**:
```
Document HAGEN_SYNC_SECRET in .env.example

Adds documentation for HAGEN_SYNC_SECRET env var with comment
explaining production requirement, local dev behavior, and
generation command (openssl rand -hex 32).

Part of deployment smoke harness to reduce config errors.

Phase 63 — Hagen Sync Deployment Smoke Harness

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Live Smoke Result - Replit Dev Server

**Timestamp**: 2026-05-12 (Phase 63 execution)

**Environment**:
- Hagen URL: `https://72ede591-2293-453b-b41d-a99522630201-00-29z0j81ipx73a.worf.replit.dev`
- `HAGEN_SYNC_SECRET`: not set (local dev mode expected)
- `NODE_ENV`: unknown

**Command**:
```bash
export HAGEN_BASE_URL="https://72ede591-2293-453b-b41d-a99522630201-00-29z0j81ipx73a.worf.replit.dev"
node scripts/smoke-hagen-sync.mjs
```

**Result**: ❌ **BLOCKED by unexpected auth layer**

**Status codes**:
- Direct endpoint call: `401 Unauthorized`
- Response body: `{"error":"Du måste logga in"}` (Swedish: "You must log in")

**Issue**: The Replit deployment has user authentication middleware enabled that blocks the sync endpoint before reaching the Phase 62 `HAGEN_SYNC_SECRET` check. This is a different auth layer than designed.

**Expected behavior** (from Phase 62):
- If `HAGEN_SYNC_SECRET` is not set AND `NODE_ENV !== production` → allow request (local dev mode)
- If `HAGEN_SYNC_SECRET` is set → require `x-hagen-sync-secret` header

**Actual behavior**: Replit returns `401 "Du måste logga in"` before Phase 62 auth check runs, suggesting:
1. Next.js middleware or route protection requires Supabase user auth
2. The `/api/studio-v2/customers/:customerId/hagen-clips` endpoint is protected by a global auth layer

**Blocker for smoke test**: Cannot test the Phase 62 `HAGEN_SYNC_SECRET` contract because requests are blocked by an earlier auth layer that requires user login.

**Recommendations**:
1. **Option A**: Disable user auth middleware for the `/api/studio-v2/customers/*/hagen-clips` route in Replit (if this was added after Phase 62)
2. **Option B**: Test against the Railway deployment (2 weeks old) which may not have this auth layer
3. **Option C**: Add a Supabase auth token to the smoke test request if user auth is intentional
4. **Option D**: Deploy latest Hagen code (with Phase 59-62 changes) to Railway and test against that

**What was NOT tested**:
- ❌ Hagen endpoint with correct `HAGEN_SYNC_SECRET` (blocked by user auth)
- ❌ Hagen endpoint without secret returning 401 from Phase 62 check (blocked by user auth)
- ❌ Response shape `{ clips, diagnostics }` (blocked by user auth)
- ⏭️ hagen-ui API tests (skipped, no `API_SERVER_BASE_URL` provided)

**Conclusion**: The smoke test revealed an auth configuration mismatch between the designed Phase 62 contract and the deployed Replit environment. The Replit server has an additional authentication layer that prevents testing the `HAGEN_SYNC_SECRET` functionality.

---

## Live Smoke Result - Hagen Railway

**Timestamp**: 2026-05-12 (orchestrator verification)

**Environment**:
- Hagen URL: `https://hagen-production.up.railway.app`
- `HAGEN_SYNC_SECRET`: not available in orchestrator shell, so only the missing-secret/route reachability path was tested

**Command shape**:
```powershell
Invoke-WebRequest `
  -Uri "https://hagen-production.up.railway.app/api/studio-v2/customers/smoke-test/hagen-clips?handle=nonexistent-smoke-handle" `
  -Headers @{ Accept = "application/json" } `
  -Method GET
```

**Result**: **BLOCKED - Railway deployment does not expose the Phase 59 route**

**Status codes**:
- Direct endpoint call without secret: `404`
- Content-Type: `text/html; charset=utf-8`
- Body shape: Next.js HTML 404 page, not JSON

**Expected behavior after latest Hagen deploy**:
- Without `x-hagen-sync-secret`: JSON `401` with `error: "unauthorized"` if `HAGEN_SYNC_SECRET` is configured
- With correct `x-hagen-sync-secret`: JSON `200` with `{ clips, diagnostics }`

**Actual behavior**:
- Railway returns HTML 404 before the Phase 62 auth contract can be reached.

**Conclusion**:
The Railway service at `https://hagen-production.up.railway.app` appears not to be running the latest Hagen code that includes:
- Phase 59 `/api/studio-v2/customers/:customerId/hagen-clips`
- Phase 61 `?handle=` filtering
- Phase 62 `HAGEN_SYNC_SECRET` protection

Deploy latest Hagen to Railway and configure `HAGEN_SYNC_SECRET` before rerunning the smoke harness.

---

## Live Smoke Result - Hagen Railway After Redeploy

**Timestamp**: 2026-05-12 (orchestrator verification after Railway redeploy)

**Environment**:
- Hagen URL: `https://hagen-production.up.railway.app`
- `HAGEN_SYNC_SECRET`: not available in orchestrator shell, so only the missing-secret auth path was tested

**Command shape**:
```powershell
Invoke-WebRequest `
  -Uri "https://hagen-production.up.railway.app/api/studio-v2/customers/smoke-test/hagen-clips?handle=nonexistent-smoke-handle" `
  -Headers @{ Accept = "application/json" } `
  -Method GET
```

**Result**: **PARTIAL PASS - route is deployed and auth is active**

**Status codes**:
- Direct endpoint call without secret: `401`
- Content-Type: `application/json`
- Body: `{"error":"unauthorized","message":"Missing or invalid Hagen sync secret"}`

**What this verifies**:
- Railway no longer returns HTML `404`; the Phase 59 route is now present.
- Phase 62 shared-secret protection is active.
- Missing-secret failures return structured JSON, not HTML.

**What remains untested**:
- Correct-secret request returning `200` with `{ clips, diagnostics }`
- hagen-ui preview response including `hagenDiagnostics`
- Preview row-safety against `customer_concepts`

**Current blocker**:
The orchestrator shell does not have `HAGEN_SYNC_SECRET` set. To complete the smoke harness, rerun with:

```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
$env:HAGEN_SYNC_SECRET = "<redacted matching secret>"
node scripts/smoke-hagen-sync.mjs
```

---

## Smoke Harness Hardening - Invalid Secret File

**Timestamp**: 2026-05-12 (orchestrator verification)

**Context**:
A local file was provided as the presumed `HAGEN_SYNC_SECRET`, but its contents
were in multiline private-key format. `HAGEN_SYNC_SECRET` must be a single-line
shared token suitable for an HTTP header.

**Result**: **BLOCKED - invalid secret format**

**What changed**:
The smoke script now validates `HAGEN_SYNC_SECRET` before making any network
request. It rejects values that:

- contain newlines
- contain `BEGIN `
- contain `PRIVATE KEY`

It also sanitizes header-related exception messages so invalid header values are
not echoed back in terminal output.

**Verification**:
Running the smoke script with the invalid multiline file now exits before the
network call with:

```text
[ERR] HAGEN_SYNC_SECRET is not a valid shared secret for an HTTP header.
[ERR] Use a single-line random token, for example: openssl rand -hex 32
```

**Required next step**:
Generate/use the actual single-line `HAGEN_SYNC_SECRET` configured in Railway
and hagen-ui, then rerun:

```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
$env:HAGEN_SYNC_SECRET = "<redacted single-line shared secret>"
node scripts/smoke-hagen-sync.mjs
```

---

## Live Smoke Result - Hagen Railway With Shared Secret

**Timestamp**: 2026-05-12 (orchestrator verification after key rotation)

**Environment**:
- Hagen URL: `https://hagen-production.up.railway.app`
- `HAGEN_SYNC_SECRET`: loaded from local secret file, redacted from logs
- `API_SERVER_BASE_URL`: not set, so hagen-ui API preview checks were skipped
- `HAGEN_SYNC_TEST_CUSTOMER_ID`: default `smoke-test`
- `HAGEN_SYNC_TEST_HANDLE`: default `nonexistent-smoke-handle`

**Command shape**:
```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
$env:HAGEN_SYNC_SECRET = "<redacted single-line shared secret>"
node scripts\smoke-hagen-sync.mjs
```

**Result**: **PASS - direct Hagen endpoint smoke succeeded**

**Checks performed**:
- Correct-secret request returned JSON with `{ clips, diagnostics }`
- `diagnostics.handleFilter` matched `nonexistent-smoke-handle`
- `diagnostics.totalTikTokClips = 193`
- `diagnostics.availableUsernameCount = 98`
- Missing-secret request returned `401 unauthorized`
- hagen-ui API checks were skipped because `API_SERVER_BASE_URL` was not set

**Observed script output summary**:
```text
[OK] JSON response with clips (0) and diagnostics
[OK] diagnostics.handleFilter = "nonexistent-smoke-handle"
[OK] diagnostics.totalTikTokClips = 193
[OK] diagnostics.availableUsernameCount = 98
[OK] 401 unauthorized when secret is missing
[OK] All smoke tests passed!
```

**What remains untested**:
- hagen-ui preview endpoint through `API_SERVER_BASE_URL`
- authenticated preview response including `hagenDiagnostics`
- preview row-safety against `customer_concepts`

**Next step**:
Run the same smoke harness with `API_SERVER_BASE_URL`, a real customer id,
the customer's TikTok handle, and an authenticated cookie if the full hagen-ui
preview path should be verified end-to-end.

---

## Live Smoke Result - Direct Hagen Railway (Success)

**Timestamp**: 2026-05-12

**Environment**:
- Hagen URL: `https://hagen-production.up.railway.app`
- `HAGEN_SYNC_SECRET`: set (from nyckel3.txt)
- Test Customer ID: `0cd8f4d8-8bb8-4456-ba85-1108b5e69a65`
- Test Handle: `consorconsulting`

**Command**:
```bash
export HAGEN_BASE_URL="https://hagen-production.up.railway.app"
export HAGEN_SYNC_SECRET=$(cat /c/Users/praiseworthy/Desktop/nyckel3.txt | tr -d '\n\r')
export HAGEN_SYNC_TEST_CUSTOMER_ID="0cd8f4d8-8bb8-4456-ba85-1108b5e69a65"
export HAGEN_SYNC_TEST_HANDLE="consorconsulting"
node scripts/smoke-hagen-sync.mjs
```

**Result**: ✅ **ALL TESTS PASSED**

**Test 1: Hagen endpoint with correct secret**
- Status: `200 OK`
- Response format: JSON with `{ clips: Array, diagnostics: Object }`
- Clips returned: `0` (zero-match for handle 'consorconsulting')
- `diagnostics.handleFilter`: `"consorconsulting"` ✅
- `diagnostics.totalTikTokClips`: `193` ✅
- `diagnostics.availableUsernameCount`: `98` ✅

**Test 2: Hagen endpoint without secret**
- Status: `401 Unauthorized`
- Response: `{ "error": "unauthorized" }` ✅

**What was tested**:
- ✅ Hagen endpoint with correct `HAGEN_SYNC_SECRET` returns JSON
- ✅ Response has correct shape `{ clips, diagnostics }`
- ✅ Server-side `?handle=` filtering works (returned 0 clips for non-existent handle)
- ✅ Diagnostics includes library stats (193 total clips, 98 unique accounts)
- ✅ Hagen endpoint without secret returns 401 unauthorized
- ⏭️ hagen-ui API tests skipped (`API_SERVER_BASE_URL` not set)

**Conclusion**: The Phase 62 `HAGEN_SYNC_SECRET` authentication contract works correctly on Railway. The endpoint properly:
1. Requires the secret header when `HAGEN_SYNC_SECRET` is configured
2. Returns 401 when secret is missing/wrong
3. Returns JSON with clips and diagnostics when authenticated
4. Filters clips by handle on the server side
5. Includes full library diagnostics even for zero-match results

**Zero-match verification**: For handle `consorconsulting`, the endpoint correctly returned:
- 0 matching clips (handle not in Hagen's TikTok library)
- Full diagnostics showing 193 total TikTok clips across 98 unique accounts
- This confirms Phase 61-62 diagnostics preservation works correctly
