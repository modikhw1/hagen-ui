# Output C - Implementation Plan

## 1. Summary recommendation

The best first move is a small, reversible routing and shell change:

- keep `/studio/customers` as the current admin/org oversight landing
- add a new CM landing at `/studio/home`
- make `/studio` redirect by role
- make Studio shell navigation role-aware so CM sees an operational workbench first and admin keeps the broad overview

Why this should be first:

- it fixes the biggest workflow mismatch without touching schema
- it preserves the existing customer index and customer workspace
- it gives the repo a clean place to add intake next
- it avoids mixing landing changes with concept-source rewrites or pre-invite modeling

Important repo constraint:

- there is no separate `studio-admin` role in code today; current role handling is `admin` / `content_manager` / `customer` / `user`
- v1 should therefore treat `admin` as the admin/studio-admin mode unless auth roles are expanded later

## 2. Slice table

| Slice | Purpose | Why in this order | Risk | Can happen without schema changes? | Depends on API / data-model clarification? | Likely affected files / routes / components |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Role-shaped Studio entry + minimal CM home | Make Studio land differently for admin vs CM and give CM a real operational entry | Highest product signal, lowest technical risk, preserves current routes | Low | Yes | No, if `/studio/home` uses existing data only | `app/src/app/studio/page.tsx`, new `app/src/app/studio/home/page.tsx`, `app/src/app/studio/layout.tsx`, `app/src/lib/auth/navigation.ts`, `app/src/lib/studio/navigation.ts`, `app/src/app/auth/callback/page.tsx`, optionally `app/src/app/api/studio-v2/dashboard/route.ts` |
| 2. Intake path shell | Create a visible route and IA slot for intake/stepper without building the full object model yet | Establishes the next surface early, but keeps implementation shallow | Low-Medium | Yes, for route/shell/CTA scaffolding | Yes, for persisted intake queue and triage states | new `app/src/app/studio/intake/page.tsx`, `app/src/lib/studio/navigation.ts`, `app/src/app/studio/home/page.tsx`, `app/src/app/studio/upload/page.tsx` |
| 3. Concept library live-source correction | Move `/studio/concepts` off local JSON-first behavior toward DB/live source with safe fallback | Corrects a major truth mismatch before deeper workflow changes build on it | Medium | Yes, for DB-first + fallback | Yes, for ownership/share-scope/status semantics in the library | `app/src/app/studio/concepts/page.tsx`, `app/src/app/studio/concepts/[id]/page.tsx`, `app/src/app/studio/concepts/[id]/edit/page.tsx`, `app/src/lib/conceptLoader.ts`, `app/src/lib/conceptLoaderDB.ts`, `app/src/app/studio/upload/page.tsx` |
| 4. Role-aware customer index and prep framing | Keep `/studio/customers` useful for admin while making it clearer for CM and prep/invited customers | Safe refinement once landings are separated | Medium | Mostly yes | Partly, if prep lifecycle labels or attention states need new backend fields | `app/src/app/studio/customers/page.tsx`, `app/src/lib/studio/customer-status.ts`, `app/src/lib/studio/navigation.ts`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/app/studio/customers/[id]/page.tsx` |
| 5. Intake persistence and concept-stage modeling | Add the real imported clip -> triage -> analyzed/base concept flow | This is the first slice that should reshape core objects, so it should wait | High | No | Yes, strongly | likely new intake APIs/routes, `app/src/app/api/studio-v2/*`, new types under `app/src/types/`, concept/customer workspace adapters, possible Supabase migrations |
| 6. Pre-invite / pre-registration workspace hardening | Support real prep work before customer registration, not just status labels | Needs role-shaped entry and clearer object boundaries first | High | Partly for UI-only prep affordances; not for full lifecycle | Yes, strongly | `app/src/app/admin/customers/page.tsx`, `app/src/app/api/admin/customers/*.ts`, `app/src/app/auth/callback/page.tsx`, `app/src/app/studio/customers/page.tsx`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, related profile/customer types |

### What can move now without schema changes

- role-shaped `/studio` redirect and consistent auth redirect helpers
- a minimal `/studio/home` built from existing dashboard/customer data
- role-aware Studio nav treatment
- a `/studio/intake` shell or placeholder route
- DB-first concept loading for `/studio/concepts` with JSON fallback while parity is verified
- copy/filter/state changes in `/studio/customers` using existing statuses like `pending`, `invited`, `agreed`, `active`

### What should wait for API / data-model clarification

- a persisted intake queue with clip-level triage states
- the boundary between imported clips, base concepts, customer-adapted concepts, and feed placements
- CM-private vs shared/global library ownership rules
- full pre-invite lifecycle semantics, especially if `prep` / `registered` / `paused` states are introduced
- any new `studio-admin` role or auth-policy split from current `admin`

## 3. Detailed first PR

### Recommended first PR

**Title:** Role-shaped Studio entry with minimal CM workbench

### Exact scope

- change Studio default entry from a fixed redirect to a role-shaped redirect
- add `/studio/home` as the CM landing
- update shared role routing so CM post-login and invite-complete flows also land on `/studio/home`
- make the Studio shell nav role-aware:
  - admin keeps broad overview entry points
  - CM sees the workbench first
  - admin-oriented items like invoices are demoted or hidden for CM, but not removed as routes
- keep `/studio/customers` functionally intact in this PR

### Suggested implementation shape

- `admin` -> `/studio/customers`
- `content_manager` -> `/studio/home`
- `/studio/home` should be compact and operational, using existing data only:
  - my customers
  - pending/invited customers assigned to me if available
  - shortcuts to customer work, concepts, upload, and later intake
  - optional stats from the existing `/api/studio-v2/dashboard`

### Likely touched files

- `app/src/app/studio/page.tsx`
- `app/src/app/studio/home/page.tsx` (new)
- `app/src/app/studio/layout.tsx`
- `app/src/lib/auth/navigation.ts`
- `app/src/lib/studio/navigation.ts`
- `app/src/app/auth/callback/page.tsx`
- possibly `app/src/app/api/studio-v2/dashboard/route.ts` if the CM home needs slightly different cards

### Intentionally out of scope

- no stepper implementation
- no intake persistence
- no concept schema or object-model rewrite
- no `/studio/customers/[id]` section rewrite
- no new auth role like `studio-admin`
- no invoice route removal
- no concept-source correction in the same PR

### Acceptance criteria

- visiting `/studio` as `admin` lands on `/studio/customers`
- visiting `/studio` as `content_manager` lands on `/studio/home`
- CM login/invite completion no longer hard-lands on `/studio/customers`
- `/studio/customers` remains available and unchanged as a useful overview surface
- CM shell nav presents `/studio/home` as the primary entry and hides or demotes admin-oriented items such as invoices
- admin shell nav still exposes the current broad Studio surfaces
- the new CM home renders meaningful data from existing sources and degrades safely if dashboard data is missing
- no database migration is required

### Rollback / reversibility

- keep all existing routes in place; only add `/studio/home`
- do not rename `/studio/customers`
- keep invoice/customer/concept routes intact; only change nav exposure
- centralize the new landing rule in `app/src/lib/auth/navigation.ts` so rollback is one helper change plus the `/studio` entry page
- if `/studio/home` underperforms, CM can be pointed back to `/studio/customers` without data migration or URL breakage

## 4. Dependencies and blocked questions

### Dependencies already visible in the repo

- role routing is already centralized enough to reuse: `app/src/lib/auth/navigation.ts`, `app/src/middleware.ts`
- Studio shell nav is centralized enough to make role-aware: `app/src/lib/studio/navigation.ts`, `app/src/app/studio/layout.tsx`
- there is already a dashboard API that can seed a minimal CM home: `app/src/app/api/studio-v2/dashboard/route.ts`
- the customer workspace already supports useful downstream work: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

### Blocked questions that do not need to stop the first PR

- should `studio-admin` become a real distinct role, or is current `admin` enough for v1?
- should CM home be strictly "my assigned customers" via `account_manager_profile_id`, or should it fall back to looser ownership fields where assignment data is incomplete?
- should `/studio/invoices` remain directly accessible to CM even if hidden from nav?
- should `/studio/intake` be a separate route immediately after the first PR, or a block inside `/studio/home` first?

### Blocked questions that matter before deeper slices

- what is the source of truth for imported clips: `hagen-main`, Supabase in `hagen-ui`, or both?
- is the current `concepts` table the authoritative source for the Studio library, or only for analyzed/promoted concepts?
- what fields define a base concept vs a customer-adapted concept vs a feed placement?
- should current customer statuses (`pending`, `invited`, `agreed`, `active`) be extended, mapped, or replaced for prep/pre-registration workflow?
- can meaningful prep work exist before a full customer auth identity is created, and if so which records own that state?

## 5. Follow-up slices

### Slice 2: Intake shell

Add `/studio/intake` as a visible next stop from CM home. Keep it intentionally light:

- import CTA
- placeholder collection intake framing
- triage-stage explanation
- bridge to current upload flow where needed

This slice is mainly about creating the right route and mental model, not finishing Stepper.

### Slice 3: Concept source correction

Change `/studio/concepts` to reflect real Studio data before more workflow depends on it.

Recommended approach:

- use `conceptLoaderDB` first
- keep JSON fallback during rollout
- label the page as a working library, not the Studio front door

This should remain separate from intake modeling so source correction can be reviewed on its own.

### Slice 4: Customer index and prep framing

Refine `/studio/customers` after the landing split:

- admin keeps a broad cross-customer overview
- CM uses it as a secondary list, not the first stop
- invited/pending/agreed customers become more visibly usable as prep workspaces
- the existing `demo` section can temporarily carry prep-mode activity

This should not require a full lifecycle rewrite yet.

### Slice 5: Intake persistence and stage-aware objects

Implement the first real backend/object-model expansion:

- imported clip records
- triage decisions
- selective promotion into analyzed/base concepts
- explicit transition into customer adaptation

This is the first slice that should consider migrations and stronger API design.

### Slice 6: Pre-invite workspace hardening

After object boundaries are clearer, formalize the pre-registration path:

- operational customer/prep state before registration
- invite and registration handoff
- visibility rules for what can be prepared before the customer exists as an authenticated user

This slice should be kept separate from concept-source work so lifecycle changes stay reviewable.

## Recommended execution order

1. Role-shaped Studio entry + minimal CM home
2. Intake shell
3. Concept library live-source correction
4. Role-aware customer index and prep framing
5. Intake persistence and concept-stage model
6. Pre-invite / pre-registration hardening

That order keeps the first two PRs small, preserves current admin utility, and creates a clean path toward intake, concept-source correction, and pre-invite work without forcing a risky rewrite.
