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
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';

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

// Account managers (uses team available endpoint)
router.use('/account-managers', teamRouter);

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

export default router;
