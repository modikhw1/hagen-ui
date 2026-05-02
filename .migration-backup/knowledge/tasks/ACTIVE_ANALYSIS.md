# Active Analysis

## Current-system truth

### Studio shell and routing
- `/studio` currently redirects to `/studio/customers`.
- Studio is currently treated as a protected area for `admin` and `content_manager` roles.
- Primary Studio shell nav currently includes customer work, concept library, upload, and invoices.

### Current Studio mental model in code
The existing implementation is primarily customer-centric:
- customer list first
- per-customer workspace second
- concept library as a separate utility area
- upload as a separate utility area
- invoices also present in Studio

This suggests the current UI is organized around product sections, not around the CM's weekly creative operating rhythm.

### Customer workspace scope already present
The per-customer workspace already includes several elements that fit the intended CM suite:
- game plan
- concept work
- feed planning
- communication
- notes/demo/history affordances

So the repo already contains useful primitives for the target direction, even if the front-door and concept sourcing model are not aligned.

### Concept sourcing mismatch
There is a major mismatch between the intended system and the current implementation:
- `/studio/concepts` currently loads from local JSON fixtures via `conceptLoader`
- there is a DB-backed loader available, but it is not used on the Studio concepts page
- upload already integrates with `hagen-main` for video upload and analysis

This means the Studio library currently presents a simplified/static concept source while another part of the same Studio already assumes a live external pipeline.

## Intended-system interpretation

### Core Studio identity
Studio should be interpreted as a CM-first creative suite.
It is primarily for helping a CM manage inspiration intake, concept shaping, customer adaptation, feed placement, and communication clarity.

### CM operating rhythm
The user described a repeating weekly loop:
1. collect many candidate clips from TikTok
2. triage/categorize them quickly
3. analyze only selected clips more deeply
4. match/adapt them to specific customers
5. place them in a timeline/feed plan
6. update notes, game plan, and feedback
7. help the customer understand what to make and why

### Likely object model implied by the user
The product intent suggests separate objects or states:
- imported clip reference
- analyzed/base concept
- customer-adapted concept instance
- customer-visible feed/timeline item
- notes/communication/feedback artifact

### Boundary insight: private work vs customer-visible work
The user repeatedly implies two distinct layers:
- CM-private creative workspace for intake, categorization, and judgment
- customer-facing curated outputs that explain what matters to the customer

This boundary appears central to the intended system and may be more important than the current section taxonomy.

## Gap-model assessment

### Gap 1: role-misaligned front door
Current Studio starts at a customer list.
That may actually be reasonable for an admin or org-overview perspective because it gives cross-customer and cross-CM visibility.
However, the user intent suggests this is not the ideal first-value workflow for an individual CM, whose landing should more directly support intake/import, active customer work, and near-term actions.

This reframes the issue from "wrong page globally" to "wrong default for the CM role if used as the main Studio front door".

### Gap 1b: missing role-shaped Studio modes
The current Studio model appears to under-express a distinction between:
- Studio as admin oversight / org operations view
- Studio as individual CM workbench

The user intent suggests both can exist, but they should not share the same priorities, density, or default landing assumptions.

### Gap 1c: pre-invite / pre-registration workflow is under-modeled
The intended system includes customers who may be:
- invited but not yet registered
- seeded with initial material before account creation
- used in demo/sales-style flows before becoming active app users

This implies Studio should support a real pre-invite/pre-registration customer object/workspace where a CM can begin preparing concepts, demos, or first impressions before the customer has completed signup.

That object should likely be visible to Admin and Studio users without forcing a completed customer-auth lifecycle first.

### Gap 2: wrong concept source and scale model
Current library behavior implies a static/general concept set.
The intended model is a bounded working set dominated by the CM's own saved/imported clips, with only a limited shared/global reusable layer.

### Gap 3: intake is too expensive/manual
The described `stepper` model exists as a valuable product idea because it avoids:
- one-link-at-a-time manual entry
- full analysis cost on every possible clip
- polluting the main library with untriaged material

The current high-level flow does not appear to preserve that lightweight intake stage.

### Gap 4: section-based IA may be too coarse
The current Studio navigation is organized as large sections (customers, concepts, upload, invoices).
The user model is more process-oriented and implies state transitions between intake, adaptation, planning, and communication.

### Gap 5: admin contamination
Invoices and related admin surfaces remain inside the Studio shell even though the intended Studio identity is clearly distinct from Admin.

### Gap 6: concept cards are not enough
The current concepts experience may already provide decent descriptive cards, but the user needs stronger creative-scanning signals:
- thumbnail-first scanning
- relevant metadata
- quick categorization
- customer relevance
- reuse expectations
- possibly collection-level intake

### Gap 7: deeper production structure is under-modeled
The intended system may require structured production data for downstream mobile capture/editing assistance:
- scenes
- per-scene script
- durations
- filming guidance

Current Studio framing appears more concept-card-centric than production-structure-centric.

## Likely ripple areas if the Studio model changes
- Studio navigation and landing route
- concept library data contracts
- import/upload flows and their stage transitions
- per-customer workspace states and visibility rules
- customer-facing feed planner synchronization
- integration boundary between `hagen-ui` and `hagen-main`
- admin/studio separation in navigation and permissions

## Suggested framing for next discussion
The next useful framing step is probably to define Studio as three linked surfaces:
1. intake/discovery
2. customer adaptation/planning
3. customer communication/visibility

Then map existing routes/components into that model instead of designing from scratch.

## D / E / F follow-up truth

### Routing / ownership truth (D)
- Current Studio access for `content_manager` is globally visible, not assignment-gated.
- Ownership exists in two shapes: legacy `account_manager` string and newer `account_manager_profile_id` UUID.
- `account_manager_profile_id` is the better future ownership signal, but it is not yet reliable enough to become the sole access-control gate because customer creation does not always populate it.
- The safest v1 interpretation is: assignment should shape defaults and dashboard emphasis, not authorization boundaries.
- This strengthens the case for `/studio/home` as a CM-first landing while keeping `/studio/customers` globally accessible in v1.

### Concept-source / object-boundary truth (E)
- `/studio/concepts` is still detached from operational truth because it reads bundled JSON while the actual product flow already depends on DB `concepts` and `customer_concepts`.
- `concepts` is the effective base-concept layer today.
- `customer_concepts` currently collapses assignment, adaptation, feed placement, and demo/history rows into one table.
- There is no first-class pre-analysis imported-clip object yet.
- This means a true intake system still lacks a stable persistence layer, but the base concept library can still be corrected safely by making Studio concept routes DB-first.

### Invite / prep lifecycle truth (F)
- Pre-invite / pre-registration customer preparation is already real in the current system.
- `pending` and `invited` can safely be treated as prep states in v1 UI framing.
- `active` is overloaded in current code and should not be treated as a clean "paid and fully activated" signal.
- Public demo access already exists before registration, so prep/demo capability does not need new backend invention for v1.
- Lifecycle cleanup should therefore follow UI/IA clarification, not block it.

## Updated cross-cutting assessment
- The first PR should remain a routing/nav/role-shaping slice.
- The next highest-confidence follow-up after PR1 is concept-library DB read correction, because the current Studio library is reading the wrong source.
- Intake should still become a first-class surface, but only as a shell/IA move until imported-clip persistence is better defined.
- Prep customers should be made more visible and understandable in Studio before any status-model rewrite.

## Recommended next-sequence after A-F
1. lock a revised synthesis across A-F
2. implement PR1: role-shaped Studio entry + CM home + role-aware nav
3. implement PR2: DB-first correction for `/studio/concepts` and honest edit/detail behavior
4. implement PR3: intake shell / placeholder route tied to CM home and weekly workflow
5. only then decide deeper object-model and lifecycle hardening slices
