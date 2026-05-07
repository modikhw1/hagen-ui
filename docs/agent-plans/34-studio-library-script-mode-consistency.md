# Phase 34 — Studio Concept Library: script_mode Consistency

## Scope

Three areas of improvement across the CM studio concept library:

1. `script_mode` filter added to `/studio/concepts` library page
2. `ConceptCard` shows `script_mode` badge + compact objective field tags
3. `TranslatedConcept` extended with `setup_complexity`, `skill_required`, `setting`

---

## Changed Files

### `artifacts/letrend/src/lib/translator.ts`

**`TranslatedConcept` interface** — added three optional nullable fields:
```typescript
setup_complexity?: SigmaSetupComplexity | null
skill_required?: SigmaSkillLevel | null
setting?: SigmaBackdrop | null
```

**`translateClipToConcept`** — now computes and returns these via the existing read helpers:
```typescript
const setup_complexity = readSetupComplexity(clip, override)
const skill_required   = readSkillRequired(clip, override)
const setting          = readSetting(clip, override)
```

All three are override-first (stored JSONB key), then sigma signal fallback, then null.
They are propagated to all consumers of `translateClipToConcept`, including:
- `/studio/concepts` library (`ConceptLibraryItem extends TranslatedConcept`)
- Customer workspace (`TranslatedConcept` in `CustomerWorkspaceContent`)
- Concept review page (already used via direct read helpers, now also in concept object)

---

### `artifacts/letrend/src/app/studio/concepts/page.tsx`

**New imports:**
- `type ScriptMode` from translator

**New constants (module-level):**
- `SCRIPT_MODE_OPTIONS` — 7 options for the filter dropdown:
  `with_script`, `without_script`, `text_overlay`, `short_dialogue`, `long_dialogue`,
  `visual_only`, `none`
- `SCRIPT_MODE_CARD_LABELS` — Swedish display labels for card badges
- `SETUP_COMPLEXITY_LABELS`, `SKILL_REQUIRED_LABELS`, `SETTING_LABELS` — Swedish labels for objective field badges on the card

**`matchScriptMode(hasScript, scriptMode, filter)` function:**
- `all` → always true
- `with_script` → matches `text_overlay | short_dialogue | long_dialogue` when `script_mode` present;
  falls back to `hasScript === true` for old concepts
- `without_script` → matches `visual_only | none` when present; falls back to `hasScript === false`
- Specific mode (e.g. `text_overlay`) → exact match on `script_mode`; returns false for old concepts
  without `script_mode` (safe — doesn't falsely include them)

**State:** `const [scriptModeFilter, setScriptModeFilter] = useState('all')`

**`filteredConcepts` useMemo** — added:
```typescript
matchScriptMode(concept.hasScript, concept.script_mode, scriptModeFilter)
```

**`activeFilterCount`** — includes `scriptModeFilter !== 'all'`

**`clearAllFilters`** — calls `setScriptModeFilter('all')`

**Filter UI** — new "Manusläge" block in the secondary filter row (alongside Svårighetsgrad,
Inspelningstid, etc.) using `FilterDropdown` (compact, handles 7 options without wrapping).

**FilterPill row** — new pill for `scriptModeFilter` when active.

**`ConceptCard` body** — new badge row between the meta row and assignment row:
- `script_mode` badge (indigo, 10px) — visible when `concept.script_mode` is set
- `setup_complexity` badge (purple, 10px) — visible when non-null
- `skill_required` badge (rust/orange, 10px) — visible when non-null
- `setting` badge (green, 10px) — visible when non-null
- Row hidden entirely when no objective fields are present (no empty space on old concepts)

---

## Fallback Behavior for Old Concepts

Old concepts (without `script_mode` stored in overrides) continue to work:
- The `matchScriptMode` function falls back to `hasScript` for `with_script`/`without_script` filters
- Specific mode filters (e.g. `text_overlay`) return false for old concepts → they're excluded, which is correct
- Card badge row is hidden if no fields are set → no visual regression

---

## Remaining Next Steps

1. **Legacy page removal** (Phase 35 candidate) — `/studio/concepts/:id` and `:id/edit` can be removed
   when CMs have fully migrated to the review page; routing in App.tsx updated accordingly
2. **concept.setting TypeScript narrowing** — `setting` clashes with the JS built-in `window.setting`;
   all usages use explicit property access (`concept.setting`) so this is not a runtime issue
3. **Populate objective fields at ingest** — UploadConceptModal classify step already sets
   `script_mode` in overrides; CMs should be encouraged to also fill setup_complexity/skill_required/setting
4. **Bulk backfill** — Consider a batch job to read sigma signals and write default objective fields
   for old concepts that have none; would dramatically improve filter utility for the existing library
