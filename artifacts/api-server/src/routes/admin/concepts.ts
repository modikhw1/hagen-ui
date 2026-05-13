import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { proxyHagenJson } from '../../lib/upstream-proxy.js';
import { updateIngestRun } from '../../lib/ingest-runs.js';
import {
  normalizeOverrides,
  validateNewConceptOverrides,
  computeDryRunCandidate,
  buildDryRunSummary,
  checkStaleDryRun,
} from '../../lib/concept-overrides.js';
import regenerateRouter from './concept-regenerate.js';

const router = Router();
router.use('/', regenerateRouter);
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
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const ownerIds = Array.from(new Set(
      rows.map((r) => r['created_by']).filter((v): v is string => typeof v === 'string')
    ));
    let ownerMap: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ownerIds);
      for (const p of profs ?? []) {
        const id = (p as { id?: string }).id;
        const name = (p as { full_name?: string | null; email?: string | null }).full_name
          || (p as { email?: string | null }).email
          || null;
        if (id && name) ownerMap[id] = name;
      }
    }
    const enriched = rows.map((r) => ({
      ...r,
      created_by_name: typeof r['created_by'] === 'string' ? ownerMap[r['created_by'] as string] ?? null : null,
    }));
    res.json({ concepts: enriched });
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
    const requestedId = typeof body.id === 'string' ? body.id.trim() : '';
    const ingestRunId = typeof body.ingest_run_id === 'string' ? body.ingest_run_id.trim() : null;
    const source = typeof body.source === 'string' ? body.source : 'cm_created';

    // Normalize overrides: strip deprecated fields, add overrides_version.
    const rawOverrides = typeof body.overrides === 'object' && body.overrides ? body.overrides : {};
    const { overrides: normalizedOverrides, warnings: overrideWarnings } = normalizeOverrides(rawOverrides);
    if (overrideWarnings.length > 0) {
      logger.info({ warnings: overrideWarnings, source }, 'admin concepts POST: overrides normalized');
    }

    // For new CM-created concepts, validate required canonical fields.
    if (source === 'cm_created') {
      const missingFields = validateNewConceptOverrides(normalizedOverrides);
      if (missingFields.length > 0) {
        res.status(400).json({
          error: `Konceptet saknar obligatoriska fält: ${missingFields.join(', ')}. Klassificera konceptet fullständigt innan du sparar.`,
          missing_fields: missingFields,
        });
        return;
      }
    }

    const insert = {
      id: requestedId || `concept-${randomUUID()}`,
      source,
      created_by: req.user!.id,
      backend_data: typeof body.backend_data === 'object' && body.backend_data ? body.backend_data : {},
      overrides: normalizedOverrides,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
      version: 1,
    };

    // Mark run as saving before the insert so partial failures are visible.
    if (ingestRunId) {
      void updateIngestRun(ingestRunId, { status: 'running', stage: 'saving' });
    }

    const { data, error } = await supabase
      .from('concepts')
      .insert(insert)
      .select()
      .single();

    if (error) {
      // Mark run as failed so it doesn't linger in ready_for_review.
      if (ingestRunId) {
        void updateIngestRun(ingestRunId, {
          status: 'failed',
          stage: 'saving',
          finished_at: new Date().toISOString(),
          error_code: 'save_failed',
          error_message: error.message,
        });
      }
      res.status(500).json({ error: error.message });
      return;
    }

    // Mark run completed and link to the new concept.
    if (ingestRunId) {
      const savedId = (data as Record<string, unknown>)['id'] as string | undefined ?? insert.id;
      const backendData = (insert.backend_data ?? {}) as Record<string, unknown>;
      const sceneBreakdown = backendData['scene_breakdown'];
      void updateIngestRun(ingestRunId, {
        status: 'completed',
        concept_id: savedId,
        finished_at: new Date().toISOString(),
        mergeResult: {
          save_summary: {
            concept_id: savedId,
            source: insert.source,
            is_active: insert.is_active,
            overrides_version:
              typeof (insert.overrides as Record<string, unknown>)?.['overrides_version'] === 'string'
                ? (insert.overrides as Record<string, unknown>)['overrides_version']
                : null,
            ...(Array.isArray(sceneBreakdown) ? { scene_count: sceneBreakdown.length } : {}),
          },
        },
      });
    }

    res.status(201).json({ concept: data });
  } catch (err) {
    logger.error(err, 'admin concepts POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/concepts/backfill-overrides-version/dry-run
// Admin-only. No DB writes. Returns what normalizeOverrides would change on
// each concept row without applying any mutations.
router.post('/backfill-overrides-version/dry-run', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const { data: concepts, error } = await supabase
      .from('concepts')
      .select('id, source, overrides')
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = (concepts ?? []) as Array<{
      id: string;
      source: string | null;
      overrides: Record<string, unknown> | null;
    }>;

    const candidates = rows.map((row) => computeDryRunCandidate(row));
    const summary = buildDryRunSummary(candidates);
    const toChange = candidates.filter((c) => c.would_change);

    res.json({
      dry_run: true,
      summary,
      // Return first 10 candidates for UI preview; all are included for API consumers.
      candidates: toChange.slice(0, 10),
      total_candidates: toChange.length,
    });
  } catch (err) {
    logger.error(err, 'admin concepts dry-run backfill error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

const APPLY_CONFIRM_TOKEN = 'APPLY_OVERRIDES_VERSION_V1';

// POST /api/admin/concepts/backfill-overrides-version/apply
// Admin-only. Applies normalizeOverrides to every concept that would_change.
// Requires explicit confirm token + expected counts from a prior dry-run.
// Returns partial-failure report — never hides row-level errors.
router.post('/backfill-overrides-version/apply', requireAuth, ADMIN_ONLY, async (req, res) => {
  const body = req.body as {
    confirm?: unknown;
    expected_would_change?: unknown;
    expected_total?: unknown;
  };

  if (body.confirm !== APPLY_CONFIRM_TOKEN) {
    res.status(400).json({ error: `confirm must be "${APPLY_CONFIRM_TOKEN}"` });
    return;
  }
  if (typeof body.expected_would_change !== 'number' || typeof body.expected_total !== 'number') {
    res.status(400).json({ error: 'expected_would_change and expected_total must be numbers' });
    return;
  }

  const expected_total = body.expected_total as number;
  const expected_would_change = body.expected_would_change as number;

  try {
    const supabase = createSupabaseAdmin();

    const { data: concepts, error: fetchError } = await supabase
      .from('concepts')
      .select('id, source, overrides')
      .order('created_at', { ascending: true });

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    const rows = (concepts ?? []) as Array<{
      id: string;
      source: string | null;
      overrides: Record<string, unknown> | null;
    }>;

    const candidates = rows.map((row) => computeDryRunCandidate(row));
    const summary_before = buildDryRunSummary(candidates);

    const guard = checkStaleDryRun({
      expected_total,
      expected_would_change,
      actual_total: summary_before.total,
      actual_would_change: summary_before.would_change,
    });

    if (guard.stale) {
      res.status(409).json({
        error: 'Dry-run is stale — library changed since last dry-run. Run dry-run again before applying.',
        reason: guard.reason,
        summary_before,
      });
      return;
    }

    const toChange = candidates.filter((c) => c.would_change);
    const updated_ids: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const candidate of toChange) {
      try {
        const rawRow = rows.find((r) => r.id === candidate.id);
        const { overrides: normalized } = normalizeOverrides(rawRow?.overrides ?? null);
        const { error: updateError } = await supabase
          .from('concepts')
          .update({ overrides: normalized })
          .eq('id', candidate.id);

        if (updateError) {
          failures.push({ id: candidate.id, error: updateError.message });
        } else {
          updated_ids.push(candidate.id);
        }
      } catch (rowErr) {
        failures.push({
          id: candidate.id,
          error: rowErr instanceof Error ? rowErr.message : 'unknown row error',
        });
      }
    }

    // Recompute summary_after from fresh DB read
    const { data: refreshed } = await supabase
      .from('concepts')
      .select('id, source, overrides')
      .order('created_at', { ascending: true });

    const refreshedRows = (refreshed ?? []) as Array<{
      id: string;
      source: string | null;
      overrides: Record<string, unknown> | null;
    }>;
    const summary_after = buildDryRunSummary(refreshedRows.map((r) => computeDryRunCandidate(r)));

    logger.info({ updated_count: updated_ids.length, failed_count: failures.length }, 'backfill apply complete');

    res.json({
      applied: true,
      updated_count: updated_ids.length,
      failed_count: failures.length,
      updated_ids,
      failures,
      summary_before,
      summary_after,
    });
  } catch (err) {
    logger.error(err, 'admin concepts apply backfill error');
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
    let createdByName: string | null = null;
    const ownerId = (data as { created_by?: string | null })?.created_by;
    if (typeof ownerId === 'string') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', ownerId)
        .maybeSingle();
      createdByName = (prof as { full_name?: string | null } | null)?.full_name
        || (prof as { email?: string | null } | null)?.email
        || null;
    }
    res.json({ concept: { ...(data as Record<string, unknown>), created_by_name: createdByName } });
  } catch (err) {
    logger.error(err, 'admin concept by id GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH (and PUT alias) /api/admin/concepts/:id
// Updates the concepts library table ONLY — never customer_concepts.
// Existing customer assignments are not affected by library edits.
async function patchHandler(req: Request, res: Response) {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const allowed = ['backend_data', 'overrides', 'is_active', 'source'];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    // Normalize overrides on PATCH conservatively: strip deprecated fields only.
    // Do not validate required fields — partial edits are valid (e.g. tag updates).
    if ('overrides' in patch && patch['overrides'] != null) {
      const { overrides: normalizedOverrides, warnings } = normalizeOverrides(patch['overrides']);
      if (warnings.length > 0) {
        logger.info({ warnings, conceptId: req.params['id'] }, 'admin concepts PATCH: overrides normalized');
      }
      patch['overrides'] = normalizedOverrides;
    }

    let previousOwner: string | null = null;
    const takingOver = body['take_over'] === true;
    if (takingOver) {
      const { data: prior } = await supabase
        .from('concepts')
        .select('created_by')
        .eq('id', req.params['id'])
        .single();
      previousOwner = (prior?.created_by as string | null) ?? null;
      patch['created_by'] = req.user!.id;
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

    if (takingOver && previousOwner !== req.user!.id) {
      const { error: auditErr } = await supabase
        .from('concept_ownership_audit')
        .insert({
          concept_id: req.params['id'],
          previous_owner: previousOwner,
          new_owner: req.user!.id,
          actor: req.user!.id,
          reason: typeof body['take_over_reason'] === 'string' ? body['take_over_reason'] : 'Ta över',
        });
      if (auditErr) {
        logger.warn({ err: auditErr, conceptId: req.params['id'] }, 'concept take-over audit insert failed');
      }
    }

    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'admin concept PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
}
router.patch('/:id', requireAuth, CM_ONLY, patchHandler);
router.put('/:id', requireAuth, CM_ONLY, patchHandler);

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
  await proxyHagenJson(res, {
    method: 'POST',
    path: '/api/admin/concepts/translate-vertex',
    body: req.body,
    timeoutMs: 20000,
    routeTag: 'admin.concepts.translate-vertex',
  });
});

export default router;
