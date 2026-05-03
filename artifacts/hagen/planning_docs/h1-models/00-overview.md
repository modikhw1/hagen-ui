# H1 Relational Models - Overview

Quick reference for H1 models and relational matrix system.

## What is an H1 Model?

An **H1** is a core question that organizes a relational matrix. Each H1 gets its own trained model:

| H1 | Question | Status |
|----|----------|--------|
| `quality_ranking` | Which content is better overall? | Not trained |
| `humor_similarity` | How similar in humor style? | Not trained |
| `replicability_similarity` | How similar to produce? | Not trained |

## How It Works

```
Training:
  Notes + Clip Data (150+ vars) → DPO Training → H1 Model

Runtime:
  H1 Model → All clip pairs → Relational Matrix (N×N)

Recommendations:
  Customer → Query H1 matrices → Blend results → Ranked clips
```

## Documentation

| Document | Purpose |
|----------|---------|
| [01-architecture.md](./01-architecture.md) | H1 model concepts, training flow, runtime blending |
| [02-implementation-dpo.md](./02-implementation-dpo.md) | DPO training via Vertex AI, code files, phases |
| [../relational-matrix-prototype.md](../relational-matrix-prototype.md) | Example clips, relationship structure |

## Quick Start: Adding a New H1

1. Define the H1 question (what relationship are you measuring?)
2. Collect 30-50 annotated pairs in `h1-lab`
3. Export to DPO format: `node scripts/export-h1-dpo-training.js`
4. Train: `node scripts/fine-tune-h1-dpo.js --h1=your_h1_type`
5. Generate matrix: `node scripts/generate-h1-matrix.js --h1=your_h1_type`

## Key Files

| File | Purpose |
|------|---------|
| `src/app/h1-lab/page.tsx` | Annotation UI |
| `scripts/fine-tune-h1-dpo.js` | DPO training |
| `scripts/generate-h1-matrix.js` | Matrix generation |
| `supabase/migrations/024_h1_training.sql` | Database schema |
