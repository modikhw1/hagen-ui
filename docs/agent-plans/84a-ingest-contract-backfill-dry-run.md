# Phase 84A — Ingest Contract Backfill Dry Run

**Datum:** 2026-05-13  
**Typ:** Read-only dry-run preview — no DB writes, no DB migrations, no dependency changes  
**Baseras på:** Phase 83 (`6cb75d0`)

---

## Explicit Guarantee

**No database writes in this phase.** `computeDryRunCandidate` is a pure function. The endpoint reads concepts and returns a preview. No `UPDATE`, `INSERT`, or `DELETE` statement is issued anywhere in this flow.

Phase 84B is the confirmed apply step — it will only be added after orchestrator/user review of the dry-run output.

---

## Context

From the orchestrator snapshot (33 concepts total):
- 33 missing `overrides_version`
- 6 with deprecated `estimatedBudget`
- 4 with deprecated `trendLevel`
- 6 with both `hasScript` and `script_mode` (ambiguous state)
- 22 with `scene_breakdown` (not affected by normalization)

---

## Files Changed

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/concept-overrides.ts` | Add `computeDryRunCandidate` pure helper + `DryRunCandidate`/`DryRunChangeKey` types |
| `artifacts/api-server/src/lib/concept-overrides.test.ts` | Add 13 tests for `computeDryRunCandidate` |
| `artifacts/api-server/src/routes/admin/concepts.ts` | Add `POST /api/admin/concepts/backfill-overrides-version/dry-run` |
| `artifacts/letrend/src/app/studio/concepts/page.tsx` | Add dry-run button + results to `IngestContractHealthPanel` |
| `docs/agent-plans/84a-ingest-contract-backfill-dry-run.md` | This file |

---

## Pure Helper: `computeDryRunCandidate`

```typescript
// artifacts/api-server/src/lib/concept-overrides.ts

export type DryRunChangeKey =
  | 'add_overrides_version'
  | 'remove_estimatedBudget'
  | 'remove_trendLevel'
  | 'remove_hasScript';

export interface DryRunCandidate {
  id: string;
  source: string | null;
  would_change: boolean;
  current_overrides_version: string | null;
  next_overrides_version: string;        // always OVERRIDES_VERSION ('v1')
  change_keys: DryRunChangeKey[];
  warnings: string[];
}

function computeDryRunCandidate(row: {
  id: string;
  source: string | null;
  overrides: Record<string, unknown> | null;
}): DryRunCandidate
```

**Normalization rules applied (delegating to `normalizeOverrides`):**

| Rule | change_key |
|---|---|
| `overrides_version` absent or != 'v1' | `add_overrides_version` |
| `estimatedBudget` present | `remove_estimatedBudget` |
| `trendLevel` present | `remove_trendLevel` |
| `hasScript` present AND `script_mode` is non-null → stripped | `remove_hasScript` |
| `hasScript` present BUT `script_mode` absent/null → kept | (no key) |

**Does NOT include full script/headline/content values** — response is compact for ops review.

---

## API Endpoint

### `POST /api/admin/concepts/backfill-overrides-version/dry-run`

**Auth:** Admin-only (`ADMIN_ONLY = requireRole(['admin'])`)  
**Method:** POST (idempotent — no side effects — POST chosen because it represents an operation with a payload, not a resource fetch)  
**DB access:** Read-only (`SELECT id, source, overrides FROM concepts`)  
**No DB writes:** confirmed  

**Response shape:**
```json
{
  "dry_run": true,
  "summary": {
    "total": 33,
    "would_change": 33,
    "would_add_overrides_version": 33,
    "would_remove_estimatedBudget": 6,
    "would_remove_trendLevel": 4,
    "would_remove_hasScript": 6
  },
  "candidates": [
    {
      "id": "uuid",
      "source": "hagen",
      "would_change": true,
      "current_overrides_version": null,
      "next_overrides_version": "v1",
      "change_keys": ["add_overrides_version", "remove_estimatedBudget"],
      "warnings": ["deprecated field stripped: estimatedBudget"]
    }
  ],
  "total_candidates": 33
}
```

`candidates` is limited to 10 in the response for UI preview. `total_candidates` reflects the full count.

---

## UI Changes

Added to `IngestContractHealthPanel` in `/studio/concepts`:

**Dry-run button:** Appears in the warning note section when `hasWarning` is true. Admin-only in practice because the endpoint returns 403 for non-admins. Label: "Dry-run backfill".

**Summary display** (after button click):
- Green/amber stat row: would_change, would_add_overrides_version, would_remove_estimatedBudget, would_remove_trendLevel, would_remove_hasScript
- Candidate list (first 10): id prefix · source · change_keys chips

**No apply button** — this phase is preview only.

---

## Tests Added

`artifacts/api-server/src/lib/concept-overrides.test.ts` — 13 new tests in `describe('computeDryRunCandidate')`:

| Test | Verifies |
|---|---|
| already-normalized concept | `would_change=false`, `change_keys=[]` |
| missing `overrides_version` | `add_overrides_version` in change_keys |
| wrong `overrides_version` (v0) | `add_overrides_version`, `current_overrides_version='v0'` |
| `estimatedBudget` present | `remove_estimatedBudget` |
| `trendLevel` present | `remove_trendLevel` |
| `hasScript` + `script_mode` non-null | `remove_hasScript` |
| `hasScript` without `script_mode` | no `remove_hasScript` |
| `hasScript` with `script_mode=null` | no `remove_hasScript` |
| fully deprecated concept | all four change_keys |
| null overrides | `add_overrides_version`, `current_overrides_version=null` |
| id/source passthrough | id and source preserved in output |
| null source | source=null preserved |
| no content fields in output | headline_sv/script_sv not in DryRunCandidate |
| pure function | calling twice returns identical result |

---

## What Remains for Phase 84B

Phase 84B: Confirmed apply step.

Expected work:
1. `POST /api/admin/concepts/backfill-overrides-version/apply` — admin-only, runs `normalizeOverrides` on each candidate and writes via `PATCH concepts SET overrides = $1 WHERE id = $2`
2. Transactional or row-by-row with partial-success reporting
3. Returns count of updated rows + list of IDs
4. UI button in `IngestContractHealthPanel` — only visible after reviewing dry-run output; confirmation step before calling apply

No DB migration needed for Phase 84B either — the apply writes to the existing `overrides` JSONB column.

---

## Verification

```bash
# pnpm local override applied (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/api-server" run typecheck
# → 0 errors

pnpm --filter "./artifacts/api-server" run test
# → all tests pass including 13 new computeDryRunCandidate tests

pnpm --filter "./artifacts/letrend" run typecheck
# → 0 errors

PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
# → ✓ built

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```
