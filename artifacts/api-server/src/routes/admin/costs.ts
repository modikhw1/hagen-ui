import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  getServicePricing,
  getPriceOre,
  invalidateServicePricingCache,
  recordServiceUsage,
} from '../../lib/service-usage.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

const SERVICE_GROUPS = [
  { label: 'Google Cloud (Vertex + GCS)', matches: ['google cloud', 'vertex', 'gcs', 'gemini storage'] },
  { label: 'Gemini API', matches: ['gemini api', 'gemini'] },
  { label: 'TikTok Fetcher', matches: ['tiktok fetcher', 'rapidapi', 'tiktok'] },
  { label: 'Supabase', matches: ['supabase'] },
  { label: 'Stripe', matches: ['stripe'] },
];

function normalizeGroup(rawService: string): (typeof SERVICE_GROUPS)[number] | null {
  const normalized = rawService.trim().toLowerCase();
  for (const group of SERVICE_GROUPS) {
    if (group.matches.some((m) => normalized.includes(m))) return group;
  }
  return null;
}

type CostRow = {
  service: string;
  date: string;
  calls: number;
  cost_sek: number | string;
  metadata?: Record<string, unknown> | null;
};

let lastRefreshedAt: string | null = null;

async function buildCostsPayload() {
  const supabase = createSupabaseAdmin();
  const today = new Date();
  const since30 = new Date(today.getTime() - 30 * 86_400_000);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const dayOfMonth = today.getDate();
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);

  const { data, error } = await supabase
    .from('service_costs')
    .select('service, date, calls, cost_sek, metadata')
    .gte('date', since30.toISOString().slice(0, 10))
    .order('date', { ascending: true });

  if (error) {
    logger.warn({ err: error.message }, 'overview/costs select failed');
  }

  const rows = (data ?? []) as CostRow[];
  const pricing = await getServicePricing();
  const rapidapiMonthlyFlat =
    pricing.find((p) => p.service === 'rapidapi' && p.unit === 'monthly_flat')?.price_ore ?? 0;
  const rapidapiPerCall =
    pricing.find((p) => p.service === 'rapidapi' && p.unit === 'per_call')?.price_ore ?? 0;

  type GroupAcc = {
    label: string;
    calls_30d: number;
    cost_30d_ore: number;
    cost_mtd_ore: number;
    callsMonth: number;
    daysWithData: Set<string>;
    trendByDay: Map<string, number>;
    sawAny: boolean;
    sawMeasured: boolean;
    latestQuota: { used: number; limit: number; reset_at: string | null; debug_msg?: string } | null;
  };

  const acc = new Map<string, GroupAcc>();
  for (const g of SERVICE_GROUPS) {
    acc.set(g.label, {
      label: g.label,
      calls_30d: 0,
      cost_30d_ore: 0,
      cost_mtd_ore: 0,
      callsMonth: 0,
      daysWithData: new Set(),
      trendByDay: new Map(),
      sawAny: false,
      sawMeasured: false,
      latestQuota: null,
    });
  }

  const monthStartIso = monthStart.toISOString().slice(0, 10);

  for (const row of rows) {
    const svc = (row.service ?? '').trim();
    if (!svc) continue;
    if (svc.toLowerCase() === 'resend') continue;
    const group = normalizeGroup(svc);
    if (!group) continue;
    const entry = acc.get(group.label)!;
    const costOre = Math.round(Number(row.cost_sek ?? 0) * 100);
    entry.calls_30d += Number(row.calls ?? 0);
    entry.cost_30d_ore += costOre;
    entry.sawAny = true;
    if ((row.metadata as { data_source?: string } | null)?.data_source === 'measured') {
      entry.sawMeasured = true;
    }
    const quota = (row.metadata as { quota?: GroupAcc['latestQuota'] } | null)?.quota;
    if (quota && typeof quota === 'object') {
      entry.latestQuota = quota;
    }
    if (row.date >= monthStartIso) {
      entry.cost_mtd_ore += costOre;
      entry.callsMonth += Number(row.calls ?? 0);
      entry.daysWithData.add(row.date);
    }
    entry.trendByDay.set(row.date, (entry.trendByDay.get(row.date) ?? 0) + costOre);
  }

  const entries = SERVICE_GROUPS.map((group) => {
    const e = acc.get(group.label)!;

    let projected: number | null = null;
    if (e.sawAny) {
      const measuredDays = e.daysWithData.size;
      const avgPerDayOre = measuredDays > 0 ? e.cost_mtd_ore / measuredDays : 0;
      projected = Math.round(e.cost_mtd_ore + avgPerDayOre * remainingDays);
    }

    // RapidAPI projection: include a flat monthly subscription fee plus the
    // estimated cost of the remaining quota for this billing period.
    let projectionNotes: string | undefined;
    if (group.label === 'TikTok Fetcher' && e.latestQuota) {
      const usedQuota = e.latestQuota.used ?? 0;
      const limitQuota = e.latestQuota.limit ?? 0;
      const callsExpected = limitQuota > 0 ? Math.min(limitQuota, usedQuota + (usedQuota / Math.max(1, dayOfMonth)) * remainingDays) : usedQuota;
      const quotaCostOre = Math.round(callsExpected * rapidapiPerCall);
      projected = (projected ?? 0) + rapidapiMonthlyFlat + Math.max(0, quotaCostOre - e.cost_mtd_ore);
      projectionNotes = `flat ${rapidapiMonthlyFlat}öre + ${callsExpected}/${limitQuota} calls`;
    }

    let dataSource: 'measured' | 'estimated' | 'missing';
    if (!e.sawAny) {
      dataSource = 'missing';
    } else if (e.sawMeasured) {
      dataSource = 'measured';
    } else {
      dataSource = 'estimated';
    }

    const trend = Array.from(e.trendByDay.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);

    return {
      service: group.label,
      calls_30d: e.calls_30d,
      cost_30d: e.cost_30d_ore,
      projected_month_ore: projected,
      data_source: dataSource,
      trend,
      quota: e.latestQuota,
      notes: projectionNotes,
    };
  });

  const totalOre = entries.reduce((s, e) => s + e.cost_30d, 0);
  const projectedMonthOre = entries.reduce((s, e) => s + (e.projected_month_ore ?? 0), 0);

  return {
    entries,
    totalOre,
    projectedMonthOre,
    refreshedAt: lastRefreshedAt,
  };
}

/**
 * Probes the RapidAPI tiktok-scraper7 endpoint to read the current billing
 * period quota from rate-limit headers. Records a service_costs row for
 * "TikTok Fetcher" with the quota in metadata so the cost endpoint can use
 * it for projection. The probe itself counts as 1 RapidAPI call.
 */
async function probeRapidApiQuota(): Promise<{ ok: boolean; quota?: Record<string, unknown>; error?: string }> {
  const apiKey = process.env['RAPIDAPI_KEY'];
  if (!apiKey) return { ok: false, error: 'RAPIDAPI_KEY not set' };
  const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
  const url = new URL(`https://${RAPIDAPI_HOST}/user/info`);
  url.searchParams.set('unique_id', 'tiktok');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const limit =
    Number(res.headers.get('x-ratelimit-requests-limit')) ||
    Number(res.headers.get('x-quota-limit')) ||
    0;
  const remaining =
    Number(res.headers.get('x-ratelimit-requests-remaining')) ||
    Number(res.headers.get('x-quota-remaining')) ||
    0;
  const resetSec = Number(res.headers.get('x-ratelimit-requests-reset')) || 0;
  const used = limit > 0 ? Math.max(0, limit - remaining) : 0;
  const reset_at = resetSec > 0 ? new Date(Date.now() + resetSec * 1000).toISOString() : null;
  const debug_msg = res.status === 429 ? 'ERR_HTTP_429' : res.status >= 400 ? `ERR_HTTP_${res.status}` : undefined;

  const quota = { used, limit, reset_at, debug_msg };

  const perCallOre = await getPriceOre('rapidapi', 'per_call', 5);
  await recordServiceUsage({
    service: 'TikTok Fetcher',
    calls: 1,
    cost_ore: perCallOre,
    metadata: { source: 'rapidapi-probe', quota, data_source: 'measured' },
  });

  return { ok: res.status < 400, quota };
}

router.get('/overview/costs', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const payload = await buildCostsPayload();
    res.json(payload);
  } catch (err) {
    logger.error(err, 'overview costs error');
    res.json({ entries: [], totalOre: 0, projectedMonthOre: 0, refreshedAt: null });
  }
});

router.post('/costs/refresh', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    invalidateServicePricingCache();
    const probe = await probeRapidApiQuota();
    lastRefreshedAt = new Date().toISOString();
    const payload = await buildCostsPayload();
    res.json({ ok: true, probe, ...payload });
  } catch (err) {
    logger.error(err, 'costs refresh error');
    res.status(500).json({ ok: false, error: 'Internt serverfel' });
  }
});

export default router;
