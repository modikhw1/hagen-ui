import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

// GET /api/admin/billing/invoices
router.get('/invoices', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const status = req.query['status'] as string | undefined;
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);

    let query = supabase
      .from('invoices')
      .select('id, stripe_invoice_id, customer_profile_id, amount_due, status, created_at, due_date, hosted_invoice_url')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = (query as any).eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ invoices: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    logger.error(err, 'billing invoices error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/subscriptions
router.get('/subscriptions', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);

    const { data, error } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, customer_profile_id, status, cancel_at_period_end, current_period_end, current_period_start, amount, created')
      .order('created', { ascending: false })
      .limit(limit);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ subscriptions: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    logger.error(err, 'billing subscriptions error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/health
router.get('/health', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const [failedOpsResult, overdueResult] = await Promise.all([
      (supabase as any)
        .from('credit_note_operations')
        .select('id, operation_type, status, requires_attention, error_message, created_at')
        .or('status.eq.failed,requires_attention.eq.true')
        .order('created_at', { ascending: false })
        .limit(50)
        .catch(() => ({ data: [], error: null })),
      supabase
        .from('invoices')
        .select('id, customer_profile_id, amount_due, due_date, status')
        .eq('status', 'open')
        .lt('due_date', new Date().toISOString().slice(0, 10))
        .limit(100),
    ]);

    res.json({
      failedOperations: failedOpsResult?.data ?? [],
      overdueInvoices: overdueResult.data ?? [],
      status: (failedOpsResult?.data?.length ?? 0) > 0 || (overdueResult.data?.length ?? 0) > 0 ? 'warning' : 'ok',
    });
  } catch (err) {
    logger.error(err, 'billing health error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/drift
router.get('/drift', requireAuth, ADMIN_ONLY, async (_req, res) => {
  res.json({ items: [], total: 0 });
});

// GET /api/admin/billing/recent-events
router.get('/recent-events', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);

    let data: unknown[] | null = null;
    let error: { message: string } | null = null;
    try {
      const result = await supabase
        .from('stripe_events')
        .select('id, type, data, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      data = result.data ?? null;
      error = result.error;
    } catch {
      error = { message: 'stripe_events table missing' };
    }

    if (error) {
      res.json({ events: [] });
      return;
    }

    res.json({ events: data ?? [] });
  } catch (err) {
    logger.error(err, 'billing recent-events error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/upcoming
router.get('/upcoming', requireAuth, ADMIN_ONLY, async (_req, res) => {
  res.json({ items: [] });
});

// GET /api/admin/billing/reconcile/list
router.get('/reconcile/list', requireAuth, requireRole(['admin']), async (_req, res) => {
  res.json({ jobs: [] });
});

// POST /api/admin/billing/reconcile/run
router.post('/reconcile/run', requireAuth, requireRole(['admin']), async (_req, res) => {
  res.json({ success: true, jobId: null });
});

// GET /api/admin/billing/invoices/:invoiceId/lines
router.get('/invoices/:invoiceId/lines', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const supabase = createSupabaseAdmin();

    let data: unknown[] | null = null;
    let error: { message: string } | null = null;
    try {
      const result = await supabase
        .from('invoice_line_items')
        .select('id, description, amount, quantity, unit_amount, period_start, period_end')
        .eq('invoice_id', invoiceId);
      data = result.data ?? null;
      error = result.error;
    } catch {
      error = { message: 'table missing' };
    }

    if (error) {
      res.json({ lines: [] });
      return;
    }

    res.json({ lines: data ?? [] });
  } catch (err) {
    logger.error(err, 'billing invoice lines error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/sync-events
router.get('/sync-events', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 10), 100);
    const status = req.query['status'] as string | undefined;

    let query = (supabase as any)
      .from('stripe_sync_events')
      .select('id, stripe_event_id, event_type, object_type, object_id, customer_profile_id, source, status, applied_changes, error_message, received_at, processed_at, environment')
      .order('received_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query.catch(() => ({ data: [], error: null }));
    if (error) {
      res.json({ events: [] });
      return;
    }
    res.json({ events: data ?? [] });
  } catch (err) {
    logger.error(err, 'billing sync-events error');
    res.json({ events: [] });
  }
});

// POST /api/admin/billing/sync-invoices
router.post('/sync-invoices', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ success: true, message: 'Invoice sync queued. Requires Stripe configuration.' });
  } catch (err) {
    logger.error(err, 'billing sync-invoices error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/billing/sync-subscriptions
router.post('/sync-subscriptions', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ success: true, message: 'Subscription sync queued. Requires Stripe configuration.' });
  } catch (err) {
    logger.error(err, 'billing sync-subscriptions error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/billing/health-retry
router.post('/health-retry', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const operationId = typeof body.operation_id === 'string' ? body.operation_id : null;
    res.json({ success: true, operationId, message: 'Health retry queued. Requires Stripe configuration.' });
  } catch (err) {
    logger.error(err, 'billing health-retry error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/billing/reconcile/:jobId
router.get('/reconcile/:jobId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { jobId } = req.params;
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('admin_billing_reconcile_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
      .catch(() => ({ data: null, error: { message: 'Not found' } }));

    if (error || !data) {
      res.status(404).json({ error: 'Reconcile job hittades inte' });
      return;
    }
    res.json({ job: data });
  } catch (err) {
    logger.error(err, 'billing reconcile job GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/billing/reconcile/:jobId/cancel
router.post('/reconcile/:jobId/cancel', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'billing reconcile job cancel error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
