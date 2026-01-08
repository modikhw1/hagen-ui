# AI Context Handoff Document

> **Purpose**: Paste this into another AI instance to provide full context on the project goals and data structure.

---

## 1. Overarching Goal

**Build a preference learning system that identifies which TikTok video features predict YOUR human ratings.**

### The Training Loop:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   1. IMPORT: TikTok video → Download to GCS → Store metadata                │
│                                                                             │
│   2. DEEP ANALYSIS: Gemini extracts 150-200 features per video              │
│      (comedy structure, pacing, hook strength, brand safety, etc.)          │
│                                                                             │
│   3. HUMAN RATING: User rates video on 5+1 dimensions with notes            │
│      (hook, pacing, payoff, originality, rewatchability + notes)            │
│                                                                             │
│   4. CORRELATION: [NOT YET BUILT] Find which Gemini features                │
│      actually correlate with human preferences                              │
│                                                                             │
│   5. PREDICTION: Use learned correlations to pre-filter/rank                │
│      new videos before human sees them                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### End Goal:
Train an AI to recognize what makes a TikTok skit good *according to this specific user's taste*, not generic engagement metrics. The use case is finding replicable skits for small business marketing.

### Success Criteria:
- AI can predict human score within ±0.5 points (on 0-1 scale)
- AI can explain WHY it predicts a score using Gemini features
- User can find good skits faster by filtering on learned preferences

---

## 2. Current Data Structure

### 2.1 Database: Supabase (PostgreSQL)

#### Table: `analyzed_videos` (Primary video storage)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `video_url` | text | Original TikTok URL |
| `video_id` | text | TikTok's video ID |
| `platform` | text | "tiktok" or "instagram" |
| `metadata` | jsonb | Full metadata from Supadata API (author, stats, captions) |
| `gcs_uri` | text | `gs://hagen-video-analysis/videos/{id}.mp4` |
| `visual_analysis` | jsonb | **Deep Gemini analysis (150-200 features)** - see structure below |
| `content_embedding` | vector(1536) | OpenAI embedding for similarity search |
| `created_at` | timestamp | Import time |
| `analyzed_at` | timestamp | Deep analysis time |

**Note**: This table has legacy columns (`user_ratings`, `user_tags`, `user_notes`) that are EMPTY. Human ratings are stored in a separate table.

---

#### Table: `video_ratings` (Human ratings - ACTIVE)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `video_id` | uuid | FK → `analyzed_videos.id` |
| `overall_score` | float | 0-1 scale (converted from 5+1 system) |
| `dimensions` | jsonb | `{hook, pacing, payoff, originality, rewatchable}` each 0-1 |
| `notes` | text | Free-form analysis notes from human |
| `tags` | text[] | Classification tags |
| `rated_at` | timestamp | When rated |
| `ai_prediction` | jsonb | AI's pre-rating guess (see below) |

#### `ai_prediction` structure (stored per rating):
```json
{
  "overall": 0.7,
  "modelUsed": "base",
  "reasoning": "The video shows strong hook with immediate engagement...",
  "dimensions": {
    "hook": 0.7,
    "pacing": 0.8,
    "payoff": 0.6,
    "originality": 0.5,
    "rewatchable": 0.7
  },
  "user_disagreement": {
    "overall_delta": -0.1,
    "dimension_deltas": { "hook": -0.03, "pacing": -0.08, ... }
  }
}
```

---

### 2.2 Deep Analysis Structure (`visual_analysis`)

When Gemini analyzes a video, it extracts ~150-200 features across these categories:

```json
{
  "visual": {
    "hookStrength": 8,
    "hookDescription": "Immediate text overlay with question",
    "overallQuality": 7,
    "lighting": "natural",
    "cameraWork": "static",
    "textOverlays": true,
    "visualGags": ["exaggerated reaction"]
  },
  "audio": {
    "hasDialogue": true,
    "musicType": "trending",
    "soundEffects": [],
    "voiceoverStyle": "energetic"
  },
  "content": {
    "mainTopic": "restaurant humor",
    "emotionalTone": "lighthearted",
    "targetAudience": "service workers",
    "duration": 18
  },
  "script": {
    "structure": "setup-punchline",
    "dialogueQuality": 7,
    "timingPrecision": 8,
    "hasScript": true,
    "replicability": {
      "score": 8,
      "resourceRequirements": "low"
    }
  },
  "casting": {
    "minimumPeople": 2,
    "actingSkillRequired": 5,
    "roles": { "primary": "employee", "secondary": "customer" }
  },
  "production": {
    "shotComplexity": 3,
    "editingComplexity": 4
  },
  "flexibility": {
    "swappableCore": true,
    "industryLock": 3,
    "adaptability": "high"
  },
  "comedyStyle": {
    "primaryStyle": "situational",
    "commitmentLevel": 8
  },
  "trends": {
    "trendLifespan": "evergreen-trope",
    "memeDependent": false
  },
  "brand": {
    "riskLevel": 2,
    "appropriateFor": ["restaurants", "retail", "service"]
  },
  "standalone": {
    "worksWithoutContext": 9
  },
  "engagement": {
    "predictedWatchTime": 0.85,
    "shareability": 7
  },
  "feature_count": 172,
  "analyzed_at": "2025-12-03T...",
  "analysis_model": "gemini-2.0-flash-exp"
}
```

---

### 2.3 Storage: Google Cloud Storage

```
gs://hagen-video-analysis/
├── videos/
│   ├── {uuid}.mp4          # Downloaded TikTok videos
│   └── ...
```

---

### 2.4 Current Data Counts (as of Dec 3, 2025)

| Metric | Count |
|--------|-------|
| Total videos imported | 102 |
| Videos with GCS upload | 73 |
| Videos with full deep analysis (v3) | 25 |
| Videos with human ratings | 50 |
| Videos with BOTH rating AND deep analysis | ~28 |

---

## 3. The Missing Piece

### What's NOT Built Yet:

**Correlation Analysis** - A function that:
1. Takes videos with BOTH deep analysis AND human ratings
2. Finds which of the 150-200 Gemini features correlate with human scores
3. Identifies discrepancies (where AI and human disagree most)
4. Builds a preference model to weight features by this user's taste

### Expected Output:
```json
{
  "strongPositiveCorrelations": [
    { "feature": "script.replicability.score", "correlation": 0.82 },
    { "feature": "comedyStyle.commitmentLevel", "correlation": 0.75 }
  ],
  "strongNegativeCorrelations": [
    { "feature": "audio.soundEffects.length", "correlation": -0.65 },
    { "feature": "production.shotComplexity", "correlation": -0.58 }
  ],
  "noCorrelation": [
    { "feature": "visual.hookStrength", "note": "Gemini rates high but human doesn't care" }
  ]
}
```

---

## 4. Key Domain Context

### Use Case: Small Business TikTok Skits

The user is curating videos that are:
- **Replicable** by small businesses (1-2 people, phone camera, 5-15 min to shoot)
- **Low risk** (appropriate for any brand)
- **Evergreen** (not dependent on trending sounds that expire)
- **Dialog-driven** (script-based, not reliant on effects or music)

### User's Preferences (learned from ratings):
- HIGH: Script-driven, low production, clear "game", status reversals
- LOW: Heavy sound effects, trend-dependent, high production value, no payoff

---

## 5. Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS
- **Database**: Supabase (PostgreSQL + pgvector)
- **Storage**: Google Cloud Storage
- **AI Analysis**: Gemini 2.0 Flash (video analysis)
- **Embeddings**: OpenAI text-embedding-3-small
- **Metadata**: Supadata API (TikTok metadata extraction)

---

## 6. API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/tiktok` | Import video from TikTok URL |
| `POST /api/videos/upload` | Upload video file to GCS |
| `POST /api/videos/reanalyze` | Run deep Gemini analysis |
| `GET /api/videos/analyze` | List/retrieve videos with analysis |
| `GET /api/ratings` | List videos with human ratings |
| `POST /api/ratings` | Save human rating |
| `POST /api/predict-v2` | Get AI prediction before rating |

---

## 7. What You Can Do With This Context

1. **Build correlation analysis** between `visual_analysis` features and `overall_score`
2. **Create visualizations** (heatmaps, scatter plots, feature importance charts)
3. **Design a preference learning algorithm** that weights features
4. **Build a recommendation/filtering system** using learned preferences
5. **Analyze discrepancies** between AI predictions and human ratings

---

*Document generated: December 3, 2025*
