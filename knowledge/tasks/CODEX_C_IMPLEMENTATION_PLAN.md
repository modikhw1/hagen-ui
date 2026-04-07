# Codex C — Implementation Plan

## Mission
Create an implementation plan for evolving the current Studio in `hagen-ui` toward a CM-first workflow without breaking current admin utility.

Do not implement full code yet unless a very small, clearly safe scaffold is obvious.
Your job is to define the safest path to execution.

## Planning goals
- preserve what already works for admin/org overview where valid
- enable a better CM-first entry and workflow
- avoid unnecessary schema churn too early
- separate low-risk UI/routing changes from deeper data-model changes
- create a path toward intake/stepper, corrected concept sourcing, and pre-invite support

## Required deliverables

### 1. Implementation slices in dependency order
Break the work into sequential slices.
For each slice, include:
- purpose
- user value
- why it belongs in this order

### 2. Affected files/routes/components per slice
List likely touched files for each slice.
You do not need to be exhaustive, but be concrete.

### 3. Risk level per slice
Classify each slice as low / medium / high risk and explain why.

### 4. Schema/API dependency analysis
For each slice, state whether it can be done:
- without schema changes
- with local route/component changes only
- only after API/data-model clarification

### 5. Recommended first PR
Define the best first pull request.
Include:
- exact scope
- expected files/routes touched
- what is intentionally left out
- acceptance criteria

### 6. Risks and rollback considerations
Explain what could go wrong and how to keep the first slice reversible.

## Priorities
Prioritize a path that supports:
- role-shaped landing behavior
- minimal disruption to `/studio/customers` if it remains useful for admin/org oversight
- a future intake/stepper route or shell
- a future correction of concept data sourcing
- a future pre-invite / pre-registration workspace

## Strong candidate for first slice
A likely preferred first slice is:
### Role-shaped Studio entry
This may include:
- `/studio` redirect behavior shaped by role
- admin/studio-admin landing preserving broad overview
- CM landing focused on active work
- demotion or hiding of admin-oriented nav items for CM

Do not assume this is correct without checking repo constraints, but treat it as the leading candidate.

## Guardrails
- do not jump directly to deep object-model rewrites
- do not require a full Stepper implementation in the first PR
- do not mix concept-source correction, pre-invite modeling, and landing changes into one large risky change unless there is a compelling reason
- prefer small, defensible, reviewable slices

## Suggested output structure
1. Summary recommendation
2. Slice table
3. Detailed first PR
4. Dependencies and blocked questions
5. Follow-up slices

## Output style
Be execution-oriented and concrete.
Prefer actionable tables/bullets over narrative.
