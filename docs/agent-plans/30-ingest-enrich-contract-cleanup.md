# Phase 30 — Ingest Enrich Contract Cleanup

**Datum:** 2026-05-07
**Typ:** Implementation (kontrakt-rensning)
**Baseras på:** `docs/agent-plans/28-ingest-metadata-contract-v1.md`, `docs/agent-plans/29-ingest-contract-slice-a.md`

---

## Mål

Rensa upp enrich-kontraktet så att nya ingest-resultat slutar producera deprecated fält (`estimatedBudget`, `trendLevel`), lägger till `script_mode` och höjer `businessTypes`-gränsen från 3 till 5 — utan att bryta gamla concepts som redan har dessa fält i DB.

---

## Ändrade filer

### 1. `artifacts/letrend/src/lib/concept-enrichment.ts`

**Borttaget från enrich-kontraktet (nye AI-svar producerar inte längre):**
- `trendLevel: z.number().min(1).max(5)` — ur `enrichedConceptSchema`
- `estimatedBudget: z.enum(BUDGET_VALUES)` — ur `enrichedConceptSchema`
- `trendLevel` — ur `ENRICH_CONCEPT_SYSTEM_PROMPT`, `ENRICH_CONCEPT_TOOL.parameters.properties`, `required`-lista, `buildFallbackEnrichedConcept`, `normalizeEnrichedConcept`
- `estimatedBudget` — ur alla samma platser
- Import av `EstimatedBudget` från `./display` borttagen

**Tillagt:**
- `SCRIPT_MODE_VALUES = ['none', 'text_overlay', 'short_dialogue', 'long_dialogue', 'visual_only']` — ny exporterad const
- `script_mode: z.enum(SCRIPT_MODE_VALUES)` — i `enrichedConceptSchema`
- `script_mode` — i prompt-regler, tool-properties, required-lista, fallback (via `readScriptMode(backendData)`), normalize
- Import av `readScriptMode` och `ScriptMode` från `./translator`

**Businesstyp-gräns:**
- `businessTypes: z.array(...).min(1).max(3)` → `.max(5)`
- `dedupeStrings(...).slice(0, 3)` → `.slice(0, 5)` i `normalizeEnrichedConcept`
- Prompt: `välj 1-3 av [...]` → `välj 1-5 av [...]`

**Backward compatibility:**
- `BUDGET_VALUES` exporteras fortfarande (används av `display`-modulen och potentiellt av gamla references)
- `trendLevel` och `estimatedBudget` lever kvar i `ClipOverride` (via translator.ts) — gamla concepts kraschar inte
- `EnrichedConceptOverride = z.infer<typeof enrichedConceptSchema> & ClipOverride` — de legacy-fält som tagits bort ur schemat finns kvar som optionella via `ClipOverride`

---

### 2. `artifacts/hagen/src/app/api/studio/concepts/enrich/route.ts`

**Borttaget:**
- `BUDGET_VALUES`, `BudgetValue` — const och typ
- `trendLevel: number` — ur `EnrichedConcept` interface, prompt, function declaration, required-lista, `buildFallback`, `mergeToolCall`
- `estimatedBudget: BudgetValue` — ur alla samma platser

**Tillagt:**
- `SCRIPT_MODE_VALUES` const
- `ScriptModeValue` typ
- `script_mode: ScriptModeValue` — i `EnrichedConcept` interface, function declaration, required-lista, `buildFallback`, `mergeToolCall`
- Lokal `inferScriptMode(data)` helper — infererar `script_mode` från `hasScript`, `transcript`, `textOverlays`, `audio.hasVoiceover`/`hasSpeech`
- `businessTypes` i `mergeToolCall`: `clampEnumArray(..., 3)` → `clampEnumArray(..., 5)`
- Prompt: `välj 1-3 av [...]` → `välj 1-5 av [...]`

**`inferScriptMode` logik:**
```
1. Inget script + inget transcript + inget audio:
   - textOverlays finns → text_overlay
   - annars → visual_only
2. Enbart textOverlays (ingen audio/transcript) → text_overlay
3. transcript finns → short_dialogue (≤60 ord) / long_dialogue (>60 ord)
4. hasScript utan transcript → short_dialogue
5. Fallback → none
```

---

### 3. `artifacts/letrend/src/app/studio/concepts/[id]/review/page.tsx`

**Borttaget:**
- `BUDGET_VALUES` ur import från `@/lib/concept-enrichment`
- `const budgetOptions = BUDGET_VALUES.map(...)` — lokal const
- `const [estimatedBudget, setEstimatedBudget] = useState('')` — state
- `setEstimatedBudget(...)` — anrop i `loadConcept`
- `estimatedBudget` — ur `newOverrides` i `handleSave`
- `estimatedBudget` — ur `useCallback`-deps-array
- Budget-select (`<select value={estimatedBudget} ...>`) — ur klassificeringsgrid
- Klassificeringsgridens layout: `repeat(3, 1fr)` → `repeat(2, 1fr)` (Marknad + Manusstatus)

**Businesstyp-gräns:**
- Counter-färg: `>= 3` → `>= 5`
- Counter-text: `X av 3 valda` → `X av 5 valda`
- `limitReached`: `>= 3` → `>= 5`
- Click-handler: `length >= 3 ? current` → `length >= 5 ? current`

**Backward compatibility:**
- `estimatedBudget` i DB lämnas orörd — det läses fortfarande via `ClipOverride` i translator (visas inte i UI men kraschar inte)

---

### 4. `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

**Businesstyp-gräns:**
- `translated.businessTypes.slice(0, 3)` → `.slice(0, 5)` (initial state)
- `Branschtyper (max 3)` → `(max 5)` (label)
- `X av 3` → `X av 5` (counter)
- `>= 3` → `>= 5` i `limitReached` och click-handler

---

## Deprecated men backward-compatible (lämnas i DB och typer)

| Fält | Status | Åtgärd |
|---|---|---|
| `estimatedBudget` | Deprecated — produceras ej av nya enrich | Kvar i `ClipOverride`, `TranslatedConcept`, translator — läses tyst, ej skrivet om |
| `trendLevel` | Deprecated — produceras ej av nya enrich | Kvar i `ClipOverride` — läses tyst, ej skrivet om |
| `hasScript` | Legacy signal | Kvar i enrich-kontraktet (`hasScript: boolean`) — används som input till `script_mode`-inferens |
| `BUDGET_VALUES` | Legacy export | Kvar i `concept-enrichment.ts` — kan tas bort i framtida cleanup om inga imports återstår |

---

## Verifiering

```
pnpm --filter @workspace/letrend run typecheck   → 0 errors ✓
pnpm --filter @workspace/api-server run typecheck → 0 errors ✓
```

Inga DB-migrationer. Alla ändringar i JSONB-fält (`overrides`) eller UI/prompt-lager.

---

## Nästa rekommenderade slice (31)

### Prioritet 1 — Objective signals i upload-confirm (classify-steget)

Lägg till `actor_count`, `setup_complexity`, `script_mode` som preselectable fält i `UploadConceptModal`:
- Hämta AI-föreslagna värden från `pendingOverrides.script_mode` (nu satt av enrich)
- Visa `script_mode` som ButtonGroup med de 5 enum-värdena
- Visa `actor_count`/`peopleNeeded` som ButtonGroup
- Sparas i `overrides` bredvid befintliga klassificeringsfält
- **Filer:** `UploadConceptModal.tsx`, `translator.ts` (ev. translateActorCount helper)

### Prioritet 2 — Headline/description preview i classify-steget

Visa `headline_sv` och `description_sv` som read-only AI-förhandsgranskning med etiketten "AI-förslag — kan redigeras i library". Ger CM en sista koll innan aktivering.

### Prioritet 3 — Rensa `BUDGET_VALUES`-export och `trendLevel` ur translator

När inga fler importer av `BUDGET_VALUES` återstår i UI kan exporten tas bort. `trendLevel` kan tas bort ur `ClipOverride` och `TranslatedConcept` om inga concept-cards läser det aktivt.

### Prioritet 4 — concept-cards: visa max 3 businessType-badges (layout-only)

Concept-cards kan fortfarande begränsa sig till att visa de 3 första `businessTypes`-badges i kortvy, men spara/läsa upp till 5 i DB. Rent layoutval.
