# Collaboration State

## Latest user input classifications

### Observed issues
- Current Studio appears to mix admin responsibilities with content-manager responsibilities.
- The data flow from the real database is not connected in the current Studio concept library experience.
- `Konceptbibliotek` appears to show hardcoded values rather than the intended live source.
- The concept library design is not optimized for quick creative scanning/searching by content managers.
- Studio would benefit from a more concentrated overview focused on the CM's real customer work.
- Invoices and similar admin-oriented functions may not belong prominently in Studio.
- Current concept intake appears too manual and too analysis-heavy too early if the CM only wants to collect possibilities first.

### Intended behavior
- Studio should feel like a creative suite for content managers.
- The content manager is assumed to be TikTok-native and operates with TikTok as the primary external content context.
- The content manager already has a relationship with the customer and a clear sense of what they want to achieve.
- Studio should help the CM intuitively and efficiently communicate concepts, timelines, expectations, feedback, and related working context to the customer.
- Studio should also let the CM manipulate/internalize the data points that later flow toward the customer-facing experience.
- Studio should optimize around the CM's active customer set (example: ~5 customers), not around generic backoffice breadth.
- The concept library should support direct clarity and speed: thumbnail/video preview, relevant metadata, and efficient search through prior clips.
- The concept library should primarily reflect what a given CM has uploaded plus a small shared/global reusable layer.
- Reuse should exist, but it should not encourage a giant reusable pool as the primary workflow.
- High-quality visual concepts may be globally reusable more often; humorous sketch formats are more sporadically reusable across CMs.
- Studio should support a lightweight intake/triage step before expensive analysis or customer assignment.
- A CM should be able to import many saved TikTok clips at once (e.g. a collection) and quickly categorize/filter them.
- AI/Vertex analysis should help automatically, but the CM should also be able to apply their own categorization.
- During the week, the CM should be able to input concepts, analyze them, update notes/game plan, comment on customer uploads, communicate with customers, and maintain customer understanding of the strategy.
- Studio should support both the base concept and a customer-adapted version of that concept.
- Customer-facing metadata should emphasize useful framing like title, why it fits, and filming guidance rather than over-explaining the visual content itself.
- Studio may need to support structured production/editing data such as scene definitions, per-scene script, and scene durations for downstream mobile-assisted creation.
- `/studio/customers` may remain a sensible cross-customer overview for admins or org-level oversight, even if it is not the ideal primary landing for an individual CM.
- Admin, Studio-admin, and Studio-CM surfaces should avoid unnecessary duplication, fragmented explanations, and inefficient handoffs.
- Pre-invite / pre-registration customer preparation should be a real supported flow: a CM should be able to work on the initial customer object, demo material, or first customer-facing content before the customer has completed registration.
- The suite should leave room for richer library search, concept manipulation, and smart filtering across scripts, titles, feeling/tone, target audience, and other metadata useful to CM retrieval.
- Over time, the suite may also expand toward trend detection and data-driven discovery (e.g. rising formats, overlapping scripts, emerging sounds, customer-relative performance signals).

### Constraints
- Studio and Admin should remain meaningfully separated.
- The real operational data source is not only `hagen-ui`; another database exists behind `hagen-main`.
- The concept library must avoid becoming an overwhelming archive of ~1000 clips to browse.
- The design should balance internal CM tooling with outward customer communication/handoff.
- Not every imported clip should incur full analysis cost immediately.
- Intake should not require one-by-one manual link pasting into the main library.
- The present system should remain grounded in current product reality, even if future automation/agents may later expand it.

### Hypotheses
- Studio home may need to be a hybrid of intake + active customer overview rather than a pure customer list.
- The product may need explicit stages such as imported clip -> analyzed base concept -> customer-adapted concept -> feed placement.
- The right collaboration model may be mostly CM-local with limited shared/global reusable concepts.
- A `stepper`-style flow may be the correct front door for weekly concept intake.

### Evidence
- User explicitly described Studio as a creative suite for content managers.
- User explicitly described TikTok as the CM's primary external context.
- User explicitly stated the current Studio mixes admin and CM concerns.
- User explicitly stated the real database comes through `hagen-main`, not only `hagen-ui`.
- User described a prior `stepper` flow that imported TikTok collections and enabled quick filtering/categorization.
- User described the CM weekly rhythm: intake, analysis, notes/game plan updates, customer feedback, communication, and feed planning.
- User described the need for customer-adapted concept versions derived from a base concept.
- User described the need for production-oriented structured data, not just a generic concept card.
- Repo evidence confirms current studio concepts page uses local JSON loader rather than live external integration.
- Repo evidence confirms Studio exposes invoices in the main shell.

### Decision candidates
- Make Studio a CM-first product surface rather than a mixed CM/admin workspace.
- Reframe Studio home around the CM's active customers plus near-term concept intake/actions.
- Introduce or revive a `stepper`-style intake flow for TikTok collections.
- Demote or remove invoices/admin tools from the primary Studio shell.
- Redesign concept library around CM-owned imports/uploads plus a small curated shared layer.
- Integrate Studio concept discovery with the real `hagen-main`/external data source instead of hardcoded/local concept fixtures.
- Model a multi-stage workflow from imported clip to analyzed concept to customer-adapted concept to feed placement.
- Keep CM global Studio access in v1 while shifting defaults toward assigned-customer-first views.
- Treat `pending` and `invited` as prep states in v1 UI/product framing without renaming backend statuses yet.
- Prioritize DB-first correction of `/studio/concepts` before deeper intake persistence.

## Latest decision direction after D / E / F
- The strongest no-regret next step remains PR1: role-shaped Studio entry with `/studio/home` for CM and `/studio/customers` preserved as admin/org overview.
- The safest immediate follow-up after PR1 is concept-library source correction, not lifecycle redesign.
- Intake should remain part of the intended CM-first direction, but should initially be introduced as an IA shell/placeholder rather than a fully persisted imported-clip model.
- Prep/demo behavior is already operationally real, so Studio can expose prep customers more clearly before any backend lifecycle rewrite.

## Open questions
- What should be the exact Studio landing composition: import queue, active customers, weekly actions, or some hybrid?
- Which imported clips become analyzed/base concepts, and by what trigger?
- Which customer-facing artifacts should Studio directly author/control versus merely preview?
- How should CM-private working state differ from customer-visible state?
- What exact data entities come from `hagen-main` versus local `hagen-ui` tables?
- How should customer-uploaded content review and feedback sit alongside concept planning?
- Which parts of structured editing data belong in Studio now versus later?
