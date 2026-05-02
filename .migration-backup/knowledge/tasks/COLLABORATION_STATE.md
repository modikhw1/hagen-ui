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

## Latest user input classifications — Gemini / ingest architecture refinement

### Observed issues
- The current upload flow performs analysis too early and collapses ingest directly into `concepts`, leaving too little room for CM review/filtering before save.
- AI-derived informational labels such as `headline`, `why it works`, and `summary` are valuable, but they should be generated reliably from deeper clip understanding rather than naively copied from raw metadata.
- It is undesirable for a CM to micro-edit base concept data except in expected cases such as customer adaptation or occasional script rewrites.
- The boundary between `hagen-main` (live external system / GCS / Gemini/Vertex-aligned backend) and `hagen-ui` (product workflow + customer-facing system) needs a more structurally durable contract.

### Intended behavior
- `hagen-main` should remain the analysis system of record connected to Gemini/Vertex/GCS.
- Analysis quality should be pushed toward near-100% accuracy on key facts through prompt iteration and careful AI dataflow design.
- Studio should provide a simple CM-facing control flow: ingest clip -> inspect/confirm important values -> approve/save -> later assign/adapt for customers.
- Before save, the CM should have a lightweight approval/control step rather than being forced to accept an opaque fully-written concept.
- Informational/customer-facing labels should be generated automatically where possible, ideally through a translation/enrichment layer that turns grounded analysis into useful product copy.
- CM effort should focus mainly on confirmation, triage, and customer-specific adaptation, not manual field-by-field authoring of base concepts.
- The concept interaction flow after save should cleanly support: library presence -> customer assignment -> feed-plan placement -> customer-facing adaptation/communication.

### Constraints
- The UI should not depend on expensive manual concept authoring for routine intake.
- Generated product copy should be grounded in trustworthy extracted facts/signals, not hallucinated freewriting.
- The architecture should remain sustainable if `hagen-main` stays live on its own deployment rather than being folded directly into `hagen-ui`.

### Hypotheses
- The product likely needs an explicit contract boundary where `hagen-main` owns raw analysis truth and `hagen-ui` owns workflow state, approvals, customer adaptation, and local product projections of that truth.
- A two-step AI pipeline may be appropriate: grounded extraction/classification first, then a cheaper translation/enrichment pass for UI/customer-facing wording.
- "Save" may need to mean promotion from reviewed ingest item into the local concept system, not immediate acceptance of every field as canonical truth.

### Decision candidates
- Keep `hagen-main` as a separately deployed analysis service/system of record rather than tightly coupling Gemini/Vertex logic into `hagen-ui`.
- Introduce a lightweight review/approval state between ingest and persisted base concept.
- Separate grounded analysis fields from generated presentation fields in the data model and UX.
- Design CM flows around confirmation and downstream customer adaptation, not heavy authoring of raw concept metadata.

## Latest user input classifications — observation / planner refinement pass

### Observed issues
- The current hourly observation flow is easy to misread as if cron will automatically advance the 3x3 planner, but the current implementation only imports TikTok history and raises motor signal.
- Imported TikTok clips and LeTrend-produced clips are still represented as separate shapes in history, with no explicit user-controlled truth layer for matching them.
- History cards have interaction problems in production: the context-menu trigger can be obscured, the page can shift, and the dropdown is not reliably usable.
- Feed planner scroll behavior still traps mouse-wheel navigation in a way that makes the surrounding page frustrating to use.
- Dropdown sizing appears visually wrong, with excessive horizontal dead space.
- "Markera som gjord" lacks strong interaction feedback while the action is running.
- LeTrend history cards do not yet present the same bottom stats banner treatment as TikTok-imported history cards.

### Intended behavior
- The system should clearly separate three actions: detecting a newly published TikTok clip, manually advancing the planner, and explicitly marking a LeTrend concept as produced.
- Cron should remain an observation/import mechanism, not silently rewrite the plan.
- After a new uploaded clip is observed, CM should eventually be able to classify or toggle whether that history item should be treated as a LeTrend-produced clip or as ordinary TikTok history.
- The model should not automatically assume that every newly detected TikTok upload corresponds to the planned LeTrend concept.
- If a planned LeTrend concept was skipped in reality, the product should preserve room for a later "skipped / unmatched / return to selectable pool" model rather than baking in incorrect assumptions now.
- LeTrend and TikTok history cards should converge toward a common visual/stat treatment where appropriate, while still preserving their different metadata richness.
- Observation should later support time-series stats capture for newly published videos (for example, first 48h performance), but that is a later step after the core truth model and UI are stable.

### Constraints
- Avoid introducing automatic matching logic between imported TikTok clips and planned LeTrend concepts before a clear truth model exists.
- Preserve the current safe coexistence between hourly import and manual plan advancement/mark-produced flows.
- Prefer low-risk UI fixes first where the runtime behavior is already understood.
- Keep imported TikTok history and LeTrend concept history distinguishable at the data-model level until an explicit reconciliation action exists.

### Decision candidates
- Keep cron as observation-only in v1; do not auto-advance the planner on detected uploads.
- Introduce a small explicit truth-model pass for history classification/reconciliation instead of guessing from upload timing alone.
- Handle this work in stages: first harden UI/runtime clarity, then add explicit imported-vs-LeTrend reconciliation controls, then consider richer stats capture.
- Add visual parity improvements to history cards without prematurely collapsing the underlying data distinction.

## Latest user input classifications — prompt iteration / essence extraction refinement

### Observed issues
- The current LeTrend prompt can correctly identify coarse metadata such as category, rough structure, people/scenes/dialogue, while still missing the actual comedic essence or content thesis of the clip.
- Fields like `format_type` can drift toward trivial platform facts (e.g. `vertical video`) instead of meaningful TikTok/hospitality content categories.
- `replicability_notes` risk being framed too abstractly or against the wrong baseline if the model implicitly evaluates difficulty for a generic creator rather than for a normal restaurant/business operator.
- `headline` and `summary` are especially sensitive failure points: they can sound plausible while still missing the joke or central tension that makes the clip work.

### Intended behavior
- The next prompt iteration should prioritize extracting the clip's essence, joke structure, or actual content point over merely getting the surrounding metadata right.
- All clips can be assumed to be vertical TikTok-style videos, so the schema/prompt should not waste capacity on that distinction.
- Category recognition for this test clip was acceptable (`humoristisk sketch`); the bigger problem is correctly packaging what the humor actually is.
- Replicability should be judged relative to what is realistically easy/medium/hard for a restaurant/bar/café team, not an experienced content front-figure baseline.
- Derived explanatory fields should capture the specific tension, premise, payoff, or social/comedic mechanism that gives the clip its value as a concept.

### Evidence
- User explicitly said: category was fine, `why_this_exists` was okay, but `concept_payload`, `headline`, and `summary` missed the joke and the essence.
- User explicitly clarified that what packages the clip structurally is mostly okay, but what explains the content is "inte ens nära".

### Decision candidates
- Revise the prompt so `format_type` becomes a meaningful content format/category rather than technical video orientation.
- Add stronger prompt language around identifying the exact joke/premise/tension/payoff, especially for subtle humor.
- Reframe `replicability_notes` around hospitality-business reality instead of generic creator capability.
- Potentially split the current overloaded `concept_payload` into a more essence-oriented field such as `core_premise`, `joke_mechanism`, or `transferable_idea`.

## Latest user input classifications — history toggle / now-slot assumption correction

### Observed issues
- The just-implemented history reconciliation UX is too general/manual if the real operational case is that a newly detected TikTok upload usually corresponds to the current `nu` slot.
- The labels added on top of history cards (`LeTrend-producerad` on LeTrend-style cards and `TikTok` on TikTok cards) are redundant because the cards already communicate that identity visually.
- A free-form "link this history clip to any LeTrend concept" picker is likely the wrong primary metaphor for the common case.

### Intended behavior
- The system should treat cron as observation-only, but use the `nu` slot as the strong default candidate when a new TikTok clip arrives after collaboration has started.
- History cards should support a simple binary semantic toggle between `TikTok` and `LeTrend`, because imported history can represent either customer-native uploads or LeTrend-produced outcomes.
- The common operational path is: a CM marks the current LeTrend concept as done when they believe the newly observed upload is that concept; if the upload was actually unrelated, the state should be easy to toggle back.
- The broad concept picker may remain as a fallback or internal linkage mechanism, but it should not be the primary user-facing interaction for the common case.
- When a history item is treated as `LeTrend`, the card can present LeTrend-oriented identity/metadata; when treated as `TikTok`, it should present TikTok-native identity.
- Redundant text labels that restate the card type visually should be removed from the cards.

### Constraints
- Do not collapse cron, advance-plan, and mark-produced into one automatic action.
- Preserve the safe coexistence between hourly TikTok import and manual CM actions.
- Prefer a 0↔1 semantic toggle model for history identity over a broad multi-select reconciliation UX for the common case.

### Decision candidates
- Reframe the current reconciliation work as a slot-aware `TikTok ↔ LeTrend` toggle model with `nu`-slot assumption as the primary operational heuristic.
- Keep any arbitrary concept-linking capability, if retained, as a secondary/fallback path rather than the main CTA.
- Remove the newly added small history-card labels that say `LeTrend-producerad` and `TikTok` because the card visuals already convey that distinction.
