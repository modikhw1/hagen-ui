# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a **documentation and data repository** for a TikTok skit concept marketplace. It contains planning documents, specifications, and training data. The actual codebase is in a separate repository called `hagen`.

## Repository Structure

- `docs/MVP_MASTER_SPECIFICATION.md` - Complete system specification (read this first after README)
- `docs/components/01-11_*.md` - Deep-dive documents for specific features
- `AI_HANDOFF.md` - Complete feature schema (170+ variables for video analysis)
- `analysis_export_2025-12-03.json` - Training data (51 rated videos)
- `INTEGRATION.md` - How to fetch docs from the `hagen` codespace

## Key Concepts

**Rating System**: Videos are rated on 5+1 dimensions (hook, pacing, payoff, originality, rewatchable, overall_score), all on 0-1 scale.

**Schema Versions**: The `visual_analysis` field has evolved through versions:
- v0: Prediction only (no features) - DO NOT use for training
- v1/v2: Partial analysis - use with caution
- v3: Full 170+ features (`feature_count >= 100`) - use for training

To detect version:
```javascript
function getAnalysisVersion(visual_analysis) {
  if (!visual_analysis) return null;
  if (visual_analysis.prediction_model && !visual_analysis.visual) return 'v0';
  if (!visual_analysis.casting) return 'v1';
  if (!visual_analysis.comedyStyle) return 'v2';
  return 'v3';
}
```

## Reading Order for AI Agents

1. `README.md` - Overview and data reading guide
2. `docs/MVP_MASTER_SPECIFICATION.md` - Complete system picture
3. Specific component docs (01-11) based on task
4. `AI_HANDOFF.md` Section 4 - Full feature schema (if working on analysis)

## Working with Training Data

Filter to v3 videos only for training:
```javascript
const trainingData = videos.filter(v =>
  v.visual_analysis?.feature_count >= 100
);
```

## Integration with hagen Codebase

Fetch docs via raw GitHub URLs:
```bash
BASE_URL="https://raw.githubusercontent.com/modikhw1/hagen_pg/main"
curl -s "$BASE_URL/docs/MVP_MASTER_SPECIFICATION.md"
```
