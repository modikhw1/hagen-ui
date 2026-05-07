# Phase 55 — Ingest Runs Ops Status View

## Objective

Add a light operational status surface for `ingest_runs` so CMs and admins can
monitor running/failed/recent ingests without reading logs.

---

## API Endpoint

### `GET /api/studio/ingest-runs`

**Auth**: `requireAuth` + `CM_ONLY` (admin or content_manager role) — same as
every other `/api/studio/*` route.

**Query params**:

| Param | Default | Max | Notes |
|---|---|---|---|
| `limit` | 25 | 100 | Number of rows returned |
| `status` | (all) | — | One of: `queued`, `running`, `ready_for_review`, `completed`, `failed`, `canceled` |
| `mine` | false | — | `true` / `1` — force own-runs filter even for admins |

**Access control decision**:
- Non-admins always see only their own runs (`created_by = req.user.id`).
- Admins see all runs by default (no `created_by` filter), unless `?mine=true`.
- This matches the pattern established by `GET /api/studio/ingest-runs/:id`.
- Supabase RLS continues to block direct DB access; API server uses service role.

**Response shape**:
```json
{
  "ingest_runs": [
    {
      "id": "uuid",
      "source": "studio_upload",
      "source_url": "https://...",
      "platform": "tiktok",
      "status": "completed",
      "stage": "saving",
      "concept_id": "uuid-or-null",
      "error_code": null,
      "error_message": null,
      "warnings": [],
      "result": { "analyze_summary": {}, "enrich_summary": {}, "save_summary": {} },
      "created_at": "2026-05-07T...",
      "updated_at": "2026-05-07T...",
      "finished_at": "2026-05-07T..."
    }
  ]
}
```

Rows ordered by `created_at DESC`.

---

## UI Placement

`IngestStatusPanel` is rendered in `/studio/concepts` (page.tsx):

```
[Page header: Konceptbibliotek / + Nytt koncept]
[IngestStatusPanel]                          ← NEW
[Draft concepts panel (if any)]
[Filters / concept grid]
```

**Behaviour**:

| State | Display |
|---|---|
| 0 runs | Panel hidden (returns null) |
| Loading | "Laddar…" label in header |
| queued / running | Pulsing blue dot in header; auto-refresh every 5s |
| failed count > 0 | Red header border, "N fel" badge |
| Collapsed | Click header to toggle; rows hidden |

**Per-row columns**: status badge · stage · truncated source URL (with full URL in `title`) · relative time · "Granska →" link if `concept_id` is set · error message (truncated to 60 chars) for failed runs.

**Status badge colours**:
- `queued` — grey surface
- `running` — blue (`#1d4ed8`)
- `ready_for_review` / `completed` — green (`LeTrendColors.success`)
- `failed` — red (`LeTrendColors.error`)
- `canceled` — muted

**Refresh**: Manual button (↻) + automatic 5s interval only when `queued` or `running` runs exist. Auto-refresh stops automatically when all runs reach terminal status.

---

## Verification

```
GET /api/studio/ingest-runs?limit=10       → { "ingest_runs": [...] } ✅
GET /api/studio/ingest-runs?status=completed → all rows status=completed ✅
GET /api/studio/ingest-runs (no auth)      → 401 "Du måste logga in" ✅
```

Typecheck:
```
pnpm --filter @workspace/api-server exec tsc --noEmit  → 0 errors ✅
pnpm --filter @workspace/letrend exec tsc --noEmit     → 0 errors ✅
```

---

## Remaining Gaps / Known Limitations

1. **No pagination / infinite scroll** — list capped at 100 rows. Sufficient for
   the ops use-case; a cursor-based API can be added later.
2. **No server-sent events / WebSocket** — polling every 5s is simple and
   sufficient while load is low.
3. **Warnings not surfaced** — `warnings` array is stored per run but the panel
   does not yet display individual warnings (only `error_message` for failed).
4. **No status filter chips in the UI** — panel shows all runs; filtering by
   status is only available via direct API query. Can be added as a quick-filter
   dropdown later.
5. **Panel always expanded on load** — collapsed state is not persisted across
   page reloads.
