import { Router } from 'express';
import customersRouter from './customers.js';
import overviewRouter from './overview.js';
import costsRouter from './costs.js';
import billingRouter from './billing.js';
import teamRouter from './team.js';
import auditRouter from './audit.js';
import demosRouter from './demos.js';
import payrollRouter from './payroll.js';
import settingsRouter from './settings.js';
import invoicesRouter from './invoices.js';
import subscriptionsRouter from './subscriptions.js';
import tiktokRouter from './tiktok.js';
import conceptsRouter from './concepts.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { deriveAttention } from '../../lib/admin-derive/attention.js';
import { getLastSeenAt, markSeen, type SeenSurface } from '../../lib/admin-derive/last-seen.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// Core resource routers
router.use('/customers', customersRouter);
router.use('/overview', overviewRouter);
// /overview/costs and /costs/refresh — see admin/costs.ts
router.use('/', costsRouter);
router.use('/billing', billingRouter);
router.use('/team', teamRouter);
router.use('/audit-log', auditRouter);
router.use('/demos', demosRouter);
router.use('/payroll', payrollRouter);
router.use('/settings', settingsRouter);
router.use('/invoices', invoicesRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/tiktok', tiktokRouter);

// Account managers
router.use('/account-managers', teamRouter);

// Concepts library (admin/CM)
router.use('/concepts', conceptsRouter);

// GET /api/admin/cron-runs — TikTok sync health: last 10 sync_runs + customers
// whose latest sync errored. Read-only.
router.get('/cron-runs', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const [cronRunsResult, customerRunsResult, failedResult] = await Promise.all([
      (supabase as any)
        .from('cron_run_log')
        .select('id, started_at, finished_at, processed, imported, stats_updated, calls_used, budget_remaining, budget_exceeded, stale_locks_cleared, errors')
        .order('started_at', { ascending: false })
        .limit(10),
      (supabase as any)
        .from('sync_runs')
        .select('id, customer_id, mode, started_at, finished_at, status, fetched_count, imported_count, stats_updated_count, calls_used, error')
        .order('started_at', { ascending: false })
        .limit(20),
      supabase
        .from('customer_profiles')
        .select('id, business_name, tiktok_handle, last_history_sync_at, last_sync_error')
        .not('last_sync_error', 'is', null)
        .order('last_history_sync_at', { ascending: false })
        .limit(50),
    ]);
    if (cronRunsResult.error || customerRunsResult.error || failedResult.error) {
      res.status(500).json({
        error: cronRunsResult.error?.message || customerRunsResult.error?.message || failedResult.error?.message || 'cron_runs_query_failed',
      });
      return;
    }
    res.json({
      recent_cron_invocations: cronRunsResult.data ?? [],
      recent_customer_runs: customerRunsResult.data ?? [],
      failed_customers: failedResult.data ?? [],
    });
  } catch (err) {
    logger.error(err, 'admin cron-runs error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// Notifications — driven by the shared attention derive so /admin overview
// and /admin/notifications stay in sync. The bell badge counts open items
// newer than the per-admin "last seen" timestamp for the notifications surface.

router.get('/notifications', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const adminId = req.user?.id ?? null;
    const [{ open, snoozed }, lastSeenAt] = await Promise.all([
      deriveAttention(supabase),
      adminId ? getLastSeenAt(supabase, adminId, 'notifications') : Promise.resolve(null),
    ]);

    const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
    const unreadCount = open.filter((it) => {
      const ts = itemTimestampMs(it);
      return !lastSeenAt || (ts !== null && ts > lastSeenMs);
    }).length;

    res.json({
      items: open,
      snoozedItems: snoozed,
      unreadCount,
      totalCount: open.length,
      snoozedCount: snoozed.length,
      lastSeenAt,
    });
  } catch (err) {
    logger.error(err, 'admin notifications GET error');
    res.json({
      items: [],
      snoozedItems: [],
      unreadCount: 0,
      totalCount: 0,
      snoozedCount: 0,
      lastSeenAt: null,
    });
  }
});

router.post('/notifications/mark-seen', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.json({ success: true, lastSeenAt: null });
      return;
    }
    const surfaceRaw = (req.body as Record<string, unknown> | undefined)?.surface;
    const surface: SeenSurface =
      surfaceRaw === 'overview' ? 'overview' : 'notifications';
    const supabase = createSupabaseAdmin();
    const lastSeenAt = await markSeen(supabase, adminId, surface);
    res.json({ success: true, surface, lastSeenAt });
  } catch (err) {
    logger.error(err, 'admin notifications mark-seen error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/notifications/:id/read', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { id } = req.params;
    await (supabase as any)
      .from('cm_notifications')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by_admin_id: req.user?.id ?? null,
      })
      .eq('id', id);
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin notification mark read error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/notifications/unread-count', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const adminId = req.user?.id ?? null;
    const [{ open }, lastSeenAt] = await Promise.all([
      deriveAttention(supabase),
      adminId ? getLastSeenAt(supabase, adminId, 'notifications') : Promise.resolve(null),
    ]);
    const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
    const count = open.filter((it) => {
      const ts = itemTimestampMs(it);
      return !lastSeenAt || (ts !== null && ts > lastSeenMs);
    }).length;
    res.json({ count, fetchedAt: new Date().toISOString() });
  } catch (err) {
    logger.error(err, 'admin notifications unread-count error');
    res.json({ count: 0, fetchedAt: new Date().toISOString() });
  }
});

function itemTimestampMs(item: any): number | null {
  switch (item.kind) {
    case 'cm_notification':
    case 'credit_note_failed':
      return item.createdAt ? Date.parse(item.createdAt) : null;
    case 'demo_responded':
      return item.respondedAt ? Date.parse(item.respondedAt) : null;
    case 'cm_change_due_today':
      return item.effectiveDate ? Date.parse(item.effectiveDate) : null;
    case 'pause_resume_due_today':
      return item.resumeDate ? Date.parse(item.resumeDate) : null;
    case 'invoice_unpaid':
      return Date.now() - Number(item.daysPastDue ?? 0) * 86_400_000;
    case 'onboarding_stuck':
      return Date.now() - Number(item.daysSinceCmReady ?? 0) * 86_400_000;
    case 'customer_blocked':
      return Date.now() - Number(item.daysBlocked ?? 0) * 86_400_000;
    case 'cm_low_activity':
      return Date.now() - 7 * 86_400_000;
    default:
      return null;
  }
}


// POST /api/admin/attention/:subjectType/:subjectId/snooze
router.post('/attention/:subjectType/:subjectId/snooze', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const snoozedUntil = typeof body.snoozed_until === 'string' ? body.snoozed_until : null;

    const { error } = await (supabase as any)
      .from('attention_snoozes')
      .upsert({
        subject_type: subjectType,
        subject_id: subjectId,
        snoozed_until: snoozedUntil,
        snoozed_by_admin_id: req.user?.id ?? null,
        snoozed_at: new Date().toISOString(),
      }, { onConflict: 'subject_type,subject_id' });

    if (error) {
      res.status(500).json({ error: (error as any).message });
      return;
    }
    res.json({ success: true, subjectType, subjectId, snoozedUntil });
  } catch (err) {
    logger.error(err, 'admin attention snooze error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/attention/:subjectType/:subjectId/snooze
router.get('/attention/:subjectType/:subjectId/snooze', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const supabase = createSupabaseAdmin();
    const { data } = await (supabase as any)
      .from('attention_snoozes')
      .select('subject_type, subject_id, snoozed_until, snoozed_by_admin_id, snoozed_at')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .maybeSingle()
;

    res.json({ snooze: data ?? null });
  } catch (err) {
    logger.error(err, 'admin attention snooze GET error');
    res.json({ snooze: null });
  }
});

// DELETE /api/admin/attention/:subjectType/:subjectId/snooze
router.delete('/attention/:subjectType/:subjectId/snooze', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const supabase = createSupabaseAdmin();
    await (supabase as any)
      .from('attention_snoozes')
      .delete()
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .catch(() => null);

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin attention snooze DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
