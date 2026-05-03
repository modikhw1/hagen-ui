import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { invalidateServicePricingCache } from '../../lib/service-usage.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

const ALLOWED_SOURCES = new Set(['measured', 'estimate', 'missing']);

// GET /api/admin/pricing — list all service_pricing rows.
router.get('/', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('service_pricing')
      .select('service, unit, price_ore, source, notes, updated_at')
      .order('service', { ascending: true })
      .order('unit', { ascending: true });

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) {
        res.json({ rows: [], schemaWarnings: ['Tabellen service_pricing saknas'] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ rows: data ?? [], schemaWarnings: [] });
  } catch (err) {
    logger.error(err, 'admin pricing GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/admin/pricing/:service/:unit — update price_ore (and optional notes/source).
router.patch('/:service/:unit', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { service, unit } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (body['price_ore'] !== undefined) {
      const priceNum = Number(body['price_ore']);
      if (!Number.isFinite(priceNum) || priceNum < 0 || !Number.isInteger(priceNum)) {
        res.status(400).json({ error: 'price_ore måste vara ett icke-negativt heltal (öre).' });
        return;
      }
      updates['price_ore'] = priceNum;
    }
    if (body['source'] !== undefined) {
      const source = String(body['source']);
      if (!ALLOWED_SOURCES.has(source)) {
        res.status(400).json({ error: `source måste vara en av: ${[...ALLOWED_SOURCES].join(', ')}` });
        return;
      }
      updates['source'] = source;
    }
    if (body['notes'] !== undefined) {
      updates['notes'] = body['notes'] === null ? null : String(body['notes']);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Inga fält att uppdatera.' });
      return;
    }

    updates['updated_at'] = new Date().toISOString();

    const supabase = createSupabaseAdmin();

    // Read existing row first so we can record before/after in the audit log.
    const { data: before, error: selError } = await (supabase as any)
      .from('service_pricing')
      .select('service, unit, price_ore, source, notes, updated_at')
      .eq('service', service)
      .eq('unit', unit)
      .maybeSingle();

    if (selError) {
      const msg = String(selError.message ?? '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) {
        res.status(404).json({ error: 'Tabellen service_pricing saknas' });
        return;
      }
      res.status(500).json({ error: selError.message });
      return;
    }

    if (!before) {
      res.status(404).json({ error: 'Hittade ingen prisrad för (service, unit).' });
      return;
    }

    const { data: after, error: updError } = await (supabase as any)
      .from('service_pricing')
      .update(updates)
      .eq('service', service)
      .eq('unit', unit)
      .select('service, unit, price_ore, source, notes, updated_at')
      .single();

    if (updError) {
      res.status(500).json({ error: updError.message });
      return;
    }

    invalidateServicePricingCache();

    // Best-effort audit log entry. Failures here must not break the save.
    try {
      const { error: auditErr } = await (supabase as any).from('audit_log').insert({
        actor_user_id: req.user?.id ?? null,
        actor_email: req.user?.email ?? null,
        actor_role: req.user?.role ?? 'admin',
        action: 'admin.service_pricing.updated',
        entity_type: 'service_pricing',
        entity_id: `${service}:${unit}`,
        before_state: before,
        after_state: after,
        metadata: { service, unit },
      });
      if (auditErr) {
        logger.warn({ err: auditErr.message }, 'audit_log insert failed for service_pricing.updated');
      }
    } catch (auditErr) {
      logger.warn({ err: auditErr }, 'audit_log insert exception for service_pricing.updated');
    }

    res.json({ row: after });
  } catch (err) {
    logger.error(err, 'admin pricing PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
