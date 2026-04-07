# Output B - Studio IA v1

## Framing
Studio v1 should be a shared operational system with two role-shaped modes, not two separate products:

- Admin / studio-admin uses Studio for cross-customer operational visibility and CM oversight.
- Content manager uses Studio as a creative workbench for intake, triage, adaptation, planning, and communication.

This should evolve from the current repo, not replace it. The current anchors worth preserving are:

- `/studio/customers` already exists and is a sensible oversight surface.
- `/studio/customers/[id]` already contains useful customer-workspace primitives.
- `/studio/concepts` already exists and can be re-positioned.
- `/studio/upload` already touches the real import / analysis pipeline.
- `/admin/*` already exists as a separate shell for org administration.

## 1. Role-based Studio model

### Admin / studio-admin
Studio for admin should emphasize operational overview:

- customer roster and status
- who owns which customer
- which customers need CM attention
- pre-invite / pre-registration preparation status
- visibility into customer work without duplicating Admin billing/team surfaces

Admin should be able to drill into any customer workspace, but not be forced through a CM-style intake flow.

### Content manager
Studio for CM should emphasize the weekly creative loop:

- bring in references
- triage quickly before analysis
- promote selected references into reusable concepts
- adapt concepts to a customer
- place them into feed planning
- communicate the right subset to the customer

CM Studio should feel like a workbench with active queues, not just a customer directory.

## 2. Recommended landings

### Admin landing
Recommended Studio landing: `/studio/customers`

Why:

- it already matches the current route shape
- it gives org-level overview without inventing a new admin dashboard
- it supports oversight across active, prep, and invited customers
- it stays distinct from `/admin`, which should remain the main home for team, billing, and subscriptions

### CM landing
Recommended Studio landing: `/studio`

Behavior:

- `admin` / `studio-admin` redirect to `/studio/customers`
- `content_manager` redirects to a new CM workbench route such as `/studio/home`

Why:

- a CM should not land on a customer list by default
- intake, triage, active customer tasks, and communication follow-up need to be visible together
- this is a low-risk change because it mostly affects routing and framing, not the deep customer workspace

## 3. Proposed primary surfaces / routes

The v1 route model should stay close to what exists today.

### `/studio`
Role-shaped redirect entry:

- admin -> `/studio/customers`
- CM -> `/studio/home`

### `/studio/home`
New CM workbench landing.

Primary blocks:

- intake queue
- triage queue
- concepts awaiting analysis
- concepts awaiting customer adaptation
- customers needing feed planning
- customers awaiting communication / reply / review

This should be a compact operational dashboard, not a new object model on its own.

### `/studio/intake`
New dedicated intake / stepper surface for lightweight pre-analysis work.

Primary jobs:

- import TikTok collection or references
- scan thumbnails and lightweight metadata
- tag, shortlist, reject, or defer
- select only some clips for expensive analysis

This is where imported clips live before they become concepts.

### `/studio/concepts`
Keep the existing route, but redefine it as the working concept library, not the whole Studio front door.

Its v1 role:

- show base concepts that survived triage / analysis
- support reuse across customers
- allow filtering by owner, source, status, and reuse count
- remain secondary to intake for discovery and secondary to customer workspace for adaptation

### `/studio/customers`
Keep as the operational customer index.

Its v1 role:

- primary Studio landing for admin
- secondary navigation surface for CM
- include active customers, prep customers, invited customers, and attention flags
- support filtering by CM owner, lifecycle stage, and action-needed state

### `/studio/customers/[id]`
Keep as the core customer workspace.

The current section model is usable and should be preserved short-term:

- `gameplan`
- `koncept`
- `feed`
- `kommunikation`
- `demo`

Recommended v1 interpretation:

- `gameplan`: customer brief, goals, strategic notes, customer context
- `koncept`: customer-adapted concepts and filming guidance
- `feed`: placements, cadence, planned output timeline
- `kommunikation`: outbound/inbound communication and review context
- `demo`: pre-invite / prep workspace until a cleaner `prep` section exists

### `/admin/*`
Remain Admin-first and outside the Studio core workflow.

In the current repo, invoices already exist in both Admin and Studio. V1 should stop expanding that overlap and gradually pull invoice-first work back toward Admin.

## 4. Object model

Studio v1 should treat these as distinct objects, not one blurred "concept" entity.

### Imported clip
Definition:

- a raw reference from TikTok or another source
- lightweight metadata only at first
- usually CM-private

Core attributes:

- source URL
- thumbnail
- creator / platform metadata
- quick tags
- intake notes
- triage decision
- analysis requested? yes/no

### Base concept
Definition:

- a reusable concept created from a selected imported clip after deeper analysis
- still customer-agnostic

Core attributes:

- canonical title
- source reference
- extracted structure / hooks / scenes
- analysis output
- reusable guidance
- owner and share scope

### Customer-adapted concept
Definition:

- a customer-specific version of a base concept
- contains fit rationale, custom script, filming instructions, and strategic framing

Core attributes:

- customer id
- base concept id
- customer-specific angle
- script / scenes / instructions
- internal status
- visibility status

### Feed placement
Definition:

- a scheduling / planning object that places a customer-adapted concept into a timeline or slot

Core attributes:

- customer id
- adapted concept id
- slot / week / date window
- campaign or pillar
- planning status

### Customer-visible artifact
Definition:

- the curated representation shown or sent to the customer
- may be a concept card, feed item, message attachment, or demo output

Core attributes:

- artifact type
- source adapted concept or feed placement
- customer-facing title and copy
- visible instructions
- published / sent timestamp

### Communication artifact
Definition:

- notes, emails, review messages, and feedback threads around customer-visible work

### Customer object
Definition:

- the operational customer record Studio works against, including pre-registration states

Recommended lifecycle states:

- `prep` - customer exists operationally, work can begin, no account required yet
- `invited` - invitation sent, not completed
- `registered` - account exists, workspace can be shared
- `active` - normal managed customer
- `paused` - temporarily inactive
- `closed` - no longer managed

## 5. State transitions

### Concept workflow
Recommended v1 flow:

1. `imported`
2. `triaged`
3. `shortlisted` or `rejected`
4. `analyzed` for shortlisted items only
5. `promoted_to_base_concept`
6. `adapted_to_customer`
7. `placed_in_feed`
8. `published_to_customer`
9. `produced / reviewed / archived`

Important rule:

- do not create a base concept for every imported clip
- do not make every adapted concept immediately customer-visible
- do not make feed placement the same thing as customer visibility

### Customer lifecycle workflow
Recommended v1 flow:

1. `prep`
2. `invited`
3. `registered`
4. `active`
5. optional `paused`
6. optional `closed`

Important rule:

- Studio must allow meaningful work during `prep`
- customer-visible artifacts may be prepared before registration, but access sharing should only happen after invite / registration readiness

## 6. Private vs customer-visible boundary

### CM-private
Should remain private by default:

- imported clips
- raw triage tags
- rejected or deferred references
- rough analysis notes
- internal fit judgments
- internal comments about customer readiness
- draft adapted concepts not yet approved for sharing
- internal feed planning notes and contingency ideas

### Customer-visible
Should be explicitly published or shared:

- curated concept recommendations
- customer-adapted script / filming guidance
- feed plan items intended for customer review
- polished game-plan outputs
- selected communication artifacts

### Boundary rule
Customer visibility should be a deliberate publish/share state, not just "anything attached to a customer."

This is the cleanest way to avoid leaking CM working material while still supporting strong customer-facing outputs.

## 7. Studio vs Admin boundary

### Belongs in Studio

- intake and stepper
- concept triage and working library
- customer adaptation
- customer workspace
- feed planning
- communication and review workflow
- operational customer prep before registration

### Belongs in Admin

- team management
- subscriptions
- billing and invoices as source-of-truth financial surfaces
- org configuration
- role assignment and permissions

### Shared but non-duplicated

- customer list exists in both shells, but with different emphasis
- Admin customer list: commercial / account / subscription truth
- Studio customer list: operational / creative workflow truth

The key is not to duplicate the same full record in both places. Each surface should show only the fields needed for its job and deep-link to the other when necessary.

## 8. Implementation options

### Option 1: Role-shaped entry plus new CM home
What changes:

- keep `/studio/customers`, `/studio/concepts`, and `/studio/customers/[id]`
- add `/studio/home`
- change `/studio` redirect by role
- keep customer workspace sections largely intact
- add `/studio/intake` after or alongside the new CM home

Benefits:

- lowest conceptual risk
- preserves most current routes
- solves the front-door problem first
- creates room for intake without forcing a full navigation rewrite

Tradeoffs:

- some overlap remains between `/studio/home`, `/studio/customers`, and `/studio/concepts`
- intake may still feel bolted on until the library/data model improves

Migration complexity:

- low to medium

### Option 2: Intake-first Studio for CM
What changes:

- CM lands directly on `/studio/intake`
- concepts and customer work remain secondary routes
- admin still lands on `/studio/customers`

Benefits:

- strongest expression of CM-first discovery flow
- clearly establishes pre-analysis as the first-class entry point

Tradeoffs:

- under-serves active customer follow-up work
- weak default for a CM who spends half the day in planning and communication rather than importing
- can over-index the product around sourcing instead of delivery

Migration complexity:

- medium

### Option 3: Keep `/studio/customers` as shared landing, adapt content by role
What changes:

- no new main CM route
- `/studio/customers` becomes highly role-aware
- CM sees queues and active work blocks above or beside the customer list

Benefits:

- lowest routing churn
- minimal implementation disruption

Tradeoffs:

- muddier IA
- customer list remains the mental model even when it should not
- harder to express intake as a distinct stage and object layer

Migration complexity:

- low initially, but higher long-term because ambiguity stays in the system

## 9. Preferred v1 recommendation

Preferred option: **Option 1 - role-shaped entry plus new CM home**

Why this is the best v1 path:

- it fixes the biggest mismatch without requiring a rewrite
- it preserves the useful current customer workspace
- it allows `/studio/customers` to remain the admin / oversight landing
- it gives CMs a real workbench centered on active queues
- it creates a clean place to add intake / stepper next
- it supports pre-invite customer preparation without inventing a second parallel system

## Recommended v1 sequence

1. Change `/studio` to role-based redirect.
2. Add `/studio/home` as CM workbench using existing data where possible.
3. Keep `/studio/customers` as the admin Studio landing and CM secondary list.
4. Reframe `/studio/concepts` as working library, not primary entry.
5. Add `/studio/intake` for lightweight import / triage before full analysis.
6. Treat `demo` in the customer workspace as the temporary pre-invite / prep surface until a cleaner dedicated prep section is warranted.
7. Stop expanding invoice functionality inside Studio; keep Admin as the financial source of truth.

## Short v1 summary

Studio v1 should not become "Admin-lite," and it should not stay a customer-list-first shell for everyone.

It should become:

- admin-facing at `/studio/customers`
- CM-facing at `/studio/home`
- process-aware through `/studio/intake`, `/studio/concepts`, and the existing customer workspace
- explicit about the difference between imported clips, base concepts, customer adaptations, feed placements, and customer-visible outputs

That gives the repo a realistic path from the current system to a CM-first operational Studio without throwing away what already exists.
