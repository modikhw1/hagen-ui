type OverviewCostGroup = {
  label: string;
  matches: readonly string[];
};

type OverviewCostSourceRow = {
  service: string | null | undefined;
  calls: number | null | undefined;
  cost_sek: number | string | null | undefined;
};

type OverviewCostEntry = {
  service: string;
  calls_30d: number;
  cost_30d: number;
  trend: number[];
};

export const OVERVIEW_COST_GROUPS: readonly OverviewCostGroup[] = [
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

export function normalizeOverviewCostServiceLabel(rawService: string) {
  const normalized = rawService.trim().toLowerCase();

  for (const group of OVERVIEW_COST_GROUPS) {
    if (group.matches.some((match) => normalized.includes(match))) {
      return group.label;
    }
  }

  return rawService.trim();
}

export function aggregateOverviewCosts(
  rows: readonly OverviewCostSourceRow[],
): {
  entries: OverviewCostEntry[];
  totalOre: number;
} {
  const byService = new Map<string, OverviewCostEntry>();

  for (const row of rows) {
    if (row.service?.trim().toLowerCase() === 'resend') {
      continue;
    }

    const service = normalizeOverviewCostServiceLabel(row.service ?? 'Ok\u00e4nd');
    const entry = byService.get(service) ?? {
      calls_30d: 0,
      cost_30d: 0,
      service,
      trend: [],
    };
    const rowCostOre = Math.round(Number(row.cost_sek ?? 0) * 100);
    entry.calls_30d += row.calls ?? 0;
    entry.cost_30d += rowCostOre;
    entry.trend.push(rowCostOre);
    byService.set(service, entry);
  }

  const entries = OVERVIEW_COST_GROUPS.map((group) => {
    const entry = byService.get(group.label);
    return (
      entry ?? {
        calls_30d: 0,
        cost_30d: 0,
        service: group.label,
        trend: [],
      }
    );
  });

  return {
    entries,
    totalOre: entries.reduce((sum, entry) => sum + entry.cost_30d, 0),
  };
}
