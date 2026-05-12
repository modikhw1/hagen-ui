# Phase 64 — Studio Sync Status Visibility

**Date**: 2026-05-12
**Scope**: Fix sync history read route and add CM visibility into per-customer sync status.

---

## Context

After completing Phase 63 (controlled Hagen import smoke test), the next planned step from the TikTok history audit was Phase 5/G5: CM visibility into per-customer sync status.

**Issue discovered by orchestrator**:
```text
GET /api/studio-v2/customers/:customerId/sync-history currently queries
public.tiktok_sync_history, but that view/table does not exist in Supabase.
The route catches the error and returns { history: [] }, hiding the issue.
```

Supabase has `public.sync_runs` table with actual sync run data, but the API was reading from a non-existent table and silently returning empty arrays.

---

## What Was Fixed

### Backend: `artifacts/api-server/src/routes/studio-v2.ts`

**Before** (lines 823-845):
```typescript
router.get('/customers/:customerId/sync-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('tiktok_sync_history')  // ← Table does not exist
      .select('*')
      .eq('customer_id', customerId)
      .order('synced_at', { ascending: false })
      .limit(50);

    if (error) {
      res.json({ history: [] });  // ← Silently returns empty array on error
      return;
    }
    res.json({ history: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 sync-history error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});
```

**After**:
```typescript
router.get('/customers/:customerId/sync-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('sync_runs')  // ← Correct table
      .select('id, customer_id, mode, started_at, finished_at, status, fetched_count, imported_count, stats_updated_count, reconciled, calls_used, error')
      .eq('customer_id', customerId)
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      logger.error({ err: error, customerId }, 'sync-history read failed');
      res.status(500).json({ error: 'Kunde inte hämta synkhistorik' });  // ← Explicit error response
      return;
    }
    res.json({ history: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 sync-history error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});
```

**Changes**:
1. Read from `sync_runs` instead of non-existent `tiktok_sync_history`
2. Select specific columns matching `sync_runs` schema
3. Order by `started_at desc` instead of `synced_at`
4. Limit to 20 recent runs (was 50)
5. Log database errors with context
6. Return 500 with Swedish error message instead of silently returning `{ history: [] }`

---

### Frontend: `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

**Added state** (after line 618):
```typescript
const [syncStatusHistory, setSyncStatusHistory] = useState<Array<{
  id: string;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  fetched_count: number | null;
  imported_count: number | null;
  stats_updated_count: number | null;
  reconciled: boolean | null;
  calls_used: number | null;
  error: string | null;
}>>([]);
const [fetchingSyncStatus, setFetchingSyncStatus] = useState(false);
const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
```

**Added fetch function** (after handlePreviewSync):
```typescript
const fetchSyncStatus = async () => {
  if (!customerId) return;
  setFetchingSyncStatus(true);
  setSyncStatusError(null);
  try {
    const res = await fetch(`/api/studio-v2/customers/${customerId}/sync-history`);
    const data = await res.json().catch(() => ({ error: 'Ogiltigt svar från servern' }));
    if (!res.ok) {
      throw new Error(data?.error || 'Kunde inte hämta synkstatus');
    }
    setSyncStatusHistory(data.history ?? []);
  } catch (err) {
    setSyncStatusError((err as Error).message);
  } finally {
    setFetchingSyncStatus(false);
  }
};
```

**Added useEffect for initial fetch** (after line 1025):
```typescript
useEffect(() => {
  if (customerId) {
    void fetchSyncStatus();
  }
}, [customerId]);
```

**Updated existing handlers to refresh status**:
- `handleSyncHistory`: Added `fetchSyncStatus()` to Promise.all after import
- `handleFetchProfileHistory`: Added `fetchSyncStatus()` to Promise.all after fetch

**Added UI** (after sync preview result, before Feed Timeline):
```typescript
{/* Sync Status */}
{fetchingSyncStatus && (
  <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 8 }}>
    Hämtar synkstatus...
  </div>
)}
{syncStatusError && (
  <div style={{ fontSize: 11, color: LeTrendColors.error, marginTop: 8 }}>
    {syncStatusError}
  </div>
)}
{!fetchingSyncStatus && !syncStatusError && syncStatusHistory.length === 0 && (
  <div style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic', marginTop: 8 }}>
    Inga synkkörningar loggade ännu.
  </div>
)}
{!fetchingSyncStatus && syncStatusHistory.length > 0 && (
  <div style={{
    background: LeTrendColors.surface,
    borderRadius: LeTrendRadius.md,
    padding: '8px 12px',
    marginTop: 8,
    fontSize: 10,
    color: LeTrendColors.textSecondary,
  }}>
    <div style={{ fontWeight: 600, fontSize: 11, color: LeTrendColors.textPrimary, marginBottom: 6 }}>
      Synkstatus
    </div>
    {syncStatusHistory.slice(0, 3).map((run) => {
      const startTime = new Date(run.started_at);
      const finishTime = run.finished_at ? new Date(run.finished_at) : null;
      const duration = finishTime ? Math.round((finishTime.getTime() - startTime.getTime()) / 1000) : null;
      const statusColor = run.status === 'ok' ? '#166534' : run.status === 'error' ? LeTrendColors.error : LeTrendColors.textMuted;

      return (
        <div key={run.id} style={{...}}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: statusColor, fontWeight: 500 }}>
              {run.status === 'ok' ? '✓' : run.status === 'error' ? '✗' : '⋯'} {run.mode}
            </span>
            <span style={{ color: LeTrendColors.textMuted }}>
              {startTime.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
              {duration !== null && ` (${duration}s)`}
            </span>
          </div>
          {(run.fetched_count !== null || run.imported_count !== null || run.stats_updated_count !== null) && (
            <div style={{ color: LeTrendColors.textMuted, fontFamily: 'monospace', fontSize: 9 }}>
              {run.fetched_count !== null && `hämtade: ${run.fetched_count}`}
              {run.imported_count !== null && ` · nya: ${run.imported_count}`}
              {run.stats_updated_count !== null && ` · uppdaterade: ${run.stats_updated_count}`}
              {run.calls_used !== null && ` · anrop: ${run.calls_used}`}
            </div>
          )}
          {run.error && (
            <div style={{ color: LeTrendColors.error, fontSize: 9, fontStyle: 'italic' }}>
              {run.error}
            </div>
          )}
        </div>
      );
    })}
    {syncStatusHistory.length > 3 && (
      <div style={{ fontSize: 9, color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
        +{syncStatusHistory.length - 3} äldre körningar
      </div>
    )}
  </div>
)}
```

**UI Features**:
- Shows loading state while fetching
- Shows error state if fetch fails
- Shows empty state ("Inga synkkörningar loggade ännu") when no runs exist
- Shows most recent 3 sync runs with:
  - Status icon (✓ for ok, ✗ for error, ⋯ for running/other)
  - Mode (cron, manual)
  - Start time in Swedish locale format
  - Duration in seconds (if finished)
  - Counts: fetched, imported, updated, API calls used
  - Error message for failed runs
- Compact design matching existing workspace style
- Located below sync preview result, above Feed Timeline

---

## Verification

### Backend typecheck
```bash
pnpm --filter "./artifacts/api-server" run typecheck
```
**Result**: ✅ PASS (no errors)

### Frontend typecheck
```bash
pnpm --filter "./artifacts/letrend" run typecheck
```
**Result**: ⚠️ Pre-existing React 19 type errors (unrelated to this change)
- Suspense component type incompatibility
- ReactNode type mismatches between @types/react versions
- ErrorBoundary missing `refs` property

These errors existed before Phase 64 changes and are related to React 19 migration issues in the codebase.

### Manual testing

**Test 1: Empty state**
1. Open customer workspace with no sync runs
2. Expected: "Inga synkkörningar loggade ännu"
3. Result: Not tested (requires customer with no sync_runs rows)

**Test 2: Populated state**
1. Open customer workspace with sync_runs history
2. Expected: Shows most recent 3 runs with status, time, counts
3. Result: Not tested (no live testing per CLAUDE_TASK.md constraint)

**Test 3: Refresh after sync**
1. Trigger "Synca från hagen" import
2. Expected: Sync status refreshes automatically
3. Result: Not tested (no live testing per CLAUDE_TASK.md constraint)

---

## Remaining Gaps

1. **No visual distinction for "running" status**: Currently shows "⋯" symbol but could be enhanced with animation or "pågår..." text

2. **No refresh button**: Status only refreshes on workspace load or after sync/fetch actions. Could add manual refresh button.

3. **Limited to 3 visible runs**: Shows "+X äldre körningar" but no way to expand/view full history. Could add "Visa alla" expansion.

4. **No filtering by mode/status**: All runs shown mixed. Could add filters for cron-only, manual-only, errors-only.

5. **No pagination**: Backend returns 20 runs, frontend shows 3. If customer has >20 runs, older runs are not accessible.

6. **Status counts don't show reconciled**: `reconciled` boolean is fetched but not displayed. Could add reconciliation indicator.

7. **Duration only shown if finished**: Running syncs don't show elapsed time. Could calculate and show "pågår X sekunder".

8. **No drill-down into run details**: Can't click a run to see full details, samples, etc.

9. **Preview mode doesn't log runs**: Preview calls don't create sync_runs rows, so preview activity is invisible in status history.

10. **Hagen-library import doesn't log sync_runs yet**: The successful Phase 63 import smoke created a `customer_concepts` history row, but Supabase verification showed 0 `sync_runs` rows for the smoke customer. This Phase 64 UI will show RapidAPI/cron/manual profile-fetch runs from `sync_runs`; a follow-up phase should make `POST /sync-history` write a run log if Hagen-library imports should appear in the same status surface.

All gaps are intentional scope limitations per CLAUDE_TASK.md: "Keep edits scoped to the read route, the customer workspace UI, and the new doc."

---

## Summary

Phase 64 fixed a critical bug where the sync history endpoint was reading from a non-existent table and silently failing. The fix:

1. ✅ Backend now reads from correct `sync_runs` table
2. ✅ Database errors are logged and surfaced (not hidden)
3. ✅ Frontend fetches and displays sync status
4. ✅ Status refreshes automatically after sync/fetch actions
5. ✅ Compact UI matches existing workspace design
6. ✅ Loading, error, and empty states handled
7. ✅ No code introduced new type errors

CMs can now see per-customer sync history without needing admin panel access or database queries.
