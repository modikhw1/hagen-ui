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
async function buildNotificationItems(req: any) {
  const supabase = createSupabaseAdmin();
  const limit = Math.min(Number(req.query?.['limit'] ?? 50), 100);

  const { data: rows } = await (supabase as any)
    .from('cm_notifications')
    .select('id, from_cm_id, customer_id, message, priority, created_at, resolved_at')
    .is('resolved_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const list = (rows ?? []) as any[];

  // Lookup CM names
  const cmIds = Array.from(new Set(list.map((r) => r.from_cm_id).filter(Boolean)));
  const cmNameById = new Map<string, string>();
  if (cmIds.length > 0) {
    const { data: members } = await (supabase as any)
      .from('team_members')
      .select('id, name')
      .in('id', cmIds);
    for (const m of members ?? []) cmNameById.set(m.id, m.name ?? '');
  }

  const ids = list.map((r) => r.id);
  const snoozedIds = new Set<string>();
  if (ids.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: snoozes } = await (supabase as any)
      .from('attention_snoozes')
      .select('subject_id, snoozed_until, released_at')
      .eq('subject_type', 'cm_notification')
      .in('subject_id', ids);
    for (const s of (snoozes ?? []) as any[]) {
      const stillSnoozed =
        !s.released_at && (!s.snoozed_until || s.snoozed_until > nowIso);
      if (stillSnoozed) snoozedIds.add(s.subject_id);
    }
  }

  const all = list.map((r) => ({
    kind: 'cm_notification' as const,
    id: String(r.id),
    subjectType: 'cm_notification' as const,
    subjectId: String(r.id),
    priority: r.priority === 'urgent' ? ('urgent' as const) : ('normal' as const),
    createdAt: r.created_at,
    from: cmNameById.get(r.from_cm_id) ?? 'Okänd',
    message: r.message ?? '',
    customerId: r.customer_id ?? null,
    cmName: cmNameById.get(r.from_cm_id) ?? undefined,
  }));

  const items = all.filter((it) => !snoozedIds.has(it.id));
  const snoozedItems = all.filter((it) => snoozedIds.has(it.id));
  return { items, snoozedItems };
}

router.get('/notifications', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { items, snoozedItems } = await buildNotificationItems(req);
    res.json({
      items,
      snoozedItems,
      unreadCount: items.length,
      totalCount: items.length,
      snoozedCount: snoozedItems.length,
      lastSeenAt: null,
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

router.post('/notifications/mark-seen', requireAuth, ADMIN_ONLY, (_req, res) => {
  res.json({ success: true });
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

router.get('/notifications/unread-count', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { count } = await (supabase as any)
      .from('cm_notifications')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null);
    res.json({ count: count ?? 0, fetchedAt: new Date().toISOString() });
  } catch {
    res.json({ count: 0, fetchedAt: new Date().toISOString() });
  }
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
