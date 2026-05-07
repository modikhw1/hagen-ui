# Phase 51 — Reanalyze Admin Save Route Smoke

**Date**: 2026-05-07
**Hagen git_sha**: `d9c828becc191f7aeebae51495301a621fa04a01` (d9c828be)
**Concept used**: `clip-contraband-coffee`

---

## Distinction from Phase 50

| | Phase 50 | Phase 51 |
|---|---|---|
| Save path | Direct Supabase REST (`PATCH /rest/v1/concepts`) | Actual app route (`PATCH /api/admin/concepts/:id`) |
| GET verify | Direct Supabase REST (`GET /rest/v1/concepts`) | Actual app route (`GET /api/admin/concepts/:id`) |
| Auth | Supabase service role key (bypasses RLS) | Admin JWT (same auth as review page) |

Phase 51 exercises the exact code path the review page uses, including Express middleware,
`requireAuth`, `requireRole(['admin'])`, and the `patchHandler` allowlist
(`backend_data`, `overrides`, `is_active`, `source`).

---

## 1. Pre-conditions

| Item | Status |
|---|---|
| Hagen Railway live at sha `d9c828be` | ✅ |
| `GET /api/admin/concepts/clip-contraband-coffee` returns `{ concept: {...} }` | ✅ |
| All 4 objective fields absent from `overrides` before test | ✅ |
| Snapshot saved from admin GET | ✅ |

### Concept state via `GET /api/admin/concepts/:id` (before smoke)

```json
{ "concept": { "version": 3, "overrides": { ...17 keys... } } }
```

Missing: `script_mode`, `setup_complexity`, `skill_required`, `setting`

---

## 2. Reanalyze Call 1

```
POST /api/studio/concepts/clip-contraband-coffee/reanalyze
Authorization: Bearer <admin JWT>
```

**Elapsed**: ~17 s (`full_reanalyze`)

### `suggested_overrides`

```json
{
  "mechanism": "deadpan",
  "script_mode": "short_dialogue",
  "setup_complexity": "point_and_shoot",
  "skill_required": "acting_required",
  "setting": "similar_venue_type"
}
```

| Field | Result |
|---|---|
| `script_mode` | ✅ `short_dialogue` |
| `setup_complexity` | ✅ `point_and_shoot` |
| `skill_required` | ✅ `acting_required` |
| `setting` | ✅ `similar_venue_type` |
| `trendLevel` | ✅ absent |
| `estimatedBudget` | ✅ absent |

---

## 3. Save via `PATCH /api/admin/concepts/:id`

Emulating review page "Tillämpa alla" + "Spara":

```
PATCH /api/admin/concepts/clip-contraband-coffee
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "overrides": { ...existing 17 keys..., "script_mode": "short_dialogue",
                 "setup_complexity": "point_and_shoot",
                 "skill_required": "acting_required",
                 "setting": "similar_venue_type" },
  "backend_data": { ...fresh from reanalyze response... }
}
```

### PATCH response `{ "concept": {...} }`

```
concept.version: 3
overrides count: 21
  ✅ script_mode: short_dialogue
  ✅ setup_complexity: point_and_shoot
  ✅ skill_required: acting_required
  ✅ setting: similar_venue_type
```

The admin PATCH route returns `{ concept: data }` — same shape as GET.

---

## 4. Reload via `GET /api/admin/concepts/:id`

```
GET /api/admin/concepts/clip-contraband-coffee
Authorization: Bearer <admin JWT>
```

```
version: 3
overrides keys: 21
  ✅ script_mode: short_dialogue
  ✅ setup_complexity: point_and_shoot
  ✅ skill_required: acting_required
  ✅ setting: similar_venue_type
```

All 4 fields persisted correctly in the DB and returned via the admin route.

---

## 5. Reanalyze Call 2 — Suppression

```
POST /api/studio/concepts/clip-contraband-coffee/reanalyze
```

**Elapsed**: ~18 s

### `suggested_overrides`

```json
{ "mechanism": "contrast" }
```

| Field | Expected | Got |
|---|---|---|
| `script_mode` | SUPPRESSED | ✅ absent |
| `setup_complexity` | SUPPRESSED | ✅ absent |
| `skill_required` | SUPPRESSED | ✅ absent |
| `setting` | SUPPRESSED | ✅ absent |
| `trendLevel` | absent | ✅ absent |
| `estimatedBudget` | absent | ✅ absent |

**Suppression confirmed via the actual app save path.** Once a CM saves through
`PATCH /api/admin/concepts/:id`, subsequent reanalyze correctly excludes those
confirmed fields from `suggested_overrides`.

**UI state**: `getSuggestionState` → `'suppressed'` (only `mechanism` in
`suggested_overrides`, which is not in `SuggestableFields`). The panel
shows "Inga förslag" — exactly correct.

---

## 6. Data Restoration

Concept restored to original state via the same admin PATCH route:

```
PATCH /api/admin/concepts/clip-contraband-coffee
{ original overrides (17 keys), original backend_data }
```

**Result**: `RESTORE OK — overrides keys: 17`
All 4 objective fields back to absent. `clip-contraband-coffee` is in its pre-test state.

---

## 7. Admin Route — PATCH Handler Notes

Relevant implementation in `artifacts/api-server/src/routes/admin/concepts.ts` (lines 166–223):

- Allowlist: `backend_data`, `overrides`, `is_active`, `source`
- Auth: `requireAuth` + `requireRole(['admin'])` (CM_ONLY)
- Response: `{ concept: data }` (Supabase `.select().single()` result)
- No version increment — version field managed by DB trigger or left at current value

---

## 8. Test Status

| Test | Method | Result |
|---|---|---|
| Snapshot via `GET /api/admin/concepts/:id` | Admin HTTP | ✅ |
| Reanalyze call 1 — 4 fields present | Live API | ✅ |
| Reanalyze call 1 — trendLevel/estimatedBudget absent | Live API | ✅ |
| PATCH via `PATCH /api/admin/concepts/:id` | Admin HTTP (JWT) | ✅ |
| PATCH response — 4 fields in `concept.overrides` | Admin route response | ✅ |
| Reload via `GET /api/admin/concepts/:id` — all 4 persisted | Admin HTTP | ✅ |
| Reanalyze call 2 — all 4 fields suppressed | Live API | ✅ |
| Restore via `PATCH /api/admin/concepts/:id` | Admin HTTP | ✅ |
| API server typecheck | `tsc --noEmit` | ✅ 0 errors |
| Frontend typecheck | `tsc --noEmit` | ✅ 0 errors |

---

## 9. Phase 52 Readiness

Phase 51 confirms that the full app save path works correctly end-to-end for
the new objective fields. The next step is Phase 52: quarantine or redirect
legacy concept pages (`/studio/concepts/:id` and `/studio/concepts/:id/edit`)
that could still write `trendLevel` to `overrides`.
