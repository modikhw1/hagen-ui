# Phase 78 — Ingest Contract Type Alignment

**Datum:** 2026-05-13  
**Typ:** Type / constant alignment — no UI changes, no API changes, no DB migrations  
**Baseras på:** `docs/agent-plans/77-canonical-ingest-contract.md`

---

## Files Changed

- `artifacts/letrend/src/lib/translator.ts`
- `artifacts/letrend/src/lib/concept-enrichment.ts`

---

## What Changed

### `artifacts/letrend/src/lib/translator.ts`

#### 1. `CONTENT_TYPE_VALUES` constant (new export)
Added after `BackendContentClassification` interface. Mirrors the `content_type` union of that interface as a const array — preparation for future library filtering. Not yet used in UI or API.

```typescript
export const CONTENT_TYPE_VALUES = [
  'sketch_comedy', 'reaction_content', 'informational', 'interview_format',
  'montage_visual', 'tutorial_how_to', 'testimonial', 'promotional_direct',
  'trend_recreation', 'hybrid',
] as const

export type ContentType = (typeof CONTENT_TYPE_VALUES)[number]
```

#### 2. `scene_count?: number` added to `TranslatedConcept`
Display-only field. Not a DB column. Not rendered in UI yet (Phase 79).

```typescript
/** Display-only. Derived from backend_data.scene_breakdown?.length. Not persisted as a DB column. */
scene_count?: number
```

Derived in `translateClipToConcept`:
```typescript
scene_count: clip.scene_breakdown?.length,
```
Undefined for concepts without scene_breakdown (old concepts, live-translated clips from JSON).

#### 3. `CANONICAL_OVERRIDES_VERSION = 'v1'` constant (new export)
Colocated with `ClipOverride`. Not written to DB yet. Exported for future migration guards.

```typescript
export const CANONICAL_OVERRIDES_VERSION = 'v1' as const
```

#### 4. `ClipOverride` JSDoc and deprecated fields
Restructured with section comments and JSDoc for every field. Three deprecated fields added for parsing old DB records:

| Field | Change |
|---|---|
| `estimatedBudget?: string` | Added as `@deprecated` — old records may have it; never write for new concepts |
| `trendLevel?: number` | Added as `@deprecated` — AI trend inference unreliable; future: manual `trend_status` |
| `hasScript?: boolean` | Marked `@deprecated` — use `script_mode` instead; translator falls back to this |
| All subjective copy fields | Documented as "AI draft. CM-editable in library. Not trusted facts." |
| All objective signal fields | Documented as "AI-proposed, CM-confirmed in upload-confirm modal." |
| `mechanism` | Documented as "AI-set. Not shown in modal. Stored for backend use only." |

`hasScript` was already present in `ClipOverride` — it was moved to the deprecated section with JSDoc. `estimatedBudget` and `trendLevel` are new additions to the type (they existed in DB but were previously untyped, meaning reading them from old records would be `unknown`).

---

### `artifacts/letrend/src/lib/concept-enrichment.ts`

#### 5. `mechanism` made optional in `enrichedConceptSchema`

Before:
```typescript
mechanism: z.enum(MECHANISM_VALUES),  // required
```
After:
```typescript
mechanism: z.enum(MECHANISM_VALUES).optional(),
```

Consequence: `EnrichedConceptOverride.mechanism` is now `HumorMechanism | undefined`. New concept saves do not fail validation when Hagen's Gemini call does not produce a `mechanism` value.

#### 6. `'mechanism'` removed from `ENRICH_CONCEPT_TOOL.parameters.required`

The function declaration sent to Gemini no longer demands mechanism. Gemini may still return it (the property is still declared in `parameters.properties`) — when it does, it is validated against `MECHANISM_VALUES`; when it does not, the fallback value from `buildFallbackEnrichedConcept` is used.

#### 7. `normalizeEnrichedConcept` — mechanism fallback fix

Before:
```typescript
mechanism: candidate.mechanism,
```
After:
```typescript
mechanism: candidate.mechanism ?? fallback.mechanism,
```

Prevents `undefined` from silently overriding the translator-derived fallback when Gemini omits the field. The fallback is computed by `buildFallbackEnrichedConcept` which always returns a `HumorMechanism` via `translateMechanism()`.

---

## What Intentionally Did Not Change

| Item | Reason |
|---|---|
| `peopleNeeded` key name | Retained for backward compat — maps to actor_count semantics but key rename deferred |
| `hasScript` logic in `translateHasScript()` | Still works for old concepts; `readScriptMode()` fallback chain reads it |
| `estimatedBudget` / `trendLevel` in DB records | Not touched — JSONB fields passively ignored |
| Any UI components | Phase 79 scope |
| Any API server routes | Phase 80 scope |
| Any DB migrations | No schema changes needed — all in JSONB |
| `mechanism` in `buildFallbackEnrichedConcept` | Still sets `mechanism: translated.mechanism` — always a valid `HumorMechanism` from translator |
| `BUDGET_VALUES` export | Kept for backward compat (used in display.ts references) |
| `TranslatedConcept.mechanism` type | Still `HumorMechanism` (required) — translator always derives a value |

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

### No tests skipped
There is no existing test suite for these lib files — the primary verification is typecheck (0 errors) and Vite build (clean). Both pass.

---

## Remaining Work for Phase 79

Phase 79 targets upload-confirm UX and data cleanup. Starting from current state:

1. **`UploadConceptModal`** — add read-only preview card for `headline_sv` + `description_sv` in Classify step (collapsed by default, labeled "AI-utkast")
2. **Save button label** — change to "Spara och aktivera" to communicate save = library-active
3. **`scene_count` display** — add read-only info line: "AI hittade X scener" in Classify step (use `scene_count` from `TranslatedConcept`, now available after this phase)
4. **Verify** no remaining `estimatedBudget` UI surface (modal, library, filters) — should already be gone after Phase 31; confirm visually
5. **Verify** `trendLevel` not shown anywhere in letrend UI — should already be gone after Phase 30

Files expected in Phase 79:
- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- Possibly `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx` if headline preview is added there too
