# Component 08: Rotation Logic Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: 72-Hour Rotation and Archival System
> **Last Updated**: January 1, 2026

---

## Overview

The rotation logic manages the 72-hour listing windows, ensuring fresh catalog while preventing stale listings. This creates urgency for buyers and prevents the marketplace from becoming cluttered.

### Recommendations-First Model

> **Important**: The customer interface uses a **recommendations-first** approach. Users don't browse a catalog directly - they receive personalized recommendations based on their profile. The rotation logic still applies, but concepts are surfaced through the recommendations API rather than a browse interface.
>
> See [Interface Documentation](../interface/README.md) for user-facing patterns.

---

## CRITICAL RULE: NO RE-ACTIVATION

**Once a concept is archived, it NEVER comes back.**

This is a deliberate design decision:
1. **Creates true scarcity** - "If you don't buy now, it's gone forever"
2. **Prevents catalog bloat** - Fresh concepts only
3. **Simplifies operations** - No re-listing decisions
4. **Protects early buyers** - Their purchase stays exclusive

```typescript
// NEVER do this:
async function reactivateConcept(conceptId: string) { /* ❌ */ }

// Archived = FINAL state
type FinalStates = 'archived'; // No path out
```

---

## WHY 72 HOURS?

### Rationale

| Duration | Problem |
|----------|--------|
| 24 hours | Too short for buyers in different timezones |
| 48 hours | Still tight for decision-making |
| **72 hours** | Sweet spot: urgency + accessibility |
| 1 week | Loses urgency, stale feeling |

**72 hours = 3 days** means:
- Every buyer sees it during at least one browsing session
- Weekend overlap (Friday listing visible through Sunday)
- Enough time for "sleep on it" decisions
- Still creates FOMO

---

## CAP NUMBERS FROM DESIGN

| Cap Type | Value | Rationale |
|----------|-------|----------|
| Per-market cap | **3-5** | Prevents saturation in one market |
| Global cap | **10-15** | Total scarcity across all markets |

These are configurable per-concept, but defaults are:
```typescript
const DEFAULT_CAPS = {
  perMarket: 4,   // Middle of 3-5 range
  global: 12      // Middle of 10-15 range
};
```

---

## 1. Core Rotation Mechanics

### 1.1 Lifecycle States

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CONCEPT LIFECYCLE                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │  DRAFT   │───▶│  LISTED  │───▶│  ACTIVE  │───▶│ EXPIRING │───▶│ ARCHIVED │         │
│   │          │    │          │    │  72hrs   │    │  <6hrs   │    │          │         │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│                         │               │                              ▲               │
│                         │               │                              │               │
│                         │               ▼                              │               │
│                         │        ┌──────────┐                          │               │
│                         │        │   SOLD   │──────────────────────────┘               │
│                         │        │ (partial)│                                          │
│                         │        └──────────┘                                          │
│                         │               │                                               │
│                         │               ▼                                               │
│                         │        ┌──────────┐                                          │
│                         └───────▶│ MAX SOLD │──────────────────────────────▶ ARCHIVED  │
│                                  │ (cap hit)│                                          │
│                                  └──────────┘                                          │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 State Definitions

```typescript
type ListingStatus = 
  | 'draft'          // Created but not listed
  | 'listed'         // In queue, not yet active
  | 'active'         // Currently visible and purchasable
  | 'expiring_soon'  // < 6 hours remaining
  | 'sold_partial'   // Some purchases, window still open
  | 'sold_max'       // Global cap (10-15) reached
  | 'sold_market_cap'// Market cap (3-5) reached for a market
  | 'expired'        // Window closed, no sales
  | 'archived';      // Final state, no re-listing

interface ListingWindow {
  id: string;
  concept_id: string;
  status: ListingStatus;
  listed_at: string;           // When first listed
  activated_at: string | null; // When became active
  expires_at: string | null;   // 72 hours after activation
  archived_at: string | null;  // When moved to archive
  
  total_purchases: number;
  market_purchases: Record<string, number>; // { "US": 2, "MX": 1 }
  global_cap: number;          // 10-15
  market_cap: number;          // 3-5
}
```

---

## 2. Timing Logic

### 2.1 Window Calculation

```typescript
const WINDOW_DURATION_MS = 72 * 60 * 60 * 1000; // 72 hours
const EXPIRING_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours before expiry

function calculateWindowTiming(activatedAt: Date): {
  expiresAt: Date;
  isExpiringSoon: boolean;
  timeRemaining: number;
  percentRemaining: number;
} {
  const now = new Date();
  const expiresAt = new Date(activatedAt.getTime() + WINDOW_DURATION_MS);
  const timeRemaining = expiresAt.getTime() - now.getTime();
  
  return {
    expiresAt,
    isExpiringSoon: timeRemaining < EXPIRING_THRESHOLD_MS,
    timeRemaining: Math.max(0, timeRemaining),
    percentRemaining: Math.max(0, (timeRemaining / WINDOW_DURATION_MS) * 100)
  };
}
```

### 2.2 Time Display

```typescript
function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
}

// Examples:
// formatTimeRemaining(259200000) => "3d 0h"  (72 hours)
// formatTimeRemaining(90000000)  => "25h 0m"
// formatTimeRemaining(3600000)   => "1h 0m"
// formatTimeRemaining(300000)    => "5m"
```

---

## 3. Activation and Expiration

### 3.1 Activation Process

```typescript
async function activateListing(conceptId: string): Promise<ListingWindow> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_DURATION_MS);
  
  // Check if concept can be listed
  const concept = await getConcept(conceptId);
  if (!concept) throw new Error('Concept not found');
  if (concept.listing_status !== 'draft') {
    throw new Error('Only draft concepts can be listed');
  }
  
  // Create listing window
  const { data: window, error } = await supabase
    .from('listing_windows')
    .insert({
      concept_id: conceptId,
      status: 'active',
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      total_purchases: 0,
      market_purchases: {},
      global_cap: 12,  // Default, can be adjusted
      market_cap: 4    // Default
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Update concept status
  await supabase
    .from('concepts')
    .update({ listing_status: 'active', active_window_id: window.id })
    .eq('id', conceptId);
  
  return window;
}
```

### 3.2 Expiration Cron Job

```typescript
// Run every 5 minutes via cron or scheduled function
async function processExpirations(): Promise<{
  expired: string[];
  expiringSoon: string[];
}> {
  const now = new Date();
  const expiringSoonThreshold = new Date(now.getTime() + EXPIRING_THRESHOLD_MS);
  
  // Find expired listings
  const { data: expired } = await supabase
    .from('listing_windows')
    .select('id, concept_id')
    .eq('status', 'active')
    .lt('expires_at', now.toISOString());
  
  // Archive expired listings
  for (const listing of expired || []) {
    await archiveListing(listing.id, listing.concept_id, 'expired');
  }
  
  // Find expiring soon listings
  const { data: expiringSoon } = await supabase
    .from('listing_windows')
    .select('id')
    .eq('status', 'active')
    .lt('expires_at', expiringSoonThreshold.toISOString())
    .gt('expires_at', now.toISOString());
  
  // Update status to expiring_soon
  if (expiringSoon?.length) {
    await supabase
      .from('listing_windows')
      .update({ status: 'expiring_soon' })
      .in('id', expiringSoon.map(l => l.id));
  }
  
  return {
    expired: expired?.map(l => l.concept_id) || [],
    expiringSoon: expiringSoon?.map(l => l.id) || []
  };
}
```

### 3.3 Archival Process

```typescript
async function archiveListing(
  windowId: string, 
  conceptId: string, 
  reason: 'expired' | 'sold_max' | 'sold_market_cap'
): Promise<void> {
  const now = new Date();
  
  // Update listing window
  await supabase
    .from('listing_windows')
    .update({
      status: 'archived',
      archived_at: now.toISOString(),
      archive_reason: reason
    })
    .eq('id', windowId);
  
  // Update concept
  await supabase
    .from('concepts')
    .update({
      listing_status: 'archived',
      active_window_id: null,
      archived_at: now.toISOString()
    })
    .eq('id', conceptId);
  
  console.log(`Archived concept ${conceptId}, reason: ${reason}`);
}
```

---

## 4. Purchase Cap Logic

### 4.1 Cap Check Before Purchase

```typescript
interface PurchaseEligibility {
  canPurchase: boolean;
  reason?: string;
  globalRemaining: number;
  marketRemaining: number;
}

async function checkPurchaseEligibility(
  conceptId: string,
  buyerMarket: string
): Promise<PurchaseEligibility> {
  const window = await getActiveWindow(conceptId);
  
  if (!window) {
    return { canPurchase: false, reason: 'No active listing', globalRemaining: 0, marketRemaining: 0 };
  }
  
  // Check global cap
  const globalRemaining = window.global_cap - window.total_purchases;
  if (globalRemaining <= 0) {
    return { canPurchase: false, reason: 'Global cap reached', globalRemaining: 0, marketRemaining: 0 };
  }
  
  // Check market cap
  const marketPurchases = window.market_purchases[buyerMarket] || 0;
  const marketRemaining = window.market_cap - marketPurchases;
  if (marketRemaining <= 0) {
    return { canPurchase: false, reason: `Market cap reached for ${buyerMarket}`, globalRemaining, marketRemaining: 0 };
  }
  
  // Check if expired
  if (new Date() > new Date(window.expires_at)) {
    return { canPurchase: false, reason: 'Listing expired', globalRemaining, marketRemaining };
  }
  
  return { canPurchase: true, globalRemaining, marketRemaining };
}
```

### 4.2 Process Purchase

```typescript
async function processPurchase(
  conceptId: string,
  buyerId: string,
  buyerMarket: string
): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
  // Check eligibility
  const eligibility = await checkPurchaseEligibility(conceptId, buyerMarket);
  if (!eligibility.canPurchase) {
    return { success: false, error: eligibility.reason };
  }
  
  const window = await getActiveWindow(conceptId);
  
  // Start transaction
  const { data: tx, error: txError } = await supabase.rpc('process_concept_purchase', {
    p_concept_id: conceptId,
    p_buyer_id: buyerId,
    p_buyer_market: buyerMarket,
    p_window_id: window.id
  });
  
  if (txError) {
    return { success: false, error: txError.message };
  }
  
  // Check if caps are now reached
  const updatedWindow = await getActiveWindow(conceptId);
  
  if (updatedWindow.total_purchases >= updatedWindow.global_cap) {
    await archiveListing(window.id, conceptId, 'sold_max');
  }
  
  return { success: true, transaction: tx };
}
```

### 4.3 Database Function for Atomic Purchase

```sql
CREATE OR REPLACE FUNCTION process_concept_purchase(
  p_concept_id UUID,
  p_buyer_id UUID,
  p_buyer_market TEXT,
  p_window_id UUID
) RETURNS transactions AS $$
DECLARE
  v_window listing_windows;
  v_price NUMERIC;
  v_transaction transactions;
BEGIN
  -- Lock the window row for update
  SELECT * INTO v_window
  FROM listing_windows
  WHERE id = p_window_id
  FOR UPDATE;
  
  -- Double-check eligibility within transaction
  IF v_window.total_purchases >= v_window.global_cap THEN
    RAISE EXCEPTION 'Global cap reached';
  END IF;
  
  IF COALESCE((v_window.market_purchases->>p_buyer_market)::int, 0) >= v_window.market_cap THEN
    RAISE EXCEPTION 'Market cap reached for %', p_buyer_market;
  END IF;
  
  IF v_window.expires_at < NOW() THEN
    RAISE EXCEPTION 'Listing expired';
  END IF;
  
  -- Calculate price
  v_price := calculate_concept_price(p_concept_id, p_buyer_market);
  
  -- Update window
  UPDATE listing_windows
  SET 
    total_purchases = total_purchases + 1,
    market_purchases = jsonb_set(
      COALESCE(market_purchases, '{}'::jsonb),
      ARRAY[p_buyer_market],
      to_jsonb(COALESCE((market_purchases->>p_buyer_market)::int, 0) + 1)
    )
  WHERE id = p_window_id;
  
  -- Create transaction
  INSERT INTO transactions (
    concept_id,
    buyer_id,
    buyer_market,
    price,
    window_id,
    purchased_at
  ) VALUES (
    p_concept_id,
    p_buyer_id,
    p_buyer_market,
    v_price,
    p_window_id,
    NOW()
  )
  RETURNING * INTO v_transaction;
  
  RETURN v_transaction;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Catalog View Logic

### 5.1 Get Active Listings

```typescript
interface CatalogFilters {
  market?: string;           // Filter by buyer's market
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'newest' | 'expiring_soon' | 'price_low' | 'price_high' | 'virality';
  limit?: number;
  offset?: number;
}

async function getActiveCatalog(filters: CatalogFilters): Promise<{
  concepts: ConceptWithWindow[];
  total: number;
}> {
  let query = supabase
    .from('listing_windows')
    .select(`
      *,
      concept:concepts (
        *,
        video:analyzed_videos (
          video_url,
          visual_analysis
        )
      )
    `, { count: 'exact' })
    .in('status', ['active', 'expiring_soon'])
    .gt('expires_at', new Date().toISOString());
  
  // Filter out concepts that have reached market cap for this buyer's market
  if (filters.market) {
    // This requires custom SQL or post-filtering
    // Post-filter for simplicity:
  }
  
  // Sorting
  switch (filters.sortBy) {
    case 'newest':
      query = query.order('activated_at', { ascending: false });
      break;
    case 'expiring_soon':
      query = query.order('expires_at', { ascending: true });
      break;
    case 'virality':
      // Requires join with concepts.virality_score
      query = query.order('concept.virality_score', { ascending: false });
      break;
    default:
      query = query.order('activated_at', { ascending: false });
  }
  
  // Pagination
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
  
  const { data, count, error } = await query;
  
  if (error) throw error;
  
  // Post-filter for market cap
  let filtered = data || [];
  if (filters.market) {
    filtered = filtered.filter(window => {
      const marketPurchases = window.market_purchases?.[filters.market!] || 0;
      return marketPurchases < window.market_cap;
    });
  }
  
  return {
    concepts: filtered.map(w => ({
      ...w.concept,
      window: {
        id: w.id,
        status: w.status,
        expires_at: w.expires_at,
        total_purchases: w.total_purchases,
        globalRemaining: w.global_cap - w.total_purchases,
        marketRemaining: filters.market 
          ? w.market_cap - (w.market_purchases?.[filters.market] || 0)
          : w.market_cap
      }
    })),
    total: count || 0
  };
}
```

### 5.2 Display Urgency Indicators

```typescript
function getUrgencyIndicator(window: ListingWindow): {
  level: 'none' | 'low' | 'medium' | 'high';
  message: string;
} {
  const timing = calculateWindowTiming(new Date(window.activated_at));
  const globalRemaining = window.global_cap - window.total_purchases;
  
  // Time-based urgency
  if (timing.timeRemaining < 60 * 60 * 1000) { // < 1 hour
    return { level: 'high', message: 'Expires in less than 1 hour!' };
  }
  
  if (timing.timeRemaining < 6 * 60 * 60 * 1000) { // < 6 hours
    return { level: 'high', message: `Expires in ${formatTimeRemaining(timing.timeRemaining)}` };
  }
  
  // Stock-based urgency
  if (globalRemaining === 1) {
    return { level: 'high', message: 'Only 1 left!' };
  }
  
  if (globalRemaining <= 3) {
    return { level: 'medium', message: `Only ${globalRemaining} left` };
  }
  
  // Combination
  if (timing.timeRemaining < 24 * 60 * 60 * 1000 && globalRemaining <= 5) {
    return { level: 'medium', message: `${globalRemaining} left, ${formatTimeRemaining(timing.timeRemaining)}` };
  }
  
  return { level: 'none', message: '' };
}
```

---

## 6. Cron Job Configuration

### 6.1 Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/process-expirations",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 6.2 Cron Endpoint

```typescript
// app/api/cron/process-expirations/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const result = await processExpirations();
    
    return NextResponse.json({
      success: true,
      processed: result.expired.length,
      flaggedExpiringSoon: result.expiringSoon.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Expiration processing failed:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

---

## 7. Edge Cases

### 7.1 Simultaneous Purchase Race Condition

**Problem**: Two buyers try to purchase the last available slot simultaneously.

**Solution**: Use database-level locking in `process_concept_purchase` function with `FOR UPDATE`.

```sql
-- The SELECT ... FOR UPDATE locks the row
SELECT * INTO v_window
FROM listing_windows
WHERE id = p_window_id
FOR UPDATE;

-- Only one transaction proceeds; others wait or fail
```

### 7.2 Timezone Handling

**Problem**: Buyers in different timezones may see different "time remaining".

**Solution**: Always use UTC in database; convert to local time in UI.

```typescript
// Always store in UTC
const expiresAt = new Date().toISOString(); // Always UTC

// In UI, convert to local
function displayLocalTime(utcString: string): string {
  return new Date(utcString).toLocaleString(undefined, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
}
```

### 7.3 Cron Job Failure

**Problem**: Cron job fails to run, leaving listings active past expiration.

**Solution**: 
1. Check expiration in real-time on any query
2. Alert on cron failures
3. Catch-up processing

```typescript
// In getActiveCatalog, double-check expiration
filtered = filtered.filter(window => {
  return new Date(window.expires_at) > new Date();
});

// This prevents showing truly expired listings even if cron missed them
```

---

## 8. Analytics and Reporting

### 8.1 Rotation Metrics

```typescript
interface RotationMetrics {
  // Window outcomes
  totalWindows: number;
  expiredNoSales: number;         // Lost opportunity
  expiredWithSales: number;
  soldMaxCap: number;             // Full success
  averageSalesPerWindow: number;
  
  // Timing
  averageTimeToFirstSale: number; // In hours
  averageTimeToMaxCap: number;
  salesByHourOfWindow: Record<number, number>; // { 0: 10, 1: 15, ... 72: 5 }
  
  // Market distribution
  salesByMarket: Record<string, number>;
  marketCapHits: Record<string, number>;
}
```

### 8.2 Reporting Query

```sql
-- Window outcome analysis
SELECT 
  status,
  COUNT(*) as count,
  AVG(total_purchases) as avg_purchases,
  AVG(EXTRACT(EPOCH FROM (archived_at - activated_at)) / 3600) as avg_window_hours
FROM listing_windows
WHERE archived_at IS NOT NULL
GROUP BY status;

-- Sales timing distribution
SELECT 
  FLOOR(EXTRACT(EPOCH FROM (t.purchased_at - lw.activated_at)) / 3600) as hour_of_window,
  COUNT(*) as purchases
FROM transactions t
JOIN listing_windows lw ON t.window_id = lw.id
GROUP BY hour_of_window
ORDER BY hour_of_window;
```

---

## 9. UI Components

### 9.1 Countdown Timer

```tsx
function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(
    new Date(expiresAt).getTime() - Date.now()
  );
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newRemaining = new Date(expiresAt).getTime() - Date.now();
      if (newRemaining <= 0) {
        clearInterval(interval);
        setRemaining(0);
      } else {
        setRemaining(newRemaining);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  
  const isUrgent = remaining < 6 * 60 * 60 * 1000;
  
  return (
    <div className={`countdown ${isUrgent ? 'urgent' : ''}`}>
      <span className="hours">{hours.toString().padStart(2, '0')}</span>:
      <span className="minutes">{minutes.toString().padStart(2, '0')}</span>:
      <span className="seconds">{seconds.toString().padStart(2, '0')}</span>
    </div>
  );
}
```

### 9.2 Stock Indicator

```tsx
function StockIndicator({ 
  remaining, 
  total 
}: { 
  remaining: number; 
  total: number;
}) {
  const percentRemaining = (remaining / total) * 100;
  
  let colorClass = 'stock-green';
  if (percentRemaining < 25) colorClass = 'stock-red';
  else if (percentRemaining < 50) colorClass = 'stock-yellow';
  
  return (
    <div className={`stock-indicator ${colorClass}`}>
      <div className="stock-bar">
        <div 
          className="stock-fill" 
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
      <span className="stock-text">
        {remaining} of {total} available
      </span>
    </div>
  );
}
```

---

## Related Documents

- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Table definitions
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md) - API routes
- [Evergreen Logic Deep Dive](./07_EVERGREEN_LOGIC.md) - Affects listing strategy

---

*This document provides exhaustive detail on rotation logic. Refer to specific component documents for related systems.*
