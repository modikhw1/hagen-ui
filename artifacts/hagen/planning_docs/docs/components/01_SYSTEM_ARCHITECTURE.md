# Component 01: System Architecture Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: System Architecture
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on the system architecture for the Cross-Border Concept Arbitrage Marketplace.

---

## 0. Origin Context (Critical Background)

### The Original Problem

The owner has **strong subjective preferences** about which TikTok skits are valuable for replication by small businesses (restaurants, cafés, bars). The AI (Gemini) can extract 170+ features but **doesn't know which features align with owner's taste**.

### Key Insight from Development

**Gemini's subjective scores (1-10 ratings) carry signal.** Even though Gemini doesn't "know" the owner's preferences, its scoring reflects underlying characteristics. Running correlation analysis between Gemini's scores and human ratings reveals which AI-evaluated features align with human taste.

### Owner's Known Preferences (From ~51 Rated Videos)

**Likes:**
- Script-driven comedy (dialogue over sound effects)
- Self-deprecating humor (employee/brand as butt of joke)
- Clear "game" with escalation (improv term)
- Low production value is fine if concept is clever
- 1-2 person skits (easy to replicate)
- Evergreen formats (not trend-dependent)
- Contrast mechanics (expectations vs. reality)
- Strong payoffs

**Dislikes:**
- Relies on sound effects as crutch
- Over-produced/polished (feels like an ad)
- Meme-dependent (dates quickly)
- Requires skilled acting
- Weak or no payoff
- Industry-locked (only works for specific business type)
- Attractiveness-dependent content
- Complex production requirements

### Expected Correlations (To Validate)

Based on known preferences, we expect:

| Feature | Expected Correlation |
|---------|---------------------|
| `script.replicability.score` | **Strong positive** |
| `comedyStyle.contrastMechanism.present` | **Strong positive** |
| `standalone.worksWithoutContext` | **Strong positive** |
| `flexibility.swappableCore` | **Positive** |
| `script.structure.payoffStrength` | **Strong positive** |
| `trends.memeDependent` | **Strong negative** |
| `trends.usesPremadeSound` | **Strong negative** |
| `casting.actingSkillRequired` | **Negative** |
| `casting.attractivenessDependency` | **Strong negative** |
| `production.shotComplexity` | **Negative** |

These expected correlations will be validated at the 100-rating milestone.

---

## 1. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DATA LAYER                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐                   │
│  │  TikTok/Instagram │    │  Google Cloud    │    │    Supabase      │                   │
│  │     (Source)      │───▶│    Storage       │◀──▶│   PostgreSQL     │                   │
│  └──────────────────┘    │  (Video Files)   │    │   (All Data)     │                   │
│                          └──────────────────┘    └──────────────────┘                   │
│                                                           │                              │
├───────────────────────────────────────────────────────────┼──────────────────────────────┤
│                                    AI LAYER               │                              │
├───────────────────────────────────────────────────────────┼──────────────────────────────┤
│                                                           ▼                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐                   │
│  │   Gemini 2.0     │    │   Your Trained   │    │    OpenAI        │                   │
│  │   Flash Vertex   │    │   Preference     │    │   Embeddings     │                   │
│  │  (170+ features) │    │     Model        │    │  (Similarity)    │                   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘                   │
│           │                       │                       │                              │
│           └───────────────────────┼───────────────────────┘                              │
│                                   ▼                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                              APPLICATION LAYER                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐                   │
│  │   Next.js 14     │    │   Cron Jobs      │    │   Translation    │                   │
│  │   (Frontend +    │    │  (Rotation,      │    │      API         │                   │
│  │    API Routes)   │    │   Analytics)     │    │  (Subtitles)     │                   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘                   │
│           │                       │                       │                              │
│           └───────────────────────┼───────────────────────┘                              │
│                                   ▼                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                 USER LAYER                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐                   │
│  │      Owner       │    │   Data Input     │    │     Buyers       │                   │
│  │   (Rates/Trains) │    │     Agents       │    │  (View/Purchase) │                   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘                   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Loop Explained

The system operates on a continuous loop with distinct phases:

### Phase 1: Discovery
```
Input:  TikTok URL (manual or scraped)
Output: Video stored in GCS, metadata in Supabase

Example:
  1. Owner finds interesting skit: https://www.tiktok.com/@creator/video/123456
  2. Calls POST /api/tiktok with URL
  3. System downloads video to gs://hagen-video-analysis/videos/{uuid}.mp4
  4. Extracts metadata via Supadata API
  5. Creates record in analyzed_videos table
```

### Phase 2: Analysis
```
Input:  Video file in GCS
Output: 170+ features in visual_analysis JSONB

Example:
  1. Call POST /api/videos/reanalyze with video_id
  2. Gemini 2.0 Flash analyzes video
  3. Extracts: visual, audio, script, casting, production, comedyStyle, trends, etc.
  4. Stores in analyzed_videos.visual_analysis
  5. Tags with schema_version: 'v3', feature_count: 172
```

### Phase 3: Rating (Training Data Collection)
```
Input:  Video with analysis
Output: Human rating (ground truth)

Example:
  1. Owner views video in rating interface
  2. AI provides prediction BEFORE owner rates (stored for comparison)
  3. Owner rates: overall=0.7, hook=0.8, pacing=0.6, payoff=0.7, originality=0.5, rewatchable=0.6
  4. Owner adds notes: "Strong concept, weak execution on timing"
  5. Stored in video_ratings with ai_prediction for later delta analysis
```

### Phase 4: Training
```
Input:  All rated videos with v3 analysis
Output: Trained model with feature weights

Example:
  1. Export 200+ rated videos as JSON
  2. Flatten 170+ features to dot notation
  3. Run Pearson/Spearman correlation with overall_score
  4. Top correlations:
     - script.replicability.score: +0.82
     - trends.memeDependent: -0.68
     - casting.actingSkillRequired: -0.55
  5. Train Ridge regression model
  6. Store in model_versions: { version_tag: 'v1.0', feature_weights: {...} }
```

### Phase 5: Scoring (Match %)
```
Input:  New video with analysis + user profile
Output: Match percentage (0-100)

Example:
  1. New video analyzed, has visual_analysis
  2. User completes onboarding chat → profile created
  3. Call POST /api/model/match with video features + user profile
  4. Model calculates:
     - conceptScore (0-1): intrinsic quality
     - profileFit (0-1): how well it fits user
     - matchPercentage = (conceptScore × 0.6 + profileFit × 0.4) × 100
  5. Returns: { match_percentage: 94, why_it_fits: [...], considerations: [...] }
```

### Phase 6: Listing
```
Input:  Scored concept
Output: Active listing in marketplace

Example:
  1. Concept has match_percentage = 94% for user
  2. Check evergreen_eligible = true (no memes, no trending sounds)
  3. Calculate price: base($20) + match bonus(94% × $10) = $29.40 USD
  4. Adjust for Indonesia: $29.40 × 0.25 PPP = $7.35
  5. Create listing_window: 72 hours, cap 5/market, 15/global
```

### Phase 7: Purchase
```
Input:  Buyer selects listing
Output: Transaction record, access granted

Example:
  1. Indonesian buyer browses /api/listings?market=ID
  2. Selects concept, pays $11.48 IDR equivalent
  3. Transaction created: { buyer_id, concept_id, price_paid, cashback_amount: $1.38 }
  4. listing_window.sold_count incremented
  5. Buyer gains access to concept viewer
```

### Phase 8: Production
```
Input:  Buyer access
Output: Buyer creates their version

Example:
  1. Buyer views concept in viewer
  2. Sees: video playback, translated subtitles, script, production checklist
  3. Checklist: "☐ 2 people ☐ Smartphone ☐ Indoor setting ☐ 15min shoot"
  4. Buyer replicates concept in their language/context
  5. Posts to their TikTok
```

### Phase 9: Performance Feedback
```
Input:  Buyer submits produced content URL
Output: Cashback + performance data

Example:
  1. Buyer calls POST /api/transactions/{id}/submit-content
  2. Submits: { url: 'https://tiktok.com/@buyer/video/789' }
  3. System creates produced_content record
  4. Verifies (manual or automated) content matches concept
  5. Cashback processed: $1.38 refunded
  6. (Future) Scrape performance: { views: 50000, likes: 5000, shares: 200 }
  7. Performance data informs model: "This concept type performs well in Indonesia"
```

---

## 3. Data Flow Diagram

```
                    ┌─────────────┐
                    │  TikTok URL │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   POST /api/tiktok     │
              │  (Import + Download)   │
              └────────────┬───────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │   GCS    │    │ Supabase │    │ Supadata │
    │ (Video)  │    │(Metadata)│    │  (Stats) │
    └────┬─────┘    └────┬─────┘    └──────────┘
         │               │
         ▼               │
┌──────────────────┐     │
│ POST /api/videos │     │
│   /reanalyze     │     │
└────────┬─────────┘     │
         │               │
         ▼               │
┌──────────────────┐     │
│  Gemini 2.0      │     │
│  (170+ features) │     │
└────────┬─────────┘     │
         │               │
         └───────┬───────┘
                 ▼
        ┌──────────────┐
        │analyzed_videos│
        │visual_analysis│
        └───────┬──────┘
                │
                ▼
        ┌──────────────┐
        │  Rating UI   │
        │ (Owner rates)│
        └───────┬──────┘
                │
                ▼
        ┌──────────────┐
        │video_ratings │
        │(Ground truth)│
        └───────┬──────┘
                │
    ┌───────────┴───────────┐
    │  At 200+ ratings      │
    ▼                       │
┌──────────────┐            │
│ Correlation  │            │
│  Analysis    │            │
└──────┬───────┘            │
       │                    │
       ▼                    │
┌──────────────┐            │
│model_versions│            │
│(Trained model)│           │
└──────┬───────┘            │
       │                    │
       ▼                    │
┌──────────────┐            │
│   concepts   │◀───────────┘
│(Abstracted)  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│listing_windows│
│ (72h active) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ transactions │
│  (Purchases) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│produced_content│
│  (Feedback)  │
└──────────────┘
```

---

## 4. User Roles and Permissions

### Owner (You)
| Action | Access | Purpose |
|--------|--------|---------|
| Import videos | Full | Discover new concepts |
| Rate videos | Full | Train the model |
| View all data | Full | Monitor system |
| Adjust prices | Full | Override model suggestions |
| Review submissions | Full | Verify produced content |

### Data Input Agents (Future)
| Action | Access | Purpose |
|--------|--------|---------|
| Import videos | Limited (queue) | Scale discovery |
| Rate videos | None initially | Owner trains model |
| Adjust prices | Limited (±20%) | Local market knowledge |
| Flag content | Full | Quality control |

### Buyers
| Action | Access | Purpose |
|--------|--------|---------|
| Browse listings | By market | Find concepts |
| Purchase | Own market | Acquire concepts |
| View concepts | Purchased only | Learn and replicate |
| Submit content | Own transactions | Claim cashback |

---

## 5. Key Constraints Explained

### View-Only Platform (No Downloads)

**Why**: 
- Control distribution: Prevent unauthorized redistribution
- Enable overlays: Subtitles, scene markers rendered in-player
- Track engagement: Know how buyers interact with content
- Future upsells: Premium download tier possible later

**Implementation**:
```typescript
// Video URL is signed, short-lived, and logged
async function getViewerUrl(conceptId: string, buyerId: string): Promise<string> {
  // Verify buyer has purchased
  const transaction = await db.transactions.findFirst({
    where: { concept_id: conceptId, buyer_id: buyerId }
  });
  if (!transaction) throw new Error('Not purchased');
  
  // Generate signed URL valid for 4 hours
  const signedUrl = await gcs.getSignedUrl(concept.source_video.gcs_uri, {
    expires: Date.now() + 4 * 60 * 60 * 1000
  });
  
  // Log view
  await db.viewLogs.create({ buyer_id: buyerId, concept_id: conceptId });
  
  return signedUrl;
}
```

### 72-Hour Listing Windows

**Why**:
- Creates urgency: Buyers motivated to act fast
- Ensures freshness: Marketplace feels dynamic, not stale
- Prevents hoarding: Concepts cycle through
- Enables repricing: Failed listings can re-enter at different price

**Implementation**:
```typescript
// Cron: Every hour
async function checkExpirations() {
  const now = new Date();
  
  // Find expired active listings
  const expired = await db.listingWindows.findMany({
    where: {
      status: 'active',
      window_end: { lt: now }
    }
  });
  
  for (const listing of expired) {
    await db.listingWindows.update({
      where: { id: listing.id },
      data: { status: 'archived' } // Direct to archived, no re-activation
    });
    
    // Check if concept should be fully archived
    const otherActiveListings = await db.listingWindows.count({
      where: {
        concept_id: listing.concept_id,
        status: 'active'
      }
    });
    
    if (otherActiveListings === 0) {
      await db.concepts.update({
        where: { id: listing.concept_id },
        data: { archived: true }
      });
    }
  }
}
```

### Dual Purchase Caps (3-5 per market, 10-15 global)

**Why**:
- Prevents over-saturation: Same concept everywhere dilutes value
- Creates scarcity: Limited supply increases perceived value
- Enables arbitrage: Concept can succeed in multiple markets
- Protects creators: Original creator not overwhelmed by copies

**Implementation**:
```typescript
async function canPurchase(conceptId: string, marketId: string): Promise<boolean> {
  const listing = await db.listingWindows.findFirst({
    where: {
      concept_id: conceptId,
      market_context_id: marketId,
      status: 'active'
    }
  });
  
  if (!listing) return false;
  
  // Check per-market cap
  if (listing.sold_count >= listing.per_market_cap) return false;
  
  // Check global cap
  const globalSold = await db.transactions.count({
    where: { concept_id: conceptId }
  });
  
  if (globalSold >= listing.global_cap) return false;
  
  return true;
}
```

### No Exclusivity

**Why**:
- Maximizes revenue: Same concept sold multiple times
- Enables true arbitrage: US concept sold in Indonesia, Brazil, etc.
- Reduces pricing complexity: No exclusivity tiers
- Matches reality: TikTok concepts are already public

**What This Means**:
- Buyer in US purchases concept → Can still be sold in Indonesia
- Buyer does NOT get exclusive rights
- Buyer cannot resell or redistribute
- Multiple buyers in same market possible (up to cap)

### No Re-Activation

**Why**:
- Simplifies logic: Archived = done, forever
- Prevents gaming: Can't re-list failed concepts repeatedly
- Encourages fresh content: Focus on new discoveries
- Matches 72h freshness goal: Old concepts are old

**What This Means**:
- Once a listing expires → Moves to archived
- Once all listings for a concept archived → Concept archived
- Archived concepts never return to marketplace
- Historical data retained for analytics

---

## 6. Technology Stack Details

### Frontend: Next.js 14
```
- React 18 with Server Components
- App Router for file-based routing
- TailwindCSS for styling
- Shadcn/ui for components (if used)
```

### Backend: Next.js API Routes
```
- Serverless functions on Vercel (or self-hosted)
- TypeScript for type safety
- Zod for request validation
```

### Database: Supabase PostgreSQL
```
- PostgreSQL 15
- pgvector extension for embeddings
- Row-level security for multi-tenant (future)
- Realtime subscriptions (optional)
```

### Storage: Google Cloud Storage
```
- Bucket: gs://hagen-video-analysis/
- Structure: /videos/{uuid}.mp4
- Signed URLs for secure access
- Lifecycle policies for cost management
```

### AI: Google Gemini 2.0 Flash
```
- Vertex AI deployment
- Video understanding capability
- 170+ feature extraction prompt
- ~$0.001-0.005 per video analysis
```

### Embeddings: OpenAI text-embedding-3-small
```
- 1536 dimensions
- Used for similarity search
- Stored in content_embedding column
```

### Metadata: Supadata API
```
- TikTok metadata extraction
- Views, likes, shares, comments
- Author info, hashtags
```

---

## 7. Security Considerations

### Data Protection
```
- Videos stored in private GCS bucket
- Signed URLs expire after 4 hours
- No direct public access to videos
- Buyer access logged
```

### Authentication
```
- Supabase Auth (or custom)
- JWT tokens for API access
- Role-based access control
```

### Rate Limiting
```
- API routes rate limited
- Import limited to prevent abuse
- Purchase limited to prevent hoarding
```

### Content Moderation
```
- Owner reviews all content before listing
- Buyer-submitted URLs verified before cashback
- Brand safety from Gemini analysis (brand.riskLevel)
```

---

## 8. Complete 170+ Feature Schema Reference

The `visual_analysis` JSONB column contains all AI-extracted features. This is the complete enumeration:

### 8.1 VISUAL (13 variables)
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

### 8.2 AUDIO (10 variables)
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

### 8.3 CONTENT (8 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `content.topic` | string | Precise topic/subject matter |
| `content.style` | string | educational/entertaining/inspirational |
| `content.format` | string | talking head/montage/tutorial/skit |
| `content.duration` | number | Duration in seconds |
| `content.keyMessage` | string | Core message or takeaway |
| `content.narrativeStructure` | string | How the story unfolds |
| `content.targetAudience` | string | Who this appeals to |
| `content.emotionalTone` | string | Dominant emotion conveyed |

### 8.4 SCENES (8 meta + 8 per-scene)
**Meta variables:**
| Variable | Type | Description |
|----------|------|-------------|
| `scenes.description` | string | Overview of scene analysis |
| `scenes.sceneBreakdown[]` | array | Array of scene objects |
| `scenes.totalScenes` | number | Count of distinct scenes/shots |
| `scenes.editAsPunchline` | boolean | Does an edit itself serve as punchline? |
| `scenes.editPunchlineExplanation` | string | How edit delivers the joke |
| `scenes.visualNarrativeSync` | 1-10 | How tightly visuals and story sync |
| `scenes.misdirectionTechnique` | string | How false expectations are set |
| `scenes.keyVisualComedyMoment` | string | THE most important visual comedy element |

**Per-scene (scenes.sceneBreakdown[]):**
| Variable | Type | Description |
|----------|------|-------------|
| `sceneNumber` | number | Sequential scene number |
| `timestamp` | string | Approximate start time |
| `visualContent` | string | What is SHOWN visually |
| `audioContent` | string | What is SAID or HEARD |
| `visualComedyDetail` | string/null | Visual gag description |
| `narrativeFunction` | enum | hook/setup/development/misdirection/reveal/payoff/callback/tag |
| `editSignificance` | string | Why this cut/transition matters |
| `viewerAssumption` | string | What viewer assumes during this scene |

### 8.5 SCRIPT (33 variables)
**script.* (base - 5 vars):**
`conceptCore`, `hasScript`, `scriptQuality`, `transcript`, `visualTranscript`

**script.humor.* (7 vars):**
`isHumorous`, `humorType`, `humorMechanism`, `visualComedyElement`, `comedyTiming`, `absurdismLevel`, `surrealismLevel`

**script.structure.* (10 vars):**
`hookType`, `hook`, `setup`, `development`, `payoff`, `payoffType`, `payoffStrength`, `hasCallback`, `hasTwist`, `twistDelivery`

**script.emotional.* (4 vars):**
`primaryEmotion`, `emotionalArc`, `emotionalIntensity`, `relatability`

**script.replicability.* (6 vars):**
`score`, `template`, `requiredElements`, `variableElements`, `resourceRequirements`, `contextDependency`

**script.originality.* (3 vars):**
`score`, `similarFormats`, `novelElements`

### 8.6 CASTING (6 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `casting.minimumPeople` | number | Minimum people required |
| `casting.requiresCustomer` | boolean | Needs customer/stranger? |
| `casting.attractivenessDependency` | 1-10 | Relies on looks? 1=anyone, 10=only attractive |
| `casting.personalityDependency` | 1-10 | Needs specific persona? |
| `casting.actingSkillRequired` | 1-10 | Acting/improv ability needed |
| `casting.castingNotes` | string | Who could perform this |

### 8.7 PRODUCTION (5 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `production.shotComplexity` | 1-10 | Camera setups needed. 1=single static |
| `production.editingDependency` | 1-10 | Editing essential? 1=single take works |
| `production.timeToRecreate` | enum | 15min/30min/1hr/2hr/half-day/full-day |
| `production.equipmentNeeded` | string[] | Beyond smartphone |
| `production.productionNotes` | string | Production complexity explanation |

### 8.8 FLEXIBILITY (6 variables)
| Variable | Type | Description |
|----------|------|-------------|
| `flexibility.industryLock` | 1-10 | Locked to specific business? 1=anywhere |
| `flexibility.industryExamples` | string[] | 3-5 business types that could use |
| `flexibility.propDependency` | 1-10 | Requires specific props? |
| `flexibility.swappableCore` | boolean | Can central topic be replaced? |
| `flexibility.swapExamples` | string | What could be swapped |
| `flexibility.flexibilityNotes` | string | How adaptable |

### 8.9 COMEDY STYLE (~50 variables)
**comedyStyle.* (base - 2 vars):**
`isHumorFocused`, `primaryTechnique`

**Sub-objects (4-5 vars each):**
- `visualMetaphor.*`: present, element, represents, whyEffective
- `genreTransplant.*`: present, sourceGenre, mundaneSetting, dramaticElement, whyEffective
- `powerDynamicAbsurdism.*`: present, dynamicType, violatedNorm, playedStraight, whyEffective
- `thirdPartyReaction.*`: present, primaryActors, reactingParty, reactionType, whyEffective
- `hiddenMaliceReveal.*`: present, revealLine, characterAppearance, actualIntent, whyEffective
- `contrastMechanism.*`: present, element1, element2, contrastType
- `physicalComedyDetails.*`: present, action, suddenness, timing, wouldWorkWithoutVisual
- `punchlineStructure.*`: layeredPunchline, punchlineCount, punchlines[], finalTwist, characterSubversion
- `musicMomentAmplifier.*`: present, momentType, musicStyle, characterEffect, essentialToEffect

### 8.10 TRENDS (9 variables)
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

### 8.11 BRAND (5 variables)
`riskLevel`, `toneMatch[]`, `adultThemes`, `brandExclusions[]`, `brandNotes`

### 8.12 STANDALONE (4 variables)
`worksWithoutContext`, `worksWithoutProduct`, `requiresSetup`, `standaloneNotes`

### 8.13 EXECUTION (4 variables)
`physicalComedyLevel`, `timingCriticality`, `improvisationRoom`, `executionNotes`

### 8.14 TECHNICAL (5 variables)
`pacing`, `editingStyle`, `cutsPerMinute`, `cameraWork`, `lighting`

### 8.15 ENGAGEMENT (4 variables)
`attentionRetention`, `shareability`, `replayValue`, `scrollStopPower`

### 8.16 METADATA (3 variables)
`feature_count`, `analyzed_at`, `analysis_model`

### Total Variable Count by Category

| Category | Count |
|----------|-------|
| visual | 13 |
| audio | 10 |
| content | 8 |
| scenes (meta) | 8 |
| scenes.sceneBreakdown[] (per scene) | 8× |
| script.* total | 35 |
| casting | 6 |
| production | 5 |
| flexibility | 6 |
| comedyStyle.* total | ~50 |
| trends | 9 |
| brand | 5 |
| standalone | 4 |
| execution | 4 |
| technical | 5 |
| engagement | 4 |
| metadata | 3 |
| **TOTAL (excluding per-scene)** | **~170+** |

---

## 9. Schema Version History (Critical)

### v0 - PREDICTION ONLY (NOT deep analysis)
**Date**: Before Dec 1, 2025 | **Count**: ~22 videos

```json
{
  "ai_prediction": { "overall": 0.7, "dimensions": {...}, "reasoning": "..." },
  "prediction_at": "2025-12-02T...",
  "prediction_model": "base"
}
```

**⚠️ DO NOT USE for training** - contains no actual video analysis.

**Detection**: `visual_analysis.prediction_model` exists BUT `visual_analysis.visual` does NOT exist.

### v1 - BASIC DEEP ANALYSIS
**Date**: Dec 1, 2025 | **Count**: 3 videos | **Fields**: ~10

Has: `visual`, `audio`, `content`, `script`, `technical`, `engagement`

**Missing**: scenes, casting, production, flexibility, comedyStyle, trends, brand, standalone, execution

**Detection**: Has `visual_analysis.visual` but `Object.keys(visual_analysis).length ≈ 10`

### v2 - EXTENDED ANALYSIS  
**Date**: Dec 1-2, 2025 | **Count**: ~21 videos | **Fields**: ~17

Added: casting, production, flexibility, trends, brand, standalone, execution

**Missing**: scenes, comedyStyle

**Detection**: Has `visual_analysis.casting` but NO `visual_analysis.comedyStyle`

### v3 - FULL ANALYSIS (CURRENT)
**Date**: Dec 3, 2025+ | **Count**: ~51+ videos | **Fields**: 170+

Has ALL categories including detailed `scenes.sceneBreakdown[]` and comprehensive `comedyStyle.*`

**Detection**: `visual_analysis.feature_count >= 100` OR `visual_analysis.comedyStyle` exists

### Version Detection Code

```javascript
function getAnalysisVersion(visual_analysis) {
  if (!visual_analysis) return null;
  if (visual_analysis.prediction_model && !visual_analysis.visual) return 'v0';
  if (!visual_analysis.casting) return 'v1';
  if (!visual_analysis.comedyStyle) return 'v2';
  return 'v3';
}

// For training, ONLY use v3:
const trainableVideos = videos.filter(v => getAnalysisVersion(v.visual_analysis) === 'v3');
```

---

## 10. Correlation Analysis at Milestones

The model training approach runs correlation analysis at specific rating count milestones:

### At 100 Ratings
- Run correlation analysis only (no model training)
- Identify top 20 positive and negative correlations
- **Validate against expected correlations** (see section 0)
- Create `feature_importance_snapshot`
- Flag any surprises for investigation

### At 200 Ratings
- Train first model (Ridge regression)
- Target: MAE < 0.20
- Store as v1.0
- Compare correlations to 100-rating snapshot
- Activate if metrics acceptable

### At 300 Ratings
- Retrain model
- Compare to v1.0
- Consider feature pruning (remove |correlation| < 0.1)
- Update snapshot

### At 500 Ratings
- Try Random Forest model
- Compare Ridge vs RF
- Select best performer
- Consider multi-output for dimension prediction (hook, pacing, payoff separately)

---

## 11. Scalability Considerations

### Current Scale (MVP)
```
- 100-500 videos
- 1 owner rating
- 10 initial markets
- 100s of transactions
```

### Future Scale
```
- 10,000+ videos
- Multiple data input agents
- 50+ markets
- 10,000s of transactions
```

### Bottlenecks and Solutions

| Bottleneck | Current | Scaled Solution |
|------------|---------|-----------------|
| Video storage | GCS (no limit) | Same |
| Gemini analysis | Sequential | Queue + parallel workers |
| Database queries | Single instance | Read replicas |
| Subtitle generation | On-demand | Pre-generate top 5 languages |
| Rotation cron | Hourly | Edge functions |

---

## Related Documents

- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md)
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md)
- [Model Training Deep Dive](./06_MODEL_TRAINING.md)

---

*This document provides exhaustive detail on system architecture. Refer to specific component documents for implementation details.*
