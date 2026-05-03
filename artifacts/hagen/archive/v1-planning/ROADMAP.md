# Feature Roadmap - Deferred Until Core System is Validated

> **STATUS**: All features in this document are **SHELVED** until the core rating system is simplified and validated.
>
> **Last Updated**: December 9, 2025
>
> **Decision**: Focus on simplification and validation of existing functionality before adding complexity.

---

## Priority: Establish Reliable Quality Metrics First

Before implementing any new features, we must:

1. ✅ **Simplify the database schema** - Remove redundant tables/columns
2. ✅ **Validate the rating system** - Ensure `/analyze-rate` produces reliable quality insights
3. ✅ **Extract quality framework** - Understand what makes content "good" from existing 100 ratings
4. ✅ **Build correlation analysis** - Connect Gemini features to human preferences
5. ⏳ **Prove evergreen metrics** - Identify universal quality signals independent of trends/brand

---

## Deferred Features (From FEATURE_GAPS_AND_FRAMEWORKS.md)

### Priority 1: High Impact, Easy to Add
**When to implement**: After core metrics are validated and showing >0.6 correlation with human ratings

#### 1.1 Enhanced Humor Analysis
```javascript
// Add to Gemini analysis prompt
script.humor.target: "self" | "customer" | "employee" | "situation" | "none"
script.humor.violationType: "norm" | "social" | "linguistic" | "logical" | "physical" | "none"
```

**Rationale**: These categorizations could improve joke structure understanding, but only if current humor analysis proves predictive.

**Validation needed**: 
- Does current `script.humor.humorType` correlate with ratings?
- Do we need finer granularity?

---

#### 1.2 The "Game" Detection (Improv Concept)
```javascript
// Add to script analysis
script.game: {
  identified: boolean,
  description: string,
  heighteningCount: number,
  gameClarity: 1-10
}
```

**Rationale**: Pattern repetition and escalation are key to comedy, but requires validating current `script.structure` features first.

**Validation needed**:
- Does `script.structure.pacing` capture this already?
- Is heightening distinct from existing payoff metrics?

---

#### 1.3 Role Clarity Enhancement
```javascript
// Add to casting analysis
casting.roles: {
  primary: { type: string, archetype: string },
  secondary: { type: string, archetype: string },
  dynamic: "service" | "conflict" | "collaboration" | "other"
}
```

**Rationale**: Customer/employee dynamics are key to small business content, but need to validate `casting.minimumPeople` predictive power first.

**Validation needed**:
- Does current `casting` data correlate with ratings?
- Is role dynamic captured elsewhere?

---

### Priority 2: Valuable but Complex
**When to implement**: After Priority 1 features are validated and integrated

#### 2.1 Status Transaction Analysis (Keith Johnstone)
```javascript
script.dynamics.statusTransaction: {
  initialPower: { roleA: number, roleB: number },
  finalPower: { roleA: number, roleB: number },
  reversalMoment: string
}
```

**Rationale**: Power dynamics drive comedy satisfaction, but requires sophisticated prompt engineering.

**Complexity**: Gemini must understand subtext and power relationships.

---

#### 2.2 Authenticity Markers
```javascript
brand.authenticity: {
  feelsNative: 1-10,
  overproducedRisk: 1-10,
  ugcAesthetic: boolean
}
```

**Rationale**: TikTok algorithm favors authentic content, but "authenticity" is subjective.

**Complexity**: Difficult for AI to assess without human training examples.

---

#### 2.3 Execution Barrier Analysis
```javascript
execution.barriers: {
  actingDifficulty: 1-10,
  timingCriticality: 1-10,
  locationDependency: 1-10,
  propComplexity: 1-10,
  editingSkillNeeded: 1-10,
  totalBarrierScore: 1-50
}
```

**Rationale**: Replicability is key to small business value, but overlaps with existing `script.replicability` fields.

**Validation needed**:
- Does `script.replicability.score` already capture this?
- Are granular barriers needed?

---

### Priority 3: Nice to Have
**When to implement**: After system is productionized and serving end users

#### 3.1 Replication Guide Generation
```javascript
execution.replicationGuide: {
  stepByStep: string[],
  commonMistakes: string[],
  variationIdeas: string[]
}
```

**Rationale**: Actionable output for business owners, but requires proven content selection first.

---

#### 3.2 Format Genealogy Tracking
```javascript
trends.formatGenealogy: {
  originVideo: string,
  popularizedBy: string,
  waveNumber: number
}
```

**Rationale**: Track meme evolution, but less relevant for "evergreen" focus.

---

## Brand Profile → Content Matching
**Status**: System exists but not integrated into rating workflow

### Current State
- ✅ Brand profiles fully implemented
- ✅ Brand conversations with RAG training
- ✅ Vector similarity for matching brands to content
- ❌ No connection to rating/prediction system

### What's Needed
1. **Decision**: Should ratings be brand-specific or generic?
2. **Architecture**: How should brand tone influence quality scores?
3. **Validation**: Does brand context improve or muddy core quality metrics?

### Approach (After Core Validation)
1. Rate content generically (universal quality)
2. Build brand matching as separate layer
3. Filter/rank content for specific brands
4. **Do not** let brand context affect core quality assessment

---

## Criteria Extraction (Limitless Schema)
**Status**: API exists (`/api/extract-criteria`), UI not built, `ratings_v2` table unused

### What It Does
- Uses GPT-4 to extract structured criteria from natural language notes
- Example: "weak hook but strong payoff" → `{hook: 3, payoff: 8}`

### Why It's Shelved
1. Current system has explicit dimensions (hook, pacing, originality, payoff, rewatchable)
2. Unclear if "discovered criteria" adds value over predefined dimensions
3. Adds complexity to an unvalidated rating system

### When to Revisit
- After proving predefined dimensions work
- If notes reveal important dimensions not captured
- If correlation analysis shows gaps in current schema

---

## Fine-Tuning / Model Training
**Status**: Schema exists (`tuning_jobs`, `analysis_corrections`), no training pipeline built

### What Was Planned
1. Collect corrections to Gemini analysis
2. Fine-tune Gemini model on corrections
3. Improve analysis accuracy over time

### Why It's Shelved
1. Don't know yet what "correct" looks like
2. Need validated quality framework first
3. May not need fine-tuning if prompt engineering + RAG suffices

### When to Revisit
- After 500+ ratings with consistent quality framework
- If correlation analysis shows systematic Gemini errors
- If prompt improvements plateau

---

## Decision Log

### December 9, 2025 - Focus on Simplification
**Decision**: Shelve all feature additions until core system works reliably.

**Reasoning**:
- Current AI predictions don't align with human quality judgments
- Multiple rating systems (old 5+1 vs new quality tiers) create confusion
- Schema has redundant storage (dual writes, unused tables)
- Don't know yet which 150-200 Gemini features actually predict quality

**Actions**:
1. Simplify database (drop unused tables/columns)
2. Consolidate to single rating workflow (`/analyze-rate`)
3. Extract quality framework from existing 100 ratings
4. Build correlation analysis to validate Gemini features
5. Establish "evergreen quality" metrics independent of brand/tone

**Success Criteria**:
- Correlation >0.6 between Gemini features and human ratings
- Clear definition of "evergreen quality" dimensions
- Reproducible pattern: high-scoring videos share identifiable traits
- Confidence in what makes content "good"

---

## Notes on "Evergreen Quality"

From user's priorities:

> "I believe the joke analysis (type and script) can somehow structure up a reliable metric in discerning useful from not useful. Another would be replicability, as well as 'safeness' in its tone."

### Hypothesized Core Dimensions
1. **Joke Mechanics** - Clear setup, game, heightening, payoff
2. **Replicability** - Low barrier to copy (acting, props, location)
3. **Safety** - Wholesome, broad appeal, low brand risk
4. **Standalone Clarity** - Works without context or trend knowledge
5. **Universality** - Transcends specific industries/moments

### Temporal Factors to EXCLUDE
- Trend dependency
- Meme references
- Cultural moments
- Specific celebrities/events

### Validation Approach
1. Extract these themes from existing 100 rating notes
2. Map themes to Gemini's 150-200 features
3. Calculate correlations
4. Identify which Gemini fields predict "evergreen quality"
5. Build composite score from validated features

---

## References

- **FEATURE_GAPS_AND_FRAMEWORKS.md** - Comprehensive feature wishlist (all deferred)
- **DATA_ARCHITECTURE.md** - Current system architecture
- **LAYER1_CALIBRATION.md** - Original rating calibration guide

---

*This document will be updated as the core system is validated and features are re-evaluated for implementation.*
