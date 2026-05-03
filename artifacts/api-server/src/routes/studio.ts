import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();
const CM_ONLY = requireRole(['admin', 'content_manager']);

// POST /api/studio/concepts/analyze
// Proxies to Hagen analyze service
router.post('/concepts/analyze', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = process.env['HAGEN_BASE_URL']?.trim();
    if (!hagenBase) {
      res.status(503).json({ error: 'Analystjänsten är inte konfigurerad. Sätt HAGEN_BASE_URL.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
    if (!videoUrl) {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    const upstream = await fetch(`${hagenBase}/api/studio/concepts/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl }),
      signal: AbortSignal.timeout(30000),
    });

    const payload = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(payload);
  } catch (err) {
    logger.error(err, 'studio concepts analyze error');
    res.status(500).json({ error: 'Analys misslyckades' });
  }
});

// POST /api/studio/concepts/enrich
router.post('/concepts/enrich', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = process.env['HAGEN_BASE_URL']?.trim();
    if (!hagenBase) {
      res.status(503).json({ error: 'Analystjänsten är inte konfigurerad. Sätt HAGEN_BASE_URL.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    if (!body.backend_data || typeof body.backend_data !== 'object') {
      res.status(400).json({ error: 'backend_data is required' });
      return;
    }

    const upstream = await fetch(`${hagenBase}/api/studio/concepts/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend_data: body.backend_data }),
      signal: AbortSignal.timeout(30000),
    });

    const payload = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(payload);
  } catch (err) {
    logger.error(err, 'studio concepts enrich error');
    res.status(500).json({ error: 'Berikning misslyckades' });
  }
});

// GET /api/studio/email/schedules
router.get('/email/schedules', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const customerId = req.query['customer_id'] as string | undefined;

    let query = (supabase as any)
      .from('email_schedules')
      .select('*')
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_profile_id', customerId);
    }

    const { data, error } = await query;
    if (error) {
      logger.warn({ err: error }, 'email_schedules table missing or error');
      res.json({ schedules: [] });
      return;
    }
    res.json({ schedules: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio email schedules GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio/email/schedules
router.post('/email/schedules', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const customerProfileId = typeof body.customer_profile_id === 'string' ? body.customer_profile_id.trim() : '';
    if (!customerProfileId) {
      res.status(400).json({ error: 'customer_profile_id is required' });
      return;
    }

    const insert = {
      customer_profile_id: customerProfileId,
      schedule_type: typeof body.schedule_type === 'string' ? body.schedule_type : 'weekly',
      day_of_week: typeof body.day_of_week === 'number' ? body.day_of_week : null,
      send_time: typeof body.send_time === 'string' ? body.send_time : null,
      rules: typeof body.rules === 'object' && body.rules ? body.rules : {},
      email_subject: typeof body.email_subject === 'string' ? body.email_subject : null,
      email_intro: typeof body.email_intro === 'string' ? body.email_intro : null,
      email_outro: typeof body.email_outro === 'string' ? body.email_outro : null,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    };

    const { data, error } = await (supabase as any)
      .from('email_schedules')
      .insert(insert)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ schedule: data });
  } catch (err) {
    logger.error(err, 'studio email schedules POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PUT /api/studio/email/schedules/:id
router.put('/email/schedules/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const allowed = ['schedule_type', 'day_of_week', 'send_time', 'rules', 'email_subject', 'email_intro', 'email_outro', 'is_active'];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await (supabase as any)
      .from('email_schedules')
      .update(patch)
      .eq('id', req.params['id'])
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ schedule: data });
  } catch (err) {
    logger.error(err, 'studio email schedules PUT error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/studio/email/schedules/:id
router.delete('/email/schedules/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await (supabase as any)
      .from('email_schedules')
      .delete()
      .eq('id', req.params['id']);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio email schedules DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
