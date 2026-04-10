# Slice 1 — Runtime/UI Hardening — 2026-04-10

Minimal production-safe pass on Studio feed planner and history card UX. No schema changes, no backend model changes, no auto-matching or auto-advance logic introduced.

---

## Files Changed

```
app/src/components/studio/customer-detail/CustomerFeedSlot.tsx
app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx
```

---

## Changes Made

### 1. Context menu — viewport-aware positioning (CustomerFeedSlot.tsx)

**Problem:** `handleMenuToggle` computed `top = rect.bottom + 4` unconditionally. Cards in the bottom 40% of the viewport produced a menu that started below the visible area. Even with `maxHeight: 70vh`, the menu top was off-screen.

**Fix:** Added a viewport-threshold check. If `rect.bottom > window.innerHeight * 0.6` (button is in the lower 40%), the menu opens upward using CSS `bottom` instead of `top`:

```typescript
if (rect.bottom > window.innerHeight * 0.6) {
  const bottom = window.innerHeight - rect.top + 4;
  setMenuPos({ bottom, right });
} else {
  const top = Math.max(4, rect.bottom + 4);
  setMenuPos({ top, right });
}
```

`menuPos` type changed from `{ top: number; right: number }` to `{ top?: number; bottom?: number; right: number }`. The portal div now passes both `top: menuPos.top` and `bottom: menuPos.bottom` — CSS uses whichever is defined, ignores the other (undefined in the style object is a no-op). The portal itself (`position: fixed, zIndex: 9999`) was already correct.

**Tradeoff:** The 60% threshold is a heuristic, not exact. For cards very close to the 60% boundary, the menu opens downward and might have limited space before hitting the viewport bottom. `maxHeight: 70vh` keeps it visible. An exact approach (measure the rendered menu height via a ResizeObserver) is deferred — it would require two-phase rendering.

---

### 2. Context menu width (CustomerFeedSlot.tsx)

**Problem:** Fixed `width: 220` was wider than the longest menu item (~180px for "Markera innehåll uppladdat" at 12px). Dead space of ~40px on every menu.

**Fix:** Changed to `width: 200`. Fits the longest Swedish items with minimal whitespace.

```typescript
// Before
width: 220,

// After
width: 200,
```

**Tradeoff:** Did not use `width: 'max-content'` (which would shrink to content). `max-content` on a `position: fixed` element with `width: 100%` child buttons creates circular sizing in some browser/zoom combinations. Fixed 200px is reliable across all cards and zoom levels.

---

### 3. Scroll capture — conditional preventDefault (CustomerWorkspaceContent.tsx)

**Problem:** The wheel event listener called `e.preventDefault()` unconditionally, even when the planner was at its scroll extent (historyOffset at maximum or minimum). This prevented normal page scroll when hovering over the planner at its limits — a common case since most CMs spend most of their time near feed_order 0.

**Root cause (confirmed from code):** `e.preventDefault()` fired before any bounds check:
```typescript
// Before
wheelCbRef.current = (e: WheelEvent) => {
  e.preventDefault();        // ← always fires, traps scroll
  if (scrollLockedRef.current) return;
  if (cooldown.active) return;
  if (e.deltaY > 0) {
    if (fetchingProfileHistory) return;
    setHistoryOffset(prev => Math.min(prev + gridConfig.columns, maxExtraHistorySlots));
  ...
```

**Fix:** Added a `historyOffsetRef` (updated via `useEffect`) to track the current offset in a stable ref. The bounds check now runs before `preventDefault`:

```typescript
// After
wheelCbRef.current = (e: WheelEvent) => {
  if (scrollLockedRef.current) return;
  if (cooldown.active) return;
  const canMoveDown = goingDown && !fetchingProfileHistory && historyOffsetRef.current < maxExtraHistorySlots;
  const canMoveUp = goingUp && historyOffsetRef.current > -maxForwardSlots;
  if (!canMoveDown && !canMoveUp) return;  // let page scroll proceed
  e.preventDefault();
  ...
```

`historyOffsetRef` uses the same stable-ref pattern already established for `scrollLockedRef`. It is NOT added to the wheel effect dependency array — the ref is always current without re-attaching the DOM listener.

**Tradeoff:** The 400ms cooldown now only starts AFTER a valid scroll event. Previously, scrolling at the limit (no planner movement, no preventDefault) still consumed the cooldown. Now rapid scrolling through the limit and back is slightly more responsive. No behavior change in the common path.

---

### 4. Stats banner — all history cards (CustomerFeedSlot.tsx)

**Problem:** The stats row was gated on `result?.tiktok_views || result?.tiktok_likes || result?.tiktok_comments`. LeTrend-managed history cards (produced concepts, `concept_id IS NOT NULL`) have no stats initially — the banner was invisible for them, making them visually inconsistent with TikTok-imported cards.

**Fix:** Removed the null guard. The stats row now renders for **all** history-type cards. `formatMetric(null)` already returns `'-'` for null values. Color adapts to thumbnail presence (white at 60% opacity on dark thumbnail, textSecondary on light background):

```typescript
// Before
{type === 'history' && (result?.tiktok_views || result?.tiktok_likes || result?.tiktok_comments) && (
  <div style={{ ... color: LeTrendColors.textSecondary }}>
    {`Visn ${...} · Likes ${...} · Komm ${...}`}
  </div>
)}

// After
{type === 'history' && (
  <div style={{ ... color: hasThumbnail ? 'rgba(255,255,255,0.6)' : LeTrendColors.textSecondary }}>
    {`${...} visn · ${...} likes · ${...} komm`}
  </div>
)}
```

Label order also changed to noun-first (`123 visn` instead of `Visn 123`) to match the compact TikTok-card stat convention and reduce visual width.

**Tradeoff:** Cards with truly no stats (neither TikTok-imported nor manually set) now show `"- visn · - likes · - komm"`. This is honest: it communicates that stats are tracked here, currently absent. The alternative (hiding the region) makes LeTrend history cards look structurally different from TikTok history cards, which is the problem being fixed.

---

### 5. Loading state on "Markera producerat" (CustomerFeedSlot.tsx)

Already implemented in the prior session. Verified present: `isMarkingProduced` state, `async` handler, `disabled` + `'Markerar...'` + dimmed style while in flight, `finally` block that clears the flag. No changes needed.

---

### 6. Microcopy clarification (CustomerWorkspaceContent.tsx)

**Problem:** The motor cue subtitle for `fresh_activity` without a nu-concept read:
> "Kunden publicerade nytt – flytta kommande och nu ett steg framåt."

This reads as a direct instruction to advance, potentially suggesting the advance is automatic or expected without review.

**Fix:** Changed to:
> "Kunden publicerade nytt – granska historiken och flytta planen om det stämmer."

The addition of "om det stämmer" (if it applies) and "granska historiken" (review the history) makes explicit that:
1. The CM should look at the imported clips first
2. Advancing is conditional, not automatic

All other cue text (`"Var det nu-konceptet som publicerades?"`, `"Äldre innehåll – granska historiken..."`, `"Placera ett koncept i planen..."`) was already appropriately conditional and was not changed.

---

## Semantics Preserved

- Cron `sync-history-all` = passive observation only. No UI change touches cron behavior.
- `advance-plan` = explicit CM action. Button label "Flytta planen framåt" unchanged. Requires CM click.
- `mark-produced` = explicit CM assertion. No auto-trigger, no auto-link without CM input.
- No auto-matching between TikTok imports and LeTrend concepts was introduced.
- No schema changes.

---

## Deferred

### D1 — Exact menu height measurement for positioning
The viewport-threshold heuristic (60%) works for most cards. A precise solution would use `ResizeObserver` on the portaled menu to measure its actual rendered height, then flip only when there is insufficient space. Deferred — two-phase rendering adds complexity for a small edge case.

### D2 — Menu width via `max-content`
Using CSS `max-content` on a `position: fixed` element is reliable in modern browsers, but can behave unexpectedly when child elements have `width: 100%` (circular sizing). The fixed `200px` is the conservative choice. If the menu content changes significantly (long tag names, longer items), revisit.

### D3 — Click-outside on iOS Safari
`mousedown` listeners on `document` do not fire for touch events on iOS Safari unless the element has a click handler or `cursor: pointer`. The portaled context menu relies on `mousedown` for outside-click dismissal. On iOS, this means the menu may stay open after tapping elsewhere. Deferred — Studio is a desktop-first CM tool.

### D4 — Horizontal scroll edge clamp for the portal menu
The menu is right-aligned to the ⋯ button via `right: window.innerWidth - rect.right`. If the grid is very narrow (narrow viewport), the menu's left edge could extend beyond the left viewport edge. A `Math.max` clamp on `right` would prevent this. Deferred — not observed in practice at current grid widths.

### D5 — Visual zone separator between LeTrend and TikTok historik
Both `row_kind: 'assignment'` historik and `row_kind: 'imported_history'` historik blend together in the grid. Only the "Importerad" badge distinguishes them. A subtle section divider or background distinction would improve scannability. Requires a layout-level change to the grid rendering — deferred to Slice 2.
