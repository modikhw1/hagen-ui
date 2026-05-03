'use client';

import { useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowRight, Search, Receipt, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import {
  Badge,
  Box,
  Card,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import SummaryCard from '@/components/admin/ui/SummaryCard';
import { StripeSyncFeed } from './StripeSyncFeed';
import { apiClient } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { cn } from '@/lib/utils';

type CustomerSearchHit = {
  id: string;
  business_name?: string | null;
  contact_email?: string | null;
  customer_contact_name?: string | null;
};

type UpcomingRow = {
  customer_id: string;
  business_name: string;
  amount_ore: number;
  invoice_date: string;
  has_stripe_subscription: boolean;
};

type InvoiceSearchHit = {
  id: string;
  stripe_invoice_id: string;
  invoice_number: string | null;
  customer_profile_id: string | null;
  customer_name: string | null;
  total_ore: number;
  display_status: string;
  created_at: string;
};

type BillingEvent = {
  id: string;
  at: string;
  action: string;
  title: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_label: string | null;
  actor_role: string | null;
  customer_profile_id: string | null;
  business_name: string | null;
  amount_ore: number | null;
};

function formatAmountOre(ore: number | null) {
  if (ore == null) return null;
  return `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;
}

function eventColor(action: string): string {
  if (
    action.includes('paid') ||
    action.includes('payment_succeeded') ||
    action.includes('reissued')
  ) {
    return 'green';
  }
  if (
    action.includes('failed') ||
    action.includes('voided') ||
    action.includes('cancelled')
  ) {
    return 'red';
  }
  if (action.includes('paused') || action.includes('discount')) {
    return 'orange';
  }
  return 'blue';
}

export default function BillingPageRoute() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  const isInvoiceSearch = useMemo(() => {
    const value = searchTerm.trim();
    return value.length >= 3 && /^[A-Z0-9-]+$/i.test(value) && /\d/.test(value);
  }, [searchTerm]);

  const invoicesQuery = useQuery({
    queryKey: qk.billing.invoiceList('all' as never, 'all', 1, 1),
    queryFn: async () =>
      apiClient.get<{
        summary: {
          openOre: number;
          paidOre: number;
          invoicesNeedingActionCount: number;
        };
      }>('/api/admin/invoices', { query: { limit: 1 } }),
  });

  const subsQuery = useQuery({
    queryKey: qk.billing.subscriptionList('all' as never, 'all', 1, 1),
    queryFn: async () =>
      apiClient.get<{
        summary: {
          mrrOre: number;
          activeCount: number;
          mrr30dAgoOre?: number;
        };
      }>('/api/admin/subscriptions', { query: { limit: 1 } }),
  });

  const attentionQuery = useQuery({
    queryKey: qk.overview.attention('standard'),
    queryFn: async () =>
      apiClient.get<{ attentionItems: Array<Record<string, unknown>> }>(
        '/api/admin/overview/attention',
        { query: { sort: 'standard' } },
      ),
  });

  const billingAttention = useMemo(() => {
    const items = attentionQuery.data?.attentionItems ?? [];
    const billingTypes = new Set(['invoice_unpaid', 'credit_note_failed', 'customer_blocked']);
    return items.filter((item) => billingTypes.has(String(item.type))).slice(0, 8);
  }, [attentionQuery.data]);

  const upcomingQuery = useQuery({
    queryKey: ['admin', 'billing', 'upcoming', 30],
    queryFn: async () =>
      apiClient.get<{
        upcoming: UpcomingRow[];
        summary: { totalOre: number; count: number };
      }>('/api/admin/billing/upcoming', { query: { days: 30 } }),
    staleTime: 60_000,
  });

  const eventsQuery = useQuery({
    queryKey: ['admin', 'billing', 'recent-events'],
    queryFn: async () =>
      apiClient.get<{ events: BillingEvent[] }>('/api/admin/billing/recent-events', {
        query: { limit: 15 },
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const customerSearch = useQuery({
    queryKey: ['admin', 'billing', 'cockpit', 'customer-search', searchTerm],
    queryFn: async () => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < 2) return { customers: [] as CustomerSearchHit[] };
      return apiClient.get<{ customers: CustomerSearchHit[] }>('/api/admin/customers', {
        query: { q: trimmed, limit: 8 },
      });
    },
    enabled: searchTerm.trim().length >= 2,
    staleTime: 10_000,
  });

  const invoiceSearch = useQuery<{ invoices: InvoiceSearchHit[] }>({
    queryKey: ['admin', 'billing', 'cockpit', 'invoice-search', searchTerm],
    queryFn: async (): Promise<{ invoices: InvoiceSearchHit[] }> => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < 3) return { invoices: [] };
      return apiClient.get<{ invoices: InvoiceSearchHit[] }>('/api/admin/invoices', {
        query: { q: trimmed, limit: 8 },
      });
    },
    enabled: isInvoiceSearch,
    staleTime: 10_000,
  });

  const onSelectCustomer = (id: string) => {
    router.push(`/admin/customers/${id}/avtal`);
  };

  const mrrNow = subsQuery.data?.summary?.mrrOre ?? 0;
  const mrr30dAgo = subsQuery.data?.summary?.mrr30dAgoOre ?? 0;
  const arr = mrrNow * 12;
  const mrrDelta = mrrNow - mrr30dAgo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing-cockpit"
        subtitle="Kassaflöde, åtgärder, kommande pengar in och Stripe-händelser"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="MRR"
          value={formatSek(mrrNow)}
          delta={mrrDelta}
          trend={mrrDelta > 0 ? 'up' : mrrDelta < 0 ? 'down' : 'flat'}
          tone={mrrDelta >= 0 ? 'success' : 'warning'}
        />
        <SummaryCard label="ARR" value={formatSek(arr)} tone="success" />
        <SummaryCard
          label="Aktiva abonnemang"
          value={String(subsQuery.data?.summary?.activeCount ?? 0)}
        />
        <SummaryCard
          label="Behöver åtgärd"
          value={String(invoicesQuery.data?.summary?.invoicesNeedingActionCount ?? 0)}
          tone={
            (invoicesQuery.data?.summary?.invoicesNeedingActionCount ?? 0) > 0
              ? 'warning'
              : 'neutral'
          }
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-medium text-foreground">
          Snabbsök kund eller faktura
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Kund, e-post, företagsnamn eller fakturanr..."
            className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {searchTerm.trim().length >= 2 && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background">
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                Kunder
              </div>
              <div className="max-h-64 overflow-y-auto">
                {customerSearch.isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Söker...</div>
                ) : (customerSearch.data?.customers ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Inga träffar</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {customerSearch.data?.customers.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          onClick={() => onSelectCustomer(customer.id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-foreground">
                              {customer.business_name ??
                                customer.customer_contact_name ??
                                customer.contact_email ??
                                customer.id}
                            </span>
                            {customer.contact_email ? (
                              <span className="ml-2 text-muted-foreground">
                                {customer.contact_email}
                              </span>
                            ) : null}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background">
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                Fakturor {isInvoiceSearch ? '' : '(skriv fakturanr)'}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {!isInvoiceSearch ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    Innehåller söktermen siffror, t.ex. `INV-2024...`
                  </div>
                ) : invoiceSearch.isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Söker...</div>
                ) : (invoiceSearch.data?.invoices ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Inga träffar</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {invoiceSearch.data?.invoices.map((invoice) => (
                      <li key={invoice.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (invoice.customer_profile_id) {
                              router.push(
                                `/admin/customers/${invoice.customer_profile_id}/avtal/${invoice.stripe_invoice_id}`,
                              );
                              return;
                            }
                            router.push('/admin/billing/invoices');
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">
                              {invoice.invoice_number ?? invoice.stripe_invoice_id}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {invoice.customer_name ?? '—'} · {formatSek(invoice.total_ore)}
                            </span>
                          </span>
                          <Badge
                            size="xs"
                            color={invoice.display_status === 'paid' ? 'green' : 'orange'}
                          >
                            {invoice.display_status}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card withBorder padding="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group gap={6}>
              <AlertTriangle className="h-4 w-4" />
              <Text size="sm" fw={700} tt="uppercase" c="dimmed">
                Behöver din uppmärksamhet
              </Text>
            </Group>
            <Link
              href="/admin/overview"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Hela listan →
            </Link>
          </Group>

          {attentionQuery.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </Stack>
          ) : billingAttention.length === 0 ? (
            <Box className="rounded-md border border-dashed border-border p-6 text-center">
              <Text size="sm" c="dimmed">
                Inga ekonomi-relaterade åtgärder just nu.
              </Text>
            </Box>
          ) : (
            <ul className="divide-y divide-border">
              {billingAttention.map((item, index) => {
                const customerProfileId = String(
                  (item as { customerProfileId?: string }).customerProfileId ?? '',
                );
                const title = String(item.title ?? item.label ?? item.type);
                const subtitle = item.subtitle ? String(item.subtitle) : null;
                const severity = String(item.severity ?? 'warning');

                return (
                  <li key={`${item.type}-${item.subjectId ?? index}`}>
                    <Link
                      href={
                        customerProfileId
                          ? `/admin/customers/${customerProfileId}/avtal`
                          : '/admin/overview'
                      }
                      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{title}</p>
                        {subtitle ? (
                          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs',
                          severity === 'critical'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-amber-500/10 text-amber-600',
                        )}
                      >
                        {severity}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card withBorder padding="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group gap={6}>
              <TrendingUp className="h-4 w-4" />
              <Text size="sm" fw={700} tt="uppercase" c="dimmed">
                Kommande pengar in (30 dagar)
              </Text>
            </Group>
            <Text size="sm" fw={700}>
              {formatSek(upcomingQuery.data?.summary?.totalOre ?? 0)}
            </Text>
          </Group>

          {upcomingQuery.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={36} />
              <Skeleton height={36} />
              <Skeleton height={36} />
            </Stack>
          ) : (upcomingQuery.data?.upcoming ?? []).length === 0 ? (
            <Box className="rounded-md border border-dashed border-border p-6 text-center">
              <Text size="sm" c="dimmed">
                Inga schemalagda fakturor de kommande 30 dagarna.
              </Text>
            </Box>
          ) : (
            <ScrollArea.Autosize mah={320}>
              <Stack gap={4}>
                {upcomingQuery.data?.upcoming.map((row) => (
                  <Link
                    key={`${row.customer_id}-${row.invoice_date}`}
                    href={`/admin/customers/${row.customer_id}/avtal`}
                    className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.business_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {format(new Date(row.invoice_date), 'd MMM', { locale: sv })}
                        {!row.has_stripe_subscription ? ' · ej kopplad till Stripe' : ''}
                      </p>
                    </div>
                    <Text size="sm" fw={600}>
                      {formatSek(row.amount_ore)}
                    </Text>
                  </Link>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card withBorder padding="md" radius="md" className="lg:col-span-2">
          <Group justify="space-between" mb="sm">
            <Group gap={6}>
              <Clock className="h-4 w-4" />
              <Text size="sm" fw={700} tt="uppercase" c="dimmed">
                Senaste händelser
              </Text>
            </Group>
            <Link
              href="/admin/audit-log"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Hela audit-loggen →
            </Link>
          </Group>

          {eventsQuery.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
            </Stack>
          ) : (eventsQuery.data?.events ?? []).length === 0 ? (
            <Box className="rounded-md border border-dashed border-border p-6 text-center">
              <Text size="sm" c="dimmed">
                Inga händelser ännu.
              </Text>
            </Box>
          ) : (
            <ScrollArea.Autosize mah={420}>
              <Stack gap="xs">
                {eventsQuery.data?.events.map((event) => {
                  const Wrapper: ElementType = event.customer_profile_id ? Link : 'div';
                  const wrapperProps = event.customer_profile_id
                    ? {
                        href: `/admin/customers/${event.customer_profile_id}/avtal`,
                      }
                    : {};

                  return (
                    <Wrapper
                      key={event.id}
                      {...wrapperProps}
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/40"
                    >
                      <ThemeIcon
                        variant="light"
                        color={eventColor(event.action)}
                        size="md"
                        radius="xl"
                      >
                        <Receipt className="h-3 w-3" />
                      </ThemeIcon>
                      <div className="min-w-0 flex-1">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="sm" fw={600} lineClamp={1}>
                            {event.title}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {format(new Date(event.at), 'd MMM HH:mm', { locale: sv })}
                          </Text>
                        </Group>
                        <Group gap={6} mt={2}>
                          {event.business_name ? (
                            <Badge size="xs" variant="light" color="gray">
                              {event.business_name}
                            </Badge>
                          ) : null}
                          {event.amount_ore != null ? (
                            <Text size="xs" c="dimmed">
                              {formatAmountOre(event.amount_ore)}
                            </Text>
                          ) : null}
                          {event.actor_label ? (
                            <Text size="xs" c="dimmed">
                              · {event.actor_label}
                            </Text>
                          ) : null}
                        </Group>
                      </div>
                    </Wrapper>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Card>

        <aside className="space-y-4">
          <Card withBorder padding="md" radius="md">
            <Text size="sm" fw={700} tt="uppercase" c="dimmed" mb="sm">
              Utforska
            </Text>
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href="/admin/billing/invoices"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  Alla fakturor <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/billing/subscriptions"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  Alla abonnemang <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/billing/health"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  Stripe-hälsa <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            </ul>
          </Card>

          <StripeSyncFeed limit={8} />
        </aside>
      </div>
    </div>
  );
}
