# Hagen ↔ LeTrend Ingestion Audit — Full Pipeline Review

**Task #74 audit (2026-05-04) + Task #116 deep-audit (2026-05-06)**

---

## Task #116 — Three-Flow Deep Audit (2026-05-06)

**Scope:** Read-only static analysis covering three flows: (A) video/concept cascade, (B) customer invite/create + TikTok ingest, (C) TikTok sync / feed planner / reconcile.  
**Method:** Full file reads of all routers and library files; parallel explore-subagent traces of each flow; grep sweeps for all cross-cutting concerns. No code changes in this pass.  
**Legend:** 🔴 HIGH · 🟡 MEDIUM · 🟢 LOW · 📋 STATIC (confirmed by code alone) · 🔍 LIVE (requires live DB to fully confirm)

---

### Flow A — Video / Concept Cascade (upload → analyze → enrich → save)

#### A-1 🔴 `humor-enrich` proxy missing — silently broken for all humorous concepts

**Files:**
- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx:276`
- `artifacts/api-server/src/routes/studio.ts` (entire file — no humor-enrich route)

**Symptom:** After concept save, the UI fires a fire-and-forget `POST /api/studio/concepts/humor-enrich` whenever `scriptHumor.isHumorous === true` and a Gemini GCS URI exists. The call hits Express, falls through all routes, and returns 404. The error is swallowed with `.catch(() => {})`, so CMs see no indication of failure.

**Root cause:** `studio.ts` proxies only `analyze` (line 53) and `enrich` (line 81). The `humor-enrich` route exists fully in Hagen (`artifacts/hagen/src/app/api/studio/concepts/humor-enrich/route.ts`) but no proxy was ever added to the api-server router. The Task #74 audit noted "fine-tuning not integrated" and recommended gating on `isHumorous` as an async post-save step — the UI call was implemented but the proxy never was.

**Impact:** The v7.B tuned humor model never runs. All concepts receive only base-model enrichment regardless of humor classification.

**Fix (~12 lines in `studio.ts` after line 94):**
```typescript
router.post('/concepts/humor-enrich', requireAuth, CM_ONLY, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/studio/concepts/humor-enrich',
    body: { videoUrl: body.videoUrl, gcsUri: body.gcsUri },
    timeoutMs: 90_000,   // tuned model + optional GCS download is slow
    routeTag: 'studio.concepts.humor-enrich',
  });
});
```

**📋 STATIC**

---

#### A-2 🟢 Concept inserted with `is_active: false` — intentional

**File:** `artifacts/api-server/src/routes/admin/concepts.ts:76`

Always `false` on save; CMs must activate explicitly. Correct per product model. No action needed.

**📋 STATIC**

---

#### A-3 🟢 `analyze` rate-limiter (5/min/user) in-process only

**File:** `artifacts/api-server/src/routes/studio.ts:15-49`

In-memory Map with 5-min eviction. Not shared across horizontal scale, but no multi-instance deployment exists today. No action needed.

**📋 STATIC**

---

### Flow B — Customer Invite / Create + TikTok Ingest

#### B-1 🔴 Express create stub never sends invite email or triggers TikTok sync

**Files:**
- `artifacts/api-server/src/routes/admin/customers.ts:1163-1213`
- `artifacts/letrend/src/components/admin/customers/InviteCustomerModal.tsx:117-121`

**Symptom:** The "Bjud in kund" modal posts to `POST /api/admin/customers/create`. The Express handler inserts a `customer_profiles` row and immediately returns:
```json
{ "inviteSent": false, "warnings": ["E-postinbjudan skickas inte automatiskt i Express-läge..."] }
```
No email is sent. No TikTok history is seeded. This happens even when the "Skicka inbjudan direkt" checkbox is ticked.

**Root cause:** The full invite flow lives in `artifacts/letrend/src/lib/admin/customers/create.server.ts` — a Next.js server action using `admin_create_customer` RPC + `sendCustomerInvite` + `persistInviteProfile` + `triggerInitialTikTokSync`. After the Next.js → Vite migration this file is **unreachable dead code**. The Express endpoint is an acknowledged stub (comment at `admin/customers.ts:1204`) that was never completed.

**Impact:** Every customer created via the admin UI since the migration has no invite email sent, regardless of the checkbox. The customer can never log in until an admin sends the invite manually. No initial TikTok history is seeded.

**Mitigation:** The cron `runHistorySyncBatch` includes `status='invited'` customers (see C-9), so TikTok history does eventually arrive on the next cron run. Invite email has no automatic recovery path.

**Fix:** Implement invite email (via Resend — `RESEND_API_KEY` already provisioned) and call `triggerInitialTikTokSyncBackground` when `tiktok_handle` is present, following the pattern at `admin/customers.ts:315-316`.

**🔍 LIVE** — confirm severity by creating a test customer and checking that no email arrives.

---

#### B-2 🟡 `triggerInitialTikTokSyncBackground` only called on handle PATCH, never on create

**Files:**
- `artifacts/api-server/src/routes/studio-v2.ts:253-257`
- `artifacts/api-server/src/routes/admin/customers.ts:315-316`

Two runtime call sites exist — both on PATCH when `tiktok_handle` changes. Zero call sites exist at creation. When B-1 is fixed, this should be added to the create handler simultaneously.

**📋 STATIC**

---

#### B-3 🟢 PATCH correctly resets sync timestamps and re-triggers sync on handle change

Both PATCH handlers (studio-v2 and admin/customers) reset `last_history_sync_at = null` and `last_upload_at = null`, then call `triggerInitialTikTokSyncBackground`. Correct behaviour. No action needed.

**📋 STATIC**

---

### Flow C — TikTok Sync / Feed Planner / Reconcile

#### C-1 🟡 `POST /api/studio-v2/feed/mark-produced` — non-atomic loop + missing lock + missing signal clear

**File:** `artifacts/api-server/src/routes/studio-v2.ts:936-1018`

Three separate problems in the Express mark-produced handler:

**Problem 1 — Race condition.** Feed advancement uses a sequential JS loop of individual DB round-trips:
1. UPDATE conceptId → status=produced, feed_order=-1
2. SELECT upcoming WHERE feed_order > 0
3. UPDATE upcoming[0] → feed_order=0
4. Loop: UPDATE upcoming[i] → feed_order -= 1

If two concurrent requests fire (double-click, network retry), both read the same `upcoming` snapshot and attempt to write identical `feed_order` values, leaving the feed with duplicate or mis-ordered slots.

**Problem 2 — Lock badge never fires.** `customer_profiles.pending_history_advance_at` is the "operation in progress" column the planner UI checks for a >60s stuck-badge (`types/studio-v2.ts:367`). The Express route never sets it. The badge can never fire for CM-triggered mark-produced.

**Problem 3 — Motor signals not cleared.** The Express route does not update `feed_motor_signals.auto_resolved_at` after advancing the plan. Active nudges persist in the planner UI after the plan has already advanced.

**Root cause:** `artifacts/letrend/src/lib/studio/perform-mark-produced.ts` (the correct implementation with `shift_feed_order` RPC + lock + signal clear) was written for the Next.js/auto-reconcile path and is now dead code. The Express route was written independently after migration without reusing that logic.

**Fix:** Replace the JS loop with:
1. UPDATE `customer_profiles.pending_history_advance_at = now` (lock)
2. `supabase.rpc('shift_feed_order', { p_customer_id, p_advance_count: 1 })` (atomic)
3. UPDATE concept: status=produced, produced_at, tiktok_url, published_at, feed_order=-1
4. UPDATE `customer_profiles.pending_history_advance_at = null` (clear lock)
5. UPDATE `feed_motor_signals` → `auto_resolved_at = now` WHERE `acknowledged_at IS NULL AND auto_resolved_at IS NULL`

**🔍 LIVE** — confirm `shift_feed_order` RPC exists on DB (`database.gen.ts:1963` shows it in generated types).

---

#### C-2 🟡 Dead server-only code in `artifacts/letrend/src/lib/studio/` — Next.js residue

**Files:**
- `artifacts/letrend/src/lib/studio/perform-mark-produced.ts`
- `artifacts/letrend/src/lib/studio/auto-reconcile.ts`
- `artifacts/letrend/src/lib/studio/sync-customer-history.ts`
- `artifacts/letrend/src/lib/studio/history-import.ts`
- `artifacts/letrend/src/lib/studio/run-history-sync-batch.ts`

All five import `createSupabaseAdmin` from `@/lib/server/supabase-admin` — a server-only module inappropriate in a Vite browser bundle. Zero browser components import any of these files (confirmed by full-codebase grep — no import chains found). They are Next.js server action modules written in parallel with the api-server implementation but never wired to Express.

**Risk:** A developer editing these files would believe they are maintaining the canonical implementation, while the actual runtime code is `artifacts/api-server/src/lib/studio/tiktok-sync.ts`.

**Fix:** Delete all five files. Optionally add a header comment to `tiktok-sync.ts` marking it as the canonical server-side sync implementation.

**📋 STATIC**

---

#### C-3 🟡 Auto-reconcile low-confidence path logs warning but still reconciles — wrong clip possible

**File:** `artifacts/letrend/src/lib/studio/auto-reconcile.ts:104-116` *(dead code — see C-2)*

When the newest unreconciled clip's `published_at` is >48h before the nu-slot's `sent_at`, a `console.warn` is emitted but reconciliation proceeds. For high-frequency posters or customers with extended gaps, the wrong TikTok clip could be linked to a LeTrend concept card.

The `opts.suppressAutoReconcile` flag already exists in the sync options signature and is the correct hook for a hard confidence guard.

**📋 STATIC** *(relevant if code is reactivated as part of C-2 cleanup)*

---

#### C-4 🟢 `customer_concepts.status` is free-text — `'assigned'` will not fail a DB constraint

**File:** `artifacts/letrend/src/types/database.gen.ts:480` — `status: string | null`

No CHECK constraint at the DB level (confirmed by generated types — no enum). Values in use: `'draft'`, `'assigned'`, `'history_import'`, `'produced'`, `'archived'`. No data risk. Could improve type-safety with a TS union type in future.

**📋 STATIC**

---

#### C-5 🟢 `cron_run_log.thumbnails_refreshed` column — migration and write-site aligned

Migration `supabase/migrations/20260505120000_cron_run_log_thumbnails_refreshed.sql` adds the column. `artifacts/api-server/src/lib/studio/tiktok-sync.ts:930` writes it. Admin cron-health page reads it. Static alignment confirmed.

**🔍 LIVE** — confirm migration has run on the live DB.

---

#### C-6 🟢 `fetch-profile-history` — four call sites, no concurrent-request UI guard

**File:** `artifacts/letrend/src/components/studio/CustomerWorkspaceContent.tsx:869, 1697, 2385, 2437`

`importNewClips` deduplicates by normalized `tiktok_url`, so no data corruption from concurrent calls. Minor: a second click while the first is in-flight could trigger duplicate RapidAPI requests. Low priority.

**📋 STATIC**

---

#### C-7 🟢 `hagen-clips` endpoint correctly degrades when `HAGEN_BASE_URL` not set

**File:** `artifacts/api-server/src/routes/studio-v2.ts:792-801`

Returns `{ clips: [] }` silently. Frontend renders an empty state. Correct graceful degradation.

**📋 STATIC**

---

#### C-8 🟢 Reconcile API correctly guards cross-customer writes — no IDOR

**File:** `artifacts/api-server/src/routes/studio-v2.ts:1286-1293`

POST reconcile verifies `assignmentRow.customer_profile_id === historyCustomerId`. DELETE reconcile uses a double-key guard (`.eq('id', ...).eq('customer_profile_id', ...)`). No IDOR vulnerability found.

**📋 STATIC**

---

#### C-9 🟢 Cron batch includes `'invited'` customers — partial safety net for B-1

**File:** `artifacts/api-server/src/lib/studio/tiktok-sync.ts` (batch eligibility)

Customers with `status IN ('active','agreed','invited')` and `tiktok_handle IS NOT NULL` are eligible for cron sync. TikTok history eventually arrives for newly created customers even if the initial sync was skipped at creation (B-1 gap). Invite email has no such safety net.

**📋 STATIC**

---

### Summary Matrix

| ID | Severity | Flow | Title | Static/Live | Effort |
|----|----------|------|-------|-------------|--------|
| A-1 | 🔴 HIGH | Concept cascade | `humor-enrich` proxy missing — v7.B never runs | 📋 | ~12 lines |
| B-1 | 🔴 HIGH | Invite/create | Express create stub — no invite email, no TikTok seed | 🔍 | Medium |
| B-2 | 🟡 MED | Invite/create | `triggerInitialTikTokSyncBackground` not called at create | 📋 | Follows B-1 |
| C-1 | 🟡 MED | Mark-produced | Non-atomic JS loop; no lock badge; motor signals not cleared | 🔍 | Medium |
| C-2 | 🟡 MED | Sync pipeline | 5 dead server-only files in letrend confuse canonical impl | 📋 | Delete files |
| C-3 | 🟡 MED | Auto-reconcile | Low-confidence reconcile proceeds without hard guard | 📋 | Small |
| A-2 | 🟢 LOW | Concept cascade | `is_active: false` on save — expected behaviour | 📋 | None |
| A-3 | 🟢 LOW | Concept cascade | Rate-limiter in-process only | 📋 | None |
| B-3 | 🟢 LOW | Invite/create | PATCH resets sync timestamps correctly | 📋 | None |
| C-4 | 🟢 LOW | DB schema | `status` is free-text; `'assigned'` won't fail constraint | 📋 | None |
| C-5 | 🟢 LOW | Cron health | `thumbnails_refreshed` column statically aligned | 🔍 | None |
| C-6 | 🟢 LOW | History fetch | Multiple fetch-profile-history sites, no UI dedup guard | 📋 | Minor UX |
| C-7 | 🟢 LOW | Hagen proxy | `hagen-clips` degrades correctly | 📋 | None |
| C-8 | 🟢 LOW | Reconcile | Cross-customer write guards correct | 📋 | None |
| C-9 | 🟢 LOW | Cron sync | Batch includes invited customers — safety net for B-1 | 📋 | None |

### Recommended fix order

1. **A-1** — 12 lines, zero risk, restores humor enrichment for all humorous concepts immediately.
2. **B-1 + B-2** — Critical onboarding gap: implement Resend invite + `triggerInitialTikTokSyncBackground` in the Express create handler; delete dead Next.js server action code.
3. **C-1** — Replace JS loop with `shift_feed_order` RPC + pending_history_advance_at lock + motor signal clear. Confirm RPC exists on live DB first.
4. **C-2** — Delete the five dead server-only letrend files.
5. **C-3** — Add a hard confidence guard to auto-reconcile (suppress when >48h delta).

---

## Task #74 — Hagen Ingest-Motor Audit (2026-05-04)

### 1. Scope

Audit the Hagen (Railway/Next.js) ingest engine used by LeTrend's UploadConceptModal flow. Identify missing routes, sentinel instability, enrichment prompt gaps, GCS reliability issues; propose and implement fixes.

---

### 2. Current Architecture

```
Browser (UploadConceptModal)
  ↓ POST /api/studio/concepts/analyze
api-server (Express, port 8080)
  ↓ proxy → HAGEN_BASE_URL/api/studio/concepts/analyze
Hagen (Railway, Next.js)
  ↓ VideoDownloader → Gemini File API → GeminiVideoAnalyzer
  ↓ returns { analysis, upload: { gcsUri } }
api-server  ← response forwarded
  ↓
Browser → POST /api/studio/concepts/enrich
api-server → Hagen /api/studio/concepts/enrich
  ↓ Gemini enrichment prompt
  ↓ returns { overrides }
api-server ← forwarded
  ↓
Browser → POST /api/admin/concepts  (save, handled entirely in api-server)
```

---

### 3. Findings

#### 3.1 Missing Route Handlers — CRITICAL

| Route | Declared in `/api/letrend/version` | Handler existed |
|---|---|---|
| `/api/studio/concepts/analyze` | ✅ | ❌ |
| `/api/studio/concepts/enrich` | ✅ | ❌ |

The version manifest advertised both routes, but no Next.js App Router `route.ts` files existed under `src/app/api/studio/`. Every call from UploadConceptModal resulted in a 404 from Railway, which the upstream proxy returned as a 502 to the browser.

**Fix implemented:** Created both route handlers.

---

#### 3.2 Sentinel Instability in `analyzeVideoCombined`

`GeminiVideoAnalyzer.analyzeVideoCombined()` issued a single Gemini call that expects the response to be wrapped between sentinel strings:
```
<<<DISPLAY_JSON>>>  ...  <<<END_DISPLAY_JSON>>>
<<<SCHEMA_V1_JSON>>> ... <<<END_SCHEMA_V1_JSON>>>
```

Under high-load or long-prompt conditions Gemini occasionally omits the sentinel wrappers on the first try. The original code threw immediately on the first missing DISPLAY block, forcing the caller (`/api/videos/analyze/deep`) to fall back to a two-call path every time this happened.

**Fix implemented:** Added a single retry (1.5s delay) before throwing. The SCHEMA_V1 block is still optional; a missing schema block is logged as a warning rather than an error.

---

#### 3.3 GCS / Gemini File API — No Retry

`VideoStorageService.uploadToGeminiFileAPI()` had no retry logic. A transient network blip or Gemini API hiccup failed the entire upload attempt with no recovery.

**Fix implemented:** Added 3-attempt exponential-backoff retry (2s → 4s). Error codes are now prefixed (`GEMINI_FILE_NOT_ACTIVE`, `GEMINI_UPLOAD_ERROR`) so callers can distinguish stable failures from transient ones. Poll cap raised from unbounded to 30 polls (60s max wait).

---

#### 3.4 Enrichment Prompt — Script Notation Missing

The original `ENRICH_CONCEPT_SYSTEM_PROMPT` in `letrend/src/lib/concept-enrichment.ts` had no instruction distinguishing dialog scripts from text-overlay scripts from purely visual concepts. This led Gemini to produce `script_sv` fields that mixed styles unpredictably.

**Fix implemented:** The hagen enrich route's system prompt adds:
```
SCRIPT-NOTATION:
- [Dialog]: each spoken line
- [Textoverlay]: text card content
- [Visuell]: purely visual scenes
```

---

#### 3.5 api-server Proxy Timeout — Too Short for Analyze

The analyze proxy was configured with a 30s timeout. The analyze pipeline (download + upload + Gemini) realistically takes 25–45s. A 30s timeout caused spurious timeouts on longer videos.

**Fix implemented:** `studio.ts` analyze timeout bumped to 45s. The enrich route remains at 30s (Gemini-only call, fast).

---

#### 3.6 Fine-Tuning Model (v7.B) Not Integrated in Studio Flow

The `/api/fine-tuning/generate` route and Vertex AI tuned-model calls exist in Hagen but are not called from the studio ingest pipeline.

**Decision:** Not integrated in Task #74. Rationale:
- The fine-tuned model is accessed via Vertex AI (different credentials path).
- Humor analysis is already handled by the comprehensive Gemini prompt.
- Adding a second Vertex AI call to the hot ingest path increases latency by ~5–8s for every video, including non-humorous ones.
- Recommended approach: gate the fine-tuning call on `humor.isHumorous === true` in a separate async enrichment job after the initial save.

**Status (Task #116 follow-up):** The async post-save call was implemented in the UI (`UploadConceptModal.tsx:276`) but the api-server proxy was never added. See finding **A-1** above.

---

### 4. Files Modified (Task #74)

| File | Change |
|---|---|
| `artifacts/hagen/src/app/api/studio/concepts/analyze/route.ts` | **CREATED** — full ingest pipeline |
| `artifacts/hagen/src/app/api/studio/concepts/enrich/route.ts` | **CREATED** — Gemini Swedish enrichment |
| `artifacts/hagen/src/lib/services/video/storage.ts` | Retry + poll cap + error codes |
| `artifacts/hagen/src/lib/services/video/gemini.ts` | Sentinel retry in `analyzeVideoCombined` |
| `artifacts/api-server/src/routes/studio.ts` | Analyze timeout 30s → 45s |
| `scripts/smoke-test-hagen.sh` | **CREATED** — 5-check smoke test |

---

### 5. Smoke Test

```bash
HAGEN_URL=https://your-hagen.up.railway.app bash scripts/smoke-test-hagen.sh
```

Checks:
1. `GET /api/letrend/version` returns both studio routes in manifest
2. `POST /api/studio/concepts/analyze` with empty body → 400
3. `POST /api/studio/concepts/analyze` with invalid URL → 400
4. `POST /api/studio/concepts/enrich` with no `backend_data` → 400
5. `POST /api/studio/concepts/enrich` with minimal payload → `overrides.headline_sv` present

---

### 6. Remaining Work / Recommendations (Task #74 perspective)

| Item | Priority | Status |
|---|---|---|
| Integrate fine-tuning (v7.B) humor pass as async post-save step | Medium | UI call added; **proxy missing** (finding A-1) |
| Add `/api/studio/concepts/analyze` to letrend version manifest check at startup | Low | Open |
| Add Sentry/error tracking to hagen Railway service | Low | Open |
| Rate-limit the analyze route (1 req/min per IP) to prevent abuse | Medium | Done (5/min/user in-process) |
| Cache Gemini File API URIs so re-analysis of same URL skips re-upload | Low | Open |
