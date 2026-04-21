'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import InvoiceOperationsModal from '@/components/admin/billing/InvoiceOperationsModal';
import type { EnvFilter } from '@/components/admin/billing/BillingHub';
import { invoiceStatusConfig } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';

type InvoiceRow = {
  id: string;
  customer_name: string;
  customer_profile_id: string | null;
  amount_due: number;
  status: string;
  display_status?: string;
  refund_state?: 'partially_refunded' | 'refunded' | null;
  created_at: string;
  line_items?: Array<{ description: string; amount: number }>;
};

type InvoiceResponse = {
  invoices: InvoiceRow[];
};

const STATUS_FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'open', label: 'Obetalda' },
  { key: 'paid', label: 'Betalda' },
  { key: 'partially_refunded', label: 'Delvis krediterade' },
] as const;

export default function InvoicesTab({ env }: { env: EnvFilter }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]['key']>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'billing', 'invoices', env],
    queryFn: async () => {
      const url = `/api/admin/invoices?limit=200&page=1&includeLineItems=true${
        env !== 'all' ? `&environment=${env}` : ''
      }`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Kunde inte ladda fakturor');
      return (await response.json()) as InvoiceResponse;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/studio/stripe/sync-invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(payload.error || 'Sync misslyckades');
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'billing', 'invoices'],
      });
    },
  });

  const invoices = data?.invoices ?? [];
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (statusFilter === 'all') {
          return true;
        }

        return (invoice.display_status ?? invoice.status) === statusFilter;
      }),
    [invoices, statusFilter],
  );
  const open = invoices.filter((invoice) => (invoice.display_status ?? invoice.status) === 'open');
  const paid = invoices.filter((invoice) => (invoice.display_status ?? invoice.status) === 'paid');
  const partiallyRefunded = invoices.filter(
    (invoice) => (invoice.display_status ?? invoice.status) === 'partially_refunded',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SummaryCard
          label="Obetalda"
          value={formatSek(open.reduce((sum, invoice) => sum + invoice.amount_due, 0))}
          className="text-warning"
        />
        <SummaryCard
          label="Betalda"
          value={formatSek(paid.reduce((sum, invoice) => sum + invoice.amount_due, 0))}
          className="text-success"
        />
        <SummaryCard
          label="Delvis krediterade"
          value={String(partiallyRefunded.length)}
          className="text-info"
        />
        <SummaryCard label="Totalt antal" value={String(invoices.length)} />
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50 lg:ml-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Synkar...' : 'Synka fran Stripe'}
        </button>
      </div>

      {sync.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {sync.error instanceof Error ? sync.error.message : 'Sync misslyckades. Forsok igen om en stund.'}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStatusFilter(option.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === option.key
                ? 'bg-card text-foreground ring-1 ring-border'
                : 'bg-secondary text-muted-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_140px_120px] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Kund</div>
          <div>Belopp</div>
          <div>Rader</div>
          <div>Skapad</div>
          <div>Status</div>
          <div />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Laddar...</div>
        ) : (
          filteredInvoices.map((invoice, index) => {
            const status = invoiceStatusConfig(invoice.display_status ?? invoice.status);
            return (
              <div
                key={invoice.id}
                onClick={() =>
                  invoice.customer_profile_id &&
                  router.push(`/admin/customers/${invoice.customer_profile_id}`)
                }
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_140px_120px] gap-4 px-5 py-3.5 ${
                  invoice.customer_profile_id ? 'cursor-pointer hover:bg-accent/30' : ''
                } ${index < filteredInvoices.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="text-sm font-medium text-foreground">{invoice.customer_name}</div>
                <div className="text-sm font-semibold text-foreground">{formatSek(invoice.amount_due)}</div>
                <div className="text-xs text-muted-foreground">
                  {(invoice.line_items?.length ?? 1)} rad
                  {(invoice.line_items?.length ?? 1) > 1 ? 'er' : ''}
                </div>
                <div className="text-xs text-muted-foreground">{shortDateSv(invoice.created_at)}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedInvoiceId(invoice.id);
                    }}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    Korrigera
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <InvoiceOperationsModal
        invoiceId={selectedInvoiceId}
        open={Boolean(selectedInvoiceId)}
        onClose={() => setSelectedInvoiceId(null)}
        onUpdated={async () => {
          setSelectedInvoiceId(null);
          await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices'] });
        }}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold text-foreground ${className}`}>{value}</div>
    </div>
  );
}
