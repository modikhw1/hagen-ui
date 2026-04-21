import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const COST_GROUPS = [
  {
    label: 'Google Cloud (Vertex + GCS)',
    matches: ['google cloud', 'vertex', 'gcs', 'gemini storage'],
  },
  {
    label: 'Gemini API',
    matches: ['gemini api', 'gemini'],
  },
  {
    label: 'TikTok Fetcher',
    matches: ['tiktok fetcher', 'rapidapi', 'tiktok'],
  },
  {
    label: 'Supabase',
    matches: ['supabase'],
  },
  {
    label: 'Stripe',
    matches: ['stripe'],
  },
] as const;

function normalizeServiceLabel(rawService: string) {
  const normalized = rawService.trim().toLowerCase();

  for (const group of COST_GROUPS) {
    if (group.matches.some((match) => normalized.includes(match))) {
      return group.label;
    }
  }

  return rawService.trim();
}

function isMissingTableError(message?: string | null) {
  return typeof message === 'string' && message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist');
}

export const GET = withAuth(async (req: NextRequest) => {
  const days = Number(new URL(req.url).searchParams.get('days') || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const supabaseAdmin = createSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('service_costs')
    .select('service, date, calls, cost_sek')
    .gte('date', cutoff);

  if (error) {
    if (isMissingTableError(error.message)) {
      return jsonOk({ entries: [], total: 0 });
    }

    return jsonError(error.message, 500);
  }

  const byService = new Map<string, { calls_30d: number; cost_30d: number; trend: number[] }>();
  (data ?? []).forEach((row) => {
    if (row.service?.trim().toLowerCase() === 'resend') {
      return;
    }

    const service = normalizeServiceLabel(row.service);
    const entry = byService.get(service) ?? { calls_30d: 0, cost_30d: 0, trend: [] };
    entry.calls_30d += row.calls;
    entry.cost_30d += Number(row.cost_sek);
    entry.trend.push(Number(row.cost_sek));
    byService.set(service, entry);
  });

  const entries = COST_GROUPS.map((group) => {
    const entry = byService.get(group.label) ?? { calls_30d: 0, cost_30d: 0, trend: [] };
    return { service: group.label, ...entry };
  });
  return jsonOk({ entries, total: entries.reduce((sum, entry) => sum + entry.cost_30d, 0) });
}, ['admin']);
