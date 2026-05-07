# Phase 33 — Nullable Objective Cleanup & AI Trend Deprecation

## Scope

Two focused cleanup fixes: (1) correct clearing of nullable objective fields in concept review,
(2) remove the AI trend badge from CM-facing workspace concept cards. Plus a full audit of
remaining `estimatedBudget` / `trendLevel` usages to classify legacy vs active.

---

## 1. Nullable Objective Field Clearing Fix

**File:** `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`

**Bug:** `...(raw.overrides ?? {})` spreads the full existing overrides into `newOverrides`.
Previously, nullable fields (`setup_complexity`, `skill_required`, `setting`) were only written
with `...(fieldVal ? { field: fieldVal } : {})` — meaning if a value was previously stored
and the user toggled it off (back to null), the old key was kept alive from the spread.

**Fix:** After building `newOverrides`, apply explicit conditional delete:
```typescript
if (setupComplexity)  { newOverrides['setup_complexity'] = setupComplexity; }
else                  { delete newOverrides['setup_complexity']; }
if (skillRequired)    { newOverrides['skill_required'] = skillRequired; }
else                  { delete newOverrides['skill_required']; }
if (settingVal)       { newOverrides['setting'] = settingVal; }
else                  { delete newOverrides['setting']; }
```

`script_mode` is NOT nullable — always written explicitly.

---

## 2. AI Trend Badge Removed

**File:** `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

Removed the conditional trend badge from concept library cards:
```tsx
// REMOVED:
{concept.trendLevel >= 4 && (
  <span style={{ ...amber badge... }}>
    {display.trendLevel(concept.trendLevel).icon} {display.trendLevel(concept.trendLevel).label}
  </span>
)}
```

`trendLevel` is still computed in `translateClipToConcept` and present in `TranslatedConcept` —
it's not removed from the model, only from this CM-facing display surface.

---

## 3. Legacy Budget / Trend Audit

### `estimatedBudget`

| Location | Status | Notes |
|---|---|---|
| `translator.ts: TranslatedConcept.estimatedBudget` | **Legacy/backcompat** | Still computed, returned in object. Old concepts may have it in overrides. |
| `translator.ts: ClipOverride.estimatedBudget` | **Legacy/backcompat** | Accepted from old overrides, never written by new UI. |
| `translator.ts: translateWhyItFits()` | **Legacy/backcompat** | Uses `estimatedBudget` to generate whyItFits text. Safe to keep. |
| `translator.ts: translateBudget()` | **Legacy/backcompat** | Compute-only, not surfaced in UI. |
| `concept-enrichment.ts: BUDGET_VALUES` | **Legacy/backcompat** | Exported but no active UI uses it. Comment says kept for backward compat. |
| `display.ts: budget()` | **Legacy/backcompat** | Display helper still works, no active surface uses it. |
| `mocks/data.ts` | **Mock data** | Used only for development mocks, not production. |

### `trendLevel`

| Location | Status | Notes |
|---|---|---|
| `translator.ts: TranslatedConcept.trendLevel` | **Legacy/backcompat** | Still computed, safe to keep. |
| `translator.ts: ClipOverride.trendLevel` | **Legacy/backcompat** | Accepted from old overrides. |
| `conceptLoader.ts: trending bucket` | **Legacy/inactive** | Filters `trendLevel >= 4` into a "trending" bucket. Used only by `/studio/concepts/[id]/edit/page.tsx` (legacy page). |
| `conceptLoaderDB.ts: trending bucket` | **Legacy/inactive** | Same pattern — feeds legacy `/studio/concepts/[id]/page.tsx`. |
| `CustomerWorkspaceContent.tsx` | **REMOVED** (this phase) | Trend badge removed from concept library cards. |
| `display.ts: trendLevel()` | **Legacy/backcompat** | Display helper kept, no active surface consumes it after this phase. |
| `mocks/data.ts` | **Mock data** | Not production. |

### Legacy Pages (keep as-is, minimum change)

| Page | Route | Status | Trend usage |
|---|---|---|---|
| `app/studio/concepts/[id]/page.tsx` | `/studio/concepts/:id` | **Legacy CM page** — uses `loadConceptById` from `conceptLoaderDB`. Routed but superseded by `/studio/concepts/:id/review`. | `trend_level` in form, writes to overrides via its own PATCH. Internal only, not CM-facing. |
| `app/studio/concepts/[id]/edit/page.tsx` | `/studio/concepts/:id/edit` | **Legacy CM page** — uses `loadConcepts` from `conceptLoader`. Routed but superseded by review page. | `trendLevel` in form. Internal only, not CM-facing. |

**Decision:** Keep both legacy pages unmodified. They are CM-internal pages with no customer visibility.
Any cleanup should be a dedicated "legacy page removal" task, not mixed into ingest phases.

---

## Remaining Next Steps

1. **Legacy page removal** — `/studio/concepts/:id` and `/studio/concepts/:id/edit` can be removed
   once CMs have fully migrated to the review page. Update `App.tsx` routing + delete the files.
2. **trending bucket removal** — Once legacy pages are removed, the `trending` bucket in
   `conceptLoader.ts` and `conceptLoaderDB.ts` can be deleted.
3. **estimatedBudget / trendLevel purge** — Once no live surface uses them, remove from
   `TranslatedConcept`, `ClipOverride`, and `translateClipToConcept`. Keep `hasScript` indefinitely.
4. **script_mode filter in /studio/concepts page** — The shared concept library at `/studio/concepts`
   doesn't yet expose granular script_mode filtering. Candidate for Phase 34.
