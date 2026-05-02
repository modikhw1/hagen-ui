# Active Plan

## Title
Parallel Codex plan for reframing Studio around CM-first workflow

## Purpose
Use three parallel Codex instances to:
1. establish current-system truth
2. define the target Studio IA
3. produce a safe implementation plan

This task should avoid premature code edits before the repo truth and v1 target model are aligned.

## Why this sequencing matters
The current repo already contains meaningful Studio primitives, but several parts appear role-misaligned or sourced from the wrong data path. A parallel plan lets us:
- preserve what already works
- distinguish admin utility from CM-first workflow needs
- avoid overbuilding before the current system is mapped
- choose a low-risk first implementation slice

## Shared product framing
Studio should be treated as a shared operational system with role-shaped entry and emphasis:
- Admin / studio-admin: cross-customer oversight, org status, CM oversight
- Content Manager: intake, triage, concept shaping, customer adaptation, feed planning, communication

Important product truths to preserve:
- `/studio/customers` may still be sensible as an admin/org overview
- it is not necessarily the right primary landing for an individual CM
- pre-invite / pre-registration customer work should be treated as a real workflow
- imported clips, base concepts, customer-adapted concepts, feed placements, and communication artifacts should not be collapsed into one ambiguous object
- concept intake should support a lightweight pre-analysis stage
- Studio and Admin should not duplicate the same information unnecessarily

## Parallel workstreams

### Workstream A — Current-system audit
Goal:
- establish what exists in code now
- identify reusable primitives
- identify route/data-source/role mismatches

Expected outcome:
- a strict audit based on repo evidence
- a route/component/data-source matrix
- a list of confirmed current-system anchors

### Workstream B — Studio IA v1
Goal:
- translate the intended Studio model into a role-aware information architecture
- define object/stage boundaries
- propose a realistic v1 target state

Expected outcome:
- role-based landings
- object model
- state transitions
- private vs customer-visible boundary
- Studio vs Admin boundary

### Workstream C — Implementation plan
Goal:
- map the target direction into safe implementation slices
- identify what can happen now vs what needs deeper data-model decisions
- recommend the first PR

Expected outcome:
- dependency-ordered slices
- affected files/routes/components
- risk assessment
- first PR scope with acceptance criteria

## Working order
Run A, B, and C in parallel.

Then synthesize in this order:
1. accept or correct A's current-system truth
2. accept or correct B's target IA
3. let C converge on a first implementation slice that respects both A and B

## Decision gates before implementation
These questions should be sufficiently answered before meaningful code changes:
1. Should `/studio/customers` remain the main admin/org overview?
2. What should CM land on by default?
3. Should intake/stepper be a dedicated route or a first-class block on CM home?
4. What is the minimal v1 object model?
5. How should pre-invite / pre-registration customers exist in the system?
6. Which concept entities belong in `hagen-main` vs `hagen-ui`?

## Recommended first implementation slice
### Preferred first PR
Role-shaped Studio entry.

This likely means:
- `/studio` redirects by role
- admin/studio-admin can keep a broad customer overview
- CM gets a more operational landing
- admin-oriented nav items are demoted or hidden for CM where appropriate

### Why this slice first
- low conceptual risk
- high product signal
- minimal schema pressure
- preserves current customer workspace primitives
- creates space for later intake/library changes without forcing a full rewrite

## Suggested implementation slices after the first PR
1. role-shaped landing and nav treatment
2. concept library data-source correction
3. intake/stepper shell or placeholder workflow
4. object-stage clarification between imported/base/adapted/planned
5. pre-invite customer workspace support
6. richer library search/filtering

## Revised rationale after D / E / F
- D confirms that CM ownership is currently a default/filter concern, not an enforced access boundary, so PR1 should avoid assignment-gated authorization changes.
- E confirms that `/studio/concepts` currently reads the wrong source, which makes concept data-source correction a safer and higher-confidence follow-up than deeper intake persistence.
- F confirms that prep/pre-invite work already exists operationally, so lifecycle cleanup does not need to block routing or concept-source fixes.

## Updated working decisions
- Keep `/studio/customers` as the admin/org overview and secondary CM index.
- Add `/studio/home` as the CM-first landing.
- Keep CM global customer access in v1, but bias defaults toward assigned-customer data where possible.
- Treat `pending` and `invited` as prep states in v1 UI framing without renaming backend statuses yet.
- Correct `/studio/concepts` to DB-first before investing in richer library or intake behavior.
- Do not introduce a first-class imported-clip persistence model until source-of-truth and object-boundary decisions are better settled.

## Deliverables expected from the three Codex instances
- `CODEX_A_CURRENT_SYSTEM_AUDIT.md`
- `CODEX_B_STUDIO_IA_V1.md`
- `CODEX_C_IMPLEMENTATION_PLAN.md`

## Success criteria for this planning round
- the repo truth is documented clearly enough that implementation work does not begin from false assumptions
- the target Studio model is coherent for both CM and admin perspectives
- the first implementation slice is small, defensible, and reversible if needed
- future intake/stepper and pre-invite work remain possible without major IA backtracking

## Follow-up execution split — observation / planner refinement

### Why this needs a separate split
The observation loop is now live, but the next work is no longer "make cron run". The next risk is product ambiguity: imported TikTok history, LeTrend-produced history, and planner advancement are close enough in the UI that they can be misread as the same event. That should be corrected in small, low-regret slices rather than one broad refactor.

### Slice 1 — runtime/UI hardening (small, fast, safe)
Goal:
- remove current friction in history-card actions and planner navigation without changing the underlying truth model

In scope:
- fix history-card context-menu hit area / z-index / overlay issues
- fix dropdown sizing so width fits content more naturally
- reduce or remove feed-planner wheel-trap behavior while preserving explicit planner navigation controls
- add visible pending/loading feedback for "markera som gjord"
- add bottom stats-banner parity treatment to LeTrend history cards (allowing empty/zero values for now if needed)
- tighten labels/microcopy so cron observation vs manual advancement is easier to understand

Out of scope:
- no schema changes
- no automatic matching between uploads and LeTrend concepts
- no time-series stats storage yet

Acceptance criteria:
1. history-card more-menu is reliably clickable and visible
2. dropdown no longer renders with excessive dead width
3. page scrolling is not trapped by the planner in normal use
4. mark-produced gives immediate interactive feedback while request is in flight
5. LeTrend history cards visually support the same bottom stats region pattern as TikTok history

### Slice 2 — explicit history truth/reconciliation model (product + implementation pass)
Goal:
- create an explicit CM-controlled way to say whether an observed/uploaded history clip should remain TikTok-native history or be treated as LeTrend-produced history

Preferred direction:
- do NOT infer this automatically from timing
- add an explicit user action such as "Treat as LeTrend" / "Treat as TikTok" or "Match to planned concept"
- preserve imported-history rows as imported truth unless the CM deliberately reconciles them

Likely decisions needed:
- whether reconciliation updates an imported row in place, links it to a concept, or creates a separate linkage record
- whether unmatched planned concepts should remain in plan, move to skipped, or return to selectable pool
- which metadata source wins after reconciliation (TikTok caption/stat fields vs LeTrend concept title/instructions)

Out of scope for the first pass:
- no fully automated matching heuristic
- no broad object-model rewrite unless unavoidable

### Slice 3 — post-publication stats tracking
Goal:
- extend observation from "new clip detected" to "performance snapshots captured over time"

Candidate direction:
- store snapshot points for views/likes/comments over the first 24-48h after publication
- expose a simple hover/detail visualization later

Prerequisite:
- should only begin after slice 2 defines what a LeTrend-vs-TikTok history item means

### Recommended order
1. Slice 1 first — immediate UX/runtime quality and clarity
2. Slice 2 second — explicit truth model for imported vs LeTrend history
3. Slice 3 third — analytics enrichment once the meaning of history items is stable

### No-regret product rule
Until slice 2 exists, the system should continue to treat:
- cron import as observation only
- advance-plan as explicit planner movement
- mark-produced as explicit assertion that the planned LeTrend concept was produced

The product should not silently collapse those three into one inferred event.
