# Phase 28 — Ingest Metadata Contract V1

**Datum:** 2026-05-07  
**Typ:** Produkt- och teknikplan  
**Output:** Plan. Inga kodändringar i detta pass.

---

## 1. Current State

### Var fälten kommer ifrån

```
Hagen /analyze  →  backend_data (concepts.backend_data JSONB)
                     BackendClip: script, scene_breakdown, humor, sigma_taste,
                     replicability_decomposed, content_classification, ...

Hagen /enrich   →  overrides (concepts.overrides JSONB)
                     headline_sv, description_sv, whyItWorks_sv, script_sv,
                     productionNotes_sv, whyItFits_sv,
                     difficulty, filmTime, peopleNeeded, mechanism,
                     market, trendLevel, businessTypes, hasScript, estimatedBudget

UploadConceptModal  →  CM väljer under "Klassificera":
                     difficulty, filmTime, market, peopleNeeded,
                     estimatedBudget, businessTypes (max 3)
```

### Vad visas i upload-confirm (nuläge)

| Fält | Vem sätter | CM ser/bekräftar |
|---|---|---|
| `difficulty` | AI-förslag (enrich) + CM-klassificering | ✓ CM bekräftar |
| `filmTime` | AI-förslag + CM-klassificering | ✓ CM bekräftar |
| `peopleNeeded` | AI-förslag + CM-klassificering | ✓ CM bekräftar |
| `market` | AI-förslag + CM-klassificering | ✓ CM bekräftar |
| `estimatedBudget` | AI-förslag + CM-klassificering | ✓ CM bekräftar |
| `businessTypes` | AI-förslag + CM-klassificering | ✓ CM bekräftar |
| `headline_sv` | AI (enrich) | ✗ CM ser aldrig i modal |
| `description_sv` | AI (enrich) | ✗ CM ser aldrig i modal |
| `whyItWorks_sv` | AI (enrich) | ✗ CM ser aldrig i modal |
| `script_sv` | AI (enrich) | ✗ CM ser aldrig i modal |
| `productionNotes_sv` | AI (enrich) | ✗ CM ser aldrig i modal |
| `mechanism` | AI (enrich) | ✗ CM ser aldrig i modal |
| `trendLevel` | AI (enrich) | ✗ CM ser aldrig i modal |
| `hasScript` | AI (enrich) | ✗ CM ser aldrig i modal |

### Vad sparas i concepts-tabellen

- `backend_data` — hela BackendClip-rådata från Hagen-analyze
- `overrides` — alla enrichade fält + CM:s klassificeringar
- `is_active: false` — alla nya koncept sparas som **inaktiva utkast** (nuläge, ska ändras, se §5)
- `source: 'cm_created'`
- `created_by`

### Filter i `/studio/concepts`

Aktiva filter: `difficulty`, `filmTime` (range), `businessType`, `budget` (estimatedBudget), `peopleNeeded`, `source`, `sort`, `reuse`

Budget-filtret (`budgetFilter`) är synligt i UI men ska tas bort (se §5).

### ConceptCard visar

`thumbnail`, `headline_sv`, `description_sv`, `difficulty`, `filmTime`, `peopleNeeded`, `businessTypes`

---

## 2. Lessons From /analyze-rate-v1

### Vad gamla `/analyze-rate-v1` hade rätt

Gamla Hagen-playgrounden hade ett explicit **preselect-mönster** för objektiva fält:

```
Hagen analyse →  AI pre-fyller enum-val i UI
              →  CM granskar och bekräftar/korrigerar varje värde
              →  CM skickar in bekräftade värden som "signals"
```

Specifika fält som preselectades:
- `actorCount`: solo / duo / small_team / large_team  ← **direkt observerbart ur video**
- `setupComplexity`: phone_only / basic_tripod / lighting_setup / full_studio
- `skillRequired`: anyone / basic_editing / intermediate / professional
- `settingType`: indoor / outdoor / kitchen / bar / storefront / dining_room / mixed
- `spaceRequirements`: minimal / moderate / spacious
- `lightingConditions`: natural / artificial / low_light / flexible
- `contentEdge`: brand_safe / mildly_edgy / edgy / provocative

**Varför detta träffar bättre:**

Dessa fält är **observerbara** — en person som tittar på videon kan bekräfta eller korrigera dem utan att behöva "tycka". AI kan miss-klassificera "duo" som "solo" (t.ex. om en av personerna är off-screen). CM ser det direkt och fixar. AI:s gissning på `estimatedBudget: 'free'` säger däremot nästan ingenting och CM kan inte verifiera det utan att fråga kunden.

**Vad som var sämre i gamla playgrounden:**

- `qualityTier` (excellent/good/mediocre/bad) — subjektivt, ingen stabil definition
- `trendReliance` — svår att bedöma vid uppladdning
- `vibeAlignment` — täcker inte hospitality-specifika kategorier
- Hela target-audience-sektionen (incomeLevel, lifestyleTags) — irrelevant för CM:s dagliga arbete

### Nuvarande upload-confirm vs. gamla preselects

| Dimension | Gamla analyze-rate-v1 | Nuvarande upload-confirm |
|---|---|---|
| Antal objektiva fält | 8-10 (actor_count, setup, skill, setting, etc.) | 6 (difficulty, filmTime, market, peopleNeeded, budget, businessTypes) |
| Pre-population från AI | Ja, explicit — AI-värde visas, CM bekräftar | Ja implicit — AI-värde visas, CM kan byta |
| Subjektiva bedömningar | quality_tier (CM-only) | Inga — men mechanism, hasScript, trendLevel sätts av AI utan CM-granskning |
| Fält som kräver CM-erfarenhet | Färre | Mer (mechanism kräver kunskap om humor-taxonomi) |
| Kopplingen "sparat = godkänt" | Explicit (submit-knapp labelled "confirm") | Implicit — CM vet inte att save = godkänn |

---

## 3. Field Classification

### V1 objective/preselectable — AI föreslår, CM bekräftar/korrigerar i modal

| Fält | Nuläge | Förändring |
|---|---|---|
| `actor_count` | Ligger i `backend_data.sigma_taste.replicability_decomposed.actor_requirements.count` | **Lyft till classify-steget** |
| `setup_complexity` | Ligger i `backend_data.sigma_taste.replicability_decomposed.environment_requirements.setup_complexity` | **Lyft till classify-steget** |
| `skill_required` | Ligger i `backend_data.sigma_taste.replicability_decomposed.actor_requirements.skill_level` | **Lyft till classify-steget** |
| `script_mode` | Saknas (hasScript är boolean) | **Nytt fält** — ersätter `hasScript` |
| `scene_count` | Finns som `scene_breakdown.length` | **Lyft till classify-steget** (läs-only display) |
| `difficulty` | I overrides, CM bekräftar | Behåll |
| `businessTypes` | I overrides, CM bekräftar | Behåll (ta bort max 3-begränsning → max 5) |
| `setting` | Ligger i sigma men inte i overrides | **Lyft till classify-steget** (any_venue / similar_venue_type / specific_setting_needed) |

### V1 subjective AI draft — CM bör granska men behöver inte göra det i modal

| Fält | Nuläge | Förändring |
|---|---|---|
| `headline_sv` | AI skriver, CM ser inte | Synligt i modal (läs/redigera) |
| `description_sv` | AI skriver, CM ser inte | Synligt i modal (läs-only, redigerbart i library) |
| `whyItWorks_sv` | AI skriver, CM ser inte | Synligt i modal (läs-only) |
| `script_sv` | AI skriver, CM ser inte | Synligt i modal om script_mode har dialog/overlay |
| `productionNotes_sv` | AI skriver, CM ser inte | Synligt i modal (läs-only) |
| `mechanism` | AI sätter, ingen granskning | Behåll i backend men **visa inte i modal** — för svårt att validera utan humor-expertis |

### CM-only / manuella fält

| Fält | Nuläge | Förändring |
|---|---|---|
| `market` | AI sätter + CM bekräftar | **CM-only** — AI sätter alltid SE, CM kan ändra; visa som enkel select |
| `trend_status` | Saknas | **Nytt manuellt fält** (fresh/rising/peak/overused/null) — för framtida fas |
| `internal_notes` | Saknas | **Nytt manuellt fält** — fri text, CM-only, syns inte för kund |

### Raw / future-only

| Fält | Var | Notering |
|---|---|---|
| `sigma_taste.*` | `backend_data.sigma_taste` | Bevara rådata — kan bli sökbar signal i v2 |
| `content_classification.content_type` | `backend_data.content_classification` | Relevant för icke-humorklassificering (se §8) |
| `narrative_flow.*` | `backend_data` | Intressant för kvalitetsbedömning men inte i v1 |
| `performer_execution.*` | `backend_data` | Kräver manuell CM-bedömning, inte v1 |

### Deprecated / ta bort

| Fält | Motivering |
|---|---|
| `estimatedBudget` | Svårt att validera, säger lite, distraherar CM |
| `trendLevel` (AI-satt) | AI vet inte vad som är "trending" i Sverige/hospitality. Ersätt med manuell `trend_status` |
| `hasScript` (boolean) | Ersätts av `script_mode` enum |

---

## 4. Proposed Contract: ConceptMetadataV1

```typescript
/**
 * Lagras som concepts.overrides JSONB.
 * Alla fält är optional i DB (bakåtkompatibilitet) men required i ny ingest-modal.
 */
interface ConceptMetadataV1 {

  // ──────────────────────────────────────────────────────────────
  // objective_signals: CM bekräftade, direkt observerbara ur video
  // ──────────────────────────────────────────────────────────────
  objective_signals: {
    // Vem
    actor_count:      'solo' | 'duo' | 'small_team' | 'team';
    skill_required:   'anyone' | 'basic_editing' | 'intermediate' | 'professional';
    // Hur
    script_mode:      'none' | 'text_overlay' | 'short_dialogue' | 'long_dialogue' | 'visual_only';
    setup_complexity: 'point_and_shoot' | 'basic_tripod' | 'multi_location' | 'elaborate_staging';
    setting:          'any_venue' | 'similar_venue_type' | 'specific_setting_needed';
    // Derived difficulty (beräknas ur ovan, CM kan överskrida)
    difficulty:       'easy' | 'medium' | 'advanced';
    // Business types (multi-value, 1-5)
    business_types:   BusinessType[];
    // Inspelningstid (uppskattning, labellad tydligt)
    estimated_film_time?: FilmTime;  // optional — "ca X min, uppskattning"
  };

  // ──────────────────────────────────────────────────────────────
  // subjective_copy: AI-genererat utkast, CM bör granska
  // Lagras som idag i overrides — inga namnbyten ännu
  // ──────────────────────────────────────────────────────────────
  subjective_copy: {
    headline_sv:         string;   // max 60 tecken, AI-draft
    description_sv:      string;   // 1-2 meningar, AI-draft
    why_it_works_sv:     string;   // 2-3 meningar, AI-draft
    script_sv?:          string;   // optional — bara om script_mode inte är 'none' eller 'visual_only'
    production_notes_sv: string[]; // 3-5 steg, AI-draft
    why_it_fits_sv:      string[]; // 2-3 argument, AI-draft
    // humor_mechanism lagras kvar men visas inte för CM i modal
    humor_mechanism?:    HumorMechanism;  // AI-draft, optional
  };

  // ──────────────────────────────────────────────────────────────
  // cm_review_state: spårar vad CM faktiskt granskat
  // ──────────────────────────────────────────────────────────────
  cm_review_state: {
    objective_confirmed: boolean;    // true = CM har bekräftat objective_signals (= save)
    headline_edited:     boolean;    // true = CM ändrade headline_sv manuellt
    copy_reviewed:       boolean;    // true = CM har öppnat text-tabs i library
  };

  // ──────────────────────────────────────────────────────────────
  // manual_cm_fields: sätts aldrig av AI
  // ──────────────────────────────────────────────────────────────
  manual_cm_fields: {
    market:        'SE' | 'US' | 'UK';  // default SE
    trend_status?: 'fresh' | 'rising' | 'peak' | 'overused' | null;  // future
    internal_notes?: string;            // syns inte för kund
  };

  // ──────────────────────────────────────────────────────────────
  // raw_hagen_payload: bevaras i concepts.backend_data JSONB
  // Referens här, inte dubbel lagring
  // ──────────────────────────────────────────────────────────────
  // raw_hagen_payload: → concepts.backend_data (BackendClip)

  // ──────────────────────────────────────────────────────────────
  // confidence / warnings (från ingest_runs.warnings)
  // ──────────────────────────────────────────────────────────────
  // ingest_warnings: [{ stage, error, ... }] → hämtas från ingest_runs om run_id finns
}
```

### Kontrakt vs. nuläge — fältmappning

| Nuläge (overrides) | V1-kontrakt | Förändring |
|---|---|---|
| `difficulty` | `objective_signals.difficulty` | Rename (namespace) |
| `filmTime` | `objective_signals.estimated_film_time` | Rename + optional + etiketteras som uppskattning |
| `peopleNeeded` | `objective_signals.actor_count` | Rename; enum-värden justeras (small_team→small_team ok) |
| `businessTypes` | `objective_signals.business_types` | Rename; max 3 → max 5 |
| `hasScript` | `objective_signals.script_mode` | Ersätt boolean med enum |
| `estimatedBudget` | — | **Ta bort** |
| `trendLevel` | — | **Ta bort (AI-satt)** |
| `market` | `manual_cm_fields.market` | Move; CM sätter |
| `mechanism` | `subjective_copy.humor_mechanism` | Move; optional |
| `headline_sv` | `subjective_copy.headline_sv` | Rename (namespace) |
| `description_sv` | `subjective_copy.description_sv` | Rename |
| `whyItWorks_sv` | `subjective_copy.why_it_works_sv` | Rename |
| `script_sv` | `subjective_copy.script_sv` | Rename; optional |
| `productionNotes_sv` | `subjective_copy.production_notes_sv` | Rename |
| `whyItFits_sv` | `subjective_copy.why_it_fits_sv` | Rename |

> **Obs:** Namespace-byten (`difficulty` → `objective_signals.difficulty`) görs **inte** i nästa implementation. V1 lägger nya fält bredvid befintliga i samma overrides-objekt. Se §7.

---

## 5. Product Rules

| Regel | Konsekvens |
|---|---|
| **Save = godkänd aktiv** | `is_active: true` vid save (idag `false`). Konceptet ska direkt synas i library. |
| **AI = förslag, inte sanning** | UI-etikett "AI-förslag" på headline, description, script. |
| **Budget tas bort** | `estimatedBudget` döljs ur modal och library-filters. Datan kvarstår i DB men exponeras inte. |
| **businessTypes multi-value** | Behåll multi-select; ta bort 3-gräns, höj till 5. |
| **Script är optional** | `script_mode: 'none' | 'text_overlay' | 'visual_only' | 'short_dialogue' | 'long_dialogue'` |
| **trendLevel sätts inte av AI** | Ta bort från enrich-prompt och -schema. Reserverat som manuellt CM-fält. |
| **Ingen AI quality/recommendation score** | `quality_score`, `sigma_taste_final`, `utility_score` sparas i `backend_data` men exponeras inte i library eller upload. |
| **Hospitality är primär nisch** | businessTypes-enum: bar/restaurang/cafe/bistro/hotell/foodtruck/nattklubb/bageri. Inga generiska kategorier. |
| **Objektiva fält prioriteras i modal** | Modal ska visa actor_count, setup_complexity, skill_required, script_mode, setting, difficulty, businessTypes — **alla förvalda från AI, bekräftade av CM**. |
| **Subjektivt copy granskas i library** | headline/description/script visas läs-only i modal-steg 2 men är redigerbara i `/studio/concepts/:id/review`. |
| **filmTime är uppskattning** | Etiketteras "ca X min (uppskattning)" i UI. |

---

## 6. Code Impact

### Filer som behöver ändras i nästa implementation

#### `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- Classify-steg: lägg till `actor_count`, `setup_complexity`, `skill_required`, `script_mode`, `setting`
- Ta bort `estimatedBudget` från classify-steget
- Visa `headline_sv` + `description_sv` (läs-only, klickbar för att se mer) i classify-steg
- Ändra knapptext till "Spara och aktivera →" (tydliggör save = active)
- Skicka `is_active: true` i save-anropet (eller ändra server-default)

#### `artifacts/letrend/src/lib/translator.ts`
- Exportera `translateScriptMode(clip: BackendClip): ScriptMode` — härled från `hasScript`, `scene_breakdown`, `script.transcript`, `visual.textOverlays`
- Exportera `translateActorCount`, `translateSetupComplexity`, `translateSkillRequired`, `translateSetting` — direkt från sigma_taste när tillgänglig, annars heuristik
- Lägg till `ScriptMode` i `TranslatedConcept`
- Behåll `hasScript` i `ClipOverride` för bakåtkompatibilitet

#### `artifacts/letrend/src/lib/concept-enrichment.ts`
- Ta bort `estimatedBudget` från `enrichedConceptSchema`
- Ta bort `trendLevel` från schema
- Lägg till `script_mode` enum i schema
- Uppdatera `ENRICH_CONCEPT_SYSTEM_PROMPT` — ta bort budget-instruktion, ta bort trendLevel, lägg till script_mode-instruktion
- Behåll `BUDGET_VALUES` och `FILM_TIME_VALUES` exporterade för bakåtkompatibilitet (används i filter)

#### `artifacts/hagen/src/app/api/studio/concepts/enrich/route.ts`
- Ta bort `estimatedBudget` från `enrichFunctionDeclaration.parameters`
- Ta bort `trendLevel` från required-array
- Lägg till `script_mode` som enum-parameter (none/text_overlay/short_dialogue/long_dialogue/visual_only)
- Uppdatera `buildFallback()` — ta bort budget-heuristik; lägg till `script_mode`-heuristik från `hasScript` + `scene_breakdown`
- Uppdatera `mergeToolCall()` — hantera `script_mode`

#### `artifacts/api-server/src/routes/admin/concepts.ts`
- Ändra `is_active: false` → `is_active: true` på POST (save = godkänn aktiv)
- Eller: ta emot `is_active` från frontend och validera att CM explicit sätter det

#### `artifacts/letrend/src/app/studio/concepts/page.tsx`
- Ta bort `budgetFilter` och BUDGET_OPTIONS från filter-UI
- Lägg till filter för `script_mode` (optional)
- Uppdatera ConceptCard: visa `actor_count`/`script_mode` istället för `hasScript` (som ingen ser ändå)

#### DB / schema
- Inga migrations behövs — alla ändringar i JSONB (`overrides`, `backend_data`)
- Nya fält (`script_mode`, `actor_count`, `setup_complexity`) läggs till i `overrides`-objektet

---

## 7. Migration Strategy

### Principer

1. **Bevara `backend_data` alltid** — rådata från Hagen rensas aldrig. Fältbyten görs på `overrides`-lagret.
2. **Nya fält bredvid gamla** — v1 lägger `script_mode` i `overrides.script_mode` parallellt med befintliga `hasScript`. Translator läser `script_mode` first, fallback till `hasScript`.
3. **Dölj innan ta bort** — `estimatedBudget` döljs ur UI först (en commit). Sedan, efter x veckor utan störning, tas det bort ur enrich-prompt. DB-data berörs aldrig.

### Steg i säker ordning

```
Steg 1 — UI-only: Ta bort budget-filter och budget-selection från modal/library
         → ingen backend-ändring
         → befintliga concept-records oförändrade

Steg 2 — Save-semantik: Ändra is_active: false → true på POST /api/admin/concepts
         → ny modal-save aktiverar direkt
         → befintliga is_active=false-utkast påverkas ej (de var redan sparade)

Steg 3 — Ny objective-sektion i modal: Lägg till script_mode, actor_count, setup_complexity, skill, setting
         → alla är optional bakåt (gamla concepts har inte dessa fält → fallback i UI)
         → skickas i overrides vid nästa save

Steg 4 — Hagen enrich-kontrakt: Ta bort trendLevel och estimatedBudget ur prompt/schema
         → gamla concepts med trendLevel i overrides påverkas ej (translator ignores om ej filtered)
         → ta bort trendLevel-filter ur UI om det finns

Steg 5 — Translator: Lägg till script_mode-derivation + preselect-helpers för objective-signals
         → bakåtkompatibelt (returnerar defaults om backend_data saknar sigma-signals)
```

### Risker att undvika

- **Bryt inte ConceptCard** — `difficulty`, `filmTime`, `businessTypes`, `peopleNeeded` läses direkt ur `overrides`. Namnbyten (t.ex. `businessTypes` → `objective_signals.business_types`) görs inte i nästa implementation, bara i den "rena V2"-fasen.
- **Bryt inte library-filter** — `difficultyFilter`, `filmTimeFilter`, `businessTypeFilter` i `page.tsx` läser från `TranslatedConcept` som läser från `overrides`. Så länge translator mappar rätt håller filtren.
- **Gamla is_active=false-utkast** — dölj dem tydligt i library (de visas redan som "utkast"). Ändrad is_active-default påverkar bara nya saves framåt.

---

## 8. Open Questions

**Q1: Icke-humorformat — vilka metadatafält påverkas?**

Hospitality-library kommer sannolikt inkludera:
- `product_showcase` — produktvisning med hero-shot
- `atmosphere_vibe` — ambience/stämning, sällan dialog
- `behind_the_scenes` — BTS, kök, produktion
- `offer_event` — erbjudande, event-annons
- `educational_how_to` — recept, barista-tutorial

Påverkade fält:
- `mechanism` (humor) → behöver ett `content_frame`-enum som täcker även icke-humor: `humor | product_show | atmosphere | tutorial | event_promo | testimonial`
- `script_mode` — troligtvis `text_overlay` eller `visual_only` för atmosphere/product
- `why_it_works_sv` — AI:s humor-fokuserade prompt ger fel text för en vibe-video; behöver separat prompt-gren

**Fråga till produktägarare:** Vilket format ska vi prioritera i v1 — bara humor, eller inkludera atmosphere + product? Det avgör om enrich-prompt behöver en `content_type`-gren redan nu eller om vi kan vänta.

**Q2: Rubrik-edit i modal — ja eller nej?**

Alternativ A: CM ser headline_sv (läs-only) i modal och kan redigera i library  
Alternativ B: CM kan redigera headline_sv direkt i classify-steget i modal

Alternativ A är lägre kognitiv belastning i modal men innebär att dåliga AI-rubriker hamnar i library.  
Alternativ B är ett steg mer men ger CM kontroll direkt.

**Rekommendation:** A för v1 — visa headline + description som förhandsgranskning men gör dem redigerbara i library. Välj gärna ett alternativ innan implementation börjar.

**Q3: Hur hanteras concurrenta saves till samma concept?**

Om CM sparar ett concept från upload-modal och någon annan redigerar det i library simultaneously — `overrides`-objektet skrivs över. För v1 är detta acceptabelt (single-user flöde i praktiken), men bör noteras som risk.
