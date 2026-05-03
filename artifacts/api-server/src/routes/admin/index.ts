import { Router } from 'express';
import customersRouter from './customers.js';
import overviewRouter from './overview.js';
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

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

// Core resource routers
router.use('/customers', customersRouter);
router.use('/overview', overviewRouter);
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

// Notifications
router.get('/notifications', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 20), 100);

    const { data, error } = await (supabase as any)
      .from('admin_audit_log')
      .select('id, actor_email, action, entity_type, entity_id, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      res.json({ notifications: [], items: [], unreadCount: 0, totalCount: 0, snoozedCount: 0, snoozedItems: [], lastSeenAt: null });
      return;
    }

    res.json({
      notifications: data ?? [],
      items: data ?? [],
      unreadCount: 0,
      totalCount: (data ?? []).length,
      snoozedCount: 0,
      snoozedItems: [],
      lastSeenAt: null,
    });
  } catch {
    res.json({ notifications: [], items: [], unreadCount: 0, totalCount: 0, snoozedCount: 0, snoozedItems: [], lastSeenAt: null });
  }
});

router.post('/notifications/mark-seen', requireAuth, ADMIN_ONLY, (_req, res) => {
  res.json({ success: true });
});

router.get('/notifications/unread-count', requireAuth, ADMIN_ONLY, (_req, res) => {
  res.json({ count: 0, fetchedAt: new Date().toISOString() });
});

// Service costs alias (used by some hooks)
router.get('/service-costs', requireAuth, ADMIN_ONLY, (_req, res) => {
  res.json({ entries: [], totalOre: 0 });
});

// POST /api/admin/attention/:subjectType/:subjectId/snooze
router.post('/attention/:subjectType/:subjectId/snooze', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const snoozedUntil = typeof body.snoozed_until === 'string' ? body.snoozed_until : null;

    const { error } = await (supabase as any)
      .from('admin_attention_snoozes')
      .upsert({
        subject_type: subjectType,
        subject_id: subjectId,
        snoozed_until: snoozedUntil,
        snoozed_by: req.user?.id ?? null,
        updated_at: new Date().toISOString(),
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
      .from('admin_attention_snoozes')
      .select('subject_type, subject_id, snoozed_until, snoozed_by, updated_at')
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
      .from('admin_attention_snoozes')
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
