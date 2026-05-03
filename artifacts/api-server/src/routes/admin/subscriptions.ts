import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// GET /api/admin/subscriptions
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const page = Math.max(Number(req.query['page'] ?? 1), 1);
    const offset = (page - 1) * limit;
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const environment = typeof req.query['environment'] === 'string' ? req.query['environment'] : undefined;
    const customerProfileId = typeof req.query['customer_profile_id'] === 'string' ? req.query['customer_profile_id'] : undefined;

    let query = supabase
      .from('subscriptions')
      .select(
        'stripe_subscription_id, customer_profile_id, status, cancel_at_period_end, current_period_end, current_period_start, amount, created',
        { count: 'exact' },
      )
      .order('created', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = (query as any).eq('status', status);
    if (customerProfileId) query = (query as any).eq('customer_profile_id', customerProfileId);
    if (environment && environment !== 'all') query = (query as any).eq('environment', environment);

    const { data, error, count } = await query;

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ subscriptions: [], environment: environment ?? 'all', summary: null, pagination: { total: 0, page, limit, totalPages: 0 } });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    const total = count ?? 0;

    // Compute MRR summary from active subscriptions.
    let summary = { mrrOre: 0, activeCount: 0, mrr30dAgoOre: 0 };
    try {
      let summaryQuery = supabase
        .from('subscriptions')
        .select('status, amount, created');
      if (environment && environment !== 'all') summaryQuery = (summaryQuery as any).eq('environment', environment);
      const { data: allRows } = await summaryQuery;
      const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
      for (const row of (allRows ?? []) as Array<{ status: string | null; amount: number | null; created: string | null }>) {
        if ((row.status ?? '').toLowerCase() === 'active') {
          const amount = Number(row.amount ?? 0);
          summary.mrrOre += amount;
          summary.activeCount += 1;
          const createdMs = row.created ? Date.parse(row.created) : NaN;
          if (Number.isFinite(createdMs) && createdMs < thirtyDaysAgo) {
            summary.mrr30dAgoOre += amount;
          }
        }
      }
    } catch (e) {
      logger.warn(e, 'subscriptions summary derivation failed');
    }

    res.json({
      subscriptions: data ?? [],
      environment: environment ?? 'all',
      summary,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(err, 'subscriptions list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
