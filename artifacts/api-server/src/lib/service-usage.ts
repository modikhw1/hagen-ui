import { createSupabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

export type ServicePricingRow = {
  service: string;
  unit: string;
  price_ore: number;
  source: 'measured' | 'estimate' | 'missing';
  notes: string | null;
};

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const PRICING_TTL_MS = 5 * 60 * 1000;
let pricingCache: { fetchedAt: number; rows: ServicePricingRow[] } | null = null;

export async function getServicePricing(force = false): Promise<ServicePricingRow[]> {
  if (!force && pricingCache && Date.now() - pricingCache.fetchedAt < PRICING_TTL_MS) {
    return pricingCache.rows;
  }
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => Promise<{ data: ServicePricingRow[] | null; error: { message: string } | null }>;
      };
    })
      .from('service_pricing')
      .select('service, unit, price_ore, source, notes');
    if (error) {
      logger.warn({ err: error.message }, 'getServicePricing failed');
      return pricingCache?.rows ?? [];
    }
    const rows = (data ?? []) as ServicePricingRow[];
    pricingCache = { fetchedAt: Date.now(), rows };
    return rows;
  } catch (err) {
    logger.warn({ err }, 'getServicePricing exception');
    return pricingCache?.rows ?? [];
  }
}

export function invalidateServicePricingCache() {
  pricingCache = null;
}

export async function getPriceOre(
  service: string,
  unit: string,
  fallback = 0,
): Promise<number> {
  const rows = await getServicePricing();
  const row = rows.find((r) => r.service === service && r.unit === unit);
  return row ? row.price_ore : fallback;
}

/**
 * Upserts today's row for `service` in `service_costs`, summing calls and
 * cost. Safe to call from any server route — failures are logged and
 * swallowed so they cannot break the actual product call.
 *
 * `service_costs` columns: service (text), date (date), calls (int),
 * cost_sek (numeric), metadata (jsonb).
 */
export async function recordServiceUsage(params: {
  service: string;
  calls?: number;
  cost_ore: number;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseAdmin;
}): Promise<void> {
  const calls = Math.max(0, Math.round(params.calls ?? 1));
  const costOre = Math.round(params.cost_ore);
  if (!params.service) return;

  const today = new Date().toISOString().slice(0, 10);
  const supabase = params.supabase ?? createSupabaseAdmin();

  try {
    const { data: existing, error: selError } = await supabase
      .from('service_costs')
      .select('id, calls, cost_sek, metadata')
      .eq('service', params.service)
      .eq('date', today)
      .maybeSingle();

    if (selError) {
      logger.warn({ err: selError.message, service: params.service }, 'recordServiceUsage select failed');
      return;
    }

    if (existing) {
      const nextCalls = (Number(existing.calls) || 0) + calls;
      const nextCostSek = (Number(existing.cost_sek) || 0) + costOre / 100;
      const nextMeta = mergeMetadata(existing.metadata as Record<string, unknown> | null, params.metadata ?? null);

      const { error: updErr } = await supabase
        .from('service_costs')
        .update({
          calls: nextCalls,
          cost_sek: nextCostSek,
          metadata: nextMeta,
        } as never)
        .eq('id', existing.id as string);
      if (updErr) {
        logger.warn({ err: updErr.message, service: params.service }, 'recordServiceUsage update failed');
      }
    } else {
      const { error: insErr } = await supabase.from('service_costs').insert({
        service: params.service,
        date: today,
        calls,
        cost_sek: costOre / 100,
        metadata: params.metadata ?? null,
      } as never);
      if (insErr) {
        logger.warn({ err: insErr.message, service: params.service }, 'recordServiceUsage insert failed');
      }
    }
  } catch (err) {
    logger.warn({ err, service: params.service }, 'recordServiceUsage exception');
  }
}

function mergeMetadata(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!existing && !incoming) return null;
  const out: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (typeof v === 'number' && typeof out[k] === 'number') {
      out[k] = (out[k] as number) + v;
    } else {
      out[k] = v;
    }
  }
  return out;
}
