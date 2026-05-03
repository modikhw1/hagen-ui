import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// GET /api/admin/invoices
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const page = Math.max(Number(req.query['page'] ?? 1), 1);
    const offset = (page - 1) * limit;
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
    const environment = typeof req.query['environment'] === 'string' ? req.query['environment'] : undefined;
    const customerProfileId =
      typeof req.query['customer_profile_id'] === 'string' ? req.query['customer_profile_id']
      : typeof req.query['customerProfileId'] === 'string' ? req.query['customerProfileId']
      : undefined;

    let query = supabase
      .from('invoices')
      .select(
        'id, stripe_invoice_id, customer_profile_id, amount_due, amount_paid, status, created_at, due_date, hosted_invoice_url, currency',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = (query as any).eq('status', status);
    if (customerProfileId) query = (query as any).eq('customer_profile_id', customerProfileId);
    if (from) query = (query as any).gte('created_at', from);
    if (to) query = (query as any).lte('created_at', to + 'T23:59:59Z');
    if (environment && environment !== 'all') query = (query as any).eq('environment', environment);

    const { data, error, count } = await query;

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ invoices: [], environment: environment ?? 'all', pagination: { total: 0, page, limit, totalPages: 0 }, summary: null });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    const total = count ?? 0;

    // Compute summary across all invoices (not just current page).
    let summary = { openOre: 0, paidOre: 0, invoicesNeedingActionCount: 0 };
    try {
      let summaryQuery = supabase
        .from('invoices')
        .select('amount_due, amount_paid, status');
      if (customerProfileId) summaryQuery = (summaryQuery as any).eq('customer_profile_id', customerProfileId);
      if (environment && environment !== 'all') summaryQuery = (summaryQuery as any).eq('environment', environment);
      const { data: allRows } = await summaryQuery;
      for (const row of (allRows ?? []) as Array<{ amount_due: number | null; amount_paid: number | null; status: string | null }>) {
        const status = (row.status ?? '').toLowerCase();
        if (status === 'open' || status === 'past_due') {
          summary.openOre += Number(row.amount_due ?? 0);
        }
        if (status === 'paid') {
          summary.paidOre += Number(row.amount_paid ?? row.amount_due ?? 0);
        }
        if (status === 'open' || status === 'past_due' || status === 'uncollectible') {
          summary.invoicesNeedingActionCount += 1;
        }
      }
    } catch (e) {
      logger.warn(e, 'invoices summary derivation failed');
    }

    res.json({
      invoices: data ?? [],
      environment: environment ?? 'all',
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary,
    });
  } catch (err) {
    logger.error(err, 'invoices list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
