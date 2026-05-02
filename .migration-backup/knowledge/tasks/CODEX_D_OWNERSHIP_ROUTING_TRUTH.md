# Codex D — Ownership / Auth / Routing Truth

## Mission
Establish the current-system truth for how Studio ownership, routing, and role-based visibility actually work today.

This is a focused audit intended to reduce the biggest remaining uncertainty around the first PR and the near-term role-shaped Studio direction.

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
1. How does role-based routing actually work now?
2. What is the real current ownership model for customers in Studio?
3. Should `content_manager` see all customers, assigned customers, or both with different defaults?
4. What is the safest v1 ownership/routing rule for `/studio`, `/studio/home`, and `/studio/customers`?

## Focus areas
- `app/src/lib/auth/navigation.ts`
- `app/src/middleware.ts`
- `app/src/app/studio/page.tsx`
- `app/src/app/studio/layout.tsx`
- `app/src/app/auth/callback/page.tsx`
- `app/src/app/studio/customers/page.tsx`
- `app/src/app/api/studio-v2/dashboard/route.ts`
- any account-manager helpers/utilities
- `src/types/database.ts`
- any relevant admin/team/profile/customer routes

## Specific things to trace
- `getPrimaryRouteForRole`
- middleware header/session behavior
- where `admin`, `content_manager`, `customer`, `user` are distinguished
- whether any real `studio-admin` concept exists in code or only as design language
- `customer_profiles.account_manager`
- `customer_profiles.account_manager_profile_id`
- any joins to `profiles`
- any places where "my customers" logic already exists
- any places where CM access is intentionally global
- whether dashboard endpoints already expose enough data for a safe `/studio/home`

## Required deliverables

### 1. Confirmed routing truth
Explain how users are currently routed:
- at login/callback
- at `/studio`
- at role-specific entry points
- inside the Studio shell

### 2. Confirmed ownership truth
Document the actual customer-ownership model in code today.
Be explicit about:
- string-based account manager usage
- profile-id-based ownership usage
- where the two disagree
- which one appears more trustworthy

### 3. Access/visibility matrix
Create a concise matrix for:
- `admin`
- `content_manager`
- `customer`
- any other relevant roles

For each, show likely access/landing behavior for:
- `/studio`
- `/studio/customers`
- `/studio/customers/[id]`
- `/studio/invoices`
- `/admin`

### 4. Risks for the first PR
Identify the main risks if we implement:
- role-shaped `/studio` redirect
- `/studio/home` for CM
- role-aware nav

### 5. Recommended v1 rule set
Propose the safest near-term rule set for:
- who lands where
- whether CM home should use only assigned customers or broader data
- whether `/studio/customers` should remain global, filtered, or role-shaped in v1

This recommendation must be grounded in current repo truth, not pure product preference.

### 6. Blocked questions
List what still cannot be settled confidently from code.

## Guardrails
- do not implement code
- do not redesign the whole product
- stay evidence-oriented
- distinguish confirmed fact vs inference
- prefer conservative recommendations that do not require schema changes

## Output
Write final output to:
- `knowledge/tasks/OUTPUT_D_OWNERSHIP_ROUTING_TRUTH.md`
