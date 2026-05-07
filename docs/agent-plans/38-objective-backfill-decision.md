# Phase 38 — Objective Backfill Decision

## Live Inventory (May 2026)

Orchestrator ran the Phase 37 SQL inventory against the live Supabase DB.

| Metric | Count |
|---|---|
| Active concepts total | 26 |
| overrides.script_mode set | 0 |
| overrides.setup_complexity set | 0 |
| overrides.skill_required set | 0 |
| overrides.setting set | 0 |
| backend_data with nested sigma_taste | 0 |
| backend_data with flattened replicability_decomposed | 0 |
| source=hagen, no script object, has scene_breakdown | 22 |
| source=cm_created, has script object/text | 4 |

**Key finding:** Zero concepts have sigma data in any form. The 22 hagen concepts
contain only scene_breakdown metadata. The 4 cm_created concepts have script text
but were not ingested through the Phase 34+ objective field flow.

---

## Decision: No Bulk Backfill

### Reason 1 — Sigma backfill impossible

All 22 hagen concepts have zero sigma signal (`sigma_taste` and `replicability_decomposed`
both absent). The Phase 37 helper's `sigma` provenance tier — which covers
`setup_complexity`, `skill_required`, `setting`, and `script_mode` from beat/hook signals —
cannot produce any candidates for these concepts.

### Reason 2 — scene_breakdown fallback deliberately excluded

The original `readScriptMode` fallback uses `scene_breakdown.*.audio` to infer
`visual_only` vs `none`. This signal is:
- Unreliable at scale (audio field may be empty for visual-only clips too)
- Ambiguous (`none` and `visual_only` are both plausible for the same clip)
- Not endorsed for unsupervised backfill in the safety contract

Scene-breakdown-only backfill remains excluded from the helper by design.

### Reason 3 — legacy_hasScript removed

Phase 38 removes the `legacy_hasScript` provenance tier from the helper entirely.
`hasScript=true` without a transcript is ambiguous:
- A `text_overlay` clip may have `hasScript=true` (the overlay is considered script)
- A `long_dialogue` clip obviously has `hasScript=true`
- A clip miscategorised as `hasScript=true` (data entry error) should not receive
  a permanent classification based on that flag

Proposing `script_mode: none` for `hasScript=true` clips would be systematically wrong.

### Reason 4 — transcript-inferred backfill limited to cm_created

The 4 `cm_created` concepts have script text and could in principle receive
`script_mode: inferred` from word-count analysis. However:
- These should go through the review flow (`/studio/concepts/:id/review`) instead
- A CM familiar with the concept can confirm the correct mode in 30 seconds
- Automated classification without human review is lower quality than the existing flow

---

## What the Helper Now Supports

After Phase 38 corrections:

| Signal | Provenance | Included? |
|---|---|---|
| sigma narrative beat (dialogue_escalation) | `sigma` | ✅ — when sigma available |
| sigma hook_style (text_overlay) | `sigma` | ✅ — when sigma available |
| transcript word-count >60 | `inferred` | ✅ — when transcript available |
| transcript word-count ≤60 | `inferred` | ✅ — when transcript available |
| hasScript=true, no transcript | ~~legacy_hasScript~~ | ❌ removed — too ambiguous |
| scene_breakdown only | — | ❌ excluded — too unreliable |
| sigma replicability_decomposed.* | `sigma` | ✅ — when sigma available |

---

## Correct Path Forward

### For the 22 hagen concepts

These concepts were ingested through the pre-Phase 34 pipeline and lack sigma data.
Options:

1. **Re-ingest via UploadConceptModal** — run the concept through the ingest flow again.
   The flow calls `/api/studio/concepts/analyze` (which calls Hagen) and `/api/studio/concepts/enrich`
   (which adds sigma via Gemini). After enrichment, a CM confirms objective fields at the
   classify step and saves them to overrides.

2. **New ingest engine** — if Hagen is updated to return sigma_taste directly in the clip
   payload, future ingests will automatically populate the fields. Existing concepts would
   still need re-ingest or manual review.

3. **Manual review** — a CM visits `/studio/concepts/:id/review` for each concept and
   sets the objective fields manually. No automation needed. For 22 concepts this is
   approximately 30–60 minutes of CM time.

### For the 4 cm_created concepts

These have script text and can be reviewed manually:
- Visit `/studio/concepts/:id/review`
- The review page seeds `script_mode` from `readScriptMode` (transcript-based if available)
- CM confirms or adjusts and saves → fields written to overrides

### Recommended first step

Before any automated work: run the 4 cm_created concepts through manual review.
This validates that the review flow correctly seeds and saves objective fields before
attempting any scale operation on hagen concepts.

---

## Helper Correction Summary (Phase 38)

**File changed:** `artifacts/letrend/src/lib/objective-metadata-backfill.ts`

Removed the `else if (hasScript)` branch that proposed `{ value: 'none', provenance: 'legacy_hasScript' }`.

**Before:** hasScript=true without transcript → propose `script_mode: none (legacy_hasScript)`
**After:** hasScript=true without transcript → omit script_mode from patch

**`BackfillProvenance` type:** `legacy_hasScript` variant remains in the type definition
for forward compatibility (it may be useful in future analysis scripts that need to
distinguish signal sources) but is no longer emitted by the helper.

**Tests updated:** 23 → 25 tests. The "proposes none from hasScript" assertion is
replaced by three tests confirming no proposal for hasScript-only, scene_breakdown-only,
and noisy legacy clips.
