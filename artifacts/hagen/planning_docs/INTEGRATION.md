# Integration Guide: Using hagen_pg from hagen Codespace

> **Purpose**: How to fetch and use documentation/data from `hagen_pg` repository in the `hagen` codespace  
> **Target AI**: Claude Opus 4.5 with context limitations  
> **Last Updated**: December 3, 2025

---

## Overview

The `hagen` codespace contains the actual codebase. The `hagen_pg` repository contains:
- Planning documentation (14 documents, ~15,000 lines total)
- Training data (51 videos, 170+ features each)
- Architectural specifications

This guide shows how to efficiently work with this information given context window limitations.

---

## Method 1: GitHub Raw URLs (Simplest)

Fetch documents directly via raw GitHub URLs:

```bash
# Base URL pattern
BASE_URL="https://raw.githubusercontent.com/modikhw1/hagen_pg/main"

# Fetch master specification
curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md"

# Fetch specific component
curl -s "$BASE_URL/docs/components/06_MODEL_TRAINING.md"

# Fetch training data
curl -s "$BASE_URL/analysis_export_2025-12-03.json"
```

### Helper Script for hagen

Create this in your `hagen` codespace:

```bash
#!/bin/bash
# scripts/fetch-pg-doc.sh
# Fetches a document from hagen_pg repository

BASE_URL="https://raw.githubusercontent.com/modikhw1/hagen_pg/main"

case "$1" in
  "master")
    curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md"
    ;;
  "data")
    curl -s "$BASE_URL/analysis_export_2025-12-03.json"
    ;;
  "handoff")
    curl -s "$BASE_URL/AI_HANDOFF.md"
    ;;
  "readme")
    curl -s "$BASE_URL/README.md"
    ;;
  [0-9]|[0-9][0-9])
    # Component number (01-11)
    NUM=$(printf "%02d" "$1")
    curl -s "$BASE_URL/docs/components/${NUM}_"*.md 2>/dev/null || \
      echo "Component $NUM not found. Try 01-11."
    ;;
  *)
    echo "Usage: $0 [master|data|handoff|readme|01-11]"
    echo ""
    echo "Examples:"
    echo "  $0 master     # MVP Master Specification"
    echo "  $0 data       # Training data JSON"
    echo "  $0 06         # Model Training deep dive"
    ;;
esac
```

Usage:
```bash
chmod +x scripts/fetch-pg-doc.sh
./scripts/fetch-pg-doc.sh master    # Get master spec
./scripts/fetch-pg-doc.sh 06        # Get model training doc
```

---

## Method 2: Clone as Submodule (For Persistent Access)

```bash
# In hagen codespace root
git submodule add https://github.com/modikhw1/hagen_pg.git docs/planning

# Access files directly
cat docs/planning/docs/MVP_MASTER_SPECIFICATION.md
```

Update when needed:
```bash
git submodule update --remote
```

---

## Method 3: API Endpoint (If You Build One)

If you want programmatic access, add this endpoint to `hagen`:

```typescript
// src/app/api/planning/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://raw.githubusercontent.com/modikhw1/hagen_pg/main';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  
  const url = `${BASE_URL}/${path}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  const content = await response.text();
  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain' }
  });
}
```

Usage:
```bash
curl http://localhost:3000/api/planning/docs/MVP_MASTER_SPECIFICATION.md
curl http://localhost:3000/api/planning/analysis_export_2025-12-03.json
```

---

## For Claude Opus 4.5: Chunked Reading Strategy

Claude Opus 4.5 has a large context window but benefits from focused reading. Here's the recommended approach:

### Document Reading Order

```
PRIORITY 1 (Always read first):
├── README.md                          (~150 lines) - Overview
└── docs/MVP_MASTER_SPECIFICATION.md   (~700 lines) - Complete picture

PRIORITY 2 (Read based on task):
├── AI_HANDOFF.md (Section 4 only)     (~300 lines) - Feature schema
└── Specific component doc (01-11)     (~500-1000 lines each)

PRIORITY 3 (Only if needed):
└── analysis_export_2025-12-03.json    (~14,000 lines) - Raw data
```

### Chunking Strategy for Large Documents

For documents over 500 lines, read in chunks:

```bash
# Read first 200 lines (overview)
curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md" | head -200

# Read specific section (e.g., lines 200-400)
curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md" | sed -n '200,400p'

# Search for specific section
curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md" | grep -A 50 "## 6. Model Training"
```

### AI Agent Prompt Pattern

When instructing an AI to work with this documentation:

```markdown
## Context Fetching Instructions

1. First, fetch the README for orientation:
   curl -s "https://raw.githubusercontent.com/modikhw1/hagen_pg/main/README.md"

2. Then, fetch the master specification:
   curl -s "https://raw.githubusercontent.com/modikhw1/hagen_pg/main/docs/MVP_MASTER_SPECIFICATION.md"

3. For specific topics, fetch the relevant component:
   - Database: docs/components/02_DATABASE_SCHEMA.md
   - Training: docs/components/06_MODEL_TRAINING.md
   - Viewer: docs/components/04_CONCEPT_VIEWER.md

4. For feature schema details:
   curl -s "https://raw.githubusercontent.com/modikhw1/hagen_pg/main/AI_HANDOFF.md" | sed -n '/## 4. COMPLETE DEEP/,/## 5. CURRENT DATA/p'
```

### Token Budget Estimation

| Document | Lines | Est. Tokens |
|----------|-------|-------------|
| README.md | ~150 | ~1,500 |
| MVP_MASTER_SPECIFICATION.md | ~700 | ~7,000 |
| AI_HANDOFF.md | ~750 | ~7,500 |
| Each component doc (avg) | ~600 | ~6,000 |
| Training data JSON | ~14,000 | ~140,000 |

**Recommendation**: Keep active context under 50,000 tokens. Read master spec + 2-3 component docs max per session.

---

## Document Summary for Quick Reference

### Core Documents

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `README.md` | Repository overview, data reading guide | Always first |
| `MVP_MASTER_SPECIFICATION.md` | Complete system spec | Second, always |
| `AI_HANDOFF.md` | Original system + 170+ feature schema | Feature details |

### Component Deep Dives (01-11)

| # | Document | Purpose |
|---|----------|---------|
| 01 | SYSTEM_ARCHITECTURE | Data flow, component overview |
| 02 | DATABASE_SCHEMA | All tables with examples |
| 03 | PRICING_LOGIC | Pricing formula, PPP data |
| 04 | CONCEPT_VIEWER | View-only player, overlays |
| 05 | API_ENDPOINTS | All routes, existing + new |
| 06 | MODEL_TRAINING | Training pipeline, milestones |
| 07 | EVERGREEN_LOGIC | Trend detection |
| 08 | ROTATION_LOGIC | 72h windows, caps |
| 09 | CASHBACK_FLOW | Feedback loop, verification |
| 10 | SUBTITLE_GENERATION | Translation, overlay |
| 11 | IMPLEMENTATION_PHASES | Roadmap, current state |

### Task → Document Mapping

| If you're working on... | Read these documents |
|------------------------|---------------------|
| Database changes | 02_DATABASE_SCHEMA |
| API implementation | 05_API_ENDPOINTS |
| Model training | 06_MODEL_TRAINING, AI_HANDOFF §4 |
| Video player | 04_CONCEPT_VIEWER |
| Pricing | 03_PRICING_LOGIC |
| Listings/rotation | 08_ROTATION_LOGIC |
| Cashback | 09_CASHBACK_FLOW |
| Subtitles | 10_SUBTITLE_GENERATION |
| Planning/phases | 11_IMPLEMENTATION_PHASES |

---

## Training Data Quick Access

### Get Training Data Summary

```bash
# Count training-ready videos
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | jq 'length'

# Get first video's structure
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | jq '.[0] | keys'

# Get all overall scores
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | jq '[.[].overall_score]'

# Get videos with high ratings (>0.7)
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | jq '[.[] | select(.overall_score > 0.7)]'
```

### Feature Extraction Examples

```bash
# Get all replicability scores
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | \
  jq '[.[] | {id: .video_id, score: .video.visual_analysis.script.replicability.score}]'

# Get meme-dependent flags
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | \
  jq '[.[] | {id: .video_id, meme: .video.visual_analysis.trends.memeDependent}]'

# Correlate replicability with overall score
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | \
  jq '[.[] | {
    overall: .overall_score, 
    replicability: .video.visual_analysis.script.replicability.score
  }]'
```

---

## Updating Documentation

When documentation changes in `hagen_pg`:

```bash
# From hagen_pg codespace
git add -A
git commit -m "Update documentation"
git push origin main

# Changes are immediately available via raw URLs
# No action needed in hagen codespace
```

---

## Troubleshooting

### Raw URL 404

If raw URLs return 404:
1. Check file path is correct (case-sensitive)
2. Verify file was pushed to `main` branch
3. Try with full path: `https://raw.githubusercontent.com/modikhw1/hagen_pg/main/docs/MVP_MASTER_SPECIFICATION.md`

### JSON Parsing Errors

If `jq` fails on training data:
```bash
# Validate JSON
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | jq empty

# Check for truncation
curl -s "$BASE_URL/analysis_export_2025-12-03.json" | tail -c 100
```

### Rate Limiting

GitHub raw URLs have rate limits. If hitting limits:
```bash
# Add token for higher limits
curl -H "Authorization: token YOUR_GITHUB_TOKEN" "$BASE_URL/..."
```

---

*This integration guide enables efficient use of hagen_pg documentation from the hagen codespace while respecting Claude Opus 4.5's context limitations.*
