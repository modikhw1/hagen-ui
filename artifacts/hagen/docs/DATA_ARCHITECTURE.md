# Data Architecture Reference

> ## ⚠️ AI ASSISTANT INSTRUCTION
> **Before any data-related work, run:**
> ```bash
> ./scripts/verify-data-state.sh
> ```
> **Critical facts:**
> - Human ratings → `video_ratings` table (NOT `analyzed_videos.user_ratings`)
> - Deep analysis (150-200 features) → `analyzed_videos.visual_analysis`
> - Brand profiles → `brand_profiles` table (with `brand_conversations` for chat history)
> - Brand-video matching → `find_videos_for_brand()` function using embeddings
> - Verify with actual API queries before assumptions

---

> **Purpose**: Single source of truth for how data flows through the system.  
> **Rule**: Update this document BEFORE implementing any data structure changes.  
> **Last verified**: December 3, 2025

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TikTok URL ──► Supadata API ──► analyzed_videos (metadata)                 │
│                                                                              │
│  Video File ──► GCS Upload ──► Gemini Deep Analysis ──► visual_analysis     │
│                                                                              │
│  Human Rating ──► /rate page ──► video_ratings table                        │
│                                                                              │
│  AI Prediction ──► /api/predict-v2 ──► video_ratings.ai_prediction          │
│                                                                              │
│  Brand Conversation ──► /brand-profile ──► brand_profiles + conversations   │
│       │                                                                      │
│       └──► Reference Videos ──► brand_reference_videos                       │
│       └──► Profile Embedding ──► brand_profiles.embedding                    │
│       └──► Video Matching ──► find_videos_for_brand() ──► matched videos    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Supabase Tables

### 1.1 `analyzed_videos` (Primary video storage)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `video_url` | text | Original TikTok/IG URL | Import |
| `video_id` | text | Platform video ID | Supadata |
| `platform` | text | "tiktok" or "instagram" | Supadata |
| `metadata` | jsonb | Full metadata from Supadata | Supadata API |
| `gcs_uri` | text | `gs://hagen-video-analysis/videos/{id}.mp4` | Video upload |
| `visual_analysis` | jsonb | **Deep analysis (150-200 features)** | Gemini via `/api/videos/reanalyze` |
| `audio_analysis` | jsonb | Audio-specific analysis | Gemini (optional) |
| `content_embedding` | vector(1536) | OpenAI embedding | `/api/videos/rate` |
| `computed_scores` | jsonb | Derived metrics | Metrics calculator |
| `user_ratings` | jsonb | **LEGACY - NOT USED** | - |
| `user_tags` | text[] | **LEGACY - NOT USED** | - |
| `user_notes` | text | **LEGACY - NOT USED** | - |
| `rated_at` | timestamp | When rated | Rating submission |
| `created_at` | timestamp | Import time | Auto |
| `analyzed_at` | timestamp | Deep analysis time | Reanalyze |

**⚠️ IMPORTANT**: `user_ratings`, `user_tags`, `user_notes` in this table are LEGACY. 
Human ratings are stored in `video_ratings` table instead.

### 1.2 `video_ratings` (Human ratings - ACTIVE)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `video_id` | uuid | FK to `analyzed_videos.id` | Rating submission |
| `overall_score` | float | 0-1 scale (your 5+1 converted) | Human via `/rate` |
| `dimensions` | jsonb | `{hook, pacing, payoff, originality, rewatchable}` | Human via `/rate` |
| `notes` | text | Your detailed analysis notes | Human via `/rate` |
| `tags` | text[] | Classification tags | Human via `/rate` |
| `rated_at` | timestamp | When rated | Auto |
| `rater_id` | text | "primary" (you) | Auto |
| `ai_prediction` | jsonb | See structure below | `/api/predict-v2` |
| `training_exported` | boolean | Used for ML training | Export process |
| `exported_at` | timestamp | When exported | Export process |

#### `ai_prediction` structure:
```json
{
  "overall": 0.7,
  "modelUsed": "base",
  "reasoning": "The video shows...",
  "dimensions": {
    "hook": 0.7,
    "pacing": 0.8,
    "payoff": 0.6,
    "originality": 0.5,
    "rewatchable": 0.7
  },
  "user_disagreement": {
    "overall_delta": -0.1,
    "dimension_deltas": {
      "hook": -0.03,
      "pacing": -0.08,
      "payoff": 0.19,
      "originality": -0.01,
      "rewatchable": 0.04
    }
  }
}
```

### 1.3 `video_metrics` (Computed metrics)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `video_id` | uuid | FK to `analyzed_videos.id` |
| `engagement_rate` | float | likes/views ratio |
| `virality_score` | float | Computed virality metric |
| `custom_metrics` | jsonb | Additional computed values |

### 1.4 `rating_schema_versions` (Schema evolution)

Tracks changes to rating dimensions over time.

### 1.5 `brand_profiles` (Brand identity profiles)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `name` | text | Brand/business name | User input |
| `business_type` | text | e.g., 'cafe', 'retail', 'saas' | AI extracted |
| `characteristics` | jsonb | Business characteristics | Conversation AI |
| `tone` | jsonb | Brand tone profile | Conversation AI |
| `current_state` | jsonb | Current brand state | Conversation AI |
| `goals` | jsonb | Business & social goals | Conversation AI |
| `target_audience` | jsonb | Audience definition | Conversation AI |
| `reference_videos` | jsonb | Videos they admire | User input |
| `conversation_synthesis` | text | Full narrative summary | AI synthesis |
| `key_insights` | text[] | Key takeaways | AI synthesis |
| `embedding` | vector(1536) | For video matching | OpenAI |
| `user_id` | uuid | FK to auth.users | Auth |
| `status` | text | 'draft', 'complete', 'archived' | System |
| `created_at` | timestamp | Creation time | Auto |
| `updated_at` | timestamp | Last update | Auto |

#### `characteristics` structure:
```json
{
  "team_size": "small",
  "business_age": "startup",
  "owner_background": "professional-pivot",
  "social_media_experience": "beginner",
  "content_creation_capacity": "limited",
  "brand_personality_inferred": ["approachable", "professional"]
}
```

#### `tone` structure:
```json
{
  "primary": "casual",
  "secondary": ["warm", "authentic"],
  "avoid": ["corporate-speak", "overly-salesy"],
  "energy_level": 7,
  "humor_tolerance": 6,
  "formality": 3
}
```

### 1.6 `brand_conversations` (Conversation sessions)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `brand_profile_id` | uuid | FK to brand_profiles | System |
| `status` | text | 'active', 'completed', 'abandoned' | System |
| `current_phase` | text | Current conversation phase | System |
| `accumulated_insights` | jsonb | Insights gathered so far | AI extraction |
| `session_notes` | text | Human feedback on session | Training UI |
| `training_quality` | text | 'unreviewed', 'good', 'needs_improvement', 'bad', 'excluded' | Human review |
| `message_count` | integer | Total messages | Auto |
| `total_tokens_used` | integer | Token usage | System |
| `created_at` | timestamp | Session start | Auto |
| `updated_at` | timestamp | Last activity | Auto |
| `completed_at` | timestamp | When completed | System |

**Phases**: `introduction` → `business_goals` → `social_goals` → `tone_discovery` → `audience` → `references` → `synthesis`

### 1.7 `brand_conversation_messages` (Individual messages)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `conversation_id` | uuid | FK to brand_conversations | System |
| `role` | text | 'user', 'assistant', 'system' | System |
| `content` | text | Message text | User/AI |
| `message_index` | integer | Order in conversation | Auto |
| `extracted_insights` | jsonb | What message reveals | AI extraction |
| `training_note` | text | Human feedback on this message | Training UI |
| `phase` | text | Phase when sent | System |
| `tokens_used` | integer | Token count | System |
| `created_at` | timestamp | When sent | Auto |

### 1.8 `brand_reference_videos` (Inspiration videos)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `brand_profile_id` | uuid | FK to brand_profiles | System |
| `video_url` | text | URL of inspiration video | User input |
| `platform` | text | 'tiktok', 'youtube', 'instagram' | Detected |
| `reason` | text | Why they like it | User input |
| `aspects_admired` | text[] | e.g., ['humor', 'energy'] | AI extraction |
| `analyzed_video_id` | uuid | FK to analyzed_videos | If analyzed |
| `extracted_tone` | jsonb | Tone analysis | AI extraction |
| `created_at` | timestamp | When added | Auto |

### 1.9 `brand_training_examples` (RAG training examples)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `conversation_id` | uuid | FK to source conversation | System |
| `message_id` | uuid | FK to source message | System |
| `example_type` | text | Type of example | Human/Auto |
| `context` | text | What came before | Extraction |
| `content` | text | The example content | Extraction |
| `outcome` | text | What came after | Extraction |
| `explanation` | text | Why this is good/bad | Human |
| `tags` | text[] | Classification tags | Human/Auto |
| `phase` | text | Conversation phase | System |
| `business_type` | text | Type of business | System |
| `embedding` | vector(1536) | For RAG retrieval | OpenAI |
| `quality_score` | float | 0-1, higher = better | Human |
| `times_used` | integer | Retrieval count | System |
| `last_used_at` | timestamp | Last retrieval | System |
| `created_at` | timestamp | When created | Auto |

**Example types**: `good_question`, `good_response`, `good_transition`, `insight_extraction`, `bad_example`, `conversation_flow`, `brand_synthesis`

### 1.10 `brand_training_patterns` (Higher-level patterns)

| Column | Type | Description | Populated By |
|--------|------|-------------|--------------|
| `id` | uuid | Primary key | Auto-generated |
| `pattern_name` | text | Name of pattern | Human |
| `pattern_type` | text | Type of pattern | Human |
| `description` | text | What this pattern is | Human |
| `when_to_use` | text | When to apply | Human |
| `how_to_apply` | text | Implementation guide | Human |
| `example_ids` | uuid[] | Related examples | System |
| `applies_to_phases` | text[] | Applicable phases | Human |
| `applies_to_business_types` | text[] | Applicable businesses | Human |
| `embedding` | vector(1536) | For semantic matching | OpenAI |
| `effectiveness_score` | float | How well it works | Human |
| `created_at` | timestamp | When created | Auto |

**Pattern types**: `question_strategy`, `tone_matching`, `insight_extraction`, `phase_transition`, `difficult_situation`, `business_specific`

---

## 2. Google Cloud Storage (GCS)

**Bucket**: `hagen-video-analysis`

```
gs://hagen-video-analysis/
├── videos/
│   ├── {uuid}.mp4          # Downloaded TikTok videos
│   └── ...
└── exports/
    └── training/           # JSONL exports for fine-tuning
```

---

## 3. Visual Analysis Schema Versions

The `visual_analysis` field has evolved over time. Use `feature_count` to identify full analyses.

### v0 - Prediction Only (Legacy)
**Date**: Before Dec 1, 2025  
**Count**: 22 videos  
**Fields**: 3
```json
{
  "ai_prediction": {...},
  "prediction_at": "2025-12-02T...",
  "prediction_model": "gemini-..."
}
```
**Note**: NOT deep analysis. Just stored the quick AI prediction here before we had `video_ratings.ai_prediction`.

---

### v1 - Basic Deep Analysis
**Date**: Dec 1, 2025  
**Count**: 3 videos  
**Fields**: 10
```
audio, content, engagement, script, technical, visual,
ai_prediction, analysis_model, analyzed_at, feature_count
```
**Missing**: brand, casting, comedyStyle, execution, flexibility, production, scenes, standalone, trends

---

### v2 - Extended Analysis (no comedyStyle/scenes)
**Date**: Dec 1-2, 2025  
**Count**: 21 videos  
**Fields**: 17
```
audio, brand, casting, content, engagement, execution, flexibility, 
production, script, standalone, technical, trends, visual,
ai_prediction, analysis_model, analyzed_at, feature_count
```
**Missing**: comedyStyle, scenes

---

### v3 - Full Analysis (CURRENT)
**Date**: Dec 3, 2025+  
**Count**: 25 videos  
**Fields**: 19
```
audio, brand, casting, comedyStyle, content, engagement, execution, 
flexibility, production, scenes, script, standalone, technical, trends, visual,
ai_prediction, analysis_model, analyzed_at, feature_count
```
**Complete**: All 150-200 features extracted.

---

### Quick Version Check
```bash
# Count by version
curl -s "http://localhost:3001/api/videos/analyze?limit=200" | jq '
  [.videos[] | select(.visual_analysis != null) | 
   {version: (if .visual_analysis.prediction_model != null then "v0"
              elif (.visual_analysis | keys | length) == 10 then "v1"
              elif (.visual_analysis | keys | length) == 17 then "v2"
              else "v3" end)}
  ] | group_by(.version) | map({version: .[0].version, count: length})'
```

---

## 4. Visual Analysis Structure (v3 - Current)

When `/api/videos/reanalyze` runs Gemini on a video, it populates `visual_analysis`:

```json
{
  "visual": {
    "hookStrength": 8,
    "hookDescription": "...",
    "overallQuality": 7,
    "lighting": "natural",
    "cameraWork": "static",
    "textOverlays": true,
    "visualGags": ["..."]
  },
  "audio": {
    "hasDialogue": true,
    "musicType": "trending",
    "soundEffects": ["..."],
    "voiceoverStyle": "energetic"
  },
  "content": {
    "mainTopic": "restaurant humor",
    "emotionalTone": "lighthearted",
    "targetAudience": "service workers",
    "brandMentions": 0
  },
  "scenes": [...],
  "script": {
    "structure": "setup-punchline",
    "dialogueQuality": 7,
    "timingPrecision": 8
  },
  "casting": {...},
  "production": {...},
  "flexibility": {
    "replicability": 8,
    "adaptability": "high"
  },
  "comedyStyle": {
    "primaryStyle": "situational",
    "commitmentLevel": 8
  },
  "trends": {...},
  "brand": {...},
  "standalone": {...},
  "execution": {...},
  "technical": {...},
  "engagement": {...},
  "feature_count": 172,
  "analyzed_at": "2025-12-03T...",
  "analysis_model": "gemini-2.0-flash-exp"
}
```

**Total features**: 150-200 per video across all categories.

---

## 4. API Endpoints Reference

### Import & Analysis
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tiktok` | POST | Import video from URL (metadata only) |
| `/api/videos/upload` | POST | Upload video file to GCS |
| `/api/videos/reanalyze` | POST | Run deep Gemini analysis (150-200 features) |
| `/api/videos/analyze` | GET | List/retrieve analyzed videos |

### Rating
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ratings` | GET | List videos with ratings (from `video_ratings`) |
| `/api/ratings` | POST | Save human rating |
| `/api/predict-v2` | POST | Get AI prediction before rating |
| `/api/rate-v2/chat` | POST | Conversational rating interface |

### Export & Training
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ratings/export` | GET/POST | Export ratings for training |
| `/api/patterns/discover` | POST | Find patterns in ratings |

### Brand Profiling
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/brand-profile` | GET | List brand profiles |
| `/api/brand-profile` | POST | Start new brand conversation |
| `/api/brand-profile/[id]` | GET | Get specific profile |
| `/api/brand-profile/[id]` | PATCH | Update profile |
| `/api/brand-profile/message` | POST | Send message in conversation |

---

## 5. Data Relationships

```
analyzed_videos (1) ──────► (1) video_ratings
       │                           │
       │ visual_analysis           │ ai_prediction.user_disagreement
       │ (Gemini features)         │ (delta between AI and human)
       │                           │
       └───────── MISSING LINK ────┘
       
The correlation between visual_analysis features 
and human overall_score is NOT YET COMPUTED.

brand_profiles (1) ──────► (n) brand_conversations
       │                           │
       │                           └──► (n) brand_conversation_messages
       │
       └──────► (n) brand_reference_videos ──► analyzed_videos (optional)
       │
       │ embedding ◄───── find_videos_for_brand() ─────► analyzed_videos.embedding
       │
       └──────► Matched videos based on tone/style similarity
```

---

## 6. Known Gaps / TODO

### 6.1 Missing: Deep Analysis ↔ Human Rating Correlation
- `visual_analysis` has 150-200 features
- `video_ratings` has `overall_score` + `dimensions`
- **No function correlates these** to learn which Gemini features predict human preferences

### 6.2 Legacy Fields
- `analyzed_videos.user_ratings` - Empty, ratings are in `video_ratings`
- `analyzed_videos.user_tags` - Empty, tags are in `video_ratings`
- `analyzed_videos.user_notes` - Empty, notes are in `video_ratings`

### 6.3 Embedding Sync
- Embeddings regenerated on rating but may not include latest `visual_analysis`

---

## 7. Update Log

| Date | Change | By |
|------|--------|-----|
| 2025-12-03 | Initial document created | System |
| | | |

---

## 8. Verification Queries

Run these before developing any feature to confirm data state:

### Check video counts by state
```bash
# Total videos imported
curl -s "http://localhost:3001/api/videos/analyze?count=true" | jq '.count'

# Videos with deep analysis (visual_analysis populated)
curl -s "http://localhost:3001/api/videos/analyze?limit=100" | jq '[.videos[] | select(.visual_analysis != null)] | length'

# Videos with GCS upload
curl -s "http://localhost:3001/api/videos/analyze?limit=100" | jq '[.videos[] | select(.gcs_uri != null)] | length'
```

### Check ratings
```bash
# Total rated videos (in video_ratings table)
curl -s "http://localhost:3001/api/ratings" | jq 'length'

# Rated videos with notes
curl -s "http://localhost:3001/api/ratings" | jq '[.[] | select(.notes != null and .notes != "")] | length'

# Rated videos with AI predictions
curl -s "http://localhost:3001/api/ratings" | jq '[.[] | select(.ai_prediction != null)] | length'
```

### Check data overlap (critical for correlation)
```bash
# Videos that have BOTH deep analysis AND human ratings
curl -s "http://localhost:3001/api/ratings" | jq '[.[] | select(.video.visual_analysis != null)] | length'

# Sample: Show video with both
curl -s "http://localhost:3001/api/ratings?limit=1" | jq '.[0] | {
  video_id: .video_id,
  has_rating: (.overall_score != null),
  has_deep_analysis: (.video.visual_analysis != null),
  human_score: .overall_score,
  ai_predicted: .ai_prediction.overall,
  feature_count: .video.visual_analysis.feature_count
}'
```

### Verify specific video
```bash
# Replace VIDEO_ID with actual UUID
VIDEO_ID="43dcb57c-9dda-4db9-8055-f7e074978bf3"

# Check analyzed_videos table
curl -s "http://localhost:3001/api/videos/analyze?id=$VIDEO_ID" | jq '{
  id: .id,
  has_metadata: (.metadata != null),
  has_gcs: (.gcs_uri != null),
  has_visual_analysis: (.visual_analysis != null),
  feature_count: .visual_analysis.feature_count
}'

# Check video_ratings table  
curl -s "http://localhost:3001/api/ratings" | jq --arg vid "$VIDEO_ID" '.[] | select(.video_id == $vid) | {
  rating_id: .id,
  overall_score: .overall_score,
  has_notes: (.notes != null),
  has_ai_prediction: (.ai_prediction != null)
}'
```

### Deep analysis feature inspection
```bash
# List all top-level categories in visual_analysis
curl -s "http://localhost:3001/api/videos/analyze?limit=1" | jq '.videos[0].visual_analysis | keys'

# Sample specific category (e.g., comedyStyle)
curl -s "http://localhost:3001/api/videos/analyze?limit=1" | jq '.videos[0].visual_analysis.comedyStyle'

# Count features in a category
curl -s "http://localhost:3001/api/videos/analyze?limit=1" | jq '.videos[0].visual_analysis.visual | keys | length'
```

---

## 9. Pre-Development Checklist

Before implementing any data-related feature:

- [ ] Run verification queries above to confirm current state
- [ ] Check this document for current structure
- [ ] Verify which table holds the data you need
- [ ] Check for legacy fields that appear populated but aren't
- [ ] Update this document if adding new fields/tables
- [ ] Test with actual API calls, not assumptions

---

## 10. Common Mistakes to Avoid

| Mistake | Reality |
|---------|---------|
| Looking for ratings in `analyzed_videos.user_ratings` | Ratings are in `video_ratings` table |
| Assuming all videos have deep analysis | Only videos run through `/api/videos/reanalyze` have `visual_analysis` |
| Assuming `visual_analysis` exists if video is "analyzed" | Initial analysis only gets metadata, not Gemini features |
| Checking `analyzed_videos.rated_at` for rating status | Check `video_ratings` table existence instead |
| Using `user_ratings.overall` | Use `video_ratings.overall_score` |
| Assuming API joins include all fields | Check the `select()` statement in route files |

---

## 11. Enforcement Mechanisms

### 11.1 Verification Script (REQUIRED before development)
```bash
# Run this at start of EVERY development session
./scripts/verify-data-state.sh
```

### 11.2 README Reminder
Add to project README:
```markdown
## Before Development
Run `./scripts/verify-data-state.sh` to check data state.
See `DATA_ARCHITECTURE.md` for structure details.
```

### 11.3 For AI Assistants (Claude, Copilot, etc.)
When starting a session involving data:
1. Run `./scripts/verify-data-state.sh` first
2. Read `DATA_ARCHITECTURE.md` section relevant to the task
3. Verify assumptions with actual API queries before coding

### 11.4 Change Protocol
When modifying data structures:
1. Update `DATA_ARCHITECTURE.md` FIRST
2. Update verification script if needed
3. Implement the change
4. Run verification to confirm

---

## 12. Update Log

| Date | Change | By |
|------|--------|-----|
| 2025-12-03 | Initial document created | System |
| 2025-12-03 | Added `visual_analysis` to ratings API join | System |
| 2025-12-05 | Added brand profiling tables (brand_profiles, brand_conversations, brand_conversation_messages, brand_reference_videos) | System |
| 2025-12-05 | Added training system tables (brand_training_examples, brand_training_patterns) with RAG retrieval | System |
| 2025-12-05 | Added training_note to messages, session_notes/training_quality to conversations | System |
| | | |
