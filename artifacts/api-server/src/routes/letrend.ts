import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { recordServiceUsage, getPriceOre } from '../lib/service-usage.js';
import { fetchHagenJson, getHagenBase, proxyHagenJson } from '../lib/upstream-proxy.js';

async function recordHagenCall(unit: string, fallbackOre: number, extra?: Record<string, unknown>) {
  try {
    const priceOre = await getPriceOre('vertex', unit, fallbackOre);
    await recordServiceUsage({
      service: 'Google Cloud (Vertex + GCS)',
      calls: 1,
      cost_ore: priceOre,
      metadata: { source: 'hagen-proxy', unit, ...(extra ?? {}) },
    });
  } catch {
    /* best-effort */
  }
}

const router = Router();
const CM_ONLY = requireRole(['admin', 'content_manager']);

// GET /api/letrend/version — surface hagen's git sha + schema version so route
// drift between api-server and hagen can be diagnosed without SSH.
router.get('/version', requireAuth, CM_ONLY, async (_req, res) => {
  await proxyHagenJson(res, {
    method: 'GET',
    path: '/api/letrend/version',
    timeoutMs: 5000,
    routeTag: 'letrend.version',
  });
});

// POST /api/letrend/concept/prepare
router.post('/concept/prepare', requireAuth, CM_ONLY, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const videoId = typeof body.video_id === 'string' ? body.video_id.trim() : '';
  if (!videoId) {
    res.status(400).json({ error: 'video_id is required' });
    return;
  }

  const result = await fetchHagenJson({
    method: 'POST',
    path: '/api/letrend/concept/prepare',
    body: { video_id: videoId },
    timeoutMs: 20000,
    routeTag: 'letrend.concept.prepare',
  });

  res.setHeader('x-letrend-request-id', result.requestId);
  if (!result.ok) {
    res.status(result.clientStatus).json(result.body);
    return;
  }

  const prepared = result.data;
  try {
    const supabase = createSupabaseAdmin();
    const conceptInsert = {
      id: prepared.concept_id,
      source: 'hagen',
      created_by: req.user!.id,
      backend_data: prepared.backend_data,
      overrides: {},
      is_active: false,
      version: 1,
    };

    const { data: existing } = await supabase
      .from('concepts')
      .select('id')
      .eq('id', prepared.concept_id as string)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase.from('concepts').insert(conceptInsert);
      if (insertError) {
        logger.warn({ err: insertError, requestId: result.requestId }, 'concept insert failed');
      }
    }
  } catch (err) {
    logger.error({ err, requestId: result.requestId }, 'concept/prepare side-effect failed');
  }

  void recordHagenCall('per_prepare', 10, { route: 'concept/prepare', request_id: result.requestId });
  res.status(result.status).json(prepared);
});

// GET /api/letrend/library
router.get('/library', requireAuth, CM_ONLY, async (req, res) => {
  const query = new URLSearchParams(req.query as Record<string, string>).toString();
  await proxyHagenJson(res, {
    method: 'GET',
    path: '/api/letrend/library',
    query,
    timeoutMs: 8000,
    routeTag: 'letrend.library',
  });
});

// POST /api/letrend/reprocess
router.post('/reprocess', requireAuth, CM_ONLY, async (req, res) => {
  const result = await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/letrend/reprocess',
    body: req.body,
    timeoutMs: 20000,
    routeTag: 'letrend.reprocess',
  });
  if (result.ok) void recordHagenCall('per_prepare', 10, { route: 'reprocess', request_id: result.requestId });
});

// GET /api/letrend/video/:id
router.get('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  await proxyHagenJson(res, {
    method: 'GET',
    path: `/api/letrend/video/${req.params.id}`,
    timeoutMs: 8000,
    routeTag: 'letrend.video.get',
  });
});

// PATCH /api/letrend/video/:id
router.patch('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  await proxyHagenJson(res, {
    method: 'PATCH',
    path: `/api/letrend/video/${req.params.id}`,
    body: req.body,
    timeoutMs: 10000,
    routeTag: 'letrend.video.patch',
  });
});

// GET /api/videos/library
// Special-case: this used to swallow upstream errors silently and return an
// empty list. We keep the empty-list fallback only for the
// HAGEN_BASE_URL-not-configured case, but real upstream errors now surface so
// they can be diagnosed.
router.get('/videos/library', requireAuth, CM_ONLY, async (req, res) => {
  if (!getHagenBase()) {
    res.json({ videos: [] });
    return;
  }
  const query = new URLSearchParams(req.query as Record<string, string>).toString();
  await proxyHagenJson(res, {
    method: 'GET',
    path: '/api/videos/library',
    query,
    timeoutMs: 8000,
    routeTag: 'videos.library',
  });
});

// POST /api/videos/create
router.post('/videos/create', requireAuth, CM_ONLY, async (req, res) => {
  await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/videos/create',
    body: req.body,
    timeoutMs: 20000,
    routeTag: 'videos.create',
  });
});

// GET /api/video/:id
router.get('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  await proxyHagenJson(res, {
    method: 'GET',
    path: `/api/video/${req.params.id}`,
    timeoutMs: 8000,
    routeTag: 'video.get',
  });
});

// POST /api/videos/analyze/deep
router.post('/videos/analyze/deep', requireAuth, CM_ONLY, async (req, res) => {
  const result = await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/videos/analyze/deep',
    body: req.body,
    timeoutMs: 60000,
    routeTag: 'videos.analyze.deep',
  });
  if (result.ok) void recordHagenCall('per_deep_analyze', 50, { route: 'videos/analyze/deep', request_id: result.requestId });
});

export default router;
