# Codex F — Invite / Prep Lifecycle Truth

## Mission
Establish the current truth for pre-invite, invite, onboarding, registration, activation, and demo/prep lifecycle behavior.

This should reduce uncertainty around how Studio can support customer work before full registration, without breaking the existing onboarding model.

## Read first
- `knowledge/tasks/ACTIVE_TASK.md`
- `knowledge/tasks/ACTIVE_ANALYSIS.md`
- `knowledge/tasks/ACTIVE_PLAN.md`
- `knowledge/tasks/COLLABORATION_STATE.md`
- `knowledge/tasks/OUTPUT_A_CURRENT_SYSTEM_AUDIT.md`
- `knowledge/tasks/OUTPUT_B_STUDIO_IA_V1.md`
- `knowledge/tasks/OUTPUT_C_IMPLEMENTATION_PLAN.md`
- `knowledge/tasks/OUTPUT_SYNTHESIS_STUDIO_DIRECTION.md`

## Primary questions
1. What is the canonical current customer lifecycle in code?
2. How do pre-registration customer records relate to auth users, invites, onboarding, agreement, checkout, and activation?
3. Which invite path is actually canonical?
4. What prep/demo work can already happen before customer registration?
5. What is the safest v1 way to formalize prep/pre-invite without breaking onboarding?

## Focus areas
- `app/src/app/api/admin/customers/route.ts`
- `app/src/app/api/admin/customers/[id]/route.ts`
- `app/src/app/api/auth/invite/route.ts`
- `app/src/app/auth/callback/page.tsx`
- `app/src/app/api/admin/profiles/setup/route.ts`
- `app/src/app/welcome/page.tsx`
- `app/src/app/onboarding/page.tsx`
- `app/src/app/agreement/page.tsx`
- `app/src/app/checkout/page.tsx`
- `app/src/app/checkout/complete/page.tsx`
- `app/src/app/demo/[customerId]/page.tsx`
- `app/src/components/studio/customer-detail/CustomerDemoPanel.tsx`
- `app/src/app/api/demo/import-history/route.ts`
- `app/src/types/database.ts`
- any relevant migrations or schema helpers

## Specific things to trace
- creation of `customer_profiles` before auth linkage
- when `status` changes from `pending` to `invited` to `active` or related states
- how `agreed` is used vs `active`
- how Stripe and onboarding connect to profile activation
- how `profiles.setup` links users to customers
- whether `POST /api/auth/invite` is legacy, parallel, or still canonical in some flow
- what public demo access really exposes
- what customer prep activity is already possible before login

## Required deliverables

### 1. Canonical lifecycle map
Produce the clearest current lifecycle you can, from earliest customer creation through active use.
Include:
- pre-customer or customer record creation
- invite issuance
- password/auth setup
- onboarding/agreement/checkout steps
- profile/customer linking
- activation
- demo/prep exposure

### 2. Status and state table
Create a table of current states/status values and where each is set/used.
Especially cover:
- `pending`
- `invited`
- `agreed`
- `active`
- `archived`
- any other relevant states you find

### 3. Invite-path comparison
Compare:
- admin customer invite flow
- `POST /api/auth/invite`
- any team-member invite path

Explain which appears canonical for which purpose.

### 4. Prep/demo capabilities already present
Document exactly what Studio/Admin can already do before customer registration is complete.

### 5. Risks and inconsistencies
Identify lifecycle inconsistencies, duplicated invite logic, or exposure risks.
Especially flag anything risky about public demo access or status transitions.

### 6. Safest v1 recommendation
Recommend how to treat prep/pre-invite in v1 without requiring a full lifecycle rewrite.
This should include:
- which current states can be reused
- whether semantics should be mapped before renaming anything
- what UI/product behavior can change safely before backend lifecycle redesign

## Guardrails
- do not implement code
- do not assume current lifecycle is clean or canonical without evidence
- separate confirmed current behavior from proposed cleanup
- optimize for compatibility with the current system

## Output
Write final output to:
- `knowledge/tasks/OUTPUT_F_INVITE_PREP_LIFECYCLE.md`
