'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ExternalLink, Settings2 } from 'lucide-react';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { qk } from '@/lib/admin/queryKeys';
import { apiClient } from '@/lib/admin/api-client';
import { invoiceStatusLabel } from '@/lib/admin/labels';
import { InvoiceAdjustmentsSummary } from './shared/InvoiceAdjustmentsSummary';
import { InvoiceCreditModal } from './InvoiceCreditModal';
import { toast } from 'sonner';

export function InvoiceDetailModal({
  invoiceId,
  open,
  onClose,
  onUpdated,
}: {
  invoiceId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: qk.billing.invoiceOperations(invoiceId),
    enabled: open && Boolean(invoiceId),
    queryFn: async () => apiClient.get<any>(`/api/admin/invoices/${invoiceId}`),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: qk.billing.invoiceLines(invoiceId),
    enabled: open && Boolean(invoiceId),
    queryFn: async () => {
      const payload = await apiClient.get<any>(`/api/admin/billing/invoices/${invoiceId}/lines`);
      return payload.lineItems || [];
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => apiClient.patch(`/api/admin/invoices/${invoiceId}`, { action: 'pay' }),
    onSuccess: () => {
      toast.success('Fakturan har markerats som betald');
      onUpdated();
      onClose();
    },
  });

  if (isLoading || !data?.invoice) return null;

  const invoice = data.invoice;
  const adjustments = data.adjustments || { creditNotes: [], refunds: [] };

  return (
    <>
      <AdminFormDialog
        open={open && !adjustOpen}
        onClose={onClose}
        title={`Faktura ${invoiceId.split('_').pop()}`}
        description={invoice.business_name}
        size="lg"
        footer={
          <>
            {invoice.status === 'open' && (
              <button
                onClick={() => payMutation.mutate()}
                disabled={payMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {payMutation.isPending ? 'Sparar...' : 'Markera betald'}
              </button>
            )}
            <button
              onClick={() => setAdjustOpen(true)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Kreditera/justera...
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Stäng
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-foreground">{formatSek(invoice.amount_due ?? 0)}</span>
              <StatusPill 
                label={invoiceStatusLabel(invoice.status)} 
                tone={invoice.status === 'paid' ? 'success' : invoice.status === 'open' ? 'warning' : 'neutral'} 
              />
            </div>
            {invoice.hosted_invoice_url && (
              <a
                href={invoice.hosted_invoice_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Visa i Stripe
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid gap-4 text-xs sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Skapad</div>
              <div className="text-foreground">{shortDateSv(invoice.created_at)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Förfaller</div>
              <div className="text-foreground">{shortDateSv(invoice.due_date) || '—'}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Fakturarader</div>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {lineItems.map((line: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{line.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.quantity} × {formatSek(line.amount / line.quantity)}
                    </div>
                  </div>
                  <div className="font-semibold text-foreground">{formatSek(line.amount)}</div>
                </div>
              ))}
              <div className="flex items-center justify-between bg-secondary/10 p-3 text-sm font-bold">
                <span>Totalt</span>
                <span>{formatSek(invoice.amount_due)}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Justeringar</div>
            <InvoiceAdjustmentsSummary adjustments={adjustments} />
          </div>
        </div>
      </AdminFormDialog>

      <InvoiceCreditModal 
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        invoice={invoice}
        lineItems={lineItems}
        onUpdated={() => {
          onUpdated();
          onClose();
        }}
      />
    </>
  );
}
