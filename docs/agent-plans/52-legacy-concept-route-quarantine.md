# Phase 52 — Legacy Concept Route Quarantine

**Date**: 2026-05-07

---

## Background

Phases 49–51 verified the new reanalyze / objective-field / save / suppression flow
end-to-end via `/studio/concepts/:id/review` and `PATCH /api/admin/concepts/:id`.

Two legacy pages remained active and could still write the deprecated `trendLevel`
field to `overrides`:

| Route | Write path | Deprecated field |
|---|---|---|
| `/studio/concepts/:id` | `PATCH /api/studio-v2/library-concepts/:id` | `trend_level` → `overrides.trendLevel` |
| `/studio/concepts/:id/edit` | `PUT /api/admin/concepts/:id` | `overrides.trendLevel` (direct) |

`trendLevel` was removed from Hagen's enrich contract in Phase 47. Allowing legacy
pages to continue writing it would create stale `overrides.trendLevel` entries that
could resurface in future data reads or exports.

---

## Changes

### 1. `artifacts/letrend/src/app/studio/concepts/[id]/page.tsx`

**Before**: Full legacy edit form (~355 lines) with `trend_level: number` field,
saving via `PATCH /api/studio-v2/library-concepts/:id`.

**After**: Minimal redirect component (~30 lines):
```tsx
useEffect(() => {
  if (conceptId) router.replace(`/studio/concepts/${conceptId}/review`);
}, [conceptId, router]);
```

All existing bookmarks/links to `/studio/concepts/:id` land on the review page.
No form is rendered; no save is possible.

### 2. `artifacts/letrend/src/app/studio/concepts/[id]/edit/page.tsx`

**Before**: Full tabbed edit form (~500+ lines) with `trendLevel: number` field,
saving via `PUT /api/admin/concepts/:id` with `overrides.trendLevel` in the body.

**After**: Same minimal redirect pattern → `/studio/concepts/:id/review`.

### 3. `artifacts/api-server/src/routes/studio-v2.ts` — `PATCH /api/studio-v2/library-concepts/:id`

**Before** (line 1814):
```ts
if (typeof body.trend_level === 'number') patch.trendLevel = body.trend_level;
```

**After**: Line removed. Deprecation documented in a comment:
```ts
// NOTE: `trend_level` / `trendLevel` intentionally omitted — deprecated in Phase 52.
// Hagen removed trendLevel from the enrich contract (Phase 47). The legacy UI routes
// that sent trend_level (/studio/concepts/:id and /studio/concepts/:id/edit) now
// redirect to /studio/concepts/:id/review and never reach this handler.
```

The handler is not deleted — it still processes `headline_sv`, `difficulty`,
`filmTime`, `peopleNeeded`, `whyItWorks_sv`, `targetAudience_sv` — in case any
non-UI callers (scripts, integrations) still use it for those valid fields.

---

## Why trendLevel Write Path Was Closed

1. **Hagen Phase 47** removed `trendLevel` from `suggested_overrides` — the field
   is no longer part of the enrich contract.
2. **Phase 49–51** confirmed that the new objective fields (`script_mode`,
   `setup_complexity`, `skill_required`, `setting`) work correctly end-to-end.
3. Continuing to allow `trendLevel` writes would create inconsistent `overrides`
   state: some concepts would have a confirmed `trendLevel` that Hagen's enrich
   never proposes, confusing suppression logic.
4. No current CM workflow needs `trendLevel` — the review page never renders or
   saves it.

---

## Intentionally Left for Backward Compatibility

These references are **read-only or type-only** — they do not write to the DB:

| File | Usage | Why kept |
|---|---|---|
| `src/lib/conceptLoader.ts` | `trendLevel` field in `TranslatedConcept` interface | Required for backward-compat with any concept that still has `overrides.trendLevel` (read display only) |
| `src/lib/conceptLoaderDB.ts` | Reads `overrides.trendLevel` when building `TranslatedConcept` | Same — display only |
| Type definitions in old forms | Already quarantined (pages now redirect) | N/A |

Legacy `overrides.trendLevel` values already in the DB are harmless — they are
never surfaced in the review page UI and will not interfere with the new
objective fields.

---

## `rg` Verification

After changes, no active UI route writes `trend_level` or `trendLevel`:

```
rg "trend_level|trendLevel" artifacts/letrend/src/app/studio/concepts/ --include="*.tsx"
```

Expected output: only matches in `/review/` page (read-only display of confirmed
`trendLevel` if present — not writable) and the two quarantine pages (no form, no save).

```
grep -n "patch\.trendLevel" artifacts/api-server/src/routes/studio-v2.ts
```

Expected output: 0 matches.

---

## Typecheck Status

```
pnpm --filter @workspace/api-server exec tsc --noEmit  → 0 errors ✅
pnpm --filter @workspace/letrend exec tsc --noEmit     → 0 errors ✅
```

---

## Phase 53 Readiness

With legacy routes quarantined and the `trendLevel` write path closed:
- The full concept lifecycle now flows exclusively through `/studio/concepts/:id/review`
- All suggested overrides come from `suggested_overrides` (never from `backend_data` fallback)
- Confirmed fields are correctly suppressed on subsequent reanalyze
- No deprecated fields can be written via active UI routes
