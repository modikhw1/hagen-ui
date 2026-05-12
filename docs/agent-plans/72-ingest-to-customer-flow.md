# Phase 72 — Ingest-to-Customer Primary Flow

**Date**: 2026-05-12
**Scope**: Add a "Tilldela kund" step to the upload modal so a CM can go directly from ingest to customer placement in one flow.

---

## Problem Statement

Today's flow from "I found a TikTok clip" to "it's in the customer's feed":

```
1. /studio/concepts → Upload modal (4 steps)
2. Redirect to /studio/concepts/[id]/review
3. Edit metadata fields, click "Publicera"
4. Navigate to /studio/customers/[id]
5. Switch to Feed Plan tab
6. Open "Lägg till koncept" sidepanel
7. Search/filter library
8. Click "Lägg till koncept"
9. Drag to slot (or auto-place)
10. Open edit wizard to fill content
```

The CM already knows which customer a clip is for at step 1. Steps 2-10 are overhead for the primary use case.

---

## Solution

Add a final step to `UploadConceptModal` after classification:

```
[URL] → [Analyzing] → [Enriching] → [Classify] → [Assign?] → [Save]
```

The new "Assign?" step presents:
- **Primary action:** "Tilldela kund" — customer picker → save concept + create customer_concept + place in feed
- **Secondary action:** "Spara till bibliotek" — current behavior (save concept, redirect to review)

---

## Detailed Implementation

### 1. UploadConceptModal — New Step

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

#### Step Progression Change

Current steps:
```typescript
const STEPS = ['idle', 'analyzing', 'enriching', 'classifying', 'saving'] as const;
```

New steps:
```typescript
const STEPS = ['idle', 'analyzing', 'enriching', 'classifying', 'assigning', 'saving'] as const;
```

#### New State

```typescript
const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
const [customerSearch, setCustomerSearch] = useState('');
const [customerResults, setCustomerResults] = useState<Array<{
  id: string;
  name: string;
  tiktok_handle: string | null;
}>>([]);
const [loadingCustomers, setLoadingCustomers] = useState(false);
```

#### "Assigning" Step UI

After classification validates (businessTypes.length > 0), CM sees:

```
┌─────────────────────────────────────────┐
│  Vem är det här till?                   │
│                                         │
│  [Sök kund...]                          │
│                                         │
│  ┌─ Dina kunder ──────────────────────┐ │
│  │ Restaurang Norden    @norden_sthlm │ │
│  │ Café Bryggan         @bryggan_gbg  │ │
│  │ Bar Botanik          @botanikbar   │ │
│  └────────────────────────────────────┘ │
│                                         │
│  [Tilldela & spara]   [Bara bibliotek]  │
└─────────────────────────────────────────┘
```

- Customer list fetched from `/api/studio-v2/customers` (CM's customers)
- Search filters client-side by name or handle
- Selecting a customer highlights it
- "Tilldela & spara" = primary CTA (disabled until customer selected)
- "Bara bibliotek" = secondary action (current behavior)

#### Customer Fetch

On entering the "assigning" step:
```typescript
useEffect(() => {
  if (step !== 'assigning') return;
  setLoadingCustomers(true);
  fetch('/api/studio-v2/customers')
    .then(res => res.json())
    .then(data => setCustomerResults(data.customers ?? []))
    .catch(() => setCustomerResults([]))
    .finally(() => setLoadingCustomers(false));
}, [step]);
```

This endpoint already exists and returns the CM's customers.

#### Save Flow (Two Paths)

**Path A: "Tilldela & spara"**
```typescript
async function handleSaveAndAssign() {
  setStep('saving');
  
  // 1. Save concept (existing logic)
  const conceptId = await saveConceptToLibrary();
  
  // 2. Assign to customer (new)
  await fetch(`/api/studio-v2/customers/${selectedCustomerId}/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      concept_id: conceptId,
      // content_overrides not needed — backend pre-populates (Phase 71)
    }),
  });
  
  // 3. Close modal and signal success
  reset();
  onSuccess(conceptId, { assignedTo: selectedCustomerId });
}
```

**Path B: "Bara bibliotek"**
```typescript
async function handleSaveToLibrary() {
  setStep('saving');
  const conceptId = await saveConceptToLibrary();
  reset();
  onSuccess(conceptId, { assignedTo: null });
}
```

---

### 2. onSuccess Callback Change

**File:** `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`

Current interface:
```typescript
onSuccess: (conceptId: string) => void;
```

New interface:
```typescript
onSuccess: (conceptId: string, meta: { assignedTo: string | null }) => void;
```

---

### 3. Parent Handler (Concepts Page)

**File:** `artifacts/letrend/src/app/studio/concepts/page.tsx`

Current (line 2086-2089):
```typescript
onSuccess={(id) => {
  setShowUploadModal(false);
  router.push(`/studio/concepts/${id}/review`);
}}
```

New:
```typescript
onSuccess={(id, meta) => {
  setShowUploadModal(false);
  if (meta.assignedTo) {
    // Navigate to customer workspace — concept is already placed
    router.push(`/studio/customers/${meta.assignedTo}?tab=feed`);
  } else {
    // Library-only save — go to review as before
    router.push(`/studio/concepts/${id}/review`);
  }
}}
```

---

### 4. Backend: Concept Save Returns ID

**File:** `artifacts/api-server/src/routes/admin/concepts.ts`

The existing `POST /api/admin/concepts` already returns the created concept. No change needed — the frontend already receives the concept ID from the save response.

---

### 5. Backend: Auto-Publish on Assign

When a concept is saved via the "Tilldela & spara" path, it should be automatically published (`is_active = true`) since it's being immediately assigned to a customer. Draft concepts can't be assigned.

Two options:
- **Option A:** Frontend sets `is_active: true` in the save payload when assigning
- **Option B:** Backend auto-publishes when a customer_concept is created for a draft concept

**Chosen: Option A** — Simpler, keeps logic visible in the frontend, no backend behavior change.

In `handleSaveAndAssign()`:
```typescript
const conceptId = await saveConceptToLibrary({ is_active: true });
```

---

## UI Design Details

### Assigning Step Layout

- Modal width: 640px (same as classify step)
- Customer list: max-height 280px, scrollable
- Each customer row: name (bold) + handle (muted) + select indicator
- Selected customer: highlighted border + checkmark
- Search input above list with instant filter
- If CM has 0 customers: show message "Du har inga kunder ännu" + only "Bara bibliotek" available

### Transitions

- From "Klassificera": Next button becomes "Nästa →" (goes to assigning step)
- From "Assigning": Two CTAs at bottom
- "Tilldela & spara" — primary brown button, disabled until customer selected
- "Bara bibliotek" — secondary outlined button, always enabled
- Back arrow returns to classification step

### Skip Shortcut

For power users who batch-upload without customer intent: the classification step gets a small link "Hoppa över tilldelning →" that saves directly to library (skipping the assigning step entirely).

---

## Data Flow Diagram

```
UploadConceptModal
  │
  ├─ [Tilldela & spara]
  │    │
  │    ├─ POST /api/admin/concepts  { ..., is_active: true }
  │    │    → concept saved to library (published)
  │    │
  │    ├─ POST /api/studio-v2/customers/:id/concepts  { concept_id }
  │    │    → customer_concept created
  │    │    → content_overrides pre-populated (Phase 71)
  │    │    → feed_order auto-assigned
  │    │
  │    └─ Navigate to /studio/customers/:id?tab=feed
  │         → CM sees concept in customer's feed, fully populated
  │
  └─ [Bara bibliotek]
       │
       ├─ POST /api/admin/concepts  { ..., is_active: true }
       │    → concept saved to library (published)
       │
       └─ Navigate to /studio/concepts/:id/review
            → CM can review/edit, assign later from library
```

---

## Edge Cases

### 1. Save succeeds but assignment fails
- Concept is saved to library (published)
- Assignment error shown to CM with message
- CM can assign manually later from library or customer workspace
- Not a critical failure — concept is safe

### 2. CM has no customers
- Assigning step shows "Du har inga tilldelade kunder" message
- Only "Bara bibliotek" is available
- Skip shortcut still works from classification step

### 3. Customer already has this concept
- Backend POST /customers/:id/concepts already returns error for duplicates
- Frontend shows error: "Kunden har redan detta koncept"
- CM can pick a different customer or save to library

### 4. Network failure during customer fetch
- Customer list shows "Kunde inte ladda kunder" message
- "Bara bibliotek" still works
- "Tilldela & spara" disabled

### 5. Concept save returns different ID than expected
- `saveConceptToLibrary()` returns actual saved ID from server response
- Assignment uses this ID, not the locally generated one

---

## Dependencies

- **Phase 71 must be complete** — The assignment endpoint must pre-populate content_overrides for this flow to deliver its full value. Without Phase 71, the concept would be assigned but with empty metadata.

---

## Verification

### Typecheck
```bash
pnpm --filter "./artifacts/api-server" run typecheck
pnpm --filter "./artifacts/letrend" run typecheck
```

### Functional verification
1. Upload a new concept → reach "Vem är det här till?" step
2. Select a customer → "Tilldela & spara"
3. Verify redirect to customer workspace
4. Verify concept appears in feed with populated metadata
5. Verify "Bara bibliotek" still works (redirect to review page)

### Regression
- Existing library-only upload flow unchanged
- Review page still accessible and functional
- "Lägg till koncept" sidopanel in customer workspace still works (for library-browsing flow)
- handleAddConcept in CustomerWorkspaceContent still functions for manual library assignment

---

## Remaining Gaps

1. **No "recently uploaded" shortcut in customer workspace** — If CM already uploaded to library, they still need to find it via the sidepanel search. Future: show "Senast uppladdade" section at top of library picker.
2. **No batch assignment** — Can't assign one concept to multiple customers at once. Deferred.
3. **Review page bypassed but still exists** — CM can still visit /studio/concepts/[id]/review for fine-tuning. Not deleted.
4. **Customer list doesn't show brief/context** — Picking the right customer relies on CM memory. Future: show customer brief snippet on hover.
