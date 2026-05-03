# Component 11: Implementation Phases Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Phased Implementation Roadmap
> **Last Updated**: January 1, 2026

---

## Overview

This document breaks down the full MVP implementation into distinct phases, with clear deliverables, dependencies, and success criteria for each phase.

---

## CRITICAL CONTEXT: Starting Point

### We're NOT Starting from Zero

**Current State (December 2025):**

| Asset | Count | Notes |
|-------|-------|-------|
| Videos imported | ~102 | In `analyzed_videos` table |
| Videos with v3 analysis | ~51 | Full 170+ features |
| Videos with human ratings | ~50 | In `video_ratings` table |
| **Training-ready (v3 + rating)** | **~51** | Ready for correlation analysis |

**This means Phase 1 is 25% complete** (51/200 target ratings).

### Budget Constraint: $100-1000

All technology choices must fit within this budget:

| Component | Approach | Cost |
|-----------|----------|------|
| Model training | Ridge regression (Python) | $0 |
| Database | Existing Supabase | $0 (free tier) |
| Hosting | Existing Vercel | $0 (free tier) |
| Gemini analysis | Existing quota | ~$0.10/video |
| Whisper transcription | OpenAI API | ~$0.006/minute |
| Translation | Gemini (not Google Translate) | ~$0.001/request |
| Payments | Stripe | 2.9% + $0.30/tx |

**Estimated Phase 1-4 cost: $50-100** (mostly Gemini for new video analysis)

### Solo Rater Model

All 200-500 target ratings come from **ONE PERSON** (the owner). This is intentional:
- We're learning one person's taste, not crowd consensus
- Consistent signal, not noisy aggregate
- Faster iteration (no coordination)

---

## Phase Summary

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              IMPLEMENTATION PHASES                                       │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   PHASE 1         PHASE 2         PHASE 3         PHASE 4         PHASE 5              │
│   ┌───────┐       ┌───────┐       ┌───────┐       ┌───────┐       ┌───────┐            │
│   │ DATA  │──────▶│ MODEL │──────▶│ MARKET│──────▶│ TRANS │──────▶│ SCALE │            │
│   │COLLECT│       │ TRAIN │       │ PLACE │       │ACTION │       │       │            │
│   └───────┘       └───────┘       └───────┘       └───────┘       └───────┘            │
│                                                                                          │
│   Duration:       Duration:       Duration:       Duration:       Duration:             │
│   2-4 weeks       1-2 weeks       2-3 weeks       1-2 weeks       Ongoing               │
│                                                                                          │
│   Milestone:      Milestone:      Milestone:      Milestone:      Milestone:            │
│   200 ratings     Model v1.0      Live catalog    First sale      10+ sales             │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Data Collection Foundation

### Duration: 2-4 weeks

### Objective
Collect 200 rated videos with v3 analysis to enable first model training.

### Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Rating UI Enhancement | Improve rating flow for efficiency | 🔲 TODO |
| Batch Rating Mode | Rate multiple videos in session | 🔲 TODO |
| Progress Dashboard | Track rating count and milestones | 🔲 TODO |
| Export Pipeline | Automated training data export | 🔲 TODO |
| Correlation Preview | View top correlations at 100 ratings | 🔲 TODO |

### Tasks

```typescript
// Phase 1 Task Breakdown
const phase1Tasks = [
  {
    id: 'P1-1',
    title: 'Rating UI Speed Optimization',
    description: 'Reduce rating time per video to under 60 seconds',
    priority: 'high',
    estimate: '3 days',
    dependencies: [],
    subtasks: [
      'Add keyboard shortcuts for dimension ratings',
      'Auto-advance to next video after rating',
      'Preload next video while rating current',
      'Show rating count and daily goal'
    ]
  },
  {
    id: 'P1-2',
    title: 'Batch Import System',
    description: 'Upload multiple videos at once for analysis',
    priority: 'medium',
    estimate: '2 days',
    dependencies: ['P1-1'],
    subtasks: [
      'Drag-and-drop upload for multiple files',
      'Queue management for analysis pipeline',
      'Progress tracking for batch uploads'
    ]
  },
  {
    id: 'P1-3',
    title: 'Milestone Dashboard',
    description: 'Visual progress toward 200 rating goal',
    priority: 'medium',
    estimate: '1 day',
    dependencies: [],
    subtasks: [
      'Rating count display',
      'Milestone markers (50, 100, 150, 200)',
      'Estimated days to milestone based on pace'
    ]
  },
  {
    id: 'P1-4',
    title: 'Training Data Export',
    description: 'Automated export of rated videos with analysis',
    priority: 'high',
    estimate: '2 days',
    dependencies: [],
    subtasks: [
      'Export to JSON with flattened features',
      'Filter by analysis version (v3 only)',
      'Include all dimension scores',
      'Scheduled daily export'
    ]
  },
  {
    id: 'P1-5',
    title: 'Correlation Analysis Tool',
    description: 'Run correlation analysis at milestones',
    priority: 'low',
    estimate: '2 days',
    dependencies: ['P1-4'],
    subtasks: [
      'Calculate Pearson correlation for all features',
      'Visualize top positive/negative correlations',
      'Compare to expected correlations',
      'Store snapshots for comparison'
    ]
  }
];
```

### Success Criteria

| Criteria | Target | How to Measure |
|----------|--------|----------------|
| Rating count | 200 videos | Database count |
| Rating pace | 10/day average | Daily tracking |
| Analysis version | 100% v3 | Query check |
| Export working | Daily exports | Cron job logs |

### Daily Workflow (During Phase 1)

```
Morning (30 min):
1. Review overnight video uploads
2. Trigger analysis for new videos
3. Check rating count progress

Midday (60 min):
4. Rate 10-15 videos
5. Quick quality check on analyses

Evening (30 min):
6. Rate 5-10 more videos
7. Review correlation trends at milestones
8. Export training data

Total: ~2 hours/day for ~4 weeks = 200 ratings
```

---

## Phase 2: Model Training

### Duration: 1-2 weeks

### Objective
Train first preference model (v1.0) with MAE < 0.20 on held-out test set.

### Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Feature Engineering Pipeline | Flatten, normalize, one-hot encode | 🔲 TODO |
| Training Script | Python training with Ridge/RF | 🔲 TODO |
| Evaluation Suite | Cross-validation and metrics | 🔲 TODO |
| Model Storage | Database storage with weights | 🔲 TODO |
| Inference Endpoint | Predict viability score | 🔲 TODO |

### Tasks

```typescript
const phase2Tasks = [
  {
    id: 'P2-1',
    title: 'Feature Engineering',
    description: 'Transform raw analysis into model features',
    priority: 'high',
    estimate: '2 days',
    dependencies: ['P1-4'],
    subtasks: [
      'Flatten nested JSON to dot-notation',
      'Handle arrays (count, presence flags)',
      'Normalize numeric features (min-max)',
      'One-hot encode categoricals',
      'Document feature list'
    ]
  },
  {
    id: 'P2-2',
    title: 'Training Pipeline',
    description: 'Build repeatable training process',
    priority: 'high',
    estimate: '3 days',
    dependencies: ['P2-1'],
    subtasks: [
      'Train/test split (80/20)',
      'Ridge regression baseline',
      'Random Forest comparison',
      'Hyperparameter tuning',
      'Feature importance extraction'
    ]
  },
  {
    id: 'P2-3',
    title: 'Evaluation and Metrics',
    description: 'Measure model performance',
    priority: 'high',
    estimate: '1 day',
    dependencies: ['P2-2'],
    subtasks: [
      'MAE, RMSE, R² calculation',
      '5-fold cross-validation',
      'Error analysis (over/underestimated)',
      'Comparison to baseline (mean)'
    ]
  },
  {
    id: 'P2-4',
    title: 'Model Storage',
    description: 'Persist model to database',
    priority: 'medium',
    estimate: '1 day',
    dependencies: ['P2-3'],
    subtasks: [
      'Create model_versions table',
      'Store feature weights as JSON',
      'Store accuracy metrics',
      'Implement version activation'
    ]
  },
  {
    id: 'P2-5',
    title: 'Inference API',
    description: 'Endpoint for predictions',
    priority: 'high',
    estimate: '1 day',
    dependencies: ['P2-4'],
    subtasks: [
      'Load active model',
      'Apply same feature engineering',
      'Return score + confidence + top factors',
      'Cache model in memory'
    ]
  }
];
```

### Success Criteria

| Criteria | Target | How to Measure |
|----------|--------|----------------|
| Model MAE | < 0.20 | Test set evaluation |
| Model R² | > 0.50 | Test set evaluation |
| CV consistency | std < 0.05 | Cross-validation |
| Inference latency | < 100ms | API timing |

### Model Training Checklist

```
□ Export training data (200+ v3 ratings)
□ Run feature engineering script
□ Document feature count and types
□ Train Ridge regression model
□ Evaluate on held-out test set
□ If MAE > 0.20:
  □ Try Random Forest
  □ Prune low-importance features
  □ Check for data issues
□ Store model as v1.0
□ Activate model
□ Test inference endpoint
□ Document model performance
```

---

## Phase 3: Marketplace Foundation

### Duration: 2-3 weeks

### Objective
Build core marketplace: concepts, listings, viewer, and **recommendations-first** discovery.

### Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| User Profile & Onboarding | AI chat to build user profile | 🔲 TODO |
| Concept Abstraction | Extract concepts from videos | 🔲 TODO |
| Listing System | 72h windows with caps | 🔲 TODO |
| Concept Viewer | In-platform video viewing | 🔲 TODO |
| Recommendations Engine | Profile-based concept matching | 🔲 TODO |
| Pricing Engine | Calculate per-market prices ($20-30 US) | 🔲 TODO |
| Expiration Cron | Auto-archive expired listings | 🔲 TODO |

### Tasks

```typescript
const phase3Tasks = [
  {
    id: 'P3-0',
    title: 'User Onboarding Chat',
    description: 'AI chat to build user profile',
    priority: 'high',
    estimate: '3 days',
    dependencies: [],
    subtasks: [
      'user_profiles table',
      'AI chat endpoint (Claude or similar)',
      'Extract business info, goals, constraints',
      'Industry tag mapping',
      'Profile completion flow'
    ]
  },
  {
    id: 'P3-1',
    title: 'Database Schema',
    description: 'Create marketplace tables',
    priority: 'high',
    estimate: '1 day',
    dependencies: [],
    subtasks: [
      'concepts table',
      'listing_windows table',
      'market_contexts table',
      'buyer_accounts table',
      'transactions table'
    ]
  },
  {
    id: 'P3-2',
    title: 'Concept Extraction',
    description: 'Create concepts from analyzed videos',
    priority: 'high',
    estimate: '2 days',
    dependencies: ['P3-1'],
    subtasks: [
      'UI to create concept from video',
      'Copy relevant analysis fields',
      'Calculate match percentage (profile-based)',
      'Calculate evergreen status',
      'Store as draft concept'
    ]
  },
  {
    id: 'P3-3',
    title: 'Listing Management',
    description: '72h listing windows with caps',
    priority: 'high',
    estimate: '3 days',
    dependencies: ['P3-2'],
    subtasks: [
      'Activate listing (create window)',
      'Countdown timer display',
      'Purchase cap tracking',
      'Market cap per-market',
      'Status transitions'
    ]
  },
  {
    id: 'P3-4',
    title: 'Concept Viewer',
    description: 'In-platform video viewing',
    priority: 'high',
    estimate: '3 days',
    dependencies: ['P3-2'],
    subtasks: [
      'Video player (no download)',
      'Analysis panels',
      'Subtitle overlay',
      'Mobile responsive'
    ]
  },
  {
    id: 'P3-5',
    title: 'Recommendations Engine',
    description: 'Profile-based concept matching',
    priority: 'high',
    estimate: '3 days',
    dependencies: ['P3-0', 'P3-3'],
    subtasks: [
      'Match % calculation (concept quality + profile fit)',
      'Personalized recommendations API',
      'Plain language "why it fits" generation',
      'Quick facts display (people needed, time, difficulty)'
    ]
  },
  {
    id: 'P3-6',
    title: 'Pricing Engine',
    description: 'Calculate prices per market ($20-30 US)',
    priority: 'high',
    estimate: '2 days',
    dependencies: ['P3-5'],
    subtasks: [
      'Base price $20 + match bonus (up to $10)',
      'PPP adjustment per market',
      'Price display with local currency',
      'Subtle cashback calculation (~10%)'
    ]
  },
  {
    id: 'P3-7',
    title: 'Expiration Cron',
    description: 'Auto-archive expired listings',
    priority: 'medium',
    estimate: '1 day',
    dependencies: ['P3-3'],
    subtasks: [
      'Vercel cron job every 5 min',
      'Find expired windows',
      'Archive and update status',
      'Update expiring_soon flags'
    ]
  }
];
```

### Success Criteria

| Criteria | Target | How to Measure |
|----------|--------|----------------|
| Concepts created | 20+ | Database count |
| Listings active | 5+ at any time | Query check |
| Viewer works | Mobile + desktop | Manual testing |
| Prices calculate | All markets | API testing |

---

## Phase 4: Transaction System

### Duration: 1-2 weeks

### Objective
Enable purchases with buyer accounts, payments, and cashback claims.

### Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Buyer Accounts | Registration and profiles | 🔲 TODO |
| Purchase Flow | Buy concepts with cap enforcement | 🔲 TODO |
| Payment Integration | Stripe or manual | 🔲 TODO |
| Cashback Submission | Submit produced content | 🔲 TODO |
| Verification Flow | Verify and approve cashback | 🔲 TODO |

### Tasks

```typescript
const phase4Tasks = [
  {
    id: 'P4-1',
    title: 'Buyer Accounts',
    description: 'User registration and profiles',
    priority: 'high',
    estimate: '2 days',
    dependencies: ['P3-1'],
    subtasks: [
      'Registration flow',
      'Market selection',
      'Profile page',
      'Purchase history',
      'Credit balance display'
    ]
  },
  {
    id: 'P4-2',
    title: 'Purchase Flow',
    description: 'Complete purchase process',
    priority: 'high',
    estimate: '3 days',
    dependencies: ['P4-1', 'P3-6'],
    subtasks: [
      'Check purchase eligibility',
      'Show price for market',
      'Atomic purchase transaction',
      'Update caps',
      'Grant access to concept'
    ]
  },
  {
    id: 'P4-3',
    title: 'Payment Integration',
    description: 'Accept payments',
    priority: 'high',
    estimate: '2 days',
    dependencies: ['P4-2'],
    subtasks: [
      'Stripe checkout integration',
      'Handle payment success',
      'Handle payment failure',
      'Store payment records',
      'Manual payment option (MVP)'
    ]
  },
  {
    id: 'P4-4',
    title: 'Cashback Submission',
    description: 'Submit produced content for cashback',
    priority: 'medium',
    estimate: '2 days',
    dependencies: ['P4-2'],
    subtasks: [
      'Submission form (platform, URL)',
      'Extract post ID from URL',
      'Store produced_content record',
      'Track submission deadline'
    ]
  },
  {
    id: 'P4-5',
    title: 'Cashback Verification',
    description: 'Verify and process cashback',
    priority: 'medium',
    estimate: '2 days',
    dependencies: ['P4-4'],
    subtasks: [
      'Check post exists and is public',
      'Check post date after purchase',
      'Calculate cashback rate',
      'Credit buyer account',
      'Send notification'
    ]
  }
];
```

### Success Criteria

| Criteria | Target | How to Measure |
|----------|--------|----------------|
| First purchase | 1 completed | Transaction record |
| Payment works | End-to-end | Test purchase |
| Cashback flow | End-to-end | Test submission |
| Caps enforced | Correctly | Attempt over-purchase |

---

## Phase 5: Scale and Polish

### Duration: Ongoing

### Objective
Optimize performance, add features, grow catalog and user base.

### Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Subtitle Translation | Multi-language subtitles | 🔲 TODO |
| Agent Modifier | Buyer agent profiles | 🔲 TODO |
| Model Retraining | Continuous improvement | 🔲 TODO |
| Analytics Dashboard | Business metrics | 🔲 TODO |
| Performance Metrics | Produced content tracking | 🔲 TODO |

### Tasks

```typescript
const phase5Tasks = [
  {
    id: 'P5-1',
    title: 'Subtitle System',
    description: 'Auto-translate subtitles per market',
    priority: 'medium',
    estimate: '1 week',
    dependencies: ['P3-4'],
    subtasks: [
      'Whisper transcription',
      'Gemini translation',
      'Client-side overlay',
      'Language selection UI'
    ]
  },
  {
    id: 'P5-2',
    title: 'Agent Modifier',
    description: 'Buyer agent profiles for pricing',
    priority: 'low',
    estimate: '1 week',
    dependencies: ['P4-2'],
    subtasks: [
      'Track purchase patterns',
      'Calculate agent profile',
      'Adjust pricing based on agent',
      'Show agent stats to buyers'
    ]
  },
  {
    id: 'P5-3',
    title: 'Model Retraining',
    description: 'Improve model with new data',
    priority: 'medium',
    estimate: 'Ongoing',
    dependencies: ['P2-5'],
    subtasks: [
      'Automated retraining triggers',
      'A/B test new models',
      'Feature drift detection',
      'Performance monitoring'
    ]
  },
  {
    id: 'P5-4',
    title: 'Analytics Dashboard',
    description: 'Business metrics and insights',
    priority: 'low',
    estimate: '1 week',
    dependencies: ['P4-5'],
    subtasks: [
      'Sales metrics',
      'Concept performance',
      'Market distribution',
      'Cashback rates',
      'Revenue tracking'
    ]
  }
];
```

---

## Timeline Overview

```
Week 1-2:   Phase 1 - Rating UI improvements, batch import
Week 2-4:   Phase 1 - Daily rating sessions, reach 200
Week 5:     Phase 2 - Feature engineering, model training
Week 6:     Phase 2 - Evaluation, deployment, testing
Week 7-8:   Phase 3 - Database, concepts, listings
Week 9-10:  Phase 3 - Viewer, catalog, pricing, cron
Week 11:    Phase 4 - Buyer accounts, purchase flow
Week 12:    Phase 4 - Payments, cashback
Week 13+:   Phase 5 - Subtitles, agent, retraining, analytics
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Slow rating pace | Set daily minimums; use batch rating |
| Model accuracy too low | Add more ratings; try different algorithms |
| Complex features | Simplify to top 50 correlated |
| Payment complexity | Start with manual payment option |
| Subtitle cost | Cache aggressively; pre-translate common languages |

---

## Resource Requirements

### Phase 1
- Time: 2 hours/day for rating
- Compute: Existing Gemini quota

### Phase 2
- Time: 1 week focused development
- Compute: Python training (local or Colab)

### Phase 3
- Time: 2-3 weeks development
- Compute: Existing Supabase + Vercel

### Phase 4
- Time: 1-2 weeks development
- External: Stripe account setup

### Phase 5
- Time: Ongoing
- External: Whisper API, expanded Gemini quota

---

## Definition of Done

### MVP Complete When:
- [ ] 200+ rated videos with v3 analysis
- [ ] Model v1.0 deployed with MAE < 0.20
- [ ] 20+ concepts listed
- [ ] 10+ active listings at any time
- [ ] 5+ completed purchases
- [ ] 1+ cashback claim verified
- [ ] Mobile-responsive viewer
- [ ] Automated expiration processing

---

## Related Documents

- [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md) - Complete system overview
- [Model Training Deep Dive](./06_MODEL_TRAINING.md) - Phase 2 details
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Phase 3 foundation
- [Cashback Flow Deep Dive](./09_CASHBACK_FLOW.md) - Phase 4 details

---

*This document provides exhaustive detail on implementation phases. Update as phases complete.*
