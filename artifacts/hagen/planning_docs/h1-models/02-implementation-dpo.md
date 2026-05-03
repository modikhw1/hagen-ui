# H1 Models - DPO Implementation

## Approach: Direct Preference Optimization via Vertex AI

Use Google's native preference tuning for Gemini 2.5 Flash to train H1 models on clip-pair preferences.

**Why DPO:**
- Native Vertex AI support (no new infrastructure)
- Designed for pairwise preference learning ("Clip A > Clip B")
- Works with natural language notes as context
- Adapts existing `fine-tune-gemini.js` pipeline

---

## How Notes Work as Learning Catalyst

**Question:** Does the model learn by seeking within the data-points already in clip objects, with notes as the catalyst?

**Answer: Yes.** Here's how DPO implements this:

```
Training Example Structure:
┌─────────────────────────────────────────────────────────────┐
│  PROMPT (what model sees):                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Clip A: [150+ variables from analyze-rate, humor,      ││
│  │          replicability - ALL data-points]               ││
│  │                                                         ││
│  │  Clip B: [150+ variables - ALL data-points]             ││
│  │                                                         ││
│  │  Human Note: "This clip has a creative script that is   ││
│  │  more fun. It's less likely to fall flat..."            ││
│  │  ↑ THE LEARNING CATALYST                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  CHOSEN (correct reasoning):                                │
│  "Clip B is better because..." [references variables]       │
│                                                             │
│  REJECTED (wrong reasoning):                                │
│  "Clip A is better because..." [shallow reasoning]          │
└─────────────────────────────────────────────────────────────┘

What the Model Learns:
┌─────────────────────────────────────────────────────────────┐
│  Note says: "creative script"                               │
│       ↓                                                     │
│  Model discovers: correlates with humor_mechanism +         │
│                   handling + payoff_type combinations       │
│                                                             │
│  Note says: "less likely to fall flat"                      │
│       ↓                                                     │
│  Model discovers: correlates with replicability_skill +     │
│                   concept_robustness variables              │
│                                                             │
│  RESULT: Semantic layer that connects note language         │
│          to variable patterns in the data                   │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** The model doesn't memorize "creative script = X variable". It learns PATTERNS across many training examples, discovering which variable combinations correlate with different note language. This is the semantic layer forming.

---

## Training Data Format

### DPO JSONL Structure

```jsonl
{
  "prompt": "...",
  "chosen": "...",
  "rejected": "..."
}
```

### Example: Quality Ranking H1

```jsonl
{
  "prompt": "You are comparing two TikTok clips for overall quality.\n\nCLIP A:\nvideo_id: contraband.coffee/7584667920807103751\nhumor_mechanism: subversion\nhandling: MEDIOCRE\nedit_as_punchline: false\nhook_style: action\nnarrative_momentum: steady_stream\n[...150+ variables...]\n\nCLIP B:\nvideo_id: glamberryltd/7557448130912881942\nhumor_mechanism: subversion\nhandling: GOOD\nedit_as_punchline: true\nhook_style: action\nnarrative_momentum: steady_stream\n[...150+ variables...]\n\nHUMAN NOTE: The first clip is slightly better. Leaving replicability, which may not be the biggest factor here for the average business, this clip has a creative script that is more fun.\n\nWhich clip is higher quality overall?",
  "chosen": "CLIP B is higher quality.\n\nReasoning: Despite both using subversion humor, Clip B demonstrates superior execution. The 'GOOD' handling rating reflects a more polished script with a clever reveal structure.\n\nKey differentiators:\n- Script creativity: B > A\n- Emotional engagement: B (wholesome) > A (mild frustration humor)\n- Replicability risk: A (may fall flat) < B (concept is robust)\n\nConfidence: 0.75",
  "rejected": "CLIP A is higher quality.\n\nReasoning: Clip A has a more straightforward execution that's easier to understand.\n\nConfidence: 0.40"
}
```

### Example: Humor Similarity H1

```jsonl
{
  "prompt": "You are comparing two TikTok clips for humor style similarity.\n\nCLIP A:\n[...data...]\n\nCLIP B:\n[...data...]\n\nHUMAN NOTE: Both use subversion but achieve it differently - A through repetition, B through reveal.\n\nHow similar are these clips in humor style? (0.0 = completely different, 1.0 = nearly identical)",
  "chosen": "Similarity: 0.45\n\nReasoning: While both clips are labeled 'subversion' mechanism, they achieve humor through fundamentally different textures:\n- Clip A: Repetition-based subversion\n- Clip B: Reveal-based subversion\n\nThe comedic 'feel' is different despite the same mechanism label.",
  "rejected": "Similarity: 0.90\n\nReasoning: Both use subversion humor so they are very similar."
}
```

---

## Existing Infrastructure

| Component | Status | Adaptation Needed |
|-----------|--------|-------------------|
| `scripts/fine-tune-gemini.js` | Exists | Add DPO mode flag |
| `datasets/fine-tuning/*.jsonl` | Exists | New format for pairs |
| Vertex AI credentials | Configured | None |
| `023_clip_relationships.sql` | Ready | Use for matrix storage |
| `/api/relationships/infer` | 90% done | Use for bootstrapping |

---

## Phased Implementation

### Phase 1: Training Data Collection

**Goal:** Collect 30-50 annotated preference pairs for first H1 (quality_ranking)

**Option A: Manual annotation UI**
- Build `h1-lab` page for side-by-side clip comparison
- Annotator writes note + picks winner

**Option B: Bootstrap from existing endpoint**
- Use `/api/relationships/infer` to generate candidate judgments
- Human reviews and corrects
- Faster data collection

**Files:**
- `src/app/h1-lab/page.tsx` - Annotation UI
- `src/app/api/h1/annotations/route.ts` - CRUD
- `supabase/migrations/024_h1_training.sql` - Training data tables

**Database schema:**
```sql
CREATE TABLE h1_training_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h1_type TEXT NOT NULL,
  clip_a_id UUID REFERENCES analyzed_videos(id),
  clip_b_id UUID REFERENCES analyzed_videos(id),
  human_note TEXT NOT NULL,
  winner TEXT NOT NULL,  -- 'clip_a' | 'clip_b' | 'tie'
  winner_reasoning TEXT,
  loser_reasoning TEXT,
  confidence FLOAT,
  annotated_by UUID,
  annotation_quality TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT now()
);
```

### Phase 2: DPO Training Pipeline

**Goal:** Adapt fine-tuning scripts for DPO preference format

**Files:**
- `scripts/export-h1-dpo-training.js` - Convert annotations to DPO JSONL
- `scripts/fine-tune-h1-dpo.js` - Submit DPO training job to Vertex AI
- `datasets/fine-tuning/h1_quality_ranking_dpo.jsonl` - Training data

**Vertex AI DPO training job:**
```javascript
const tuningJob = {
  baseModel: 'gemini-2.5-flash',
  supervisedTuningSpec: null,
  preferenceOptimizationSpec: {
    trainingDatasetUri: 'gs://hagen-training/h1_quality_ranking_dpo.jsonl',
    validationDatasetUri: 'gs://hagen-training/h1_quality_ranking_dpo_val.jsonl',
  },
  tunedModelDisplayName: 'h1-quality-ranking-v1',
};
```

**Note:** Google recommends SFT first on preferred responses, then DPO. May need two-stage training.

### Phase 3: Matrix Generation

**Goal:** Run trained model across all clip pairs to build relational matrix

**Files:**
- `scripts/generate-h1-matrix.js` - Batch prediction script
- Store results in `h1_relational_matrices` table

**Process:**
1. Load all clips with analysis data
2. For each pair (N*(N-1)/2 pairs):
   - Format DPO-style prompt
   - Call trained H1 model
   - Parse response for winner/reasoning/confidence
   - Store in matrix table
3. For quality_ranking: Compute global hierarchy from pairwise results

### Phase 4: Additional H1 Models

Repeat Phases 1-3 for:
- `humor_similarity` - How similar is the comedic approach?
- `replicability_similarity` - How similar are production requirements?
- `audience_fit` - Would same audience enjoy both?

### Phase 5: Runtime Blending

**Goal:** Customer recommendations via blended H1 queries

**Files:**
- `src/lib/services/recommendations/h1-blender.ts`
- `src/app/api/recommendations/blend/route.ts`

---

## Key Files Summary

| File | Purpose | Phase |
|------|---------|-------|
| `supabase/migrations/024_h1_training.sql` | Training data + matrix tables | 1 |
| `src/app/h1-lab/page.tsx` | Annotation UI | 1 |
| `src/app/api/h1/annotations/route.ts` | CRUD for annotations | 1 |
| `scripts/export-h1-dpo-training.js` | Convert to DPO JSONL | 2 |
| `scripts/fine-tune-h1-dpo.js` | Vertex AI DPO training | 2 |
| `datasets/fine-tuning/h1_quality_ranking_dpo.jsonl` | Training data | 2 |
| `scripts/generate-h1-matrix.js` | Matrix generation | 3 |
| `src/lib/services/recommendations/h1-blender.ts` | Runtime blending | 5 |

---

## Training Data Requirements

| H1 Model Version | Pairs Needed | Expected Capability |
|------------------|--------------|---------------------|
| v1 (MVP) | 30-50 | Basic preferences, obvious cases |
| v2 | 70-100 | Pattern recognition, nuanced cases |
| v3+ | 150+ | Deep semantic layer, predictive |

---

## Sources

- [Vertex AI Preference Tuning](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-use-preference-tuning)
- [Gemini DPO Data Prep Notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/tuning/dpo_gemini_data_prep_tuning.ipynb)
- [OpenAI DPO Guide](https://cookbook.openai.com/examples/fine_tuning_direct_preference_optimization_guide)
- [Hugging Face DPO Trainer](https://huggingface.co/docs/trl/main/en/dpo_trainer)
