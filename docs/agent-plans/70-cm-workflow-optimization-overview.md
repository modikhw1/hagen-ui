# Phase 70 — CM Workflow Optimization: Overview

**Date**: 2026-05-12
**Scope**: Three structural changes to optimize the Content Manager workflow from ingest to customer delivery.

---

## Background

A deep audit of the CM workflow in `/studio/concepts` and `/studio/customers` revealed that the existing implementation is functionally correct but structurally misaligned with how a CM actually works:

1. **CM finds a clip on TikTok already knowing which customer it's for** — but the app forces them through 4-5 navigation steps between ingest and customer placement.
2. **AI generates rich metadata at ingest** — but it's never automatically copied to the customer-facing `content_overrides`, forcing CMs to manually re-fill fields.
3. **Two tabs (Koncept + Feed Plan) show the same data differently** — creating confusion about where work happens.

---

## Work Packages

| # | Name | Risk | Effort | Impact |
|---|------|------|--------|--------|
| 71 | Pre-population of content_overrides | Low | Small | High — customers immediately see complete content |
| 72 | Ingest-to-customer primary flow | Medium | Medium | High — eliminates 4+ navigation steps |
| 73 | Unified "Kundarbete" view | Medium-High | Large | High — single coherent workspace |

---

## Execution Order

**71 → 72 → 73**

Rationale:
- 71 is backend-only, low risk, and immediately improves every existing customer assignment
- 72 depends on 71 (the ingest modal uses pre-population when assigning to customer)
- 73 is the largest UI change and benefits from 71+72 being stable first

---

## Design Principles (from Q&A)

1. **Library remains a valid target** — "Spara till bibliotek" without customer assignment must always be possible. Admins, scrapers, and other CMs in other regions need neutral library concepts.
2. **No AI-per-customer at assignment time** — Pre-population is simple field copying from base concept overrides. No extra API calls. This may change in the future but is explicitly out of scope now.
3. **Game Plan and Kommunikation stay as separate tabs** — Only Koncept + Feed Plan merge.
4. **Review page becomes optional, not deleted** — It's still useful for quality control and batch review, but it no longer blocks the primary flow.
5. **Feed Plan visual timeline becomes a compact overview** — Not removed, but repositioned as a summary header rather than a full-screen primary workspace.

---

## Supabase Schema

No schema migrations required for any package. All changes use existing columns:
- `concepts.overrides` (JSONB) — source of truth for base concept metadata
- `customer_concepts.content_overrides` (JSONB) — per-customer metadata
- `customer_concepts.feed_order` (int) — placement position
- `customer_concepts.status` (text) — lifecycle state

If future work needs new columns (e.g., `assigned_via` to track ingest-direct vs library-pick), those can be added via Supabase MCP later.

---

## Files Likely Touched

### Package 71 (Pre-population)
- `artifacts/api-server/src/routes/studio-v2.ts` — POST /customers/:id/concepts endpoint

### Package 72 (Ingest-to-customer)
- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` — new final step
- `artifacts/letrend/src/app/studio/concepts/page.tsx` — onSuccess callback change
- `artifacts/api-server/src/routes/studio-v2.ts` — POST endpoint extension (accept direct assignment from ingest)
- `artifacts/api-server/src/routes/admin/concepts.ts` — POST endpoint (return saved concept for immediate assignment)

### Package 73 (Unified view)
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` — tab restructure
- `artifacts/letrend/src/components/studio/customer-detail/KonceptSection.tsx` — merge into new component
- `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx` — compact into overview
- `artifacts/letrend/src/lib/studio/navigation.ts` — tab definitions
- New component: unified workspace view

---

## Constraints

- Do not call live endpoints during implementation
- Do not create Supabase migrations (use MCP later if needed)
- Do not break existing flows during implementation (additive first, then redirect)
- Keep Review page functional (optional path, not deleted)
- Typecheck must pass after each package
