# Concept Arbitrage Marketplace - Documentation Index

> **Version**: 1.0  
> **Last Updated**: December 3, 2025  
> **Status**: MVP Specification Complete

---

## Quick Navigation

### Master Document
- **[MVP Master Specification](./MVP_MASTER_SPECIFICATION.md)** - Complete system overview in one document

### Component Deep Dives

| # | Component | Document | Description |
|---|-----------|----------|-------------|
| 01 | System Architecture | [01_SYSTEM_ARCHITECTURE.md](./components/01_SYSTEM_ARCHITECTURE.md) | Data flow, layers, integrations |
| 02 | Database Schema | [02_DATABASE_SCHEMA.md](./components/02_DATABASE_SCHEMA.md) | All tables with examples |
| 03 | Pricing Logic | [03_PRICING_LOGIC.md](./components/03_PRICING_LOGIC.md) | Pricing function and scenarios |
| 04 | Concept Viewer | [04_CONCEPT_VIEWER.md](./components/04_CONCEPT_VIEWER.md) | In-platform video viewing |
| 05 | API Endpoints | [05_API_ENDPOINTS.md](./components/05_API_ENDPOINTS.md) | All routes with examples |
| 06 | Model Training | [06_MODEL_TRAINING.md](./components/06_MODEL_TRAINING.md) | Training pipeline and milestones |
| 07 | Evergreen Logic | [07_EVERGREEN_LOGIC.md](./components/07_EVERGREEN_LOGIC.md) | Trend vs. evergreen detection |
| 08 | Rotation Logic | [08_ROTATION_LOGIC.md](./components/08_ROTATION_LOGIC.md) | 72h windows and archival |
| 09 | Cashback Flow | [09_CASHBACK_FLOW.md](./components/09_CASHBACK_FLOW.md) | Purchase → produce → refund |
| 10 | Subtitle Generation | [10_SUBTITLE_GENERATION.md](./components/10_SUBTITLE_GENERATION.md) | Transcription and translation |
| 11 | Implementation Phases | [11_IMPLEMENTATION_PHASES.md](./components/11_IMPLEMENTATION_PHASES.md) | 5-phase roadmap |

---

## Document Map

```
docs/
├── README.md                           ← You are here
├── MVP_MASTER_SPECIFICATION.md         ← Start here for full overview
└── components/
    ├── 01_SYSTEM_ARCHITECTURE.md
    ├── 02_DATABASE_SCHEMA.md
    ├── 03_PRICING_LOGIC.md
    ├── 04_CONCEPT_VIEWER.md
    ├── 05_API_ENDPOINTS.md
    ├── 06_MODEL_TRAINING.md
    ├── 07_EVERGREEN_LOGIC.md
    ├── 08_ROTATION_LOGIC.md
    ├── 09_CASHBACK_FLOW.md
    ├── 10_SUBTITLE_GENERATION.md
    └── 11_IMPLEMENTATION_PHASES.md
```

---

## Reading Order

### For Full Understanding
1. **[MVP Master Specification](./MVP_MASTER_SPECIFICATION.md)** - Read completely first
2. **[Implementation Phases](./components/11_IMPLEMENTATION_PHASES.md)** - Understand the timeline
3. Deep dive into specific components as needed

### For Implementation
1. **[Database Schema](./components/02_DATABASE_SCHEMA.md)** - Set up tables first
2. **[System Architecture](./components/01_SYSTEM_ARCHITECTURE.md)** - Understand data flow
3. **[API Endpoints](./components/05_API_ENDPOINTS.md)** - Build API layer
4. Component-specific docs as you implement each feature

### For Understanding the Model
1. **[Model Training](./components/06_MODEL_TRAINING.md)** - Training pipeline
2. **[Pricing Logic](./components/03_PRICING_LOGIC.md)** - How scores affect pricing

---

## Key Concepts

| Term | Definition |
|------|------------|
| **Concept** | An abstracted video idea that can be replicated |
| **Virality Score** | 0-10 prediction of a concept's viral potential |
| **Evergreen** | A concept that works without trending sounds/memes |
| **Listing Window** | 72-hour active period for a concept |
| **Market Cap** | Max purchases per market (3-5) |
| **Global Cap** | Max total purchases (10-15) |
| **Cashback** | 10-15% refund for producing content |
| **Agent Modifier** | Pricing adjustment based on buyer behavior |

---

## Current Status

### Phase 1: Data Collection
- **Current Ratings**: ~51 videos (as of Dec 3, 2025)
- **Target**: 200 videos
- **Progress**: 25.5%

### Documentation Status
- ✅ Master Specification
- ✅ All 11 component documents
- 🔲 Reference documents (feature schema, etc.)

---

## Related Files

### Existing System Documentation
- **[AI_HANDOFF.md](../AI_HANDOFF.md)** - Original system documentation (745 lines)
- **[AI_CONTEXT_HANDOFF.md](../AI_CONTEXT_HANDOFF.md)** - Training loop context

### Training Data
- **[analysis_export_2025-12-03.csv](../analysis_export_2025-12-03.csv)** - Latest export
- **[analysis_export_2025-12-03.json](../analysis_export_2025-12-03.json)** - JSON format

---

## Maintenance

This documentation should be updated when:
- New features are added
- Implementation details change
- Milestones are reached
- Bugs reveal design issues

Each document has a "Last Updated" field at the top for tracking.

---

*This is the living specification for the Concept Arbitrage Marketplace MVP.*
