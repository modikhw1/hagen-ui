'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/admin/api-client';
import { AdminSection } from '@/components/admin/shared/AdminSection';
import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';

type PricingRow = {
  service: string;
  unit: string;
  price_ore: number;
  source: 'measured' | 'estimate' | 'missing';
  notes: string | null;
  updated_at: string | null;
};

type PricingResponse = {
  rows: PricingRow[];
  schemaWarnings?: string[];
};

const PRICING_QUERY_KEY = ['admin', 'pricing'] as const;

function formatOre(ore: number) {
  return `${(ore / 100).toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kr`;
}

const SOURCE_LABEL: Record<PricingRow['source'], { label: string; cls: string }> = {
  measured: { label: 'Mätt', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  estimate: { label: 'Uppskattat', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  missing: { label: 'Saknar data', cls: 'bg-muted text-muted-foreground' },
};

export function ServicePricingEditor() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: PRICING_QUERY_KEY,
    queryFn: async ({ signal }) => apiClient.get<PricingResponse>('/api/admin/pricing', { signal }),
    staleTime: 30_000,
  });

  return (
    <AdminSection
      title="Priser per tjänst"
      description="Redigera price_ore för varje (service, unit). Ändringar slår igenom direkt i kostnadskalkylatorn."
    >
      <SchemaWarningBanner warnings={data?.schemaWarnings ?? []} />

      {isLoading ? (
        <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Laddar prislista…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Kunde inte ladda priser'}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Inga prisrader hittades.
        </div>
      ) : (
        <PricingTable rows={data.rows} queryClient={queryClient} />
      )}
    </AdminSection>
  );
}

function PricingTable({
  rows,
  queryClient,
}: {
  rows: PricingRow[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Tjänst</th>
            <th className="px-3 py-2 text-left font-semibold">Enhet</th>
            <th className="px-3 py-2 text-right font-semibold">Pris (öre)</th>
            <th className="px-3 py-2 text-right font-semibold">≈ SEK</th>
            <th className="px-3 py-2 text-left font-semibold">Källa</th>
            <th className="px-3 py-2 text-left font-semibold">Anteckning</th>
            <th className="px-3 py-2 text-right font-semibold">Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PricingRowEditor key={`${row.service}:${row.unit}`} row={row} queryClient={queryClient} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingRowEditor({
  row,
  queryClient,
}: {
  row: PricingRow;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [priceOre, setPriceOre] = useState<string>(String(row.price_ore));
  const [source, setSource] = useState<PricingRow['source']>(row.source);
  const [notes, setNotes] = useState<string>(row.notes ?? '');

  useEffect(() => {
    setPriceOre(String(row.price_ore));
    setSource(row.source);
    setNotes(row.notes ?? '');
  }, [row.price_ore, row.source, row.notes]);

  const dirty = useMemo(() => {
    return (
      String(row.price_ore) !== priceOre.trim() ||
      row.source !== source ||
      (row.notes ?? '') !== notes
    );
  }, [row.price_ore, row.source, row.notes, priceOre, source, notes]);

  const mutation = useMutation({
    mutationFn: async () => {
      const priceNum = Number(priceOre);
      if (!Number.isFinite(priceNum) || priceNum < 0 || !Number.isInteger(priceNum)) {
        throw new Error('Pris måste vara ett icke-negativt heltal i öre.');
      }
      return apiClient.patch<{ row: PricingRow }>(
        `/api/admin/pricing/${encodeURIComponent(row.service)}/${encodeURIComponent(row.unit)}`,
        {
          price_ore: priceNum,
          source,
          notes: notes.trim() === '' ? null : notes,
        },
      );
    },
    onSuccess: async () => {
      toast.success(`Pris uppdaterat: ${row.service} / ${row.unit}`);
      await queryClient.invalidateQueries({ queryKey: PRICING_QUERY_KEY });
      // Cost cards on the overview rely on the same pricing — refresh those too.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Kunde inte spara pris');
    },
  });

  const sourceBadge = SOURCE_LABEL[source];
  const priceNum = Number(priceOre);
  const priceValid = Number.isFinite(priceNum) && priceNum >= 0 && Number.isInteger(priceNum);

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 font-mono text-xs text-foreground">{row.service}</td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.unit}</td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          step={1}
          value={priceOre}
          onChange={(e) => setPriceOre(e.target.value)}
          className={`w-24 rounded-md border bg-card px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-primary ${
            priceValid ? 'border-border' : 'border-destructive'
          }`}
        />
      </td>
      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
        {priceValid ? formatOre(priceNum) : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as PricingRow['source'])}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="measured">Mätt</option>
            <option value="estimate">Uppskattat</option>
            <option value="missing">Saknar data</option>
          </select>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${sourceBadge.cls}`}>
            {sourceBadge.label}
          </span>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="—"
          className="w-full min-w-[16rem] rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!dirty || !priceValid || mutation.isPending}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {mutation.isPending ? 'Sparar…' : 'Spara'}
        </button>
      </td>
    </tr>
  );
}

export default ServicePricingEditor;
