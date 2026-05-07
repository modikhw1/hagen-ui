import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureCustomerAccess } from '../middleware/cm-access.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { fetchHagenJson, proxyHagenJson } from '../lib/upstream-proxy.js';
import { updateIngestRun, safeRunId } from '../lib/ingest-runs.js';

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

// ---------------------------------------------------------------------------
// Ingest runs — POST create / GET by id
// ---------------------------------------------------------------------------

// POST /api/studio/ingest-runs
router.post('/ingest-runs', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : '';
    if (!sourceUrl) {
      res.status(400).json({ error: 'source_url is required' });
      return;
    }

    const insert = {
      source: typeof body.source === 'string' ? body.source : 'studio_upload',
      source_url: sourceUrl,
      platform: typeof body.platform === 'string' ? body.platform : null,
      status: 'queued',
      created_by: req.user!.id,
      customer_profile_id:
        typeof body.customer_profile_id === 'string' ? body.customer_profile_id : null,
      input: { source_url: sourceUrl, platform: body.platform ?? null },
    };

    const { data, error } = await supabase
      .from('ingest_runs')
      .insert(insert)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ ingest_run: data });
  } catch (err) {
    logger.error(err, 'studio ingest-runs POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio/ingest-runs/:id
router.get('/ingest-runs/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('ingest_runs')
      .select('*')
      .eq('id', req.params['id'])
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Ingest run hittades inte' });
      return;
    }

    // Only allow the creator or admin to see the run.
    const row = data as Record<string, unknown>;
    const isAdmin = Boolean(req.user?.is_admin || req.user?.role === 'admin');
    if (!isAdmin && row['created_by'] !== req.user!.id) {
      res.status(403).json({ error: 'Åtkomst nekad' });
      return;
    }

    res.json({ ingest_run: data });
  } catch (err) {
    logger.error(err, 'studio ingest-runs GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ---------------------------------------------------------------------------
// Concepts — analyze / enrich / humor-enrich
// ---------------------------------------------------------------------------

// POST /api/studio/concepts/analyze
// Proxies to Hagen analyze service. Optionally instruments an ingest_run row.
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

  const ingestRunId = safeRunId(body.ingest_run_id);
  const now = new Date().toISOString();

  // Mark run as running/analyzing before the slow proxy call.
  if (ingestRunId) {
    void updateIngestRun(ingestRunId, {
      status: 'running',
      stage: 'analyzing',
      started_at: now,
    });
  }

  const result = await fetchHagenJson({
    method: 'POST',
    path: '/api/studio/concepts/analyze',
    body: { videoUrl },
    timeoutMs: 45000,
    routeTag: 'studio.concepts.analyze',
  });

  // Instrument run with outcome before forwarding response.
  if (ingestRunId) {
    if (result.ok) {
      const data = result.data as Record<string, unknown>;
      const upload = data['upload'] as Record<string, unknown> | undefined;
      void updateIngestRun(ingestRunId, {
        mergeResult: {
          analyze_summary: {
            gcs_uri: upload?.['gcsUri'] ?? null,
            has_analysis: Boolean(data['analysis']),
          },
        },
      });
    } else {
      void updateIngestRun(ingestRunId, {
        status: 'failed',
        stage: 'analyzing',
        finished_at: new Date().toISOString(),
        error_code: 'analyze_failed',
        error_message: String(result.body['error'] ?? result.body['message'] ?? 'analyze proxy error'),
      });
    }
  }

  res.setHeader('x-letrend-request-id', result.requestId);
  if (result.ok) {
    res.status(result.status).json(result.data);
  } else {
    res.status(result.clientStatus).json(result.body);
  }
});

// POST /api/studio/concepts/enrich
router.post('/concepts/enrich', requireAuth, CM_ONLY, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.backend_data || typeof body.backend_data !== 'object') {
    res.status(400).json({ error: 'backend_data is required' });
    return;
  }

  const ingestRunId = safeRunId(body.ingest_run_id);

  if (ingestRunId) {
    void updateIngestRun(ingestRunId, { stage: 'enriching' });
  }

  const result = await fetchHagenJson({
    method: 'POST',
    path: '/api/studio/concepts/enrich',
    body: { backend_data: body.backend_data },
    timeoutMs: 30000,
    routeTag: 'studio.concepts.enrich',
  });

  if (ingestRunId) {
    if (result.ok) {
      // Enrich succeeded: surface for CM review before they save.
      void updateIngestRun(ingestRunId, {
        status: 'ready_for_review',
        stage: 'classifying',
        mergeResult: {
          enrich_summary: { has_overrides: Boolean(result.data['overrides']) },
        },
      });
    } else {
      void updateIngestRun(ingestRunId, {
        status: 'failed',
        stage: 'enriching',
        finished_at: new Date().toISOString(),
        error_code: 'enrich_failed',
        error_message: String(result.body['error'] ?? result.body['message'] ?? 'enrich proxy error'),
      });
    }
  }

  res.setHeader('x-letrend-request-id', result.requestId);
  if (result.ok) {
    res.status(result.status).json(result.data);
  } else {
    res.status(result.clientStatus).json(result.body);
  }
});

// POST /api/studio/concepts/humor-enrich
// Fire-and-forget safe: still responds quickly, but instruments run in background.
router.post('/concepts/humor-enrich', requireAuth, CM_ONLY, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const gcsUri = typeof body.gcsUri === 'string' ? body.gcsUri.trim() : '';
  if (!videoUrl) {
    res.status(400).json({ error: 'videoUrl is required' });
    return;
  }
  if (!gcsUri) {
    res.status(400).json({ error: 'gcsUri is required' });
    return;
  }

  const ingestRunId = safeRunId(body.ingest_run_id);

  // Humor-enrich runs after the concept is already saved (status=completed).
  // We must NOT change the top-level status/stage — only update result.humor_enrich.
  if (ingestRunId) {
    void updateIngestRun(ingestRunId, {
      mergeResult: { humor_enrich: { status: 'running' } },
    });
  }

  // Run the proxy and instrument the run result asynchronously — callers
  // treat this as fire-and-forget so we still respond even if hagen is slow.
  const proxyPromise = fetchHagenJson({
    method: 'POST',
    path: '/api/studio/concepts/humor-enrich',
    body: { videoUrl, gcsUri },
    timeoutMs: 90000,
    routeTag: 'studio.concepts.humor-enrich',
  });

  proxyPromise.then((result) => {
    if (!ingestRunId) return;
    if (result.ok) {
      const fields = (result.data['fields'] ?? {}) as Record<string, unknown>;
      void updateIngestRun(ingestRunId, {
        mergeResult: { humor_enrich: { status: 'completed', fields } },
      });
    } else {
      const errCode = String(result.body['error'] ?? 'humor-enrich failed');
      void updateIngestRun(ingestRunId, {
        mergeResult: { humor_enrich: { status: 'failed', error: errCode } },
        appendWarning: { stage: 'humor_enriching', error: errCode },
      });
    }
  }).catch(() => {
    // Non-fatal — fire-and-forget
  });

  // Acknowledge immediately. Frontend treats this endpoint as fire-and-forget.
  res.status(202).json({ accepted: true });
});

// ---------------------------------------------------------------------------
// Email schedules
// ---------------------------------------------------------------------------

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
