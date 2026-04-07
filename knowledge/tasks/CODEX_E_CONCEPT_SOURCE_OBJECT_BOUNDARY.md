# Codex E — Concept Source / Object Boundary Truth

## Mission
Determine the current truth and safest forward path for Studio concept sourcing and concept-related object boundaries.

This is the highest-value follow-up to the confirmed mismatch that different Studio surfaces use different concept sources and mixed object semantics.

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
1. What is the real current source of truth for the Studio concept library?
2. What do `concepts` and `customer_concepts` each actually represent today?
3. Which current rows/fields correspond to base concept, customer-adapted concept, feed placement, and demo/history content?
4. What is the safest DB-first migration path for `/studio/concepts`?

## Focus areas
- `app/src/lib/conceptLoader.ts`
- `app/src/lib/conceptLoaderDB.ts`
- `app/src/app/studio/concepts/page.tsx`
- `app/src/app/studio/concepts/[id]/page.tsx`
- `app/src/app/studio/concepts/[id]/edit/page.tsx`
- `app/src/app/studio/upload/page.tsx`
- `app/src/app/api/admin/concepts/route.ts`
- `app/src/app/api/admin/concepts/[id]/route.ts`
- `app/src/app/api/studio-v2/customers/[customerId]/concepts/route.ts`
- customer-facing concept/feed APIs
- `app/src/lib/studio-v2-concept-content.ts`
- `app/src/lib/customer-concept-overrides.ts`
- `app/src/lib/studio/customer-concepts.ts`
- `app/src/types/database.ts`
- any relevant migrations
- `app/src/data/clips-priority.json` if needed to understand the export model

## Specific things to trace
- how JSON concepts are loaded and shaped
- how DB concepts are loaded and shaped
- where overrides are merged
- where `customer_concepts` acts as assignment vs planning vs demo/history storage
- whether feed placement is its own object or embedded in customer concept rows
- where `hagen-main` enters the flow and what it returns
- whether current edit/save paths are internally coherent for CM vs admin

## Required deliverables

### 1. Current source-of-truth map
Produce a concise map of which concept source each major surface uses today:
- `/studio/concepts`
- `/studio/concepts/[id]`
- `/studio/concepts/[id]/edit`
- `/studio/upload`
- `/studio/customers/[id]`
- customer-facing feed/concept surfaces

### 2. Current object semantics
Explain what these entities actually mean in current code:
- `concepts`
- `customer_concepts`
- JSON concept export
- history/demo rows with `concept_id = null`
- overrides/content fields

### 3. Object-boundary assessment
State how current code maps onto these intended layers:
- imported clip
- base concept
- customer-adapted concept
- feed placement
- customer-visible artifact

For each layer, say whether it is:
- clearly represented
- partially represented / collapsed
- missing

### 4. Main inconsistencies and risks
Identify the most important inconsistencies in current concept architecture.
Especially note anything that would make `/studio/concepts` dangerous to build on without correction.

### 5. Safest v1 correction path
Recommend the safest path to make `/studio/concepts` reflect real data.
Be concrete about:
- DB-first vs JSON fallback
- edit-route behavior
- CM vs admin permissions
- what can be fixed without schema changes
- what should wait for deeper object-model work

### 6. Recommended follow-up slices
Propose a small sequence of follow-up slices after role-shaped landing, focused only on concept/source cleanup.

## Guardrails
- do not implement code
- do not over-design the final object model beyond what current evidence supports
- separate confirmed truth from recommendation
- keep recommendations realistic and incremental

## Output
Write final output to:
- `knowledge/tasks/OUTPUT_E_CONCEPT_SOURCE_OBJECT_BOUNDARY.md`
