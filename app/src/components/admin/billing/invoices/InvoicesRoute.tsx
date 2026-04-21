'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import InvoiceOperationsModal from '@/components/admin/billing/InvoiceOperationsModal';
import AdminTable, { type AdminTableColumn } from '@/components/admin/_shared/AdminTable';
import FilterChips from '@/components/admin/_shared/FilterChips';
import StatusPill from '@/components/admin/_shared/StatusPill';
import SummaryCard from '@/components/admin/_shared/SummaryCard';
import { useBillingInvoicesRefresh } from '@/hooks/admin/useAdminRefresh';
import {
  captureAdminError,
  measureAdminAsync,
} from '@/lib/admin/admin-telemetry';
import { useStripeSyncInvoices } from '@/lib/admin/billing-ops';
import { invoiceStatusConfig } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { shortDateSv } from '@/lib/admin/time';
import type { EnvFilter } from '@/lib/admin/billing';

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

const statusFilters = [
  { key: 'all', label: 'Alla' },
  { key: 'open', label: 'Obetalda' },
  { key: 'paid', label: 'Betalda' },
  { key: 'partially_refunded', label: 'Delvis krediterade' },
] as const;

const columns: Array<AdminTableColumn<InvoiceRow>> = [
  {
    key: 'customer',
    header: 'Kund',
    width: '2fr',
    render: (invoice) => (
      <div className="truncate text-sm font-medium text-foreground">{invoice.customer_name}</div>
    ),
  },
  {
    key: 'amount',
    header: 'Belopp',
    width: '1fr',
    render: (invoice) => (
      <div className="text-sm font-semibold text-foreground">{formatSek(invoice.amount_due)}</div>
    ),
  },
  {
    key: 'lines',
    header: 'Rader',
    width: '1fr',
    render: (invoice) => {
      const count = invoice.line_items?.length ?? 1;
      return (
        <div className="text-xs text-muted-foreground">
          {count} rad{count > 1 ? 'er' : ''}
        </div>
      );
    },
  },
  {
    key: 'created',
    header: 'Skapad',
    width: '1fr',
    render: (invoice) => (
      <div className="text-xs text-muted-foreground">{shortDateSv(invoice.created_at)}</div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '140px',
    render: (invoice) => (
      <StatusPill config={invoiceStatusConfig(invoice.display_status ?? invoice.status)} />
    ),
  },
  {
    key: 'actions',
    header: '',
    width: '120px',
    align: 'right',
    linkable: false,
    render: () => null,
  },
];

export default function InvoicesRoute({
  env,
  status,
}: {
  env: EnvFilter;
  status: (typeof statusFilters)[number]['key'];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const refreshInvoices = useBillingInvoicesRefresh(env);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const { run: syncInvoices, isPending, error } = useStripeSyncInvoices(env);

  const { data, isLoading } = useQuery({
    queryKey: [...qk.billing.invoices(env), status],
    queryFn: async () =>
      measureAdminAsync(
        'billing_invoices_load_ms',
        async () => {
          const params = new URLSearchParams({
            limit: '200',
            page: '1',
            includeLineItems: 'true',
          });

          if (env !== 'all') {
            params.set('environment', env);
          }

          if (status !== 'all') {
            params.set('status', status);
          }

          const response = await fetch(`/api/admin/invoices?${params.toString()}`, {
            credentials: 'include',
          });

          if (!response.ok) {
            const error = new Error('Kunde inte ladda fakturor');
            captureAdminError('admin.billing.invoices.load', error, {
              env,
              status,
            });
            throw error;
          }

          return (await response.json()) as InvoiceResponse;
        },
        { env, status },
      ),
  });

  const invoices = data?.invoices ?? [];
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
          tone="warning"
        />
        <SummaryCard
          label="Betalda"
          value={formatSek(paid.reduce((sum, invoice) => sum + invoice.amount_due, 0))}
          tone="success"
        />
        <SummaryCard
          label="Delvis krediterade"
          value={String(partiallyRefunded.length)}
          tone="info"
        />
        <SummaryCard label="Totalt antal" value={String(invoices.length)} />
        <button
          type="button"
          onClick={() => void syncInvoices()}
          disabled={isPending}
          className="self-start rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50 lg:ml-auto"
        >
          {isPending ? 'Synkar...' : 'Synka från Stripe'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <FilterChips
        options={statusFilters}
        value={status}
        onChange={(nextStatus) => {
          const params = new URLSearchParams(window.location.search);
          params.set('status', nextStatus);
          params.set('env', env);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }}
      />

      <AdminTable
        columns={[
          ...columns.slice(0, 5),
          {
            ...columns[5],
            render: (invoice) => (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Korrigera
                </button>
              </div>
            ),
          },
        ]}
        rows={invoices}
        getRowKey={(invoice) => invoice.id}
        rowHrefBuilder={(invoice) =>
          invoice.customer_profile_id ? `/admin/customers/${invoice.customer_profile_id}` : null
        }
        loadingRows={isLoading ? 6 : 0}
        emptyLabel="Inga fakturor hittades."
        gridTemplateColumns="2fr 1fr 1fr 1fr 140px 120px"
      />

      <InvoiceOperationsModal
        invoiceId={selectedInvoiceId}
        open={Boolean(selectedInvoiceId)}
        onClose={() => setSelectedInvoiceId(null)}
        onUpdated={async () => {
          setSelectedInvoiceId(null);
          await refreshInvoices();
        }}
      />
    </div>
  );
}
