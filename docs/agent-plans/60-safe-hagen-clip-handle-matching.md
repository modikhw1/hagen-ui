# Phase 60 — Safe Hagen Clip Handle Matching

**Date**: 2026-05-12  
**Scope**: Fix unsafe matching logic that allowed clips without source_username to import for any customer, regardless of actual TikTok handle ownership.

---

## Root Cause

Phase 59 aligned the contract between hagen-ui and Hagen, but left an unsafe matching rule in place (line 936-940 of `studio-v2.ts`):

```typescript
const matchedClips = allClipsWithUrl.filter(
  (c) =>
    !c.source_username ||
    c.source_username.replace(/^@/, '').toLowerCase() === handle.toLowerCase(),
);
```

The `!c.source_username ||` condition means **clips with no source_username are treated as matches for every customer**. This is dangerous:

- If Hagen's metadata parsing fails to extract a username, the clip becomes "universal" and matches all customers.
- A CM could preview/import TikTok clips for the wrong customer if Hagen's library contains clips without parsed usernames.
- No positive verification that the clip actually belongs to the customer's TikTok handle.

**Example unsafe scenario**:
1. Hagen library contains 100 TikTok clips from various creators
2. 20 clips have missing `metadata.author.uniqueId` / `metadata.username` → `source_username: null`
3. CM previews sync for customer with handle `"restaurangx"`
4. All 20 clips with `source_username: null` are treated as matches
5. CM imports unrelated TikTok history for the wrong customer

---

## Solution: Require Positive Handle Match

### 1. Added Reusable Helpers in hagen-ui

Created four helper functions in `studio-v2.ts` (before the sync-history POST route):

#### `normalizeTikTokHandle(value: unknown): string`
- Strips `@` prefix, lowercases, trims whitespace
- Returns empty string if input is not a non-empty string
- Used for both customer handles and clip usernames

#### `extractTikTokUsernameFromUrl(url: string): string | null`
- Parses TikTok URL to extract username
- Supports: `https://www.tiktok.com/@username/video/123`
- Returns `null` for:
  - Short URLs (`vm.tiktok.com`, `vt.tiktok.com`) — no username in path
  - Invalid URLs
  - Non-TikTok domains
- Uses regex: `/^\/@([^/]+)/` on pathname

#### `resolveClipUsername(clip): string | null`
- Checks `clip.source_username` first (normalized)
- Falls back to parsing `clip.tiktok_url` if `source_username` is missing
- Returns `null` if username cannot be resolved by either method

#### `clipMatchesHandle(clip, handle): boolean`
- Returns `true` only if resolved username matches normalized customer handle
- Returns `false` if username cannot be resolved or does not match

### 2. Updated Matching Logic

**Before** (line ~936):
```typescript
const matchedClips = allClipsWithUrl.filter(
  (c) =>
    !c.source_username ||
    c.source_username.replace(/^@/, '').toLowerCase() === handle.toLowerCase(),
);
```

**After** (line ~995):
```typescript
const matchedClips = allClipsWithUrl.filter((c) => clipMatchesHandle(c, handle));
```

Now:
- Clips WITHOUT a resolvable username are **rejected** (not matched)
- Clips are only matched when username can be positively verified via metadata OR URL parsing
- No "universal match" behavior for missing usernames

### 3. Updated availableUsernames

**Before**:
```typescript
const availableUsernames = [
  ...new Set(
    rawClips
      .map((c) => c.source_username)
      .filter((u): u is string => typeof u === 'string' && u.trim() !== ''),
  ),
];
```

**After**:
```typescript
const allResolvedUsernames = rawClips
  .map((c) => resolveClipUsername(c))
  .filter((u): u is string => u !== null);

const availableUsernames = [...new Set(allResolvedUsernames)].sort();
```

Now:
- Includes usernames from `source_username` (when present)
- **Also includes usernames parsed from TikTok URLs** (when `source_username` is missing)
- Deduplicated and sorted alphabetically
- More useful for debugging handle mismatches — CM sees all usernames in Hagen's library, not just those with metadata

### 4. Updated Hagen Endpoint with URL Fallback

Enhanced `hagen/src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts` to parse username from TikTok URL when metadata fields are missing.

**Before** (line ~66-78):
```typescript
let sourceUsername: string | null = null;
if (author?.uniqueId) {
  sourceUsername = author.uniqueId;
} else if (author?.username) {
  sourceUsername = author.username;
} else if (metadata?.username) {
  sourceUsername = metadata.username;
}
// Normalize: ensure no @ prefix
if (sourceUsername && sourceUsername.startsWith('@')) {
  sourceUsername = sourceUsername.slice(1);
}
```

**After** (line ~66-92):
```typescript
let sourceUsername: string | null = null;
if (author?.uniqueId) {
  sourceUsername = author.uniqueId;
} else if (author?.username) {
  sourceUsername = author.username;
} else if (metadata?.username) {
  sourceUsername = metadata.username;
} else {
  // Fallback: parse username from TikTok URL
  try {
    const url = new URL(video.video_url);
    if (url.hostname === 'www.tiktok.com' || url.hostname === 'tiktok.com') {
      const match = url.pathname.match(/^\/@([^/]+)/);
      if (match) {
        sourceUsername = match[1];
      }
    }
  } catch {
    // Invalid URL, leave sourceUsername as null
  }
}
// Normalize: ensure no @ prefix
if (sourceUsername && sourceUsername.startsWith('@')) {
  sourceUsername = sourceUsername.slice(1);
}
```

Now:
- If `metadata.author.uniqueId`, `metadata.author.username`, and `metadata.username` are all missing, Hagen parses the URL
- Provides `source_username` for more clips, reducing reliance on hagen-ui's client-side fallback
- Still safe: if URL is unparseable or is a short URL (`vm.tiktok.com`), `source_username` remains `null` and hagen-ui's `clipMatchesHandle` will reject it

---

## Exact Matching Rule After Fix

1. **Customer handle normalization**: Strip `@`, lowercase, trim → `"restaurangx"`
2. **Clip username resolution**:
   - **Path A**: Use `clip.source_username` if present (normalized)
   - **Path B**: Parse `clip.tiktok_url` if `source_username` is missing
   - **Path C**: Return `null` if both fail (unparseable URL, short URL, invalid format)
3. **Match decision**:
   - `resolvedUsername === normalizedCustomerHandle` → **match**
   - `resolvedUsername === null` → **no match** (rejected)
   - `resolvedUsername !== normalizedCustomerHandle` → **no match**

### Edge Cases Verified (Code-Level)

| Scenario | Result |
|---|---|
| Customer handle `@customer`, clip `source_username: "customer"` | ✅ Match (both normalize to `"customer"`) |
| Customer handle `customer`, clip `source_username: "@customer"` | ✅ Match (both normalize to `"customer"`) |
| Customer handle `customer`, clip `source_username: null`, URL `https://www.tiktok.com/@customer/video/123` | ✅ Match (URL parsed → `"customer"`) |
| Customer handle `customer`, clip `source_username: null`, URL `https://www.tiktok.com/@otheruser/video/123` | ❌ No match (URL parsed → `"otheruser"`) |
| Customer handle `customer`, clip `source_username: null`, URL `https://vm.tiktok.com/abc123` | ❌ No match (short URL unparseable, resolved → `null`) |
| Customer handle `customer`, clip `source_username: null`, URL `invalid-url` | ❌ No match (URL parsing fails, resolved → `null`) |

### availableUsernames Behavior

- Before: only included clips with non-null `source_username`
- After: includes clips with `source_username` OR parseable TikTok URL
- Sorted alphabetically for easier debugging
- Shown in preview response when `totalMatched === 0` to help CM diagnose handle mismatches

---

## Files Changed

### hagen-ui Repo
| File | Change |
|---|---|
| `artifacts/api-server/src/routes/studio-v2.ts` | Added 4 helper functions (`normalizeTikTokHandle`, `extractTikTokUsernameFromUrl`, `resolveClipUsername`, `clipMatchesHandle`) before sync-history POST route (~60 lines). Replaced unsafe matching logic with `clipMatchesHandle` filter. Updated `availableUsernames` to include URL-parsed usernames and sort results. |

### Hagen Repo
| File | Change |
|---|---|
| `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts` | Added URL fallback for `source_username` extraction when metadata fields are missing. Parses `/@username/` from `video.video_url` before returning `null`. (~15 lines added in else branch) |

---

## Verification Results

### Typechecks
```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
cd hagen && npm run type-check                     → 0 errors ✅
```

### Unit Tests
No existing test suite for `studio-v2.ts` routes. Manual verification performed via code inspection of helper functions:

#### Test: `normalizeTikTokHandle`
```typescript
normalizeTikTokHandle('@Customer')  → 'customer'
normalizeTikTokHandle('customer')   → 'customer'
normalizeTikTokHandle('  @User  ')  → 'user'
normalizeTikTokHandle(null)         → ''
normalizeTikTokHandle(123)          → ''
```

#### Test: `extractTikTokUsernameFromUrl`
```typescript
extractTikTokUsernameFromUrl('https://www.tiktok.com/@username/video/123')
  → 'username'
extractTikTokUsernameFromUrl('https://www.tiktok.com/@User123/video/456')
  → 'user123' (lowercased)
extractTikTokUsernameFromUrl('https://vm.tiktok.com/abc123')
  → null (short URL, no username in path)
extractTikTokUsernameFromUrl('https://youtube.com/@someone')
  → null (wrong domain)
extractTikTokUsernameFromUrl('invalid-url')
  → null (parse error)
```

#### Test: `resolveClipUsername`
```typescript
resolveClipUsername({ source_username: 'user', tiktok_url: 'https://...' })
  → 'user' (prefers source_username)
resolveClipUsername({ source_username: null, tiktok_url: 'https://www.tiktok.com/@parsed/video/1' })
  → 'parsed' (fallback to URL)
resolveClipUsername({ source_username: null, tiktok_url: 'https://vm.tiktok.com/xyz' })
  → null (short URL unparseable)
resolveClipUsername({ source_username: null, tiktok_url: null })
  → null (no data)
```

#### Test: `clipMatchesHandle`
```typescript
clipMatchesHandle({ source_username: 'User' }, 'user')
  → true (case-insensitive match)
clipMatchesHandle({ source_username: '@customer' }, 'customer')
  → true (@ stripped)
clipMatchesHandle({ source_username: null, tiktok_url: 'https://www.tiktok.com/@match/video/1' }, 'match')
  → true (URL fallback)
clipMatchesHandle({ source_username: null, tiktok_url: 'https://www.tiktok.com/@other/video/1' }, 'customer')
  → false (no match)
clipMatchesHandle({ source_username: null, tiktok_url: 'https://vm.tiktok.com/xyz' }, 'customer')
  → false (unparseable, resolves to null)
```

### Live Smoke Test Expectations

**Not performed in this phase** — Hagen is not running locally. When tested:

1. **Customer with handle `@restaurangx`**, Hagen library contains:
   - Clip A: `source_username: "restaurangx"` → ✅ should match
   - Clip B: `source_username: "@RestaurangX"` (case variation) → ✅ should match
   - Clip C: `source_username: null`, URL `https://www.tiktok.com/@restaurangx/video/123` → ✅ should match
   - Clip D: `source_username: null`, URL `https://www.tiktok.com/@otheruser/video/456` → ❌ should NOT match
   - Clip E: `source_username: null`, URL `https://vm.tiktok.com/short` → ❌ should NOT match

2. **Preview response** should show:
   - `totalMatched: 3` (A, B, C)
   - `wouldImport: N` (depends on existing `customer_concepts`)
   - `availableUsernames: ["otheruser", "restaurangx"]` (sorted, includes URL-parsed username from clip D)

3. **Import mode** should insert only clips A, B, C (deduplicated against existing rows)

---

## Remaining Risks

1. **Short URL expansion not implemented** — TikTok short URLs like `https://vm.tiktok.com/xyz` do NOT contain the username in the path. The current implementation returns `null` for short URLs, so these clips will NOT match any customer. **Mitigation**: Short URLs are rare in Hagen's library (most ingestion uses full TikTok URLs). If needed, a future phase could implement short-URL expansion (HTTP redirect follow to resolve full URL), but this adds latency and external dependency risk.

2. **URL parsing assumes standard TikTok URL format** — The regex `/^\/@([^/]+)/` assumes TikTok URLs follow the pattern `https://www.tiktok.com/@username/video/123`. If TikTok changes URL structure (e.g., removes `@` prefix, uses `/u/username/`, or introduces new video page formats), parsing may fail. **Mitigation**: TikTok has used this URL format consistently for years. If format changes, the fallback fails gracefully (returns `null`), and clips without `source_username` simply won't match — no wrong-customer import risk.

3. **Hagen URL fallback may parse incorrect username if URL is malformed** — If Hagen stores a corrupted TikTok URL like `https://www.tiktok.com/@user1/@user2/video/123`, the regex will extract `user1` (first match). **Mitigation**: Hagen's URL ingestion should validate TikTok URLs at write time. This is a data-quality issue, not a matching-logic issue. The risk is low since Hagen URLs come from TikTok API/scraper responses.

4. **Case sensitivity in TikTok usernames** — The matching logic lowercases both the customer handle and resolved username. TikTok usernames are case-insensitive for login/matching purposes, so this is correct. However, if a customer's `tiktok_handle` in the DB has a different case than their actual TikTok username, the logic still works (both are lowercased). **No risk** — correct behavior.

5. **No sync_runs tracking** — Same as Phase 58/59 — hagen-library imports are not tracked in `sync_runs` or `cron_run_log`. **Risk**: Low — manual, low-volume operations.

6. **No feed_motor_signals nudge** — Same as Phase 58/59 — no workspace banner after import. **Risk**: Low — CM is viewing the workspace and sees new rows immediately.

---

## What Changed from Phase 59

Phase 59 left this unsafe logic:
```typescript
!c.source_username || c.source_username.replace(...) === handle
```

Phase 60 replaced it with:
```typescript
clipMatchesHandle(c, handle)
```

Where `clipMatchesHandle` requires a **positive match** via:
1. `source_username` (when present), OR
2. Parsed username from `tiktok_url` (when `source_username` is missing)

Clips with no resolvable username are now **rejected**, not universally matched.

---

## Next Steps (Optional Future Work)

1. **Add unit tests** — Create test suite for `normalizeTikTokHandle`, `extractTikTokUsernameFromUrl`, `resolveClipUsername`, `clipMatchesHandle` in `artifacts/api-server/src/routes/studio-v2.test.ts`.
2. **Short URL expansion** — Implement HTTP redirect follow for `vm.tiktok.com` / `vt.tiktok.com` URLs to resolve full TikTok URL before parsing username. (Low priority — short URLs are rare.)
3. **Server-side handle filtering** — Add `?handle=username` query param to Hagen endpoint to reduce response payload size when Hagen library grows large. hagen-ui would pass `?handle=${customer.tiktok_handle}` when fetching clips. Even with server-side filtering, hagen-ui must still validate matches (defense in depth).
4. **Monitoring/alerting** — Track "clips with unresolved usernames" metric in Hagen ingestion pipeline to detect metadata parsing failures.

---

## Commit Message (Pending)

When ready to commit:

**hagen-ui repo**:
```
Require positive handle match for Hagen library sync

Adds 4 helper functions (normalizeTikTokHandle, extractTikTokUsernameFromUrl,
resolveClipUsername, clipMatchesHandle) to safely match clips to customers.

Replaces unsafe "!c.source_username ||" logic that treated clips without
usernames as universal matches. Now rejects clips where username cannot be
positively resolved via metadata or URL parsing.

Updates availableUsernames to include URL-parsed usernames and sort results
for better CM debugging when handle mismatches occur.

Phase 60 — Safe Hagen Clip Handle Matching

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Hagen repo**:
```
Add URL fallback for TikTok username extraction

When metadata.author.uniqueId, metadata.author.username, and
metadata.username are all missing, parse username from video_url
before returning null.

Reduces clips with unresolved usernames, making hagen-ui matching
more reliable. Falls back gracefully for short URLs (vm.tiktok.com)
where username is not present in path.

Phase 60 — Safe Hagen Clip Handle Matching

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```
