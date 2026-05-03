'use client';

import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Card,
  Group,
  Text,
  Stack,
  Badge,
  Button,
  Alert,
} from '@mantine/core';
import { IconAlertTriangle, IconReceipt2 } from '@tabler/icons-react';
import { useCustomerInvoices } from '@/hooks/admin/useCustomerInvoices';
import type { CreditNoteOperation } from '@/lib/admin/dtos/billing';

const OPERATION_LABEL: Record<string, string> = {
  credit_note_only: 'Kreditering',
  credit_note_and_reissue: 'Kreditera & fakturera om',
  refund: 'Återbetalning',
  customer_balance_adjustment: 'Kundsaldo-justering',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'yellow',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
};

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pågår';
    case 'completed':
      return 'Klar';
    case 'failed':
      return 'Misslyckades';
    case 'cancelled':
      return 'Avbruten';
    default:
      return status;
  }
}

function operationLabel(operationType: string) {
  return OPERATION_LABEL[operationType] ?? operationType;
}

function formatAmount(amountOre: number) {
  return (amountOre / 100).toLocaleString('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  });
}

export function CreditNotesSection({
  customerId,
  onOpenInvoice,
}: {
  customerId: string;
  onOpenInvoice?: (stripeInvoiceId: string) => void;
}) {
  const { data, isLoading } = useCustomerInvoices(customerId);
  const operations: CreditNoteOperation[] = data?.operations ?? [];

  if (isLoading || operations.length === 0) {
    return null;
  }

  const attentionOps = operations.filter((op) => op.requires_attention);

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <IconReceipt2 size={18} />
          <Text size="md" fw={600}>
            Krediteringar &amp; återbetalningar
          </Text>
        </Group>
        <Badge variant="light" color="gray">
          {operations.length}
        </Badge>
      </Group>

      {attentionOps.length > 0 && (
        <Alert color="red" mb="md" icon={<IconAlertTriangle size={16} />}>
          {attentionOps.length} av justeringarna kräver uppmärksamhet.
        </Alert>
      )}

      <Stack gap="xs">
        {operations.map((op) => (
          <Group
            key={op.id}
            justify="space-between"
            wrap="nowrap"
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600}>
                  {operationLabel(op.operation_type)}
                </Text>
                <Badge size="sm" color={STATUS_TONE[op.status] ?? 'gray'} variant="light">
                  {statusLabel(op.status)}
                </Badge>
                {op.requires_attention && (
                  <Badge size="sm" color="red" variant="filled">
                    Kräver åtgärd
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {format(new Date(op.created_at), 'd MMM yyyy HH:mm', { locale: sv })}
                {op.attention_reason ? ` · ${op.attention_reason}` : ''}
                {op.error_message ? ` · ${op.error_message}` : ''}
              </Text>
            </Stack>
            <Stack gap={4} align="flex-end">
              <Text
                size="sm"
                fw={600}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                −{formatAmount(op.amount_ore)}
              </Text>
              {onOpenInvoice && op.source_invoice_id && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => onOpenInvoice(op.source_invoice_id)}
                >
                  Visa faktura
                </Button>
              )}
            </Stack>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
