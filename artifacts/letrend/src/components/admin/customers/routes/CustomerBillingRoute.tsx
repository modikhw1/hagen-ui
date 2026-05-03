'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCash,
  IconExternalLink,
  IconPlayerPause,
  IconPlus,
  IconTag,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';

import { InvoiceDetailModal } from '@/components/admin/billing/invoices/InvoiceDetailModal';
import PendingInvoiceItems from '@/components/admin/customers/PendingInvoiceItems';
import DiscountModal from '@/components/admin/customers/modals/DiscountModal';
import { InitialPriceModal } from '@/components/admin/customers/modals/InitialPriceModal';
import { PauseSubscriptionModal } from '@/components/admin/customers/modals/PauseSubscriptionModal';
import { StandaloneInvoiceModal } from '@/components/admin/customers/modals/StandaloneInvoiceModal';
import { UpdatePricingDialog } from '@/components/admin/customers/modals/UpdatePricingDialog';
import { CreditNotesSection } from '@/components/admin/customers/sections/CreditNotesSection';
import { useCustomerBalance } from '@/hooks/admin/useCustomerBalance';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import {
  deriveCustomerContractState,
  describeContractState,
} from '@/lib/admin/customer-contract-state';

interface ActionButtonProps {
  enabled: boolean;
  reason: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
  variant?: 'light' | 'filled' | 'outline' | 'subtle' | 'default';
}

function ActionButton({
  enabled,
  reason,
  icon,
  label,
  onClick,
  color,
  variant = 'light',
}: ActionButtonProps) {
  const button = (
    <Button
      size="sm"
      variant={variant}
      color={color}
      leftSection={icon}
      onClick={onClick}
      disabled={!enabled}
    >
      {label}
    </Button>
  );
  if (enabled) return button;
  return (
    <Tooltip label={reason} withArrow position="top">
      <span style={{ display: 'inline-flex' }}>{button}</span>
    </Tooltip>
  );
}

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
  upcoming_price_change?: {
    price_ore: number;
    effective_date: string;
  } | null;
  environment_warning?: {
    message: string;
  } | null;
  discount?: {
    type: string;
    value: number;
    ends_at: string | null;
  } | null;
}

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
  // Sync local mirror whenever the parent passes new initialData (e.g.
  // after useAdminRefresh invalidates customer-billing). Without this,
  // the badge / price / contract state would stay stale until a full
  // remount.
  useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const { data: customer } = useCustomerDetail(customerId);
  const canManageBilling = permissions?.canManageBilling === true;
  const hasStripeCustomer = Boolean(data.stripe_customer_id);
  const hasSubscriptionLink = Boolean(data.stripe_subscription_id);
  const hasManageableBillingEnvironment = !data.environment_warning;

  const contractState = deriveCustomerContractState({
    pricing_status: data.pricing_status,
    monthly_price_ore: data.monthly_price_ore,
    subscription_status: data.subscription_status,
    stripe_customer_id: data.stripe_customer_id,
    stripe_subscription_id: data.stripe_subscription_id,
    environment_warning: data.environment_warning ?? null,
  });

  const isOnboarding =
    contractState === 'onboarding_no_price' || contractState === 'onboarding_priced';
  const isPaused = contractState === 'paused';
  const isCancelled = contractState === 'cancelled';

  const canManagePendingItems =
    canManageBilling && hasStripeCustomer && hasManageableBillingEnvironment;
  const canCreateManualInvoice =
    canManageBilling && hasStripeCustomer && hasManageableBillingEnvironment;
  const canChangePricing =
    canManageBilling && hasSubscriptionLink && hasManageableBillingEnvironment;
  const canPause =
    canManageBilling && hasSubscriptionLink && hasManageableBillingEnvironment && !isCancelled;
  const canManageDiscount = canManageBilling;
  const canSetInitialPrice = canManageBilling && isOnboarding;
  const invoices = data.invoices ?? [];

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(initialInvoiceId ?? null);
  const [standaloneOpen, setStandaloneOpen] = useState(initialStandaloneOpen === true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [initialPriceOpen, setInitialPriceOpen] = useState(false);
  const { data: balance } = useCustomerBalance(customerId);

  const noStripeReason = !hasStripeCustomer
    ? 'Kunden saknar Stripe-koppling i aktiv miljö.'
    : !hasSubscriptionLink
      ? 'Kunden har ingen aktiv abonnemangskoppling.'
      : null;

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
    effectivePriceOre = Math.round(data.monthly_price_ore * (1 - data.discount.value / 100));
  } else if (data.discount?.type === 'amount') {
    effectivePriceOre = Math.max(0, data.monthly_price_ore - data.discount.value * 100);
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
      {canManageBilling ? (
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed" fw={600} tt="uppercase" pl={6}>
              Snabbåtgärder
            </Text>
            <Group gap="xs" wrap="wrap">
              {canSetInitialPrice ? (
                <Button
                  size="sm"
                  variant="filled"
                  color="blue"
                  leftSection={<IconCash size={14} />}
                  onClick={() => setInitialPriceOpen(true)}
                >
                  Sätt inledande pris
                </Button>
              ) : (
                <ActionButton
                  enabled={canChangePricing}
                  reason={noStripeReason ?? 'Aktivt abonnemang krävs.'}
                  icon={<IconCash size={14} />}
                  label="Ändra pris"
                  onClick={() => setPricingOpen(true)}
                />
              )}
              <ActionButton
                enabled={canCreateManualInvoice}
                reason={noStripeReason ?? 'Stripe-koppling krävs.'}
                icon={<IconPlus size={14} />}
                label="Skapa engångsfaktura"
                onClick={() => setStandaloneOpen(true)}
              />
              {canManageDiscount ? (
                <Button
                  size="sm"
                  variant="light"
                  leftSection={<IconTag size={14} />}
                  onClick={() => setDiscountOpen(true)}
                >
                  Rabatt
                </Button>
              ) : null}
              <ActionButton
                enabled={canPause}
                reason={
                  isCancelled
                    ? 'Abonnemanget är avslutat.'
                    : noStripeReason ?? 'Aktivt abonnemang krävs.'
                }
                icon={<IconPlayerPause size={14} />}
                label={isPaused ? 'Återuppta abonnemang' : 'Pausa abonnemang'}
                color={isPaused ? 'blue' : 'orange'}
                variant={isPaused ? 'filled' : 'light'}
                onClick={() => setPauseOpen(true)}
              />
            </Group>
          </Group>
        </Paper>
      ) : null}

      <Card withBorder padding="md">
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600}>
            Abonnemang & pris
          </Text>
        </Group>
        <Group grow align="flex-start">
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Baspris (MRR)
            </Text>
            <Group gap="xs" align="baseline">
              <Text size="lg" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {(data.monthly_price_ore / 100).toLocaleString('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  maximumFractionDigits: 0,
                })}
              </Text>
              {hasDiscount ? (
                <Badge variant="light" color="orange" leftSection={<IconTag size={10} />}>
                  {discountLabel}
                </Badge>
              ) : null}
            </Group>
            {hasDiscount ? (
              <Text size="xs" c="dimmed">
                Effektivt pris:{' '}
                {(effectivePriceOre / 100).toLocaleString('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  maximumFractionDigits: 0,
                })}
              </Text>
            ) : null}
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Status
            </Text>
            <Box>
              {(() => {
                const desc = describeContractState(contractState);
                return (
                  <Badge color={desc.tone} variant="filled">
                    {desc.label}
                  </Badge>
                );
              })()}
            </Box>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Nasta faktura
            </Text>
            <Text size="sm" fw={500}>
              {data.next_invoice_date
                ? format(new Date(data.next_invoice_date), 'd MMM yyyy', { locale: sv })
                : '-'}
            </Text>
          </Stack>
        </Group>
        {balance && balance.balance_ore !== 0 ? (
          <Alert
            color={balance.balance_ore < 0 ? 'green' : 'orange'}
            mt="md"
            variant="light"
          >
            {balance.balance_ore < 0 ? (
              <>
                Kunden har ett tillgodohavande pa{' '}
                <strong>
                  {(Math.abs(balance.balance_ore) / 100).toLocaleString('sv-SE', {
                    style: 'currency',
                    currency: (balance.currency ?? 'sek').toUpperCase(),
                    maximumFractionDigits: 0,
                  })}
                </strong>{' '}
                som dras automatiskt pa nasta faktura.
              </>
            ) : (
              <>
                Kunden har en utestaende skuld pa{' '}
                <strong>
                  {(balance.balance_ore / 100).toLocaleString('sv-SE', {
                    style: 'currency',
                    currency: (balance.currency ?? 'sek').toUpperCase(),
                    maximumFractionDigits: 0,
                  })}
                </strong>{' '}
                som laggs pa nasta faktura.
              </>
            )}
          </Alert>
        ) : null}
        {canManageBilling && !hasStripeCustomer ? (
          <Alert color="yellow" mt="md">
            Kunden saknar Stripe-koppling i aktiv miljö. Billing-åtgärder är därför dolda.
          </Alert>
        ) : null}
        {canManageBilling && hasStripeCustomer && !hasSubscriptionLink ? (
          <Alert color="blue" mt="md">
            Kunden har ingen aktiv abonnemangskoppling i den här Stripe-miljön.
            Engångsfaktura kan fortfarande användas.
          </Alert>
        ) : null}
      </Card>

      <PendingInvoiceItems
        customerId={customerId}
        basePriceOre={effectivePriceOre}
        nextInvoiceDate={data.next_invoice_date}
        canManageItems={canManagePendingItems}
        hasStripeCustomer={hasStripeCustomer}
      />

      <Card withBorder padding="md">
        {data.environment_warning ? (
          <Box mb="md">
            <Badge color="yellow" variant="light">
              {data.environment_warning.message}
            </Badge>
          </Box>
        ) : null}
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600}>
            Fakturahistorik
          </Text>
          {canCreateManualInvoice ? (
            <Button variant="outline" size="sm" onClick={() => setStandaloneOpen(true)}>
              Skapa engangsfaktura
            </Button>
          ) : null}
        </Group>
        {invoices.length === 0 ? (
          <Text size="sm" c="dimmed" fs="italic" py="xl">
            Inga fakturor an.
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
                        {invoice.number ?? invoice.stripe_invoice_id.slice(0, 12)}
                      </Text>
                      {invoice.has_incomplete_operation ? (
                        <IconAlertTriangle size={16} color="var(--mantine-color-red-6)" />
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {format(new Date(invoice.created_at), 'd MMM yyyy', { locale: sv })}
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
                  <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <Text size="sm">{amountLabel(invoice)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      {invoice.status === 'paid' && canManageBilling ? (
                        <ActionIcon
                          variant="subtle"
                          color="orange"
                          title="Aterbetala / kreditera"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenInvoiceId(invoice.stripe_invoice_id);
                          }}
                        >
                          <IconArrowBackUp size={14} />
                        </ActionIcon>
                      ) : null}
                      {invoice.hosted_invoice_url ? (
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
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <CreditNotesSection
        customerId={customerId}
        onOpenInvoice={(stripeInvoiceId) => setOpenInvoiceId(stripeInvoiceId)}
      />

      {openInvoiceId ? (
        <InvoiceDetailModal
          open={!!openInvoiceId}
          onOpenChange={(open) => !open && setOpenInvoiceId(null)}
          invoiceId={openInvoiceId}
          customerId={customerId}
          onInvoiceChanged={upsertInvoiceInState}
        />
      ) : null}

      {canManageBilling ? (
        <>
          {canCreateManualInvoice ? (
            <StandaloneInvoiceModal
              open={standaloneOpen}
              onOpenChange={setStandaloneOpen}
              customerId={customerId}
              customerName={customerName}
              onCreated={upsertInvoiceInState}
            />
          ) : null}
          {canChangePricing ? (
            <UpdatePricingDialog
              key={data.monthly_price_ore}
              open={pricingOpen}
              onOpenChange={setPricingOpen}
              customerId={customerId}
              currentPriceOre={data.monthly_price_ore}
              upcomingPrice={data.upcoming_price_change ?? null}
            />
          ) : null}
          {canManageDiscount && customer ? (
            <DiscountModal
              open={discountOpen}
              onClose={() => setDiscountOpen(false)}
              customerId={customerId}
              customer={customer}
            />
          ) : null}
          {canSetInitialPrice ? (
            <InitialPriceModal
              open={initialPriceOpen}
              onClose={() => setInitialPriceOpen(false)}
              customerId={customerId}
            />
          ) : null}
          {canPause ? (
            <PauseSubscriptionModal
              open={pauseOpen}
              onOpenChange={setPauseOpen}
              customerId={customerId}
              customerName={customerName}
              resumeMode={isPaused}
              pausedUntil={null}
              nextInvoiceDate={data.next_invoice_date}
              nextInvoiceAmountOre={effectivePriceOre}
            />
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
