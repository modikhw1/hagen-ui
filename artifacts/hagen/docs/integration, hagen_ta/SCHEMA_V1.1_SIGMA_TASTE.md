# σTaste Schema v1.1 — Evolution Document

> **Purpose:** A living document that tracks schema changes, additions, and removals for the σTaste analysis model. Designed to work with Google Vertex AI system instructions and informed by insights from 254 pairwise comparisons + 120 video analyses.
>
> **Last Updated:** December 18, 2025

---

## Table of Contents
1. [Schema Philosophy](#schema-philosophy)
2. [Critical Insight: Strata-First Architecture](#critical-insight-strata-first-architecture)
3. [v1.0 → v1.1 Changes Summary](#v10--v11-changes-summary)
4. [Schema Structure](#schema-structure)
5. [Detailed Signal Definitions](#detailed-signal-definitions)
6. [Vertex AI System Instructions](#vertex-ai-system-instructions)
7. [Changelog](#changelog)

---

## Schema Philosophy

### The σTaste Dual Nature (from Question Battery 8.1)
σTaste is NOT a single score. It's a composite of:

1. **Utility Value** — Does this work for the Hagen service? (Replicability, format appropriateness, audience fit)
2. **Subjective Quality** — Is this "good" content? (Creativity, execution, payoff quality)

**Implication for v1.1:** The schema must separate these concerns. A video can score high on quality but low on utility (and vice versa). Filtering happens on utility; ranking happens on quality.

### What v1.0 Got Wrong

| Problem | Evidence | v1.1 Fix |
|---------|----------|----------|
| `hookStrength` treated as positive signal | Negative correlation (r=-0.047) in comparisons | Move to "caution" signals; high hooks often = desperation |
| `replicability` as single score | 42.5% of notes discuss it, but near-zero prediction | Decompose into 8+ sub-factors |
| No strata/filtering layer | "Bad content" conflates "low quality" with "wrong type" | Add `content_classification` as hard filter |
| `audioQuality` underweighted | 2nd strongest predictor (+0.169) but rarely conscious | Elevate weight, add `production_polish` composite |
| No performer/execution signals | "Performer can elevate or kill a premise" — Q7.2 | Add `performer_execution` category |
| No narrative coherence metric | Top predictor is attention retention | Add `narrative_flow` signals |

---

## Critical Insight: Strata-First Architecture

From Question Battery 8.3:
> "I would consider there to be strata - meaning that there would be multiple layers/filters that make the video fit within a certain context."

### The Three-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│          STAGE 1: CONTENT CLASSIFICATION (Hard Filter)          │
│  Is this the RIGHT TYPE of content for the Hagen service?       │
│  Binary: IN_SCOPE / OUT_OF_SCOPE                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Only IN_SCOPE passes
┌─────────────────────────────────────────────────────────────────┐
│            STAGE 2: UTILITY SCORING (Soft Filter)               │
│  CAN a typical hospitality business replicate this?             │
│  Composite score: replicability + resource requirements         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Utility > threshold passes
┌─────────────────────────────────────────────────────────────────┐
│          STAGE 3: QUALITY RANKING (σTaste Core)                 │
│  HOW GOOD is this content within its category?                  │
│  Weighted: attention_retention, creativity, payoff, execution   │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Matters
From Q8.1: "If the data model assumes that most of these clips are within the same categorization, it would mean that:"
- Good = works in context, has σTaste
- Bad = low quality but right type → CAN be improved
- Bad = wrong type entirely → should be FILTERED, not ranked

**v1.1 Solution:** Classify FIRST, then score. Don't compare interview-style content against sketch comedy—they're different strata.

---

## v1.0 → v1.1 Changes Summary

### ➕ ADDED

| Signal Category | New in v1.1 | Rationale |
|-----------------|-------------|-----------|
| `content_classification` | `content_type`, `service_relevance`, `strata_id` | Stage 1 filtering |
| `replicability_decomposed` | 8 sub-factors (see below) | Replace single score |
| `narrative_flow` | `story_direction`, `beat_progression`, `momentum_type` | Top predictor support |
| `performer_execution` | `concept_selling`, `social_risk_taken`, `tonal_match` | From Q7.2 insights |
| `production_polish` | Composite of audio + visual coherence | Hidden predictor surfacing |
| `hook_analysis` | `hook_style`, `desperation_signal`, `promise_quality` | Nuanced hook evaluation |
| `payoff_analysis` | `closure_quality`, `surprise_fit`, `earned_vs_cheap` | From Q5.1 insights |

### ⚡ MODIFIED

| Signal | v1.0 | v1.1 Change |
|--------|------|-------------|
| `hookStrength` | 1-10 score | → `hook_analysis.promise_quality` (positive) + `desperation_signal` (negative) |
| `replicability.score` | 1-10 single score | → `replicability_decomposed` object with 8 fields |
| `audioQuality` | Part of audio object | → Also feeds `production_polish.audio_intentionality` |
| `originality.score` | 1-10 | → Split: `premise_novelty` + `execution_freshness` + `combination_unexpectedness` |

### ➖ REMOVED / DEPRECATED

| Signal | Reason |
|--------|--------|
| `hookStrength` (as positive scalar) | Negative correlation; replaced with nuanced analysis |
| `replicability.score` (top-level) | Decomposed into sub-factors |
| `trendAlignment` | Low signal; trend-chasing ≠ quality |

---

## Schema Structure

### Top-Level v1.1 Schema

```typescript
interface SigmaTasteV1_1 {
  schema_version: "1.1";
  
  // STAGE 1: Classification (Hard Filter)
  content_classification: ContentClassification;
  
  // STAGE 2: Utility (Soft Filter)  
  replicability_decomposed: ReplicabilityDecomposed;
  resource_requirements: ResourceRequirements;
  
  // STAGE 3: Quality (Ranking)
  narrative_flow: NarrativeFlow;
  performer_execution: PerformerExecution;
  humor_mechanics: HumorMechanics;  // Enhanced from v1.0
  payoff_analysis: PayoffAnalysis;
  production_polish: ProductionPolish;
  hook_analysis: HookAnalysis;
  
  // Preserved from v1.0 (Scene Understanding)
  scenes: SceneBreakdown;  // Keep for joke understanding
  script: ScriptAnalysis;
  
  // Computed composites
  utility_score: number;  // 0-1, from Stage 2
  quality_score: number;  // 0-1, from Stage 3
  sigma_taste_final: number;  // Weighted combination
}
```

---

## Detailed Signal Definitions

### STAGE 1: Content Classification

```typescript
interface ContentClassification {
  // Primary content type (hard category)
  content_type: 
    | "sketch_comedy"        // Scripted comedic scenario
    | "reaction_content"     // Response to stimulus
    | "informational"        // Educational/explainer
    | "interview_format"     // Q&A, talking head
    | "montage_visual"       // Aesthetic/visual focus
    | "tutorial_how_to"      // Step-by-step instruction
    | "testimonial"          // Customer/user story
    | "promotional_direct"   // Explicit product push
    | "trend_recreation"     // Copying existing trend
    | "hybrid";              // Multiple types
  
  // Is this type relevant for Hagen's hospitality service?
  service_relevance: "in_scope" | "out_of_scope" | "edge_case";
  
  // Reason for classification
  classification_reasoning: string;
  
  // Sub-strata within scope (for ranking comparisons)
  strata_id?: 
    | "hospitality_sketch"   // Restaurant/café/bar comedy
    | "workplace_relatable"  // Employee scenarios
    | "customer_interaction" // Service dynamics
    | "product_showcase"     // Food/drink focus
    | "atmosphere_vibe";     // Venue ambiance
}
```

**Vertex AI System Instruction Fragment:**
> When classifying content, first determine if the video contains a scripted premise with setup/payoff structure. Interview formats, pure montages, and direct promotional content are OUT_OF_SCOPE for σTaste ranking. The service targets hospitality businesses (restaurants, cafés, bars) who want to replicate engaging short-form content.

---

### STAGE 2: Replicability Decomposed

From Q3.2: "Replicability would contain a multitude of factors..."

```typescript
interface ReplicabilityDecomposed {
  // Can a similar business copy this 1:1?
  one_to_one_copy_feasibility: {
    score: 1 | 2 | 3;  // 1=impossible, 2=needs adaptation, 3=direct copy possible
    reasoning: string;
    // What would need to change?
    required_adaptations?: string[];
  };
  
  // People requirements
  actor_requirements: {
    count: "solo" | "duo" | "small_group" | "crowd";
    skill_level: "anyone" | "comfortable_on_camera" | "acting_required" | "professional";
    // Does the performer need to take social risks?
    social_risk_required: "none" | "mild" | "significant" | "extreme";
    // Are specific physical attributes important?
    appearance_dependency: "none" | "low" | "moderate" | "high";
  };
  
  // Physical setup
  environment_requirements: {
    // Can this be shot in any venue?
    backdrop_interchangeability: "any_venue" | "similar_venue_type" | "specific_setting_needed";
    // Props needed
    prop_dependency: {
      level: "none" | "common_items" | "specific_props" | "custom_fabrication";
      items?: string[];
      // Can props be swapped for similar items?
      substitutable: boolean;
    };
    // Space/setup complexity
    setup_complexity: "point_and_shoot" | "basic_tripod" | "multi_location" | "elaborate_staging";
  };
  
  // Technical execution
  production_requirements: {
    // Editing skill needed
    editing_skill: "basic_cuts" | "timed_edits" | "effects_required" | "professional_post";
    // How important is editing to the joke?
    editing_as_punchline: boolean;
    // Estimated production time
    estimated_time: "under_15min" | "under_1hr" | "half_day" | "full_day_plus";
  };
  
  // Concept portability
  concept_transferability: {
    // Can the joke work with different products?
    product_swappable: boolean;  // Can drinks → food → coffee work?
    // Is the humor venue-agnostic?
    humor_travels: boolean;
    // Would the premise alienate certain audiences?
    audience_narrowing_factors?: string[];
  };
}
```

**Vertex AI System Instruction Fragment:**
> For replicability, evaluate each sub-factor independently. A video may be easy to copy conceptually but require significant social risk from performers. When assessing `social_risk_required`, consider: public embarrassment, exaggerated acting, physical comedy, controversial opinions. A business owner with no acting experience should score "anyone" level content higher.

---

### STAGE 3: Narrative Flow (NEW)

From Q7.1: "When a premise is set, it's usually important to have the sketch/concept move in a straight direction..."

```typescript
interface NarrativeFlow {
  // Does the story/joke progress clearly?
  story_direction: "linear_build" | "escalating" | "revelation_based" | "circular" | "fragmented";
  
  // How do beats progress?
  beat_progression: {
    type: "incremental_heightening" | "steady_examples" | "dialogue_escalation" | "visual_accumulation";
    // Does each beat add something?
    additive_per_beat: boolean;
    // Are there dead spots?
    filler_detected: boolean;
  };
  
  // Momentum type (from Q7.1 examples)
  momentum_type: 
    | "building_to_climax"     // Restaurant payment argument
    | "steady_stream"          // Manager watching → mistakes shown
    | "single_beat_payoff"     // Setup → one punchline
    | "no_clear_structure";
  
  // Coherence score
  coherence_score: 1 | 2 | 3 | 4 | 5;  // 5 = perfectly flows
  coherence_notes: string;
}
```

---

### STAGE 3: Performer Execution (NEW)

From Q7.2: "Performer can elevate or kill a premise significantly"

```typescript
interface PerformerExecution {
  // Is the performer selling the concept?
  concept_selling: {
    score: 1 | 2 | 3 | 4 | 5;  // 5 = fully committed, believable
    // What's the implied persona?
    persona_clarity: "clear_character" | "ambiguous" | "just_themselves";
  };
  
  // Tonal match with content
  tonal_match: {
    matches_content: boolean;
    // Absurdist content needs absurdist delivery
    mismatch_notes?: string;
  };
  
  // Willingness to commit
  commitment_signals: {
    // Are they doing animated expressions?
    facial_expressiveness: "minimal" | "appropriate" | "highly_animated";
    // Are they physically committing?
    physical_commitment: "static" | "moderate_movement" | "full_physical_comedy";
    // Social risk taken?
    embarrassment_tolerance: "safe_performance" | "mild_vulnerability" | "full_commitment";
  };
  
  // Would this work with a less skilled performer?
  performance_dependency: "concept_carries_itself" | "good_delivery_helps" | "requires_strong_performer";
}
```

---

### STAGE 3: Hook Analysis (REWORKED)

From Q2.2: "Some hooks work, but desperation is off-putting"

```typescript
interface HookAnalysis {
  // What type of opening?
  hook_style: "relatable_situation" | "question" | "action" | "visual_intrigue" | "text_overlay" | "sound_grab";
  
  // CRITICAL: Is this a desperation signal?
  desperation_signals: {
    detected: boolean;
    signals?: Array<
      | "excessive_text_first_second"
      | "entire_premise_in_hook"
      | "clickbait_promise"
      | "overexplained_setup"
      | "loud_attention_grab"
    >;
  };
  
  // What does the hook promise?
  promise_quality: {
    // Does it create genuine curiosity?
    curiosity_generated: 1 | 2 | 3 | 4 | 5;
    // Is the promise delivered?
    promise_fulfilled: boolean;
    // Is there room for the content to breathe?
    allows_slow_burn: boolean;
  };
  
  // Emotional undertone in opening
  emotional_undertone: string[];  // ["curiosity", "tension", "humor", "intrigue"]
}
```

**Vertex AI System Instruction Fragment:**
> When evaluating hooks, ACTIVELY LOOK FOR desperation signals. A POV text overlay that explains the entire premise in the first second is a negative signal. Strong hooks create curiosity without revealing the payoff. The best hooks "earn" attention rather than demand it. Score `curiosity_generated` based on whether you want to see what happens next, not on how loud/flashy the opening is.

---

### STAGE 3: Payoff Analysis (ENHANCED)

From Q5.1: "A weaker payoff would contain a simple or obvious closure..."

```typescript
interface PayoffAnalysis {
  // How does the payoff land?
  payoff_type: "visual_reveal" | "edit_cut" | "dialogue_delivery" | "twist" | "callback" | "escalation_peak";
  
  // Quality assessment
  closure_quality: {
    // Does it feel complete?
    meaningful_ending: boolean;
    // Or does it feel empty/flat?
    feels_empty: boolean;
    // Was the payoff "earned" by the setup?
    earned_vs_cheap: "fully_earned" | "somewhat_earned" | "cheap_shortcut" | "no_real_payoff";
  };
  
  // Surprise and fit
  surprise_fit: {
    // Did you see it coming?
    predictability: "completely_obvious" | "somewhat_expected" | "pleasant_surprise" | "total_twist";
    // Does it make sense in retrospect?
    logical_in_hindsight: boolean;
  };
  
  // Trope usage
  trope_handling: {
    uses_known_trope: boolean;
    trope_name?: string;
    // Is the trope subverted or played straight?
    trope_treatment: "subverted_cleverly" | "played_straight_well" | "lazy_execution";
  };
  
  // The "nutrition" factor (from Q5.2)
  substance_level: {
    // Fast food (quick hit, no lasting impact) vs substantial
    content_type: "empty_calories" | "moderate_substance" | "genuinely_clever";
    // Would you remember this tomorrow?
    memorability: 1 | 2 | 3 | 4 | 5;
  };
}
```

---

### STAGE 3: Production Polish (NEW COMPOSITE)

From Q1.1: "Audio quality would be connected to clips with good or intentional production quality"

```typescript
interface ProductionPolish {
  // Audio intentionality
  audio_intentionality: {
    // Is audio a conscious choice or just "there"?
    purposeful: boolean;
    // Key audio elements working together
    elements_aligned: boolean;
    // Sound effects serving the comedy
    comedic_audio_timing: "perfect" | "good" | "off" | "none";
  };
  
  // Visual coherence
  visual_intentionality: {
    // Framing serves the content
    purposeful_framing: boolean;
    // Consistent quality throughout
    quality_consistency: boolean;
    // Lighting matches tone
    lighting_appropriate: boolean;
  };
  
  // Overall "polish" feeling
  polish_composite: {
    score: 1 | 2 | 3 | 4 | 5;  // 5 = everything feels intentional
    // What elevates or detracts?
    elevating_factors?: string[];
    detracting_factors?: string[];
  };
  
  // From v1.0 technical
  cuts_per_minute: number;
  pacing_feel: "rushed" | "snappy" | "comfortable" | "slow" | "dragging";
}
```

---

### Preserved: Scene Breakdown

> Keep the `scenes.sceneBreakdown` structure from v1.0. It's essential for "joke understanding" — parsing how setup/misdirection/payoff work across cuts.

```typescript
interface SceneBreakdown {
  // Each scene with narrative function
  sceneBreakdown: Array<{
    sceneNumber: number;
    timestamp: string;
    duration: string;
    visualContent: string;
    audioContent: string;
    impliedMeaning: string;  // What's suggested between the lines
    viewerAssumption: string;  // What viewer thinks will happen
    narrativeFunction: "hook" | "setup" | "development" | "misdirection" | "payoff" | "tag";
    editSignificance: string;  // Why this cut matters
  }>;
  
  // Edit as punchline detection
  editAsPunchline: boolean;
  editPunchlineExplanation?: string;
  
  // Misdirection tracking
  misdirectionTechnique?: string;
}
```

---

## Vertex AI System Instructions

### Complete System Instruction Template (v1.1)

```markdown
# σTaste Video Analysis System — v1.1

You are an expert content analyst evaluating short-form video content for a hospitality service. Your analysis serves two purposes:

1. **UTILITY ASSESSMENT**: Can a restaurant/café/bar replicate this content?
2. **QUALITY ASSESSMENT**: How good is this content within its category?

## Your Analysis Process

### STEP 1: CLASSIFY THE CONTENT
Before any scoring, determine:
- What TYPE of content is this? (sketch_comedy, interview_format, montage_visual, etc.)
- Is it IN_SCOPE for hospitality short-form content?
- If out of scope, note why and stop detailed analysis.

Only content that is "sketch_comedy", "reaction_content", or similar narrative formats should receive full σTaste analysis.

### STEP 2: ASSESS REPLICABILITY (If in scope)
For each replicability factor, ask:
- **1:1 Copy**: Could [generic café] recreate this exactly? Or would they need to adapt?
- **Actors**: How many people? What skill level? Would they need to embarrass themselves?
- **Environment**: Any venue, or does it need specific setting?
- **Props**: Common items or special fabrication?
- **Editing**: Basic cuts or professional post-production?
- **Concept Transfer**: Would this work for drinks → food? Café → bar?

### STEP 3: EVALUATE QUALITY SIGNALS
**Narrative Flow**: Does the story move forward? Each beat add something? Or stall?

**Hook Quality**: 
- NEGATIVE: Text overlay explains entire premise in first second
- NEGATIVE: Clickbait energy, desperation signals
- POSITIVE: Creates curiosity, earns attention, allows slow burn

**Performer Execution**: Are they selling it? Committed? Tonal match?

**Payoff Quality**:
- NEGATIVE: Obvious closure, known trope played straight, empty feeling
- POSITIVE: Pleasant surprise, earned by setup, subverts expectations, memorable

**Production Polish**: Does everything feel intentional? Audio + visual working together?

### STEP 4: EXPLAIN YOUR REASONING
For every score, provide reasoning. The human reviewer will disagree with many assessments — your job is to make your logic clear so they can calibrate.

## What Makes Content "Clever" vs "Obvious"
Clever content:
- Subverts expectations without being too on-the-nose
- Uses cultural callbacks that feel earned, not lazy
- Has meaning between the lines (subtext)
- The payoff doesn't come from miles away

Obvious content:
- Premise fully explained in the first second
- Known trope executed without twist
- Payoff is exactly what was promised, nothing more

## What Makes a Hook "Desperate"
- Excessive text in first second
- Entire premise revealed before content begins  
- Clickbait promise that doesn't require the video
- Loud/jarring attention grab without substance

## Replicability Sub-Factor Rubrics

### social_risk_required
- **none**: Standing and talking, basic presence
- **mild**: Light comedic acting, mild expressions
- **significant**: Exaggerated reactions, physical comedy, vulnerability shown
- **extreme**: Public embarrassment, controversial content, full commitment required

### editing_skill
- **basic_cuts**: Simple scene transitions
- **timed_edits**: Cuts need to hit beats, but achievable by amateur
- **effects_required**: Transitions, filters, or compositing needed
- **professional_post**: The edit IS the joke; poor editing kills it

### concept_transferability.product_swappable
Ask: If this joke is about coffee, would it work about cocktails? Food? 
If the joke structure is "item does X", it's swappable.
If the joke depends on specific properties of the item, it's not.
```

---

## Changelog

### v1.1.0 (December 18, 2025)
**Major Changes:**
- ➕ Added `content_classification` for Stage 1 filtering
- ➕ Decomposed `replicability` into 8 sub-factor categories
- ➕ Added `narrative_flow` signal category
- ➕ Added `performer_execution` signal category
- ➕ Added `production_polish` composite signal
- ⚡ Reworked `hookStrength` → `hook_analysis` with desperation detection
- ⚡ Enhanced `payoff` → `payoff_analysis` with earned/cheap distinction
- ⚡ Split `originality.score` into premise/execution/combination components
- ➖ Deprecated single `replicability.score`
- ➖ Deprecated `trendAlignment` (low signal)

**Based On:**
- 254 pairwise comparisons
- Question Battery insights (Parts 1-8)
- Correlation analysis (`attentionRetention` +0.173, `audioQuality` +0.169, `hookStrength` -0.047)

### Planned: v1.2.0
- [ ] Strata-specific scoring rubrics (hospitality_sketch vs workplace_relatable)
- [ ] Performer "type" matching (casual vs animated requirements)
- [ ] Historical calibration from human overrides

---

## Critical Assessment & Pushback

### What I Disagree With / Concerns

#### 1. Strata Classification May Be Premature
You propose hard filtering at Stage 1, but with only 120 videos, you may not have enough data to confidently define strata boundaries. Risk: You filter out content that doesn't fit your current mental model but could inform future service expansions.

**Recommendation:** Start with soft classification (confidence scores) rather than binary IN_SCOPE/OUT_OF_SCOPE. Let edge cases through for manual review.

#### 2. The Decomposed Replicability Is Complex
8 sub-factors for replicability is comprehensive, but:
- Vertex may not reliably score all of them from video analysis alone
- Inter-rater reliability (between you and AI) will be low initially
- Some factors overlap (e.g., `social_risk_required` vs `performer_execution.embarrassment_tolerance`)

**Recommendation:** Start with 4-5 highest-signal sub-factors, add others based on calibration data.

#### 3. "Desperation Signal" Detection Is Subjective
Your insight about desperate hooks is valid, but operationalizing it for Vertex is tricky:
- What counts as "excessive text in first second" varies by content type
- Some successful content intentionally uses what looks like desperation (ironic clickbait)

**Recommendation:** Have Vertex detect the signals, but make the interpretation (positive/negative) a human override concern initially.

#### 4. Narrative Flow Is Hard to Extract
The `narrative_flow` signals (`beat_progression.additive_per_beat`, `momentum_type`) require deep understanding of comedic structure. Vertex's scene-by-scene analysis may not capture this reliably.

**Recommendation:** Use `narrative_flow` as a human-assessed quality initially, not an AI-extracted signal. Train on your overrides.

#### 5. You May Be Over-Indexing on Comparison Data
254 comparisons with 106 notes is substantial, but:
- Correlations like `hookStrength` = -0.047 are weak and may not replicate
- Your preferences may have evolved during the comparison process
- The videos you compared may not represent the full distribution

**Recommendation:** Treat correlation findings as hypotheses to test, not established facts. Run A/B comparisons on v1.0 vs v1.1 scoring.

### What's Missing

#### 1. Temporal/Trend Signals
You deprecated `trendAlignment`, but some signals about content freshness matter:
- Is this format currently oversaturated?
- Does the audio/sound have recognizable trend markers?

Consider: `format_saturation` (how common is this format right now?)

#### 2. Competitive Differentiation
For hospitality clients, a key question is: "Will this stand out from what competitors are posting?"
- If 50 cafés use the same format, replicability is high but value is low

Consider: `differentiation_potential` signal

#### 3. Platform-Specific Signals
TikTok vs Instagram Reels have different algorithm preferences. v1.1 doesn't account for:
- Optimal duration per platform
- Caption/text overlay conventions
- Sound library usage

Consider: `platform_fit` sub-object if multi-platform is a goal

---

## Integration with Hagen Architecture

### Where This Schema Lives

```
Layer A (Immutable): Raw Gemini output using v1.1 prompts
    ↓
Layer B (Extracted): SignalExtractor parses into SigmaTasteV1_1 interface
    ↓
Layer C (Computed): Utility score + Quality score → sigma_taste_final
```

### Migration from v1.0 Data
The existing `dataset_2025-12-16.json` uses v1.0 schema. Options:

1. **Re-analyze**: Run videos through Vertex with v1.1 system instructions (recommended for comparison learning)
2. **Migrate**: Map old fields to new structure where possible, mark decomposed fields as `null`
3. **Dual-track**: Maintain both versions, compare signals across schemas

### Human Override Compatibility
Per Architecture Registry, `human_overrides` JSONB accepts any structure. v1.1 signals can be overridden without schema migration:

```json
{
  "human_overrides": {
    "hook_analysis.desperation_signals.detected": false,
    "replicability_decomposed.actor_requirements.social_risk_required": "mild"
  }
}
```

---

*This document should be updated whenever schema changes are considered. Add proposed changes to Changelog as "Planned" before implementation.*
