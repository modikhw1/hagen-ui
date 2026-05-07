# Phase 57 — TikTok History Sync Control Flow Audit

**Date**: 2026-05-07  
**Scope**: Full entrypoint audit of all TikTok history sync paths; no live RapidAPI calls made.

---

## 1. Entrypoint Matrix

| # | Entrypoint | Route / function | Fire-and-forget? | Auth | Blocking? |
|---|---|---|---|---|---|
| E1 | Admin: create customer | `POST /api/admin/customers/create` → `triggerInitialTikTokSyncBackground` | ✅ F&F | `admin` role | Non-blocking (returns immediately after insert; sync runs in background) |
| E2 | Admin: PATCH customer (handle change) | `PATCH /api/admin/customers/:id` → `triggerInitialTikTokSyncBackground` | ✅ F&F | `admin` role | Non-blocking |
| E3 | Studio-v2: PATCH customer (handle change) | `PATCH /api/studio-v2/customers/:customerId` → `triggerInitialTikTokSyncBackground` | ✅ F&F | `admin` or `content_manager` | Non-blocking |
| E4 | Studio UI: auto-fetch on first open | `POST /api/studio-v2/customers/:customerId/fetch-profile-history` (no body) | ❌ Awaited | `admin` or `content_manager` | Request-blocking — CM waits for RapidAPI round-trip |
| E5 | Studio UI: manual "Hämta historik" | `POST /api/studio-v2/customers/:customerId/fetch-profile-history` `{ count: 10 }` | ❌ Awaited | `admin` or `content_manager` | Request-blocking |
| E6 | Studio UI: "Ladda äldre historik" | `POST /api/studio-v2/customers/:customerId/fetch-profile-history` `{ count, cursor }` | ❌ Awaited | `admin` or `content_manager` | Request-blocking, cursor pagination |
| E7 | Studio UI: "Synca från hagen" | `POST /api/studio-v2/customers/:customerId/sync-history` | ⚠️ **ROUTE MISSING** | would-be CM | **404 at runtime** |
| E8 | Studio UI: "Förhandsgranska" | `POST /api/studio-v2/customers/:customerId/sync-history?preview=true` | ⚠️ **ROUTE MISSING** | would-be CM | **404 at runtime** |
| E9 | Cron batch (GitHub Actions) | `POST /api/studio-v2/internal/sync-history-all` Bearer `CRON_SECRET` | ❌ Awaited | CRON_SECRET token | Request-blocking, sequentially processes all eligible customers |
| E10 | Admin: manual run-now | `POST /api/admin/cron-runs/run-now` `{ maxCustomers?, dryRun? }` | ❌ Awaited | `admin` role | Request-blocking |
| E11 | Admin: dry-run preview | `POST /api/admin/cron-runs/run-now` `{ dryRun: true }` | ❌ Awaited | `admin` role | No RapidAPI — eligibility only |
| E12 | Admin: thumbnail refresh | `POST /api/studio-v2/internal/refresh-reconciled-thumbnails` Bearer `CRON_SECRET` | ❌ Awaited | CRON_SECRET token | No RapidAPI |
| E13 | Legacy client-side (dead) | `artifacts/letrend/src/lib/tiktok/trigger-initial-sync.ts` | N/A | N/A | **Dead — `@ts-nocheck`, imports `server-only`, references `import.meta.env.VITE_RAPIDAPI_KEY` and `@/lib/server/supabase-admin` which don't exist client-side** |

---

## 2. Data Flow: tiktok_handle → imported_history rows

```
tiktok_handle (customer_profiles)
    │
    ├─ triggerInitialTikTokSyncBackground() [E1/E2/E3]
    │       └─ syncCustomerHistory(..., { mode:'manual', pages:5, pageSize:50 })
    │
    ├─ POST /fetch-profile-history [E4/E5/E6]
    │       └─ syncCustomerHistory(..., { mode:'manual', pages:1-10, pageSize:1-50 })
    │
    └─ runHistorySyncBatch() [E9/E10]
            └─ syncCustomerHistory(..., { mode:'cron' }) per eligible customer

syncCustomerHistory():
  1. customer_profiles.operation_lock_until (distributed lock, 5min + heartbeat)
  2. sync_runs INSERT (status='running')
  3. fetchProviderUser → customer_profiles.tiktok_profile_pic_url
  4. fetchProviderVideos (RapidAPI tiktok-scraper7, /user/posts)
  5. customer_concepts SELECT (existing by tiktok_url)
  6. customer_concepts UPDATE (stats on existing rows)
  7. customer_concepts INSERT new rows:
        concept_id = null
        status = 'history_import'
        row_kind = 'history_import'
        history_source = 'tiktok_profile'
        feed_order = null
  8. tiktok_videos + tiktok_stats (write synced clips for drift tab)
  9. Auto-reconcile: if exactly 1 new clip → link to nu-slot concept
        reconciled_customer_concept_id = assignment_row.id
 10. feed_motor_signals INSERT/UPDATE (nudge for CM review)
 11. customer_profiles.last_history_sync_at = now
 12. sync_runs UPDATE (status='ok' or 'error', fetched/imported counts)
 13. operation_lock_until = null (lock released in finally)
```

---

## 3. DB Fields Updated Per Sync

| Table | Fields written |
|---|---|
| `customer_profiles` | `tiktok_profile_pic_url`, `last_history_sync_at`, `operation_lock_until` |
| `customer_concepts` | INSERT: `customer_profile_id`, `status`, `row_kind`, `history_source`, `tiktok_url`, `tiktok_thumbnail_url`, `tiktok_views`, `tiktok_likes`, `tiktok_comments`, `published_at`, `description`, `provider_video_id`, `tiktok_last_synced_at`, `last_observed_at`; UPDATE: stats fields + `reconciled_customer_concept_id` |
| `sync_runs` | `customer_id`, `mode`, `started_at`, `status`, `fetched`, `imported`, `stats_updated`, `calls_used`, `pages`, `has_more`, `error_message`, `finished_at` |
| `cron_run_log` | aggregate batch row per cron invocation |
| `feed_motor_signals` | `customer_id`, `signal_type='nudge'`, `payload` (imported_count, kind, auto_reconciled) |
| `tiktok_videos` | per-video rows (read by drift tab) |
| `tiktok_stats` | stats snapshots (read by drift tab) |

---

## 4. Status/Error Visibility Per Actor

### Admin
| Path | Visibility |
|---|---|
| Background initial sync (E1/E2/E3) | **None** — fire-and-forget, no response field, no UI feedback. Admin sees result indirectly via `customer.last_history_sync_at` after page refresh. |
| Cron batch (E9) | `GET /api/admin/cron-runs` → `cron_run_log` + `sync_runs` + `fallback_cron_sync_runs`. Cron-health UI shows per-run status with error counts. |
| Manual run-now (E10/E11) | Inline BatchResult JSON in admin cron-health UI (`cronLogWritten`, `imported`, `errors[]`). |
| Dry-run preview (E11) | `eligibleCustomers[]` + `skippedCustomers[]` shown in UI. |
| Thumbnail refresh (E12) | Response JSON only (no persistent UI). |

### CM / Studio
| Path | Visibility |
|---|---|
| Auto-fetch on first open (E4) | `fetchingProfileHistory` spinner: button text "Hämtar TikTok-historik...". On success: "N nya klipp importerade" or "Historik är uppdaterad". On error: red error text below button. |
| Manual "Hämta historik" (E5) | Same as E4. |
| "Ladda äldre historik" (E6) | Same spinner + result text. |
| "Synca från hagen" (E7) | ⚠️ **Broken** — calls non-existent POST route. `syncHistoryError` state would show error text but the error message would be "Synk misslyckades" (generic catch). |
| "Förhandsgranska" (E8) | ⚠️ **Broken** — same non-existent route. |
| Cron-triggered sync (E9) | **None** — only visible via `last_history_sync_at` date shown below the button. |
| `sync_runs` per-customer log | `GET /api/studio-v2/customers/:id/sync-history` (reads `tiktok_sync_history` view) — data exists but no UI surface for CM to see it in the workspace. |

---

## 5. Missing Routes (Critical Gaps)

### E7: `POST /api/studio-v2/customers/:customerId/sync-history`

The "Synca från hagen" button (hagen-library import path, distinct from RapidAPI direct fetch) calls this endpoint. It does **not exist** in studio-v2.ts. Express returns `Cannot POST /api/studio-v2/customers/:id/sync-history`.

Only a GET exists at that path (reading `tiktok_sync_history` view).

### E8: `POST /api/studio-v2/customers/:customerId/sync-history?preview=true`

Same missing route, called by "Förhandsgranska". The UI handler `handlePreviewSync` expects fields `{ handle, wouldImport, wouldSkip, totalMatched, samples }` — none of which can be returned by the GET endpoint.

**Impact**: Both buttons always fail silently (error text shown in Swedish as "Förhandsvisning misslyckades" / "Synk misslyckades"). No clips are imported via this path.

---

## 6. All Identified Gaps

| # | Gap | Severity | Details |
|---|---|---|---|
| G1 | E7/E8: POST sync-history route missing | HIGH | "Synca från hagen" + "Förhandsgranska" broken. Hagen-library import path completely non-functional. |
| G2 | E1/E2/E3: No UI feedback for background initial sync | MEDIUM | Admin creates/updates customer → sync starts silently. No status indicator. If RAPIDAPI_KEY missing → silent skip (only server WARN log). If sync fails → only server error log. Admin must refresh and check `last_history_sync_at` to confirm. |
| G3 | Double-sync possible on rapid create/invite | MEDIUM | E1 fires on create when TikTok handle present. E2 fires on PATCH. If admin creates then immediately patches handle, two background syncs can race. Lock (`operation_lock_until`) prevents DB corruption (second call returns `already_locked`) but the error is only in server logs — no admin visibility. |
| G4 | Legacy dead code: `trigger-initial-sync.ts` | LOW | File is `@ts-nocheck`, imports `server-only` (no-op stub in Vite), uses `VITE_RAPIDAPI_KEY` (never set — RapidAPI key is server-only `RAPIDAPI_KEY`), imports `@/lib/server/supabase-admin` (does not exist in Vite). This file cannot execute and should be deleted. |
| G5 | CM has no view of sync_runs per customer | LOW | `GET /api/studio-v2/customers/:id/sync-history` exists and returns `tiktok_sync_history` rows, but no UI surface in customer workspace shows this data. CM cannot tell why or when last sync ran. |
| G6 | Error from initial sync not visible in admin create response | LOW | `POST /api/admin/customers/create` returns `{ customer, inviteSent }` but no `syncStarted` or `syncStatus` field. Even if RAPIDAPI_KEY is missing the response is 201 OK — admin has no hint. |
| G7 | Auto-reconcile too narrow | LOW | Only triggers when exactly 1 new clip in a single sync page. Multiple-clip publishes, multi-page spreads, or date-matched reconciliation all require manual CM action. (Tracked in doc 04.) |

---

## 7. Live / Dry-run Options

| Operation | Dry-run available? |
|---|---|
| Cron batch | ✅ `POST /api/admin/cron-runs/run-now` `{ dryRun: true }` — returns eligibility with no API calls |
| Single-customer manual fetch | ❌ No dry-run path. Any call to `fetch-profile-history` makes live RapidAPI calls. |
| Initial background sync | ❌ No way to preview which customers would trigger or what would be fetched. |
| Hagen-library sync (E7/E8) | ❌ Routes do not exist. "Förhandsgranska" was intended as a dry-run but calls a missing endpoint. |

---

## 8. Risk Summary

| Risk | Likelihood | Impact |
|---|---|---|
| CM clicks "Synca från hagen" and gets silent failure | Certain (route missing) | Medium — no data imported, confusing UX |
| Admin creates customer with TikTok handle, sync fails (wrong key/network), nobody notices | Possible | Medium — customer never gets history, cron fills in later |
| Two concurrent syncs for same customer on rapid PATCH sequences | Low (lock prevents DB corruption) | Low — second sync is skipped, no data loss |
| Legacy trigger-initial-sync.ts executed somehow | Not possible (dead imports) | N/A — dead code only |
| Budget overrun on manual fetch: CM clicks "Hämta historik" many times | Low (staleness guard on cron; no guard on manual) | Medium — each click costs RapidAPI calls |

---

## 9. Recommended Phase 58

### Option A (recommended): Fix the missing hagen-library sync routes

**Scope**: Small, verifiable, directly unblocks CM workflow.

1. Implement `POST /api/studio-v2/customers/:customerId/sync-history` in studio-v2.ts.
   - Reads hagen-library clips for the customer's `tiktok_handle` via the existing `hagen-clips` proxy path.
   - Compares against existing `customer_concepts` rows for this customer.
   - Inserts new rows as `history_import` (same schema as E4/E5 path).
   - Returns `{ imported, skipped }`.
2. Implement `POST /api/studio-v2/customers/:customerId/sync-history?preview=true`.
   - Same as above but returns `{ handle, wouldImport, wouldSkip, totalMatched, samples[] }` without writing.
3. Delete dead `artifacts/letrend/src/lib/tiktok/trigger-initial-sync.ts`.
4. Optionally: add `syncStarted: boolean` to `POST /api/admin/customers/create` response (G6 fix).

**Verifiable**: POST sync-history returns `{ imported, skipped }` with a real customer. Preview returns samples without DB write. Typecheck passes.

### Option B: TikTok sync status panel in customer workspace

**Scope**: Medium — UI-only, reads from existing `GET /sync-history`.

Add a collapsible status panel to the TikTok history section in CustomerWorkspaceContent showing the last N sync_runs rows (time, mode, fetched/imported, error). Requires no backend changes. Addresses G5.

### Option C: Admin customer create sync status feedback (G6)

**Scope**: Tiny — add `syncStarted: boolean` field to `POST /create` response. Requires no frontend changes.

---

## 10. Typecheck Status

```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✅
pnpm --filter @workspace/letrend run typecheck     → 0 errors ✅
```

No code changes were made in this phase — audit only.
