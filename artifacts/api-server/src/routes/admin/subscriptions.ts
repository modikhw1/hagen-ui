import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

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

    res.json({
      subscriptions: data ?? [],
      environment: environment ?? 'all',
      summary: null,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(err, 'subscriptions list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
