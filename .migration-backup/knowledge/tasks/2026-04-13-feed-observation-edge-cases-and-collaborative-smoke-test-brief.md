# Feed Observation / History Reconciliation — Context Brief + Edge-Case Analysis Task + Collaborative Smoke Test Setup

## Purpose

This brief is meant to be handed to an agent.

The goal is **not** to jump straight into implementation. The first goal is to make sure the agent understands the current system, the intended product semantics, and the state transitions well enough to:

1. explain the system back accurately,
2. identify edge cases and state risks,
3. distinguish confirmed code truth from inference,
4. prepare a collaborative real-world smoke test with a human using a designated TikTok test profile.

Only after that analysis should the agent help run a controlled test together with the user.

---

# 1. High-level context

We are working in `hagen-ui`.

The relevant product area is the Studio/customer feed-planning workflow, especially the interaction between:

- LeTrend-managed planned concepts
- the current `nu` slot
- imported TikTok history
- hourly observation/sync via cron
- manual planner movement
- manual assertion that a concept was actually produced
- reconciliation / correction when imported TikTok history does or does not correspond to the expected LeTrend concept

This area has already been through multiple iterations. The current concern is no longer basic feature absence, but rather:

- semantic correctness,
- edge-case safety,
- runtime behavior,
- and whether the visual/feed planner behavior is grounded in a clean enough state model.

---

# 2. Core mental model the agent must adopt

## 2.1 This is NOT fundamentally a freeform 3×3 grid

Although the feed planner is presented visually as a 3×3 layout, the underlying logic should be understood as:

- a **linear ordered sequence** of feed positions
- projected into
- a **9-slot window**

The real truth is `feed_order`.

That means:

- `feed_order > 0` = upcoming / planned
- `feed_order = 0` = current / `nu`
- `feed_order < 0` = history

The grid is therefore just a **view projection** of a sequence.

This distinction matters because many UI oddities can come from treating the system like a custom spatial grid with bespoke layout semantics, when the actual product logic is closer to a timeline or ordered feed window.

The agent should reason from sequence first, grid second.

---

## 2.2 Canonical orientation

The 3×3 planner should be interpreted as a window over the sequence:

- top-left = more future / higher feed order
- center = `feed_order = 0`
- bottom-right = older / more negative history

In other words, the rendered planner is essentially a visible slice of:

`... -3, -2, -1, 0, +1, +2, +3 ...`

laid out in 3×3 order.

---

# 3. Product semantics the agent must preserve

There are three distinct events in this system, and they must **not** be collapsed into one idea:

## 3.1 Cron import / hourly observation

Cron means:

- fetch TikTok clips
- normalize them
- import new clips as history rows
- write motor signal / observation signal when new evidence appears

Cron is **observation only**.

Cron must **not automatically mean**:

- the planner advances
- the `nu` concept is confirmed as produced
- the imported clip is definitely a LeTrend-produced clip

Cron says only:

> a clip was observed on TikTok

not:

> the LeTrend plan has been semantically resolved

---

## 3.2 Advance-plan

`advance-plan` means:

- the planner window is moved forward explicitly
- feed-order positions are shifted
- this is a planning action

It is not the same thing as importing an observed clip.

---

## 3.3 Mark-produced

`mark-produced` means:

- a CM explicitly asserts that the current `nu` concept was actually produced
- the current LeTrend concept becomes the newest LeTrend history entry
- timeline/feed order shifts accordingly

This is stronger than cron observation. It is an explicit product/business assertion.

---

# 4. Meaning of “nu”

`nu` is the current active LeTrend slot.

It is best understood as:

- the concept currently expected to be on deck,
- the one most likely to become the next historical LeTrend item,
- the default semantic candidate when a newly observed TikTok clip likely corresponds to planned LeTrend work.

Important nuance:

- `nu` is not historical yet,
- but it is the primary candidate to become history next.

---

# 5. Why the TikTok ↔ LeTrend toggle exists

The system now includes a corrected model for history reconciliation.

The intended primary UX is not “freely map imported history to any concept” as the default.
The intended primary UX is:

- imported clip is observed,
- in many cases it probably corresponds to the current `nu` slot,
- but that is only a default assumption,
- so CM must be able to quickly classify / rectify it as:
  - `LeTrend`
  - or `TikTok`

This means:

- **default** = latest imported clip often points to the current `nu` LeTrend slot
- **rectification path** = if that assumption is wrong, the CM can toggle back to TikTok
- **manual/free concept picking** = allowed as fallback, but should not be the primary mental model

So the toggle exists to preserve both:

- operational efficiency
- truthfulness of the data model

---

# 6. Current desired truth model

The agent should reason using the following state categories.

## 6.1 Planned LeTrend items
Rows with:

- LeTrend-managed concept identity
- `feed_order > 0`

These are future planned items.

## 6.2 Current LeTrend item (`nu`)
Rows with:

- LeTrend-managed concept identity
- `feed_order = 0`

This is the active “current” concept.

## 6.3 LeTrend history
Rows that were previously managed LeTrend concepts and have moved into historical positions:

- LeTrend-managed concept identity
- `feed_order < 0`

## 6.4 Imported TikTok history
Rows that come from observation/import and represent observed TikTok posts:

- imported history shape
- concept identity remains imported truth
- `feed_order < 0`

## 6.5 Imported TikTok history that is semantically reconciled to LeTrend
Still imported observation underneath, but semantically linked/reconciled to a LeTrend concept.

Important: the system should preserve the difference between:

- raw observed TikTok evidence
- semantic interpretation of what that evidence corresponds to

---

# 7. The user’s concern about “standardized gridview logic”

A key product/architecture suspicion is that some visual bugs and odd interactions may not just be CSS/UI mistakes. They may stem from using too much custom grid-specific behavior instead of deriving the planner from the simpler underlying sequence model.

The agent should take this concern seriously.

The question is not “can we make the 3×3 look nicer?”
The deeper question is:

> are some bugs caused by the planner being treated as a custom spatial widget instead of a deterministic projection of `feed_order` state?

The agent should therefore:

- explicitly analyze whether current bugs/oddities are likely rooted in rendering, layout, or state-model mismatch,
- and describe whether a more standardized sequence-window interpretation would remove classes of bugs by construction.

This is an analysis request, not yet an implementation request.

---

# 8. Confirmed code-level truths already known

The agent should verify these directly against code and treat them as claims that require confirmation, not as axioms.

## 8.1 Cron schedule intent
Current known intent:

- GitHub Actions workflow runs hourly on weekdays during business hours
- route-level staleness gate should allow near-hourly per-customer sync

However, there is a possible real-world issue that cron may not currently be firing as expected in production, possibly because:

- workflow changes were not pushed,
- workflow/config/env mismatch,
- or runtime/deploy configuration is off.

So the agent must distinguish:

- schedule as written in repo
- schedule actually running in prod

## 8.2 Cron eligibility matters
A customer only gets processed when required fields/statuses make them eligible.
A failure to observe clips may be configuration or state-related rather than a logic bug.

## 8.3 Slice 2.1 changed the reconciliation model
Primary UX is now intended to be:

- `Markera som LeTrend`
- `Markera som TikTok`

with current `nu` slot as primary default target, and free concept selection retained only as fallback.

---

# 9. The agent’s first task: explain the system back

Before proposing tests, the agent should explain the current model back in its own words.

That explanation should cover:

1. what `feed_order` means,
2. why the grid is really a sequence-window projection,
3. what cron does,
4. what cron must not do,
5. what `advance-plan` does,
6. what `mark-produced` does,
7. what the TikTok ↔ LeTrend toggle is for,
8. why `nu` is the primary default semantic target,
9. how imported TikTok truth differs from LeTrend semantic reconciliation.

The purpose is to validate whether the agent really understands the model.

---

# 10. The agent’s second task: search for edge cases and state-machine risks

The agent should identify edge cases and classify them.

## 10.1 Edge-case categories to examine

### A. Cron/runtime/drift edge cases
Examples:

- workflow exists in code but is not actually deployed/running
- `APP_URL` mismatch
- `CRON_SECRET` mismatch
- `RAPIDAPI_KEY` missing
- GitHub Actions disabled/failing silently
- customer not eligible due to status/handle/sync timestamp

### B. Observation lag / delayed visibility
Examples:

- user uploads a TikTok video but provider does not surface it immediately
- TikTok profile fetch returns stale results
- cron sees the video later than expected

Question to analyze:

- what does the system look like during the delay window?
- what actions remain safe during that window?

### C. Imported clip is not actually LeTrend
Examples:

- latest observed clip belongs to customer’s own content rather than LeTrend collaboration
- default now-slot assumption is wrong

Question to analyze:

- does the correction/toggle path fully preserve truth and reversibility?

### D. Planner movement collisions
Examples:

- CM manually advances
- then cron imports
- or mark-produced happens near a sync window
- or repeated actions happen in unusual order

Question to analyze:

- can feed-order collisions or misleading UI states appear temporarily or persistently?

### E. Missing or ambiguous `nu` target
Examples:

- no current `feed_order = 0` concept exists
- current slot is malformed
- current concept does not map cleanly to observed publication

Question to analyze:

- what should the primary and fallback UX be?

### F. Deletion / disappearing TikTok content
Examples:

- a clip was observed/imported once
- later the customer deletes it or makes it unavailable

Question to analyze:

- should the system behave as historical observation truth or as a live mirrored feed?
- what are the implications for planner/history trust?

### G. Multiple manual approvals / repeated human actions
Examples:

- user uploads multiple times
- CM clicks actions repeatedly
- multiple approvals create too much shift relative to actual feed reality

Question to analyze:

- what invariants prevent drift?
- which actions are idempotent, and which are not?

---

# 11. Important framing for the edge-case analysis

The agent should not only list random edge cases. It should explain them in relation to state transitions.

For each meaningful edge case, the agent should try to answer:

1. **starting state** — what is true before the event?
2. **trigger** — what happens?
3. **expected safe behavior** — what should the system do?
4. **risk** — what could go wrong?
5. **current evidence** — confirmed from code vs inferred concern
6. **testability** — can this be tested now with a human and a test TikTok profile?

---

# 12. The agent’s third task: prepare a collaborative smoke test

After the edge-case analysis, the next task is to prepare a collaborative test with the user.

This should **not** assume full automation.
The test will likely require coordination with the human, because the human may:

- provide a specific customer profile,
- set or confirm the TikTok account to use,
- publish a test clip manually,
- click certain UI actions when asked,
- confirm what happened in TikTok vs what the app observed.

The smoke test should therefore be structured as a human-assisted state-machine walkthrough.

---

# 13. What the collaborative smoke test should try to do

The smoke test should be designed to validate both happy path and selective edge cases.

## 13.1 Baseline verification
Before any new upload/event:

- inspect current customer state
- identify planned items
- identify current `nu`
- identify existing history
- identify whether TikTok handle/profile is set correctly
- identify whether customer is eligible for sync
- identify last sync markers if available

## 13.2 Trigger a sync path
Either:

- allow cron to do the work if runtime is healthy,
- or run a manual sync/fetch path if needed.

The smoke test must note which path is being used.

## 13.3 Observe new imported history
When a new TikTok clip becomes visible to the system, verify:

- new imported row appears,
- correct history placement occurs,
- motor/observation signal appears if expected,
- no accidental planner auto-advance happens,
- semantic distinction remains intact.

## 13.4 Test reconciliation
If imported clip likely corresponds to current `nu` concept:

- test `Markera som LeTrend`
- verify it uses `nu` as default semantic target
- verify resulting state is sensible

Then test reversal:

- `Markera som TikTok`
- verify reversibility and truth preservation

## 13.5 Test fallback/manual path
If possible, also test scenario where:

- current default target is missing or not the intended target,
- fallback concept selection is used instead.

## 13.6 Test planner movement semantics
If safe in the test profile/environment, verify one or more of:

- `advance-plan`
- `mark-produced`
- their interaction with existing imported history

The goal is to confirm semantic separation, not just UI response.

---

# 14. Constraints and expectations for the collaborative test

The agent must be careful not to over-claim.

It should distinguish between:

- what it can verify directly in code,
- what it can verify in app state,
- what requires the user to perform an action in TikTok/UI,
- and what remains hypothesis until tested.

If cron is suspected to be unhealthy, the agent should say so clearly and avoid treating missing hourly sync as proof of a logic failure.

---

# 15. What output is wanted from the agent

The requested output from the agent should be a structured markdown document that contains:

## Part A — System explanation
A concise but precise explanation of the current state model in the agent’s own words.

## Part B — Edge-case map
A categorized list of likely edge cases, including state transitions, risks, and whether each is confirmed, inferred, or unknown.

## Part C — Collaborative smoke-test plan
A practical step-by-step plan for a human-assisted test using a real test customer and a real TikTok profile.

## Part D — Preconditions / runtime checks
A short checklist for verifying whether cron/runtime configuration is healthy before relying on hourly sync.

## Part E — Suggested test matrix
A small matrix of realistic test scenarios, such as:

- happy path observed clip → classify as LeTrend
- observed clip → toggle back to TikTok
- uploaded clip not yet visible to provider
- no current `nu` slot
- mark-produced near cron/import timing

---

# 16. Explicit instructions to the agent

Use this section as the direct tasking language.

## Agent task

Read the relevant repo files first and ground your answer in code.
Do not jump to implementation.
Do not assume cron is healthy just because the workflow exists in the repo.

Your job is to:

1. explain the current model accurately,
2. identify edge cases and state-machine risks,
3. distinguish confirmed truth from inference,
4. prepare a collaborative smoke-test plan that can be run with the user using a designated TikTok test profile.

You should pay special attention to whether the planner is better understood as:

- a custom spatial 3×3 grid,
- or a linear `feed_order` sequence rendered through a 9-slot window.

If you believe many bugs/oddities are likely caused by the latter being implemented as the former, say so explicitly and explain why.

---

# 17. Suggested files to inspect

At minimum, inspect the code and docs relevant to:

- the feed planner slot mapping / grid projection
- hourly cron sync workflow
- internal sync route
- history import logic
- mark-produced route
- advance-plan route
- history reconciliation route
- customer workspace rendering around imported history / current slot / context actions
- relevant Studio v2 types and normalizers
- current repo-brain task docs for Slice 2 / 2.1

---

# 18. Deliverable format

Write your result as markdown.

Recommended structure:

```md
# Feed Observation Edge Cases + Collaborative Smoke Test Plan

## 1. Confirmed current-system truth
## 2. Intended product semantics
## 3. Sequence-vs-grid interpretation
## 4. Edge-case map
## 5. Runtime/cron verification checklist
## 6. Collaborative smoke-test plan
## 7. Test matrix
## 8. Open unknowns / risks
```

---

# 19. What happens after this analysis

After the agent completes the analysis document, we expect to do a second pass where:

- a specific test customer is provided,
- a specific TikTok profile is used,
- the user and agent cooperate on a live test,
- and selected edge cases are executed intentionally where possible.

That later testing phase is not the current deliverable.
The current deliverable is the analysis + collaborative test preparation.
