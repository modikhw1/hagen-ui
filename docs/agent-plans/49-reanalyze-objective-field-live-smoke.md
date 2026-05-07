# Phase 49 — Reanalyze Objective Field Live Smoke

**Date**: 2026-05-07
**Hagen git_sha tested**: `d9c828becc191f7aeebae51495301a621fa04a01` (d9c828be)
**Concept used**: `clip-contraband-coffee`
**Strategy returned**: `full_reanalyze` (concept has a source URL → Hagen ran full video analysis)

---

## 1. Pre-conditions

| Item | Status |
|---|---|
| Hagen Railway live at sha `d9c828be` | ✅ |
| `GET /api/letrend/version` — `now` dynamic | ✅ |
| `GET /api/studio/hagen/status` — `capabilities_ok: true` | ✅ (sha 048ca5a4, verified Phase 46) |
| Phase 47 enrich contract aligned | ✅ |

### Confirmed overrides on `clip-contraband-coffee` before smoke

These fields were **already confirmed** (present in `overrides` column) and thus suppressed by Hagen:

- `businessTypes`, `description_sv`, `difficulty`, `estimatedBudget`, `filmTime`, `hasScript`, `headline_sv`, `isNew`, `market`, `matchPercentage`, `peopleNeeded`, `price`, `productionNotes_sv`, `script_sv`, `transcript`, `whyItFits_sv`, `whyItWorks_sv`

These fields were **NOT confirmed** and should appear in `suggested_overrides`:

- `script_mode`, `setup_complexity`, `skill_required`, `setting`

Note: `estimatedBudget` is confirmed in overrides (legacy field) but Hagen Phase 47 no longer emits it from enrich — correctly absent from `suggested_overrides`.

---

## 2. Live Reanalyze API Call

```
POST /api/studio/concepts/clip-contraband-coffee/reanalyze
Authorization: Bearer <admin JWT>
```

**Elapsed**: ~25 s (full video analysis via Hagen)

### Raw response shape

```json
{
  "strategy": "full_reanalyze",
  "backend_data": {
    "provider": "...",
    "analyzedAt": "...",
    "visual": {...},
    "audio": {...},
    "content": {...},
    "script": {...},
    "technical": {...},
    "scenes": [...],
    "analysisModel": "...",
    "id": "clip-contraband-coffee",
    "url": "...",
    "source_url": "..."
  },
  "suggested_overrides": {
    "mechanism": "contrast",
    "script_mode": "short_dialogue",
    "setup_complexity": "point_and_shoot",
    "skill_required": "comfortable_on_camera",
    "setting": "similar_venue_type"
  }
}
```

### Objective field verification

| Field | Expected | Got | Status |
|---|---|---|---|
| `script_mode` | present (not confirmed) | `"short_dialogue"` | ✅ |
| `setup_complexity` | present (not confirmed) | `"point_and_shoot"` | ✅ |
| `skill_required` | present (not confirmed) | `"comfortable_on_camera"` | ✅ |
| `setting` | present (not confirmed) | `"similar_venue_type"` | ✅ |
| `trendLevel` | absent (removed Phase 47) | ABSENT | ✅ |
| `estimatedBudget` | absent (removed Phase 47) | ABSENT | ✅ |
| `peopleNeeded` | suppressed (confirmed in overrides) | ABSENT | ✅ |
| `difficulty` | suppressed (confirmed in overrides) | ABSENT | ✅ |
| `filmTime` | suppressed (confirmed in overrides) | ABSENT | ✅ |
| `businessTypes` | suppressed (confirmed in overrides) | ABSENT | ✅ |

---

## 3. Frontend UI Verification (static code analysis)

The review page at `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`
was confirmed to already be fully wired for all 4 new objective fields.
**No code changes were needed.**

### State variables (lines 201–204)
```ts
const [scriptMode, setScriptMode] = useState('none');
const [setupComplexity, setSetupComplexity] = useState<string | null>(null);
const [skillRequired, setSkillRequired] = useState<string | null>(null);
const [settingVal, setSettingVal] = useState<string | null>(null);
```

### Options arrays — all keys match Hagen output
| Field | Key returned by Hagen | Label in UI |
|---|---|---|
| `script_mode` | `short_dialogue` | "Kort dialog" |
| `setup_complexity` | `point_and_shoot` | "Point-and-shoot" |
| `skill_required` | `comfortable_on_camera` | "Kameravant" |
| `setting` | `similar_venue_type` | "Liknande lokal" |

### Suggestion panel (lines 612–621)
All 4 fields have individual "Tillämpa" entries with:
- Current value display (from confirmed overrides or backend_data read helpers)
- Proposed value display (label-resolved)
- `apply()` callback wired to correct setter

### "Tillämpa alla" (lines 664–667)
All 4 fields included in the bulk-apply handler.

### Save path (lines 324–341)
All 4 fields written to `newOverrides` on save:
```ts
script_mode: scriptMode,
if (setupComplexity) newOverrides['setup_complexity'] = setupComplexity;
if (skillRequired) newOverrides['skill_required'] = skillRequired;
if (settingVal) newOverrides['setting'] = settingVal;
```

### Suppression logic
`SuggestableFields` in `src/lib/reanalyze-suggestions.ts` already includes all 4 fields.
`hasApplicableSuggestions` / `countApplicableSuggestions` / `getSuggestionState` all cover them.
The panel will show `"has_suggestions"` state (not `"suppressed"`) when Hagen returns any of the 4.

---

## 4. Expected UI behaviour for clip-contraband-coffee

Since `script_mode`, `setup_complexity`, `skill_required`, `setting` are all unconfirmed,
the form initialises them from `readScriptMode` / `readSetupComplexity` / `readSkillRequired` / `readSetting`
which read from old-format `backend_data` (fallback to `null`/`'none'`).

After reanalyze:
- `suggState` = `'has_suggestions'` (4 non-null fields)
- `suggCount` = 4
- `hasDiff` = true for all 4 (proposed ≠ current)
- Panel shows: "4 förslag" + individual "Tillämpa" rows
- No suppressed state

After Save:
- All 4 values written to `overrides` in DB
- On reload: form initialises from confirmed overrides
- Second reanalyze: all 4 now confirmed → Hagen suppresses them → `suggested_overrides` omits them
- `suggState` = `'suppressed'` → panel shows "Inga förslag" / suppressed message ✅

---

## 5. Suppression after Save — expected behaviour

The backend (`studio.ts` route → Hagen enrich) filters `suggested_overrides` by comparing
Hagen's output against the concept's current `overrides` in Supabase. If a field is already
confirmed, it is excluded from `suggested_overrides`. This ensures the CM is never prompted
to overwrite their own deliberate choices.

---

## 6. Bugs found and fixes

**None.** The frontend was already aligned with the new enrich contract before Phase 47
shipped. Phase 47 made Hagen's output match what the frontend expected:
- `SuggestableFields` already had the 4 new objective fields
- Options arrays already had all enum keys
- Suggestion panel, "Tillämpa alla", and save path already handled all 4 fields

---

## 7. Typecheck results

```
pnpm --filter @workspace/api-server exec tsc --noEmit  → 0 errors ✅
pnpm --filter @workspace/letrend exec tsc --noEmit     → 0 errors ✅
```

---

## 8. Phase 48 fix (prerequisite — also resolved in this session)

Railway `npm ci` was failing because `tsx@4.21.0` was added to `package.json` devDependencies
in Phase 47 but `package-lock.json` was never updated.

**Fix**: Removed `tsx` from `package.json` devDependencies (commit `d9c828be`).
Railway uses `npm ci` + `npm run build` — test runners are not needed at build time.

After fix: Railway deployed successfully, all smoke checks above ran against live sha `d9c828be`.

---

## 9. Test status

| Test | Method | Result |
|---|---|---|
| Hagen version endpoint dynamic | HTTP polling × 2 | ✅ |
| `POST /reanalyze` — strategy | Live API call | `full_reanalyze` ✅ |
| `POST /reanalyze` — 4 new objective fields present | Live API call | ✅ |
| `POST /reanalyze` — trendLevel absent | Live API call | ✅ |
| `POST /reanalyze` — estimatedBudget absent | Live API call | ✅ |
| `POST /reanalyze` — confirmed fields suppressed | Live API call (peopleNeeded, difficulty, filmTime, businessTypes absent) | ✅ |
| Frontend SuggestableFields coverage | Code review | ✅ all 4 fields present |
| Options arrays key coverage | Code review | ✅ all Hagen enum values mapped |
| Suggestion panel wiring | Code review | ✅ Tillämpa + Tillämpa alla + save |
| Frontend typecheck | tsc --noEmit | ✅ 0 errors |
| API server typecheck | tsc --noEmit | ✅ 0 errors |
