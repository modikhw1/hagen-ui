# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Project State & Context

**Before making changes, read:** `planning_docs/hagen-ground-truth.md`

This document contains:
- What Hagen IS and IS NOT (no assumptions)
- Current state of each component
- Known gaps and limitations
- The roadmap (Step 1 vs Step 2)
- Founder-stated definitions and priorities

**Current Phase:** Step 1 - Model Reliability
- Focus: Humor model, Replicability model, Analyze-rate-v1
- NOT building brand features yet
- Goal: High reliability (matches human judgment, consistent, low edit rate)

**Key Principle:** Hagen ANALYZES content, it does NOT generate creative content.

## Project Overview

Hagen is an AI-powered video humor analysis platform that analyzes TikTok videos to understand comedic mechanisms, timing, and audience targeting. It uses fine-tuned Gemini 2.5 Flash models to detect and explain humor patterns.

## Build & Development Commands

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run start        # Run production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking (tsc --noEmit)
```

## Key Architecture Patterns

### Service Registry Pattern
`src/lib/services/registry.ts` provides dependency injection for provider swapping:
- VideoAnalyzer: Gemini or Claude
- MetadataProvider: Supadata or Custom
- EmbeddingProvider: OpenAI or Anthropic

Always use `serviceRegistry.getX()` rather than direct imports.

### API Routes Structure
50+ endpoints in `src/app/api/` organized by domain:
- `/api/videos/analyze/*` - Video analysis (main, deep reasoning, tuned model, batch)
- `/api/fine-tuning/*` - Training pipeline (generate, dual-generate, rewrite, save, stats)
- `/api/brand-analysis/*` - Brand matching and profiling
- `/api/replicability/*` - Viral format replicability

Pattern: `POST → Zod validation → service call → database → JSON response`

### Data Flow (Immutable Raw Data)
```
Raw Gemini Output (analyzed_videos.visual_analysis - never modify)
    ↓
Signal Extraction (video_signals.extracted - re-extractable)
    ↓
User Corrections (video_signals.human_overrides - editable)
    ↓
Embeddings & Fingerprinting
```

### Brand Fingerprinting (L1/L2/L3)
`src/lib/services/brand/profile-fingerprint.ts` implements three-layer matching:
- L1: Quality (humor mechanism, emotional resonance, pacing)
- L2: Personality (tone, format preferences, audience)
- L3: Production (visual style, music, editing)

## Fine-Tuning Pipeline

1. User uploads TikTok URL in Fine-Tuning Lab (`/fine-tuning-lab`)
2. Video downloaded (yt-dlp) → uploaded to GCS
3. Model generates analysis draft
4. User edits/refines analysis
5. Saved to `datasets/fine-tuning/gold_standard.jsonl`
6. Combined with Simpsons script mining data
7. Training job submitted via `node scripts/fine-tune-gemini.js`
8. New model version deployed

Current models tracked in `datasets/fine-tuning/model_versions.json`.

## Directory Structure (Key Locations)

```
src/
├── app/api/              # 50+ API routes
├── lib/services/         # Service layer (video/, gemini/, brand/, analysis/)
│   └── registry.ts       # Dependency injection
├── components/           # React components (features/, ui/)
└── types/database.ts     # Supabase schema types

datasets/fine-tuning/     # Training data (JSONL files)
scripts/                  # Data processing (80+ scripts)
docs/                     # Architecture docs (READ ARCHITECTURE_REGISTRY.md FIRST)
```

## Training Data Format

```json
{
  "video_id": "...",
  "source": "TikTok|Simpsons|Question",
  "image": ["gs://...video.mp4"],
  "text": "Full analysis text",
  "mechanism": "subversion|irony|timing|wordplay"
}
```

## Key Scripts

```bash
node scripts/fine-tune-gemini.js          # Submit Vertex AI training job
node scripts/merge-training-datasets.js   # Combine training sources
node scripts/evaluate-humor-model.js      # Benchmark model performance
node scripts/parse-simpsons-humor.js      # Extract comedy beats from scripts
```

## Environment Variables Required

See `.env.example`. Key variables:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `SUPADATA_API_KEY` (TikTok/YouTube scraping)
- `NEXT_PUBLIC_WISPR_API_KEY` (voice input)

## Essential Documentation

Read these in `docs/` before making significant changes:
1. **ARCHITECTURE_REGISTRY.md** - Golden rules for code changes
2. **DATA_ARCHITECTURE.md** - Database schema and data flow
3. **FINE_TUNING_STRATEGY.md** - Model training approach
4. **GCS_VIDEO_ACCESS.md** - Video file access patterns
