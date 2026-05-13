# Phase 83 — Ingest Contract Health Surface

**Datum:** 2026-05-13  
**Typ:** Read-only observability — no DB migrations, no dependency/runtime config changes  
**Baseras på:** Phase 82 (`9fc64d9`), orchestrator note (33 concepts, 0 with overrides_version, 22 with scene_breakdown)

---

## Goal

Add a read-only health surface for the ingest/concept contract so operators can see whether the library is aligned with the canonical ingest contract before any backfill work (Phase 84).

---

## Files Changed

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/studio.ts` | Add `GET /api/studio/ingest-contract-health` endpoint |
| `artifacts/letrend/src/app/studio/concepts/page.tsx` | Add `IngestContractHealthPanel` component + render it after `IngestStatusPanel` |
| `docs/agent-plans/83-ingest-contract-health.md` | This file |

No new files created. No DB migrations. No dependency changes.

---

## API Endpoint

### `GET /api/studio/ingest-contract-health`

**Auth:** CM/admin protected (same as all `/api/studio/*` routes — `requireAuth + CM_ONLY`).

**Implementation strategy:** Fetches all concepts with `select('id, overrides, backend_data')` and computes counts in JS. At current library size (tens to low hundreds) this is fast and avoids complex PostgREST JSON aggregate syntax. ingest_runs are fetched separately (last 15, ordered by `created_at DESC`).

**Response shape:**
```json
{
  "health": {
    "total": 33,
    "with_overrides_version": 0,
    "missing_overrides_version": 33,
    "with_deprecated_estimated_budget": 5,
    "with_deprecated_trend_level": 3,
    "with_has_script_and_script_mode": 2,
    "with_scene_breakdown": 22,
    "recent_ingest_runs": [
      {
        "id": "uuid",
        "status": "completed",
        "stage": "assigned",
        "concept_id": "uuid-or-null",
        "customer_profile_id": "uuid-or-null",
        "hagen_request_id": "req-xxx-or-null",
        "hagen_contract_version": "v1-or-null",
        "warnings": [],
        "created_at": "2026-05-13T...",
        "updated_at": "2026-05-13T..."
      }
    ]
  }
}
```

**Field definitions:**

| Field | What it counts |
|---|---|
| `total` | All rows in `concepts` table |
| `with_overrides_version` | Rows where `overrides.overrides_version` is a non-empty string |
| `missing_overrides_version` | `total - with_overrides_version` — pre-v1 contracts |
| `with_deprecated_estimated_budget` | Rows where `overrides` contains `estimatedBudget` key |
| `with_deprecated_trend_level` | Rows where `overrides` contains `trendLevel` key |
| `with_has_script_and_script_mode` | Rows where `overrides` contains both `hasScript` and `script_mode` — ambiguous script state |
| `with_scene_breakdown` | Rows where `backend_data.scene_breakdown` is a non-empty array |
| `recent_ingest_runs` | Last 15 runs with traceability fields added in Phase 82 |

**Error handling:** `conceptsError` → 500. `runsError` → non-fatal (warns, returns empty array for that section).

---

## Frontend Panel

### `IngestContractHealthPanel`

**Location in file:** Added before `IngestStatusPanel` function (line ~878), rendered after `<IngestStatusPanel />` in the page JSX (line ~1937).

**Design language:** Matches existing `IngestStatusPanel` — collapsible header, `LeTrendColors`/`LeTrendRadius`/`LeTrendTypography`, same border/background pattern.

**What it shows:**

1. **Header row** (always visible):
   - Title "Kontraktshälsa"
   - Concept count
   - Warning pill: "{N} saknar overrides_version" (amber) if `missing_overrides_version > 0`
   - Success pill: "✓ Alla har overrides_version" (green) if all concepts are on v1 contract
   - Collapse/expand chevron

2. **Stat chips** (visible when expanded):
   - "Totalt" — neutral
   - "Med overrides_version" — neutral
   - "Saknar overrides_version" — amber warning if > 0
   - "Med scene_breakdown" — neutral
   - "Deprecated estimatedBudget" — amber warning if > 0
   - "Deprecated trendLevel" — amber warning if > 0
   - "hasScript + script_mode" — amber warning if > 0

3. **Warning note** (visible when expanded and `missing_overrides_version > 0`):
   - Mentions Phase 84 dry-run normalization plan

4. **Recent ingest runs table** (visible when expanded):
   - Columns: status badge · stage · contract_version badge · request_id prefix · "Koncept →" link · warning count · relative time
   - Same `relativeTime()` helper used by `IngestStatusPanel`

**Default state:** Collapsed (`useState(true)` for `collapsed`) — panel is present but doesn't dominate the page. Operators click to expand.

**Data fetch:** Single `useEffect` on mount — no polling (health data is not time-critical). Cancelled on unmount via `let cancelled = true`.

**No mutation buttons** — read-only as specified.

---

## What the Panel Does NOT Do

- No mutation/backfill buttons (Phase 84)
- No DB migration
- No new dependency
- No change to `/admin/demos`
- No change to concept list/filter behavior
- No change to existing `IngestStatusPanel`

---

## What Remains for Phase 84

Phase 84: Dry-run/backfill normalization.

Expected work:
1. `POST /api/admin/concepts/backfill-overrides-version?dry_run=true` — dry-run endpoint that returns which concepts would be updated and with what `overrides_version` value, without writing
2. `POST /api/admin/concepts/backfill-overrides-version` — actual backfill for admin-only, non-fatal, returns a count and list of updated IDs
3. Deprecation strip — optionally strip `estimatedBudget` and `trendLevel` during backfill if they are redundant with new canonical fields
4. UI button in `IngestContractHealthPanel` (admin-only) to trigger dry-run and show a diff preview before confirming actual backfill

No DB migration is expected for Phase 84 either — the backfill writes to the existing `overrides` JSONB column.

---

## Verification

```bash
# pnpm local override applied (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/api-server" run typecheck
# → 0 errors

pnpm --filter "./artifacts/letrend" run typecheck
# → 0 errors

PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
# → ✓ built

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```
