# Component 06: Model Training Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Model Training Pipeline
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on how the preference model is trained, including data preparation, feature engineering, model selection, evaluation, and deployment.

### Output: Match Percentage (0-100)

The model outputs a **match percentage** (0-100) for each concept/user pair, which combines:
- **Concept Quality Score (60%)**: Intrinsic quality based on video analysis features
- **Profile Fit Score (40%)**: How well the concept matches the user's profile

This replaces the previous "virality score" (0-10) with a user-centric metric that answers: "How good is this concept *for this specific user*?"

---

## CRITICAL CONTEXT: Solo Rater Model

### This Is NOT Crowdsourced Data

The preference model is trained on ratings from **ONE PERSON** (the owner), not crowdsourced data. This fundamentally shapes the approach:

| Crowdsourced Model | Solo Rater Model |
|-------------------|------------------|
| Average across many tastes | Learn one person's taste |
| Needs 10K+ ratings | Can work with 200-500 ratings |
| Diverse, noisy signal | Consistent, personal signal |
| Predicts "popular with masses" | Predicts "this person will like it" |
| Hard to explain predictions | Can explain in owner's terms |

### Why This Works

The owner has already rated ~50 videos. Through 500 ratings, the model learns:
- "Owner rates higher when `script.replicability.score > 7`"
- "Owner rates lower when `trends.memeDependent = true`"
- "Owner ignores `visual.hookStrength` (no correlation with ratings)"

### Known Owner Preferences (From Prior Analysis)

The owner has stated preferences documented in `AI_HANDOFF.md`:

```typescript
const knownPreferences = {
  likes: [
    'Script-driven comedy with strong concept core',
    'Self-deprecating humor (business makes fun of itself)',
    'Low production value is fine ("authentic" look)',
    'One person can execute (solopreneur-friendly)',
    'Industry-agnostic formats (swappable premise)',
    'Strong payoff that subverts expectation'
  ],
  dislikes: [
    'Meme-dependent content (needs context)',
    'Trending sounds (dates quickly)',
    'High production requirements',
    'Attractive-person dependent (relies on looks)',
    'Complex multi-person choreography'
  ]
};
```

These preferences should **correlate with features** after training. If they don't, something is wrong.

### The Gemini Insight

A key insight from the system: **Gemini's own subjective scores may correlate with human ratings**.

Gemini extracts many "opinion" fields:
- `replicability.score` (1-10)
- `comedyStyle.commitmentLevel` (1-10)
- `standalone.worksWithoutContext` (boolean)
- `payoff.surpriseRating` (1-10)

These are Gemini's opinions, not objective facts. But they might predict human ratings because:
1. Gemini was trained on human-generated content and ratings
2. Gemini's "taste" may overlap with owner's taste
3. The prompt asks Gemini to evaluate from a business owner's perspective

**Hypothesis to test**: `script.replicability.score` may be the #1 predictor of `overall_score`.

---

## Current Data State (December 2025)

| Metric | Count |
|--------|-------|
| Total videos imported | ~102 |
| Videos with GCS upload | ~73 |
| Videos with v3 (full analysis) | ~51 |
| Videos with human ratings | ~50 |
| **Training-ready (v3 + rating)** | **~51** |

**The 51-video overlap is the starting dataset.** We need to grow this to 200+ for first model.

---

## Budget Constraint: $100-1000

The training approach must fit within this budget:

| Approach | Cost | Feasibility |
|----------|------|-------------|
| Simple regression (Ridge) | Free (Python/Node) | ✅ MVP |
| Random Forest | Free (Python) | ✅ After 500 ratings |
| Custom GPT fine-tuning | $50-200 | ⚠️ Later if needed |
| Neural network | Infrastructure cost | ❌ Overkill |

**Decision**: Start with Ridge regression. Zero infrastructure cost, runs locally.

---

## 1. Training Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              MODEL TRAINING PIPELINE                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   EXTRACT    │───▶│   PREPARE    │───▶│    TRAIN     │───▶│   EVALUATE   │          │
│  │    Data      │    │   Features   │    │    Model     │    │   & Deploy   │          │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │                   │
│         ▼                   ▼                   ▼                   ▼                   │
│  • video_ratings      • Flatten JSON      • Correlation     • Cross-validation         │
│  • visual_analysis    • Normalize         • Ridge/RF        • Store weights            │
│  • Filter v3 only     • One-hot encode    • Feature select  • Activate version         │
│                       • Handle arrays                                                    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Extraction

### Input Requirements

```typescript
interface TrainingDataRequirements {
  minimumVideos: 200;                    // Minimum for first model
  analysisVersion: 'v3';                 // Only v3 has full features
  requiredFields: [
    'overall_score',                     // Target variable
    'visual_analysis.feature_count'      // Must be >= 100
  ];
  
  // Current state (Dec 2025)
  currentReadyVideos: 51;               // Need 149 more
  targetMilestones: [100, 200, 300, 500];
}
```

### Extraction Query

```sql
-- Extract training data
SELECT 
  vr.id as rating_id,
  vr.video_id,
  vr.overall_score,
  vr.dimensions,
  vr.notes,
  vr.rated_at,
  av.visual_analysis,
  av.video_url
FROM video_ratings vr
JOIN analyzed_videos av ON vr.video_id = av.id
WHERE 
  av.visual_analysis->>'feature_count' IS NOT NULL
  AND (av.visual_analysis->>'feature_count')::int >= 100
  AND vr.rater_type = 'owner'  -- Only owner ratings for training
ORDER BY vr.rated_at;
```

### Export Script

```typescript
// scripts/export-training-data.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function exportTrainingData() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
  
  const { data: ratings, error } = await supabase
    .from('video_ratings')
    .select(`
      id,
      video_id,
      overall_score,
      dimensions,
      notes,
      rated_at,
      video:analyzed_videos (
        video_url,
        visual_analysis
      )
    `)
    .not('video.visual_analysis->feature_count', 'is', null)
    .gte('video.visual_analysis->feature_count', 100)
    .eq('rater_type', 'owner')
    .order('rated_at');
  
  if (error) throw error;
  
  // Filter to v3 only
  const v3Ratings = ratings.filter(r => {
    const analysis = r.video?.visual_analysis;
    return analysis && 
           analysis.feature_count >= 100 && 
           analysis.comedyStyle !== undefined;
  });
  
  console.log(`Exported ${v3Ratings.length} v3 ratings`);
  
  fs.writeFileSync(
    `exports/training_data_${new Date().toISOString().split('T')[0]}.json`,
    JSON.stringify(v3Ratings, null, 2)
  );
  
  return v3Ratings;
}
```

---

## 3. Feature Engineering

### 3.1 Flatten Nested JSON

```typescript
// Convert nested JSON to flat dot-notation keys
function flattenAnalysis(analysis: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(analysis)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value === null || value === undefined) {
      flattened[fullKey] = null;
    } else if (Array.isArray(value)) {
      // Handle arrays specially
      flattened[`${fullKey}_count`] = value.length;
      flattened[`${fullKey}_empty`] = value.length === 0;
      
      // For string arrays, create presence flags for common values
      if (value.every(v => typeof v === 'string')) {
        value.forEach(v => {
          flattened[`${fullKey}_has_${sanitize(v)}`] = true;
        });
      }
    } else if (typeof value === 'object') {
      // Recurse into nested objects
      Object.assign(flattened, flattenAnalysis(value, fullKey));
    } else {
      flattened[fullKey] = value;
    }
  }
  
  return flattened;
}

function sanitize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
}
```

**Example Transformation**:
```
Input:
{
  "script": {
    "replicability": {
      "score": 9,
      "requiredElements": ["Person", "Reaction"]
    }
  },
  "audio": {
    "soundEffects": ["laugh", "ding"]
  }
}

Output:
{
  "script.replicability.score": 9,
  "script.replicability.requiredElements_count": 2,
  "script.replicability.requiredElements_empty": false,
  "script.replicability.requiredElements_has_person": true,
  "script.replicability.requiredElements_has_reaction": true,
  "audio.soundEffects_count": 2,
  "audio.soundEffects_empty": false,
  "audio.soundEffects_has_laugh": true,
  "audio.soundEffects_has_ding": true
}
```

### 3.2 Handle Data Types

```typescript
interface FeatureMetadata {
  name: string;
  type: 'numeric' | 'boolean' | 'categorical' | 'text';
  values?: string[];           // For categorical
  min?: number;                // For numeric
  max?: number;                // For numeric
  nullCount: number;
  coverage: number;            // % of videos with this feature
}

function categorizeFeatures(flattenedData: Record<string, any>[]): Map<string, FeatureMetadata> {
  const metadata = new Map<string, FeatureMetadata>();
  
  // Collect all keys across all records
  const allKeys = new Set<string>();
  flattenedData.forEach(record => {
    Object.keys(record).forEach(key => allKeys.add(key));
  });
  
  for (const key of allKeys) {
    const values = flattenedData.map(d => d[key]).filter(v => v !== undefined && v !== null);
    const nullCount = flattenedData.length - values.length;
    const coverage = values.length / flattenedData.length;
    
    if (values.length === 0) {
      metadata.set(key, { name: key, type: 'numeric', nullCount, coverage });
      continue;
    }
    
    const sample = values[0];
    
    if (typeof sample === 'boolean') {
      metadata.set(key, { name: key, type: 'boolean', nullCount, coverage });
    } else if (typeof sample === 'number') {
      metadata.set(key, {
        name: key,
        type: 'numeric',
        min: Math.min(...values as number[]),
        max: Math.max(...values as number[]),
        nullCount,
        coverage
      });
    } else if (typeof sample === 'string') {
      const uniqueValues = [...new Set(values as string[])];
      if (uniqueValues.length <= 20) {
        metadata.set(key, {
          name: key,
          type: 'categorical',
          values: uniqueValues,
          nullCount,
          coverage
        });
      } else {
        metadata.set(key, { name: key, type: 'text', nullCount, coverage });
      }
    }
  }
  
  return metadata;
}
```

### 3.3 Normalize Features

```typescript
interface NormalizationConfig {
  numeric: {
    method: 'min-max' | 'z-score' | 'robust';
    params: Record<string, { min?: number; max?: number; mean?: number; std?: number }>;
  };
  categorical: {
    method: 'one-hot' | 'label';
    mappings: Record<string, Record<string, number>>;
  };
}

function normalizeNumeric(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function normalizeFeatures(
  data: Record<string, any>[], 
  metadata: Map<string, FeatureMetadata>
): { normalized: number[][]; featureNames: string[]; config: NormalizationConfig } {
  const featureNames: string[] = [];
  const config: NormalizationConfig = {
    numeric: { method: 'min-max', params: {} },
    categorical: { method: 'one-hot', mappings: {} }
  };
  
  // Build feature list
  for (const [key, meta] of metadata) {
    if (meta.coverage < 0.5) continue; // Skip features with <50% coverage
    if (meta.type === 'text') continue; // Skip text features
    
    if (meta.type === 'numeric' || meta.type === 'boolean') {
      featureNames.push(key);
      if (meta.type === 'numeric') {
        config.numeric.params[key] = { min: meta.min, max: meta.max };
      }
    } else if (meta.type === 'categorical' && meta.values) {
      // One-hot encode
      const mapping: Record<string, number> = {};
      meta.values.forEach((v, i) => {
        featureNames.push(`${key}_${sanitize(v)}`);
        mapping[v] = i;
      });
      config.categorical.mappings[key] = mapping;
    }
  }
  
  // Normalize each record
  const normalized = data.map(record => {
    const features: number[] = [];
    
    for (const name of featureNames) {
      if (name.includes('_') && config.categorical.mappings[name.split('_')[0]]) {
        // One-hot encoded categorical
        const [baseKey, value] = [
          name.substring(0, name.lastIndexOf('_')),
          name.substring(name.lastIndexOf('_') + 1)
        ];
        const actualValue = record[baseKey];
        features.push(sanitize(actualValue || '') === value ? 1 : 0);
      } else {
        // Numeric or boolean
        const value = record[name];
        const meta = metadata.get(name);
        
        if (value === null || value === undefined) {
          features.push(0); // Default for missing
        } else if (meta?.type === 'boolean') {
          features.push(value ? 1 : 0);
        } else if (meta?.type === 'numeric') {
          features.push(normalizeNumeric(value, meta.min!, meta.max!));
        } else {
          features.push(0);
        }
      }
    }
    
    return features;
  });
  
  return { normalized, featureNames, config };
}
```

---

## 4. Correlation Analysis

### 4.1 Calculate Correlations

```typescript
interface CorrelationResult {
  feature: string;
  correlation: number;          // Pearson correlation with overall_score
  pValue: number;
  significanceLevel: 'high' | 'medium' | 'low' | 'none';
}

function calculateCorrelations(
  features: number[][], 
  targets: number[],
  featureNames: string[]
): CorrelationResult[] {
  const results: CorrelationResult[] = [];
  
  for (let i = 0; i < featureNames.length; i++) {
    const featureValues = features.map(row => row[i]);
    const { correlation, pValue } = pearsonCorrelation(featureValues, targets);
    
    let significanceLevel: CorrelationResult['significanceLevel'];
    if (Math.abs(correlation) >= 0.5 && pValue < 0.01) {
      significanceLevel = 'high';
    } else if (Math.abs(correlation) >= 0.3 && pValue < 0.05) {
      significanceLevel = 'medium';
    } else if (Math.abs(correlation) >= 0.15 && pValue < 0.1) {
      significanceLevel = 'low';
    } else {
      significanceLevel = 'none';
    }
    
    results.push({
      feature: featureNames[i],
      correlation,
      pValue,
      significanceLevel
    });
  }
  
  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function pearsonCorrelation(x: number[], y: number[]): { correlation: number; pValue: number } {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return { correlation: 0, pValue: 1 };
  
  const correlation = numerator / denominator;
  
  // Calculate p-value using t-distribution approximation
  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  const pValue = 2 * (1 - tDistributionCDF(Math.abs(t), n - 2));
  
  return { correlation, pValue };
}
```

### 4.2 Expected Top Correlations (Based on Known Preferences)

The owner's stated preferences (from `AI_HANDOFF.md`) should map to specific features. **Use this as a validation checklist after correlation analysis.**

```typescript
const expectedCorrelations = {
  // POSITIVE: Owner likes these → should correlate positively with overall_score
  strongPositive: [
    'script.replicability.score',           // Easy to replicate
    'script.humor.comedyTiming',            // Good timing
    'standalone.worksWithoutContext',       // Self-contained
    'comedyStyle.contrastMechanism.present', // Uses contrast
    'flexibility.swappableCore',            // Adaptable
    'script.structure.payoffStrength',      // Strong ending
    'casting.minimumPeople',                // Fewer = better (inverse)
  ],
  
  // NEGATIVE: Owner dislikes these → should correlate negatively
  strongNegative: [
    'trends.memeDependent',                 // Relies on meme
    'trends.usesPremadeSound',              // Uses trending sound
    'casting.actingSkillRequired',          // Needs good actors
    'production.shotComplexity',            // Complex production
    'audio.soundEffects_count',             // Heavy sound effects
    'flexibility.industryLock',             // Industry-specific
    'casting.attractivenessDependency',     // Relies on looks
  ]
};
```

---

## 5. Model Training

### 5.1 Model Selection

```typescript
interface ModelConfig {
  type: 'ridge' | 'random_forest' | 'gradient_boosting' | 'neural_network';
  hyperparameters: Record<string, any>;
}

// Recommended for initial model
const initialModelConfig: ModelConfig = {
  type: 'ridge',
  hyperparameters: {
    alpha: 1.0,           // Regularization strength
    normalize: true,
    solver: 'auto'
  }
};

// For more complex patterns (after 500+ ratings)
const advancedModelConfig: ModelConfig = {
  type: 'random_forest',
  hyperparameters: {
    n_estimators: 100,
    max_depth: 10,
    min_samples_split: 5,
    min_samples_leaf: 2
  }
};
```

### 5.2 Training Implementation (Python)

```python
# train_model.py
import json
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import pickle

def load_training_data(filepath: str):
    with open(filepath, 'r') as f:
        data = json.load(f)
    return data

def prepare_features(data: list, feature_names: list):
    """Extract and normalize features from training data."""
    X = []
    y = []
    
    for record in data:
        features = []
        for name in feature_names:
            value = get_nested_value(record['video']['visual_analysis'], name)
            features.append(normalize_value(value, name))
        X.append(features)
        y.append(record['overall_score'])
    
    return np.array(X), np.array(y)

def train_model(X, y, config):
    """Train the preference model."""
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Select model
    if config['type'] == 'ridge':
        model = Ridge(**config['hyperparameters'])
    elif config['type'] == 'random_forest':
        model = RandomForestRegressor(**config['hyperparameters'])
    
    # Train
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    metrics = {
        'mae': mean_absolute_error(y_test, y_pred),
        'rmse': np.sqrt(mean_squared_error(y_test, y_pred)),
        'r2': r2_score(y_test, y_pred)
    }
    
    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=5, scoring='neg_mean_absolute_error')
    metrics['cv_mae'] = -cv_scores.mean()
    metrics['cv_mae_std'] = cv_scores.std()
    
    return model, metrics

def extract_feature_weights(model, feature_names):
    """Extract feature importance/weights from trained model."""
    if hasattr(model, 'coef_'):
        # Linear model (Ridge)
        weights = dict(zip(feature_names, model.coef_))
    elif hasattr(model, 'feature_importances_'):
        # Tree-based model (Random Forest)
        weights = dict(zip(feature_names, model.feature_importances_))
    else:
        weights = {}
    
    return weights

def save_model_version(model, weights, metrics, version_tag):
    """Save model and metadata."""
    output = {
        'version_tag': version_tag,
        'trained_at': datetime.now().isoformat(),
        'feature_weights': weights,
        'accuracy_metrics': metrics
    }
    
    with open(f'models/{version_tag}_metadata.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    with open(f'models/{version_tag}_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    
    return output

# Main training script
if __name__ == '__main__':
    # Load data
    data = load_training_data('exports/training_data_2025-12-15.json')
    print(f"Loaded {len(data)} training samples")
    
    # Feature engineering
    feature_names = get_selected_features()  # Top 50 correlated features
    X, y = prepare_features(data, feature_names)
    print(f"Prepared {X.shape[1]} features")
    
    # Train model
    config = {
        'type': 'ridge',
        'hyperparameters': {'alpha': 1.0}
    }
    model, metrics = train_model(X, y, config)
    print(f"Model metrics: MAE={metrics['mae']:.3f}, R²={metrics['r2']:.3f}")
    
    # Extract weights
    weights = extract_feature_weights(model, feature_names)
    
    # Save
    version = 'v1.0'
    save_model_version(model, weights, metrics, version)
    print(f"Saved model version {version}")
```

---

## 6. Model Evaluation

### 6.1 Metrics

```typescript
interface ModelMetrics {
  mae: number;                // Mean Absolute Error (target: < 0.15)
  rmse: number;               // Root Mean Squared Error
  r2: number;                 // R-squared (target: > 0.6)
  cv_mae: number;             // Cross-validation MAE
  cv_mae_std: number;         // CV standard deviation
  
  // Per-dimension metrics (optional)
  dimension_metrics?: {
    hook: MetricSet;
    pacing: MetricSet;
    payoff: MetricSet;
    originality: MetricSet;
    rewatchable: MetricSet;
  };
}

interface MetricSet {
  mae: number;
  rmse: number;
  r2: number;
}
```

### 6.2 Evaluation Criteria

| Metric | Threshold | Status |
|--------|-----------|--------|
| MAE | < 0.15 | ✅ Production ready |
| MAE | 0.15-0.20 | ⚠️ Acceptable, continue training |
| MAE | > 0.20 | ❌ Needs more data or feature engineering |
| R² | > 0.6 | ✅ Good predictive power |
| R² | 0.4-0.6 | ⚠️ Moderate, may need more features |
| R² | < 0.4 | ❌ Low predictive power |

### 6.3 Error Analysis

```python
def analyze_errors(y_true, y_pred, data):
    """Identify patterns in prediction errors."""
    errors = y_pred - y_true
    
    analysis = {
        'overestimated': [],  # Videos rated lower than predicted
        'underestimated': [], # Videos rated higher than predicted
        'patterns': {}
    }
    
    for i, error in enumerate(errors):
        video_info = {
            'video_id': data[i]['video_id'],
            'actual': y_true[i],
            'predicted': y_pred[i],
            'error': error,
            'notes': data[i].get('notes', '')
        }
        
        if error > 0.2:
            analysis['overestimated'].append(video_info)
        elif error < -0.2:
            analysis['underestimated'].append(video_info)
    
    # Look for patterns in errors
    # E.g., model overestimates videos with high hook but weak payoff
    
    return analysis
```

---

## 7. Model Deployment

### 7.1 Store in Database

```sql
-- Insert new model version
INSERT INTO model_versions (
  version_tag,
  trained_at,
  training_video_count,
  feature_weights,
  accuracy_metrics,
  notes,
  is_active
) VALUES (
  'v1.0',
  '2025-12-15T00:00:00Z',
  200,
  '{"script.replicability.score": 0.82, "trends.memeDependent": -0.68, ...}',
  '{"mae": 0.12, "rmse": 0.15, "r2": 0.68}',
  'First production model',
  false  -- Don't activate yet
);

-- Activate new model (deactivate old)
BEGIN;
UPDATE model_versions SET is_active = false WHERE is_active = true;
UPDATE model_versions SET is_active = true WHERE version_tag = 'v1.0';
COMMIT;
```

### 7.2 Inference Endpoint

```typescript
// lib/model/match.ts
import { getActiveModel } from './loader';

interface MatchResult {
  matchPercentage: number;        // 0-100
  conceptScore: number;           // 0-1 (intrinsic quality)
  profileFitScore: number;        // 0-1 (user fit)
  whyItFits: string[];            // Plain language reasons
  considerations: string[];       // Things to consider
}

export async function calculateMatch(
  analysis: DeepAnalysis,
  userProfile: UserProfile
): Promise<MatchResult> {
  const model = await getActiveModel();

  // 1. Calculate concept quality score (intrinsic to the video)
  const conceptScore = calculateConceptScore(analysis, model);

  // 2. Calculate profile fit score (user-specific)
  const profileFitScore = calculateProfileFit(analysis, userProfile);

  // 3. Combine scores (60% concept, 40% profile)
  const combinedScore = (conceptScore * 0.6) + (profileFitScore * 0.4);

  // 4. Generate plain-language explanations
  const whyItFits = generateFitReasons(analysis, userProfile);
  const considerations = generateConsiderations(analysis, userProfile);

  return {
    matchPercentage: Math.round(combinedScore * 100),
    conceptScore,
    profileFitScore,
    whyItFits,
    considerations
  };
}

function calculateConceptScore(analysis: DeepAnalysis, model: ModelVersion): number {
  const features = flattenAnalysis(analysis);
  const normalized = normalizeWithConfig(features, model.normalizationConfig);

  let score = 0;
  for (const [feature, weight] of Object.entries(model.featureWeights)) {
    const value = normalized[feature] ?? 0;
    score += value * weight;
  }

  return Math.max(0, Math.min(1, score));
}

function calculateProfileFit(analysis: DeepAnalysis, profile: UserProfile): number {
  let fitScore = 0;

  // Industry match
  const conceptIndustries = analysis.flexibility?.industryFit || [];
  const industryMatch = profile.industry_tags.some(t =>
    conceptIndustries.includes(t)
  );
  fitScore += industryMatch ? 0.3 : 0;

  // Resource constraints match
  const peopleNeeded = analysis.casting?.minimumPeople || 1;
  const resourceFit = profile.constraints.includes('solo')
    ? (peopleNeeded === 1 ? 0.3 : 0.1)
    : 0.2;
  fitScore += resourceFit;

  // Goal alignment
  const goalFit = assessGoalAlignment(analysis, profile.goals);
  fitScore += goalFit * 0.4;

  return Math.min(1, fitScore);
}
```

---

## 8. Training Milestones

### At 100 Ratings
```
- Run correlation analysis only
- Identify top 20 positive and negative correlations
- Validate against expected correlations
- Create feature_importance_snapshot
- NO model training yet (insufficient data)
```

### At 200 Ratings
```
- Train first model (Ridge regression)
- Target: MAE < 0.20
- Store as v1.0
- Create snapshot
- Activate if metrics acceptable
```

### At 300 Ratings
```
- Retrain model
- Compare to v1.0
- If improved, store as v1.1
- Consider feature pruning (remove |correlation| < 0.1)
- Update snapshot
```

### At 500 Ratings
```
- Try Random Forest model
- Compare Ridge vs RF
- Select best performer
- Store as v2.0 if significant improvement
- Consider multi-output for dimension prediction
```

---

## 9. Continuous Learning

### When to Retrain

```typescript
interface RetrainTrigger {
  newRatingsThreshold: 50;     // Retrain after 50 new ratings
  performanceDegradation: 0.05; // Retrain if MAE increases by 0.05
  featureDrift: 0.1;           // Retrain if feature distribution shifts
}

async function checkRetrainNeeded(): Promise<boolean> {
  const lastModel = await getActiveModel();
  const newRatingsCount = await getNewRatingsSince(lastModel.trained_at);
  
  if (newRatingsCount >= 50) {
    console.log('Retrain trigger: New ratings threshold');
    return true;
  }
  
  // Check live performance
  const recentPredictions = await getRecentPredictions(100);
  const currentMAE = calculateMAE(recentPredictions);
  
  if (currentMAE - lastModel.accuracy_metrics.mae > 0.05) {
    console.log('Retrain trigger: Performance degradation');
    return true;
  }
  
  return false;
}
```

---

## 10. Files and Scripts

| File | Purpose |
|------|---------|
| `scripts/export-training-data.ts` | Export rated videos with v3 analysis |
| `scripts/train_model.py` | Train preference model |
| `scripts/evaluate_model.py` | Evaluate model performance |
| `scripts/deploy_model.ts` | Upload model to database |
| `lib/model/predict.ts` | Inference endpoint |
| `lib/model/loader.ts` | Load active model from database |

---

## Related Documents

- [Pricing Logic Deep Dive](./03_PRICING_LOGIC.md) - Uses match percentage for pricing
- [Profile and Matching](./12_PROFILE_AND_MATCHING.md) - User profile and matching logic
- [Feature Schema Reference](../reference/FEATURE_SCHEMA.md) - All 170+ features
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Model storage

---

*This document provides exhaustive detail on model training. Refer to specific component documents for usage patterns.*
