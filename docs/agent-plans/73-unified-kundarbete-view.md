# Phase 73 — Unified "Kundarbete" View

**Date**: 2026-05-12
**Scope**: Merge the Koncept tab and Feed Plan tab into a single coherent workspace view for CM customer work.

---

## Problem Statement

Today's customer workspace has two tabs showing the same underlying data (`customer_concepts`) with different presentations:

**Koncept tab** (KonceptSection):
- Flat list of all customer_concepts
- Grouped by type: Active, Produced, Collaborations
- Sortable via drag-and-drop (DnD Kit)
- Shows: headline, status badge, sparkline, source label, CM notes, tags

**Feed Plan tab** (FeedPlannerSection):
- Visual timeline grid with slots
- Eel-curve engagement visualization
- Tempo (posting schedule) indicators
- "Odelade kunduppdrag" (unplaced concepts) panel with drag-to-slot
- Slot-aware concept picker (sidepanel)
- Motor signals, span editing, projected dates

**The confusion:**
- CM must switch between tabs to understand "what do I have?" (Koncept) vs "where is it placed?" (Feed Plan)
- "Add concept" lives in the Feed Plan tab's sidepanel, not in the Koncept tab
- "Odelade kunduppdrag" only appears in Feed Plan — a concept that's been assigned but not placed is invisible in Koncept tab's active list if filtered
- Editing a concept opens a SidePanel wizard from either tab — but the context differs

---

## Solution

Replace both tabs with a single **"Kundarbete"** view that combines:
1. A compact visual overview (timeline summary) at the top
2. A unified concept list below, organized by placement state
3. Inline expansion for editing — no separate SidePanel for basic metadata

---

## Detailed Design

### Overall Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Timeline Overview Bar]                                     │
│  ←← historik | ← nu | kommande →→                           │
│  [5 slots shown as compact chips/dots with status colors]   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NÄSTA ATT GÖRA (unplaced concepts, feed_order = null)      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ "Morgon-sketch med barista"  [Placera →] [Redigera] │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  KOMMANDE (feed_order > 0, sorted ascending)                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Slot +1: "Kaffe-prank på gäst"                      │    │
│  │   Status: draft │ Manus: 4 rader │ CM-not: "..."    │    │
│  │   [▼ Expandera]                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Slot +2: "Behind the scenes fredag"                 │    │
│  │   Status: sent │ Manus: 6 rader │ Planerat: mån     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NU (feed_order = 0) — highlighted section                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ "Reagera på beställning"                            │    │
│  │   Status: sent │ Skickat: 10 maj │ Inspelningsdag?  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  HISTORIK (feed_order < 0, sorted descending)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ "Disk-dansen"  │ Producerat 5 maj │ 12.4k views     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ "Meny-fail"    │ Producerat 28 apr │ 8.1k views     │    │
│  └─────────────────────────────────────────────────────┘    │
│  [Visa fler...]                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [+ Lägg till koncept]  [+ Nytt samarbete]                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Section 1: Timeline Overview Bar

A compact, horizontal summary replacing the full FeedPlannerSection grid:

- Shows 7-9 slots as small colored indicators (circles or rectangles)
- Color coding: green (produced), blue (sent), gray (draft), empty (no concept)
- Clicking a slot scrolls the list below to that concept
- Shows tempo indicator if set ("3/vecka")
- Shows next projected publish date if tempo is configured
- Collapsible — CM can hide it if they want more list space

**What's preserved from FeedPlannerSection:**
- Slot position awareness (feed_order mapping)
- Tempo/projected dates (compact display)
- Eel curve data (shown on hover or in expanded concept card)

**What's removed:**
- Full grid layout with multiple rows
- Drag-and-drop as primary placement mechanism
- Debug panel
- Span editing (moved to a separate "Avancerat" action)

---

### Section 2: Concept Cards (Unified List)

Each concept is a card with two states:

**Collapsed (default):**
- One line: headline + status badge + key metric (views if produced, script length if draft)
- Slot position indicator ("+1", "+2", "Nu", "−1")
- Actions: [Expandera ▼] [⋮ more]

**Expanded (on click):**
- Full inline editing: headline, script, why_it_fits, filming_instructions
- cm_note field
- Status transition buttons (Markera skickat, Markera producerat)
- Placement action ("Flytta till slot X", "Ta bort från plan")
- TikTok URL + stats (if produced)
- Tags editor

**Key difference from today:** Editing happens inline in the list, not in a SidePanel that covers the view. The CM stays in context.

---

### Section 3: Actions Bar

Bottom-anchored bar with:
- "Lägg till koncept" — opens library picker (existing sidepanel, but now triggered from the unified view)
- "Nytt samarbete" — opens collaboration modal (existing)
- "Ladda upp nytt" — opens UploadConceptModal directly from customer context (supports Phase 72 flow where customer is pre-selected)

---

## Placement Mechanics (Simplified)

**Current:** Drag-and-drop from "Odelade" panel to empty slots in a visual grid.

**New:** Button-driven placement with smart defaults:

1. **Unplaced concept has a "Placera →" button**
   - Click opens a small dropdown: "Nästa lediga slot", "Välj slot..."
   - "Nästa lediga slot" = finds lowest available feed_order > 0 and assigns
   - "Välj slot..." = shows numbered slot list (compact)

2. **Reordering:** Each placed concept has "↑ Flytta upp" / "↓ Flytta ner" actions in its expanded view
   - Swaps feed_order with adjacent concept
   - Same underlying logic as current swap mechanism

3. **Remove from plan:** "Ta bort ur plan" sets feed_order = null, concept moves to "Nästa att göra" section

**Rationale:** Drag-and-drop is powerful but adds complexity and is harder on mobile/tablet. Button-based placement is clearer, faster for the primary case (place next), and still allows precise control.

---

## Tab Structure Change

**File:** `artifacts/letrend/src/lib/studio/navigation.ts`

Current tabs:
```typescript
['koncept', 'gameplan', 'feed', 'kommunikation']
```

New tabs:
```typescript
['kundarbete', 'gameplan', 'kommunikation']
```

- `kundarbete` replaces both `koncept` and `feed`
- `gameplan` and `kommunikation` unchanged
- URL: `/studio/customers/[id]?tab=kundarbete` (default tab)

---

## Component Architecture

### New Components

```
UnifiedKundarbeteView.tsx          — Main container, fetches data, manages state
├── TimelineOverviewBar.tsx        — Compact horizontal slot summary
├── ConceptSection.tsx             — Groups concepts by placement state
│   ├── UnplacedConceptGroup.tsx   — "Nästa att göra" section
│   ├── PlacedConceptGroup.tsx     — "Kommande" / "Nu" / "Historik" sections
│   └── ConceptCard.tsx            — Individual concept (collapsed/expanded)
│       ├── ConceptCardCollapsed   — One-line summary
│       └── ConceptCardExpanded    — Inline editing form
└── KundarbeteActionsBar.tsx       — Bottom action buttons
```

### Preserved Components (reused)

- `SidePanel` — still used for library picker ("Lägg till koncept")
- `CollaborationModal` — unchanged
- `TagManager` — reused in expanded concept cards
- `UploadConceptModal` — triggered from actions bar

### Deprecated Components (kept but no longer default)

- `KonceptSection.tsx` — replaced by UnifiedKundarbeteView
- `FeedPlannerSection.tsx` — replaced by TimelineOverviewBar + concept list
- `DraftConceptPicker.tsx` — replaced by UnplacedConceptGroup with button placement
- `FeedSlot.tsx` — slot rendering logic moves to TimelineOverviewBar

These files are not deleted immediately — they're kept for rollback safety. Once the unified view is stable, they can be removed in a cleanup phase.

---

## Data Flow

**No new API endpoints needed.** The unified view uses the same data source:

```typescript
// Same as today:
const concepts = await fetchConcepts(); // GET /api/studio-v2/customers/:id/concepts

// Grouping logic:
const unplaced = concepts.filter(c => c.placement.feed_order === null);
const current = concepts.filter(c => c.placement.feed_order === 0);
const upcoming = concepts.filter(c => c.placement.feed_order > 0).sort(byFeedOrder);
const history = concepts.filter(c => c.placement.feed_order < 0).sort(byFeedOrderDesc);
```

**Mutations use existing endpoints:**
- PATCH /api/studio-v2/concepts/:id — update content_overrides, feed_order, status, cm_note
- POST /api/studio-v2/customers/:id/concepts — add concept
- Same optimistic update patterns already in CustomerWorkspaceContent

---

## Migration Strategy

**Not a big-bang rewrite.** Incremental approach:

### Step 1: Build UnifiedKundarbeteView alongside existing tabs
- Add as a new tab option (hidden behind feature check or URL param)
- Verify it renders correctly with real data
- No changes to existing Koncept/Feed tabs

### Step 2: Wire up all interactions
- Inline editing (save → PATCH)
- Placement buttons (feed_order changes)
- Status transitions
- Library picker integration

### Step 3: Replace default tab
- Change navigation.ts to show `kundarbete` instead of `koncept` + `feed`
- Old tabs remain accessible via direct URL for transition period

### Step 4: Cleanup
- Remove deprecated components
- Remove old tab definitions
- Simplify state in CustomerWorkspaceContent

---

## What's Preserved vs Changed

| Feature | Current | New | Change type |
|---------|---------|-----|-------------|
| Concept metadata editing | SidePanel wizard | Inline in expanded card | UX improvement |
| Feed placement | Drag-and-drop to grid | "Placera →" button | Simplification |
| Timeline visualization | Full grid with eel curves | Compact overview bar | Compaction |
| Unplaced concepts | Separate collapsible in Feed tab | Top section in list | Integration |
| Library picker | SidePanel from Feed tab | SidePanel from unified view | Location change |
| Concept grouping | By type (active/produced/collab) | By placement state (unplaced/upcoming/now/history) | Reframing |
| Status transitions | Dropdown in slot card | Button in expanded card | Same functionality |
| Engagement data | Eel curve in grid | Compact stat in card | Compaction |
| Tempo/schedule | Dedicated section in Feed | Indicator in overview bar | Compaction |
| Collaboration concepts | Separate section in Koncept | Interspersed by feed_order | Integration |
| "Add concept" entry | Feed tab button | Bottom action bar | Always accessible |

---

## Edge Cases

### 1. Customer with 0 concepts
Show empty state: "Inga koncept ännu. Ladda upp eller välj från biblioteket." with prominent action buttons.

### 2. Customer with 50+ concepts
- "Historik" section shows latest 5, with "Visa fler..." expansion
- "Kommande" shows all (rarely >10)
- Performance: no pagination needed (existing fetch returns all)

### 3. Concurrent CM editing
- Same as today: optimistic updates with refetch on save
- No new concurrency concerns

### 4. Mobile/tablet
- Timeline overview bar scrolls horizontally
- Concept cards stack vertically (already designed for this)
- No drag-and-drop dependency (button-based placement)

### 5. Collaboration concepts
- Show in the same list, positioned by feed_order
- Visual distinction: different border color or icon
- Expanded view shows collaboration-specific fields (partner, scope, price)

---

## Verification

### Typecheck
```bash
pnpm --filter "./artifacts/letrend" run typecheck
```

### Functional verification (per migration step)

**Step 1:**
- New component renders all concept groups correctly
- Data matches what Koncept + Feed tabs show

**Step 2:**
- Inline editing saves correctly (PATCH succeeds)
- Placement buttons work (feed_order changes, concept moves between sections)
- Status transitions reflect in UI immediately

**Step 3:**
- Navigation works (tab switch, URL param)
- No broken links from other pages that linked to ?tab=koncept or ?tab=feed

**Step 4:**
- Old components removed without breaking builds
- No dead imports

---

## Dependencies

- **Phase 71** — Pre-populated content_overrides means expanded cards show real content immediately
- **Phase 72** — "Ladda upp nytt" in actions bar can pre-select the current customer

---

## Remaining Gaps (Intentional Scope Limits)

1. **Eel curve visualization removed from default view** — Available on hover/click in expanded concept card, but not always visible. If engagement viz is critical, it can be added back to the overview bar as a sparkline.
2. **Span editing removed from default view** — Spans are an advanced planning feature. If needed, accessible via "Avancerat" action or separate admin-focused view.
3. **No batch operations** — Can't multi-select concepts for bulk status change, bulk reorder, or bulk assignment. Deferred.
4. **Motor signals not shown** — Posting frequency/profile signals are currently in FeedPlannerSection. Could be added to overview bar as indicators if needed.
5. **Projected dates simplified** — Tempo-based date projections shown in overview bar, not per-slot in the list. If precise date planning is critical, a "Planering"-subview could be added later.
