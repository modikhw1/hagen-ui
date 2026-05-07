# Phase 37 — Objective Metadata Backfill Readiness

## Background

Phase 35 fixed ConceptCard badges to only show CM-confirmed values (from `raw_overrides`).
Phase 36 fixed `script_mode` filters to only match explicitly confirmed values.

The result: old concepts in the library (ingested before the objective field flow) have no
`script_mode`, `setup_complexity`, `skill_required`, or `setting` in their DB overrides, so
they never appear under specific mode filters and never show objective badges.

This phase prepares a safe, supervised backfill strategy.

---

## New Code

### `artifacts/letrend/src/lib/objective-metadata-backfill.ts`

Exports:
- `computeObjectiveBackfillPatch(clip, overrides)` → `ObjectiveBackfillPatch`
  - Only proposes fields missing from overrides
  - Never overwrites existing CM-confirmed values
  - Returns provenance per field: `sigma | inferred | legacy_hasScript`
  - Omits fields with no reliable signal
- `hasMissingObjectiveFields(patch)` → `boolean` — quick check if patch is non-empty
- `patchToOverrideDelta(patch)` → `Partial<ClipOverride>` — flat delta ready to merge

**Provenance levels:**

| Provenance | Source | Trust level |
|---|---|---|
| `sigma` | `sigma_taste.replicability_decomposed` or narrative/hook signals | High — AI-analyzed |
| `inferred` | Transcript word-count (>60 words → long_dialogue) | Medium — rule-based |
| `legacy_hasScript` | `script.hasScript = true` but no transcript | Low — legacy boolean |

**Safety contract:**
- Fields already in `overrides` are unconditionally skipped
- `scene_breakdown`-only fallback (no hasScript, no transcript, no sigma) is omitted — too weak
- The caller decides which provenance levels to apply (e.g. only `sigma` for first run)

### Unit Tests

**File:** `src/lib/__tests__/objective-metadata-backfill.test.ts`

~30 tests across 5 describe blocks. All pass.

---

## Step 1 — Inventory SQL (read-only)

Run these queries via Supabase MCP or SQL editor. All are read-only `SELECT` — no writes.

### 1a. Overall counts

```sql
SELECT
  COUNT(*)                                                          AS total_active,
  COUNT(*) FILTER (WHERE overrides->>'script_mode' IS NOT NULL)    AS has_script_mode,
  COUNT(*) FILTER (WHERE overrides->>'setup_complexity' IS NOT NULL) AS has_setup_complexity,
  COUNT(*) FILTER (WHERE overrides->>'skill_required' IS NOT NULL)  AS has_skill_required,
  COUNT(*) FILTER (WHERE overrides->>'setting' IS NOT NULL)         AS has_setting
FROM concepts
WHERE is_active = true;
```

### 1b. Missing field × sigma availability matrix

```sql
SELECT
  COUNT(*) AS total_active,

  -- Missing script_mode
  COUNT(*) FILTER (WHERE overrides->>'script_mode' IS NULL)
    AS missing_script_mode,
  COUNT(*) FILTER (
    WHERE overrides->>'script_mode' IS NULL
      AND backend_data->'sigma_taste' IS NOT NULL
  ) AS missing_script_mode_has_sigma,
  COUNT(*) FILTER (
    WHERE overrides->>'script_mode' IS NULL
      AND backend_data->'sigma_taste'->'narrative_flow'->'beat_progression'->>'type'
          = 'dialogue_escalation'
  ) AS missing_script_mode_dialogue_escalation,
  COUNT(*) FILTER (
    WHERE overrides->>'script_mode' IS NULL
      AND backend_data->'sigma_taste'->'hook_analysis'->>'hook_style' = 'text_overlay'
  ) AS missing_script_mode_hook_text_overlay,
  COUNT(*) FILTER (
    WHERE overrides->>'script_mode' IS NULL
      AND (
        backend_data->'script'->>'transcript' IS NOT NULL
        OR backend_data->'script'->>'conceptCore' IS NOT NULL
      )
  ) AS missing_script_mode_has_transcript,
  COUNT(*) FILTER (
    WHERE overrides->>'script_mode' IS NULL
      AND (backend_data->'script'->>'hasScript')::boolean = true
  ) AS missing_script_mode_legacy_has_script,

  -- Missing setup_complexity
  COUNT(*) FILTER (WHERE overrides->>'setup_complexity' IS NULL)
    AS missing_setup_complexity,
  COUNT(*) FILTER (
    WHERE overrides->>'setup_complexity' IS NULL
      AND backend_data->'sigma_taste'->'replicability_decomposed'
            ->'environment_requirements'->>'setup_complexity' IS NOT NULL
  ) AS missing_setup_complexity_has_sigma,

  -- Missing skill_required
  COUNT(*) FILTER (WHERE overrides->>'skill_required' IS NULL)
    AS missing_skill_required,
  COUNT(*) FILTER (
    WHERE overrides->>'skill_required' IS NULL
      AND backend_data->'sigma_taste'->'replicability_decomposed'
            ->'actor_requirements'->>'skill_level' IS NOT NULL
  ) AS missing_skill_required_has_sigma,

  -- Missing setting
  COUNT(*) FILTER (WHERE overrides->>'setting' IS NULL)
    AS missing_setting,
  COUNT(*) FILTER (
    WHERE overrides->>'setting' IS NULL
      AND backend_data->'sigma_taste'->'replicability_decomposed'
            ->'environment_requirements'->>'backdrop_interchangeability' IS NOT NULL
  ) AS missing_setting_has_sigma

FROM concepts
WHERE is_active = true;
```

### 1c. Sample of backfill candidates (dry-run preview, LIMIT 20)

```sql
SELECT
  id,
  created_at,
  overrides->>'source' AS source,
  overrides->>'script_mode' AS current_script_mode,
  backend_data->'sigma_taste'->'narrative_flow'->'beat_progression'->>'type'
    AS sigma_beat_type,
  backend_data->'sigma_taste'->'hook_analysis'->>'hook_style'
    AS sigma_hook_style,
  backend_data->'sigma_taste'->'replicability_decomposed'
    ->'environment_requirements'->>'setup_complexity'
    AS sigma_setup_complexity,
  backend_data->'sigma_taste'->'replicability_decomposed'
    ->'actor_requirements'->>'skill_level'
    AS sigma_skill_level,
  backend_data->'sigma_taste'->'replicability_decomposed'
    ->'environment_requirements'->>'backdrop_interchangeability'
    AS sigma_backdrop
FROM concepts
WHERE
  is_active = true
  AND (
    overrides->>'script_mode' IS NULL
    OR overrides->>'setup_complexity' IS NULL
    OR overrides->>'skill_required' IS NULL
    OR overrides->>'setting' IS NULL
  )
ORDER BY created_at DESC
LIMIT 20;
```

### 1d. Concepts fully covered (no backfill needed)

```sql
SELECT COUNT(*) AS fully_covered
FROM concepts
WHERE
  is_active = true
  AND overrides->>'script_mode' IS NOT NULL
  AND overrides->>'setup_complexity' IS NOT NULL
  AND overrides->>'skill_required' IS NOT NULL
  AND overrides->>'setting' IS NOT NULL;
```

### 1e. Sigma coverage — concepts with flattened vs nested sigma_taste

```sql
-- Older clips may have replicability_decomposed at the top level of backend_data
-- rather than nested under sigma_taste. This query identifies them.
SELECT
  COUNT(*) FILTER (WHERE backend_data->'sigma_taste' IS NOT NULL)
    AS nested_sigma,
  COUNT(*) FILTER (WHERE backend_data->'replicability_decomposed' IS NOT NULL)
    AS flattened_sigma,
  COUNT(*) FILTER (
    WHERE backend_data->'sigma_taste' IS NULL
      AND backend_data->'replicability_decomposed' IS NULL
  ) AS no_sigma
FROM concepts
WHERE is_active = true;
```

---

## Step 2 — Backfill Strategy (Phased)

### Phase A: Inventory (now)
Run the SQL queries above via Supabase MCP. Record:
- Total active concepts
- How many are missing each objective field
- How many have sigma signals available for the missing fields
- How many have only legacy/transcript fallbacks

### Phase B: Dry-run (no writes)
For a sample of 20–50 backfill candidates:
1. Fetch `id`, `backend_data`, `overrides` from Supabase
2. Run `computeObjectiveBackfillPatch(backend_data, overrides)` in Node.js
3. Log the proposed patches + provenance to console
4. Verify: no concept with existing overrides receives a change; only missing fields proposed

### Phase C: Manual review sample
Pick 5–10 concepts from the dry-run output and review:
- Does the proposed `script_mode` match the actual video content?
- Is the `setup_complexity` plausible given the concept description?
- Flag any mismatches — they indicate sigma signals that need more validation

### Phase D: Staged apply (sigma-only, limited)
Run backfill for only the `sigma` provenance tier first (highest confidence):
- Only update concepts where the proposed provenance is `sigma`
- Only set fields that are `null` in current overrides — never overwrite
- Batch in groups of 20–50 with a dry-run log before each batch
- Merge into `overrides` via `JSONB || jsonb_build_object(...)` to preserve all other override fields

```sql
-- Example targeted update (run only after dry-run validation):
-- DO NOT run without reviewing the dry-run output first.
--
-- UPDATE concepts SET
--   overrides = overrides ||
--     jsonb_build_object(
--       'script_mode',
--       backend_data->'sigma_taste'->'narrative_flow'->'beat_progression'->>'type'
--         CASE WHEN ... THEN 'long_dialogue' ELSE ... END
--     )
-- WHERE
--   is_active = true
--   AND overrides->>'script_mode' IS NULL
--   AND backend_data->'sigma_taste'->'narrative_flow'->'beat_progression'->>'type'
--       = 'dialogue_escalation'
-- RETURNING id, overrides->>'script_mode';
```

The actual UPDATE should be generated by the orchestrator from dry-run results, not
written here as a template. Each batch requires explicit human approval.

### Phase E: Legacy/inferred tier (optional, later)
After sigma backfill is validated:
- Run `inferred` provenance concepts (transcript-based)
- These require more spot-checking since transcript quality varies
- `legacy_hasScript` tier: lowest priority; only run after explicit sign-off

---

## Safety Invariants

1. **Never overwrite existing overrides** — `computeObjectiveBackfillPatch` enforces this in code.
2. **JSONB merge, not replace** — any DB update must use `overrides || new_jsonb` not `SET overrides = new_jsonb`.
3. **Dry-run before every batch** — log proposed changes, get human eyes on a sample.
4. **Start small** — first live run: 20–50 concepts, sigma-only.
5. **Rollback plan** — Supabase retains point-in-time recovery; record pre-backfill `overrides` for any updated row.

---

## Orchestrator Next Steps

1. Run the inventory SQL (Step 1a–1e) via Supabase MCP.
2. Report back: how many concepts are missing each field? How many have sigma coverage?
3. Based on counts, decide if a staged backfill is worth running or if re-ingest is preferable.
4. If backfill: run `computeObjectiveBackfillPatch` in a Node.js script against fetched rows.
5. Review dry-run output. Approve sigma-only batch. Apply.
