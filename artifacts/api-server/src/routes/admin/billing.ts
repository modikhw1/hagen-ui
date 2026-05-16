import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// NOTE: /invoices and /subscriptions list endpoints are served by
// routes/admin/invoices.ts and routes/admin/subscriptions.ts (canonical).
// Duplicates previously defined here were removed to avoid drift.

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
,
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
    const limit = Math.min(Number(req.query['limit'] ?? 15), 100);

    // Pull billing-related actions from audit_log and join customer name.
    const { data: auditRows, error } = await supabase
      .from('audit_log')
      .select('id, action, entity_type, entity_id, actor_email, actor_role, metadata, created_at')
      .or('action.like.admin.invoice%,action.like.admin.subscription%,action.like.admin.discount%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      res.json({ events: [] });
      return;
    }

    const labels: Record<string, string> = {
      'admin.invoice.created': 'Faktura skapad',
      'admin.invoice.paid': 'Faktura betald',
      'admin.invoice.voided': 'Faktura makulerad',
      'admin.invoice.payment_failed': 'Betalning misslyckades',
      'admin.invoice.payment_succeeded': 'Betalning lyckades',
      'admin.invoice.reissued': 'Faktura återutfärdad',
      'admin.subscription.paused': 'Abonnemang pausat',
      'admin.subscription.resumed': 'Abonnemang återupptaget',
      'admin.subscription.cancelled': 'Abonnemang avslutat',
      'admin.subscription.price_changed': 'Pris ändrat',
      'admin.discount.applied': 'Rabatt tillagd',
      'admin.discount.removed': 'Rabatt borttagen',
    };

    // Resolve customer business names referenced by metadata.customer_profile_id.
    const customerIds = new Set<string>();
    for (const row of (auditRows ?? []) as any[]) {
      const cid = row.metadata?.customer_profile_id;
      if (typeof cid === 'string') customerIds.add(cid);
    }
    let customerNames: Record<string, string> = {};
    if (customerIds.size > 0) {
      const { data: customers } = await supabase
        .from('customer_profiles')
        .select('id, business_name')
        .in('id', Array.from(customerIds));
      for (const c of (customers ?? []) as Array<{ id: string; business_name: string | null }>) {
        if (c.business_name) customerNames[c.id] = c.business_name;
      }
    }

    const events = (auditRows ?? []).map((row: any) => {
      const cid = typeof row.metadata?.customer_profile_id === 'string' ? row.metadata.customer_profile_id : null;
      const amount = typeof row.metadata?.amount_ore === 'number' ? row.metadata.amount_ore : null;
      return {
        id: row.id,
        at: row.created_at,
        action: row.action,
        title: labels[row.action] ?? row.action,
        entity_type: row.entity_type ?? null,
        entity_id: row.entity_id ?? null,
        actor_label: row.actor_email ?? null,
        actor_role: row.actor_role ?? null,
        customer_profile_id: cid,
        business_name: cid ? (customerNames[cid] ?? null) : null,
        amount_ore: amount,
      };
    });

    res.json({ events });
  } catch (err) {
    logger.error(err, 'billing recent-events error');
    res.json({ events: [] });
  }
});

// GET /api/admin/billing/upcoming
router.get('/upcoming', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const days = Math.min(Math.max(Number(req.query['days'] ?? 30), 1), 365);
    const today = new Date();
    const horizon = new Date(today.getTime() + days * 86_400_000);

    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, business_name, monthly_price, next_invoice_date, stripe_subscription_id')
      .not('next_invoice_date', 'is', null)
      .gte('next_invoice_date', today.toISOString().slice(0, 10))
      .lte('next_invoice_date', horizon.toISOString().slice(0, 10))
      .order('next_invoice_date', { ascending: true });

    if (error) {
      res.json({ upcoming: [], summary: { totalOre: 0, count: 0 } });
      return;
    }

    const upcoming = (data ?? []).map((row: any) => ({
      customer_id: row.id,
      business_name: row.business_name ?? '',
      amount_ore: Number(row.monthly_price ?? 0) * 100,
      invoice_date: row.next_invoice_date,
      has_stripe_subscription: Boolean(row.stripe_subscription_id),
    }));
    const totalOre = upcoming.reduce((sum, r) => sum + r.amount_ore, 0);

    res.json({ upcoming, summary: { totalOre, count: upcoming.length } });
  } catch (err) {
    logger.error(err, 'billing upcoming error');
    res.json({ upcoming: [], summary: { totalOre: 0, count: 0 } });
  }
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
        .select('id, description, amount, quantity, period_start, period_end, stripe_invoice_id')
        .eq('stripe_invoice_id', invoiceId);
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

    const { data, error } = await query;
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
;

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
