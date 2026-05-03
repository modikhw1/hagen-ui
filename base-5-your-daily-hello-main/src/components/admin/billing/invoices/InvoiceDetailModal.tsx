// app/src/components/admin/billing/invoices/InvoiceDetailModal.tsx

'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Modal,
  Accordion,
  Badge,
  Alert,
  Divider,
} from '@mantine/core';

import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { InvoicePreview } from './InvoicePreview';
import { CreditReissueWizard } from './CreditReissueWizard';
import { InvoiceLineEditor } from './InvoiceLineEditor';
import { InvoiceStatusTimeline } from './InvoiceStatusTimeline';
import { InvoiceActionRow } from './InvoiceActionRow';

interface InvoiceDetail {
  stripe_invoice_id: string;
  number: string | null;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  customer_name: string;
  customer_profile_id: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created_at: string;
  due_date: string | null;
  environment: 'test' | 'live';
  lines: Array<{
    id: string;
    description: string;
    amount: number;
    quantity: number;
  }>;
  operations: Array<{
    id: string;
    operation_type: string;
    status: string;
    requires_attention: boolean;
    attention_reason: string | null;
    stripe_credit_note_id: string | null;
    stripe_reissue_invoice_id: string | null;
    error_message: string | null;
    idempotency_key: string;
    created_at: string;
  }>;
  permissions?: {
    can_manage_adjustments?: boolean;
  };
  billing_context?: {
    stripe_subscription_id?: string | null;
    has_active_subscription?: boolean;
    can_refund_payment_method?: boolean;
  };
  warning?: {
    type: string;
    message: string;
    details?: string;
  };
}

export interface InvoiceDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  customerId?: string;
  onInvoiceChanged?: (invoice: {
    stripe_invoice_id: string;
    number: string | null;
    status: string;
    amount_due: number;
    amount_paid: number;
    display_amount_ore: number;
    currency: string;
    created_at: string;
    hosted_invoice_url: string | null;
    has_incomplete_operation: boolean;
  }) => void;
}

export function InvoiceDetailModal({
  open,
  onOpenChange,
  invoiceId,
  customerId,
  onInvoiceChanged,
}: InvoiceDetailModalProps) {
  const { data, isLoading, error, refetch } = useQuery<InvoiceDetail>({
    queryKey: ['admin', 'invoice', invoiceId, customerId ?? null],
    queryFn: async () => {
      const params = customerId
        ? `?customerId=${encodeURIComponent(customerId)}`
        : '';
      const res = await fetch(`/api/admin/invoices/${invoiceId}${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: open,
    staleTime: 5_000,
  });

  const refresh = useAdminRefresh();

  const canManageAdjustments = data?.permissions?.can_manage_adjustments === true;
  const invoiceLines = data?.lines ?? [];
  const operations = data?.operations ?? [];
  const incompleteOp = operations.find(
    (op) => op.requires_attention && op.status === 'failed',
  );

  const handleRefresh = async () => {
    if (!data) return;
    const refreshed = await refetch();
    const freshData = refreshed.data;
    if (freshData && onInvoiceChanged) {
      onInvoiceChanged({
        stripe_invoice_id: freshData.stripe_invoice_id,
        number: freshData.number,
        status: freshData.status,
        amount_due: freshData.amount_due,
        amount_paid: freshData.amount_paid,
        display_amount_ore: Math.max(
          freshData.amount_due ?? 0,
          freshData.amount_paid ?? 0,
        ),
        currency: freshData.currency,
        created_at: freshData.created_at,
        hosted_invoice_url: freshData.hosted_invoice_url,
        has_incomplete_operation: freshData.operations.some(
          (operation) => operation.requires_attention && operation.status === 'failed',
        ),
      });
    }
    await refresh([
      { type: 'customer-billing', customerId: data.customer_profile_id },
      'billing',
    ]);
  };


  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      size="xl"
      title={
        <div className="flex items-center gap-3 text-lg font-semibold">
          Faktura {data?.number ?? invoiceId}
          {data?.status && <StatusBadge status={data.status} />}
        </div>
      }
    >
      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laddar fakturadata...
        </div>
      )}

      {error && (
        <Alert color="red" icon={<AlertTriangle className="h-4 w-4" />}>
          Kunde inte ladda faktura:{' '}
          {error instanceof Error ? error.message : 'Okänt fel'}
        </Alert>
      )}

      {data && (
        <div className="space-y-5">
          {data.warning && (
            <Alert
              color="yellow"
              title="Stripe-data kunde inte verifieras"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              {data.warning.message}
            </Alert>
          )}

          {incompleteOp && (
            <Alert
              color="red"
              title="Ofullständig kreditering"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              <div className="space-y-2">
                <p>{incompleteOp.attention_reason}</p>
                <p className="text-xs">
                  Operations-ID: <code>{incompleteOp.id}</code>
                </p>
                {canManageAdjustments && (
                  <p className="text-xs">
                    Öppna justeringsformuläret igen för att skapa en ny
                    ersättningsfaktura med kontrollerade värden.
                  </p>
                )}
              </div>
            </Alert>
          )}

          <section className="grid grid-cols-2 gap-4 text-sm">
            <KeyValue label="Kund" value={data.customer_name} />
            <KeyValue
              label="Totalt"
              value={formatAmount(data.amount_due, data.currency)}
            />
            <KeyValue
              label="Betalt"
              value={formatAmount(data.amount_paid, data.currency)}
            />
            <KeyValue
              label="Skapad"
              value={format(new Date(data.created_at), 'd MMM yyyy HH:mm', {
                locale: sv,
              })}
            />
            {data.due_date && (
              <KeyValue
                label="Förfallodatum"
                value={format(new Date(data.due_date), 'd MMM yyyy', {
                  locale: sv,
                })}
              />
            )}
            <KeyValue
              label="Miljö"
              value={
                <Badge
                  variant={data.environment === 'live' ? 'filled' : 'light'}
                >
                  {data.environment}
                </Badge>
              }
            />
          </section>

          {/* Visuell faktura-preview (ser ut som ett fakturadokument) */}
          <InvoicePreview
            number={data.number}
            status={data.status}
            createdAt={data.created_at}
            dueDate={data.due_date}
            currency={data.currency}
            amountDue={data.amount_due}
            amountPaid={data.amount_paid}
            customerName={data.customer_name}
            environment={data.environment}
            lines={invoiceLines}
          />

          <InvoiceActionRow
            invoiceId={invoiceId}
            status={data.status}
            hostedInvoiceUrl={data.hosted_invoice_url}
            invoicePdf={data.invoice_pdf}
            canManage={canManageAdjustments}
            onChanged={handleRefresh}
          />

          <Accordion defaultValue="timeline" variant="separated">
            <Accordion.Item value="timeline">
              <Accordion.Control>Statushistorik & händelser</Accordion.Control>
              <Accordion.Panel>
                <InvoiceStatusTimeline invoiceId={invoiceId} />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Divider />

          {canManageAdjustments &&
            (data.status === 'paid' || data.status === 'open') && (
              <Accordion defaultValue={data.status === 'paid' ? 'adjust' : undefined}>
                <Accordion.Item value="adjust">
                  <Accordion.Control>
                    {data.status === 'paid'
                      ? 'Återbetala / Kreditera'
                      : 'Justera / Kreditera'}
                  </Accordion.Control>
                  <Accordion.Panel>
                     <CreditReissueWizard
                       invoiceId={invoiceId}
                       customerId={data.customer_profile_id}
                       invoiceStatus={data.status}
                       defaultAmountOre={Math.max(
                         data.amount_due ?? 0,
                         data.amount_paid ?? 0,
                       )}
                       currency={data.currency}
                       lines={invoiceLines}
                       hasActiveSubscription={
                         data.billing_context?.has_active_subscription === true
                       }
                       canRefundPaymentMethod={
                         data.billing_context?.can_refund_payment_method === true
                       }
                       onCompleted={handleRefresh}
                     />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

          {canManageAdjustments && data.status !== 'void' && (
            <Accordion>
              <Accordion.Item value="edit-lines">
                <Accordion.Control>Redigera fakturarader</Accordion.Control>
                <Accordion.Panel>
                  <InvoiceLineEditor
                    invoiceId={invoiceId}
                    invoiceStatus={data.status}
                    onChanged={handleRefresh}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}

          {operations.length > 0 && (
            <Accordion>
              <Accordion.Item value="history">
                <Accordion.Control>
                  Tidigare justeringar ({operations.length})
                </Accordion.Control>
                <Accordion.Panel>
                  <ul className="space-y-2 text-sm">
                    {operations.map((op) => (
                      <li
                        key={op.id}
                        className="space-y-1 rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {op.operation_type}
                          </span>
                          <Badge
                            variant={
                              op.status === 'completed'
                                ? 'filled'
                                : op.requires_attention
                                  ? 'filled'
                                  : 'light'
                            }
                            color={op.requires_attention ? 'red' : undefined}
                          >
                            {op.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(op.created_at), 'd MMM yyyy HH:mm', {
                            locale: sv,
                          })}
                        </p>
                        {op.error_message && (
                          <p className="text-xs text-red-600">
                            {op.error_message}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
        </div>
      )}
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: 'filled' | 'light' | 'outline' =
    status === 'paid'
      ? 'filled'
      : status === 'open'
        ? 'light'
        : status === 'uncollectible' || status === 'void'
          ? 'filled'
          : 'outline';
  const color =
    status === 'uncollectible' || status === 'void' ? 'red' : undefined;
  return (
    <Badge variant={variant} color={color}>
      {status}
    </Badge>
  );
}

function KeyValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function formatAmount(amountOre: number, currency: string): string {
  return (amountOre / 100).toLocaleString('sv-SE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  });
}
