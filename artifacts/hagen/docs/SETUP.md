# Setup Guide - Hagen AI Video Analysis

## Quick Start

### 1. Environment Variables

Create `.env.local`:

```bash
# Required API Keys
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-gemini-key
SUPADATA_API_KEY=your-supadata-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
```

### 2. Database Setup

In Supabase Dashboard → SQL Editor, run:

1. `supabase/migrations/002_ai_analysis_system.sql`

This creates:
- `analyzed_videos` table with pgvector
- `rating_schema_versions` for dynamic schema
- `discovered_patterns` for AI insights
- `video_metrics` for computed scores

### 3. Install & Run

```bash
npm install
npm run dev
```

Visit http://localhost:3000

## API Endpoints Created

### Video Analysis
- `POST /api/videos/analyze` - Analyze video (metadata + metrics)
- `GET /api/videos/analyze?id=uuid` - Get analyzed video
- `POST /api/videos/rate` - Rate video with custom criteria
- `POST /api/videos/similar` - Find similar videos by embedding

### Pattern Discovery
- `POST /api/patterns/discover` - Discover patterns in ratings
- `GET /api/patterns/discover` - Get discovered patterns

### Schema Evolution
- `POST /api/schema/evolve` - Evolve rating schema
- `GET /api/schema/evolve` - Get active schema

## Architecture

### Service Registry (Dependency Injection)

All services use interface-based contracts:

```typescript
import { serviceRegistry } from '@/lib/services/registry'

// Get services
const analyzer = serviceRegistry.getVideoAnalyzer()
const metadata = serviceRegistry.getMetadataProvider()
const embeddings = serviceRegistry.getEmbeddingProvider()
const patterns = serviceRegistry.getPatternDiscoveryProvider()
const metrics = serviceRegistry.getMetricsCalculator()
```

### Swappable Implementations

```typescript
// Current setup:
VideoAnalyzer → Gemini 2.0 Flash
Metadata → Supadata API
Embeddings → OpenAI text-embedding-3-large
Patterns → GPT-4o
Metrics → Built-in calculator

// Easy to swap:
serviceRegistry.setVideoAnalyzer(new ClaudeAnalyzer())
serviceRegistry.setMetadataProvider(new CustomScraper())
```

## Usage Flow

### 1. Analyze Video

```bash
curl -X POST http://localhost:3000/api/videos/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123"}'
```

Returns:
- Video metadata (views, likes, comments)
- Computed metrics (engagement rate, viral potential)
- Video ID for rating

### 2. Rate Video

```bash
curl -X POST http://localhost:3000/api/videos/rate \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "uuid-from-step-1",
    "ratings": {
      "overall_rating": 8.5,
      "would_replicate": true
    },
    "tags": ["tutorial", "trending"]
  }'
```

Creates vector embedding combining metadata + ratings.

### 3. Find Similar Videos

```bash
curl -X POST http://localhost:3000/api/videos/similar \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "uuid",
    "limit": 10,
    "threshold": 0.7
  }'
```

Returns videos with similarity scores based on pgvector cosine similarity.

### 4. Discover Patterns (After Rating 5+ Videos)

```bash
curl -X POST http://localhost:3000/api/patterns/discover \
  -H "Content-Type: application/json" \
  -d '{"minRatings": 5}'
```

GPT-4o analyzes your ratings and discovers:
- Correlations (e.g., "Videos with strong hooks get 2.3x higher ratings")
- Preferences (e.g., "You prefer educational content over entertainment")
- Suggested criteria (e.g., "Add 'pacing_score' rating field")

## Cost Per Video

- Supadata metadata: $0.01
- OpenAI embeddings: $0.0001
- **Total: ~$0.01 per video**

Optional (if you enable full Gemini analysis):
- Gemini video analysis: $0.075/min
- **Total with Gemini: ~$0.08-0.12 per video**

Pattern discovery (run periodically):
- GPT-4o: ~$0.02 per 10 rated videos

## File Structure Created

```
src/
├── app/
│   ├── analyze/page.tsx              ✅ Created
│   └── api/
│       ├── videos/
│       │   ├── analyze/route.ts      ✅ Created
│       │   ├── rate/route.ts         ✅ Created
│       │   └── similar/route.ts      ✅ Created
│       ├── patterns/
│       │   └── discover/route.ts     ✅ Created
│       └── schema/
│           └── evolve/route.ts       ✅ Created
├── lib/
│   └── services/
│       ├── types.ts                  ✅ Created
│       ├── registry.ts               ✅ Created (updated)
│       ├── video/
│       │   └── gemini.ts             ✅ Created
│       ├── metadata/
│       │   └── supadata.ts           ✅ Created
│       ├── embeddings/
│       │   └── openai.ts             ✅ Created
│       ├── patterns/
│       │   └── gpt.ts                ✅ Created
│       └── metrics/
│           └── calculator.ts         ✅ Created

supabase/migrations/
└── 002_ai_analysis_system.sql        ✅ Created
```

## Next Steps

1. **Add Authentication**: Integrate Supabase Auth for multi-user support
2. **Build UI Components**: Create rating form, pattern display, similarity browser
3. **Enable Gemini Analysis**: Add full video analysis workflow
4. **Add More Providers**: Implement Claude, GPT-4o Vision alternatives
5. **Batch Processing**: Queue system for bulk video analysis

## Troubleshooting

### "Video analyzer not configured"
- Check `GEMINI_API_KEY` in `.env.local`
- Services auto-initialize on server start

### "Embedding provider not configured"
- Check `OPENAI_API_KEY` in `.env.local`
- Restart dev server after adding keys

### "Metadata provider not configured"
- Check `SUPADATA_API_KEY` in `.env.local`

### Database errors
- Ensure migrations ran successfully
- Check Supabase connection in dashboard
- Verify pgvector extension is enabled

## Need Help?

Check the main README.md for full documentation.
