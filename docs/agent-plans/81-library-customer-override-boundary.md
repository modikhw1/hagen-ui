# Phase 81 — Library vs Customer Override Boundary

**Datum:** 2026-05-13  
**Typ:** Clarity / guardrails — no behavior change, no DB migrations, no API changes  
**Baseras på:** `docs/agent-plans/77-canonical-ingest-contract.md`, `docs/agent-plans/80-api-contract-normalization.md`

---

## Files Changed

- `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`
- `artifacts/letrend/src/components/studio/customer-detail/ActiveConceptCard.tsx`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/routes/admin/concepts.ts`

---

## Where Library Edits Are Saved

**Surface:** `/studio/concepts/[id]/review`  
**Component:** `review/page.tsx` — `handleSave()` at line ~349  
**API call:** `PATCH /api/admin/concepts/:id` with `{ overrides: { headline_sv, scriptSv, difficulty, filmTime, ... } }`  
**DB table:** `concepts.overrides` (JSONB)  
**Also:** `PATCH /api/studio-v2/library-concepts/:conceptId` (used by some studio edit flows)

---

## Where Customer-Specific Edits Are Saved

**Surface:** Kundarbete — `ActiveConceptCard` customize modal (opened from the feed slot in the customer workspace)  
**Component:** `ActiveConceptCard.tsx` — `handleSave()` at line ~86  
**API calls:**
- `onPatchConcept(conceptId, { content_overrides: { headline, filming_instructions } })` → `PATCH /api/studio-v2/concepts/:conceptId`
- `onUpdateWhyItFits(conceptId, text)` → `PATCH /api/studio-v2/concepts/:conceptId` (wired via `CustomerWorkspaceContent.handleUpdateConcept`)
- `onUpdateCmNote(conceptId, note)` → assignment note on `customer_concepts`
**DB table:** `customer_concepts.content_overrides` (JSONB)  
**Also:** `UnifiedKundarbeteSection` reads `concept.content_overrides` for display

---

## UI Copy Added

### Library edit surface (`review/page.tsx`)

Added above the Save button row:

```
Ändringar här uppdaterar konceptbiblioteket. Befintliga kundkopplingar ändras inte.
```

Styled: `fontSize: 11, color: '#9ca3af', textAlign: 'right'` — subtle, right-aligned, near the action.

### Customer assignment edit surface (`ActiveConceptCard.tsx`)

Added above the button row in the customize modal:

```
Ändringar här gäller bara denna kundkoppling och påverkar inte bibliotekskonceptet.
```

Styled: `fontSize: 11, color: '#9ca3af'` — consistent with library surface copy tone.

---

## API Separation Confirmed

| Route | Table touched | Propagates to other table? |
|---|---|---|
| `PATCH /api/admin/concepts/:id` | `concepts` only | No |
| `PATCH /api/studio-v2/library-concepts/:conceptId` | `concepts` only | No |
| `PATCH /api/studio-v2/concepts/:conceptId` | `customer_concepts` only | No |
| `POST /api/studio-v2/customers/:id/concepts` | `customer_concepts` (new row) | Pre-populates `content_overrides` from library at creation time only |

The pre-population in `POST /api/studio-v2/customers/:id/concepts` via `buildConceptContentOverrides()` (Phase 80) runs **only at assignment creation** — it is a one-time copy, not a live link. Subsequent library edits do not update the customer's content_overrides.

No propagation exists or was added. This is the intended design.

---

## Comments Added to API Routes

### `artifacts/api-server/src/routes/admin/concepts.ts`

Before `patchHandler`:
```
// PATCH (and PUT alias) /api/admin/concepts/:id
// Updates the concepts library table ONLY — never customer_concepts.
// Existing customer assignments are not affected by library edits.
```

### `artifacts/api-server/src/routes/studio-v2.ts`

Before `PATCH /api/studio-v2/library-concepts/:conceptId`:
```
// This route NEVER touches customer_concepts — library and customer-assignment
// data are intentionally separate. Editing a library concept here does NOT
// propagate changes to existing customer assignments.
```

Before `PATCH /api/studio-v2/concepts/:conceptId`:
```
// Updates a single customer_concepts row ONLY (assignment-specific data).
// This route NEVER touches the concepts library table. content_overrides here
// is per-assignment copy that may diverge from the library after production starts.
```

---

## What Intentionally Did Not Change

| Item | Reason |
|---|---|
| `handleSave` logic in review/page.tsx | Correct already — only PATCHes concepts table |
| `handleSave` logic in ActiveConceptCard.tsx | Correct already — only calls customer_concepts PATCH |
| `CustomerWorkspaceContent.handleUpdateConcept` | Correct already — routes to studio-v2 concepts PATCH |
| `UnifiedKundarbeteSection` | Read-only display of content_overrides; no save action |
| `buildConceptContentOverrides` (Phase 80) | One-time copy at assignment creation; not a live sync |
| DB schema | No changes needed |
| Any behavior path | Phase 81 is clarity-only |
| `/admin/demos` | Not in scope |
| `UploadConceptModal` | Not touched |

---

## Verification

### Commands run

```bash
# Local pnpm override applied (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/letrend" run typecheck
# → 0 errors

PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
# → ✓ built in ~40s

pnpm --filter "./artifacts/api-server" run typecheck
# → 0 errors

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```

---

## Remaining Work for Phase 82

Phase 82 should address the ingest-run stage tracking gaps identified in Phase 80:

1. **Stage writes for classify/assign** — currently only `stage: 'saving'` is written; add `stage: 'classify'` when classify step completes and `stage: 'assigned'` after customer assignment succeeds
2. **`scene_breakdown` round-trip** — verify `backend_data.scene_breakdown` survives the POST round-trip and is readable for `scene_count` display in the library card view
3. **`overrides_version` in library list/detail GET** — confirm `overrides_version` is present in responses so CMs can see which concepts are on the new contract
4. **`hagen_request_id` passthrough** — propagate `requestId` from `fetchHagenJson` into ingest run metadata for cross-service debugging
5. **Batch normalization script** — identify and normalize pre-v1 concepts (no `overrides_version` key) without a DB schema migration

Files expected in Phase 82:
- `artifacts/api-server/src/routes/studio.ts` (stage writes)
- `artifacts/api-server/src/routes/admin/concepts.ts` (GET enrichment)
- Possibly `artifacts/api-server/src/lib/ingest-runs.ts` (stage constants)
