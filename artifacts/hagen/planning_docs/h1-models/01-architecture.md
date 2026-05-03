# H1 Models - Architecture

## Core Concept

A system of **pre-trained H1 models**, each answering a specific question about clip relationships. Each H1 model:
- Is trained separately on annotated clip pairs + human notes
- Learns a semantic layer that connects simple notes to 150+ variables
- Outputs a full relational matrix (all clips to all clips)

At runtime, customer profiles query multiple H1 models, and results are merged to produce recommendations.

---

## What is an H1?

An H1 is a **core question** that organizes a relational matrix:

| H1 Question | What It Answers | Variables Used |
|-------------|-----------------|----------------|
| "What clips are similar in humor?" | Humor style relationships | Primarily humor analysis |
| "What clips are similar in replicability?" | Production similarity | Primarily replicability analysis |
| "What content is better than others?" | Quality hierarchy | ALL sources (rich H1) |
| "What clips fit sophisticated audiences?" | Audience segmentation | Audience signals across all |

### One Model Per H1

Each H1 gets its own trained model:

```
humor-similarity-model
    ├── Training: clip pairs + notes about humor similarity
    ├── Learns: What "funnier", "clever", "similar style" MEAN
    └── Output: Humor relational matrix (all clips × all clips)

quality-ranking-model (RICH H1)
    ├── Training: clip pairs + notes about quality
    ├── Learns: What "better", "more engaging", "less likely to fall flat" MEAN
    ├── Pulls from: analyze-rate-v1 + humor + replicability (150+ variables)
    └── Output: Quality relational matrix (all clips × all clips)
```

---

## How Training Works

### Training Data Format

Simple notes - not exhaustive variable mapping:

```jsonl
{
  "h1": "quality_ranking",
  "clip_a": {
    "video_id": "clip_a_id",
    "video_uri": "gs://...",
    "all_variables": { "...150+ fields from all three sources..." }
  },
  "clip_b": {
    "video_id": "clip_b_id",
    "video_uri": "gs://...",
    "all_variables": { "...150+ fields..." }
  },
  "human_note": "The first clip is slightly better. Leaving replicability, which may not be the biggest factor here for the average business, this clip has a creative script that is more fun.",
  "judgment": {
    "clip_a_rank": 1,
    "clip_b_rank": 2,
    "strength_difference": 0.15
  }
}
```

### What the Model Learns ("AI Magic")

The note says: *"creative script that is more fun"*

The model sees 150+ variables and learns:
- "Creative script" correlates with certain humor_mechanism + payoff combinations
- "More fun" connects to engagement_style + hook patterns
- "Less likely to fall flat" relates to replicability_skill_level + concept robustness

**The human doesn't specify which variables** - the model discovers the connections through training on many examples.

### Training Progression

```
20-30 annotated pairs:
    Model learns basic vocabulary
    "Better" starts to have meaning

50-70 annotated pairs:
    Model finds patterns across variables
    Can predict obvious quality differences

100+ annotated pairs:
    Model has deep semantic layer
    Predicts relationships without notes
    Discovers connections humans didn't explicitly state
```

---

## Matrix Output

Each H1 model produces a **full relational matrix**:

```
             Clip1  Clip2  Clip3  Clip4  ...  Clip200
    Clip1      -     0.72   0.45   0.88   ...   0.33
    Clip2    0.72     -     0.61   0.55   ...   0.78
    Clip3    0.45   0.61     -     0.29   ...   0.41
    Clip4    0.88   0.55   0.29     -     ...   0.67
    ...
    Clip200  0.33   0.78   0.41   0.67   ...    -
```

For quality-ranking H1, this becomes a hierarchy:
- Clip4 > Clip1 > Clip2 > Clip3 > ... > Clip200
- Can surface: "This is content we think is high quality"

---

## Runtime: Customer Recommendations

### How Blending Works

Customer profile triggers queries to multiple H1 models:

```
Customer Profile: "Edgy café brand, needs replicable content"
         ↓
Query humor-similarity-model:
    → "Which clips match edgy humor style?"
    → Returns: ranked clips from humor matrix

Query replicability-model:
    → "Which clips are easy to replicate?"
    → Returns: ranked clips from replicability matrix

Query quality-ranking-model:
    → "Which clips are highest quality?"
    → Returns: ranked clips from quality matrix
         ↓
Merge results based on customer needs:
    - 50% humor fit
    - 30% replicability
    - 20% quality
         ↓
Final recommendation: Clips ranked for this customer
```

### Refinement Per Circumstance

The blend percentages can be:
- 100% one model (pure humor matching)
- Custom blend (50/30/20)
- Refined by circumstance (this customer cares more about replicability)

---

## Rich H1s

### What Makes an H1 "Rich"?

A rich H1 pulls from **all three analysis sources**:

| Source | Variables | Example Fields |
|--------|-----------|----------------|
| analyze-rate-v1 | ~60 fields | hook_style, narrative_momentum, payoff_type, production_polish |
| humor analysis | ~40 fields | humor_mechanism, handling, misdirection, edit_as_punchline |
| replicability | ~50 fields | actor_count, skill_level, time_investment, product_swappable |

### Example Rich H1: Quality Ranking

Training note:
> "The first clip is slightly better. Leaving replicability, which may not be the biggest factor here for the average business, this clip has a creative script that is more fun. It uses a more engaging and delightful style of content, and it's less likely for the piece of content to fall flat if someone else replicates it."

What the model learns:
- "Creative script" → humor variables
- "More engaging and delightful" → analyze-rate-v1 variables
- "Less likely to fall flat" → replicability robustness variables
- "Not the biggest factor for average business" → context-dependent weighting

The model forms **deep networks of meaning** across all 150+ variables.

---

## Database Schema

### Training Data Collection

```sql
-- Annotated pairs for H1 model training
CREATE TABLE h1_training_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h1_type TEXT NOT NULL,  -- 'humor_similarity' | 'quality_ranking' | etc.
  clip_a_id UUID REFERENCES analyzed_videos(id) NOT NULL,
  clip_b_id UUID REFERENCES analyzed_videos(id) NOT NULL,
  human_note TEXT NOT NULL,
  judgment JSONB NOT NULL,
  annotated_by UUID REFERENCES profiles(id),
  annotation_quality TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(h1_type, clip_a_id, clip_b_id)
);

-- Trained H1 model versions
CREATE TABLE h1_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h1_type TEXT NOT NULL,
  version_name TEXT NOT NULL,
  training_pairs_count INT,
  vertex_job_id TEXT,
  gemini_model_id TEXT,
  status TEXT DEFAULT 'training',
  is_active BOOLEAN DEFAULT false,
  eval_accuracy FLOAT,
  eval_notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(h1_type, version_name)
);

-- Full relational matrices (output of H1 models)
CREATE TABLE h1_relational_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h1_model_id UUID REFERENCES h1_models(id) NOT NULL,
  clip_a_id UUID REFERENCES analyzed_videos(id) NOT NULL,
  clip_b_id UUID REFERENCES analyzed_videos(id) NOT NULL,
  score FLOAT NOT NULL,
  reasoning TEXT,
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(h1_model_id, clip_a_id, clip_b_id)
);

-- For ranking H1s, also store hierarchy
CREATE TABLE h1_quality_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h1_model_id UUID REFERENCES h1_models(id) NOT NULL,
  clip_id UUID REFERENCES analyzed_videos(id) NOT NULL,
  rank_position INT NOT NULL,
  quality_score FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(h1_model_id, clip_id)
);
```

---

## H1 Models Priority

| H1 | Complexity | Value | Build Order |
|----|------------|-------|-------------|
| `quality_ranking` | Rich (all sources) | High - surfaces best content | 1st |
| `humor_similarity` | Focused (humor) | High - core matching | 2nd |
| `replicability_similarity` | Focused | Medium - production matching | 3rd |
| `audience_fit` | Cross-source | Medium - targeting | 4th |

### Future H1s

- `brand_style_match` - Does clip match a brand's aesthetic?
- `trending_potential` - Is this format likely to perform?
- `novelty_score` - How original is this approach?

---

## Training Data Requirements

| Stage | Pairs Needed | Capability |
|-------|--------------|------------|
| v1 (MVP) | 30-50 | Basic predictions, obvious relationships |
| v2 | 70-100 | Pattern recognition, moderate accuracy |
| v3+ | 150+ | Deep semantic layer, predictive without notes |

### Note Quality

Notes should be **natural, not exhaustive**:

Good: *"This one is better - the script is more fun and it's less likely to fall flat"*

Unnecessary: *"Clip A has humor_mechanism=subversion with handling=GOOD and edit_as_punchline=true, while Clip B has..."*

The model learns to connect simple language to the 150+ variables.
