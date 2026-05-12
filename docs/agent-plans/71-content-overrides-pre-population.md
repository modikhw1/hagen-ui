# Phase 71 — Content Overrides Pre-Population

**Date**: 2026-05-12
**Scope**: When a concept is assigned to a customer, automatically populate `content_overrides` from the base concept's `overrides` field.

---

## Problem Statement

When a CM assigns a library concept to a customer via `POST /api/studio-v2/customers/:customerId/concepts`:
- `content_overrides` is set to `{}` (empty object)
- The customer-facing view (`resolveConceptContent`) falls back to the base concept, but only if the base concept is loaded in the frontend
- ConceptEditWizard shows fallback values from `details` prop, but they're not persisted until CM manually saves
- Net result: CM must open the edit wizard and save (even without changes) for `content_overrides` to contain anything

This means:
1. Customer may see incomplete content if base concept isn't loaded in their feed view
2. CM must do unnecessary manual work for every concept assignment
3. The "neutral metadata" created by AI at ingest never flows automatically to the customer

---

## Solution

At the time of customer_concept creation, the backend fetches the base concept's `overrides` and writes relevant fields into `content_overrides`:

```typescript
content_overrides: {
  headline:              baseConcept.overrides.headline_sv ?? '',
  script:               baseConcept.overrides.script_sv ?? '',
  why_it_fits:          baseConcept.overrides.whyItWorks_sv ?? '',
  filming_instructions: Array.isArray(baseConcept.overrides.productionNotes_sv)
                          ? baseConcept.overrides.productionNotes_sv.join('\n')
                          : '',
}
```

---

## Detailed Implementation

### File: `artifacts/api-server/src/routes/studio-v2.ts`

**Endpoint**: `POST /api/studio-v2/customers/:customerId/concepts`

**Current behavior** (approximate line 354-418):
```typescript
const insertPayload = {
  customer_id: customerId,
  customer_profile_id: profileId,
  concept_id: body.concept_id,
  cm_id: userId,
  status: 'draft',
  feed_order: body.feed_order ?? 1,
  cm_note: body.cm_note ?? null,
  content_overrides: typeof body.content_overrides === 'object' && body.content_overrides
    ? body.content_overrides
    : {},
  // ... other fields
};
```

**New behavior**:

1. After validating `body.concept_id`, fetch the base concept:
```typescript
const { data: baseConcept } = await supabase
  .from('concepts')
  .select('overrides')
  .eq('id', body.concept_id)
  .single();
```

2. Build pre-populated content_overrides:
```typescript
const baseOverrides = (baseConcept?.overrides ?? {}) as Record<string, unknown>;

const prePopulated: Record<string, string> = {};

if (typeof baseOverrides.headline_sv === 'string' && baseOverrides.headline_sv) {
  prePopulated.headline = baseOverrides.headline_sv;
}
if (typeof baseOverrides.script_sv === 'string' && baseOverrides.script_sv) {
  prePopulated.script = baseOverrides.script_sv;
}
if (typeof baseOverrides.whyItWorks_sv === 'string' && baseOverrides.whyItWorks_sv) {
  prePopulated.why_it_fits = baseOverrides.whyItWorks_sv;
}
if (Array.isArray(baseOverrides.productionNotes_sv) && baseOverrides.productionNotes_sv.length > 0) {
  prePopulated.filming_instructions = baseOverrides.productionNotes_sv.join('\n');
}
```

3. Merge with any explicitly provided content_overrides (CM override wins):
```typescript
const finalContentOverrides = {
  ...prePopulated,
  ...(typeof body.content_overrides === 'object' && body.content_overrides
    ? body.content_overrides
    : {}),
};
```

4. Use `finalContentOverrides` in the insert payload.

---

## Field Mapping

| Source (concepts.overrides) | Target (customer_concepts.content_overrides) | Notes |
|---|---|---|
| `headline_sv` | `headline` | Main title shown to customer |
| `script_sv` | `script` | Dialog/scene directions |
| `whyItWorks_sv` | `why_it_fits` | "Varför det fungerar" — customer sees this |
| `productionNotes_sv` (array) | `filming_instructions` (string, \n-joined) | Step-by-step recreation guide |

Fields NOT copied (intentionally):
- `description_sv` — used for library browsing, not customer-facing
- `whyItFits_sv` — similar to whyItWorks_sv but more library-oriented
- Classification fields (difficulty, filmTime, etc.) — already on the base concept, not per-customer

---

## Edge Cases

### 1. Base concept not found
If `concept_id` doesn't exist or has no overrides, `prePopulated` stays empty. Existing behavior (empty content_overrides) is preserved. No error thrown.

### 2. CM explicitly provides content_overrides in request body
CM-provided values take precedence (spread order: `...prePopulated, ...body.content_overrides`). This supports the future ingest-to-customer flow where the modal may pass customized values.

### 3. Base concept has empty/null override fields
Only non-empty string values are copied. Empty strings and null values are skipped. This prevents overwriting a future CM edit with garbage.

### 4. Existing customer_concepts (retroactive?)
This change only affects NEW assignments. Existing customer_concepts with empty content_overrides are not backfilled. A one-time backfill script could be written via Supabase MCP if desired, but is out of scope.

---

## Frontend Impact

**No frontend changes required.** The existing flows already handle content_overrides correctly:

- `ConceptEditWizard` reads `content_overrides.headline` etc. and shows them in form fields
- `resolveConceptContent()` prioritizes content_overrides over base concept fallback
- Customer feed view renders resolved content
- "Lägg till koncept" sidopanel doesn't send content_overrides (so pre-population handles it)

The only visible change: when CM assigns a concept, the edit wizard immediately shows filled fields instead of empty ones. No new UI elements needed.

---

## Verification

### Backend typecheck
```bash
pnpm --filter "./artifacts/api-server" run typecheck
```

### Functional verification (manual, post-deployment)
1. Assign a concept with known overrides (headline_sv, script_sv, etc.) to a customer
2. Verify `customer_concepts.content_overrides` contains pre-populated fields
3. Open ConceptEditWizard — verify fields are filled
4. Verify customer-facing view shows complete content

### Regression check
- Assigning a concept without overrides (empty/null) → content_overrides = {} (no crash)
- Assigning with explicit body.content_overrides → CM values win over pre-populated
- Editing content_overrides after assignment → works as before (pre-populated values are just initial state)

---

## Remaining Gaps

1. **No retroactive backfill** — Existing customer_concepts stay as-is. Could be done via Supabase MCP.
2. **No per-customer AI adaptation** — Filming instructions aren't adjusted for "bar i Göteborg" vs "café i Malmö". Deferred to future.
3. **description_sv not copied** — Intentional: it's library-facing, not customer-facing. If this changes, add it to the mapping.
