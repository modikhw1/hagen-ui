# Hagen Integration Package — Complete Context

> **Purpose:** This folder contains everything the `hagen` project needs to understand the σTaste taste analysis work done in `hagen_ta`. Import this context to inform schema changes, Vertex AI system instructions, and fingerprint algorithm updates.
>
> **Generated:** December 18, 2025  
> **Source Repository:** [hagen_ta](https://github.com/modikhw1/hagen_ta)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Discoveries from 254 Comparisons](#key-discoveries-from-254-comparisons)
3. [The σTaste Concept](#the-σtaste-concept)
4. [Question Battery Insights Summary](#question-battery-insights-summary)
5. [Schema Evolution: v1.0 → v1.1](#schema-evolution-v10--v11)
6. [Vertex AI System Instructions](#vertex-ai-system-instructions)
7. [Correlation Data](#correlation-data)
8. [Implementation Priorities](#implementation-priorities)
9. [Files in This Package](#files-in-this-package)

---

## Project Overview

### What is hagen_ta?

`hagen_ta` (Hagen Taste Analysis) is a companion project to the main `hagen` codebase. It was created to:

1. **Collect comparison data** — 254 pairwise video comparisons with reasoning notes
2. **Discover hidden preferences** — Statistical analysis of what actually predicts preference
3. **Calibrate the σTaste model** — Question battery to surface conscious vs unconscious criteria
4. **Evolve the schema** — v1.1 improvements based on findings

### Why This Matters for hagen

The `hagen` service needs to:
- **Match videos to hospitality brands** — Restaurants, cafés, bars
- **Score content for replicability** — Can the business actually make this?
- **Rank by quality within strata** — Compare apples to apples, not interview content vs sketch comedy

The `hagen_ta` analysis revealed that the v1.0 schema:
- Uses `hookStrength` as positive signal, but it's **actually negative** in user preferences
- Treats `replicability` as one score, but it needs **8+ sub-factors**
- Ignores `audioQuality` in weighting, despite it being the **2nd strongest predictor**
- Has no way to **filter by content type** before ranking

---

## Key Discoveries from 254 Comparisons

### Quantitative Findings (Correlation Analysis)

| Variable | Correlation (r) | Interpretation |
|----------|-----------------|----------------|
| `attentionRetention` | **+0.173** | 🏆 TOP predictor — sustained engagement wins |
| `audioQuality` | **+0.169** | 2nd strongest — often unnoticed but powerful |
| `cutsPerMinute` | **+0.129** | Fast, intentional editing preferred |
| `scriptOriginality` | **+0.123** | Novelty matters |
| `hookStrength` | **-0.047** | ⚠️ NEGATIVE — flashy hooks hurt preference |
| `scriptReplicability` | **+0.033** | Near-zero — discussed often, doesn't predict |

### Qualitative Findings (106 Reasoning Notes)

| Theme | % of Notes | Alignment with Data |
|-------|------------|---------------------|
| Script quality | 62.3% | ✅ Aligned with originality correlation |
| Production | 52.8% | ✅ Aligned with cutsPerMinute |
| Humor | 49.1% | ⚠️ No strong humor metric predicts |
| Originality | 44.3% | ✅ Aligned |
| Replicability | 42.5% | ❌ Discussed but doesn't predict |
| Payoff | 40.6% | ⚠️ No payoff metric predicts directly |
| Audio | 7.5% | ❌ Rarely mentioned but 2nd strongest predictor |

### Key Paradoxes

1. **The Audio Paradox** — 2nd strongest predictor, rarely consciously noticed
2. **The Replicability Delusion** — Heavily analyzed but doesn't affect preference
3. **The Anti-Hook Effect** — Flashy openings actually hurt preference
4. **The Payoff Gap** — Frequently discussed, but `attentionRetention` is what matters

---

## The σTaste Concept

### Dual Nature (from Question Battery 8.1)

σTaste is NOT a single quality score. It combines:

1. **Utility Value** — Will this work for the Hagen service?
   - Replicability by typical hospitality business
   - Format appropriateness
   - Audience alignment

2. **Subjective Quality** — Is this "good" content?
   - Creativity and originality
   - Execution quality
   - Payoff satisfaction

### The Strata Insight (from Question Battery 8.3)

Content should be evaluated in layers:

```
STAGE 1: Is this the right TYPE? (sketch, interview, montage, etc.)
    → Filter out wrong types before comparing
    
STAGE 2: Is this REPLICABLE by a typical business?
    → Score utility, not just quality
    
STAGE 3: How GOOD is this within its type?
    → Now rank by σTaste quality signals
```

**Why this matters:** Comparing interview content against sketch comedy is apples-to-oranges. Filter first, then rank within categories.

---

## Question Battery Insights Summary

The full Question Battery ([QUESTION_BATTERY.md](../QUESTION_BATTERY.md)) contains 8 parts with user answers. Key takeaways:

### Part 1: Audio
- Audio quality predicts preference but isn't consciously noticed
- Likely connected to overall production intentionality
- **Action:** Elevate `audioQuality` weight, add `production_polish` composite

### Part 2: Hooks vs Retention
- High `hookStrength` often signals desperation/clickbait
- Slow burn content preferred over flashy openings
- **Action:** Make hook analysis nuanced (detect "desperation signals")

### Part 3: Originality
- "Clever" = subverts expectations without being obvious
- "Obvious" = premise fully explained in first second
- **Action:** Split originality into premise/execution/combination novelty

### Part 4: Humor
- Every humor type can work; execution matters more than type
- Comedic timing and joke construction are key
- **Action:** Add `humor_execution_quality` separate from `isHumorous`

### Part 5: Payoff
- Weak payoffs = obvious closure, known tropes played straight
- Strong payoffs = earned by setup, pleasant surprises, memorable
- **Action:** Add `payoff_analysis` with earned/cheap distinction

### Part 6: Production
- "Intentional editing" signals quality
- Too much editing can make replication harder
- **Action:** Track editing intentionality, not just cuts/minute

### Part 7: Hidden Variables
- **Narrative coherence** — Story flows in one direction, beats build
- **Performer execution** — Selling the concept, taking social risks
- **Action:** Add both as new signal categories

### Part 8: Meta
- σTaste = utility + subjective quality
- Need strata to filter before comparing
- Model should understand jokes like humans do
- **Action:** Implement three-stage pipeline

---

## Schema Evolution: v1.0 → v1.1

See [SCHEMA_V1.1_SIGMA_TASTE.md](./SCHEMA_V1.1_SIGMA_TASTE.md) for full details.

### Summary of Changes

| Category | v1.0 | v1.1 |
|----------|------|------|
| Content classification | None | `content_type`, `service_relevance`, `strata_id` |
| Replicability | Single score | 8 decomposed sub-factors |
| Hook analysis | `hookStrength` (positive) | Nuanced with `desperation_signals` |
| Narrative | Not captured | `narrative_flow`, `beat_progression` |
| Performer | Not captured | `performer_execution`, `social_risk` |
| Payoff | Basic | Enhanced with `earned_vs_cheap` |
| Audio | Basic | Feeds `production_polish` composite |

### New TypeScript Interfaces

```typescript
// Stage 1: Classification
interface ContentClassification {
  content_type: "sketch_comedy" | "interview_format" | "montage_visual" | ...;
  service_relevance: "in_scope" | "out_of_scope" | "edge_case";
  strata_id?: "hospitality_sketch" | "workplace_relatable" | ...;
}

// Stage 2: Decomposed Replicability
interface ReplicabilityDecomposed {
  one_to_one_copy_feasibility: { score: 1 | 2 | 3; reasoning: string; };
  actor_requirements: { count: string; skill_level: string; social_risk_required: string; };
  environment_requirements: { backdrop_interchangeability: string; prop_dependency: {...}; };
  production_requirements: { editing_skill: string; editing_as_punchline: boolean; };
  concept_transferability: { product_swappable: boolean; humor_travels: boolean; };
}

// Stage 3: Quality Signals
interface NarrativeFlow { story_direction: string; beat_progression: {...}; coherence_score: 1-5; }
interface PerformerExecution { concept_selling: {...}; tonal_match: {...}; commitment_signals: {...}; }
interface HookAnalysis { hook_style: string; desperation_signals: {...}; promise_quality: {...}; }
interface PayoffAnalysis { payoff_type: string; closure_quality: {...}; surprise_fit: {...}; }
```

---

## Vertex AI System Instructions

### Complete Template for Gemini Analysis

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

## Rubrics

### What Makes Content "Clever" vs "Obvious"
**Clever:**
- Subverts expectations without being too on-the-nose
- Uses cultural callbacks that feel earned, not lazy
- Has meaning between the lines (subtext)
- The payoff doesn't come from miles away

**Obvious:**
- Premise fully explained in the first second
- Known trope executed without twist
- Payoff is exactly what was promised, nothing more

### What Makes a Hook "Desperate"
- Excessive text in first second
- Entire premise revealed before content begins  
- Clickbait promise that doesn't require the video
- Loud/jarring attention grab without substance

### Replicability: social_risk_required
- **none**: Standing and talking, basic presence
- **mild**: Light comedic acting, mild expressions
- **significant**: Exaggerated reactions, physical comedy, vulnerability shown
- **extreme**: Public embarrassment, controversial content, full commitment required

### Replicability: editing_skill
- **basic_cuts**: Simple scene transitions
- **timed_edits**: Cuts need to hit beats, but achievable by amateur
- **effects_required**: Transitions, filters, or compositing needed
- **professional_post**: The edit IS the joke; poor editing kills it
```

---

## Correlation Data

### Variables to Weight UP

| Signal | Correlation | Recommended Weight |
|--------|-------------|-------------------|
| `attentionRetention` | +0.173 | **2.0x** (top predictor) |
| `audioQuality` | +0.169 | **1.8x** (underappreciated) |
| `cutsPerMinute` | +0.129 | **1.5x** (pacing proxy) |
| `scriptOriginality` | +0.123 | **1.4x** (aligned with notes) |

### Variables to Weight DOWN

| Signal | Correlation | Recommended Weight |
|--------|-------------|-------------------|
| `hookStrength` | -0.047 | **0.5x** or use nuanced analysis |
| `scriptReplicability` | +0.033 | **0.7x** (discussed but irrelevant) |
| `technical.pacing` | -0.035 | **0.8x** (weak signal) |

### New Variables to ADD

| Signal | Rationale |
|--------|-----------|
| `narrative_coherence` | Story flow beyond pacing |
| `production_polish` | Composite of intentional audio+visual |
| `performer_execution` | How well concept is sold |
| `engagement_curve` | Retention over time, not just total |
| `humor_execution_quality` | Beyond binary "isHumorous" |

---

## Implementation Priorities

### Immediate (Apply to hagen now)

1. **Adjust Vertex system instructions** — Use the template above
2. **Reconfigure weights** — Apply the correlation-based recommendations
3. **Add content classification** — Filter before ranking

### Short-term (v1.1 schema migration)

1. **Decompose replicability** — 8 sub-factors instead of single score
2. **Add narrative_flow signals** — Beat progression, story direction
3. **Add performer_execution** — Concept selling, social risk
4. **Rework hook_analysis** — Desperation detection

### Medium-term (Calibration loop)

1. **Re-analyze subset with v1.1 prompts** — Compare to v1.0
2. **Build human override tracking** — Learn from corrections
3. **Create strata-specific rubrics** — Different expectations per content type

---

## Files in This Package

| File | Description |
|------|-------------|
| `CONTEXT.md` | This file — complete project context |
| `SCHEMA_V1.1_SIGMA_TASTE.md` | Full v1.1 schema with TypeScript interfaces and rationale |
| `SCHEMA_V1.1_JSON_SCHEMA.json` | JSON Schema definition for v1.1 (machine-readable) |
| `VERTEX_SYSTEM_INSTRUCTIONS.md` | Copy-paste ready Vertex AI system instructions |
| `CORRELATION_DATA.json` | Raw correlation analysis with methodology |
| `QUESTION_BATTERY_SUMMARY.json` | Structured Q&A insights from calibration battery |
| `WEIGHT_RECOMMENDATIONS.json` | Fingerprint weight adjustments with implementation notes |

### How to Use This Package

1. **Start with CONTEXT.md** — Read this file for complete overview
2. **Copy VERTEX_SYSTEM_INSTRUCTIONS.md** — Paste into your Gemini API calls
3. **Apply WEIGHT_RECOMMENDATIONS.json** — Update fingerprint weights in profile-fingerprint.ts
4. **Reference SCHEMA_V1.1_JSON_SCHEMA.json** — Use for TypeScript type generation or validation
5. **Consult QUESTION_BATTERY_SUMMARY.json** — Understand the reasoning behind changes

---

## Quick Reference: What Changed

### Conceptual Shifts

| v1.0 Assumption | v1.1 Reality |
|-----------------|--------------|
| Hook strength is good | Hook strength is often desperation |
| Replicability is one thing | Replicability has 8+ dimensions |
| All content types compared equally | Filter by strata first |
| Audio rarely matters | Audio is 2nd strongest predictor |
| Payoff discussion = payoff metric | Attention retention matters more |

### Architecture Shifts

| v1.0 | v1.1 |
|------|------|
| Single scoring pipeline | 3-stage: classify → filter → rank |
| Video fingerprint = brand match | Video fingerprint ≠ brand needs |
| Pure similarity matching | Hard filters + soft scoring |
| Quality as penalty | Aspiration as opportunity |

---

*This package was generated from 254 pairwise comparisons, 106 reasoning notes, and 120 analyzed videos with 38,500 lines of JSON analysis data.*
