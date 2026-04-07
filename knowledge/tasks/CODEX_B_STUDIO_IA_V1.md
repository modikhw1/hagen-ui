# Codex B — Studio IA v1

## Mission
Produce a proposed Studio IA v1 for `hagen-ui` that reflects the intended CM-first workflow while preserving valid admin/org oversight needs.

This is a target-state design and architecture brief, not a coding task.

## Product framing to respect
Studio should be treated as a shared operational system with role-shaped emphasis:
- Admin / studio-admin: org overview, customer oversight, CM oversight
- Content Manager: intake, triage, concept shaping, customer adaptation, feed planning, communication

Important intended principles:
- `/studio/customers` may remain a sensible admin/org overview
- it is not necessarily the right primary landing for an individual CM
- pre-invite / pre-registration customer preparation should be a real workflow
- imported clips, base concepts, customer-adapted concepts, feed placements, and customer-visible outputs should be treated as distinct layers
- intake should support a lightweight pre-analysis stage before expensive analysis
- Studio and Admin should avoid duplicating the same information across multiple surfaces
- the IA should leave room for richer concept search, manipulation, and future trend intelligence without overbuilding v1

## Design task
Translate the above into a realistic Studio IA v1 that can evolve from the current repo.

## Required deliverables

### 1. Role-based Studio model
Define how Studio differs for:
- admin / studio-admin
- content manager

### 2. Recommended landings
Specify the recommended default landing for:
- admin
- CM

Explain why.

### 3. Primary surfaces
Propose the major Studio surfaces/routes at a v1 level.
Examples may include:
- home / overview
- intake / stepper
- working library
- customers
- customer workspace
- feed planner
- communication / review
- admin-only or admin-first surfaces

### 4. Object model
Define the primary objects and how they differ.
At minimum consider:
- imported clip
- base concept
- customer-adapted concept
- feed placement
- customer-visible artifact
- customer object, including pre-invite states

### 5. State transitions
Describe the likely flow between these objects/states.
At minimum consider:
- import -> triage -> analysis -> concept -> adaptation -> planning -> customer visibility
- pre-invite customer -> invited -> registered -> active managed customer

### 6. Private vs customer-visible boundary
Explain what should remain CM-private versus what should be customer-visible.

### 7. Studio vs Admin boundary
Identify what belongs inside Studio versus what should be kept as Admin-first or Admin-only.

### 8. Three implementation options
Provide 2–3 plausible low-risk ways to evolve toward this IA.
For each option, describe:
- benefits
- tradeoffs
- migration complexity

### 9. Preferred v1 recommendation
Recommend one option and explain why it is the best v1 path.

## Guardrails
- do not assume a full rewrite
- do not ignore current repo constraints
- distinguish v1 from future-state expansion
- keep the proposal implementable
- preserve useful existing customer-workspace primitives where possible

## Helpful context from the current discussion
The intended CM operating rhythm is roughly:
- collect many candidate clips from TikTok
- triage and categorize quickly
- analyze only selected clips deeply
- adapt selected concepts to customers
- place them in a feed/timeline plan
- update notes, game plan, and communication
- help the customer understand what to make and why

The prior `stepper` idea is important because it suggests:
- collection-level import
- quick visual triage
- low-friction categorization
- avoiding immediate full analysis cost on every imported clip

## Output style
Structured, concrete, and product-architectural.
Avoid fluff. Use headings, bullets, and short rationale paragraphs.
