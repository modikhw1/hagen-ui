'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminTable, { type AdminTableColumn } from '@/components/admin/_shared/AdminTable';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { InvoiceDetailModal } from '@/components/admin/billing/invoices/InvoiceDetailModal';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import {
  type BillingInvoiceStatusFilter,
  type EnvFilter,
} from '@/lib/admin/billing';
import { useStripeSyncInvoices } from '@/lib/admin/billing-ops';
import {
  billingInvoicesResponseSchema,
  type BillingInvoicesResponse,
} from '@/lib/admin/dtos/billing';
import { parseDto } from '@/lib/admin/dtos/parse';
import { invoiceStatusConfig, invoiceStatusLabel } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { shortDateSv, monthYearSv } from '@/lib/admin/time';
import { cn } from '@/lib/utils';
import { EnvTag } from '../shared/EnvTag';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { AdminActionMenu } from '@/components/admin/ui/AdminActionMenu';
import { FileText, Receipt, Scissors } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

export default function InvoicesRoute({
  env,
  status,
  page,
}: {
  env: EnvFilter;
  status: BillingInvoiceStatusFilter;
  page: number;
}) {
  const refresh = useAdminRefresh();
  const refreshInvoices = () => refresh(['billing']);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const {
    run: syncInvoices,
    isPending,
    rateLimitRemainingSeconds,
  } = useStripeSyncInvoices(env);

  const { data, isLoading } = useQuery({
    queryKey: qk.billing.invoiceList(env, status, page, PAGE_SIZE),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get<BillingInvoicesResponse>('/api/admin/invoices', {
        signal,
        query: {
          limit: PAGE_SIZE,
          page,
          environment: env === 'all' ? undefined : env,
          status: status === 'all' ? undefined : status,
        },
      });
      return parseDto(billingInvoicesResponseSchema, payload, {
        name: 'billingInvoicesResponse',
        path: '/api/admin/invoices',
      });
    },
  });

  const invoices = data?.invoices ?? [];
  const pagination = data?.pagination;

  const columns: Array<AdminTableColumn<BillingInvoicesResponse['invoices'][number]>> = [
    {
      key: 'customer',
      header: 'Kund',
      width: '2fr',
      render: (inv) => (
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{inv.customer_name}</span>
          <EnvTag env={inv.environment} />
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Belopp',
      width: '1fr',
      align: 'right',
      render: (inv) => (
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{formatSek(inv.amount_due)}</span>
            {inv.line_item_count > 1 && (
              <span className="rounded bg-secondary px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                +{inv.line_item_count - 1} rader
              </span>
            )}
          </div>
          {inv.refunded_ore > 0 && (
            <span className="text-[10px] text-muted-foreground">
              · -{formatSek(inv.refunded_ore)} kreditat
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      width: '1fr',
      render: (inv) => (
        <div className="text-xs text-muted-foreground">{monthYearSv(inv.created_at)}</div>
      ),
    },
    {
      key: 'due',
      header: 'Förfaller',
      width: '1fr',
      render: (inv) => {
        const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status === 'open';
        return (
          <div className={cn("text-xs", isOverdue ? "font-medium text-status-danger-fg" : "text-muted-foreground")}>
            {inv.due_date ? shortDateSv(inv.due_date) : '—'}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (inv) => {
        const cfg = invoiceStatusConfig(inv.display_status ?? inv.status);
        return (
          <StatusPill 
            label={cfg.label} 
            tone={cfg.tone}
            size="xs" 
          />
        );
      },
    },
    {
      key: 'action',
      header: '',
      width: '40px',
      align: 'right',
      render: (inv) => (
        <AdminActionMenu
          items={[
            {
              label: 'Visa detaljer/kreditera',
              icon: <FileText className="h-3.5 w-3.5" />,
              onClick: () => setSelectedInvoiceId(inv.id),
            },
            {
              label: 'Ladda ner PDF',
              icon: <Receipt className="h-3.5 w-3.5" />,
              onClick: () => {
                if (inv.invoice_pdf) window.open(inv.invoice_pdf, '_blank');
                else toast.error('Ingen PDF tillgänglig just nu');
              },
            },
          ]}
        />
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
          {data?.summary?.totalCount ?? 0} Fakturor
        </div>
        <button
          onClick={() => setConfirmSyncOpen(true)}
          disabled={isPending || rateLimitRemainingSeconds > 0}
          className="text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isPending ? 'Synkar...' : 'Kör Stripe-synk'}
        </button>
      </div>

      <AdminTable
        columns={columns}
        rows={invoices}
        getRowKey={(inv) => inv.id}
        rowHrefBuilder={(inv) => inv.customer_profile_id ? `/admin/customers/${inv.customer_profile_id}` : null}
        loadingRows={isLoading ? 10 : 0}
        emptyLabel="Inga fakturor hittades."
        gridTemplateColumns="2fr 1fr 1fr 1fr 120px 40px"
        onRowClick={(inv) => setSelectedInvoiceId(inv.id)}
        density="comfortable"
      />

      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 text-xs font-medium text-muted-foreground pt-2">
          <button disabled={!pagination.hasPreviousPage} className="hover:text-foreground disabled:opacity-30">Föregående</button>
          <span>{pagination.page} / {pagination.pageCount}</span>
          <button disabled={!pagination.hasNextPage} className="hover:text-foreground disabled:opacity-30">Nästa</button>
        </div>
      )}

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId!}
        open={Boolean(selectedInvoiceId)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceId(null);
        }}
      />

      <ConfirmActionDialog
        open={confirmSyncOpen}
        onOpenChange={setConfirmSyncOpen}
        title="Kör manuell synk?"
        description="Hämtar in fakturadata från Stripe."
        confirmLabel="Kör synk"
        onConfirm={() => {
          setConfirmSyncOpen(false);
          void syncInvoices();
        }}
        pending={isPending}
      />
    </div>
  );
}
