import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

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
      .from('audit_log')
      .select(
        'id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
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
        res.json({ entries: [], nextCursor: null, facets: { actors: [], actions: [], entities: [] }, schemaWarnings: ['Tabellen audit_log saknas'] });
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

    res.json({
      entries,
      nextCursor,
      facets,
      viewer: { email: req.user?.email ?? null },
      schemaWarnings: [],
    });
  } catch (err) {
    logger.error(err, 'audit-log list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/audit-log/export?format=csv|json — streams filtered rows.
// Uses the same filters as the list endpoint, capped at 5000 rows.
router.get('/export', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const format = req.query['format'] === 'json' ? 'json' : 'csv';
    const actor = typeof req.query['actor'] === 'string' ? req.query['actor'] : undefined;
    const action = typeof req.query['action'] === 'string' ? req.query['action'] : undefined;
    const entity = typeof req.query['entity'] === 'string' ? req.query['entity'] : undefined;
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
    const onlyErrors = req.query['onlyErrors'] === '1' || req.query['onlyErrors'] === 'true';
    const billingOnly = req.query['billingOnly'] === '1' || req.query['billingOnly'] === 'true';

    let query = (supabase as any)
      .from('audit_log')
      .select(
        'id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(5000);

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

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = data ?? [];
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.json"`);
      res.send(JSON.stringify(rows, null, 2));
      return;
    }

    const cols = [
      'created_at', 'actor_email', 'actor_role', 'action',
      'entity_type', 'entity_id', 'before_state', 'after_state', 'metadata',
    ];
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const row of rows as Array<Record<string, unknown>>) {
      lines.push(cols.map((c) => escape(row[c])).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    logger.error(err, 'audit-log export error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/audit-log/:id — single entry detail for the diff modal.
router.get('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { id } = req.params;
    const { data, error } = await (supabase as any)
      .from('audit_log')
      .select(
        'id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Audit-post hittades inte' });
      return;
    }
    res.json({ entry: data });
  } catch (err) {
    logger.error(err, 'audit-log detail error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
