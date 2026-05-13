# Phase 79 — Upload-confirm UX and Save Semantics

**Datum:** 2026-05-13  
**Typ:** UI/UX — no API changes, no DB migrations, no dependency changes  
**Baseras på:** `docs/agent-plans/77-canonical-ingest-contract.md`, `docs/agent-plans/78-ingest-contract-type-alignment.md`

---

## Files Changed

- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

---

## UX Changes

### 1. AI-utkast card — renamed and made collapsible

**Before:** Always-expanded card labeled "AI-förhandsgranskning" (visually prominent, always pushes classify form).

**After:** Collapsible card labeled "AI-utkast" — collapsed by default. Header row shows label + "Visa AI-utkast ↓" / "Dölj ↑" toggle button. Content (headline + description + edit note) is only rendered when expanded.

**Why collapsed:** The classify step is the primary CM action. The AI draft copy is supplementary context — the CM already chose the headline implicitly by accepting the concept for classification. Collapsing by default reduces visual noise and scroll distance without hiding the information.

**State:** `showAiDraft: boolean` (`useState(false)`) — one new state hook, minimal complexity. Reset to `false` in `reset()` so reopening the modal always starts collapsed.

**Implementation note:** Toggle is a `<button type="button">` inside the card header. No external library needed. The card uses `overflow: hidden` so collapsed state shows only the header row cleanly.

### 2. Scene count badge

**Where:** Inside the AI-utkast card header row, right of the "AI-utkast" label.

**Text:** `AI hittade {sceneCount} scener`

**Rendering rule:** Only shown when `sceneCount > 0`. `sceneCount` is derived as:
```typescript
const sceneCount = (pendingBackend?.scene_breakdown as unknown[] | undefined)?.length ?? 0;
```
This is a derived value (not a hook), placed after the early return so it only evaluates when the modal is open. `scene_breakdown` is a field on `BackendClip` — its runtime type is untyped JSON so we cast to `unknown[]` for the length read.

When `scene_breakdown` is absent or empty (old concepts, clips without scene breakdown), the badge is not shown.

### 3. Save button labels

**Assign phase — "Bara bibliotek" button:**
- Before: `Bara bibliotek`
- After: `Spara och aktivera` (loading: `Sparar...` — unchanged)

**Assign phase — "Tilldela & spara" button:**
- Before: `Tilldela & spara →`
- After: `Spara, aktivera och tilldela →` (loading: `Sparar...` — now consistent, previously same)

No change to actual save/assign behavior. Only labels changed.

### 4. Helper copy near action buttons

Added immediately above the action button row in the assign phase:

```
Sparade koncept aktiveras direkt i biblioteket.
```

Styled as `fontSize: 11, color: '#6b7280', textAlign: 'right'` — subtle, right-aligned to sit close to the buttons. Does not repeat the concept name or make marketing claims.

---

## Save Semantics Clarified

The existing `saveConceptToLibrary()` already posts `is_active: true` to `/api/admin/concepts`. The old "Bara bibliotek" label implied library-only storage without activation — which was inaccurate. The new labels ("Spara och aktivera") correctly describe what happens: the concept is immediately active in the CM library after save.

This change is documentation-only from a behavior perspective. No code path for save was modified.

---

## Deprecated Fields Verification

Checked via grep across all letrend UI components:

- `estimatedBudget` — not rendered in any component (only in type definitions with `@deprecated`)
- `trendLevel` — not rendered in any component (only in type definitions with `@deprecated`)

Both fields appear only in `ClipOverride` JSDoc (Phase 78) and nowhere in the upload-confirm or library display flow. No removal needed.

---

## Behavior Preserved

| Item | Status |
|---|---|
| Analyze/enrich flow | Unchanged |
| Assign flow (customer list, search, selection) | Unchanged |
| Close button behavior | Unchanged — `handleClose` guards on `busy` |
| Classification step fields and logic | Unchanged |
| `handleSaveToLibrary` / `handleSaveAndAssign` | Unchanged — only button labels changed |
| `buildOverrides` / `saveConceptToLibrary` | Unchanged |
| Humor-enrich fire-and-forget | Unchanged |
| `/admin/demos` | Not touched |
| Step indicator | Unchanged |

---

## Verification

### Commands run

```bash
# Local pnpm override applied (not committed)
node -e "...p.packageManager='pnpm@10.26.1'..."

pnpm --filter "./artifacts/letrend" run typecheck
# → 0 errors

PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
# → ✓ built in ~39s

bash scripts/assert-railway-packaging.sh
# → ✅ All checks passed — safe to commit for Railway

# package.json restored to pnpm@9.15.9 before commit
```

---

## Remaining Work for Phase 80

Phase 80 targets API contract hardening on the Express side. Based on the Phase 77 mismatch list:

1. **`/api/admin/concepts` POST** — validate `overrides` payload against `ClipOverride` shape (Zod); reject unknown keys; strip deprecated fields (`estimatedBudget`, `trendLevel`, `hasScript`) before DB write
2. **`/api/studio/concepts/enrich` POST** — ensure response `overrides` always includes `mechanism` key (currently may be absent when Gemini skips it — Phase 78 made client tolerant; Phase 80 should make server explicit)
3. **Ingest run stage tracking** — add `stage: 'classify' | 'assign' | 'saved'` writes at appropriate points so failed uploads can be resumed
4. **`scene_breakdown` passthrough** — verify `backend_data.scene_breakdown` is stored in DB `backend_data` JSONB column (currently round-trips through client but not explicitly validated server-side)
5. **`CANONICAL_OVERRIDES_VERSION`** — add `overrides_version: 'v1'` to POST body and store in DB `overrides` JSONB for future migration guards

Files expected in Phase 80:
- `artifacts/api-server/src/routes/admin/concepts.ts`
- `artifacts/api-server/src/routes/studio.ts`
- Possibly `artifacts/api-server/src/lib/overrides-schema.ts` (new — shared Zod schema for ClipOverride validation)
