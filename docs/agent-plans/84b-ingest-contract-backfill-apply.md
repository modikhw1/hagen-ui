# Phase 84B — Ingest Contract Backfill Apply

**Datum:** 2026-05-13  
**Typ:** Admin-only confirmed DB apply — row-by-row PATCH to `concepts.overrides`  
**Baseras på:** Phase 84A (`POST /dry-run` + `computeDryRunCandidate` already shipped)

---

## Explicit Safety Contract

1. **Never auto-runs** — the apply endpoint is only called on explicit user action.
2. **Requires dry-run first** — the UI shows "Apply" only after `dryRun.summary.would_change > 0`.
3. **Requires explicit confirmation** — user must click "Bekräfta och skriv till DB" in a confirmation step before the fetch is issued.
4. **Requires correct confirm token** — server rejects unless `body.confirm === "APPLY_OVERRIDES_VERSION_V1"`.
5. **Stale-guard** — server re-computes dry-run state at apply time; if `total` or `would_change` differ from `expected_total` / `expected_would_change`, returns 409 and refuses to write.
6. **No cascades** — only `concepts.overrides` column is touched. No `backend_data`, `customer_concepts`, `ingest_runs`, `demos`, or any other table.
7. **Tests never call apply** — the only tested helpers are pure functions (`buildDryRunSummary`, `checkStaleDryRun`).

---

## Tables / Columns Mutated

| Table | Column | Operation |
|---|---|---|
| `concepts` | `overrides` (JSONB) | `UPDATE ... SET overrides = $normalized WHERE id = $id` |

No other tables, columns, or rows are touched.

---

## New Exports in `concept-overrides.ts`

### `buildDryRunSummary(candidates: DryRunCandidate[]): DryRunSummary`

Aggregates a candidate list into summary counts. Pure, no DB access. Used by both the dry-run and apply routes to avoid duplicating the counting logic.

### `checkStaleDryRun(input: StaleDryRunGuardInput): StaleDryRunGuardResult`

Pure guard function:
- If `actual_total !== expected_total` → `{ stale: true, reason: "total changed: expected N, got M" }`
- If `actual_would_change !== expected_would_change` → `{ stale: true, reason: "would_change count changed: ..." }`
- Otherwise → `{ stale: false }`

Used by the apply endpoint immediately before any DB write.

---

## API Endpoint

### `POST /api/admin/concepts/backfill-overrides-version/apply`

**Auth:** Admin-only (`ADMIN_ONLY = requireRole(['admin'])`)  
**Method:** POST  
**DB writes:** `UPDATE concepts SET overrides = $normalized WHERE id = $id` (row-by-row)  

**Request body:**
```json
{
  "confirm": "APPLY_OVERRIDES_VERSION_V1",
  "expected_would_change": 33,
  "expected_total": 33
}
```

**Success response (200):**
```json
{
  "applied": true,
  "updated_count": 33,
  "failed_count": 0,
  "updated_ids": ["uuid1", "uuid2", "..."],
  "failures": [],
  "summary_before": {
    "total": 33, "would_change": 33,
    "would_add_overrides_version": 33,
    "would_remove_estimatedBudget": 6,
    "would_remove_trendLevel": 4,
    "would_remove_hasScript": 6
  },
  "summary_after": {
    "total": 33, "would_change": 0,
    "would_add_overrides_version": 0,
    "would_remove_estimatedBudget": 0,
    "would_remove_trendLevel": 0,
    "would_remove_hasScript": 0
  }
}
```

**Stale response (409):**
```json
{
  "error": "Dry-run is stale — library changed since last dry-run. Run dry-run again before applying.",
  "reason": "total changed: expected 33, got 35",
  "summary_before": { ... }
}
```

**Bad confirm token (400):**
```json
{ "error": "confirm must be \"APPLY_OVERRIDES_VERSION_V1\"" }
```

**Missing expected counts (400):**
```json
{ "error": "expected_would_change and expected_total must be numbers" }
```

**Partial failure:** `failed_count > 0` is returned in the 200 body. The endpoint never hides row-level failures.

---

## UI Flow in `IngestContractHealthPanel`

```
[panel loads health]
        │
        ▼
[dry-run button] (visible when hasMissing || hasDeprecated)
        │
        ▼
[dry-run results shown]
        │
        └─ dryRun.summary.would_change > 0
                │
                ▼
        [Apply-knapp: "Skriv backfill till DB (33 koncept)"]
                │
                ▼
        [applyConfirming=true → confirmation UI]
        "Bekräfta och skriv till DB" | "Avbryt"
                │
                ▼
        [handleApply() called]
                │
        ┌───────┴───────────┐
        │ 409 stale          │ success
        ▼                   ▼
[applyStale shown]    [applyResult shown]
[dryRun reset]        [health refreshed]
[re-run dry-run]      [dryRun cleared]
```

**State variables added:**
- `applyResult: ApplyResult | null` — successful response
- `applyLoading: boolean` — fetch in flight
- `applyError: string | null` — non-409 HTTP error
- `applyConfirming: boolean` — shows confirmation step
- `applyStale: { reason?, summary? } | null` — 409 stale response

**Guards in handleDryRun:** Clears all apply state so a fresh dry-run starts clean.

---

## Tests Added

`artifacts/api-server/src/lib/concept-overrides.test.ts`

### `buildDryRunSummary` (3 tests)
| Test | Verifies |
|---|---|
| empty list | all counts = 0 |
| already-normalized concept | would_change = 0 |
| mixed deprecated/ok | correct per-key counts |

### `checkStaleDryRun` (6 tests)
| Test | Verifies |
|---|---|
| matching counts | stale = false, reason = undefined |
| total changed | stale = true, reason mentions "total changed" |
| would_change changed | stale = true, reason mentions "would_change count changed" |
| both mismatched | total check takes priority |
| not stale | reason is undefined |
| zero counts | stale = false |

**Total test count: 49 (was 34 in 84A)**

---

## Dry-run route refactor (84B side effect)

The dry-run route now uses `buildDryRunSummary()` instead of inline counting. No behavior change.

---

## Verification

```bash
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/api-server" run typecheck    # → 0 errors
pnpm --filter "./artifacts/api-server" run test         # → 49/49 passed
pnpm --filter "./artifacts/letrend" run typecheck       # → 0 errors

bash scripts/assert-railway-packaging.sh               # → ✅ pnpm@9.15.9 restored
```

**No apply is executed by tests, on mount, or automatically at any point.**
