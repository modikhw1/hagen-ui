# Documentation Index

> **Last Updated**: December 19, 2025

This folder contains the active documentation for the Hagen project. Superseded or historical documents are in `/archive`.

---

## Quick Navigation

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [ARCHITECTURE_REGISTRY.md](ARCHITECTURE_REGISTRY.md) | **Golden Rules** for code changes | Before modifying any component |
| [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) | Database schema & data flow | Before any data-related work |
| [FINGERPRINT_IMPLEMENTATION_PLAN.md](FINGERPRINT_IMPLEMENTATION_PLAN.md) | Master plan for fingerprint system | Understanding current sprint goals |
| [FINGERPRINT_LAYERS.md](FINGERPRINT_LAYERS.md) | Technical spec for L1/L2/L3 layers | Implementing fingerprint logic |
| [FINGERPRINT_TEST_FRAMEWORK.md](FINGERPRINT_TEST_FRAMEWORK.md) | Test brands & validation criteria | Validating fingerprint accuracy |
| [GCS_VIDEO_ACCESS.md](GCS_VIDEO_ACCESS.md) | How to access videos from GCS | Working with video files |
| [SETUP.md](SETUP.md) | Environment & API setup | First-time setup |

---

## Folder: `integration, hagen_ta/`

Import package from the [hagen_ta](https://github.com/modikhw1/hagen_ta) taste analysis project.

| Document | Purpose |
|----------|---------|
| [CONTEXT.md](integration,%20hagen_ta/CONTEXT.md) | Scientific findings from 254 comparisons |
| [SCHEMA_V1.1_SIGMA_TASTE.md](integration,%20hagen_ta/SCHEMA_V1.1_SIGMA_TASTE.md) | The σTaste schema (v1.1) |
| [VERTEX_SYSTEM_INSTRUCTIONS.md](integration,%20hagen_ta/VERTEX_SYSTEM_INSTRUCTIONS.md) | AI prompts for Gemini/Vertex |

---

## System Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│          STAGE 1: CONTENT CLASSIFICATION (Hard Filter)          │
│  Is this the RIGHT TYPE of content? (sketch vs. interview)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            STAGE 2: UTILITY SCORING (Soft Filter)               │
│  CAN a hospitality business replicate this?                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          STAGE 3: QUALITY RANKING (σTaste Core)                 │
│  HOW GOOD is this content within its category?                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              FINGERPRINT MATCHING                                │
│  L1 (Quality) + L2 (Personality) + L3 (Production)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archived Documents

See `/archive` for historical documents including:
- `AI_HANDOFF.md` - Original project context
- `SIMPLIFICATION_SUMMARY.md` - Dec 9 schema cleanup
- `ROADMAP.md` - Shelved features
- `FEATURE_GAPS_AND_FRAMEWORKS.md` - Future enhancements
