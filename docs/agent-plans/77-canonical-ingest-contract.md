# Phase 77 — Canonical Ingest Contract Audit

**Datum:** 2026-05-13  
**Typ:** Audit + contract documentation — inga kodändringar  
**Scope:** TikTok/video concept ingestion from source URL through Hagen analysis, upload-confirm, library save, customer assignment, and customer-specific overrides

---

## 1. Current Flow Map

### 1.1 Overview

```
TikTok URL
    │
    ▼
[Hagen] POST /api/studio/concepts/analyze
    │  downloads video (yt-dlp / Scraper7 / Supadata)
    │  uploads to Gemini File API + GCS
    │  runs GeminiVideoAnalyzer → visual_analysis
    │  saves to analyzed_videos (hagen DB)
    │  returns: BackendClip + gcs_uri + hagen_video_id
    │
    ▼
[Hagen] POST /api/studio/concepts/enrich
    │  takes backend_data (BackendClip)
    │  runs Gemini function-calling with enrich_concept tool
    │  returns: overrides (Swedish copy + objective signal proposals)
    │
    ▼
[Hagen] POST /api/studio/concepts/humor-enrich   ← fire-and-forget
    │  async humor pass (Gemini)
    │  patches analyzed_videos.visual_analysis.script.humor
    │  patches concepts.backend_data.script.humor (in hagen DB)
    │  returns 202 immediately
    │
    ▼
[LeTrend UI] UploadConceptModal — CM review (upload-confirm)
    │  Step 1 — Analyze: paste URL, analyze triggered
    │  Step 2 — Classify: AI pre-populates objective fields; CM confirms/corrects:
    │    - script_mode (required)
    │    - difficulty (required)
    │    - businessTypes (required, 1-5)
    │    - filmTime (required)
    │    - peopleNeeded (required)
    │    - setup_complexity (nullable, "(AI-förslag)")
    │    - skill_required   (nullable, "(AI-förslag)")
    │    - setting           (nullable, "(AI-förslag)")
    │  CM does NOT see: headline_sv, description_sv, whyItWorks_sv, script_sv
    │    (these are saved as-is from AI enrichment)
    │
    ▼
[API Server] POST /api/admin/concepts
    │  inserts concepts row:
    │    backend_data = BackendClip (full Hagen raw payload)
    │    overrides    = enriched + CM-confirmed fields
    │    is_active    = body.is_active ?? true   ← save = activate
    │    source       = 'cm_created'
    │  marks ingest_run as completed
    │
    ▼
concepts table (LeTrend DB)
    │  is_active = true → visible in /studio/concepts library
    │
    ▼
[CM] Assigns to customer via KonceptSection / DraftConceptPicker
    │
    ▼
[API Server] POST /api/studio-v2/customers/:id/concepts
    │  reads base concept's overrides
    │  pre-populates content_overrides:
    │    headline_sv       → content_overrides.headline
    │    script_sv         → content_overrides.script
    │    whyItWorks_sv     → content_overrides.why_it_fits
    │    productionNotes_sv → content_overrides.filming_instructions (joined)
    │  inserts customer_concepts row:
    │    feed_order = 1 (or null for "Nästa att göra")
    │    status = 'draft'
    │    row_kind = 'assignment'
    │
    ▼
customer_concepts (LeTrend DB)
    │  content_overrides = customer-specific copy edits
    │  feed_order        = position in customer feed plan
    │
    ▼
[Customer feed / CM workspace]
    Reads customer_concepts JOIN concepts
    Displays content_overrides for editable copy
    Displays concepts.overrides for objective signals (difficulty, businessTypes, etc.)
```

### 1.2 analyze-rate-v1 (Hagen-internal tool — separate flow)

`analyze-rate-v1` is a **Hagen-only internal quality-rating tool** — it is **not** part of the LeTrend ingest flow. It exists to rate videos for the Hagen library and training corpus.

Flow: paste URL → `/api/videos/create` → `/api/videos/analyze/deep` → CM reviews Gemini analysis → fills in signal UI (qualityTier, replicability, environment, riskLevel, targetAudience) → `/api/analyze-rate` → saves to `video_signals` table with σTaste v1.1 schema + OpenAI embedding.

**Why it is relevant here:** The signal UI pre-populates AI-inferred values and asks CM to explicitly confirm or correct each one. This preselect-then-confirm pattern is the correct model for objective fields. The upload-confirm flow in LeTrend should follow the same pattern more consistently.

---

## 2. Current Data Model Map

### 2.1 `concepts` table (LeTrend DB)

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `backend_data` | JSONB | Full `BackendClip` from Hagen analyze — raw, never modified post-save |
| `overrides` | JSONB | Enriched + CM-confirmed fields (`ClipOverride` shape) |
| `is_active` | boolean | `true` = visible in library; save now defaults to `true` |
| `source` | text | `'cm_created'` for ingest, other values for imports |
| `created_by` | uuid | CM user id |
| `version` | int | Schema version marker (currently always `1`) |
| `tags` | text[] | Per-concept CM tags (add/remove via workspace) |

**`overrides` (ClipOverride) fields in practice:**

```typescript
// Swedish copy — AI-generated, CM can edit in library
headline_sv, description_sv, whyItWorks_sv, script_sv,
productionNotes_sv (string[]), whyItFits_sv (string[])

// Objective signals — AI-proposed, CM confirmed at upload-confirm
difficulty, filmTime, peopleNeeded, businessTypes (string[])
script_mode, setup_complexity, skill_required, setting

// Legacy / compat — kept in DB, not shown in UI
hasScript (boolean), mechanism (HumorMechanism)
estimatedBudget  ← DEPRECATED (removed from enrich prompt, kept in compat type)
trendLevel       ← DEPRECATED (removed from enrich prompt, kept in compat type)

// CM-only
market ('SE'|'US'|'UK')
transcript (string)
```

### 2.2 `BackendClip` (concepts.backend_data)

The raw Hagen analysis payload. Key sub-objects:

```
BackendClip {
  id, url, platform, gcs_uri
  script: { transcript, conceptCore, hasScript, scriptQuality, humor: { ... } }
  scene_breakdown: [{ timestamp, duration, audio, visual, narrative_function }]
  humor_analysis: { handling, mechanism, target_audience, why }
  replicability, replicability_signals, replicability_analysis (legacy fields)
  sigma_taste: BackendSigmaTaste {
    schema_version
    content_classification { content_type, service_relevance, strata_id }
    replicability_decomposed {
      actor_requirements { count, skill_level, social_risk_required, appearance_dependency }
      environment_requirements { backdrop_interchangeability, prop_dependency, setup_complexity }
      production_requirements { editing_skill, editing_as_punchline, estimated_time }
      one_to_one_copy_feasibility { score(1-3), reasoning, required_adaptations }
      concept_transferability { product_swappable, humor_travels }
    }
    narrative_flow, performer_execution, hook_analysis, payoff_analysis, production_polish
    utility_score, quality_score, sigma_taste_final  ← NOT exposed in LeTrend UI
  }
  metadata: { title, thumbnail_url }
}
```

The sigma_taste fields may be nested under `sigma_taste` OR flattened at top level — `getSigma()` in translator.ts normalises both.

### 2.3 `customer_concepts` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `customer_profile_id` | uuid | FK → customers |
| `concept_id` | uuid | FK → concepts (null for collaboration rows) |
| `feed_order` | int | Position in feed plan; null = "Nästa att göra" |
| `status` | text | `'draft'` initially |
| `cm_id` | uuid | Assigning CM |
| `content_overrides` | JSONB | Customer-specific editable copy (see below) |
| `match_percentage` | int | Optional CM match estimate |
| `cm_note` | text | Optional CM note |
| `row_kind` | text | `'assignment'` or `'collaboration'` |
| `added_at` | timestamptz | When assigned |
| `collaboration fields` | various | partner_name, reach, scope, price, confirmed, etc. |

**`content_overrides` fields (pre-populated from base concept):**

```typescript
{
  headline:            string   // from overrides.headline_sv
  script:              string   // from overrides.script_sv
  why_it_fits:         string   // from overrides.whyItWorks_sv
  filming_instructions: string  // from overrides.productionNotes_sv.join('\n')
  // + any CM edits
}
```

### 2.4 `ingest_runs` table

Tracks each upload session's lifecycle:

```
status: 'running' | 'ready_for_review' | 'failed' | 'completed'
stage:  'analyzing' | 'enriching' | 'classifying' | 'saving'
result: { analyze_summary, enrich_summary, humor_enrich }
warnings: [{ stage, error }]
```

---

## 3. Canonical Field Classification

### 3.1 Objective fields — AI proposes, CM must confirm in modal

These are directly observable by watching the video. AI mis-classification is easy for a CM to catch.

| Field | Source | Current Status | Business Rule |
|---|---|---|---|
| `script_mode` | sigma narrative / inference | ✅ In modal, required | `none \| text_overlay \| short_dialogue \| long_dialogue \| visual_only` |
| `difficulty` | sigma replicability_decomposed (derived) | ✅ In modal, required | `easy \| medium \| advanced` |
| `peopleNeeded` / `actor_count` | sigma actor_requirements.count | ✅ In modal, required | `solo \| duo \| small_team \| team` |
| `filmTime` | sigma production_requirements.estimated_time | ✅ In modal, required | labeled "ca X min (uppskattning)" |
| `businessTypes` | AI enrich | ✅ In modal, required | 1–5 values, hospitality enum |
| `setup_complexity` | sigma environment_requirements | ✅ In modal, nullable "(AI-förslag)" | `point_and_shoot \| basic_tripod \| multi_location \| elaborate_staging` |
| `skill_required` | sigma actor_requirements.skill_level | ✅ In modal, nullable "(AI-förslag)" | `anyone \| comfortable_on_camera \| acting_required \| professional` |
| `setting` | sigma environment_requirements.backdrop_interchangeability | ✅ In modal, nullable "(AI-förslag)" | `any_venue \| similar_venue_type \| specific_setting_needed` |
| `scene_count` | `scene_breakdown.length` | ❌ Not surfaced in modal | Should be display-only info for CM |

**Note on `actor_count` vs `peopleNeeded`:** These are semantically the same field but stored under different keys. `peopleNeeded` is the overrides key used throughout the UI. `actor_count` appears in Phase 28 proposed contract. **Keep `peopleNeeded` as the overrides key** — do not rename yet.

### 3.2 Semi-objective fields — AI proposes, CM should be aware

These can be verified but require judgment. Show in modal as read-only or in library edit.

| Field | Source | Current Status | Business Rule |
|---|---|---|---|
| `market` | AI default SE + CM can change | ✅ In modal, CM-editable | Always default SE; never trust AI market inference |
| `hasScript` | AI legacy boolean | ⚠️ Kept for compat only | Superseded by `script_mode`. Translator derives from script_mode when missing |
| `content_type` | sigma content_classification | ❌ Not exposed in LeTrend | `sketch_comedy \| atmosphere_vibe \| tutorial_how_to \| ...` — potentially useful filter but not v1 |

### 3.3 Subjective AI text fields — AI draft, CM edits in library

Never treat these as facts. Label clearly as "AI-utkast" in UI.

| Field | Source | Current Status | Business Rule |
|---|---|---|---|
| `headline_sv` | Hagen enrich Gemini | ⚠️ CM never sees in modal; saved as-is | CM should review in library before customer sees it |
| `description_sv` | Hagen enrich Gemini | ⚠️ CM never sees in modal; saved as-is | AI draft |
| `whyItWorks_sv` | Hagen enrich Gemini | ⚠️ CM never sees in modal; saved as-is | AI draft — becomes customer-facing "why it works" |
| `script_sv` | Hagen enrich or transcript | ⚠️ CM never sees in modal; saved as-is | Mandatory with script notation prefixes in prompt |
| `productionNotes_sv` | Hagen enrich Gemini | ⚠️ Not in modal | 3-5 production steps |
| `whyItFits_sv` | Hagen enrich Gemini | ⚠️ Not in modal | 2-3 selling arguments for CM |
| `mechanism` | Hagen enrich (HumorMechanism) | ✅ In overrides, not shown to CM | Too expert to validate — keep in backend_data, do not surface in modal |

### 3.4 Deprecated / avoid

These fields must not be introduced in new concepts and should be progressively removed from UI surfaces.

| Field | Reason |
|---|---|
| `estimatedBudget` | Cannot be validated by CM; not meaningful for hospitality. Removed from enrich prompt (Phase 30). Kept in ClipOverride type for DB compat only. Do not show anywhere. |
| `trendLevel` (AI-satt) | AI has no reliable signal for what is trending in Sweden/hospitality right now. Removed from enrich prompt (Phase 30). See `trend_status` (manual) below. |
| `qualityTier` / `quality_score` / `sigma_taste_final` / `utility_score` | AI quality scores are not reliable enough to drive CM decisions. Stored in backend_data but never exposed in library or modal. |

### 3.5 Future / manual-only fields

| Field | Status | Notes |
|---|---|---|
| `trend_status` | Not yet implemented | Manual CM field: `fresh \| rising \| peak \| overused \| null`. Never AI-set. |
| `internal_notes` | Not yet implemented | CM-only free text, never customer-facing |
| `content_frame` | Not yet implemented | Needed when non-humor formats (atmosphere, product showcase, tutorial) are added: `humor \| product_show \| atmosphere \| tutorial \| event_promo \| testimonial` |

---

## 4. Proposed Canonical Ingest Contract

### 4.1 Ingest request payload (frontend → API server)

```typescript
// POST /api/studio/concepts/analyze
{ videoUrl: string; ingest_run_id?: string }

// POST /api/studio/concepts/enrich
{ backend_data: BackendClip; ingest_run_id?: string }

// POST /api/studio/concepts/humor-enrich (fire-and-forget)
{ videoUrl: string; gcsUri: string; ingest_run_id?: string }
// → 202 accepted immediately
```

### 4.2 Normalized concept object (what gets stored in `concepts`)

```typescript
interface NormalizedConcept {
  // Storage
  id: string;
  source: 'cm_created';
  created_by: string;  // CM user id
  version: 1;
  is_active: true;     // save = activate (no draft state)

  // Raw analysis — never modified after save
  backend_data: BackendClip;  // full Hagen payload

  // Canonical overrides — written at save, editable in library
  overrides: CanonicalConceptOverride;
}

interface CanonicalConceptOverride {
  // ── Objective signals (CM-confirmed at upload-confirm) ──────────
  script_mode:       ScriptMode;            // required
  difficulty:        Difficulty;            // required
  peopleNeeded:      PeopleNeeded;          // required; key retained for compat
  filmTime:          FilmTime;              // required; labeled as estimate
  businessTypes:     BusinessType[];        // required; 1-5; hospitality enum
  setup_complexity?: SigmaSetupComplexity;  // nullable; CM can leave as null
  skill_required?:   SigmaSkillLevel;       // nullable
  setting?:          SigmaBackdrop;         // nullable
  market:            Market;                // default 'SE'; CM sets

  // ── Subjective AI copy (CM should review in library) ──────────
  headline_sv:         string;              // AI draft; required in schema
  description_sv:      string;
  whyItWorks_sv:       string;
  script_sv:           string;
  productionNotes_sv:  string[];
  whyItFits_sv:        string[];

  // ── Optional / compat ─────────────────────────────────────────
  hasScript?:          boolean;             // legacy; derived from script_mode
  mechanism?:          HumorMechanism;      // AI-set; backend only; not in UI
  transcript?:         string;
  // estimatedBudget — NEVER write; ignore if present in old records
  // trendLevel      — NEVER write; ignore if present in old records
}
```

### 4.3 CM review / edit surface

**At upload-confirm (modal, Classify step):**
- Show: script_mode, difficulty, peopleNeeded, filmTime, businessTypes, setup_complexity, skill_required, setting
- Show read-only preview: headline_sv, description_sv (2-line preview)
- Do NOT show: whyItWorks_sv, script_sv, productionNotes_sv, mechanism
- Button text: "Spara och aktivera →" (must convey that save = library-active)

**In library (/studio/concepts/:id/review):**
- Show and allow editing: all subjective copy fields
- Show and allow editing: all objective signals
- Do NOT show: estimatedBudget, trendLevel, quality_score, sigma_taste_final

**In customer workspace (KonceptSection):**
- Read from `concepts.overrides` for objective signals (difficulty, businessTypes, etc.)
- Read from `customer_concepts.content_overrides` for customer-specific copy
- Objective signals are read-only in customer context (edit in library, not per-customer)

### 4.4 Save / activate behavior

**Rule:** Save = approve = activate.

```
CM fills classify step → clicks "Spara och aktivera"
→ POST /api/admin/concepts { ..., is_active: true }
→ concept immediately visible in /studio/concepts library
→ ingest_run marked 'completed'
```

There is no draft state in the library. A CM who is unsure should not click save yet — the upload modal stays open.

### 4.5 Customer assignment behavior

```
CM selects concept from library → assigns to customer
→ POST /api/studio-v2/customers/:id/concepts
→ content_overrides pre-populated from base concept overrides:
     headline_sv         → headline
     script_sv           → script
     whyItWorks_sv       → why_it_fits
     productionNotes_sv  → filming_instructions (joined with \n)
→ feed_order: 1 (scheduled) or null (Nästa att göra)
→ status: 'draft'
→ row_kind: 'assignment'
```

The pre-population copies the AI draft text into the customer-specific layer so the CM can customize without touching the core library concept.

### 4.6 Customer override behavior

Customer-specific edits live **only** in `customer_concepts.content_overrides`. They never write back to `concepts.overrides`.

```
customer_concepts.content_overrides {
  headline:             string   // customer-adapted title (from headline_sv)
  script:               string   // customer-adapted script (from script_sv)
  why_it_fits:          string   // customer-adapted why-it-fits text
  filming_instructions: string   // customer-adapted production notes
  // CM may add other keys; these are the canonical pre-populated ones
}
```

**Library edits** (changing `concepts.overrides`) do **not** retroactively update already-assigned `customer_concepts.content_overrides`. This is intentional — customer assignments may already be in flight.

---

## 5. Mismatch List

### 5.1 Active mismatches in current code

| # | Location | Issue | Severity |
|---|---|---|---|
| M1 | `customer_concepts.content_overrides` pre-population | Field name remapping at assignment time: `headline_sv → headline`, `script_sv → script`, `whyItWorks_sv → why_it_fits`, `productionNotes_sv → filming_instructions`. These are different key names in library vs. customer layer, creating implicit coupling. | Medium |
| M2 | `UploadConceptModal` — Classify step | CM never sees `headline_sv` or `description_sv` in the modal. These AI-generated text fields go live immediately on save without any CM review. A bad AI headline is invisible until a customer or CM opens the library record. | High |
| M3 | `is_active` default behavior | The server now defaults `is_active: true` (Phase 29 fix). The modal save button text and flow may not communicate clearly that clicking save = the concept is live in the library. Needs UX verification. | Medium |
| M4 | `script_mode` vs `hasScript` dual-tracking | Both fields coexist in `ClipOverride`. New saves write `script_mode`. Old concepts only have `hasScript`. The translator's `readScriptMode()` handles fallback correctly, but the dual fields create inconsistency in how concepts are filtered and displayed. | Low |
| M5 | `scene_count` not surfaced | `scene_breakdown.length` is an objective, directly observable fact but is never shown in the modal or library. It would help CMs quickly verify AI analysis quality. | Low |
| M6 | `mechanism` (HumorMechanism) still in enrich prompt and schema | The business rule says "too expert to validate". It is stored in overrides but not shown in modal. However it IS still in the Zod schema as required — meaning every new concept has a mechanism value set by AI without CM confirmation. | Medium |
| M7 | `content_type` from sigma not used in LeTrend | `sigma_taste.content_classification.content_type` provides `sketch_comedy`, `atmosphere_vibe`, `tutorial_how_to` etc. This is a better high-level category signal than `mechanism` but it is never surfaced in the library or as a filter. | Low (future) |

### 5.2 Where old Hagen (analyze-rate-v1) differs from hagen-ui upload-confirm

| Dimension | analyze-rate-v1 (Hagen internal) | hagen-ui upload-confirm |
|---|---|---|
| Signal confirmation UX | Explicit — every signal has a dedicated UI section; CM must confirm or correct each one | Partial — only 8 fields shown; others (headline, description, script) saved silently |
| Signal fields surfaced | actor_count, setup_complexity, skill, setting, content_edge, qualityTier, riskLevel, targetAudience + more | script_mode, difficulty, peopleNeeded, filmTime, businessTypes, setup_complexity, skill, setting |
| Subjective fields | quality_tier (CM-set, not AI) | mechanism (AI-set, not CM-reviewed) |
| Save semantics | Save = finalized signal for training | Save = concept active in library |
| Destination | `video_signals` table (Hagen DB) | `concepts` table (LeTrend DB) |
| What's better in v1 | More objective fields surfaced for confirmation; explicit quality tier as CM judgment | Better for LeTrend context (hospitality copy, businessTypes, etc.) |

### 5.3 Data duplication / clarity issues

| Issue | Detail |
|---|---|
| `backend_data` is in both Hagen DB (`analyzed_videos.visual_analysis`) and LeTrend DB (`concepts.backend_data`) | Hagen stores the raw analysis. LeTrend copies it at ingest. No live sync after copy — LeTrend's copy may be stale if Hagen re-analyzes. |
| `humor` fields may be in multiple locations | `backend_data.script.humor` (legacy), `backend_data.sigma_taste` (v1.1), and patched asynchronously by humor-enrich. `getSigma()` normalises access but the dual structure is confusing. |
| `content_overrides.filming_instructions` | `productionNotes_sv` is a `string[]` in concepts, but collapsed to a single `\n`-joined string in content_overrides. CM edits then produce a string. Round-tripping back to the library (if ever needed) would require splitting. |
| `sigma_taste` fields may be flat or nested | `BackendClip` has both top-level fields (`content_classification`, etc.) AND `sigma_taste.content_classification`. `getSigma()` handles this but it means two valid storage shapes exist in the DB. |

---

## 6. Implementation Plan for Next Phases

### Phase 78: Minimal schema / type / constants alignment

**Goal:** Close the clearest type mismatches without touching UI or data flow.

Changes:
- Add `scene_count?: number` as display-only field to `TranslatedConcept` (derive from `backend_data.scene_breakdown?.length`)
- Export `CONTENT_TYPE_VALUES` from translator (from `BackendContentClassification.content_type`) — sets up future filter
- Explicitly document in `ClipOverride` which fields are deprecated (JSDoc `@deprecated`) vs. active
- Move `hasScript` to explicitly `@deprecated` in `ClipOverride` with "use script_mode instead" note
- Add a `CANONICAL_OVERRIDES_VERSION = 'v1'` constant for future schema migration guards
- Verify: `mechanism` should be `optional` in `enrichedConceptSchema` (not required) — saves without AI humor analysis should not fail validation

Files: `artifacts/letrend/src/lib/translator.ts`, `artifacts/letrend/src/lib/concept-enrichment.ts`

Constraints: No DB migrations. No UI changes. 0 typecheck errors.

### Phase 79: Upload-confirm UX and data cleanup

**Goal:** CM must see AI copy before saving; save button communicates activation.

Changes:
- `UploadConceptModal` Classify step: add read-only preview card for `headline_sv` + `description_sv` (collapsed by default, expandable "Visa AI-utkast →")
- `UploadConceptModal` save button: change label to "Spara och aktivera" (from whatever current label is)
- Add `scene_count` display (read-only) to classify step: "AI hittade X scener"
- Remove any remaining `estimatedBudget` UI surface if found
- Verify `trendLevel` is not shown anywhere in letrend UI (should already be gone after Phase 30)

Files: `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`, audit of other studio UI files

### Phase 80: API contract normalization

**Goal:** Explicit, versioned contract between LeTrend API server and Hagen.

Changes:
- Add `GET /api/letrend/version` proxy in `artifacts/api-server/src/routes/letrend.ts` (or create `hagen.ts`) — returns Hagen version/capabilities
- Add `X-Hagen-Contract-Version` header forwarding in `fetchHagenJson` so mismatches are logged
- Normalize `content_overrides` field naming: document the `headline_sv → headline` mapping explicitly in a shared constant or comment block in `studio-v2.ts` (currently implicit)
- Add validation: `POST /api/admin/concepts` should reject save if `overrides.script_mode` is missing (required by canonical contract)
- Add `hagen_video_id` to concepts table or to `backend_data` in a standardized location — currently ingest_run tracks `gcs_uri` but not `hagen_video_id` in LeTrend DB

Files: `artifacts/api-server/src/routes/studio-v2.ts`, `artifacts/api-server/src/routes/admin/concepts.ts`, `artifacts/api-server/src/lib/hagen.ts`

### Phase 81: Library edit vs customer override separation

**Goal:** Make it explicit in UI and API that library edits ≠ customer assignment edits.

Changes:
- Library edit (`/studio/concepts/:id/review`): currently writes to `concepts.overrides`. Add a banner: "Ändringar här uppdaterar konceptbiblioteket, inte befintliga kundkopplingar."
- Customer workspace concept edit: currently writes to `customer_concepts.content_overrides`. Add a banner: "Ändringar här gäller bara denna kund."
- API: verify `PATCH /api/admin/concepts/:id` never touches `customer_concepts` rows and vice versa
- Consider: when a library concept's `headline_sv` is edited, offer CM option to propagate to unstarted customer assignments (feed_order = 1, status = 'draft') — not yet implemented, flag as future feature
- Investigate whether `content_overrides.filming_instructions` (string) vs `productionNotes_sv` (string[]) should be aligned

---

## 7. Verification Notes

### Commands run during this audit

```bash
# File structure exploration
ls artifacts/hagen/src/app/api/
ls artifacts/hagen/src/app/

# Route enumeration
grep -n "router\.\(get\|post\|put\|patch\|delete\)" artifacts/api-server/src/routes/studio.ts
grep -n "customer_concepts\|content_override\|is_active\|feed_order" artifacts/api-server/src/routes/studio-v2.ts
grep -n "is_active\|budget\|trendLevel" artifacts/api-server/src/routes/admin/concepts.ts

# Existing docs surveyed
ls docs/agent-plans/ | grep -E "hagen|ingest|sync|concept|feed"
```

### Files read

- `artifacts/api-server/src/routes/studio.ts` (full — analyze/enrich/humor-enrich routes)
- `artifacts/api-server/src/routes/studio-v2.ts` (lines 360–430 — customer assignment)
- `artifacts/api-server/src/routes/admin/concepts.ts` (save route, is_active default)
- `artifacts/letrend/src/lib/translator.ts` (full — BackendClip, getSigma, ClipOverride, readScriptMode, readSetupComplexity, readSkillRequired, readSetting, translateClipToConcept)
- `artifacts/letrend/src/lib/concept-enrichment.ts` (lines 1–100 — schema, constants, prompt)
- `artifacts/hagen/src/app/analyze-rate-v1/page.tsx` (full — preselect UX pattern)
- `docs/agent-plans/03-hagen-ingest-contract.md` (full)
- `docs/agent-plans/28-ingest-metadata-contract-v1.md` (full)
- `docs/agent-plans/30-ingest-enrich-contract-cleanup.md` (lines 1–60)
- `docs/agent-plans/31-ingest-objective-fields.md` (full)

### Tests / builds skipped

No code changes were made in this phase. No build or typecheck required per constraints.

### Existing prior audit coverage

Phases 28–33 covered much of the field classification and schema evolution. This document synthesizes and extends them with:
- The full flow map (including Hagen-internal vs. LeTrend paths)
- analyze-rate-v1 comparison
- The customer assignment / content_overrides layer (not covered in 28–33)
- Updated mismatch list reflecting current code state post-phases 29–33
- Hospitality niche business rules encoded as explicit constraints
- 4-phase implementation plan (78–81)
