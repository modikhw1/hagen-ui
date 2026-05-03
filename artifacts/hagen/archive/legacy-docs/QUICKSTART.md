# Quick Start - Video Feedback System

## 🚀 Get Started in 3 Steps

### 1. Verify Database Setup

Run in your **Supabase SQL Editor**:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN ('analyzed_videos', 'rating_schema_versions', 'discovered_patterns', 'video_metrics');

-- Check if pgvector is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**If tables are missing:** Copy and paste the entire content of `supabase/migrations/002_ai_analysis_system.sql` into the SQL Editor and run it.

### 2. Start the App

```bash
npm run dev
```

### 3. Start Learning!

Visit: **http://localhost:3000/feedback**

## 📊 The Workflow

```
1. Enter Video URL → Analyzes metadata & computes metrics
                  ↓
2. Rate the Video → You provide subjective feedback (1-10 scales)
                  ↓
3. Embeddings Generated → OpenAI creates vector representation
                  ↓
4. Stored in pgvector → Your rating + metadata combined
                  ↓
5. Find Similar Videos → See videos with similar characteristics
```

## 🎯 What You're Building

- **Input:** Your subjective ratings on videos (hook strength, content quality, etc.)
- **Processing:** Combines your ratings with video metadata and creates embeddings
- **Storage:** pgvector stores embeddings for similarity search
- **Output:** Discover videos similar to ones you rated highly
- **Learning:** After ~10 rated videos, patterns will emerge

## 🔧 Current Features

✅ **Video Analysis** - Fetches metadata (views, likes, author, etc.)
✅ **Custom Rating System** - Rate videos on multiple dimensions
✅ **Embedding Generation** - OpenAI text-embedding-3-large
✅ **pgvector Storage** - Fast similarity search
✅ **Similar Video Discovery** - Find videos based on your preferences

## 📈 Next Steps (After You Have Data)

Once you've rated 5-10 videos:

```bash
# Discover patterns in your ratings
curl -X POST http://localhost:3000/api/patterns/discover \
  -H "Content-Type: application/json" \
  -d '{"minRatings": 5}'
```

This will:
- Find correlations (e.g., "High hook strength → Higher overall rating")
- Suggest new rating dimensions based on what matters to you
- Identify your content preferences

## 💡 How Embeddings Work

When you rate a video, the system creates a text representation:

```
"TikTok video by @creator with 100K views. 
User ratings: overall_rating=8, hook_strength=9, content_quality=7.
Tags: tutorial, trending. 
Description: [video description]"
```

This text → OpenAI embedding → 3072-dimensional vector → pgvector storage

Similar vectors = Similar videos according to YOUR preferences!

## 🔑 Required Environment Variables

Make sure `.env.local` has:

```env
OPENAI_API_KEY=sk-...
SUPADATA_API_KEY=sd_...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 🐛 Troubleshooting

**"Video analyzer not configured"** - Gemini video analysis is optional. Metadata-only mode works fine!

**"Embedding provider not configured"** - Check OPENAI_API_KEY in .env.local

**Database errors** - Run the migration in Supabase SQL Editor

**"No similar videos found"** - Rate 2-3 more videos to build your database
