import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

const DEFAULT_SETTINGS = {
  default_billing_interval: 'month' as const,
  default_payment_terms_days: 30,
  default_currency: 'SEK',
  default_commission_rate: 0.3,
  updated_at: null,
};

// GET /api/admin/settings
router.get('/', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await (supabase as any)
      .from('admin_settings')
      .select(
        'default_billing_interval, default_payment_terms_days, default_currency, default_commission_rate, updated_at',
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ settings: DEFAULT_SETTINGS, schemaWarnings: ['Tabellen admin_settings saknas'] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      settings: data ?? DEFAULT_SETTINGS,
      schemaWarnings: [],
    });
  } catch (err) {
    logger.error(err, 'settings get error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/admin/settings
router.patch('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};

    const updates: Record<string, any> = {};
    if (body.default_billing_interval !== undefined)
      updates['default_billing_interval'] = body.default_billing_interval;
    if (body.default_payment_terms_days !== undefined)
      updates['default_payment_terms_days'] = body.default_payment_terms_days;
    if (body.default_currency !== undefined)
      updates['default_currency'] = String(body.default_currency).toUpperCase();
    if (body.default_commission_rate !== undefined)
      updates['default_commission_rate'] = body.default_commission_rate;
    if (body.default_commission_rate_percent !== undefined)
      updates['default_commission_rate'] = body.default_commission_rate_percent / 100;

    updates['updated_at'] = new Date().toISOString();

    // Upsert since there may be only one row
    const { data, error } = await (supabase as any)
      .from('admin_settings')
      .upsert({ id: 1, ...updates })
      .select(
        'default_billing_interval, default_payment_terms_days, default_currency, default_commission_rate, updated_at',
      )
      .single();

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ settings: { ...DEFAULT_SETTINGS, ...updates }, schemaWarnings: ['Tabellen admin_settings saknas'] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ settings: data, schemaWarnings: [] });
  } catch (err) {
    logger.error(err, 'settings patch error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
