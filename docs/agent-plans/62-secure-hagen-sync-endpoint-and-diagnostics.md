# Phase 62 — Secure Hagen Sync Endpoint And Preserve Diagnostics

**Date**: 2026-05-12  
**Scope**: Add shared-secret auth to protect the Hagen library endpoint and preserve useful diagnostics after Phase 61's server-side handle filtering.

---

## Root Cause

Phase 61 made the Hagen library sync efficient with server-side `?handle=` filtering, but left two gaps:

### 1. No Authentication on Hagen Endpoint

The endpoint `/api/studio-v2/customers/:customerId/hagen-clips` was described as "internal" but had no auth mechanism. If the deployed Hagen app is publicly reachable:
- Anyone can fetch the full TikTok library by omitting `?handle=`
- Exposes video URLs, usernames, descriptions, stats from Hagen's `analyzed_videos` table
- **Risk**: Competitive intelligence leak, privacy violation if library contains unreleased/embargoed content

### 2. Diagnostics Degraded by Server-Side Filtering

Phase 61's server-side `?handle=` filter improved performance but broke the "available accounts" debug feature:
- **Before Phase 61**: hagen-ui received ALL library clips, resolved all usernames, showed them in preview when handle didn't match
- **After Phase 61**: Hagen only returns matching clips → hagen-ui sees empty `availableUsernames` even when library has clips for other handles
- **Impact**: CM can't diagnose "is this a handle mismatch or is Hagen's library empty?" without manual inspection

---

## Solution Overview

1. **Shared secret auth** between hagen-ui and Hagen using `HAGEN_SYNC_SECRET` env var and `x-hagen-sync-secret` header
2. **Enhanced diagnostics** from Hagen including `availableUsernames` array from full library (before filtering)
3. **Preview diagnostics passthrough** in hagen-ui so diagnostics reach the Studio UI
4. **Compact diagnostics display** in CustomerWorkspaceContent showing library size, account count, and unresolved username count

---

## Changes Made

### 1. Shared Secret Auth Contract

**Env var** (both hagen-ui and Hagen): `HAGEN_SYNC_SECRET`  
**Request header**: `x-hagen-sync-secret`

#### Hagen Endpoint Auth Logic

**File**: `hagen/src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`

**Added** (line ~72-96):
```typescript
// ── 1. Auth: Validate shared secret ───────────────────────────────────────
const hagenSyncSecret = process.env.HAGEN_SYNC_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !hagenSyncSecret) {
  return NextResponse.json(
    {
      error: 'hagen-sync-secret-not-configured',
      message: 'HAGEN_SYNC_SECRET is required in production',
    },
    { status: 500 }
  );
}

if (hagenSyncSecret) {
  const providedSecret = request.headers.get('x-hagen-sync-secret');
  if (providedSecret !== hagenSyncSecret) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        message: 'Missing or invalid Hagen sync secret',
      },
      { status: 401 }
    );
  }
}
```

**Rules**:
1. If `NODE_ENV === "production"` AND `HAGEN_SYNC_SECRET` is not set → 500 `hagen-sync-secret-not-configured`
2. If `HAGEN_SYNC_SECRET` is set AND header is missing/wrong → 401 `unauthorized`
3. If `HAGEN_SYNC_SECRET` is not set AND not production → allow request (local dev convenience)
4. Always return JSON (never HTML) for auth failures

#### hagen-ui Proxy Update

**File**: `artifacts/api-server/src/lib/upstream-proxy.ts`

**Added** (line ~91-103):
```typescript
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  [REQUEST_ID_HEADER]: requestId,
};

// Add shared secret header if configured
const hagenSyncSecret = process.env['HAGEN_SYNC_SECRET'];
if (hagenSyncSecret) {
  headers['x-hagen-sync-secret'] = hagenSyncSecret;
}

upstream = await fetch(url, {
  method,
  headers,
  // ...
});
```

**Rules**:
- Read `process.env.HAGEN_SYNC_SECRET`
- If set, add `x-hagen-sync-secret` header
- Do not log the secret
- Preserve existing headers and request ID behavior

**Local dev behavior**: If neither service has `HAGEN_SYNC_SECRET` set, auth is bypassed. If only one has it set, requests will fail with 401 (detected during deployment smoke testing).

---

### 2. Enhanced Hagen Diagnostics

**File**: `hagen/src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`

**Added** (line ~178-188):
```typescript
// Resolve all usernames from full library before filtering
const allResolvedUsernames = allClips
  .map((clip) => clip._resolvedUsername)
  .filter((u): u is string => u !== null);
const uniqueUsernames = [...new Set(allResolvedUsernames)].sort();

// Limit to first 50 to avoid huge responses
const MAX_USERNAMES = 50;
const availableUsernames = uniqueUsernames.slice(0, MAX_USERNAMES);
const availableUsernameCount = uniqueUsernames.length;
```

**Diagnostics contract**:
```json
{
  "clips": [ /* filtered by ?handle= if present */ ],
  "diagnostics": {
    "totalTikTokClips": 100,
    "returnedClips": 5,
    "unresolvedUsernameCount": 3,
    "handleFilter": "restaurangx",
    "availableUsernames": ["bar1", "cafe2", "restaurangx"],
    "availableUsernameCount": 3
  }
}
```

**Fields**:
- `totalTikTokClips` — total rows in `analyzed_videos` with `platform='tiktok'`
- `returnedClips` — clips returned after `?handle=` filtering (or all if no filter)
- `unresolvedUsernameCount` — clips where username could NOT be resolved from metadata OR URL
- `handleFilter` — the normalized handle filter applied, or `null`
- `availableUsernames` — first 50 unique resolved usernames from FULL library (before filtering), sorted
- `availableUsernameCount` — total unique usernames in full library (may be > 50 if truncated)

**Rationale for limit**: If Hagen's library has 1,000 unique TikTok creators, returning all 1,000 usernames in every sync request is wasteful. 50 usernames is sufficient for debugging "did I typo the handle?" while keeping response size reasonable. If `availableUsernameCount > 50`, the CM knows the list is truncated.

---

### 3. hagen-ui Preview Diagnostics Passthrough

**File**: `artifacts/api-server/src/routes/studio-v2.ts`

**Change 1**: Extract diagnostics from Hagen response (line ~993):
```typescript
// Extract diagnostics from Hagen response
const hagenDiagnostics = hagenResult.data['diagnostics'] as Record<string, unknown> | undefined;
```

**Change 2**: Prefer Hagen's `availableUsernames` over local resolution (line ~1000-1005):
```typescript
const availableUsernames =
  Array.isArray(hagenDiagnostics?.['availableUsernames'])
    ? (hagenDiagnostics['availableUsernames'] as string[])
    : [...new Set(allResolvedUsernames)].sort();
```

**Rationale**: When Phase 61 filters by `?handle=`, hagen-ui only receives matching clips. If zero clips match, `allResolvedUsernames` would be empty. By using Hagen's `availableUsernames` (computed from full library), the preview can still show "Tillgängliga konton: @bar1, @cafe2" even when the customer's handle doesn't match any.

**Change 3**: Include diagnostics in preview response (line ~1040):
```typescript
res.json({
  handle,
  totalMatched: matchedClips.length,
  wouldImport: newClips.length,
  wouldSkip: skippedCount,
  samples,
  availableUsernames: matchedClips.length === 0 ? availableUsernames : [],
  hagenDiagnostics: hagenDiagnostics ?? null,
});
```

**Import mode unchanged**: Diagnostics are NOT included in the import response (only preview). Import remains `{ imported, skipped }`.

---

### 4. Studio UI Diagnostics Display

**File**: `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

**Change 1**: Extend state type (line ~602-615):
```typescript
const [syncPreviewResult, setSyncPreviewResult] = useState<{
  handle: string;
  wouldImport: number;
  wouldSkip: number;
  totalMatched: number;
  samples: Array<{ tiktok_url: string; source_username: string | null; description: string | null }>;
  availableUsernames?: string[];
  hagenDiagnostics?: {
    totalTikTokClips?: number;
    returnedClips?: number;
    unresolvedUsernameCount?: number;
    handleFilter?: string | null;
    availableUsernames?: string[];
    availableUsernameCount?: number;
  } | null;
} | null>(null);
```

**Change 2**: Store diagnostics from API response (line ~2596):
```typescript
setSyncPreviewResult({
  handle: data.handle ?? '',
  wouldImport: data.wouldImport ?? 0,
  wouldSkip: data.wouldSkip ?? 0,
  totalMatched: data.totalMatched ?? 0,
  samples: data.samples ?? [],
  availableUsernames: data.availableUsernames,
  hagenDiagnostics: data.hagenDiagnostics ?? null,
});
```

**Change 3**: Render compact diagnostics line (line ~3785-3795):
```tsx
{syncPreviewResult.hagenDiagnostics && (
  <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(0,0,0,0.03)', borderRadius: 4, fontSize: 9, color: LeTrendColors.textMuted, fontFamily: 'monospace' }}>
    Hagen: {syncPreviewResult.hagenDiagnostics.totalTikTokClips ?? 0} TikTok-klipp totalt
    {typeof syncPreviewResult.hagenDiagnostics.availableUsernameCount === 'number' && (
      <>, {syncPreviewResult.hagenDiagnostics.availableUsernameCount} upplösta konton</>
    )}
    {typeof syncPreviewResult.hagenDiagnostics.unresolvedUsernameCount === 'number' && syncPreviewResult.hagenDiagnostics.unresolvedUsernameCount > 0 && (
      <>, {syncPreviewResult.hagenDiagnostics.unresolvedUsernameCount} klipp utan upplöst konto</>
    )}
  </div>
)}
```

**UI behavior**:
- Small monospace line below existing preview result
- Light gray background (`rgba(0,0,0,0.03)`) to visually separate from preview data
- Shows: total library size, resolved account count, unresolved clip count
- Only renders if `hagenDiagnostics` is present (backward compatible with Phase 61 responses)

**Example rendering**:
```
Hagen: 142 TikTok-klipp totalt, 18 upplösta konton, 3 klipp utan upplöst konto
```

**For zero-match previews**, the existing "Tillgängliga konton i hagen: @bar1, @cafe2" text uses Hagen's diagnostics (via the passthrough logic in studio-v2.ts), so CMs can see which handles ARE in the library when their customer's handle doesn't match.

---

## Production vs Local Dev Behavior

### Production Mode (`NODE_ENV === "production"`)

**Hagen**:
- `HAGEN_SYNC_SECRET` **REQUIRED** — returns 500 if not set
- `x-hagen-sync-secret` header **REQUIRED** — returns 401 if missing/wrong

**hagen-ui**:
- Should set `HAGEN_SYNC_SECRET` in env to match Hagen's secret
- Sends header automatically when calling Hagen

**Result**: Endpoint is protected. Unauthorized requests return JSON 401.

### Local Dev Mode (`NODE_ENV !== "production"`)

**Hagen**:
- If `HAGEN_SYNC_SECRET` is not set → allows all requests (no auth check)
- If `HAGEN_SYNC_SECRET` is set → requires matching header

**hagen-ui**:
- If `HAGEN_SYNC_SECRET` is not set → doesn't send header
- If `HAGEN_SYNC_SECRET` is set → sends header

**Result**: Devs can run local Hagen + hagen-ui without configuring secrets. If one service has the secret set and the other doesn't, requests fail with 401 (detected during smoke testing).

---

## Secret/Header Contract

| Service | Env Var | Header | Value |
|---|---|---|---|
| Hagen | `HAGEN_SYNC_SECRET` | Receives `x-hagen-sync-secret` | Arbitrary string (e.g., 64-char random token) |
| hagen-ui | `HAGEN_SYNC_SECRET` | Sends `x-hagen-sync-secret` | Must match Hagen's secret |

**Deployment checklist**:
1. Generate a secure random string (e.g., `openssl rand -hex 32`)
2. Set `HAGEN_SYNC_SECRET=<token>` in both services' env
3. Set `NODE_ENV=production` in Hagen
4. Restart both services
5. Run smoke tests (see Verification section)

---

## Files Changed

### Hagen Repo
| File | Change |
|---|---|
| `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts` | Added auth logic at start of GET handler (~25 lines). Checks `HAGEN_SYNC_SECRET` env and `x-hagen-sync-secret` header. Returns JSON 401/500 for auth/config failures. Added `availableUsernames` and `availableUsernameCount` to diagnostics object (~10 lines). Resolves usernames from full library before filtering. |

### hagen-ui Repo
| File | Change |
|---|---|
| `artifacts/api-server/src/lib/upstream-proxy.ts` | Updated `fetchHagenJson` to construct headers object and conditionally add `x-hagen-sync-secret` header when `HAGEN_SYNC_SECRET` env var is set (~10 lines). |
| `artifacts/api-server/src/routes/studio-v2.ts` | Extracted `hagenDiagnostics` from Hagen response. Prefer Hagen's `availableUsernames` over locally resolved usernames. Include `hagenDiagnostics` in preview response (~10 lines). |
| `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` | Extended `syncPreviewResult` state type with `hagenDiagnostics` field. Store diagnostics from API response. Render compact diagnostics line below preview samples (~25 lines). |

---

## Verification Results

### Typechecks
```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
cd hagen && npm run type-check                     → 0 errors ✅
```

### Smoke Tests

**Blocker**: Hagen not running locally. The following smoke tests should be run when Hagen is deployed:

#### Test 1: Hagen endpoint without secret (production mode)
```bash
# Set NODE_ENV=production and HAGEN_SYNC_SECRET in Hagen
# Don't send x-hagen-sync-secret header
curl -H "Accept: application/json" \
  "https://hagen-production.railway.app/api/studio-v2/customers/test/hagen-clips"

# Expected: 401 { "error": "unauthorized", "message": "Missing or invalid Hagen sync secret" }
```

#### Test 2: Hagen endpoint with wrong secret (production mode)
```bash
curl -H "Accept: application/json" \
  -H "x-hagen-sync-secret: wrong-secret" \
  "https://hagen-production.railway.app/api/studio-v2/customers/test/hagen-clips"

# Expected: 401 { "error": "unauthorized", "message": "Missing or invalid Hagen sync secret" }
```

#### Test 3: Hagen endpoint with correct secret (production mode)
```bash
curl -H "Accept: application/json" \
  -H "x-hagen-sync-secret: <correct-secret>" \
  "https://hagen-production.railway.app/api/studio-v2/customers/test/hagen-clips"

# Expected: 200 { "clips": [...], "diagnostics": { ... } }
# Verify: diagnostics includes availableUsernames array and availableUsernameCount
```

#### Test 4: Hagen endpoint in local dev without secret
```bash
# Unset HAGEN_SYNC_SECRET in local Hagen (or NODE_ENV != production)
curl -H "Accept: application/json" \
  "http://localhost:3000/api/studio-v2/customers/test/hagen-clips"

# Expected: 200 { "clips": [...], "diagnostics": { ... } }
# Auth bypassed for local dev convenience
```

#### Test 5: Hagen endpoint missing secret in production
```bash
# Set NODE_ENV=production but don't set HAGEN_SYNC_SECRET
curl -H "Accept: application/json" \
  "https://hagen-production.railway.app/api/studio-v2/customers/test/hagen-clips"

# Expected: 500 { "error": "hagen-sync-secret-not-configured", "message": "HAGEN_SYNC_SECRET is required in production" }
```

#### Test 6: hagen-ui preview with diagnostics
```bash
# hagen-ui and Hagen both have HAGEN_SYNC_SECRET set
# Authenticated CM user session
curl -X POST -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  "http://localhost:4000/api/studio-v2/customers/{real-customer-id}/sync-history?preview=true"

# Expected: 200
# {
#   "handle": "...",
#   "totalMatched": N,
#   "wouldImport": M,
#   "wouldSkip": K,
#   "samples": [...],
#   "availableUsernames": [...],
#   "hagenDiagnostics": {
#     "totalTikTokClips": 142,
#     "returnedClips": 5,
#     "unresolvedUsernameCount": 3,
#     "handleFilter": "restaurangx",
#     "availableUsernames": ["bar1", "cafe2", "restaurangx"],
#     "availableUsernameCount": 18
#   }
# }

# Verify: hagenDiagnostics is present and has expected shape
```

#### Test 7: Verify preview writes zero rows
After Test 6 (authenticated preview):

```sql
-- Check customer_concepts for this customer
SELECT COUNT(*) FROM customer_concepts 
WHERE customer_profile_id = '{real-customer-id}' 
  AND history_source = 'hagen_library';

-- Count should be SAME before and after preview
-- Preview must NOT insert any rows
```

#### Test 8: UI diagnostics rendering
After Test 6 (authenticated preview), in browser:
1. Navigate to Studio workspace for the test customer
2. Click "Förhandsgranska" (preview sync)
3. Verify the preview result shows a compact diagnostics line at bottom:
   ```
   Hagen: 142 TikTok-klipp totalt, 18 upplösta konton, 3 klipp utan upplöst konto
   ```
4. Verify the line uses monospace font, gray background, small font size
5. For zero-match preview, verify "Tillgängliga konton i hagen: @bar1, @cafe2" shows Hagen's full library usernames (not empty)

---

## Remaining Risks

1. **Secret rotation** — The shared secret is static. If the secret is leaked, it must be manually regenerated and updated in both services. **Mitigation**: Use env vars (not hardcoded). Rotate secret if suspected compromise. Consider adding secret versioning in a future phase (e.g., `x-hagen-sync-secret-v2` header).

2. **No rate limiting** — Even with auth, a malicious actor with the secret could spam the endpoint. **Mitigation**: Low priority — the endpoint is internal and only called by hagen-ui CM operations (manual, low volume). Railway may provide rate limiting at the platform level.

3. **Secret in logs** — The secret is NOT logged by `fetchHagenJson` or Hagen endpoint, but middleware/Railway logs may capture request headers. **Mitigation**: Verify Railway logs redact `x-hagen-sync-secret` header. If not, configure log redaction.

4. **availableUsernames truncation** — Only first 50 usernames are returned. If Hagen's library has 1,000 creators and the CM's handle is #900 alphabetically, it won't appear in the diagnostics list. **Mitigation**: The `availableUsernameCount` field shows total count. If CM sees "50 upplösta konton" but count is 1,000, they know the list is truncated. Future phase could add `?search=prefix` to Hagen diagnostics.

5. **Diagnostics not exposed for import** — The `hagenDiagnostics` object is only returned in preview mode, not import mode. **Impact**: Low — diagnostics are for debugging, not operational data. Import mode only needs `{ imported, skipped }`.

6. **No audit log for auth failures** — Hagen returns 401 for missing/wrong secret but doesn't log to a persistent audit trail. **Mitigation**: Railway application logs should capture 401 responses. For compliance, add structured audit logging in a future phase.

7. **Local dev confusion** — If dev sets `HAGEN_SYNC_SECRET` in one service but not the other, requests will fail with 401. **Mitigation**: Document the env var requirement in deployment guide and README. Smoke Test 4 verifies local dev works WITHOUT secrets.

---

## What Changed from Phase 61

Phase 61 made sync efficient with server-side filtering but:
- Had no endpoint protection
- Lost `availableUsernames` debug info when `?handle=` filtered the response

Phase 62 adds:
- **Auth**: Shared secret between hagen-ui and Hagen using `x-hagen-sync-secret` header
- **Diagnostics**: `availableUsernames` array from full library (before filtering)
- **UI**: Compact diagnostics line showing library size, account count, unresolved count
- **Production safety**: 500 if secret not configured in production, 401 if wrong/missing

**Security posture**: Hagen endpoint now requires auth in production. Unauthorized requests return JSON 401 (not HTML error pages).

**Debug posture**: CMs can see "Tillgängliga konton: @bar1, @cafe2" even when their customer's handle doesn't match, helping diagnose handle typos vs empty library.

---

## Next Steps (Optional Future Work)

1. **Run live smoke tests** — Deploy with `HAGEN_SYNC_SECRET` configured and execute Tests 1-8 above. Document exact results in this file.
2. **Secret rotation automation** — Add `/api/admin/rotate-hagen-secret` endpoint that generates a new secret, updates both services, and returns the new value for env var updates.
3. **Audit logging** — Log auth failures to a persistent audit table with timestamp, IP, user-agent for security monitoring.
4. **Rate limiting** — Add per-IP or per-secret rate limiting (e.g., 100 requests/minute) to prevent abuse even with valid secret.
5. **Diagnostics search** — Add `?availableUsernamesSearch=prefix` to Hagen endpoint to help CMs find specific handles when list is truncated.
6. **Header redaction** — Verify Railway logs redact `x-hagen-sync-secret` header. If not, configure log scrubbing.
7. **Secret versioning** — Support multiple secrets simultaneously (e.g., `x-hagen-sync-secret-v1`, `x-hagen-sync-secret-v2`) for zero-downtime secret rotation.

---

## Commit Message (Pending)

When ready to commit:

**Hagen repo**:
```
Add shared-secret auth and availableUsernames diagnostics

Protects /api/studio-v2/customers/:customerId/hagen-clips with
HAGEN_SYNC_SECRET env var and x-hagen-sync-secret header. Returns
401 if header missing/wrong, 500 if secret not configured in production.

Adds availableUsernames array to diagnostics showing all resolved
usernames from full library before handle filtering (max 50, with count).

Preserves debug info after Phase 61's server-side filtering so CMs
can diagnose handle mismatches vs empty library.

Phase 62 — Secure Hagen Sync Endpoint And Preserve Diagnostics

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**hagen-ui repo**:
```
Send sync secret header and surface Hagen diagnostics in UI

Updates fetchHagenJson to send x-hagen-sync-secret header when
HAGEN_SYNC_SECRET env var is set. Protects Hagen endpoint from
unauthorized access in production.

Passes hagenDiagnostics through preview response and renders compact
monospace line in Studio UI showing library size, account count, and
unresolved clip count.

Prefers Hagen's availableUsernames over local resolution so CM sees
all library accounts even when their customer's handle doesn't match.

Phase 62 — Secure Hagen Sync Endpoint And Preserve Diagnostics

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```
