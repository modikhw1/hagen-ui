'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  IconAlertTriangle,
  IconExternalLink,
  IconTag,
} from '@tabler/icons-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Group,
  Text,
  Stack,
  ActionIcon,
  Box,
  Alert,
} from '@mantine/core';

import PendingInvoiceItems from '@/components/admin/customers/PendingInvoiceItems';
import { InvoiceDetailModal } from '@/components/admin/billing/invoices/InvoiceDetailModal';
import { StandaloneInvoiceModal } from '@/components/admin/customers/modals/StandaloneInvoiceModal';
import { UpdatePricingDialog } from '@/components/admin/customers/modals/UpdatePricingDialog';

export interface CustomerBillingInvoice {
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
}

export interface CustomerBillingInitialData {
  monthly_price_ore: number;
  pricing_status: string;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  next_invoice_date: string | null;
  invoices: CustomerBillingInvoice[];
  environment_warning?: {
    message: string;
  } | null;
  discount?: {
    type: string;
    value: number;
    ends_at: string | null;
  } | null;
}

const statusLabels: Record<string, string> = {
  active: 'Aktivt',
  trialing: 'Provperiod',
  past_due: 'Förfallet',
  uncollectible: 'Går ej att driva in',
  canceled: 'Avslutat',
  incomplete: 'Ofullständigt',
  incomplete_expired: 'Utgått',
  paused: 'Pausat',
  paid: 'Betald',
  open: 'Öppen',
  void: 'Annullerad',
  draft: 'Utkast',
};

const statusTones: Record<string, string> = {
  active: 'blue',
  paid: 'green',
  past_due: 'red',
  uncollectible: 'red',
  void: 'gray',
  open: 'blue',
};

export interface CustomerBillingRouteProps {
  customerId: string;
  customerName: string;
  initialData: CustomerBillingInitialData;
  initialInvoiceId?: string | null;
  initialStandaloneOpen?: boolean;
  permissions?: {
    canManageBilling?: boolean;
  };
}

function sortBillingInvoices(invoices: CustomerBillingInvoice[]) {
  return [...invoices].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

export function CustomerBillingRoute(props: CustomerBillingRouteProps) {
  const {
    customerId,
    customerName,
    initialData,
    initialInvoiceId,
    initialStandaloneOpen,
    permissions,
  } = props;

  const [data, setData] = useState(initialData);
  const canManageBilling = permissions?.canManageBilling === true;
  const hasStripeCustomer = Boolean(data.stripe_customer_id);
  const hasSubscriptionLink = Boolean(data.stripe_subscription_id);
  const hasManageableBillingEnvironment = !data.environment_warning;
  const canManagePendingItems =
    canManageBilling && hasStripeCustomer && hasManageableBillingEnvironment;
  const canCreateManualInvoice =
    canManageBilling && hasStripeCustomer && hasManageableBillingEnvironment;
  const canChangePricing =
    canManageBilling && hasSubscriptionLink && hasManageableBillingEnvironment;
  const invoices = data.invoices ?? [];

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(
    initialInvoiceId ?? null,
  );
  const [standaloneOpen, setStandaloneOpen] = useState(
    initialStandaloneOpen === true,
  );
  const [pricingOpen, setPricingOpen] = useState(false);

  function upsertInvoiceInState(nextInvoice: CustomerBillingInvoice) {
    setData((current) => {
      const existing = current.invoices ?? [];
      const merged = existing.some(
        (invoice) => invoice.stripe_invoice_id === nextInvoice.stripe_invoice_id,
      )
        ? existing.map((invoice) =>
            invoice.stripe_invoice_id === nextInvoice.stripe_invoice_id
              ? { ...invoice, ...nextInvoice }
              : invoice,
          )
        : [nextInvoice, ...existing];

      return {
        ...current,
        invoices: sortBillingInvoices(merged),
      };
    });
  }

  const hasDiscount = !!data.discount;
  let effectivePriceOre = data.monthly_price_ore;
  if (data.discount?.type === 'percent') {
    effectivePriceOre = Math.round(
      data.monthly_price_ore * (1 - data.discount.value / 100),
    );
  } else if (data.discount?.type === 'amount') {
    effectivePriceOre = Math.max(
      0,
      data.monthly_price_ore - data.discount.value * 100,
    );
  } else if (data.discount?.type === 'free_months') {
    effectivePriceOre = 0;
  }

  const discountLabel =
    data.discount?.type === 'free_months'
      ? `${data.discount.value} gratis månader`
      : `${data.discount?.value}${data.discount?.type === 'percent' ? '%' : ' kr'} rabatt`;

  const amountLabel = (invoice: CustomerBillingInvoice) => {
    return (invoice.display_amount_ore / 100).toLocaleString('sv-SE', {
      style: 'currency',
      currency: invoice.currency.toUpperCase(),
      maximumFractionDigits: 0,
    });
  };

  return (
    <Stack gap="lg">
      <Card withBorder padding="md">
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600}>
            Abonnemang & pris
          </Text>
          {canChangePricing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPricingOpen(true)}
            >
              Hantera prissättning
            </Button>
          )}
        </Group>
        <Group grow align="flex-start">
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Baspris (MRR)
            </Text>
            <Group gap="xs" align="baseline">
              <Text
                size="lg"
                fw={600}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {(data.monthly_price_ore / 100).toLocaleString('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  maximumFractionDigits: 0,
                })}
              </Text>
              {hasDiscount && (
                <Badge
                  variant="light"
                  color="orange"
                  leftSection={<IconTag size={10} />}
                >
                  {discountLabel}
                </Badge>
              )}
            </Group>
            {hasDiscount && (
              <Text size="xs" c="dimmed">
                Effektivt pris:{' '}
                {(effectivePriceOre / 100).toLocaleString('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  maximumFractionDigits: 0,
                })}
              </Text>
            )}
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Status
            </Text>
            <Box>
              <Badge
                color={statusTones[data.subscription_status ?? ''] || 'gray'}
                variant="filled"
              >
                {data.subscription_status
                  ? statusLabels[data.subscription_status] ||
                    data.subscription_status
                  : 'Inget abonnemang'}
              </Badge>
            </Box>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Nästa faktura
            </Text>
            <Text size="sm" fw={500}>
              {data.next_invoice_date
                ? format(new Date(data.next_invoice_date), 'd MMM yyyy', {
                    locale: sv,
                  })
                : '—'}
            </Text>
          </Stack>
        </Group>
        {canManageBilling && !hasStripeCustomer && (
          <Alert color="yellow" mt="md">
            Kunden saknar Stripe-koppling i aktiv miljö. Billing-åtgärder är
            därför dolda.
          </Alert>
        )}
        {canManageBilling && hasStripeCustomer && !hasSubscriptionLink && (
          <Alert color="blue" mt="md">
            Kunden har ingen aktiv abonnemangskoppling i den här Stripe-miljön.
            Engångsfaktura kan fortfarande användas.
          </Alert>
        )}
      </Card>

      <PendingInvoiceItems
        customerId={customerId}
        basePriceOre={effectivePriceOre}
        nextInvoiceDate={data.next_invoice_date}
        canManageItems={canManagePendingItems}
        hasStripeCustomer={hasStripeCustomer}
      />

      <Card withBorder padding="md">
        {data.environment_warning && (
          <Box mb="md">
            <Badge color="yellow" variant="light">
              {data.environment_warning.message}
            </Badge>
          </Box>
        )}
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600}>
            Fakturahistorik
          </Text>
          {canCreateManualInvoice && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStandaloneOpen(true)}
            >
              Skapa engångsfaktura
            </Button>
          )}
        </Group>
        {invoices.length === 0 ? (
          <Text size="sm" c="dimmed" fs="italic" py="xl">
            Inga fakturor än.
          </Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nummer</Table.Th>
                <Table.Th>Skapad</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Belopp</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invoices.map((invoice) => (
                <Table.Tr
                  key={invoice.stripe_invoice_id}
                  onClick={() => setOpenInvoiceId(invoice.stripe_invoice_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {invoice.number ??
                          invoice.stripe_invoice_id.slice(0, 12)}
                      </Text>
                      {invoice.has_incomplete_operation && (
                        <IconAlertTriangle
                          size={16}
                          color="var(--mantine-color-red-6)"
                        />
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {format(new Date(invoice.created_at), 'd MMM yyyy', {
                        locale: sv,
                      })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        invoice.status === 'paid'
                          ? 'green'
                          : invoice.status === 'open'
                            ? 'blue'
                            : 'gray'
                      }
                      variant="light"
                    >
                      {invoice.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <Text size="sm">{amountLabel(invoice)}</Text>
                  </Table.Td>
                  <Table.Td>
                    {invoice.hosted_invoice_url && (
                      <ActionIcon
                        variant="subtle"
                        component="a"
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {openInvoiceId && (
        <InvoiceDetailModal
          open={!!openInvoiceId}
          onOpenChange={(open) => !open && setOpenInvoiceId(null)}
          invoiceId={openInvoiceId}
          customerId={customerId}
          onInvoiceChanged={upsertInvoiceInState}
        />
      )}

      {canManageBilling && (
        <>
          {canCreateManualInvoice && (
            <StandaloneInvoiceModal
              open={standaloneOpen}
              onOpenChange={setStandaloneOpen}
              customerId={customerId}
              customerName={customerName}
              onCreated={upsertInvoiceInState}
            />
          )}
          {canChangePricing && (
            <UpdatePricingDialog
              key={data.monthly_price_ore}
              open={pricingOpen}
              onOpenChange={setPricingOpen}
              customerId={customerId}
              currentPriceOre={data.monthly_price_ore}
            />
          )}
        </>
      )}
    </Stack>
  );
}
