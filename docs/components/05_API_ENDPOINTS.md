# Component 05: API Endpoints Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: API Endpoints
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on all API endpoints, including request/response schemas, authentication, error handling, and example usage.

---

## IMPORTANT: Existing System Context

This marketplace builds on an **existing video analysis and rating system**. Before implementing new endpoints, understand what already exists.

### Current System Architecture

```
Current System (ALREADY BUILT):
┌─────────────────────────────────────────────────────────────┐
│ TikTok URL → Import → GCS Upload → Gemini Analysis → Rating │
└─────────────────────────────────────────────────────────────┘

New Marketplace Layer (TO BUILD):
┌─────────────────────────────────────────────────────────────┐
│ Rated Videos → Abstract Concepts → List → Purchase → View   │
└─────────────────────────────────────────────────────────────┘
```

The new marketplace endpoints consume data from existing endpoints—they don't replace them.

---

## 1. Endpoint Summary

### Existing Endpoints (From Current System)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tiktok` | POST | Import video from TikTok URL |
| `/api/videos/upload` | POST | Upload video file to GCS |
| `/api/videos/reanalyze` | POST | Run deep Gemini analysis |
| `/api/videos/analyze` | GET | List/retrieve videos with analysis |
| `/api/ratings` | GET, POST | List/save human ratings |
| `/api/predict-v2` | POST | Get AI prediction before rating |

### New Marketplace Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/profile` | GET, PUT | Get/update user profile |
| `/api/profile/onboarding` | POST | AI chat onboarding |
| `/api/profile/social-sync` | POST | Connect TikTok/IG for brand profiling |
| `/api/profile/resync` | POST | Re-analyze connected social account |
| `/api/recommendations` | GET | Get personalized recommendations |
| `/api/recommendations/refine` | POST | Mini-chat refinement |
| `/api/concepts/:id` | GET | Get concept details |
| `/api/concepts/:id/viewer` | GET | Get viewer data (purchased only) |
| `/api/concepts/:id/purchase` | POST | Purchase concept |
| `/api/transactions` | GET | List buyer's transactions |
| `/api/transactions/:id` | GET | Get transaction details |
| `/api/transactions/:id/submit-content` | POST | Submit produced content |
| `/api/markets` | GET | List market contexts |
| `/api/model/match` | POST | Get match percentage |
| `/api/model/versions` | GET | List model versions |
| `/api/overlays/:conceptId/:language` | GET | Get subtitles |
| `/api/overlays/:conceptId/:language` | POST | Generate subtitles |
| `/api/analytics/arbitrage` | GET | Cross-border metrics |

---

## 1.5 EXISTING ENDPOINTS (Already Implemented)

These endpoints exist in the current codebase. Document them here for completeness.

### POST `/api/tiktok`

Import a TikTok video by URL.

**Request Body**:
```typescript
interface TikTokImportRequest {
  url: string;  // TikTok video URL
}
```

**Response**:
```typescript
interface TikTokImportResponse {
  success: boolean;
  video: {
    id: string;
    tiktok_id: string;
    author: string;
    description: string;
    gcs_uri: string;
    created_at: string;
  };
}
```

**What It Does**:
1. Calls Supadata API to fetch TikTok metadata
2. Downloads video file
3. Uploads to GCS (`gs://hagen-video-analysis/videos/{uuid}.mp4`)
4. Creates record in `analyzed_videos` table
5. Does NOT run deep analysis (that's a separate step)

---

### POST `/api/videos/reanalyze`

Run deep Gemini analysis on a video.

**Request Body**:
```typescript
interface ReanalyzeRequest {
  videoId: string;
  force?: boolean;  // Re-run even if already analyzed
}
```

**Response**:
```typescript
interface ReanalyzeResponse {
  success: boolean;
  video_id: string;
  analysis: DeepAnalysis;  // Full 170+ feature schema
  feature_count: number;   // Should be 100+ for v3
  version: 'v0' | 'v1' | 'v2' | 'v3';
}
```

**What It Does**:
1. Fetches video from GCS
2. Sends to Gemini 2.0 Flash with structured prompt
3. Extracts 170+ features into `visual_analysis` JSON
4. Updates `analyzed_videos.visual_analysis`
5. Sets `feature_count` for version detection

**Key Note**: This is expensive (~$0.10-0.30 per video). Don't call unnecessarily.

---

### GET `/api/ratings`

List rated videos with their analysis.

**Query Parameters**:
```typescript
interface ListRatingsQuery {
  limit?: number;     // Default 50, max 100
  offset?: number;
  videoId?: string;   // Filter by specific video
}
```

**Response**:
```typescript
interface ListRatingsResponse {
  ratings: {
    id: string;
    video_id: string;
    video: {
      id: string;
      tiktok_id: string;
      author: string;
      visual_analysis: DeepAnalysis;  // Full analysis
    };
    hook: number;           // 0-1
    pacing: number;         // 0-1
    payoff: number;         // 0-1
    originality: number;    // 0-1
    rewatchable: number;    // 0-1
    overall_score: number;  // Computed weighted average
    notes: string;
    tags: string[];
    created_at: string;
  }[];
}
```

**Current Data State (as of Dec 3, 2025)**:
- ~50 rated videos total
- ~51 videos with v3 analysis AND ratings (the training set)

---

### POST `/api/ratings`

Save a human rating for a video.

**Request Body**:
```typescript
interface CreateRatingRequest {
  video_id: string;
  hook: number;        // 0-1
  pacing: number;
  payoff: number;
  originality: number;
  rewatchable: number;
  notes?: string;
  tags?: string[];
}
```

**Response**:
```typescript
interface CreateRatingResponse {
  id: string;
  video_id: string;
  overall_score: number;  // Computed
  created_at: string;
}
```

**Important**: The `overall_score` is the TARGET VARIABLE for model training. It's what we're trying to predict.

---

### POST `/api/predict-v2`

Get AI prediction before human rating.

**Request Body**:
```typescript
interface PredictRequest {
  video_id: string;
}
```

**Response**:
```typescript
interface PredictResponse {
  prediction: {
    hook: number;
    pacing: number;
    payoff: number;
    originality: number;
    rewatchable: number;
    overall: number;
    confidence: number;
  };
  reasoning: string;
}
```

**Note**: This prediction is stored in `ai_prediction` field and compared post-rating to measure AI accuracy.

---

## 2. Profile & Recommendations API

### GET `/api/profile`

Get the authenticated user's profile.

**Response**:
```typescript
interface UserProfile {
  id: string;
  business_description: string;    // "Coffee shop in Austin"
  goals: string[];                 // ["More foot traffic", "Brand awareness"]
  constraints: string[];           // ["Just me, no budget for actors"]
  industry_tags: string[];         // ["food", "retail", "local"]
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}
```

### POST `/api/profile/onboarding`

AI chat endpoint for building user profile through conversation.

**Request Body**:
```typescript
interface OnboardingRequest {
  message: string;                 // User's chat message
  conversation_id?: string;        // Continue existing conversation
}
```

**Response**:
```typescript
interface OnboardingResponse {
  conversation_id: string;
  response: string;                // AI response
  profile_updates?: Partial<UserProfile>;  // Any extracted profile data
  onboarding_complete: boolean;    // True when profile is ready
  next_prompt?: string;            // Suggested next question
}
```

### POST `/api/profile/social-sync`

Connect TikTok or Instagram account for automatic brand profiling.

**Authentication**: Required

**Request Body**:
```typescript
interface SocialSyncRequest {
  platform: 'tiktok' | 'instagram';
  handle: string;              // @handle or full URL
}
```

**Response**:
```typescript
interface SocialSyncResponse {
  success: boolean;
  profile_updates: {
    socialLinks: {
      tiktok?: string;
      instagram?: string;
    };
    socialAnalysis: SocialAnalysis;
  };
  profile_completeness: number;  // Updated 0-100 score
  inferred_data: {
    businessType?: string;
    teamSize?: string;
    toneStyle?: string[];
    contentExperience?: string;
  };
}

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

**Example Response**:
```json
{
  "success": true,
  "profile_updates": {
    "socialLinks": {
      "tiktok": "@austincoffee"
    },
    "socialAnalysis": {
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
    }
  },
  "profile_completeness": 75,
  "inferred_data": {
    "businessType": "Coffee shop",
    "teamSize": "Small team (2-3)",
    "toneStyle": ["casual", "playful"],
    "contentExperience": "Some experience"
  }
}
```

**Error Responses**:
```typescript
// 400 Bad Request - Invalid handle
{ "error": "BAD_REQUEST", "message": "Could not find account @invalid_handle" }

// 400 Bad Request - Private account
{ "error": "BAD_REQUEST", "message": "Account is private - unable to analyze" }

// 429 Rate Limited - Too many syncs
{ "error": "RATE_LIMITED", "message": "Please wait before syncing again" }
```

---

### POST `/api/profile/resync`

Re-analyze a connected social account to update profile data.

**Authentication**: Required

**Request Body**:
```typescript
interface ResyncRequest {
  platform: 'tiktok' | 'instagram';
}
```

**Response**: Same as `SocialSyncResponse`

**Notes**:
- Can be called to refresh stale data
- Rate limited to once per 24 hours per platform
- Updates profile completeness score

---

### POST `/api/recommendations/refine`

Refine recommendations via mini-chat without full onboarding.

**Authentication**: Required

**Request Body**:
```typescript
interface RefineRequest {
  message: string;               // User's refinement message
  context?: {
    currentPage: 'dashboard' | 'concept-detail';
    conceptId?: string;          // If viewing specific concept
  };
}
```

**Response**:
```typescript
interface RefineResponse {
  response: string;              // AI acknowledgment
  filters_applied?: {
    difficulty?: 'easy' | 'medium' | 'advanced';
    peopleNeeded?: number;
    industry?: string[];
  };
  profile_updates?: Partial<UserProfile>;
  refresh_recommendations: boolean;
}
```

**Example Flow**:
```json
// Request
{
  "message": "Show me easier stuff",
  "context": { "currentPage": "dashboard" }
}

// Response
{
  "response": "Got it - filtering for easy-to-film concepts",
  "filters_applied": {
    "difficulty": "easy"
  },
  "refresh_recommendations": true
}
```

---

### GET `/api/recommendations`

Get personalized concept recommendations based on user profile.

**Query Parameters**:
```typescript
interface RecommendationsQuery {
  page?: number;
  per_page?: number;              // Max 20
}
```

**Response**:
```typescript
interface RecommendationsResponse {
  recommendations: RecommendationItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface RecommendationItem {
  id: string;
  concept_core: string;
  match_percentage: number;       // 0-100, personalized to user
  why_it_fits: string[];          // Plain language reasons
  quick_facts: {
    people_needed: string;        // "Just you" or "2-3 people"
    film_time: string;            // "15 minutes"
    difficulty: string;           // "Easy" | "Medium" | "Advanced"
  };
  listing: {
    listed_price: number;
    display_price: DisplayPrice;
    available_count: number;
  };
  created_at: string;
}
```

**Example Response**:
```json
{
  "recommendations": [
    {
      "id": "concept-123",
      "concept_core": "Employee dreads admitting mistake, cut to calm reaction",
      "match_percentage": 94,
      "why_it_fits": [
        "Works great for food businesses",
        "You can film this yourself",
        "Perfect for driving local traffic"
      ],
      "quick_facts": {
        "people_needed": "Just you",
        "film_time": "15 minutes",
        "difficulty": "Easy"
      },
      "listing": {
        "listed_price": 29.40,
        "display_price": {
          "amount": 29.40,
          "currency": "USD",
          "formatted": "$29.40"
        },
        "available_count": 3
      },
      "created_at": "2025-12-03T15:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 10,
    "total": 45,
    "total_pages": 5
  }
}
```

---

### GET `/api/concepts/:id`

Get full concept details (public info, no viewer data).

**Authentication**: Required (for personalized match %)

**Response**:
```typescript
interface ConceptDetails {
  id: string;
  concept_core: string;
  template_description: string;
  required_elements: string[];
  variable_elements: string[];
  match_percentage: number;        // Personalized to user (0-100)
  why_it_fits: string[];           // Plain language fit reasons
  evergreen_eligible: boolean;

  // Quick facts (plain language)
  quick_facts: {
    people_needed: string;         // "Just you" or "2-3 people"
    film_time: string;             // "About 15 minutes"
    difficulty: string;            // "Easy to film"
    works_for: string[];           // ["Restaurants", "Retail", "Any business"]
  };

  // Current listing for user's market
  listing: {
    listed_price: number;
    display_price: DisplayPrice;
    available_count: number;
  };

  created_at: string;
}
```

**Example Response**:
```json
{
  "id": "concept-123",
  "concept_core": "Employee dreads admitting mistake to kitchen, cut to deadpan reaction",
  "template_description": "Show person anxious about admitting mistake, cut to unexpected reaction",
  "required_elements": ["Person expressing anxiety", "Situation of admitting fault", "Cut to reaction"],
  "variable_elements": ["Type of mistake", "Who they're telling", "The reaction style"],
  "match_percentage": 94,
  "why_it_fits": [
    "Works great for food businesses",
    "You can film this yourself",
    "Perfect for driving local traffic"
  ],
  "evergreen_eligible": true,
  "quick_facts": {
    "people_needed": "Just you",
    "film_time": "About 15 minutes",
    "difficulty": "Easy to film",
    "works_for": ["Restaurants", "Retail", "Office"]
  },
  "listing": {
    "listed_price": 29.40,
    "display_price": {
      "amount": 29.40,
      "currency": "USD",
      "formatted": "$29.40"
    },
    "available_count": 3
  },
  "created_at": "2025-12-03T15:00:00Z"
}
```

---

### GET `/api/concepts/:id/viewer`

Get full viewer data for a purchased concept.

**Authentication**: Required (buyer must own concept)

**Query Parameters**:
```typescript
interface ViewerQuery {
  language?: string;    // ISO 639-1, defaults to market's primary language
}
```

**Response**: See [ConceptViewerData](./04_CONCEPT_VIEWER.md#2-data-interfaces)

**Error Responses**:
```typescript
// 401 Unauthorized - Not logged in
{ "error": "UNAUTHORIZED", "message": "Authentication required" }

// 403 Forbidden - Doesn't own concept
{ "error": "FORBIDDEN", "message": "Concept not purchased" }

// 404 Not Found - Concept doesn't exist
{ "error": "NOT_FOUND", "message": "Concept not found" }
```

---

### POST `/api/concepts/:id/purchase`

Purchase a concept.

**Authentication**: Required

**Request Body**:
```typescript
interface PurchaseRequest {
  market_id: string;          // Which market to purchase for
  currency_code?: string;     // Payment currency (defaults to market's)
}
```

**Response**:
```typescript
interface PurchaseResponse {
  transaction: {
    id: string;
    concept_id: string;
    price_paid: number;
    currency_code: string;
    cashback_amount: number;
    purchased_at: string;
  };
  viewer_access_url: string;  // URL to concept viewer
}
```

**Error Responses**:
```typescript
// 400 Bad Request - Invalid market
{ "error": "BAD_REQUEST", "message": "Invalid market_id" }

// 409 Conflict - Already purchased
{ "error": "CONFLICT", "message": "Already purchased this concept" }

// 410 Gone - Sold out or expired
{ "error": "GONE", "message": "Listing no longer available" }

// 402 Payment Required - Payment failed
{ "error": "PAYMENT_REQUIRED", "message": "Payment failed", "details": {...} }
```

**Example Request**:
```bash
curl -X POST "https://api.example.com/api/concepts/concept-123/purchase" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "market-id"}'
```

---

## 3. Internal/Admin API

### POST `/api/admin/listings/rotate`

Rotate listings (cron job endpoint). Internal use only.

**Authentication**: Admin or cron secret required

**Request Body**:
```typescript
interface RotateRequest {
  dry_run?: boolean;        // Preview changes without applying
}
```

**Response**:
```typescript
interface RotateResponse {
  expired_count: number;
  archived_count: number;
  concepts_archived: string[];
  details?: RotateDetail[];   // If dry_run
}
```

> **Note**: The customer-facing app uses `/api/recommendations` instead of browsing listings directly. This admin endpoint is for internal catalog management only.

---

## 4. Transactions API

### GET `/api/transactions`

List buyer's transactions.

**Authentication**: Required

**Query Parameters**:
```typescript
interface ListTransactionsQuery {
  cashback_status?: 'pending' | 'claimed' | 'expired';
  page?: number;
  per_page?: number;
}
```

**Response**:
```typescript
interface ListTransactionsResponse {
  transactions: TransactionDetails[];
  pagination: Pagination;
  summary: {
    total_spent: number;
    total_cashback_earned: number;
    pending_cashback: number;
  };
}

interface TransactionDetails {
  id: string;
  concept: ConceptSummary;
  market: MarketContext;
  price_paid: number;
  currency_code: string;
  cashback_eligible: boolean;
  cashback_amount: number;
  cashback_status: 'pending' | 'claimed' | 'expired';
  purchased_at: string;
  produced_content?: {
    id: string;
    submitted_url: string;
    verified: boolean;
    submitted_at: string;
  };
}
```

---

### POST `/api/transactions/:id/submit-content`

Submit produced content for cashback.

**Authentication**: Required (must own transaction)

**Request Body**:
```typescript
interface SubmitContentRequest {
  url: string;              // TikTok/Instagram URL of produced content
  platform: 'tiktok' | 'instagram' | 'youtube';
  notes?: string;           // Optional notes about adaptation
}
```

**Response**:
```typescript
interface SubmitContentResponse {
  produced_content: {
    id: string;
    submitted_url: string;
    platform: string;
    submitted_at: string;
  };
  cashback: {
    status: 'pending_verification';
    amount: number;
    estimated_payout_date?: string;
  };
}
```

**Error Responses**:
```typescript
// 400 Bad Request - Invalid URL
{ "error": "BAD_REQUEST", "message": "Invalid URL format" }

// 409 Conflict - Already submitted
{ "error": "CONFLICT", "message": "Content already submitted for this transaction" }

// 410 Gone - Cashback expired
{ "error": "GONE", "message": "Cashback period expired" }
```

---

## 5. Markets API

### GET `/api/markets`

List all market contexts.

**Response**:
```typescript
interface ListMarketsResponse {
  markets: MarketContext[];
}

interface MarketContext {
  id: string;
  country_code: string;
  region_name: string;
  primary_language: string;
  purchasing_power_index: number;
  currency_code: string;
  subtitle_priority: number;
}
```

**Example Response**:
```json
{
  "markets": [
    {
      "id": "market-us",
      "country_code": "US",
      "region_name": "United States",
      "primary_language": "en",
      "purchasing_power_index": 1.0,
      "currency_code": "USD",
      "subtitle_priority": 1
    },
    {
      "id": "market-id",
      "country_code": "ID",
      "region_name": "Indonesia",
      "primary_language": "id",
      "purchasing_power_index": 0.25,
      "currency_code": "IDR",
      "subtitle_priority": 3
    }
  ]
}
```

---

## 6. Model API

### POST `/api/model/match`

Get match percentage for a concept and user.

**Authentication**: Required

**Request Body**:
```typescript
interface MatchRequest {
  concept_id: string;
  user_id?: string;           // Defaults to authenticated user
}
```

**Response**:
```typescript
interface MatchResponse {
  match_percentage: number;   // 0-100
  concept_score: number;      // 0-1 (intrinsic quality)
  profile_fit_score: number;  // 0-1 (user fit)
  why_it_fits: string[];      // Plain language reasons
  considerations: string[];   // Things to consider
  model_version: string;
}
```

---

### GET `/api/model/versions`

List model versions.

**Response**:
```typescript
interface ListModelVersionsResponse {
  versions: {
    id: string;
    version_tag: string;
    trained_at: string;
    training_video_count: number;
    is_active: boolean;
    accuracy_metrics: {
      mae: number;
      rmse: number;
      r2: number;
    };
  }[];
  active_version: string;
}
```

---

## 7. Overlays API

### GET `/api/overlays/:conceptId/:language`

Get overlays for a concept in a specific language.

**Response**:
```typescript
interface GetOverlaysResponse {
  concept_id: string;
  language: string;
  overlays: ViewerOverlay[];
  generated_at: string;
}
```

---

### POST `/api/overlays/:conceptId/:language`

Generate overlays for a concept in a specific language.

**Authentication**: Admin only

**Response**:
```typescript
interface GenerateOverlaysResponse {
  concept_id: string;
  language: string;
  overlays_created: number;
  details: {
    subtitles: number;
    scene_markers: number;
    timing_cues: number;
  };
}
```

---

## 8. Analytics API

### GET `/api/analytics/arbitrage`

Get cross-border arbitrage metrics.

**Authentication**: Admin only

**Query Parameters**:
```typescript
interface ArbitrageQuery {
  origin_market?: string;
  target_market?: string;
  date_from?: string;
  date_to?: string;
}
```

**Response**:
```typescript
interface ArbitrageResponse {
  routes: {
    origin_market: MarketContext;
    target_market: MarketContext;
    concept_count: number;
    total_sales: number;
    avg_time_to_first_sale: string;
    conversion_rate: number;
  }[];
  top_concepts: {
    concept: ConceptSummary;
    markets_sold_in: number;
    total_revenue: number;
  }[];
}
```

---

## 9. Error Handling

### Standard Error Response

```typescript
interface ErrorResponse {
  error: string;            // Error code
  message: string;          // Human-readable message
  details?: unknown;        // Additional context
  request_id?: string;      // For debugging
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Not allowed |
| `NOT_FOUND` | 404 | Resource not found |
| `BAD_REQUEST` | 400 | Invalid request |
| `CONFLICT` | 409 | Resource conflict |
| `GONE` | 410 | Resource no longer available |
| `PAYMENT_REQUIRED` | 402 | Payment needed |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 10. Rate Limiting

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|--------|
| Public (markets, concepts list) | 100/min | 1 minute |
| Authenticated (purchases, viewer) | 60/min | 1 minute |
| Admin (model, analytics) | 30/min | 1 minute |
| Cron (rotate) | 1/min | 1 minute |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701619200
```

---

## 11. Authentication

### Bearer Token

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://api.example.com/api/concepts
```

### API Key (for internal/cron)

```bash
curl -H "X-API-Key: YOUR_API_KEY" https://api.example.com/api/listings/rotate
```

---

## Related Documents

- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Data structures
- [Concept Viewer Deep Dive](./04_CONCEPT_VIEWER.md) - Viewer data format
- [Pricing Logic Deep Dive](./03_PRICING_LOGIC.md) - Price calculation

---

*This document provides exhaustive detail on API endpoints. Refer to specific component documents for implementation details.*
