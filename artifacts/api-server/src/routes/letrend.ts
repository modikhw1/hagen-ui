import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { recordServiceUsage, getPriceOre } from '../lib/service-usage.js';

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

function getHagenBase(): string | null {
  return process.env['HAGEN_BASE_URL']?.trim() ?? null;
}

// POST /api/letrend/concept/prepare
router.post('/concept/prepare', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const videoId = typeof body.video_id === 'string' ? body.video_id.trim() : '';
    if (!videoId) {
      res.status(400).json({ error: 'video_id is required' });
      return;
    }

    const prepareResponse = await fetch(`${hagenBase}/api/letrend/concept/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
      signal: AbortSignal.timeout(20000),
    });

    const prepared = await prepareResponse.json() as Record<string, unknown>;
    if (!prepareResponse.ok) {
      res.status(prepareResponse.status).json(prepared);
      return;
    }

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
        logger.warn({ err: insertError }, 'concept insert failed');
      }
    }

    void recordHagenCall('per_prepare', 10, { route: 'concept/prepare' });
    res.json(prepared);
  } catch (err) {
    logger.error(err, 'letrend concept prepare error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/letrend/library
router.get('/library', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }

    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const upstream = await fetch(`${hagenBase}/api/letrend/library${query ? `?${query}` : ''}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'letrend library error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/letrend/reprocess
router.post('/reprocess', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const upstream = await fetch(`${hagenBase}/api/letrend/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    if (upstream.ok) void recordHagenCall('per_prepare', 10, { route: 'reprocess' });
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'letrend reprocess error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/letrend/video/:id
router.get('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }
    const { id } = req.params;
    const upstream = await fetch(`${hagenBase}/api/letrend/video/${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'letrend video by id error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/letrend/video/:id
router.patch('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const upstream = await fetch(`${hagenBase}/api/letrend/video/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'letrend video PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/videos/library
router.get('/videos/library', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.json({ videos: [] });
      return;
    }
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const upstream = await fetch(`${hagenBase}/api/videos/library${query ? `?${query}` : ''}`, {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!upstream) {
      res.json({ videos: [] });
      return;
    }
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'videos library error');
    res.json({ videos: [] });
  }
});

// POST /api/videos/create
router.post('/videos/create', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const upstream = await fetch(`${hagenBase}/api/videos/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'videos create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/video/:id
router.get('/video/:id', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }
    const { id } = req.params;
    const upstream = await fetch(`${hagenBase}/api/video/${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'video by id error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/videos/analyze/deep
router.post('/videos/analyze/deep', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const hagenBase = getHagenBase();
    if (!hagenBase) {
      res.status(503).json({ error: 'HAGEN_BASE_URL is not configured' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const upstream = await fetch(`${hagenBase}/api/videos/analyze/deep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const data = await upstream.json() as Record<string, unknown>;
    if (upstream.ok) void recordHagenCall('per_deep_analyze', 50, { route: 'videos/analyze/deep' });
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.error(err, 'videos analyze deep error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
