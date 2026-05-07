# Phase 29 — Ingest Contract Slice A

**Datum:** 2026-05-07  
**Typ:** Implementation (låg-risk slice)  
**Baseras på:** `docs/agent-plans/28-ingest-metadata-contract-v1.md`

---

## Vad som ändrades

### 1. Save = active

**Fil:** `artifacts/api-server/src/routes/admin/concepts.ts` rad 84  
**Ändring:** Default för `is_active` vid POST ändrat från `false` till `true`.

```diff
- is_active: typeof body.is_active === 'boolean' ? body.is_active : false,
+ is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
```

**Val av lösning:** Backend defaultar till `true` + frontend skickar explicit `is_active: true` från `UploadConceptModal`. Dubbelt säkrat. Backend accepterar fortfarande `is_active: false` från andra anropare om de explicit sätter det (t.ex. framtida admin-verktyg). DELETE-endpointen (`PATCH { is_active: false }`) påverkas inte — den skickar explicit `false`.

**Befintliga utkast:** Concepts med `is_active: false` som redan sparats i DB ändras inte. De syns fortfarande i "pending-listan" i library tills manuellt aktiverade eller tilldelade.

---

### 2. Budget borttaget från CM-flödet

#### `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

- `BUDGET_VALUES` borttagen ur import
- `budgetOptions` const borttagen
- `estimatedBudget: string` borttagen ur `ClassificationDraft`-interface
- Classify-steg: Budget-select borttagen från 2-kolumns grid; Marknad-select renderas nu ensam med `width: 50%`
- `estimatedBudget: classification.estimatedBudget` borttagen ur `overrides` i `handleSaveWithClassification`
- `estimatedBudget: translated.estimatedBudget` borttagen ur initial `setClassification`
- Knapptext ändrad: `"Spara koncept som utkast"` → `"Spara och aktivera →"` (tydliggör semantiken)

#### `artifacts/letrend/src/app/studio/concepts/page.tsx`

- `BUDGET_VALUES` borttagen ur import
- `BUDGET_OPTIONS` const borttagen
- `budgetFilter` state borttagen
- `budgetFilter === 'all' || concept.estimatedBudget === budgetFilter` borttagen ur `filteredConcepts`-predikatet
- `budgetFilter` borttagen ur `useMemo`-dependencies
- `budgetFilter !== 'all'` borttagen ur `activeFilterCount`
- `setBudgetFilter('all')` borttagen ur `clearAllFilters`
- `<FilterDropdown label="Budget" ...>` borttagen ur filter-toolbar
- `<FilterPill>` för budget borttagen ur aktiva-filter-raden

**Backward compatibility:** `estimatedBudget` finns kvar i `ClipOverride`, `TranslatedConcept`, `concept-enrichment.ts`-schemas och `translator.ts`-typer. Gamla concepts med `estimatedBudget` i DB kraschar inte — fältet ignoreras tyst i UI. `translateBudget()`-funktionen i translator är kvar för eventuell framtida användning.

---

### 3. `readScriptMode` — backward-compatible helper

**Fil:** `artifacts/letrend/src/lib/translator.ts`

Tillägg:
- `ScriptMode`-typ exporterad: `'none' | 'text_overlay' | 'short_dialogue' | 'long_dialogue' | 'visual_only'`
- `script_mode?: ScriptMode` tillagd i `ClipOverride`-interface
- `readScriptMode(clip, override?)` exporterad funktion

```typescript
export function readScriptMode(clip: BackendClip, override?: ClipOverride): ScriptMode
```

**Prioritetsordning:**
1. `override.script_mode` — V1-kontrakt, CM-valt i modal
2. `sigma.narrative_flow.beat_progression.type === 'dialogue_escalation'` → `long_dialogue`
3. `sigma.hook_analysis.hook_style === 'text_overlay'` → `text_overlay`
4. Legacy: `hasScript`/`transcript`-heuristik → `short_dialogue` / `long_dialogue` baserat på ordräkning (>60 ord)
5. `visual_only` om inget audio i scene_breakdown

Funktionen är **inte** kopplad till classify-steget ännu — det tillhör nästa slice. Den är redo att importeras av modal, library, enrich-prompt eller concept-card när de är klara.

---

## Verifiering

### Typechecks

```
pnpm --filter @workspace/api-server run typecheck  → 0 errors ✓
pnpm --filter @workspace/letrend run typecheck     → [se utfall nedan]
```

### Inga DB-migrationer

Alla ändringar är i JSONB-fält (`overrides`, `backend_data`) eller UI-lager. Inga schema-ändringar.

---

## Risker som kvarstår

| Risk | Sannolikhet | Konsekvens | Mitigering |
|---|---|---|---|
| `is_active: true` default aktiverar koncept som CM inte avsett godkänna | Låg — endpointen nås bara via classify-steg i modal | Koncept hamnar direkt i library utan CM:s klassificering | Frontend skickar explicit `is_active: true`, och classify-steget kräver att businessTypes är satt |
| Befintliga is_active=false-utkast försvinner inte från pending-listan | Neutral | Pending-listan kan ha gamla utkast kvar | Befintliga utkast hanteras separat; ingen ändring |
| `estimatedBudget` lever kvar i `enrichedConceptSchema` i `concept-enrichment.ts` | Låg | Hagen enrich returnerar fortfarande `estimatedBudget` i overrides | Fältet sparas i DB men visas inte i UI — ofarligt för nu |
| `readScriptMode` heuristik kan feltolka gamla concepts | Låg | Fel `ScriptMode`-värde returneras som default | Funktionen används inte i UI ännu; enbart typdefinition + helper |

---

## Nästa rekommenderade slice (30)

### Prioritet 1 — Objective signals i classify-steget

Lägg till `actor_count`, `setup_complexity`, `script_mode` i `UploadConceptModal`:
- AI pre-fyller från `sigma_taste` (via nya translate-helpers i translator.ts)
- CM bekräftar/korrigerar med ButtonGroup-UI (enkla enum-knappar)
- Sparas i `overrides` bredvid befintliga fält

**Filer:** `UploadConceptModal.tsx`, `translator.ts` (translateActorCount, translateSetupComplexity), `concept-enrichment.ts` (lägg till `script_mode` i enrich-schema)

### Prioritet 2 — Ta bort trendLevel ur Hagen enrich-prompt

- Ta bort `trendLevel` ur `enrichedConceptSchema` i `concept-enrichment.ts`
- Ta bort `trendLevel` ur Hagen enrich function declaration i `artifacts/hagen/src/app/api/studio/concepts/enrich/route.ts`
- `trendLevel` lämnas i DB och translator som legacy-fält (backward compat)

### Prioritet 3 — Headline/description preview i classify-steget

Visa `headline_sv` och `description_sv` (AI-genererade) som read-only förhandsgranskning under classify-stegen, med etiketten "AI-förslag — kan redigeras i library". Ger CM en sista koll innan aktivering.
