# letrend Interface Documentation

> **Purpose**: Complete specification for the customer-facing interface
> **Status**: Revised based on owner input
> **Updated**: January 1, 2026

---

## Document Index

| Document | Purpose | Status |
|----------|---------|--------|
| [CUSTOMER_INTERFACE_OUTLINE.md](../CUSTOMER_INTERFACE_OUTLINE.md) | High-level overview and wireframes | Revised |
| [01_USER_FLOWS.md](./01_USER_FLOWS.md) | Step-by-step user journeys | Revised |
| [02_COMPONENTS.md](./02_COMPONENTS.md) | UI component specifications | Revised |
| [03_INFORMATION_ARCHITECTURE.md](./03_INFORMATION_ARCHITECTURE.md) | What info appears where and why | Revised |
| [04_EDGE_CASES.md](./04_EDGE_CASES.md) | Error handling and edge cases | Revised |

---

## Reading Order

1. **Start with** [CUSTOMER_INTERFACE_OUTLINE.md](../CUSTOMER_INTERFACE_OUTLINE.md) for the big picture
2. **Then** [03_INFORMATION_ARCHITECTURE.md](./03_INFORMATION_ARCHITECTURE.md) for the mental model
3. **Then** [01_USER_FLOWS.md](./01_USER_FLOWS.md) to understand user journeys
4. **Reference** other docs as needed for specific details

---

## Key Decisions Made

Based on owner input, these decisions have been resolved:

### Core Direction
| Decision | Resolution |
|----------|------------|
| Browse vs Recommendation | **Recommendation-first** - no marketplace browse |
| Video preview | **None** - no video pre-purchase |
| Primary metric | **Match %** replaces virality score |
| User onboarding | **AI chat** to build profile |
| Cashback prominence | **Subtle** - footnote level, for feedback data |
| Pricing | **$20-30** per concept, PPP-adjusted |
| Target user | **Mid/low tech comfort** business owners |
| Language | **Plain speak** - no technical jargon |

### From Components
| Decision | Resolution |
|----------|------------|
| Video preview approach | **None** - removed entirely |
| Component library | **shadcn/ui + Tailwind** |

### From Edge Cases
| Decision | Resolution |
|----------|------------|
| Unsupported market handling | Use billing country for pricing |
| Refund policy | No automatic refunds, manual review |
| Same video for multiple submissions | Block (one video = one submission) |
| Account deletion policy | Soft delete (anonymize, retain data) |

---

## Next Steps

1. **Wireframes**: Create visual wireframes based on finalized specs
2. **API Contracts**: Define API endpoints between frontend and backend
3. **Implementation**: Begin building

---

## Relationship to Other Documentation

```
hagen_pg (letrend)
├── docs/
│   ├── MVP_MASTER_SPECIFICATION.md    ← System architecture (backend)
│   ├── CUSTOMER_INTERFACE_OUTLINE.md  ← Interface overview
│   ├── interface/                      ← This folder
│   │   ├── README.md                   ← You are here
│   │   ├── 01_USER_FLOWS.md
│   │   ├── 02_COMPONENTS.md
│   │   ├── 03_INFORMATION_ARCHITECTURE.md
│   │   └── 04_EDGE_CASES.md
│   └── components/                     ← Backend component specs
│       └── 01-11_*.md

hagen-main
├── src/                               ← Actual codebase
└── planning_docs/                     ← Symlink to hagen_pg
```

---

*This is the living specification for the letrend customer interface.*
