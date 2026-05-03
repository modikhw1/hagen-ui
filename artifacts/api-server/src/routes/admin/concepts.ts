import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const CM_ONLY = requireRole(['admin']);
const ADMIN_ONLY = requireRole(['admin']);

// GET /api/admin/concepts
router.get('/', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const source = req.query['source'] as string | undefined;
    const isActive = req.query['is_active'] as string | undefined;
    const createdBy = req.query['created_by'] as string | undefined;
    const limit = Math.min(Number(req.query['limit'] ?? 100), 500);

    let query = supabase
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (source) query = (query as any).eq('source', source);
    if (isActive !== undefined) query = (query as any).eq('is_active', isActive === 'true');
    if (createdBy) query = (query as any).eq('created_by', createdBy);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concepts: data ?? [] });
  } catch (err) {
    logger.error(err, 'admin concepts GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/concepts
router.post('/', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const insert = {
      source: typeof body.source === 'string' ? body.source : 'cm_created',
      created_by: req.user!.id,
      backend_data: typeof body.backend_data === 'object' && body.backend_data ? body.backend_data : {},
      overrides: typeof body.overrides === 'object' && body.overrides ? body.overrides : {},
      is_active: typeof body.is_active === 'boolean' ? body.is_active : false,
      version: 1,
    };

    const { data, error } = await supabase
      .from('concepts')
      .insert(insert)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ concept: data });
  } catch (err) {
    logger.error(err, 'admin concepts POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/concepts/:id
router.get('/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('id', req.params['id'])
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Konceptet hittades inte' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'admin concept by id GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/admin/concepts/:id
router.patch('/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const allowed = ['backend_data', 'overrides', 'is_active', 'source'];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const { data, error } = await supabase
      .from('concepts')
      .update(patch)
      .eq('id', req.params['id'])
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'admin concept PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/admin/concepts/:id
router.delete('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('concepts')
      .update({ is_active: false })
      .eq('id', req.params['id']);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin concept DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/concepts/translate-vertex
router.post('/translate-vertex', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = process.env['HAGEN_BASE_URL']?.trim();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL not configured' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const upstream = await fetch(`${hagenBase}/api/admin/concepts/translate-vertex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'admin concepts translate-vertex error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
