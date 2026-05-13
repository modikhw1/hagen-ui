# Phase 80 — API Contract Normalization for Concept Ingest

**Datum:** 2026-05-13  
**Typ:** API / server-side — no UI changes, no DB migrations, no dependency changes  
**Baseras på:** `docs/agent-plans/77-canonical-ingest-contract.md`, `docs/agent-plans/78-ingest-contract-type-alignment.md`, `docs/agent-plans/79-upload-confirm-ux.md`

---

## Files Changed

- `artifacts/api-server/src/lib/concept-overrides.ts` (new)
- `artifacts/api-server/src/lib/concept-overrides.test.ts` (new)
- `artifacts/api-server/src/routes/admin/concepts.ts`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`

---

## API Behavior Changed

### `POST /api/admin/concepts`

**Before:** Accepted any `overrides` object and stored it verbatim in JSONB.

**After:**
1. `overrides` is passed through `normalizeOverrides()`:
   - `estimatedBudget` and `trendLevel` are stripped
   - `hasScript` is stripped when `script_mode` is present and non-null
   - `overrides_version: 'v1'` is injected
   - All other fields (including unknown legacy keys) are preserved
2. For `source === 'cm_created'` (default source), `validateNewConceptOverrides()` is called:
   - If `script_mode`, `difficulty`, `filmTime`, `peopleNeeded`, or `businessTypes` are absent/invalid, returns **HTTP 400** with Swedish error and `missing_fields` array
   - `mechanism` is intentionally **not** required (made optional in Phase 78)
3. `is_active` default behavior unchanged: still `true` when not provided
4. `backend_data` passthrough behavior unchanged

**Error response format for missing fields:**
```json
{
  "error": "Konceptet saknar obligatoriska fält: filmTime. Klassificera konceptet fullständigt innan du sparar.",
  "missing_fields": ["filmTime"]
}
```

**Compatibility:** Non-CM sources (e.g. `source: 'import'`, `source: 'hagen_sync'`) skip required-field validation. They still go through normalization (deprecated fields stripped). This prevents breaking any legacy import pipelines.

### `PATCH /api/admin/concepts/:id`

**Before:** Accepted and stored `overrides` verbatim.

**After:** If `overrides` is present in the patch body, it is normalized (deprecated fields stripped, `overrides_version: 'v1'` injected). Required-field validation is **not** applied — partial edits are valid (e.g. tag-only updates, studio edits).

No change to `customer_concepts` — the route only touches the `concepts` table.

### Hagen upstream calls

**Before:** Requests sent with `Content-Type`, `Accept`, and `x-letrend-request-id`.

**After:** All calls via `fetchHagenJson` now also send:
```
x-hagen-contract-version: v1
```
This is informational — Hagen does not currently validate it. It enables future contract negotiation and upstream log correlation by version.

---

## New File: `src/lib/concept-overrides.ts`

Small pure-function module with:

### `normalizeOverrides(raw: unknown): NormalizeResult`

| Input | Behavior |
|---|---|
| `null`, non-object, array | Returns `{ overrides_version: 'v1' }` + no warnings |
| `estimatedBudget` present | Stripped; warning logged |
| `trendLevel` present | Stripped; warning logged |
| `hasScript` present AND `script_mode` non-null | Stripped; warning logged |
| `hasScript` present AND `script_mode` absent/null | Kept |
| `mechanism` present | Kept (not deprecated) |
| `mechanism` absent | Not added (optional) |
| Unknown keys | Kept (backward compat) |
| Existing `overrides_version` | Overwritten with `'v1'` |

### `validateNewConceptOverrides(overrides: Record<string, unknown>): string[]`

Returns array of missing field names. Empty = valid.

Required: `script_mode`, `difficulty`, `filmTime`, `peopleNeeded`, `businessTypes` (non-empty array).
Not required: `mechanism`, `headline_sv`, `description_sv`, or any other field.

### `OVERRIDES_VERSION = 'v1'`

Exported constant. Used in both normalize (inject) and future migration scripts (check).

---

## Compatibility Decisions

| Decision | Reason |
|---|---|
| Unknown keys preserved in normalize | Old concepts may have undocumented fields from pre-contract era; hard-deleting them would corrupt records |
| `mechanism` not required | Phase 78 intentional: Gemini may not return it; saves must not block |
| PATCH doesn't validate required fields | Tag updates, studio edits, partial overwrites are all valid partial edits |
| Non-cm_created sources skip validation | Import pipelines and Hagen-sync may not include all CM fields by design |
| `hasScript` kept when `script_mode` is null | Null means "not set yet" — if script_mode was cleared, keep old boolean as fallback |
| Hagen contract header informational only | Hagen is a separate service; we cannot atomically upgrade both ends |

---

## Studio-v2: Customer Assignment Mapping

Extracted the inline field mapping from the `POST /api/studio-v2/customers/:id/concepts` handler into a named function `buildConceptContentOverrides(overrides)`. Behavior is **identical** to before — only the code structure changed.

**Function signature:**
```typescript
function buildConceptContentOverrides(overrides: Record<string, unknown>): Record<string, string>
```

**Field mapping (library → customer assignment):**

| Library (`concepts.overrides`) | Customer (`customer_concepts.content_overrides`) |
|---|---|
| `headline_sv` | `headline` |
| `script_sv` | `script` |
| `whyItWorks_sv` | `why_it_fits` |
| `productionNotes_sv` (string[]) | `filming_instructions` (joined with `\n`) |

Added comment block explaining that library data and customer-specific overrides are intentionally separate JSONB columns.

---

## What Intentionally Did Not Change

| Item | Reason |
|---|---|
| Frontend UI components | Phase 79 target; no changes needed |
| DB schema / migrations | All changes are in JSONB handling logic |
| `studio.ts` analyze/enrich routes | They don't write concepts — only classify step calls POST |
| `studio-v2.ts` PATCH for customer concepts | Only `concepts.ts` patch was in scope |
| Hagen response parsing | No new fields required from Hagen |
| `ingest-runs.ts` | Run already tracks stage; no new metadata needed |
| `concept-regenerate.ts` | Regenerate path does a PATCH, which now strips deprecated fields — acceptable |

---

## Verification

### Commands run

```bash
# pnpm override applied locally (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/api-server" run typecheck
# → 0 errors

pnpm --filter "./artifacts/api-server" test
# → concept-overrides.test.ts: all tests pass
# → ingest-runs.test.ts: all tests pass (unchanged)

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```

---

## Remaining Work for Phase 81

Phase 81 should focus on ingest-run stage tracking and visibility improvements:

1. **Stage completeness** — write `stage: 'classify'` when the classify step is reached (currently only `'saving'` is written); write `stage: 'assigned'` after successful customer assignment
2. **`scene_breakdown` round-trip verification** — confirm `backend_data.scene_breakdown` survives POST and is readable for `scene_count` display in library cards (Phase 79 added the display; Phase 81 should verify the data path)
3. **`overrides_version` in GET responses** — confirm library list and detail responses include `overrides_version` so CMs can see which concepts have been normalized
4. **`CANONICAL_OVERRIDES_VERSION` migration guard** — add a one-time migration query to identify pre-v1 concepts (no `overrides_version` key) so they can be batch-normalized without a DB schema change
5. **Hagen `hagen_request_id` passthrough** — propagate `requestId` from `fetchHagenJson` into ingest run metadata (`result.analyze_summary.hagen_request_id`) for cross-service debugging

Files expected in Phase 81:
- `artifacts/api-server/src/routes/studio.ts` (stage writes)
- `artifacts/api-server/src/lib/ingest-runs.ts` (possibly new stage constants)
- `artifacts/api-server/src/routes/admin/concepts.ts` (GET enrichment for overrides_version)
