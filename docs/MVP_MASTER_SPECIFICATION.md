# MVP Master Specification: Cross-Border Concept Arbitrage Marketplace

> **Version**: 1.0  
> **Created**: December 3, 2025  
> **Status**: Ground Specification  
> **Purpose**: Single source of truth for the complete MVP architecture

---

## CRITICAL CONTEXT FOR AI AGENTS

### What This Repository Is

This repository (`hagen_pg`) contains the **planning and data documentation** for a marketplace MVP. The actual codebase lives in a separate repository (`hagen`). This repository serves as:

1. **Ground Truth Documentation** - Complete specifications for the marketplace
2. **Training Data Context** - Understanding the 170+ features and rating system
3. **Integration Reference** - How to fetch and use this information from `hagen`

### Current State (December 2025)

| Asset | Status |
|-------|--------|
| Training-ready videos (v3 + rating) | 51 |
| Target for first model | 200 |
| Budget constraint | $100-1000 |
| Rater type | Solo (owner only) |
| Phase | Data collection (Phase 1, 25% complete) |

### Owner's Known Preferences

The preference model learns from ONE person's ratings. Their documented tastes:

**Likes:**
- Script-driven comedy with strong concept core
- Self-deprecating humor (business makes fun of itself)
- Low production value is fine ("authentic" look)
- One person can execute (solopreneur-friendly)
- Industry-agnostic formats (swappable premise)
- Strong payoff that subverts expectation

**Dislikes:**
- Meme-dependent content (needs context)
- Trending sounds (dates quickly)
- High production requirements
- Attractive-person dependent (relies on looks)
- Complex multi-person choreography

### Key Design Decisions Already Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| View-only | No downloads | Control distribution, enable overlays |
| 72-hour windows | Rotation | Creates urgency, ensures freshness |
| No re-activation | Archived = final | True scarcity |
| 3-5 per market cap | Prevents saturation | Market-specific limits |
| 10-15 global cap | Total scarcity | Cross-market limits |
| 10-15% cashback | Feedback loop | Incentivizes production data |
| Solo rater | Owner only | Learn one taste, not crowd |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Pricing Logic](#3-pricing-logic)
4. [Concept Viewer Structure](#4-concept-viewer-structure)
5. [API Endpoints](#5-api-endpoints)
6. [Model Training Pipeline](#6-model-training-pipeline)
7. [Evergreen Eligibility Logic](#7-evergreen-eligibility-logic)
8. [72-Hour Rotation Logic](#8-72-hour-rotation-logic)
9. [Subtitle Generation](#9-subtitle-generation)
10. [Cashback Flow](#10-cashback-flow)
11. [Initial Market Contexts](#11-initial-market-contexts)
12. [Implementation Priority](#12-implementation-priority)
13. [Success Metrics](#13-success-metrics)

---

## 1. System Overview

### What You're Building

A marketplace that arbitrages TikTok skit concepts between countries. Creators in one country can discover and replicate concepts that worked in another country—concepts they'd never find organically. The system learns your taste (what makes a concept "viable") and applies it to score incoming content.

### Core Loop

```
DISCOVERY → ANALYSIS → RATING → TRAINING → SCORING → LISTING → PURCHASE → PRODUCTION → PERFORMANCE FEEDBACK
```

### Key Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Platform access | View-only (no downloads) | Control distribution, enable overlays |
| Listing duration | 72 hours | Creates urgency, ensures freshness |
| Per-market cap | 3-5 sales | Prevents over-saturation |
| Global cap | 10-15 sales | Limits total exposure |
| Exclusivity | None | Concepts can sell in multiple markets |
| Re-activation | Never | Archived concepts stay archived |
| Pricing model | Continuous + PPP adjustment | Regional affordability |
| Cashback premium | 10-15% (12% default) | Incentivizes production feedback |

### Detailed Documentation

- [System Architecture Deep Dive](./components/01_SYSTEM_ARCHITECTURE.md)

---

## 2. Database Schema

### Existing Tables (No Changes Needed)

```sql
-- analyzed_videos: Primary video storage with Gemini analysis
-- video_ratings: Human ratings (ground truth for training)
```

### Modified Tables

```sql
-- ADD to video_ratings (for future multi-rater)
ALTER TABLE video_ratings 
ADD COLUMN rater_id uuid DEFAULT 'your-user-id-here',
ADD COLUMN rater_type text DEFAULT 'owner'; -- 'owner' | 'agent'
```

### New Tables: Core

```sql
-- MARKET CONTEXTS: Geographic/demographic segmentation
CREATE TABLE market_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  region_name text NOT NULL,
  primary_language text NOT NULL,
  purchasing_power_index float NOT NULL,
  subtitle_priority int DEFAULT 5,
  currency_code text NOT NULL,
  notes text,
  created_at timestamp DEFAULT now()
);

-- MODEL VERSIONS: Track trained models
CREATE TABLE model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag text NOT NULL UNIQUE,
  trained_at timestamp NOT NULL,
  training_video_count int NOT NULL,
  feature_weights jsonb NOT NULL,
  accuracy_metrics jsonb NOT NULL,
  notes text,
  is_active boolean DEFAULT false
);

-- CONCEPTS: Abstracted from videos
CREATE TABLE concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video_id uuid REFERENCES analyzed_videos(id),
  concept_core text NOT NULL,
  template_description text,
  required_elements text[],
  variable_elements text[],
  origin_market_id uuid REFERENCES market_contexts(id),
  virality_score float,
  model_version_id uuid REFERENCES model_versions(id),
  evergreen_eligible boolean DEFAULT true,
  archived boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);
```

### New Tables: Marketplace

```sql
-- LISTING WINDOWS: 72-hour rotation
CREATE TABLE listing_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  market_context_id uuid REFERENCES market_contexts(id) NOT NULL,
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  base_price_usd float NOT NULL,
  listed_price float NOT NULL,
  per_market_cap int DEFAULT 5,
  global_cap int DEFAULT 15,
  sold_count int DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now(),
  UNIQUE(concept_id, market_context_id, window_start)
);

-- TRANSACTIONS: Purchase records
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  listing_window_id uuid REFERENCES listing_windows(id) NOT NULL,
  market_context_id uuid REFERENCES market_contexts(id) NOT NULL,
  price_paid float NOT NULL,
  currency_code text NOT NULL,
  cashback_eligible boolean DEFAULT true,
  cashback_amount float,
  cashback_status text DEFAULT 'pending',
  purchased_at timestamp DEFAULT now()
);

-- PRODUCED CONTENT: Cashback submissions + performance loop
CREATE TABLE produced_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) NOT NULL,
  submitted_url text NOT NULL,
  platform text NOT NULL,
  performance_metrics jsonb,
  verified boolean DEFAULT false,
  submitted_at timestamp DEFAULT now()
);

-- VIEWER OVERLAYS: Subtitles + scene markers
CREATE TABLE viewer_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  overlay_type text NOT NULL,
  language_code text NOT NULL,
  content text NOT NULL,
  timestamp_start float,
  timestamp_end float,
  created_at timestamp DEFAULT now()
);
```

### New Tables: Analytics

```sql
-- FEATURE IMPORTANCE SNAPSHOTS
CREATE TABLE feature_importance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES model_versions(id) NOT NULL,
  snapshot_at timestamp DEFAULT now(),
  training_count int NOT NULL,
  top_positive_features jsonb NOT NULL,
  top_negative_features jsonb NOT NULL,
  pruned_features text[],
  notes text
);

-- ARBITRAGE ANALYTICS
CREATE TABLE arbitrage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES concepts(id) NOT NULL,
  origin_market_id uuid REFERENCES market_contexts(id) NOT NULL,
  target_market_id uuid REFERENCES market_contexts(id) NOT NULL,
  time_to_first_sale interval,
  total_sales int DEFAULT 0,
  conversion_rate float,
  recorded_at timestamp DEFAULT now()
);
```

### Detailed Documentation

- [Database Schema Deep Dive](./components/02_DATABASE_SCHEMA.md)

---

## 3. Pricing Logic

```typescript
interface PricingInput {
  viralityScore: number;          // 0-10 from model
  basePriceUsd: number;           // Default: $5-50 based on virality
  purchasingPowerIndex: number;   // From market_contexts
  agentModifier?: number;         // Optional ±20% adjustment
}

function calculateListedPrice(input: PricingInput): number {
  const { viralityScore, basePriceUsd, purchasingPowerIndex, agentModifier = 0 } = input;
  
  // Base price scales with virality
  const viralityAdjustedBase = basePriceUsd + (viralityScore * 5);
  
  // Adjust for purchasing power
  const pppAdjusted = viralityAdjustedBase * purchasingPowerIndex;
  
  // Agent modifier (±20% max)
  const clampedModifier = Math.max(-0.2, Math.min(0.2, agentModifier));
  const agentAdjusted = pppAdjusted * (1 + clampedModifier);
  
  // Add 12% premium for cashback
  const withPremium = agentAdjusted * 1.12;
  
  return Math.round(withPremium * 100) / 100;
}

function calculateCashback(pricePaid: number): number {
  return Math.round(pricePaid * 0.12 * 100) / 100;
}
```

### Detailed Documentation

- [Pricing Logic Deep Dive](./components/03_PRICING_LOGIC.md)

---

## 4. Concept Viewer Structure

```typescript
interface ConceptViewerData {
  // Video playback
  videoUrl: string;
  
  // Script panel
  script: {
    transcript: string;
    visualTranscript: string;
    conceptCore: string;
  };
  
  // Production panel
  production: {
    minimumPeople: number;
    timeToRecreate: string;
    equipmentNeeded: string[];
    shotComplexity: number;
  };
  
  // Casting panel
  casting: {
    actingSkillRequired: number;
    personalityDependency: number;
    castingNotes: string;
  };
  
  // Flexibility panel
  flexibility: {
    industryExamples: string[];
    swappableCore: boolean;
    swapExamples: string;
  };
  
  // Overlays
  subtitles: ViewerOverlay[];
  sceneMarkers: ViewerOverlay[];
  
  // Derived checklist
  productionChecklist: string[];
}
```

### Detailed Documentation

- [Concept Viewer Deep Dive](./components/04_CONCEPT_VIEWER.md)

---

## 5. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/concepts` | GET | List available concepts with filters |
| `/api/concepts/:id` | GET | Get concept viewer data |
| `/api/concepts/:id/purchase` | POST | Purchase concept |
| `/api/listings` | GET | Active listings by market |
| `/api/listings/rotate` | POST | Cron: Archive expired, create new |
| `/api/transactions/:id/submit-content` | POST | Submit produced content |
| `/api/markets` | GET | List market contexts |
| `/api/model/predict` | POST | Get virality score |
| `/api/model/versions` | GET | List model versions |
| `/api/overlays/:conceptId/:language` | GET | Get subtitles |
| `/api/analytics/arbitrage` | GET | Cross-border metrics |

### Detailed Documentation

- [API Endpoints Deep Dive](./components/05_API_ENDPOINTS.md)

---

## 6. Model Training Pipeline

```
INPUT: analysis_export_2025-12-03.json
       - 51+ videos with v3 analysis AND human ratings
       - 170+ features per video
       - Target: human_rating.overall (0-1)

PROCESS:
1. Filter to schema_version = 'v3' only
2. Flatten nested features to dot notation
3. Handle categorical → one-hot encoding
4. Handle arrays → count or presence flags
5. Run correlation analysis
6. Train regression model
7. Output feature_weights and accuracy_metrics

OUTPUT: 
{
  "version_tag": "v1.0",
  "feature_weights": { "script.replicability.score": 0.82, ... },
  "accuracy_metrics": { "mae": 0.12, "rmse": 0.15, "r2": 0.68 }
}

MILESTONES:
- 100 ratings: First correlation analysis
- 200 ratings: First trained model (v1.0)
- 300 ratings: Refinement
- 500 ratings: Stable production model
```

### Detailed Documentation

- [Model Training Deep Dive](./components/06_MODEL_TRAINING.md)

---

## 7. Evergreen Eligibility Logic

```typescript
function isEvergreenEligible(analysis: DeepAnalysis): boolean {
  const { trends } = analysis;
  
  if (trends.memeDependent) return false;
  if (trends.usesPremadeSound && trends.soundEssential) return false;
  if (trends.trendLifespan === 'dead-meme' || trends.trendLifespan === 'dying') return false;
  if (trends.insideJokeDependency > 7) return false;
  if (trends.culturalSpecificity > 8) return false;
  
  return true;
}
```

### Detailed Documentation

- [Evergreen Logic Deep Dive](./components/07_EVERGREEN_LOGIC.md)

---

## 8. 72-Hour Rotation Logic

```typescript
async function rotateListings() {
  const now = new Date();
  
  // 1. Expire old listings
  await db.listingWindows.updateMany({
    where: { window_end: { lt: now }, status: 'active' },
    data: { status: 'expired' }
  });
  
  // 2. Archive expired listings
  await db.listingWindows.updateMany({
    where: { status: 'expired' },
    data: { status: 'archived' }
  });
  
  // 3. Mark concepts as archived if all listings archived
  // 4. Create new listings for concepts in queue
}
```

### Detailed Documentation

- [Rotation Logic Deep Dive](./components/08_ROTATION_LOGIC.md)

---

## 9. Subtitle Generation

```typescript
async function generateSubtitles(conceptId: string, targetLanguage: string) {
  const concept = await db.concepts.findUnique({ 
    where: { id: conceptId },
    include: { source_video: true }
  });
  
  const transcript = concept.source_video.visual_analysis.script.transcript;
  const scenes = concept.source_video.visual_analysis.scenes.sceneBreakdown;
  
  const translated = await translateApi.translate(transcript, targetLanguage);
  
  const overlays = scenes.map(scene => ({
    concept_id: conceptId,
    overlay_type: 'subtitle',
    language_code: targetLanguage,
    content: translateSegment(scene.audioContent, translated),
    timestamp_start: parseTimestamp(scene.timestamp),
    timestamp_end: parseTimestamp(scenes[scene.sceneNumber]?.timestamp)
  }));
  
  await db.viewerOverlays.createMany({ data: overlays });
}
```

### Detailed Documentation

- [Subtitle Generation Deep Dive](./components/09_SUBTITLE_GENERATION.md)

---

## 10. Cashback Flow

```
1. PURCHASE: Buyer pays listed_price (includes 12% premium)
2. PRODUCE: Buyer creates their version
3. SUBMIT: Buyer submits URL via API
4. VERIFY: Manual or automated check
5. CASHBACK: Process refund
6. PERFORMANCE: Scrape/request metrics (future)
```

### Detailed Documentation

- [Cashback Flow Deep Dive](./components/10_CASHBACK_FLOW.md)

---

## 11. Initial Market Contexts

```sql
INSERT INTO market_contexts VALUES
('US', 'United States', 'en', 1.0, 1, 'USD'),
('GB', 'United Kingdom', 'en', 0.85, 2, 'GBP'),
('ID', 'Indonesia', 'id', 0.25, 3, 'IDR'),
('BR', 'Brazil', 'pt', 0.35, 4, 'BRL'),
('MX', 'Mexico', 'es', 0.40, 5, 'MXN'),
('PH', 'Philippines', 'en', 0.20, 6, 'PHP'),
('IN', 'India', 'hi', 0.18, 7, 'INR'),
('DE', 'Germany', 'de', 0.90, 8, 'EUR'),
('FR', 'France', 'fr', 0.85, 9, 'EUR'),
('ES', 'Spain', 'es', 0.70, 10, 'EUR');
```

### Detailed Documentation

- [Market Contexts Deep Dive](./components/11_MARKET_CONTEXTS.md)

---

## 12. Implementation Priority

### Phase 1: Data Foundation (Now)
1. Add `rater_id` column to `video_ratings`
2. Add `schema_version` to all new `deep_analysis` exports
3. Create `market_contexts` table and seed data
4. Create `model_versions` table structure
5. Continue rating videos toward 200 target

### Phase 2: Model Training (At 200 ratings)
1. Run correlation analysis
2. Train first model (v1.0)
3. Store in `model_versions`
4. Create `feature_importance_snapshots`

### Phase 3: Marketplace Core (After model)
1. Create `concepts` table
2. Create `listing_windows` table
3. Build rotation cron job
4. Create `transactions` table
5. Build purchase flow

### Phase 4: Buyer Experience
1. Create `viewer_overlays` table
2. Build concept viewer component
3. Implement subtitle generation
4. Build production checklist

### Phase 5: Feedback Loop
1. Create `produced_content` table
2. Build submission flow
3. Implement cashback logic
4. (Future) Performance scraping

### Detailed Documentation

- [Implementation Phases Deep Dive](./components/12_IMPLEMENTATION_PHASES.md)

---

## 13. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Model accuracy (MAE) | < 0.15 | Cross-validation |
| Concept velocity | 50% sold in 48h | sold / created |
| Cross-border ratio | 3+ markets/concept | avg markets sold |
| Cashback submission | 30%+ | submissions / transactions |
| Buyer retention | 40%+ | buyers with 2+ purchases |

### Detailed Documentation

- [Success Metrics Deep Dive](./components/13_SUCCESS_METRICS.md)

---

## Related Documents

### Component Deep Dives
- [01 - System Architecture](./components/01_SYSTEM_ARCHITECTURE.md)
- [02 - Database Schema](./components/02_DATABASE_SCHEMA.md)
- [03 - Pricing Logic](./components/03_PRICING_LOGIC.md)
- [04 - Concept Viewer](./components/04_CONCEPT_VIEWER.md)
- [05 - API Endpoints](./components/05_API_ENDPOINTS.md)
- [06 - Model Training](./components/06_MODEL_TRAINING.md)
- [07 - Evergreen Logic](./components/07_EVERGREEN_LOGIC.md)
- [08 - Rotation Logic](./components/08_ROTATION_LOGIC.md)
- [09 - Subtitle Generation](./components/09_SUBTITLE_GENERATION.md)
- [10 - Cashback Flow](./components/10_CASHBACK_FLOW.md)
- [11 - Market Contexts](./components/11_MARKET_CONTEXTS.md)
- [12 - Implementation Phases](./components/12_IMPLEMENTATION_PHASES.md)
- [13 - Success Metrics](./components/13_SUCCESS_METRICS.md)

### Reference Documents
- [Feature Schema Reference](./reference/FEATURE_SCHEMA.md)
- [Data Export Format](./reference/DATA_EXPORT_FORMAT.md)
- [Existing System Context](../AI_HANDOFF.md)

---

*This document serves as the ground specification. All component documents expand on sections defined here.*
