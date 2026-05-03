import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

// GET /api/admin/audit-log
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : null;
    const actor = typeof req.query['actor'] === 'string' ? req.query['actor'] : undefined;
    const action = typeof req.query['action'] === 'string' ? req.query['action'] : undefined;
    const entity = typeof req.query['entity'] === 'string' ? req.query['entity'] : undefined;
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
    const onlyErrors = req.query['onlyErrors'] === '1' || req.query['onlyErrors'] === 'true';
    const billingOnly = req.query['billingOnly'] === '1' || req.query['billingOnly'] === 'true';

    let query = (supabase as any)
      .from('admin_audit_log')
      .select(
        'id, actor_email, actor_role, action, entity_type, entity_id, entity_label, before_state, after_state, metadata, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (actor) query = query.ilike('actor_email', `%${actor}%`);
    if (action) query = query.ilike('action', `%${action}%`);
    if (entity) query = query.eq('entity_type', entity);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to + 'T23:59:59Z');
    if (onlyErrors) query = query.ilike('action', '%fail%');
    if (billingOnly) {
      query = query.or(
        'action.ilike.%invoice%,action.ilike.%billing%,action.ilike.%subscription%,action.ilike.%reconcile%',
      );
    }
    if (cursor) {
      const [cursorDate, cursorId] = cursor.split('|');
      if (cursorDate && cursorId) {
        query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
      }
    }

    const { data, error } = await query;

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) {
        res.json({ entries: [], nextCursor: null, facets: { actors: [], actions: [], entities: [] }, schemaWarnings: ['Tabellen admin_audit_log saknas'] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    const entries = data ?? [];
    const nextCursor =
      entries.length === limit
        ? `${entries[entries.length - 1]?.created_at}|${entries[entries.length - 1]?.id}`
        : null;

    const facets = {
      actors: Array.from(new Set(entries.map((e: any) => e.actor_email).filter(Boolean))) as string[],
      actions: Array.from(new Set(entries.map((e: any) => e.action))) as string[],
      entities: Array.from(new Set(entries.map((e: any) => e.entity_type))) as string[],
    };

    res.json({ entries, nextCursor, facets, schemaWarnings: [] });
  } catch (err) {
    logger.error(err, 'audit-log list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
