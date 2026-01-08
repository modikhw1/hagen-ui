# Component 02: Database Schema Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Database Schema
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on every database table, column, relationship, and constraint in the system.

---

## 0. Schema Evolution Context

### Why Schema Versions Matter

The `visual_analysis` JSONB field has evolved through 4 versions. **Only v3 should be used for model training.** Using v0-v2 data will produce incorrect correlations.

| Version | Date | Videos | Features | Usable for Training? |
|---------|------|--------|----------|---------------------|
| v0 | Pre-Dec 1 | ~22 | 3 | ❌ NO - prediction only, no analysis |
| v1 | Dec 1 | 3 | ~10 | ❌ NO - missing key categories |
| v2 | Dec 1-2 | ~21 | ~17 | ⚠️ Limited - missing comedyStyle |
| v3 | Dec 3+ | ~51+ | 170+ | ✅ YES - full analysis |

### Legacy Column Warning

The `analyzed_videos` table has three legacy columns that are **EMPTY** and should **NEVER** be used:
- `user_ratings` - EMPTY (use `video_ratings` table)
- `user_tags` - EMPTY (use `video_ratings.tags`)
- `user_notes` - EMPTY (use `video_ratings.notes`)

These exist from an earlier design where ratings were stored directly on videos. The current design uses a separate `video_ratings` table to support multiple raters.

---

## 1. Existing Tables (From Current System)

### 1.1 `analyzed_videos`

Primary storage for imported videos with AI analysis.

```sql
CREATE TABLE analyzed_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,                    -- Original TikTok/Instagram URL
  video_id text,                              -- Platform's video ID (e.g., TikTok ID)
  platform text DEFAULT 'tiktok',             -- 'tiktok' | 'instagram' | 'youtube'
  metadata jsonb,                             -- Full platform metadata (author, stats)
  gcs_uri text,                               -- gs://hagen-video-analysis/videos/{id}.mp4
  visual_analysis jsonb,                      -- 170+ Gemini features (see schema below)
  content_embedding vector(1536),             -- OpenAI embedding for similarity
  created_at timestamp DEFAULT now(),         -- When imported
  analyzed_at timestamp,                      -- When Gemini analysis ran
  
  -- LEGACY COLUMNS (EMPTY - DO NOT USE)
  user_ratings jsonb,                         -- EMPTY: Use video_ratings table
  user_tags text[],                           -- EMPTY: Use video_ratings.tags
  user_notes text                             -- EMPTY: Use video_ratings.notes
);

-- Indexes
CREATE INDEX idx_analyzed_videos_platform ON analyzed_videos(platform);
CREATE INDEX idx_analyzed_videos_created ON analyzed_videos(created_at DESC);
CREATE INDEX idx_analyzed_videos_embedding ON analyzed_videos 
  USING ivfflat (content_embedding vector_cosine_ops);
```

**Example Record**:
```json
{
  "id": "695e6525-c41d-4152-96b4-931a3d75da29",
  "video_url": "https://www.tiktok.com/@kielekassidy/video/7263245062883085611",
  "video_id": "7263245062883085611",
  "platform": "tiktok",
  "metadata": {
    "author": {
      "uniqueId": "kielekassidy",
      "nickname": "Kiele Kassidy",
      "followerCount": 125000
    },
    "stats": {
      "playCount": 2500000,
      "diggCount": 180000,
      "shareCount": 5000,
      "commentCount": 2000
    },
    "desc": "POV: you have to tell the kitchen you messed up #restaurant #serverlife",
    "hashtags": ["restaurant", "serverlife", "pov"]
  },
  "gcs_uri": "gs://hagen-video-analysis/videos/695e6525-c41d-4152-96b4-931a3d75da29.mp4",
  "visual_analysis": { /* 170+ features - see section 1.3 */ },
  "created_at": "2025-12-03T10:00:00Z",
  "analyzed_at": "2025-12-03T12:59:40Z"
}
```

### 1.3 Complete `visual_analysis` Example (v3)

This is a **real example** from the database showing all 170+ features:

```json
{
  "feature_count": 172,
  "analyzed_at": "2025-12-03T12:59:40.123Z",
  "analysis_model": "gemini-2.0-flash-vertex",
  
  "visual": {
    "hookStrength": 8,
    "hookDescription": "Opens with employee walking into kitchen with tray of food - immediately signals relatable work situation",
    "overallQuality": 6,
    "mainElements": ["restaurant kitchen", "server uniform", "food tray", "chef in background"],
    "colorPalette": ["stainless steel", "white apron", "warm food tones"],
    "colorDiversity": 4,
    "transitions": ["cut on action", "single take middle section"],
    "textOverlays": ["POV: you have to tell the kitchen you messed up"],
    "visualHierarchy": "Focus on server's facial expression, kitchen chaos in background",
    "compositionQuality": 7,
    "peopleCount": 3,
    "settingType": "indoor",
    "summary": "Simple restaurant setting, authentic feel, no expensive production"
  },
  
  "audio": {
    "quality": 7,
    "musicType": "none",
    "musicGenre": null,
    "hasVoiceover": false,
    "voiceoverQuality": null,
    "voiceoverTone": null,
    "energyLevel": "medium",
    "audioEnergy": 6,
    "soundEffects": ["kitchen ambiance", "plates clattering"],
    "audioVisualSync": 8
  },
  
  "content": {
    "topic": "restaurant server mistake confession",
    "style": "entertaining",
    "format": "skit",
    "duration": 18,
    "keyMessage": "Workplace anxiety is universal and funny when played straight",
    "narrativeStructure": "setup → delay → confession → reaction",
    "targetAudience": "service industry workers, young adults",
    "emotionalTone": "anxious-comedic"
  },
  
  "scenes": {
    "description": "4-scene structure with escalating dread",
    "totalScenes": 4,
    "editAsPunchline": false,
    "editPunchlineExplanation": null,
    "visualNarrativeSync": 8,
    "misdirectionTechnique": "Server appears confident, delay reveals dread",
    "keyVisualComedyMoment": "Chef's reaction face when hearing the mistake",
    "sceneBreakdown": [
      {
        "sceneNumber": 1,
        "timestamp": "0:00-0:03",
        "visualContent": "Server walking toward kitchen with tray",
        "audioContent": "Kitchen ambient noise",
        "visualComedyDetail": null,
        "narrativeFunction": "hook",
        "editSignificance": "Establishes setting immediately",
        "viewerAssumption": "Normal restaurant scene"
      },
      {
        "sceneNumber": 2,
        "timestamp": "0:03-0:08",
        "visualContent": "Server standing at kitchen window, hesitating",
        "audioContent": "Slight pause in kitchen noise",
        "visualComedyDetail": "Visible sweat, exaggerated hesitation",
        "narrativeFunction": "setup",
        "editSignificance": "Builds tension through delay",
        "viewerAssumption": "Something is wrong"
      },
      {
        "sceneNumber": 3,
        "timestamp": "0:08-0:14",
        "visualContent": "Server mumbles confession to chef",
        "audioContent": "Mumbled words, then clear 'I gave table 5 the wrong order'",
        "visualComedyDetail": "Server wincing during confession",
        "narrativeFunction": "reveal",
        "editSignificance": "Payoff moment",
        "viewerAssumption": "Chef will be angry"
      },
      {
        "sceneNumber": 4,
        "timestamp": "0:14-0:18",
        "visualContent": "Chef's deadpan stare, then returns to cooking",
        "audioContent": "Silence, then resumed cooking sounds",
        "visualComedyDetail": "Anti-climactic reaction subverts expectation",
        "narrativeFunction": "payoff",
        "editSignificance": "Subverts expected blowup",
        "viewerAssumption": "Viewer laughs at anticlimax"
      }
    ]
  },
  
  "script": {
    "conceptCore": "Employee dreads confessing mistake to authority figure, confession is anticlimactic",
    "hasScript": true,
    "scriptQuality": 7,
    "transcript": "POV: you have to tell the kitchen you messed up... *walks slowly* *hesitates* 'Hey chef... I uh... I gave table 5 the wrong order' *chef stares* *returns to cooking*",
    "visualTranscript": "WIDE: Server approaches kitchen. MEDIUM: Server hesitates at window. CLOSE: Mumbled confession. REACTION: Chef's deadpan.",
    
    "humor": {
      "isHumorous": true,
      "humorType": "contrast",
      "humorMechanism": "Buildup of dread vs anticlimactic resolution",
      "visualComedyElement": "Exaggerated hesitation and wincing",
      "comedyTiming": 8,
      "absurdismLevel": 3,
      "surrealismLevel": 1
    },
    
    "structure": {
      "hookType": "relatable-situation",
      "hook": "Text overlay primes viewer for workplace anxiety scenario",
      "setup": "Server's visible dread walking to kitchen",
      "development": "Extended hesitation builds tension",
      "payoff": "Chef's non-reaction subverts expected blowup",
      "payoffType": "visual",
      "payoffStrength": 7,
      "hasCallback": false,
      "hasTwist": true,
      "twistDelivery": "visual"
    },
    
    "emotional": {
      "primaryEmotion": "anxiety-then-relief",
      "emotionalArc": "dread → confession → anticlimax → humor",
      "emotionalIntensity": 6,
      "relatability": 9
    },
    
    "replicability": {
      "score": 9,
      "template": "[Employee] must confess [minor mistake] to [authority], buildup dread, anticlimactic response",
      "requiredElements": ["authority figure", "employee", "workplace setting"],
      "variableElements": ["specific mistake", "type of workplace", "authority's specific reaction"],
      "resourceRequirements": "low",
      "contextDependency": 2
    },
    
    "originality": {
      "score": 6,
      "similarFormats": ["confession POV", "workplace anxiety", "subverted expectation"],
      "novelElements": ["specific restaurant framing", "chef's deadpan non-reaction"]
    }
  },
  
  "casting": {
    "minimumPeople": 2,
    "requiresCustomer": false,
    "attractivenessDependency": 2,
    "personalityDependency": 3,
    "actingSkillRequired": 4,
    "castingNotes": "Anyone who can look anxious and deliver mumbled line works"
  },
  
  "production": {
    "shotComplexity": 3,
    "editingDependency": 3,
    "timeToRecreate": "15min",
    "equipmentNeeded": [],
    "productionNotes": "Single smartphone, real or fake kitchen works"
  },
  
  "flexibility": {
    "industryLock": 2,
    "industryExamples": ["restaurant", "retail", "office", "hospital", "school"],
    "propDependency": 3,
    "swappableCore": true,
    "swapExamples": "Could be 'telling boss about client complaint' or 'telling teacher about lost homework'",
    "flexibilityNotes": "Core mechanic (dread → confession → anticlimax) works anywhere"
  },
  
  "comedyStyle": {
    "isHumorFocused": true,
    "primaryTechnique": "verbal-subversion",
    
    "visualMetaphor": {
      "present": false,
      "element": null,
      "represents": null,
      "whyEffective": null
    },
    
    "genreTransplant": {
      "present": false,
      "sourceGenre": null,
      "mundaneSetting": null,
      "dramaticElement": null,
      "whyEffective": null
    },
    
    "powerDynamicAbsurdism": {
      "present": true,
      "dynamicType": "authority-subordinate",
      "violatedNorm": "Expected anger/punishment from authority",
      "playedStraight": true,
      "whyEffective": "Subverts workplace fear trope"
    },
    
    "thirdPartyReaction": {
      "present": false,
      "primaryActors": null,
      "reactingParty": null,
      "reactionType": null,
      "whyEffective": null
    },
    
    "hiddenMaliceReveal": {
      "present": false,
      "revealLine": null,
      "characterAppearance": null,
      "actualIntent": null,
      "whyEffective": null
    },
    
    "contrastMechanism": {
      "present": true,
      "element1": "Server's extreme anxiety and dread",
      "element2": "Chef's complete indifference",
      "contrastType": "expectation-reality"
    },
    
    "physicalComedyDetails": {
      "present": true,
      "action": "Exaggerated hesitation and wincing",
      "suddenness": false,
      "timing": "Slow buildup throughout",
      "wouldWorkWithoutVisual": false
    },
    
    "punchlineStructure": {
      "layeredPunchline": false,
      "punchlineCount": 1,
      "punchlines": [
        {
          "type": "visual",
          "description": "Chef's non-reaction",
          "whatItReveals": "The dread was unnecessary"
        }
      ],
      "finalTwist": "Authority doesn't care as much as employee feared",
      "characterSubversion": null
    },
    
    "musicMomentAmplifier": {
      "present": false,
      "momentType": null,
      "musicStyle": null,
      "characterEffect": null,
      "essentialToEffect": false
    }
  },
  
  "trends": {
    "usesPremadeSound": false,
    "soundName": null,
    "soundEssential": false,
    "memeDependent": false,
    "trendName": null,
    "trendLifespan": "evergreen-trope",
    "insideJokeDependency": 1,
    "culturalSpecificity": 2,
    "trendNotes": "Workplace anxiety is universal, not trend-dependent"
  },
  
  "brand": {
    "riskLevel": 2,
    "toneMatch": ["playful", "relatable", "self-deprecating"],
    "adultThemes": false,
    "brandExclusions": [],
    "brandNotes": "Safe for all restaurant brands, shows humanity"
  },
  
  "standalone": {
    "worksWithoutContext": 9,
    "worksWithoutProduct": true,
    "requiresSetup": false,
    "standaloneNotes": "Anyone who has had a job understands immediately"
  },
  
  "execution": {
    "physicalComedyLevel": 4,
    "timingCriticality": 7,
    "improvisationRoom": 5,
    "executionNotes": "Timing of hesitation is key, but has wiggle room"
  },
  
  "technical": {
    "pacing": 8,
    "editingStyle": "minimal cuts",
    "cutsPerMinute": 13,
    "cameraWork": "static or simple follow",
    "lighting": "natural/practical restaurant lighting"
  },
  
  "engagement": {
    "attentionRetention": 8,
    "shareability": 7,
    "replayValue": 5,
    "scrollStopPower": 7
  }
}
```

### 1.4 `video_ratings`

Human ratings (ground truth for model training).

```sql
CREATE TABLE video_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES analyzed_videos(id) NOT NULL,
  overall_score float NOT NULL,               -- 0-1 scale (primary target variable)
  dimensions jsonb NOT NULL,                  -- {hook, pacing, payoff, originality, rewatchable}
  notes text,                                 -- Free-form analysis
  tags text[],                                -- Classification tags
  ai_prediction jsonb,                        -- Model's pre-rating guess
  rated_at timestamp DEFAULT now(),
  
  -- NEW COLUMNS (for multi-rater future)
  rater_id uuid DEFAULT 'owner-uuid-here',    -- Who rated
  rater_type text DEFAULT 'owner',            -- 'owner' | 'agent'
  
  UNIQUE(video_id, rater_id)                  -- One rating per video per rater
);

-- Indexes
CREATE INDEX idx_video_ratings_video ON video_ratings(video_id);
CREATE INDEX idx_video_ratings_overall ON video_ratings(overall_score);
CREATE INDEX idx_video_ratings_rated ON video_ratings(rated_at DESC);
```

**Example Record**:
```json
{
  "id": "abc123",
  "video_id": "695e6525-c41d-4152-96b4-931a3d75da29",
  "overall_score": 0.3,
  "dimensions": {
    "hook": 0.5,
    "pacing": 0.56,
    "payoff": 0.43,
    "originality": 0.41,
    "rewatchable": 0.42
  },
  "notes": "The video is somewhat amusing... relies on TikTok sound which tells the script isn't strong...",
  "tags": ["restaurant", "gen-z-humor", "sound-dependent"],
  "ai_prediction": {
    "overall": 0.7,
    "modelUsed": "base",
    "reasoning": "Strong hook, good pacing...",
    "dimensions": {
      "hook": 0.8,
      "pacing": 0.9,
      "payoff": 0.6,
      "originality": 0.6,
      "rewatchable": 0.6
    },
    "user_disagreement": {
      "overall_delta": -0.4,
      "dimension_deltas": {
        "hook": -0.3,
        "pacing": -0.34,
        "payoff": -0.17,
        "originality": -0.19,
        "rewatchable": -0.18
      }
    }
  },
  "rated_at": "2025-12-03T14:00:00Z",
  "rater_id": "owner-uuid",
  "rater_type": "owner"
}
```

---

## 2. New Core Tables

### 2.1 `market_contexts`

Geographic and demographic segmentation for pricing and distribution.

```sql
CREATE TABLE market_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2 (e.g., 'US', 'ID')
  region_name text NOT NULL,                  -- Full name (e.g., 'Indonesia')
  primary_language text NOT NULL,             -- ISO 639-1 (e.g., 'en', 'id')
  purchasing_power_index float NOT NULL,      -- 1.0 = US baseline
  subtitle_priority int DEFAULT 5,            -- 1-10, higher = pre-generate subtitles
  currency_code text NOT NULL,                -- ISO 4217 (e.g., 'USD', 'IDR')
  notes text,                                 -- Admin notes
  created_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_market_contexts_country ON market_contexts(country_code);
CREATE INDEX idx_market_contexts_language ON market_contexts(primary_language);
```

**Example Records**:
```json
[
  {
    "id": "market-us",
    "country_code": "US",
    "region_name": "United States",
    "primary_language": "en",
    "purchasing_power_index": 1.0,
    "subtitle_priority": 1,
    "currency_code": "USD",
    "notes": "Primary market, baseline pricing"
  },
  {
    "id": "market-id",
    "country_code": "ID",
    "region_name": "Indonesia",
    "primary_language": "id",
    "purchasing_power_index": 0.25,
    "subtitle_priority": 3,
    "currency_code": "IDR",
    "notes": "High potential market, low PPP"
  }
]
```

**PPP Calculation Explanation**:
```
US concept worth $50 USD
Indonesia PPP = 0.25

Listed price in Indonesia = $50 × 0.25 = $12.50 USD equivalent
In IDR (at ~15,000 IDR/USD) = ~187,500 IDR

This makes concepts affordable relative to local income.
```

### 2.2 `user_profiles`

User profiles built through AI onboarding chat and social sync, used for personalized recommendations.

```sql
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,               -- From auth system
  business_description text,                  -- "Coffee shop in Austin"
  goals text[],                               -- ["More foot traffic", "Brand awareness"]
  constraints text[],                         -- ["Just me, no budget for actors"]
  industry_tags text[],                       -- ["food", "retail", "local"]
  onboarding_complete boolean DEFAULT false,  -- Profile ready for matching?
  onboarding_conversation jsonb,              -- Chat history for context

  -- Social sync data
  social_links jsonb,                         -- {"tiktok": "@handle", "instagram": "@handle"}
  social_analysis jsonb,                      -- Analyzed data from connected accounts
  profile_completeness int DEFAULT 0,         -- 0-100 "How well we know you" meter

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_industry ON user_profiles USING GIN(industry_tags);
CREATE INDEX idx_user_profiles_complete ON user_profiles(onboarding_complete);
CREATE INDEX idx_user_profiles_completeness ON user_profiles(profile_completeness);
```

**Profile Completeness Calculation**:

| Factor | Points |
|--------|--------|
| Basic info (business type, team size) | +30 |
| Social sync completed | +25 |
| Tone/style confirmed | +15 |
| Goals discussed | +15 |
| Constraints specified | +15 |

**Social Analysis Schema**:
```typescript
interface SocialAnalysis {
  platform: 'tiktok' | 'instagram';
  analyzedAt: string;
  bio: string;
  followers: number;
  postingFrequency: 'rarely' | 'occasionally' | 'regularly' | 'daily';
  contentStyle: string[];         // ["behind-the-scenes", "quick-humor"]
  humorType?: string;             // "playful", "dry", "physical"
  energyLevel: 'low' | 'medium' | 'high';
  hashtagPatterns: string[];      // Common hashtags used
  inferredTone: string;           // "casual", "professional", "edgy"
  inferredTeamSize: 'solo' | 'duo' | 'small-team' | 'large-team';
}
```

**Example Record**:
```json
{
  "id": "profile-abc",
  "user_id": "user-123",
  "business_description": "Coffee shop in Austin, Texas",
  "goals": ["More foot traffic", "Build local brand awareness"],
  "constraints": ["Just me, no budget for actors", "Limited time for complex productions"],
  "industry_tags": ["food", "beverage", "local", "retail"],
  "onboarding_complete": true,
  "onboarding_conversation": [
    {"role": "assistant", "content": "Tell me about your business..."},
    {"role": "user", "content": "I run a coffee shop in Austin..."}
  ],
  "social_links": {
    "tiktok": "@austincoffee",
    "instagram": "@austin_coffee_co"
  },
  "social_analysis": {
    "platform": "tiktok",
    "analyzedAt": "2025-12-03T10:00:00Z",
    "bio": "☕ Best coffee in Austin | Open 7am-6pm",
    "followers": 2400,
    "postingFrequency": "occasionally",
    "contentStyle": ["behind-the-scenes", "product-showcase"],
    "humorType": "playful",
    "energyLevel": "medium",
    "hashtagPatterns": ["#austincoffee", "#localcafe", "#coffeeshop"],
    "inferredTone": "casual",
    "inferredTeamSize": "duo"
  },
  "profile_completeness": 85,
  "created_at": "2025-12-03T10:00:00Z",
  "updated_at": "2025-12-03T10:15:00Z"
}
```

### 2.3 `model_versions`

Track trained preference models over time.

```sql
CREATE TABLE model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag text NOT NULL UNIQUE,           -- 'v1.0', 'v1.1', 'v2.0'
  trained_at timestamp NOT NULL,              -- When model was trained
  training_video_count int NOT NULL,          -- How many videos in training set
  feature_weights jsonb NOT NULL,             -- { "script.replicability.score": 0.82, ... }
  accuracy_metrics jsonb NOT NULL,            -- { "mae": 0.12, "rmse": 0.15, "r2": 0.68 }
  notes text,                                 -- Training notes, changes
  is_active boolean DEFAULT false             -- Only one active at a time
);

-- Indexes
CREATE INDEX idx_model_versions_active ON model_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_model_versions_trained ON model_versions(trained_at DESC);

-- Constraint: Only one active model
CREATE UNIQUE INDEX idx_model_versions_single_active 
  ON model_versions(is_active) WHERE is_active = true;
```

**Example Record**:
```json
{
  "id": "model-v1",
  "version_tag": "v1.0",
  "trained_at": "2025-12-15T00:00:00Z",
  "training_video_count": 200,
  "feature_weights": {
    "script.replicability.score": 0.82,
    "script.humor.comedyTiming": 0.65,
    "casting.actingSkillRequired": -0.55,
    "trends.memeDependent": -0.68,
    "production.shotComplexity": -0.42,
    "audio.soundEffects_count": -0.38,
    "flexibility.industryLock": -0.35,
    "standalone.worksWithoutContext": 0.45,
    "comedyStyle.contrastMechanism.present": 0.52
    // ... 50+ more features
  },
  "accuracy_metrics": {
    "mae": 0.12,
    "rmse": 0.15,
    "r2": 0.68,
    "cross_validation_folds": 5,
    "test_set_size": 40
  },
  "notes": "First production model. Strong on replicability prediction.",
  "is_active": true
}
```

### 2.3 `concepts`

Abstracted concepts derived from source videos.

```sql
CREATE TABLE concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video_id uuid REFERENCES analyzed_videos(id) NOT NULL,
  concept_core text NOT NULL,                 -- One-line replicable concept
  template_description text,                  -- How to replicate
  required_elements text[],                   -- Must-have elements
  variable_elements text[],                   -- Swappable elements
  origin_market_id uuid REFERENCES market_contexts(id),
  virality_score float,                       -- 0-10 from model
  model_version_id uuid REFERENCES model_versions(id),
  evergreen_eligible boolean DEFAULT true,    -- Can be listed?
  archived boolean DEFAULT false,             -- Permanently unavailable?
  created_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_concepts_source ON concepts(source_video_id);
CREATE INDEX idx_concepts_virality ON concepts(virality_score DESC);
CREATE INDEX idx_concepts_archived ON concepts(archived);
CREATE INDEX idx_concepts_evergreen ON concepts(evergreen_eligible);
```

**Example Record**:
```json
{
  "id": "concept-123",
  "source_video_id": "695e6525-c41d-4152-96b4-931a3d75da29",
  "concept_core": "Employee dreads admitting mistake to kitchen, cut to deadpan reaction",
  "template_description": "Show person anxious about admitting mistake, cut to unexpected calm reaction from the people they're worried about",
  "required_elements": [
    "Person expressing anxiety",
    "Situation of admitting fault",
    "Cut to reaction"
  ],
  "variable_elements": [
    "Type of mistake",
    "Who they're telling",
    "The specific reaction (deadpan, supportive, etc.)"
  ],
  "origin_market_id": "market-us",
  "virality_score": 6.2,
  "model_version_id": "model-v1",
  "evergreen_eligible": true,
  "archived": false,
  "created_at": "2025-12-03T15:00:00Z"
}
```

---

## 3. New Marketplace Tables

### 3.1 `listing_windows`

Active marketplace listings with 72-hour windows.

```sql
CREATE TABLE listing_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  market_context_id uuid REFERENCES market_contexts(id) NOT NULL,
  window_start timestamp NOT NULL,            -- When listing became active
  window_end timestamp NOT NULL,              -- window_start + 72 hours
  base_price_usd float NOT NULL,              -- Before any adjustments
  listed_price float NOT NULL,                -- After PPP + premium
  per_market_cap int DEFAULT 5,               -- Max sales in this market
  global_cap int DEFAULT 15,                  -- Max sales globally
  sold_count int DEFAULT 0,                   -- Current sales in this market
  status text DEFAULT 'active',               -- 'active' | 'sold_out' | 'expired' | 'archived'
  created_at timestamp DEFAULT now(),
  
  -- Prevent duplicate listings
  UNIQUE(concept_id, market_context_id, window_start)
);

-- Indexes
CREATE INDEX idx_listing_windows_concept ON listing_windows(concept_id);
CREATE INDEX idx_listing_windows_market ON listing_windows(market_context_id);
CREATE INDEX idx_listing_windows_status ON listing_windows(status);
CREATE INDEX idx_listing_windows_active ON listing_windows(status) WHERE status = 'active';
CREATE INDEX idx_listing_windows_end ON listing_windows(window_end);
```

**Status Flow**:
```
active → sold_out (when sold_count >= per_market_cap or global sales >= global_cap)
active → expired (when current_time > window_end)
expired → archived (via cron job)
sold_out → archived (via cron job after window_end)
```

**Example Record**:
```json
{
  "id": "listing-abc",
  "concept_id": "concept-123",
  "market_context_id": "market-id",
  "window_start": "2025-12-03T00:00:00Z",
  "window_end": "2025-12-06T00:00:00Z",
  "base_price_usd": 41.00,
  "listed_price": 11.48,
  "per_market_cap": 5,
  "global_cap": 15,
  "sold_count": 2,
  "status": "active",
  "created_at": "2025-12-03T00:00:00Z"
}
```

### 3.2 `transactions`

Purchase records linking buyers to concepts.

```sql
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,                     -- From auth system
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  listing_window_id uuid REFERENCES listing_windows(id) NOT NULL,
  market_context_id uuid REFERENCES market_contexts(id) NOT NULL,
  price_paid float NOT NULL,                  -- Actual amount paid
  currency_code text NOT NULL,                -- Currency of payment
  cashback_eligible boolean DEFAULT true,     -- Can claim cashback?
  cashback_amount float,                      -- price_paid × 0.12
  cashback_status text DEFAULT 'pending',     -- 'pending' | 'claimed' | 'expired'
  purchased_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_concept ON transactions(concept_id);
CREATE INDEX idx_transactions_listing ON transactions(listing_window_id);
CREATE INDEX idx_transactions_cashback ON transactions(cashback_status);
```

**Cashback Status Flow**:
```
pending → claimed (when produced_content submitted and verified)
pending → expired (after 30 days with no submission)
```

**Example Record**:
```json
{
  "id": "txn-xyz",
  "buyer_id": "buyer-456",
  "concept_id": "concept-123",
  "listing_window_id": "listing-abc",
  "market_context_id": "market-id",
  "price_paid": 11.48,
  "currency_code": "USD",
  "cashback_eligible": true,
  "cashback_amount": 1.38,
  "cashback_status": "pending",
  "purchased_at": "2025-12-04T10:00:00Z"
}
```

### 3.3 `produced_content`

Buyer submissions for cashback + performance feedback.

```sql
CREATE TABLE produced_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) NOT NULL UNIQUE,
  submitted_url text NOT NULL,                -- Buyer's TikTok/Instagram URL
  platform text NOT NULL,                     -- 'tiktok' | 'instagram' | 'youtube'
  performance_metrics jsonb,                  -- { views, likes, shares, comments }
  verified boolean DEFAULT false,             -- Has been verified as matching concept
  verification_notes text,                    -- Admin notes on verification
  submitted_at timestamp DEFAULT now(),
  verified_at timestamp,
  metrics_updated_at timestamp
);

-- Indexes
CREATE INDEX idx_produced_content_transaction ON produced_content(transaction_id);
CREATE INDEX idx_produced_content_verified ON produced_content(verified);
CREATE INDEX idx_produced_content_platform ON produced_content(platform);
```

**Example Record**:
```json
{
  "id": "prod-789",
  "transaction_id": "txn-xyz",
  "submitted_url": "https://www.tiktok.com/@indonesian_creator/video/987654321",
  "platform": "tiktok",
  "performance_metrics": {
    "views": 52000,
    "likes": 4800,
    "shares": 320,
    "comments": 85,
    "scraped_at": "2025-12-10T00:00:00Z"
  },
  "verified": true,
  "verification_notes": "Content matches concept, good adaptation",
  "submitted_at": "2025-12-07T15:00:00Z",
  "verified_at": "2025-12-08T10:00:00Z",
  "metrics_updated_at": "2025-12-10T00:00:00Z"
}
```

### 3.4 `viewer_overlays`

Subtitles and scene markers for concept viewer.

```sql
CREATE TABLE viewer_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  overlay_type text NOT NULL,                 -- 'subtitle' | 'scene_marker' | 'timing_cue'
  language_code text NOT NULL,                -- ISO 639-1
  content text NOT NULL,                      -- The text to display
  timestamp_start float,                      -- Seconds from video start
  timestamp_end float,                        -- When to hide
  created_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_viewer_overlays_concept ON viewer_overlays(concept_id);
CREATE INDEX idx_viewer_overlays_language ON viewer_overlays(language_code);
CREATE INDEX idx_viewer_overlays_type ON viewer_overlays(overlay_type);
CREATE INDEX idx_viewer_overlays_concept_lang ON viewer_overlays(concept_id, language_code);
```

**Example Records**:
```json
[
  {
    "id": "overlay-1",
    "concept_id": "concept-123",
    "overlay_type": "scene_marker",
    "language_code": "en",
    "content": "SETUP",
    "timestamp_start": 0.0,
    "timestamp_end": 2.0
  },
  {
    "id": "overlay-2",
    "concept_id": "concept-123",
    "overlay_type": "subtitle",
    "language_code": "id",
    "content": "Hei semuanya, um...",
    "timestamp_start": 0.0,
    "timestamp_end": 1.5
  },
  {
    "id": "overlay-3",
    "concept_id": "concept-123",
    "overlay_type": "scene_marker",
    "language_code": "en",
    "content": "PAYOFF",
    "timestamp_start": 2.0,
    "timestamp_end": 5.0
  },
  {
    "id": "overlay-4",
    "concept_id": "concept-123",
    "overlay_type": "subtitle",
    "language_code": "id",
    "content": "Ah, aku sudah menangis.",
    "timestamp_start": 2.0,
    "timestamp_end": 3.5
  }
]
```

---

## 4. Analytics Tables

### 4.1 `feature_importance_snapshots`

Track which features matter over time.

```sql
CREATE TABLE feature_importance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES model_versions(id) NOT NULL,
  snapshot_at timestamp DEFAULT now(),
  training_count int NOT NULL,                -- Ratings at time of snapshot
  top_positive_features jsonb NOT NULL,       -- Features that predict HIGH ratings
  top_negative_features jsonb NOT NULL,       -- Features that predict LOW ratings
  pruned_features text[],                     -- Features removed (correlation < threshold)
  notes text
);

-- Indexes
CREATE INDEX idx_feature_snapshots_model ON feature_importance_snapshots(model_version_id);
CREATE INDEX idx_feature_snapshots_date ON feature_importance_snapshots(snapshot_at DESC);
```

**Example Record**:
```json
{
  "id": "snapshot-1",
  "model_version_id": "model-v1",
  "snapshot_at": "2025-12-15T00:00:00Z",
  "training_count": 200,
  "top_positive_features": [
    { "feature": "script.replicability.score", "correlation": 0.82, "rank": 1 },
    { "feature": "script.humor.comedyTiming", "correlation": 0.65, "rank": 2 },
    { "feature": "comedyStyle.contrastMechanism.present", "correlation": 0.52, "rank": 3 },
    { "feature": "standalone.worksWithoutContext", "correlation": 0.45, "rank": 4 },
    { "feature": "flexibility.swappableCore", "correlation": 0.42, "rank": 5 }
  ],
  "top_negative_features": [
    { "feature": "trends.memeDependent", "correlation": -0.68, "rank": 1 },
    { "feature": "casting.actingSkillRequired", "correlation": -0.55, "rank": 2 },
    { "feature": "production.shotComplexity", "correlation": -0.42, "rank": 3 },
    { "feature": "audio.soundEffects_count", "correlation": -0.38, "rank": 4 },
    { "feature": "flexibility.industryLock", "correlation": -0.35, "rank": 5 }
  ],
  "pruned_features": [
    "visual.colorDiversity",
    "audio.musicGenre",
    "content.emotionalTone"
  ],
  "notes": "Pruned 15 features with |correlation| < 0.15"
}
```

### 4.2 `arbitrage_metrics`

Track cross-border concept movement.

```sql
CREATE TABLE arbitrage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  origin_market_id uuid REFERENCES market_contexts(id) NOT NULL,
  target_market_id uuid REFERENCES market_contexts(id) NOT NULL,
  time_to_first_sale interval,                -- How long until first sale
  total_sales int DEFAULT 0,                  -- Sales in this route
  conversion_rate float,                      -- Views / sales (if tracked)
  recorded_at timestamp DEFAULT now(),
  
  UNIQUE(concept_id, origin_market_id, target_market_id)
);

-- Indexes
CREATE INDEX idx_arbitrage_concept ON arbitrage_metrics(concept_id);
CREATE INDEX idx_arbitrage_origin ON arbitrage_metrics(origin_market_id);
CREATE INDEX idx_arbitrage_target ON arbitrage_metrics(target_market_id);
```

**Example Record**:
```json
{
  "id": "arb-1",
  "concept_id": "concept-123",
  "origin_market_id": "market-us",
  "target_market_id": "market-id",
  "time_to_first_sale": "4 hours",
  "total_sales": 3,
  "conversion_rate": 0.15,
  "recorded_at": "2025-12-05T00:00:00Z"
}
```

---

## 5. Visual Analysis Schema (Reference)

The `visual_analysis` JSONB column contains 170+ features. Full schema in [Feature Schema Reference](../reference/FEATURE_SCHEMA.md).

**Key Structure**:
```json
{
  "schema_version": "v3",
  "feature_count": 172,
  "analyzed_at": "2025-12-03T12:59:40Z",
  "analysis_model": "gemini-2.0-flash-vertex",
  
  "visual": { /* 13 fields */ },
  "audio": { /* 10 fields */ },
  "content": { /* 8 fields */ },
  "scenes": { /* 8 meta + N scene breakdowns */ },
  "script": {
    "conceptCore": "...",
    "humor": { /* 7 fields */ },
    "structure": { /* 10 fields */ },
    "emotional": { /* 4 fields */ },
    "replicability": { /* 6 fields */ },
    "originality": { /* 3 fields */ }
  },
  "casting": { /* 6 fields */ },
  "production": { /* 5 fields */ },
  "flexibility": { /* 6 fields */ },
  "comedyStyle": { /* 2 base + 8 sub-objects */ },
  "trends": { /* 9 fields */ },
  "brand": { /* 5 fields */ },
  "standalone": { /* 4 fields */ },
  "execution": { /* 4 fields */ },
  "technical": { /* 5 fields */ },
  "engagement": { /* 4 fields */ }
}
```

---

## 6. Entity Relationship Diagram

```
                                    ┌─────────────────┐
                                    │ market_contexts │
                                    └────────┬────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
    │    concepts     │◀───────────│analyzed_videos  │            │ listing_windows │
    └────────┬────────┘            └────────┬────────┘            └────────┬────────┘
             │                              │                              │
             │                              ▼                              │
             │                     ┌─────────────────┐                     │
             │                     │  video_ratings  │                     │
             │                     └─────────────────┘                     │
             │                                                             │
             │            ┌─────────────────┐                              │
             │            │ model_versions  │                              │
             │            └────────┬────────┘                              │
             │                     │                                       │
             │                     ▼                                       │
             │      ┌──────────────────────────┐                           │
             │      │feature_importance_snapshots│                         │
             │      └──────────────────────────┘                           │
             │                                                             │
             ├─────────────────────────────────────────────────────────────┤
             │                                                             │
             ▼                                                             ▼
    ┌─────────────────┐                                           ┌─────────────────┐
    │viewer_overlays  │                                           │  transactions   │
    └─────────────────┘                                           └────────┬────────┘
                                                                           │
                                                                           ▼
                                                                  ┌─────────────────┐
                                                                  │produced_content │
                                                                  └─────────────────┘
                                                                  
    ┌─────────────────┐
    │arbitrage_metrics│
    └─────────────────┘
```

---

## 7. Migration Scripts

### 7.1 Add Multi-Rater Support to Existing Table

```sql
-- Migration: Add rater columns to video_ratings
ALTER TABLE video_ratings 
ADD COLUMN IF NOT EXISTS rater_id uuid DEFAULT 'your-owner-uuid-here',
ADD COLUMN IF NOT EXISTS rater_type text DEFAULT 'owner';

-- Update existing records (all belong to owner)
UPDATE video_ratings 
SET rater_id = 'your-owner-uuid-here', rater_type = 'owner'
WHERE rater_id IS NULL;

-- Add constraint after data update
ALTER TABLE video_ratings 
ADD CONSTRAINT video_ratings_unique_rater UNIQUE(video_id, rater_id);
```

### 7.2 Create All New Tables

```sql
-- Run in order due to foreign key dependencies

-- 1. market_contexts (no dependencies)
CREATE TABLE IF NOT EXISTS market_contexts ( ... );

-- 2. model_versions (no dependencies)
CREATE TABLE IF NOT EXISTS model_versions ( ... );

-- 3. concepts (depends on analyzed_videos, market_contexts, model_versions)
CREATE TABLE IF NOT EXISTS concepts ( ... );

-- 4. listing_windows (depends on concepts, market_contexts)
CREATE TABLE IF NOT EXISTS listing_windows ( ... );

-- 5. transactions (depends on concepts, listing_windows, market_contexts)
CREATE TABLE IF NOT EXISTS transactions ( ... );

-- 6. produced_content (depends on transactions)
CREATE TABLE IF NOT EXISTS produced_content ( ... );

-- 7. viewer_overlays (depends on concepts)
CREATE TABLE IF NOT EXISTS viewer_overlays ( ... );

-- 8. feature_importance_snapshots (depends on model_versions)
CREATE TABLE IF NOT EXISTS feature_importance_snapshots ( ... );

-- 9. arbitrage_metrics (depends on concepts, market_contexts)
CREATE TABLE IF NOT EXISTS arbitrage_metrics ( ... );
```

---

## Related Documents

- [System Architecture Deep Dive](./01_SYSTEM_ARCHITECTURE.md)
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md)
- [Feature Schema Reference](../reference/FEATURE_SCHEMA.md)

---

*This document provides exhaustive detail on database schema. Refer to specific component documents for usage patterns.*
