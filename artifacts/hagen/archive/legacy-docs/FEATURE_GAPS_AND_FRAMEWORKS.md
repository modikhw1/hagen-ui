# Feature Gaps & Framework Reference for Small Business TikTok Skits

## Current Coverage Assessment

The Gemini analysis captures ~190-200 features per video, covering ~80% of academic frameworks. This document tracks:
1. What's missing that could improve predictions
2. Framework-specific insights for small business viral marketing
3. Research sources for future reference

---

## SECTION 1: Missing Features to Consider Adding

### 1.1 Comedy Theory Gaps

#### Target of Humor (Who's the butt of the joke?)
```
Proposed field: script.humor.target
Values: "self" | "customer" | "employee" | "industry" | "competitor" | "situation" | "product" | "none"

Why it matters:
- Self-deprecating (brand/employee) = safer, more relatable
- Customer as target = risky, can feel mocking
- Situation/universal = safest, broadest appeal
```

#### Status Transaction (Power dynamics - Keith Johnstone)
```
Proposed field: script.dynamics.statusShift
Structure: {
  initialStatus: { roleA: "high" | "low" | "equal", roleB: "high" | "low" | "equal" },
  finalStatus: { roleA: "high" | "low" | "equal", roleB: "high" | "low" | "equal" },
  shiftType: "reversal" | "maintained" | "gradual" | "none"
}

Why it matters:
- Status reversals are inherently satisfying (underdog wins)
- Employee gaining status over rude customer = cathartic
- Brand self-lowering = relatable, humanizing
```

#### The "Game" (UCB/Improv concept)
```
Proposed field: script.game
Structure: {
  identified: boolean,
  gameDescription: string,  // "Employee takes everything too literally"
  heighteningCount: number, // How many times the game escalates
  gameClarity: 1-10        // How obvious is the pattern?
}

Why it matters:
- Clear game = more memorable, more shareable
- Multiple heightenings = better pacing, more payoffs
- Easy to identify game = easier to replicate
```

#### Violation Type (McGraw subcategories)
```
Proposed field: script.humor.violationType
Values: "norm" | "moral" | "social" | "linguistic" | "logical" | "physical" | "none"

Examples:
- norm: Breaking workplace rules
- moral: Mild ethical transgression
- social: Awkward interaction
- linguistic: Wordplay, misunderstanding
- logical: Absurd reasoning
- physical: Slapstick

Why it matters:
- Different violation types resonate with different audiences
- Some types are easier to replicate (linguistic, social)
- Some types require more production (physical)
```

#### Incongruity Resolution Type
```
Proposed field: script.humor.resolutionType
Values: "explained" | "left-absurd" | "callback" | "meta" | "none"

Why it matters:
- Explained = accessible to wider audience
- Left-absurd = rewards in-group, may alienate
- Callback = rewatch value
- Meta = trend-aware, may date quickly
```

### 1.2 Small Business Specific Gaps

#### Role Clarity
```
Proposed field: casting.roles
Structure: {
  roleA: { type: "employee" | "owner" | "customer" | "vendor" | "other", archetype: string },
  roleB: { type: "employee" | "owner" | "customer" | "vendor" | "other", archetype: string },
  dynamic: "service" | "conflict" | "collaboration" | "teaching" | "surprising"
}

Why it matters:
- Clear roles = immediately understandable
- Customer/Employee dynamic most replicable for businesses
- Archetype helps identify patterns (e.g., "demanding customer", "clueless new hire")
```

#### Authenticity Markers
```
Proposed field: brand.authenticity
Structure: {
  feelsNative: 1-10,           // Does it feel TikTok-native vs ad?
  overproducedRisk: 1-10,      // Too polished = less authentic
  ugcAesthetic: boolean,       // User-generated content feel
  fourthWallAwareness: boolean // Acknowledges it's content?
}

Why it matters:
- TikTok penalizes content that feels like ads
- Small businesses benefit from "scrappy" aesthetic
- Authenticity drives trust and engagement
```

#### Execution Barrier Analysis
```
Proposed field: execution.barriers
Structure: {
  actingDifficulty: 1-10,
  timingCriticality: 1-10,
  locationDependency: 1-10,
  propComplexity: 1-10,
  editingSkillNeeded: 1-10,
  totalBarrierScore: 1-50
}

Why it matters:
- Small businesses need LOW barrier concepts
- Identifies what makes something hard to copy
- Helps filter for truly replicable formats
```

---

## SECTION 2: Small Business TikTok Viral Frameworks

### 2.1 The "POV" Framework
**Structure**: "POV: [relatable situation in your business]"

**Why it works**:
- Immediate audience identification
- Low production (just needs one person)
- Infinite variations per business type

**Features to track**:
- `script.structure.hookType: "pov"`
- `script.emotional.relatability: 8+`
- `casting.minimumPeople: 1`

**Example patterns**:
- "POV: You work at a coffee shop and someone orders..."
- "POV: A customer asks for something off-menu..."

---

### 2.2 The "Day in the Life" Subversion
**Structure**: Start mundane, reveal absurd

**Why it works**:
- Hook is familiar/safe
- Payoff is unexpected
- Shows behind-the-scenes (authenticity)

**Features to track**:
- `script.humor.humorType: "subversion"`
- `script.structure.hasTwist: true`
- `brand.authenticity.feelsNative: 8+`

---

### 2.3 The Customer Interaction Skit
**Structure**: Employee + Customer, one has unusual behavior

**Why it works**:
- Universal (everyone's been a customer)
- Clear roles = easy to understand
- Cathartic (employee perspective) or self-deprecating (business acknowledging customer pain)

**Successful patterns**:
1. **Impossible Request**: Customer asks for something absurd, employee handles it
2. **Misunderstanding**: Communication breakdown with comic escalation
3. **Role Reversal**: Customer knows more than employee, or vice versa
4. **The Regular**: Playing on relationship with repeat customers

**Features to track**:
- `casting.roles.dynamic: "service"`
- `script.dynamics.statusShift`
- `script.game.gameClarity: 7+`

---

### 2.4 The "What We Say vs What We Mean"
**Structure**: Split screen or alternating shots showing public vs private reaction

**Why it works**:
- Universally relatable
- Low production
- Works for any service industry

**Features to track**:
- `script.humor.humorType: "contrast"`
- `visual.transitions: ["split-screen"]`
- `script.emotional.relatability: 9+`

---

### 2.5 The Trend Adaptation Formula
**Structure**: Take trending sound/format, adapt to your business context

**Why it works**:
- Borrows existing momentum
- Shows brand is culturally aware
- Algorithm boost from trend participation

**Risks**:
- Short lifespan
- May feel forced
- Requires quick turnaround

**Features to track**:
- `trends.trendLifespan: "current-trend"`
- `flexibility.swappableCore: true`
- `trends.memeDependent: true` (flag for filtering OUT if seeking evergreen)

---

## SECTION 3: Research Sources

### Academic Papers

1. **"What Makes Online Content Viral?"**
   - Authors: Berger & Milkman (2012)
   - Journal: Journal of Marketing Research
   - Key finding: High-arousal emotions (awe, anxiety, anger) drive sharing more than low-arousal (sadness)
   - Relevance: Humor = high arousal = shareable

2. **"Benign Violations: Making Immoral Behavior Funny"**
   - Authors: McGraw & Warren (2010)
   - Journal: Psychological Science
   - Key finding: Humor requires both violation AND safety
   - Relevance: Brand risk + humor type = benign violation detection

3. **"An Anatomy of a YouTube Meme"**
   - Author: Limor Shifman (2012)
   - Key finding: 6 features of viral videos (ordinary people, humor, simplicity, repetitiveness, whimsy, flawed masculinity)
   - Relevance: Most apply to TikTok skits

4. **"The General Theory of Verbal Humor"**
   - Authors: Attardo & Raskin (1991)
   - Key finding: 6 Knowledge Resources framework
   - Relevance: Maps to script analysis features

5. **"Sharing the Small Moments"** 
   - Focus: Micro-content virality
   - Key finding: Everyday relatable moments outperform produced content
   - Relevance: Authenticity markers matter

### Practitioner Resources

1. **UCB Comedy Manual**
   - "Game of the scene" concept
   - Heightening and callbacks
   - Status transactions

2. **"Truth in Comedy" - Del Close**
   - Harold structure
   - Finding the game
   - Yes-and principle

3. **"The Comic Toolbox" - John Vorhaus**
   - Comic premise construction
   - Character archetypes
   - Escalation techniques

4. **TikTok Creator Portal**
   - Official best practices
   - Algorithm insights (watch time, completion rate)
   - Hook importance (first 1-3 seconds)

### Small Business Specific

1. **Later.com / Hootsuite Research**
   - Best posting times
   - Engagement benchmarks by industry
   - Format performance comparisons

2. **Sprout Social Index**
   - Consumer expectations of brand content
   - Authenticity metrics
   - Response to humor in brand content

---

## SECTION 4: Recommended Feature Enhancements

### Priority 1: High Impact, Easy to Add
These could be added to the Gemini prompt with minimal changes:

```javascript
// Add to script.humor
target: "self" | "customer" | "employee" | "situation" | "none",
violationType: "norm" | "social" | "linguistic" | "logical" | "physical" | "none",

// Add to script
game: {
  identified: boolean,
  description: string,
  heighteningCount: number
},

// Add to casting
roles: {
  primary: { type: string, archetype: string },
  secondary: { type: string, archetype: string },
  dynamic: "service" | "conflict" | "collaboration" | "other"
}
```

### Priority 2: Valuable but Complex
These require more nuanced analysis:

```javascript
// Add to script.dynamics
statusTransaction: {
  initialPower: { roleA: number, roleB: number },
  finalPower: { roleA: number, roleB: number },
  reversalMoment: string
},

// Add to brand
authenticity: {
  feelsNative: number,
  overproducedRisk: number,
  ugcAesthetic: boolean
}
```

### Priority 3: Nice to Have
These are refinements once core patterns are established:

```javascript
// Add to execution
replicationGuide: {
  stepByStep: string[],
  commonMistakes: string[],
  variationIdeas: string[]
},

// Add to trends
formatGenealogy: {
  originVideo: string,
  popularizedBy: string,
  waveNumber: number  // 1 = original, 2 = first copies, 3+ = late
}
```

---

## SECTION 5: Quick Reference - What Makes a Small Business Skit Work

### The Ideal Profile (based on your ratings + research)

| Feature | Ideal Value | Why |
|---------|-------------|-----|
| `audio.soundEffects` | `[]` (empty) | Script stands alone |
| `script.hasScript` | `true` | Dialogue-driven |
| `casting.minimumPeople` | 1-2 | Easy to produce |
| `script.replicability.score` | 8+ | Can adapt to your business |
| `script.replicability.resourceRequirements` | "low" | Minimal equipment/budget |
| `brand.riskLevel` | 1-2 | Safe for any brand |
| `visual.hookStrength` | 7+ | Stops the scroll |
| `script.structure.payoffStrength` | 7+ | Satisfying ending |
| `trends.trendLifespan` | "evergreen-trope" | Long shelf life |
| `flexibility.swappableCore` | `true` | Works for any industry |
| `standalone.worksWithoutContext` | 8+ | No prior knowledge needed |
| `execution.timingCriticality` | 1-5 | Forgiving to perform |

### Red Flags (based on your low-rated videos)

| Feature | Problematic Value | Why |
|---------|-------------------|-----|
| `audio.soundEffects` | Non-empty array | Crutch, not clever |
| `trends.memeDependent` | `true` | Will date quickly |
| `casting.actingSkillRequired` | 8+ | Hard to replicate |
| `production.shotComplexity` | 7+ | Too produced |
| `flexibility.industryLock` | 7+ | Too specific |
| `script.structure.payoffStrength` | <5 | Unsatisfying |

---

## SECTION 6: Next Steps

1. **Collect more ratings** (target: 300-500)
2. **Run correlation analysis** on existing features vs ratings
3. **Optionally enhance prompt** with Priority 1 features
4. **Build pattern library** of high-rated video transcripts/structures
5. **Test predictions** against new videos before rating

---

## SECTION 7: The 7 Proven Small Business Skit Archetypes

Based on what works for restaurants, cafés, and bars with real constraints:
- 1-2 staff available to film
- Phone camera only
- 5-15 min to shoot between rushes
- Real location (kitchen, counter, dining area)
- Limited acting experience

### Archetype 1: The Impossible Order
**Structure**: Customer requests something absurd → Employee reaction

**Example**: "Can I get a latte but with no coffee, no milk, and extra foam?"

**Why it works**:
- Universal (all service workers relate)
- Single person can play both roles (cut between)
- Infinite variations per menu item
- Cathartic for staff AND customers get the joke

**Difficulty**: LOW | **People needed**: 1-2

---

### Archetype 2: The Literal Interpretation
**Structure**: Take customer request word-for-word literally

**Examples**:
- "I want my steak well done" → shows steak with graduation cap
- "Can I have it on the side?" → plate placed beside the table

**Why it works**:
- Visual payoff (easy to understand)
- One-liner setup
- Prop-based (uses what you have)
- Game is clear and heightenable

**Difficulty**: LOW | **People needed**: 1

---

### Archetype 3: The Behind-the-Scenes Reveal
**Structure**: "What customers think vs what actually happens"

**Example**: Split between elegant dining room / chaotic kitchen

**Why it works**:
- Authenticity (real workplace)
- Relatable to anyone who's worked service
- Shows personality
- Low bar for "acting"

**Difficulty**: LOW | **People needed**: 1+

---

### Archetype 4: The Regular Customer
**Structure**: Play out the relationship with a repeat customer

**Example**: "When your regular comes in and you already started their order"

**Why it works**:
- Implies community (good for brand)
- Relatability for both staff and customers
- Can be wholesome or funny
- Real regulars might share it

**Difficulty**: MEDIUM | **People needed**: 2

---

### Archetype 5: The Industry Pain Point
**Structure**: Dramatize something only people in your industry understand

**Examples**:
- (Restaurant) "When someone asks for a table for 2 and 47 people show up"
- (Café) "When someone orders a 12-word drink modification"

**Why it works**:
- In-group humor creates sharing
- Shows expertise/insider knowledge
- Other businesses in your industry will duet/stitch

**Difficulty**: LOW | **People needed**: 1

---

### Archetype 6: The Customer Type Taxonomy
**Structure**: Catalog different customer archetypes

**Example**: "Types of customers at our coffee shop" (The Undecided, The Regular, The Modifier)

**Why it works**:
- Series potential (engagement over time)
- Each type is shareable to friends who ARE that type
- Shows you pay attention
- Character work but low stakes

**Difficulty**: MEDIUM | **People needed**: 1

---

### Archetype 7: The "We Heard You" Response
**Structure**: Respond to common customer feedback/requests dramatically

**Examples**:
- "When customers say our portions are too big" → chef adds MORE
- "You asked for extra sauce" → drowning plate in sauce

**Why it works**:
- Interactive (encourages comments)
- Shows you listen
- Absurd escalation is funny
- Can be ongoing series

**Difficulty**: LOW | **People needed**: 1

---

## SECTION 8: Replicability Matrix

| Archetype | Acting | Timing | Props | Editing | People |
|-----------|--------|--------|-------|---------|--------|
| Impossible Order | 2/10 | 3/10 | 1/10 | 3/10 | 1-2 |
| Literal Interpretation | 3/10 | 2/10 | 5/10 | 4/10 | 1 |
| Behind the Scenes | 1/10 | 2/10 | 1/10 | 5/10 | 1+ |
| The Regular | 5/10 | 5/10 | 2/10 | 3/10 | 2 |
| Industry Pain Point | 2/10 | 2/10 | 2/10 | 2/10 | 1 |
| Customer Taxonomy | 6/10 | 3/10 | 3/10 | 4/10 | 1 |
| We Heard You | 2/10 | 2/10 | 4/10 | 3/10 | 1 |

**Easiest to replicate**: "Impossible Order" and "Industry Pain Point"

---

## SECTION 9: Hook Patterns for Small Business

1. **The Direct Address**: "Working in [industry] be like..."
2. **The Text Overlay Setup**: On-screen text setup, reaction only
3. **The Sound Bite**: Trending audio sets up the joke
4. **The In-Media-Res**: Start in the middle ("...so I told them we don't DO that")
5. **The Question Hook**: "Why do customers always..."

---

## SECTION 10: Common Mistakes to Avoid

| Mistake | Why It Fails | Better Approach |
|---------|--------------|-----------------|
| Over-explaining | Loses attention before payoff | Hook in 2 sec, payoff by 15 |
| Product shots as content | That's an ad, not entertainment | Wrap product in story/joke |
| Exact copy of viral video | No differentiation | Copy STRUCTURE, not content |
| Waiting for perfect conditions | Never ships | Authenticity > polish |
| Making customer the villain | Can feel mean | Self-deprecating or situational |
| No payoff | Unsatisfying | Clear button/punchline |

---

## SECTION 11: Feature Combinations That Predict Success

### The Ideal Small Business Skit Profile

```javascript
{
  "script.hasScript": true,
  "casting.minimumPeople": [1, 2],
  "script.replicability.score": 8+,
  "script.replicability.resourceRequirements": "low",
  "flexibility.swappableCore": true,
  "brand.riskLevel": [1, 2],
  "audio.soundEffects": [],  // empty = standalone
  "standalone.worksWithoutContext": 7+,
  "content.duration": < 30,
  
  // Bonus multipliers:
  "script.humor.humorType": ["subversion", "contrast"],
  "script.structure.payoffStrength": 8+,
  "visual.hookStrength": 8+,
  "trends.trendLifespan": "evergreen-trope"
}
```

### Red Flags to Filter Out

```javascript
{
  "audio.soundEffects": ["any"],     // Non-empty = crutch
  "trends.memeDependent": true,       // Dates quickly
  "casting.actingSkillRequired": 8+,  // Hard to replicate
  "production.shotComplexity": 7+,    // Too produced
  "flexibility.industryLock": 7+,     // Too specific
  "script.structure.payoffStrength": < 5  // Unsatisfying
}
```

---

## SECTION 12: Key Observation

**Look for SERIES, not one-offs.**

If an account has 2+ videos using the same format, that format is:
1. Proven to work (they made more)
2. Actually replicable (they replicated it themselves)
3. Has audience demand (engagement justified more)

When analyzing videos, flag those that appear to be part of a series—they're more likely to be useful templates.

---

## SECTION 13: PENDING - Deep Analysis ↔ Human Rating Comparison

### Status: NOT YET IMPLEMENTED

**The Problem:**
Deep analysis extracts 150-200 features per video into `visual_analysis`. Human ratings (5+1 score, notes) are stored in `user_ratings`. These two data sources are **not connected**—there's no function that learns which AI-detected features correlate with human preferences.

### What Needs to Be Built:

#### 1. Correlation Endpoint (`/api/analysis/correlate`)
```typescript
// Input: Videos that have BOTH deep analysis AND human ratings
// Output: Which features predict human scores

{
  "strongPositiveCorrelations": [
    { "feature": "script.game.heighteningCount", "correlation": 0.82, "meaning": "More game heightening = you rate higher" },
    { "feature": "comedyStyle.commitmentLevel", "correlation": 0.75, "meaning": "Higher commitment = you rate higher" }
  ],
  "strongNegativeCorrelations": [
    { "feature": "content.brandMentions", "correlation": -0.65, "meaning": "More brand mentions = you rate lower" },
    { "feature": "audio.musicDominance", "correlation": -0.58, "meaning": "Music-heavy = you rate lower" }
  ],
  "noCorrelation": [
    { "feature": "visual.hookStrength", "note": "Gemini rates hooks high but you don't care" }
  ]
}
```

#### 2. Discrepancy Report
```typescript
// Show where AI and human disagree most
{
  "videoId": "abc-123",
  "aiPrediction": 8.2,  // Based on deep analysis features
  "humanRating": 3.0,   // Your actual 5+1 score
  "discrepancy": 5.2,
  "possibleReasons": [
    "AI valued: hookStrength=9, pacing=8",
    "You noted: 'predictable punchline, seen this format 100x'"
  ]
}
```

#### 3. Preference Learning
Over time, weight Gemini's features by YOUR preferences:
- If you consistently rate "statusReversal" videos high → boost that signal
- If you consistently ignore "highProductionValue" → reduce that weight

### Required Data:
- Minimum ~20-30 videos with BOTH deep analysis AND human ratings
- Currently have: 10 deep analyzed (new), ~20 rated (need overlap)

### Next Steps When Ready:
1. Rate the 10 newly deep-analyzed videos
2. Run correlation analysis
3. Build preference model
4. Use model to pre-filter/rank new videos

---

*Last updated: December 3, 2025*
*Based on analysis of ~60 videos, ~20 rated, 10 deep analyzed*
