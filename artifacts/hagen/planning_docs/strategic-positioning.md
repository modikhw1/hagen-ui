# Hagen Strategic Positioning: Discovery & Analysis

## Executive Summary

This document synthesizes insights from Hagen's training data with market research on TikTok culture, short-form video, and humor-in-marketing to inform business positioning.

**Important:** This document separates **verified reality** (what the codebase actually does) from **speculation** (external research and assumptions).

---

## Part 1: What Hagen Actually Does (Verified)

### System Architecture (Actual)

```
┌─────────────────────────────────────────────────────────────┐
│                 HAGEN ACTUAL ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│  ANALYSIS ENGINE (not generation)                           │
│  → Tuned Gemini explains WHY existing videos are funny      │
│  → Outputs: Handling, Mekanism, Varför, Målgrupp            │
├─────────────────────────────────────────────────────────────┤
│  BRAND PROFILING (conversational)                           │
│  → Claude-driven 7-phase dialogue extracts brand DNA        │
│  → L1/L2/L3 fingerprinting computed from conversation       │
├─────────────────────────────────────────────────────────────┤
│  VIDEO-BRAND MATCHING                                       │
│  → Matches existing videos to brand profiles                │
│  → Uses tone/audience/risk signals (NOT mechanism types)    │
├─────────────────────────────────────────────────────────────┤
│  TRAINING DATA CREATION (core purpose)                      │
│  → Fine-tuning Lab: refine video analyses                   │
│  → Replicability Lab: label difficulty assessments          │
│  → gold_standard.jsonl: curated training corpus (724 entries)|
└─────────────────────────────────────────────────────────────┘
```

### Training Data Profile (Verified)
- **724 entries** in gold_standard.jsonl
- **39 humor mechanism taxonomy** exists in `humor-pattern-taxonomy.json`
- **Sources**: TikTok videos (24%), Simpsons scripts (43%), legacy/bridge data (28%), question batteries (5%)
- **Language**: Primarily Swedish

### What The Tuned Model Does (Verified)
The model **analyzes existing TikTok videos** - it does NOT generate new concepts.

**Actual flow:**
```
TikTok URL → Download (yt-dlp) → Upload to GCS →
Tuned Gemini analyzes → User refines in UI →
Saved to gold_standard.jsonl for training
```

**Output structure:**
- Handling (what happens)
- Mekanism (humor mechanism)
- Varför (why it works)
- Målgrupp (target audience)

### Brand Profiling System (Verified)

**NOT a questionnaire** - it's a conversational discovery system:

| Phase | Purpose |
|-------|---------|
| 1. Introduction | Establish rapport, understand business |
| 2. Business Goals | What are they trying to achieve? |
| 3. Social Goals | What do they want from social media? |
| 4. Tone Discovery | How do they want to come across? |
| 5. Audience | Who are they trying to reach? |
| 6. References | What content do they admire? (4-6 videos) |
| 7. Synthesis | AI summarizes and extracts fingerprint |

**L1/L2/L3 Fingerprinting EXISTS but for video-brand matching:**

| Layer | What It Captures |
|-------|------------------|
| **L1 Quality** | Service fit, execution quality, coherence, distinctiveness |
| **L2 Likeness** | Tone (energy/warmth/formality), Humor (types/target/risk), Positioning, Intent, Character |
| **L3 Visual** | Production investment, effortlessness, intentionality, format repeatability |

### Matching System (Verified)

**Does NOT recommend specific humor mechanisms.** Instead:

**3 Hard Filters (must pass all):**
1. Environment compatibility
2. Replicability feasibility
3. Risk tolerance

**4 Soft Scores (weighted):**
1. Audience alignment (35%)
2. Tone match (30%) - checks humor_level (none/light/moderate/heavy), NOT mechanism type
3. Format appropriateness (20%)
4. Aspiration alignment (15%)

### TikTok Metadata (Verified)

**Captures snapshots only - NO virality prediction:**
- Author: username, followers, verified status
- Engagement: views, likes, comments, shares (point-in-time)
- Media: duration, thumbnail, tags
- NO algorithm modeling or viral prediction

### The 39-Mechanism Taxonomy (Verified)

**EXISTS and is well-structured**, but used for **training data documentation**, not matching:

- Original 8: literal_interpretation, wordplay, audio_visual_contradiction, etc.
- Timing (5): rule_of_three_subversion, callback_payoff, etc.
- Expectation (4): role_reversal, status_inversion, etc.
- Logic (4): circular_logic_loop, false_equivalence_comedy, etc.
- Social (4): passive_aggressive_compliance, uncomfortable_truth_admission, etc.
- Character (4): self_sabotage_recognition, oblivious_protagonist, etc.
- Meta (4): lampshading, format_awareness, etc.
- Contrast (2): public_vs_private_persona, expectation_vs_reality
- Escalation (3): accumulation_comedy, one_upmanship_spiral, etc.
- Bonus (1): non_reaction

**Purpose:** Categorizes training examples, tracks coverage gaps. NOT used in brand-video matching.

---

## Part 2: What Hagen Does NOT Do (Gaps)

| Capability | Status | Notes |
|------------|--------|-------|
| Generate new concepts | **Missing** | System analyzes, doesn't create |
| Recommend mechanisms to brands | **Missing** | Matching uses tone level, not specific mechanisms |
| Predict virality | **Missing** | Only captures current engagement stats |
| Provide execution guidance | **Missing** | No scripts, shot lists, or timing guides |
| Map mechanisms to brand types | **Missing** | Taxonomy not connected to matching engine |

---

## Part 3: TikTok Culture (External Research)

### TikTok vs. Other Platforms

| Characteristic | TikTok | Instagram | YouTube |
|----------------|--------|-----------|---------|
| **Discovery** | Algorithm-first | Social graph + algorithm | Subscribe-based |
| **Aesthetic** | Raw, authentic | Polished, aspirational | Production quality varies |
| **Participation** | Mimetic/trend-driven | Curated | Parasocial/passive |
| **Language** | Algospeak, slang evolution | Captions, hashtags | Scripted/natural |
| **Comedy style** | Quick, dry, "vine energy" | Staged/polished | Long-form or clips |

### TikTok-Specific Communication Norms
1. **Algospeak**: Community-developed code words to evade algorithm filters
2. **Participatory creativity**: Trends invite remixing, not just watching
3. **Micro-niche communities**: GreenTok, ParentTok, NeurodivergentTok
4. **Democratized production**: Smartphone-only, low production barrier
5. **"Vine energy"**: Quick jokes, dry humor, less-is-more comedy (inherited from Vine 2013-2017)

---

## Part 4: Comparable Domains (External Research)

### Potential Analogies (if gaps are filled)

| Analogy | Requires |
|---------|----------|
| **Canva for comedy** | Concept generation + execution templates |
| **Spotify recommendation** | Mechanism-to-brand matching engine |
| **Comedy writers room in a box** | Full creative output, not just analysis |
| **Grammarly for humor fit** | Real-time content scoring (partially exists) |

### Existing Players

| Company | Focus | How Hagen Differs |
|---------|-------|-------------------|
| White Label Comedy | TV writers for brands | Hagen has AI scale, they have human quality |
| That Funny Agency | Humor marketing | Hagen has mechanism taxonomy depth |
| Jasper/Copy.ai | AI brand voice | Hagen has video understanding |
| The Brief AI | AI ad generation | Hagen has humor specialization |
| Connect | Comedy influencer matching | Hagen has content-level matching |

---

## Part 5: Market Landscape 2025 (External Research)

### Short-Form Video Scale
- Video = 80%+ of internet traffic by 2025
- Short-form video ad spending: **$145.8B by 2028** (9.5% CAGR)
- 73% of consumers prefer short-form video for product discovery

### Platform Status
| Platform | Users | Trend |
|----------|-------|-------|
| TikTok | 1.5B+ monthly | Engagement rising, TikTok Shop game-changer |
| Instagram Reels | 200B daily plays | Showing saturation signs |
| YouTube Shorts | 164.5M (US) | Best long-term discoverability |

---

## Part 6: Research-Backed Guidelines (External Research)

### From Psychology & Marketing Literature

1. **Humor-brand congruence matters**: Wrong humor type for brand personality fails ([Source](https://articlegateway.com/index.php/JMDC/article/view/5751))
2. **Low-aggressive > high-aggressive humor** for engagement, especially for sincere brands ([Source](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.966254/full))
3. **Self-congruity drives action**: Closer brand-audience personality match = higher engagement ([Source](https://onlinelibrary.wiley.com/doi/10.1002/mar.21969))
4. **Authenticity wins in 2025**: Raw > polished on TikTok ([Source](https://www.tiknode.com/article/top-tiktok-trends-in-2025-and-how-they-influence-culture))
5. **UGC trust**: 86% more likely to trust brands sharing user-generated content ([Source](https://www.flyingvgroup.com/short-form-video-trends/))

---

## Part 7: Business Direction (User-Stated Vision)

### Target Customer
**Small business owners doing their own marketing** - not agencies, not enterprise brands.

### Geographic Strategy
International reach, **starting in Sweden** (leverage existing training data strength).

### Desired Product: "Viral Concept Generator"

**User's stated vision:**
```
Business inputs brand data → System recommends high-viral-potential concepts →
Guides user on what/how to do it
```

**The "Motor" (user's description):**
1. Brand-content matching
2. Humor library
3. TikTok popularity metadata calculations

### Revenue Model Options

| Model | Fit | Notes |
|-------|-----|-------|
| **One-time concept package** | Best fit | "Get 5 viral concepts for your brand" |
| **Credit-based** | Good | Buy credits, spend per concept generated |
| **Freemium + premium** | Good | Basic matching free, detailed guidance paid |

---

## Part 8: Gap Analysis - What Needs Building

### To Transform Analysis → Generation

| Gap | What Exists | What's Needed |
|-----|-------------|---------------|
| **Concept Generation** | Model analyzes existing videos | Train/prompt model to generate NEW concepts based on brand + mechanism |
| **Mechanism Recommendation** | 39-mechanism taxonomy (documentation only) | Engine that maps brand fingerprint → recommended mechanisms |
| **Virality Prediction** | Engagement snapshots | Model to predict viral potential based on content signals |
| **Execution Guidance** | None | Script templates, shot lists, timing guides per mechanism |

### Detailed Build Requirements

#### 1. Mechanism-to-Brand Mapping (NEW)
- [ ] Create brand personality → mechanism compatibility matrix
- [ ] Score each of 39 mechanisms against brand fingerprint dimensions
- [ ] Weight by: tone fit, audience alignment, risk tolerance, operational feasibility
- [ ] Output: "Top 5 mechanisms for this brand" with explanations

#### 2. Concept Generation Engine (NEW)
- [ ] Extend tuned model to generate (not just analyze)
- [ ] Input: brand fingerprint + selected mechanism + trending context
- [ ] Output: concept description, hook, structure, suggested execution
- [ ] Include "why this works for your brand" reasoning

#### 3. Execution Guidance Module (NEW)
- [ ] Script templates per mechanism type
- [ ] Shot/scene breakdown suggestions
- [ ] Timing and pacing guidelines
- [ ] Equipment/setting requirements (connect to replicability data)

#### 4. Virality Signal Integration (NEW)
- [ ] Define what makes content viral (beyond engagement snapshots)
- [ ] Trending sound/format detection
- [ ] Optimal posting timing
- [ ] Hashtag strategy recommendations

### What Can Be Leveraged (Existing)

| Asset | How to Leverage |
|-------|-----------------|
| Brand conversation flow | Keep as intake - already sophisticated |
| L1/L2/L3 fingerprinting | Use as input to mechanism recommendation |
| 39-mechanism taxonomy | Connect to brand matching, add examples |
| 724 gold_standard entries | Training data for generation capability |
| Replicability assessments | Feed into execution guidance feasibility |

---

## Part 9: Recommended Next Steps

### Phase 1: Connect Taxonomy to Matching
1. Create mechanism → brand personality mapping
2. Add mechanism recommendation to existing matching flow
3. Test: "Given this brand profile, which mechanisms fit best?"

### Phase 2: Add Generation Capability
1. Experiment with prompting tuned model to generate (not analyze)
2. Structure output: hook, mechanism, execution steps
3. Validate generated concepts with real brands

### Phase 3: Build Execution Layer
1. Create script templates for top 10 mechanisms
2. Add shot/timing guidance
3. Connect to replicability constraints

### Phase 4: Virality Integration
1. Research viral signals beyond engagement counts
2. Add trending context to concept generation
3. Test viral prediction accuracy

---

## Sources

### External Research
- [TikTok Sociotechnical Environments (Sage)](https://journals.sagepub.com/doi/10.1177/29768624251359796)
- [Short-Form Video Report 2025 (Metricool)](https://metricool.com/social-media-short-video-report-2025/)
- [Humor & Brand Personality Congruence (JMDC)](https://articlegateway.com/index.php/JMDC/article/view/5751)
- [Brand-to-Brand Teasing (Frontiers Psychology)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.966254/full)
- [White Label Comedy](https://whitelabelcomedy.com/)
- [Vine to TikTok Evolution (Medium)](https://medium.com/design-bootcamp/from-vine-to-tiktok-the-evolution-of-short-form-video-and-the-rise-of-a-social-media-juggernaut-98967a7d8d7e)
- [Humor Theory Agency Process](https://hubsanfrancisco.com/humor-theory/)
- [TikTok Trends 2025 (TikNode)](https://www.tiknode.com/article/top-tiktok-trends-in-2025-and-how-they-influence-culture)

### Codebase References
- `src/lib/services/brand/profile-fingerprint.ts` - L1/L2/L3 fingerprinting
- `src/lib/services/brand/conversation.ts` - 7-phase brand discovery
- `src/lib/services/brand/matching-scoring.ts` - Video-brand matching logic
- `datasets/fine-tuning/humor-pattern-taxonomy.json` - 39 mechanism definitions
- `datasets/fine-tuning/gold_standard.jsonl` - Training corpus
