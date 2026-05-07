# Phase 50 — Reanalyze Save / Reload / Suppression Roundtrip Smoke

**Date**: 2026-05-07
**Hagen git_sha**: `d9c828becc191f7aeebae51495301a621fa04a01` (d9c828be)
**Concept used**: `clip-contraband-coffee`

---

## 1. Pre-conditions

| Item | Status |
|---|---|
| Hagen Railway live at sha `d9c828be` | ✅ |
| All 4 objective fields absent from `overrides` before test | ✅ |
| Snapshot saved locally at `/tmp/concept_snapshot.json` | ✅ |

### Concept state before smoke (overrides keys, 17 total)

`businessTypes`, `description_sv`, `difficulty`, `estimatedBudget`, `filmTime`, `hasScript`,
`headline_sv`, `isNew`, `market`, `matchPercentage`, `peopleNeeded`, `price`,
`productionNotes_sv`, `script_sv`, `transcript`, `whyItFits_sv`, `whyItWorks_sv`

**NOT confirmed** (target for suppression test): `script_mode`, `setup_complexity`, `skill_required`, `setting`

---

## 2. Reanalyze Call 1

```
POST /api/studio/concepts/clip-contraband-coffee/reanalyze
Authorization: Bearer <admin JWT>
```

**Elapsed**: ~19 s (full video re-analysis via Hagen Railway)

### Response — `suggested_overrides`

```json
{
  "mechanism": "deadpan",
  "script_mode": "short_dialogue",
  "setup_complexity": "point_and_shoot",
  "skill_required": "acting_required",
  "setting": "similar_venue_type"
}
```

| Check | Result |
|---|---|
| `strategy` = `full_reanalyze` | ✅ |
| `script_mode` present | ✅ `short_dialogue` |
| `setup_complexity` present | ✅ `point_and_shoot` |
| `skill_required` present | ✅ `acting_required` |
| `setting` present | ✅ `similar_venue_type` |
| `trendLevel` absent | ✅ |
| `estimatedBudget` absent | ✅ |
| `peopleNeeded` suppressed (confirmed) | ✅ absent |
| `difficulty` suppressed (confirmed) | ✅ absent |
| `filmTime` suppressed (confirmed) | ✅ absent |
| `businessTypes` suppressed (confirmed) | ✅ absent |

---

## 3. Save (PATCH)

Emulating the review page "Tillämpa alla" + Save flow:

- Merged `overrides` = existing 17 keys + 4 new objective fields
- `backend_data` = fresh `backend_data` from reanalyze response
- **PATCH** via Supabase REST (same path as `apiClient`)

```
PATCH /rest/v1/concepts?id=eq.clip-contraband-coffee
{
  "overrides": { ...existing_17_keys..., "script_mode": "short_dialogue",
                 "setup_complexity": "point_and_shoot",
                 "skill_required": "acting_required",
                 "setting": "similar_venue_type" },
  "backend_data": { ...fresh from reanalyze... }
}
```

**Result**: `PATCH OK`, 21 overrides keys confirmed in response.

---

## 4. Reload Verification

```
GET /rest/v1/concepts?select=id,overrides,version&id=eq.clip-contraband-coffee
```

| Field | Persisted |
|---|---|
| `script_mode` | ✅ `short_dialogue` |
| `setup_complexity` | ✅ `point_and_shoot` |
| `skill_required` | ✅ `acting_required` |
| `setting` | ✅ `similar_venue_type` |

All 4 objective fields correctly persisted in `overrides`.

---

## 5. Reanalyze Call 2 (Suppression Check)

```
POST /api/studio/concepts/clip-contraband-coffee/reanalyze
```

**Elapsed**: ~17 s

### Response — `suggested_overrides`

```json
{
  "mechanism": "deadpan"
}
```

| Field | Expected | Got |
|---|---|---|
| `script_mode` | SUPPRESSED (now confirmed) | ✅ absent |
| `setup_complexity` | SUPPRESSED (now confirmed) | ✅ absent |
| `skill_required` | SUPPRESSED (now confirmed) | ✅ absent |
| `setting` | SUPPRESSED (now confirmed) | ✅ absent |
| `trendLevel` | absent | ✅ absent |
| `estimatedBudget` | absent | ✅ absent |

**Suppression works end-to-end.** Once a CM confirms objective fields by saving,
subsequent reanalysis will not re-propose them.

**UI implication**: `getSuggestionState` would return `'suppressed'` (only `mechanism`
is in suggested_overrides, and `mechanism` is not in `SuggestableFields`), so the
panel shows "Inga förslag" / suppressed message — exactly correct.

---

## 6. Data Restoration

This was a QA smoke test. The concept was restored to its original state after verification:

```
PATCH /rest/v1/concepts?id=eq.clip-contraband-coffee
{ original overrides (17 keys), original backend_data }
```

**Result**: `RESTORE OK` — 17 overrides keys, all 4 objective fields absent.
`clip-contraband-coffee` is back to its pre-test state.

---

## 7. Suppression Logic — How It Works

The Express route `POST /api/studio/concepts/:id/reanalyze` (`artifacts/api-server/src/routes/studio.ts`):

1. Fetches concept's current `overrides` from Supabase
2. Forwards to Hagen `/api/studio/concepts/enrich`
3. Hagen's `buildSuggestedOverrides` (in `studio-helpers.ts`) compares enrich output against `overrides`:
   - If a field is already present in `overrides` → **excluded** from `suggested_overrides`
   - If a field is absent from `overrides` → **included** in `suggested_overrides`
4. Response returns `suggested_overrides` as the only source for frontend suggestions
5. Frontend (`buildSuggestionsFromOverrides`) only reads from `suggested_overrides` — never falls back to `backend_data` for confirmed fields

---

## 8. Test Status

| Test | Method | Result |
|---|---|---|
| Reanalyze call 1 — 4 objective fields present | Live API | ✅ |
| Reanalyze call 1 — trendLevel/estimatedBudget absent | Live API | ✅ |
| PATCH — 4 fields persisted in overrides | Supabase PATCH + GET verify | ✅ |
| Reload — all 4 fields confirmed in DB | Supabase GET | ✅ |
| Reanalyze call 2 — all 4 fields suppressed | Live API | ✅ |
| Reanalyze call 2 — trendLevel/estimatedBudget still absent | Live API | ✅ |
| Concept restored to pre-test state | Supabase PATCH + verify | ✅ |
| API server typecheck | `tsc --noEmit` | ✅ 0 errors |
| Frontend typecheck | `tsc --noEmit` | ✅ 0 errors |
