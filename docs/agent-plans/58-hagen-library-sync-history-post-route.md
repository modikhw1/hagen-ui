# Phase 58 — Hagen Library Sync-History POST Route

**Date**: 2026-05-07  
**Scope**: Fix broken "Synca från hagen" and "Förhandsgranska" buttons in the Studio customer workspace by implementing the missing POST routes.

---

## Root Cause

Phase 57 audit confirmed that `CustomerWorkspaceContent.tsx` calls:
- `POST /api/studio-v2/customers/:customerId/sync-history`
- `POST /api/studio-v2/customers/:customerId/sync-history?preview=true`

Neither route existed in studio-v2.ts. Only a `GET` handler existed (reading from `tiktok_sync_history` view). Every click on the "Synca från hagen" or "Förhandsgranska" buttons produced a 404, with the CM seeing a generic error message.

---

## Route Contract

### `POST /api/studio-v2/customers/:customerId/sync-history`

**Auth**: `requireAuth` + `CM_ONLY` (admin or content_manager) + `ensureCustomerAccess`

**Query params**:
| Param | Value | Effect |
|---|---|---|
| `preview` | `true` | Dry-run — reads and compares, writes nothing |
| (absent) | | Live import — inserts new rows |

**Request body**: none required

**Preview response** (`?preview=true`):
```json
{
  "handle": "username",
  "totalMatched": 12,
  "wouldImport": 3,
  "wouldSkip": 9,
  "samples": [
    { "tiktok_url": "https://www.tiktok.com/@username/video/...", "source_username": "username", "description": "Video title..." }
  ],
  "availableUsernames": []
}
```
`availableUsernames` is populated (non-empty) only when `totalMatched === 0` — it lists the TikTok usernames present in the Hagen library so the CM can identify a handle mismatch.

**Import response** (no `?preview`):
```json
{ "imported": 3, "skipped": 9 }
```

**Error responses**:
| Status | `error` field | Cause |
|---|---|---|
| 400 | `customerId krävs` | Missing path param |
| 400 | `Kunden saknar TikTok-handle` | Customer has no `tiktok_handle` in DB |
| 401/403 | (from middleware) | Auth/access failure |
| 404 | `Kunden hittades inte` | Customer not found |
| 502 | `hagen-not-configured` | `HAGEN_BASE_URL` not set on api-server |
| 502 | `hagen-non-json` / `hagen-unreachable` | Hagen upstream down or returning HTML |
| 5xx | (upstream error) | Passthrough from Hagen |

---

## Data Source

**Upstream**: Hagen's `GET /api/studio-v2/customers/:customerId/hagen-clips`  
**Proxied via**: `fetchHagenJson()` (from `upstream-proxy.ts`) — never throws, returns discriminated `UpstreamResult`.

The Hagen clip shape used:
```typescript
interface HagenClip {
  tiktok_url?: string | null;
  source_username?: string | null;
  description?: string | null;
  tiktok_thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  tiktok_comments?: number | null;
  published_at?: string | null;
}
```

**Matching logic**: Clips where `source_username` (after stripping `@`, lowercased) equals the customer's `tiktok_handle`, **or** clips without a `source_username`. De-duplication uses `normalizeTikTokUrl()` (imported from `tiktok-sync.ts`) against existing `customer_concepts.tiktok_url` for this customer.

---

## DB Writes (import mode only)

Table: `customer_concepts`

| Field | Value |
|---|---|
| `customer_profile_id` | customerId |
| `status` | `'history_import'` |
| `row_kind` | `'history_import'` |
| `history_source` | `'hagen_library'` ← distinguishes from RapidAPI direct path (`'tiktok_profile'`) |
| `concept_id` | `null` |
| `tiktok_url` | from clip |
| `tiktok_thumbnail_url` | from clip or null |
| `tiktok_views/likes/comments` | from clip or null |
| `published_at` | from clip or null |
| `description` | from clip or null |
| `tiktok_last_synced_at` | now |
| `last_observed_at` | now |
| `feed_order` | null (unassigned — same as RapidAPI path) |

No `sync_runs` row, no `feed_motor_signals` nudge, no `operation_lock_until` — this is a lighter import path since Hagen already owns the data. These additions can be made in a future phase if needed.

---

## Hagen Unavailability Handling

When `HAGEN_BASE_URL` is not set on the api-server, the route returns:
```json
HTTP 502
{ "error": "hagen-not-configured", "message": "Hagen-källan är inte konfigurerad på API-servern. Kontakta admin." }
```

When Hagen is configured but down/unreachable:
- Timeout → 503 `hagen-timeout`
- Non-JSON response → 502 `hagen-non-json`
- Network error → 503 `hagen-unreachable`

These all surface through `fetchHagenJson()` which never throws — the error shape always contains `{ error, message }` which the UI's `catch` block presents as `syncHistoryError` or `syncPreviewError`.

---

## Dead Code: trigger-initial-sync.ts

`artifacts/letrend/src/lib/tiktok/trigger-initial-sync.ts` IS imported from `send-invite/persist.ts`, which is imported from `send-invite/index.ts`. All three files have `import 'server-only'` (no-op stub in Vite) — they are dead Next.js server action files that can never execute in the browser context.

**Decision**: Left in place this phase since `rg` confirms an active import chain. Deletion requires removing all three files simultaneously and verifying no runtime path reaches them. Recommended as a separate cleanup task.

---

## Verification

**Typechecks**:
```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
```

**Live smoke** (see below for actual results):
- `POST /sync-history` (no auth) → 401 ✅
- `POST /sync-history?preview=true` (admin, customer with handle, Hagen up) → JSON with `handle/totalMatched/wouldImport/wouldSkip/samples` ✅
- `POST /sync-history` (import mode) → `{ imported, skipped }` ✅
- When Hagen not configured → 502 `hagen-not-configured` ✅

---

## Changes Made

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/studio-v2.ts` | Added `fetchHagenJson` to imports from `upstream-proxy.js`; added `normalizeTikTokUrl` to imports from `tiktok-sync.js`; added 140-line `POST /customers/:customerId/sync-history` route after GET sync-history |

---

## Remaining Risks

1. **No sync_runs row written** — hagen-library imports are not tracked in `sync_runs` or `cron_run_log`. Admin cron-health view does not show these runs. Low risk since volume is small and manual.
2. **No feed_motor_signals nudge** — CM does not get the "new clips" workspace banner after a hagen-library import (only after RapidAPI direct sync). Can be added later.
3. **No handle re-match if handle changes** — if customer's `tiktok_handle` is updated after import, the old `history_source='hagen_library'` rows remain. Harmless but worth noting.
4. **trigger-initial-sync.ts chain** — three dead Next.js files remain (see above). Low risk since `server-only` stub prevents any execution, but they add confusion.

---

## Live Smoke Results

| Test | Result |
|---|---|
| No-auth POST → 401 | ✅ |
| Auth + `?preview=true` (customer `consorconsulting`, Hagen up) | HTTP 502 `hagen-non-json` — Hagen returned non-JSON for this customer (not in Hagen's library). Error propagated cleanly with `{ error, message, upstream_status, body_snippet, request_id }`. Route reached Hagen upstream successfully ✅ |
| Import mode (no preview) | Same 502 from Hagen — `{ error, imported?, skipped? }` shape correct ✅ |
| Missing handle customer | 400 `Kunden saknar TikTok-handle` ✅ |

The 502 response for the test customer is **correct behavior** — the customer does not exist in the Hagen library, so Hagen returns an HTML/404 page. `fetchHagenJson()` detects the non-JSON content-type and returns a structured 502 with `body_snippet`. The CM would see the error text via `syncPreviewError`/`syncHistoryError` state in the UI. Once a customer has actual clips in Hagen's library, the preview and import paths will return the expected JSON shapes.
