# Synthesis of A / B / C

## Executive summary
The three outputs converge strongly on one core conclusion:

**Studio already has substantial customer-workspace capability, but its entry point, role-shaping, and concept architecture are misaligned with the intended CM-first operating model.**

The safest and highest-signal first move is therefore:

1. keep `/studio/customers` as the admin/org overview surface
2. introduce a CM-specific landing such as `/studio/home`
3. make `/studio` redirect by role
4. make Studio shell navigation role-aware
5. leave schema and deep object-model changes for later slices

This is the main no-regret path supported by all three workstreams.

---

## 1. What A established as current-system truth

### 1.1 Studio is currently customer-workspace-first, not intake-first
Confirmed by code:
- `/studio` hard-redirects to `/studio/customers`
- both `admin` and `content_manager` use the same Studio shell
- the current shell nav is static: customers, concepts, upload, invoices
- the heaviest concentration of functionality lives in `/studio/customers/[id]`

### 1.2 The customer workspace is already materially useful
A confirmed that `/studio/customers/[id]` already supports:
- game plan editing and notes
- customer concept assignment and override handling
- feed planning and feed spans
- communication/email workflows
- demo and historical content import

This means the repo already contains strong downstream primitives for a future CM workbench.

### 1.3 The biggest implementation mismatch is not lack of capability, but poor front-door shaping
Current problems confirmed by A:
- CM lands on the same broad customer list as admin
- `/studio/customers` is not scoped to assigned customers
- shell nav is not role-aware
- invoices remain exposed in Studio for CM
- there is no CM-specific home surface even though a dashboard API already exists

### 1.4 Concept architecture is the clearest data-source inconsistency
A confirmed that concept-related surfaces are split across several models:
- `/studio/concepts` uses bundled JSON via `conceptLoader`
- customer workspace prefers DB concepts via `conceptLoaderDB`, then falls back to JSON
- `/studio/upload` uses live `hagen-main` analysis then persists DB concepts
- customer-facing concept/feed APIs are DB-based

So the current Studio concept world is not single-source-of-truth.

### 1.5 Pre-invite/pre-registration is already real in the current system
A confirmed that the current repo already supports meaningful pre-registration states and flows:
- customers can exist before signup (`pending`)
- admin invite upgrades them to `invited`
- setup activates them to `active`
- demo content can be prepared and shown before login
- public demo routes already exist

This strongly supports the intended product principle that Studio should support work before customer registration is complete.

---

## 2. What B established as the target Studio IA v1

### 2.1 Studio should remain one shared operational system, but with role-shaped modes
B proposes:
- **Admin** uses Studio for cross-customer overview and CM oversight
- **Content manager** uses Studio as a creative workbench

This is not two separate products. It is one system with different default emphasis.

### 2.2 Recommended role-based landings
B recommends:
- admin -> `/studio/customers`
- content_manager -> `/studio/home`

This is the central IA decision that both B and C support.

### 2.3 Primary surface model for v1
B proposes a route model close to the current repo:
- `/studio` = role-shaped redirect
- `/studio/home` = CM workbench
- `/studio/intake` = lightweight intake / stepper surface
- `/studio/concepts` = working concept library
- `/studio/customers` = customer index / admin overview / secondary CM list
- `/studio/customers/[id]` = core customer workspace
- `/admin/*` = org-admin shell outside the core Studio workflow

### 2.4 Object model should be explicitly layered
B argues Studio should distinguish at least:
- imported clip
- base concept
- customer-adapted concept
- feed placement
- customer-visible artifact
- communication artifact
- customer object with pre-registration lifecycle

This is the clearest intended-system correction to the current architecture.

### 2.5 Customer and concept workflows should become stage-aware
B recommends:
- imported -> triaged -> shortlisted/rejected -> analyzed -> promoted to base concept -> adapted to customer -> placed in feed -> published to customer
- prep -> invited -> registered -> active -> optional paused/closed

Important synthesis note:
this target lifecycle is stronger and cleaner than the current schema/status model, but should not be forced into the first implementation slice.

---

## 3. What C established as the best execution path

### 3.1 First PR should be role-shaped Studio entry
C recommends as first PR:
- add `/studio/home`
- make `/studio` redirect by role
- update role routing helpers so CM login/invite completion lands on `/studio/home`
- make Studio nav role-aware
- keep `/studio/customers` intact

This aligns almost perfectly with B and fits A's code reality.

### 3.2 Why this first
C's reasoning is strong:
- fixes the largest workflow mismatch
- requires no schema migration
- preserves working customer surfaces
- creates a clean place for intake later
- avoids mixing routing/IA changes with concept/source/lifecycle rewrites

### 3.3 Recommended slice order
C recommends:
1. role-shaped Studio entry + minimal CM home
2. intake shell
3. concept library live-source correction
4. role-aware customer index and prep framing
5. intake persistence and concept-stage modeling
6. pre-invite / pre-registration hardening

This sequence is coherent with both A and B.

---

## 4. Where A / B / C clearly agree

### 4.1 The front door is the biggest near-term problem
All three outputs converge on the idea that:
- `/studio/customers` is not the right default landing for CM
- it can still remain a good admin/org overview

### 4.2 The customer workspace should be preserved, not rewritten first
All three imply that `/studio/customers/[id]` is already valuable enough to preserve while reshaping the outer IA.

### 4.3 Intake should exist as a first-class surface, but not in PR1
All three support intake/stepper directionally, but A shows current repo truth does not yet support the full model cleanly.
So the right move is:
- create IA space for intake early
- defer deep persistence/object-model decisions

### 4.4 Concept source correction is necessary, but should be separated from PR1
A confirms the mismatch.
B reframes `/studio/concepts` as a working library.
C places live-source correction in a later slice.

### 4.5 Pre-invite is real, but lifecycle formalization should wait
A proves pre-registration work already exists.
B says it should become a first-class workflow.
C says full lifecycle hardening should not block the first routing/IA changes.

---

## 5. The main gap model after synthesis

### Gap 1 — Role-shaped operation vs shared static entry
**Current:** both admin and CM effectively share the same Studio front door and shell emphasis.
**Intended:** one Studio with different default entry and focus by role.
**Implication:** role-shaped landing is the cleanest first correction.

### Gap 2 — Strong downstream workspace vs weak upstream intake
**Current:** the repo is rich in per-customer execution surfaces but weak in lightweight intake/triage.
**Intended:** CM workflow starts with discovering, triaging, and selectively enriching candidate clips.
**Implication:** add intake as a distinct surface after the landing split.

### Gap 3 — Concept object collapse
**Current:** JSON snapshots, DB concepts, customer overrides, and planning rows blur together.
**Intended:** imported clip, base concept, adapted concept, and feed placement should be distinct.
**Implication:** do not attempt deep object cleanup in PR1; plan for a later stage-aware model.

### Gap 4 — Pre-invite exists operationally but not cleanly as a modeled workspace stage
**Current:** pending/invited/agreed/active plus demo flows already support pre-registration work.
**Intended:** prep is a first-class state with clear operational semantics.
**Implication:** start by making prep customers more visible and usable before renaming statuses or adding new ones.

### Gap 5 — Studio/Admin boundary is porous
**Current:** invoices and some admin-shaped operations still sit inside Studio for CM.
**Intended:** Studio should be creative/operational; Admin should remain backoffice/org.
**Implication:** demote/hide admin-oriented surfaces for CM before removing or restructuring them.

---

## 6. Recommended decisions to lock now

These are the decisions most strongly supported by A / B / C and are safe to treat as working decisions.

### Decision 1
`/studio/customers` remains the admin/org overview surface for v1.

### Decision 2
`content_manager` should not land on `/studio/customers` by default.
Create a new CM landing at `/studio/home`.

### Decision 3
First implementation slice should be role-shaped Studio entry and nav treatment.
No schema migration required.

### Decision 4
`/studio/customers/[id]` stays as the core customer workspace in v1.
Do not start with a rewrite.

### Decision 5
Intake/stepper should become a first-class Studio surface, but initially as a shell/IA move rather than a full backend/object-model build.

### Decision 6
Concept-library live-source correction should be a separate follow-up slice, not bundled into PR1.

### Decision 7
Treat current `admin` as the v1 stand-in for any future `studio-admin` concept.
Do not add a new auth role yet.

---

## 7. Decisions not yet safe to lock

These areas remain insufficiently settled and should stay open.

### Open decision A — exact ownership/scoping model for CM
A shows a mismatch between:
- `account_manager` string usage
- `account_manager_profile_id` usage

Do not over-commit to "my customers only" behavior until ownership rules are verified.
A practical v1 compromise is:
- give CM a role-shaped home first
- decide customer-list scoping next

### Open decision B — authoritative source of truth for imported clips
Still unclear whether imported clip truth should live primarily in:
- `hagen-main`
- Supabase in `hagen-ui`
- or a hybrid model

This matters before intake persistence is built.

### Open decision C — exact concept-stage data boundaries
Still unresolved:
- what makes a base concept authoritative
- what belongs in `concepts`
- what belongs only in `customer_concepts`
- whether feed placement should remain in `customer_concepts` or split out

### Open decision D — lifecycle vocabulary
B proposes cleaner lifecycle states (`prep`, `registered`, `paused`, `closed`), but A shows current code/statuses are different (`pending`, `invited`, `agreed`, `active`, `archived`).

Recommended stance:
- do not rename statuses yet
- map intended semantics onto current states first

### Open decision E — invite flow canonicalization
A found two invite paths.
That should be resolved before deeper lifecycle hardening.

---

## 8. Recommended first PR

## Title
Role-shaped Studio entry with minimal CM workbench

## Scope
- add `/studio/home`
- update `/studio` to redirect by role
- update auth/navigation helpers so CM lands on `/studio/home` after relevant auth flows
- make Studio nav role-aware
- keep `/studio/customers` intact
- optionally use existing `/api/studio-v2/dashboard` to seed basic CM cards

## In scope
- routing
- shell/nav shaping
- small new page for CM home
- existing-data-only widgets/cards

## Out of scope
- intake persistence
- schema changes
- concept-model rewrite
- concept-source correction
- customer-workspace rewrite
- new auth roles
- invoice route removal

## Acceptance criteria
- admin visiting `/studio` lands on `/studio/customers`
- content_manager visiting `/studio` lands on `/studio/home`
- CM login/invite completion no longer lands on `/studio/customers`
- `/studio/customers` still works as before
- CM nav prioritizes workbench/home and hides or demotes admin-oriented items
- admin nav still exposes broad Studio surfaces
- no DB migration is required

---

## 9. Recommended immediate follow-up order

1. **PR1:** role-shaped Studio entry + minimal CM home
2. **PR2:** intake shell / route framing
3. **PR3:** concept library DB-first correction with fallback
4. **PR4:** customer index refinement and clearer prep/invited framing
5. **PR5:** real intake persistence and stage-aware concept objects
6. **PR6:** pre-invite / registration lifecycle hardening

---

## 10. If you can run more Codex instances in ~4 hours

The next best parallel investigations are more focused than the original A/B/C pass.

### Suggested next instance D — Ownership / auth / routing truth
Mission:
- determine how CM ownership should actually work
- trace `account_manager`, `account_manager_profile_id`, auth role helpers, and dashboard/customer filters
- answer whether CM should see all customers, assigned customers by default, or both via modes/filters

### Suggested next instance E — Concept-source and object-boundary truth
Mission:
- trace `concepts`, `customer_concepts`, JSON export usage, upload pipeline, and customer-facing concept/feed APIs
- propose a concrete DB-first migration path for `/studio/concepts`
- identify which fields/rows represent base concept vs adapted concept vs feed placement today

### Suggested next instance F — Invite / prep lifecycle truth
Mission:
- trace admin customer creation, invite flow, `/api/auth/invite`, auth callback, setup flow, onboarding/agreement/checkout, and demo access
- produce a canonical lifecycle map from pre-customer creation through active managed customer
- identify what is safe to formalize in v1 without breaking onboarding

These three would reduce the main remaining uncertainty clusters left by A/B/C.

---

## Final synthesis sentence
The right v1 move is **not** to rebuild Studio from scratch.
It is to **reframe the existing Studio around role-shaped entry, preserve the strong customer workspace, create space for intake, and only then untangle concept and lifecycle modeling with focused follow-up slices.**
