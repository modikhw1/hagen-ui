import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureCustomerAccess } from '../middleware/cm-access.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { proxyHagenJson } from '../lib/upstream-proxy.js';

const router = Router();
const CM_ONLY = requireRole(['admin', 'content_manager']);

// ---------------------------------------------------------------------------
// Per-user sliding-window rate limiter for the expensive analyze route.
// Allows up to ANALYZE_LIMIT requests per ANALYZE_WINDOW_MS per user.
// ---------------------------------------------------------------------------
const ANALYZE_LIMIT = 5;
const ANALYZE_WINDOW_MS = 60_000; // 1 minute

const analyzeTimestamps = new Map<string, number[]>();

// Evict stale keys every 5 minutes so the map doesn't grow unboundedly in
// long-lived single-instance deployments where users stop calling the endpoint.
setInterval(() => {
  const windowStart = Date.now() - ANALYZE_WINDOW_MS;
  for (const [userId, timestamps] of analyzeTimestamps) {
    const fresh = timestamps.filter((t) => t > windowStart);
    if (fresh.length === 0) {
      analyzeTimestamps.delete(userId);
    } else {
      analyzeTimestamps.set(userId, fresh);
    }
  }
}, 5 * 60_000).unref();

function checkAnalyzeRateLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowStart = now - ANALYZE_WINDOW_MS;
  const timestamps = (analyzeTimestamps.get(userId) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= ANALYZE_LIMIT) {
    const oldest = timestamps[0]!;
    const retryAfterMs = oldest + ANALYZE_WINDOW_MS - now;
    analyzeTimestamps.set(userId, timestamps);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  timestamps.push(now);
  analyzeTimestamps.set(userId, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

// POST /api/studio/concepts/analyze
// Proxies to Hagen analyze service
router.post('/concepts/analyze', requireAuth, CM_ONLY, async (req, res) => {
  const userId = req.user?.id ?? req.user?.email ?? 'anonymous';
  const { allowed, retryAfterMs } = checkAnalyzeRateLimit(String(userId));
  if (!allowed) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: `För många analyser. Du kan ladda upp max ${ANALYZE_LIMIT} videor per minut. Försök igen om ${retryAfterSec} sekunder.`,
      retryAfterSeconds: retryAfterSec,
    });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (!videoUrl) {
    res.status(400).json({ error: 'videoUrl is required' });
    return;
  }
  await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/studio/concepts/analyze',
    body: { videoUrl },
    timeoutMs: 45000,
    routeTag: 'studio.concepts.analyze',
  });
});

// POST /api/studio/concepts/enrich
router.post('/concepts/enrich', requireAuth, CM_ONLY, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.backend_data || typeof body.backend_data !== 'object') {
    res.status(400).json({ error: 'backend_data is required' });
    return;
  }
  await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/studio/concepts/enrich',
    body: { backend_data: body.backend_data },
    timeoutMs: 30000,
    routeTag: 'studio.concepts.enrich',
  });
});

// GET /api/studio/email/schedules
router.get('/email/schedules', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const customerId = req.query['customer_id'] as string | undefined;
    const isAdmin = Boolean(req.user?.is_admin || req.user?.role === 'admin');
    if (customerId) {
      if (!(await ensureCustomerAccess(req, res, customerId))) return;
    } else if (!isAdmin) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }

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
    if (!(await ensureCustomerAccess(req, res, customerProfileId))) return;

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
    const { data: scheduleRow } = await (supabase as any)
      .from('email_schedules').select('customer_profile_id').eq('id', req.params['id']).maybeSingle();
    if (!scheduleRow) {
      res.status(404).json({ error: 'Schemat hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (scheduleRow as { customer_profile_id?: string }).customer_profile_id))) return;
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
    const { data: scheduleRow } = await (supabase as any)
      .from('email_schedules').select('customer_profile_id').eq('id', req.params['id']).maybeSingle();
    if (!scheduleRow) {
      res.status(404).json({ error: 'Schemat hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (scheduleRow as { customer_profile_id?: string }).customer_profile_id))) return;
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
