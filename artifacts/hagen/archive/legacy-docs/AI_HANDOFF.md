# AI Handoff Document: TikTok Skit Analysis Training System

> **Purpose**: Provide context for a new AI instance to understand and continue work on this project.
> **Last Updated**: December 3, 2025

---

## 1. OVERARCHING GOAL

### Mission
Train an AI system to **predict which TikTok skits a specific user (the owner) will find valuable** for replication by small businesses (restaurants, cafés, bars).

### The Core Problem
1. Owner watches TikTok skits and has **strong preferences** about which ones are:
   - Worth studying
   - Replicable by small businesses with limited resources
   - Evergreen vs. trend-dependent
   
2. AI (Gemini) can analyze videos and extract 150-200 features, but **doesn't know which features align with owner's taste**

3. **Goal**: Learn the correlation between AI-extracted features and human ratings, then use that to pre-filter/rank new videos

### Success Criteria
- AI can predict owner's rating (5+1 scale) before they watch
- AI can explain WHY a video will/won't appeal to owner
- AI can filter out low-value videos before human review
- Eventually: AI suggests videos that match owner's preferences

---

## 2. THE RATING SYSTEM

### Human Rating Scale: 5+1 Dimensions
Videos are rated by the owner on 6 dimensions:

| Dimension | What It Measures |
|-----------|------------------|
| **Hook** | Does the first 1-3 seconds grab attention? |
| **Pacing** | Is the timing right? Does it hold attention throughout? |
| **Payoff** | Is the ending satisfying? Worth the watch? |
| **Originality** | Is this fresh or just another copy? |
| **Rewatchable** | Would you watch it again? Share with others? |
| **Overall** | Holistic rating (0-10, converted to 0-1) |

Plus: Free-form **notes** explaining what works/doesn't work

### Owner's Known Preferences (from ~50 rated videos)
**Likes**:
- Script-driven comedy (dialogue over sound effects)
- Self-deprecating humor (employee/brand as butt of joke)
- Clear "game" with escalation (improv term)
- Low production value is fine if concept is clever
- 1-2 person skits (easy to replicate)
- Evergreen formats (not trend-dependent)

**Dislikes**:
- Relies on sound effects as crutch
- Over-produced/polished (feels like an ad)
- Meme-dependent (dates quickly)
- Requires skilled acting
- Weak or no payoff
- Industry-locked (only works for specific business type)

---

## 3. DATA ARCHITECTURE

### Database: Supabase (PostgreSQL)

#### Table: `analyzed_videos`
Primary video storage with metadata and AI analysis.

| Key Column | Type | Description |
|------------|------|-------------|
| `id` | uuid | Primary key |
| `video_url` | text | Original TikTok URL |
| `metadata` | jsonb | Platform metadata (views, likes, etc.) |
| `gcs_uri` | text | Google Cloud Storage path to video file |
| `visual_analysis` | jsonb | **Deep AI analysis (150-200 features)** |
| `created_at` | timestamp | When imported |

**⚠️ Legacy Warning**: `user_ratings`, `user_tags`, `user_notes` columns exist but are EMPTY. Ratings are in separate table.

#### Table: `video_ratings`
Human ratings (the ground truth for training).

| Key Column | Type | Description |
|------------|------|-------------|
| `id` | uuid | Primary key |
| `video_id` | uuid | FK to `analyzed_videos.id` |
| `overall_score` | float | 0-1 scale (owner's rating) |
| `dimensions` | jsonb | `{hook, pacing, payoff, originality, rewatchable}` |
| `notes` | text | Owner's detailed analysis/reasoning |
| `ai_prediction` | jsonb | What AI predicted before human rated |

### Storage: Google Cloud Storage
- Bucket: `gs://hagen-video-analysis/videos/{uuid}.mp4`
- Videos downloaded from TikTok for Gemini analysis

---

## 4. COMPLETE DEEP ANALYSIS SCHEMA (v3)

When Gemini analyzes a video via `/api/videos/reanalyze`, it extracts 150-200+ features into `visual_analysis`. Below is the **complete** schema with every variable:

---

### 4.1 VISUAL (12 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `visual.hookStrength` | 1-10 | How compelling the first 3 seconds are |
| `visual.hookDescription` | string | What makes the opening work or not |
| `visual.overallQuality` | 1-10 | Production value and visual polish |
| `visual.mainElements` | string[] | All key visual elements |
| `visual.colorPalette` | string[] | Dominant colors used |
| `visual.colorDiversity` | 1-10 | Variety and impact of colors |
| `visual.transitions` | string[] | Types of transitions between shots |
| `visual.textOverlays` | string[] | Any text on screen |
| `visual.visualHierarchy` | string | What draws the eye and when |
| `visual.compositionQuality` | 1-10 | Shot composition quality |
| `visual.peopleCount` | number | Number of people visible |
| `visual.settingType` | enum | indoor/outdoor/mixed/animated |
| `visual.summary` | string | Comprehensive visual analysis |

---

### 4.2 AUDIO (10 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `audio.quality` | 1-10 | Audio production quality |
| `audio.musicType` | string | Background music category or "none" |
| `audio.musicGenre` | string | Specific genre if applicable |
| `audio.hasVoiceover` | boolean | Has voiceover? |
| `audio.voiceoverQuality` | 1-10/null | Voiceover quality if present |
| `audio.voiceoverTone` | string | Tone and delivery style |
| `audio.energyLevel` | enum | low/medium/high |
| `audio.audioEnergy` | 1-10 | Intensity and engagement |
| `audio.soundEffects` | string[] | All sound effects used |
| `audio.audioVisualSync` | 1-10 | How well audio matches visuals |

---

### 4.3 CONTENT (8 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `content.topic` | string | Precise topic/subject matter |
| `content.style` | string | educational/entertaining/inspirational/etc |
| `content.format` | string | talking head/montage/tutorial/skit/etc |
| `content.duration` | number | Duration in seconds |
| `content.keyMessage` | string | Core message or takeaway |
| `content.narrativeStructure` | string | How the story unfolds |
| `content.targetAudience` | string | Who this appeals to |
| `content.emotionalTone` | string | Dominant emotion conveyed |

---

### 4.4 SCENES (per-scene breakdown + 5 meta variables)
| Variable | Type | Description |
|----------|------|-------------|
| `scenes.description` | string | Overview of scene analysis |
| `scenes.sceneBreakdown[]` | array | Array of scene objects (see below) |
| `scenes.totalScenes` | number | Count of distinct scenes/shots |
| `scenes.editAsPunchline` | boolean | Does an edit itself serve as punchline? |
| `scenes.editPunchlineExplanation` | string | How edit delivers the joke |
| `scenes.visualNarrativeSync` | 1-10 | How tightly visuals and story sync |
| `scenes.misdirectionTechnique` | string | How false expectations are set visually |
| `scenes.keyVisualComedyMoment` | string | THE most important visual comedy element |

**Per-scene object (scenes.sceneBreakdown[]):**
| Variable | Type | Description |
|----------|------|-------------|
| `sceneNumber` | number | Sequential scene number |
| `timestamp` | string | Approximate start time |
| `visualContent` | string | What is SHOWN visually |
| `audioContent` | string | What is SAID or HEARD |
| `visualComedyDetail` | string/null | Visual gag description if present |
| `narrativeFunction` | enum | hook/setup/development/misdirection/reveal/payoff/callback/tag |
| `editSignificance` | string | Why this cut/transition matters |
| `viewerAssumption` | string | What viewer assumes during this scene |

---

### 4.5 SCRIPT (33 variables across sub-objects)

**script.*** (base)
| Variable | Type | Description |
|----------|------|-------------|
| `script.conceptCore` | string | One-sentence replicable concept |
| `script.hasScript` | boolean | Scripted vs spontaneous? |
| `script.scriptQuality` | 1-10/null | How well-written |
| `script.transcript` | string | What is said/shown |
| `script.visualTranscript` | string | Scene-by-scene with stage directions |

**script.humor.*** (7 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `script.humor.isHumorous` | boolean | Is humor present? |
| `script.humor.humorType` | enum | subversion/absurdist/observational/physical/wordplay/callback/contrast/deadpan/escalation/satire/parody/visual-reveal/edit-punchline/none |
| `script.humor.humorMechanism` | string | HOW the humor works |
| `script.humor.visualComedyElement` | string | Visual element essential to joke |
| `script.humor.comedyTiming` | 1-10 | Effectiveness of timing |
| `script.humor.absurdismLevel` | 1-10 | How much it violates logic |
| `script.humor.surrealismLevel` | 1-10 | Dream-like/reality distortion |

**script.structure.*** (10 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `script.structure.hookType` | enum | question/statement/action/mystery/pattern-interrupt/relatable-situation/visual-shock |
| `script.structure.hook` | string | What happens in first 1-3 seconds |
| `script.structure.setup` | string | What expectation is established |
| `script.structure.development` | string | How middle section builds |
| `script.structure.payoff` | string | How expectation is resolved/subverted |
| `script.structure.payoffType` | enum | verbal/visual/visual-reveal/edit-cut/combination |
| `script.structure.payoffStrength` | 1-10 | How satisfying the conclusion is |
| `script.structure.hasCallback` | boolean | References earlier elements? |
| `script.structure.hasTwist` | boolean | Unexpected turn? |
| `script.structure.twistDelivery` | enum | verbal/visual/edit |

**script.emotional.*** (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `script.emotional.primaryEmotion` | string | Main emotion engineered |
| `script.emotional.emotionalArc` | string | How emotion changes |
| `script.emotional.emotionalIntensity` | 1-10 | Strength of impact |
| `script.emotional.relatability` | 1-10 | How relatable to average viewer |

**script.replicability.*** (6 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `script.replicability.score` | 1-10 | How easy to recreate |
| `script.replicability.template` | string | Templatable format description |
| `script.replicability.requiredElements` | string[] | Essential elements |
| `script.replicability.variableElements` | string[] | Swappable elements |
| `script.replicability.resourceRequirements` | enum | low/medium/high |
| `script.replicability.contextDependency` | 1-10 | 1=universal, 10=creator-specific |

**script.originality.*** (3 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `script.originality.score` | 1-10 | How fresh/novel |
| `script.originality.similarFormats` | string[] | Known similar formats |
| `script.originality.novelElements` | string[] | What makes it different |

---

### 4.6 CASTING (6 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `casting.minimumPeople` | number | Minimum people required |
| `casting.requiresCustomer` | boolean | Needs customer/stranger? |
| `casting.attractivenessDependency` | 1-10 | Relies on looks? 1=anyone, 10=only attractive |
| `casting.personalityDependency` | 1-10 | Needs specific persona? |
| `casting.actingSkillRequired` | 1-10 | Acting/improv ability needed |
| `casting.castingNotes` | string | Who could perform this |

---

### 4.7 PRODUCTION (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `production.shotComplexity` | 1-10 | Camera setups needed. 1=single static |
| `production.editingDependency` | 1-10 | Editing essential? 1=single take works |
| `production.timeToRecreate` | enum | 15min/30min/1hr/2hr/half-day/full-day |
| `production.equipmentNeeded` | string[] | Beyond smartphone |
| `production.productionNotes` | string | Production complexity explanation |

---

### 4.8 FLEXIBILITY (6 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `flexibility.industryLock` | 1-10 | Locked to specific business? 1=anywhere |
| `flexibility.industryExamples` | string[] | 3-5 business types that could use this |
| `flexibility.propDependency` | 1-10 | Requires specific props? |
| `flexibility.swappableCore` | boolean | Can central topic be replaced? |
| `flexibility.swapExamples` | string | What could be swapped |
| `flexibility.flexibilityNotes` | string | How adaptable |

---

### 4.9 COMEDY STYLE (50+ variables - most detailed section)

**comedyStyle.*** (base)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.isHumorFocused` | boolean | Humor is PRIMARY purpose? |
| `comedyStyle.primaryTechnique` | enum | visual-metaphor/verbal-subversion/absurdist-contrast/reaction-comedy/physical-slapstick/deadpan-delivery/escalation/anti-humor/cringe/wholesome-twist/dramatic-irony/meta-commentary/power-dynamic-absurdism/genre-transplant/third-party-reaction/hidden-malice-reveal/none |

**comedyStyle.visualMetaphor.*** (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.visualMetaphor.present` | boolean | Visual represents internal state? |
| `comedyStyle.visualMetaphor.element` | string | The visual (e.g., "overfilling drinks") |
| `comedyStyle.visualMetaphor.represents` | string | What it symbolizes |
| `comedyStyle.visualMetaphor.whyEffective` | string | Why this works |

**comedyStyle.genreTransplant.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.genreTransplant.present` | boolean | Borrows dramatic genre conventions? |
| `comedyStyle.genreTransplant.sourceGenre` | string | war film/horror/thriller/etc |
| `comedyStyle.genreTransplant.mundaneSetting` | string | The everyday context |
| `comedyStyle.genreTransplant.dramaticElement` | string | Specific convention borrowed |
| `comedyStyle.genreTransplant.whyEffective` | string | Effect from contrast |

**comedyStyle.powerDynamicAbsurdism.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.powerDynamicAbsurdism.present` | boolean | Violates social contracts? |
| `comedyStyle.powerDynamicAbsurdism.dynamicType` | enum | pet-owner/parent-child/authority-subordinate/etc |
| `comedyStyle.powerDynamicAbsurdism.violatedNorm` | string | What expectation is broken |
| `comedyStyle.powerDynamicAbsurdism.playedStraight` | boolean | Presented matter-of-factly? |
| `comedyStyle.powerDynamicAbsurdism.whyEffective` | string | Why this works |

**comedyStyle.thirdPartyReaction.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.thirdPartyReaction.present` | boolean | Punchline via observer reaction? |
| `comedyStyle.thirdPartyReaction.primaryActors` | string | Main interaction |
| `comedyStyle.thirdPartyReaction.reactingParty` | string | Who reacts |
| `comedyStyle.thirdPartyReaction.reactionType` | enum | frustration/confusion/exasperation/deadpan/shock/amusement/resignation |
| `comedyStyle.thirdPartyReaction.whyEffective` | string | Why observer's reaction delivers payoff |

**comedyStyle.hiddenMaliceReveal.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.hiddenMaliceReveal.present` | boolean | Reveals hidden ill intent? |
| `comedyStyle.hiddenMaliceReveal.revealLine` | string | The specific reveal moment |
| `comedyStyle.hiddenMaliceReveal.characterAppearance` | string | How character seemed before |
| `comedyStyle.hiddenMaliceReveal.actualIntent` | string | True intentions revealed |
| `comedyStyle.hiddenMaliceReveal.whyEffective` | string | Shock of manipulation reveal |

**comedyStyle.contrastMechanism.*** (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.contrastMechanism.present` | boolean | Effect from contrast? |
| `comedyStyle.contrastMechanism.element1` | string | First element |
| `comedyStyle.contrastMechanism.element2` | string | Contrasting element |
| `comedyStyle.contrastMechanism.contrastType` | enum | tone-shift/scale-mismatch/expectation-reality/dramatic-mundane/sincere-absurd/genre-reality/positive-negative |

**comedyStyle.physicalComedyDetails.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.physicalComedyDetails.present` | boolean | Physical action central? |
| `comedyStyle.physicalComedyDetails.action` | string | The physical element |
| `comedyStyle.physicalComedyDetails.suddenness` | boolean | Unexpected for shock? |
| `comedyStyle.physicalComedyDetails.timing` | string | When and why timing matters |
| `comedyStyle.physicalComedyDetails.wouldWorkWithoutVisual` | boolean | Works as audio-only? |

**comedyStyle.punchlineStructure.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.punchlineStructure.layeredPunchline` | boolean | Multiple punchlines? |
| `comedyStyle.punchlineStructure.punchlineCount` | number | How many payoff moments |
| `comedyStyle.punchlineStructure.punchlines[]` | array | Array of {type, description, whatItReveals} |
| `comedyStyle.punchlineStructure.finalTwist` | string | Final recontextualization |
| `comedyStyle.punchlineStructure.characterSubversion` | string | Character not who they seemed? |

**comedyStyle.musicMomentAmplifier.*** (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `comedyStyle.musicMomentAmplifier.present` | boolean | Music amplifies moment? |
| `comedyStyle.musicMomentAmplifier.momentType` | enum | swagger/triumph/dramatic-reveal/tension/comedy-sting/main-character-energy/emotional-payoff |
| `comedyStyle.musicMomentAmplifier.musicStyle` | string | The music/sound description |
| `comedyStyle.musicMomentAmplifier.characterEffect` | string | How music elevates character |
| `comedyStyle.musicMomentAmplifier.essentialToEffect` | boolean | Would moment land without music? |

---

### 4.10 TRENDS (8 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `trends.usesPremadeSound` | boolean | Uses TikTok trending audio? |
| `trends.soundName` | string | Name of sound/trend |
| `trends.soundEssential` | boolean | Sound essential to joke? |
| `trends.memeDependent` | boolean | Relies on current meme? |
| `trends.trendName` | string | Meme/trend name if applicable |
| `trends.trendLifespan` | enum | dead-meme/dying/current/evergreen-trope/not-trend-dependent |
| `trends.insideJokeDependency` | 1-10 | Creator's recurring jokes needed? |
| `trends.culturalSpecificity` | 1-10 | Culture/region-specific? |
| `trends.trendNotes` | string | Trend/cultural dependencies |

---

### 4.11 BRAND (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `brand.riskLevel` | 1-10 | Risk for conservative brand? |
| `brand.toneMatch` | string[] | corporate/playful/edgy/youthful/wholesome/irreverent |
| `brand.adultThemes` | boolean | Adult/suggestive content? |
| `brand.brandExclusions` | string[] | Brand types that should NOT use this |
| `brand.brandNotes` | string | Brand fit considerations |

---

### 4.12 STANDALONE (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `standalone.worksWithoutContext` | 1-10 | Works for new viewer? 1=needs backstory |
| `standalone.worksWithoutProduct` | boolean | Works without specific product? |
| `standalone.requiresSetup` | boolean | Needs external context? |
| `standalone.standaloneNotes` | string | How self-contained |

---

### 4.13 EXECUTION (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `execution.physicalComedyLevel` | 1-10 | Physical comedy vs dialogue? |
| `execution.timingCriticality` | 1-10 | Perfect timing needed? |
| `execution.improvisationRoom` | 1-10 | Room to riff vs exact script? |
| `execution.executionNotes` | string | Execution requirements |

---

### 4.14 TECHNICAL (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `technical.pacing` | 1-10 | Maintains momentum? |
| `technical.editingStyle` | string | Editing approach |
| `technical.cutsPerMinute` | number | Approximate cuts |
| `technical.cameraWork` | string | Camera techniques |
| `technical.lighting` | string | Lighting quality |

---

### 4.15 ENGAGEMENT (4 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `engagement.attentionRetention` | 1-10 | Ability to hold attention |
| `engagement.shareability` | 1-10 | Likelihood of sharing |
| `engagement.replayValue` | 1-10 | Desire to rewatch |
| `engagement.scrollStopPower` | 1-10 | Stops scrolling? |

---

### 4.16 METADATA (3 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `feature_count` | number | Total features extracted |
| `analyzed_at` | ISO timestamp | When analysis ran |
| `analysis_model` | string | Model used (gemini-2.0-flash-vertex) |

---

### TOTAL VARIABLE COUNT

| Category | Variables |
|----------|-----------|
| visual | 13 |
| audio | 10 |
| content | 8 |
| scenes (meta) | 8 |
| scenes.sceneBreakdown[] (per scene) | 8 |
| script.* (base) | 5 |
| script.humor | 7 |
| script.structure | 10 |
| script.emotional | 4 |
| script.replicability | 6 |
| script.originality | 3 |
| casting | 6 |
| production | 5 |
| flexibility | 6 |
| comedyStyle.* (base) | 2 |
| comedyStyle sub-objects | ~43 |
| trends | 9 |
| brand | 5 |
| standalone | 4 |
| execution | 4 |
| technical | 5 |
| engagement | 4 |
| metadata | 3 |
| **TOTAL (excluding per-scene)** | **~170+** |

*Plus 8 variables per scene in `scenes.sceneBreakdown[]`, so a 5-scene video adds 40 more.*

---

### Schema Versions (Historical) - IMPORTANT

The `visual_analysis` field evolved over time. **You MUST check version before using data.**

---

#### v0 - PREDICTION ONLY (NOT deep analysis)
**Date**: Before Dec 1, 2025 | **Count**: ~22 videos | **Fields**: 3

```json
{
  "ai_prediction": { "overall": 0.7, "dimensions": {...}, "reasoning": "..." },
  "prediction_at": "2025-12-02T...",
  "prediction_model": "base"
}
```

**⚠️ WARNING**: These look like they have `visual_analysis` but contain NO actual video analysis. This was just storing the quick AI prediction before we had a proper place for it. **DO NOT USE for feature correlation.**

**How to detect**: `visual_analysis.prediction_model` exists BUT `visual_analysis.visual` does NOT exist.

---

#### v1 - BASIC DEEP ANALYSIS
**Date**: Dec 1, 2025 | **Count**: 3 videos | **Fields**: 10

Has top-level categories: `visual`, `audio`, `content`, `script`, `technical`, `engagement`

**Missing**: `scenes`, `casting`, `production`, `flexibility`, `comedyStyle`, `trends`, `brand`, `standalone`, `execution`

**How to detect**: Has `visual_analysis.visual` but `Object.keys(visual_analysis).length ≈ 10`

---

#### v2 - EXTENDED ANALYSIS
**Date**: Dec 1-2, 2025 | **Count**: ~21 videos | **Fields**: 17

Added: `casting`, `production`, `flexibility`, `trends`, `brand`, `standalone`, `execution`

**Missing**: `scenes`, `comedyStyle` (the most sophisticated analysis)

**How to detect**: Has `visual_analysis.casting` but NO `visual_analysis.comedyStyle`

---

#### v3 - FULL ANALYSIS (CURRENT)
**Date**: Dec 3, 2025+ | **Count**: ~51 videos | **Fields**: 170+

Has ALL categories including detailed `scenes.sceneBreakdown[]` and comprehensive `comedyStyle.*` with:
- Visual metaphors
- Genre transplant detection
- Power dynamic analysis
- Third-party reaction patterns
- Hidden malice reveal detection
- Punchline structure mapping

**How to detect**: `visual_analysis.feature_count >= 100` OR `visual_analysis.comedyStyle` exists

---

#### Quick Version Detection Code

```javascript
function getAnalysisVersion(visual_analysis) {
  if (!visual_analysis) return null;
  if (visual_analysis.prediction_model && !visual_analysis.visual) return 'v0';
  if (!visual_analysis.casting) return 'v1';
  if (!visual_analysis.comedyStyle) return 'v2';
  return 'v3';
}

// Only use v3 for correlation analysis:
const v3Videos = videos.filter(v => getAnalysisVersion(v.visual_analysis) === 'v3');
```

---

#### Why This Matters

| Analysis Type | v0 | v1 | v2 | v3 |
|--------------|----|----|----|----|
| Can correlate with human ratings? | ❌ | ⚠️ Partial | ⚠️ Partial | ✅ Full |
| Has comedy mechanics? | ❌ | ❌ | ❌ | ✅ |
| Has scene breakdown? | ❌ | ❌ | ❌ | ✅ |
| Has casting/production barriers? | ❌ | ❌ | ✅ | ✅ |
| Useful for preference learning? | ❌ | ⚠️ | ⚠️ | ✅ |

**Bottom line**: For training/correlation, **only use v3 videos** (where `feature_count >= 100`).

---

## 5. CURRENT DATA STATE (as of Dec 3, 2025)

| Metric | Count |
|--------|-------|
| Total videos imported | ~102 |
| Videos with GCS upload | ~73 |
| Videos with v0 (prediction only) | ~22 |
| Videos with v1-v2 (partial analysis) | ~24 |
| Videos with v3 (full analysis) | ~51 |
| Videos with human ratings | ~50 |
| **Videos with BOTH v3 analysis AND rating** | **~51** |

**The 51-video overlap is the training dataset** for learning feature→preference correlations.

### CSV Export Available

A flattened CSV export is available at:
```
exports/analysis_export_2025-12-03.csv
```

**Contents**: 51 videos × 202 columns including:
- Human ratings (6 dimensions + notes + tags)
- AI predictions (6 dimensions)
- All 170+ deep analysis features (flattened with dot notation)

**To regenerate**:
```bash
# First fetch latest data
curl -s "http://localhost:3001/api/ratings?limit=100" | \
  jq '[.[] | select(.video.visual_analysis.feature_count != null)]' > /tmp/rated_with_analysis.json

# Then export to CSV
node scripts/export-analysis-csv.js /tmp/rated_with_analysis.json
```

---

## 6. THE MISSING PIECE: Correlation Analysis

### What Exists
- ✅ Deep analysis pipeline (Gemini extracts 150-200 features)
- ✅ Human rating pipeline (owner rates on 5+1 dimensions)
- ✅ AI prediction before rating (stored in `ai_prediction`)
- ✅ Data architecture documentation

### What's NOT Built Yet
- ❌ **Correlation endpoint**: Which of the 150-200 features predict high human ratings?
- ❌ **Preference model**: Weight features by owner's demonstrated preferences
- ❌ **Pre-filter system**: Use learned preferences to rank/filter new videos

### Proposed Correlation Output
```json
{
  "strongPositiveCorrelations": [
    { "feature": "audio.soundEffects.length === 0", "correlation": 0.85 },
    { "feature": "script.replicability.score", "correlation": 0.78 },
    { "feature": "comedyStyle.commitmentLevel", "correlation": 0.72 }
  ],
  "strongNegativeCorrelations": [
    { "feature": "trends.memeDependent", "correlation": -0.68 },
    { "feature": "casting.actingSkillRequired", "correlation": -0.55 }
  ],
  "noCorrelation": [
    { "feature": "visual.hookStrength", "note": "AI values hooks but owner doesn't weight them as heavily" }
  ]
}
```

---

## 7. TECH STACK

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14, React, TypeScript, Tailwind |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| AI Analysis | Google Gemini 2.0 Flash |
| Embeddings | OpenAI text-embedding-3-small |
| Video Storage | Google Cloud Storage |
| Metadata | Supadata API (TikTok scraping) |

### Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/tiktok` | Import video from URL |
| `POST /api/videos/reanalyze` | Run deep Gemini analysis |
| `GET /api/ratings` | List rated videos with analysis |
| `POST /api/ratings` | Save human rating |
| `POST /api/predict-v2` | Get AI prediction before rating |

---

## 8. SEVEN PROVEN SKIT ARCHETYPES

From analysis, these formats work best for small businesses:

1. **The Impossible Order** - Customer requests something absurd
2. **The Literal Interpretation** - Take request word-for-word literally
3. **The Behind-the-Scenes Reveal** - What customers think vs reality
4. **The Regular Customer** - Play out repeat customer relationship
5. **The Industry Pain Point** - Dramatize industry-specific frustrations
6. **The Customer Taxonomy** - Catalog customer archetypes
7. **The "We Heard You" Response** - Respond to feedback dramatically

---

## 9. NEXT STEPS

### Immediate (to build correlation system)
1. Ensure 28+ videos have both v3 deep analysis AND human ratings
2. Build `/api/analysis/correlate` endpoint
3. Extract top correlating features
4. Build preference-weighted scoring model

### Medium-term
1. Use learned preferences to pre-score new imports
2. Surface "recommended" videos matching owner's taste
3. Explain predictions ("You'll like this because...")

### Long-term
1. Fine-tune model on owner's preferences
2. Auto-flag high-confidence matches
3. Generate "skit ideas" based on learned patterns

---

## 10. KEY FILES

| File | Purpose |
|------|---------|
| `DATA_ARCHITECTURE.md` | Single source of truth for data flows |
| `FEATURE_GAPS_AND_FRAMEWORKS.md` | Missing features + comedy theory |
| `scripts/verify-data-state.sh` | Check data state before development |
| `src/app/api/videos/reanalyze/route.ts` | Deep analysis endpoint |
| `src/app/api/ratings/route.ts` | Human ratings CRUD |
| `src/lib/services/video/gemini.ts` | Gemini analysis logic |

---

## 11. GOTCHAS / MISTAKES TO AVOID

| Mistake | Reality |
|---------|---------|
| Looking for ratings in `analyzed_videos.user_ratings` | Ratings are in `video_ratings` table |
| Assuming all videos have deep analysis | Only videos run through `/api/videos/reanalyze` have it |
| Checking `feature_count` exists for "has deep analysis" | Check `feature_count > 100` for v3 quality |
| Assuming `visual_analysis` = deep analysis | v0 entries only have prediction, not features |

---

## 12. VERIFICATION BEFORE WORKING

Always run before making data-related changes:
```bash
./scripts/verify-data-state.sh
```

Or manually query:
```bash
# Videos with v3 deep analysis
curl -s "http://localhost:3001/api/videos/analyze?limit=100" | jq '[.videos[] | select(.visual_analysis.feature_count > 100)] | length'

# Rated videos
curl -s "http://localhost:3001/api/ratings" | jq 'length'

# Videos with BOTH (the training set)
curl -s "http://localhost:3001/api/ratings" | jq '[.[] | select(.video.visual_analysis.feature_count > 100)] | length'
```

---

*This document is designed to be pasted into a new AI instance to provide full context for continuing development.*
