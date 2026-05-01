'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import SummaryCard from '@/components/admin/ui/SummaryCard';
import { qk } from '@/lib/admin/queryKeys';
import { apiClient } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';
import { cn } from '@/lib/utils';
import { StripeSyncFeed } from './StripeSyncFeed';

type CustomerSearchHit = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  company_name?: string | null;
};

export default function BillingPageRoute() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  // KPI-data — fakturor (obetalt + betalt 30d) och abonnemang (MRR + aktiva)
  const invoicesQuery = useQuery({
    queryKey: qk.billing.invoiceList('all' as any, 'all', 1, 1),
    queryFn: async () =>
      apiClient.get<any>('/api/admin/invoices', { query: { limit: 1 } }),
  });

  const subsQuery = useQuery({
    queryKey: qk.billing.subscriptionList('all' as any, 'all', 1, 1),
    queryFn: async () =>
      apiClient.get<any>('/api/admin/subscriptions', { query: { limit: 1 } }),
  });

  // Attention-listan — endast ekonomi-relaterade poster
  const attentionQuery = useQuery({
    queryKey: qk.overview.attention('standard'),
    queryFn: async () =>
      apiClient.get<any>('/api/admin/overview/attention', { query: { sort: 'standard' } }),
  });

  const billingAttention = useMemo(() => {
    const items: any[] = attentionQuery.data?.attentionItems ?? [];
    const billingTypes = new Set([
      'invoice_unpaid',
      'credit_note_failed',
      'customer_blocked',
    ]);
    return items.filter((i) => billingTypes.has(i.type)).slice(0, 8);
  }, [attentionQuery.data]);

  // Customer-sök (debounced enkelt — räcker för cockpit)
  const customerSearch = useQuery({
    queryKey: ['admin', 'billing', 'cockpit', 'customer-search', searchTerm],
    queryFn: async () => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < 2) return { customers: [] as CustomerSearchHit[] };
      return apiClient.get<{ customers: CustomerSearchHit[] }>(
        '/api/admin/customers',
        { query: { q: trimmed, limit: 8 } },
      );
    },
    enabled: searchTerm.trim().length >= 2,
    staleTime: 10_000,
  });

  const onSelectCustomer = (id: string) => {
    router.push(`/admin/customers/${id}/billing`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing-cockpit"
        subtitle="Översikt över kassaflöde, åtgärder som väntar och Stripe-status"
      />

      {/* KPI-rad */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="MRR (aktiva abonnemang)"
          value={formatSek(subsQuery.data?.summary?.mrrOre ?? 0)}
          tone="success"
        />
        <SummaryCard
          label="Obetalt totalt"
          value={formatSek(invoicesQuery.data?.summary?.openOre ?? 0)}
          tone={(invoicesQuery.data?.summary?.openOre ?? 0) > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          label="Betalt (30d)"
          value={formatSek(invoicesQuery.data?.summary?.paidOre ?? 0)}
        />
        <SummaryCard
          label="Aktiva kunder"
          value={String(subsQuery.data?.summary?.activeCount ?? 0)}
        />
      </div>

      {/* Globalt sökfält → drilldown via kund */}
      <div className="rounded-lg border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-medium text-foreground">
          Hitta kund eller faktura
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Sök på kund, e-post eller företagsnamn…"
            className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {searchTerm.trim().length >= 2 && (
          <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-border bg-background">
            {customerSearch.isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">Söker…</div>
            ) : (customerSearch.data?.customers ?? []).length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">Inga träffar</div>
            ) : (
              <ul className="divide-y divide-border">
                {customerSearch.data?.customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCustomer(c.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-medium text-foreground">
                          {c.display_name ?? c.company_name ?? c.email ?? c.id}
                        </span>
                        {c.email && (
                          <span className="ml-2 text-muted-foreground">{c.email}</span>
                        )}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Faktura-drilldown öppnas via kundens billing-vy.
        </p>
      </div>

      {/* Två kolumner: attention + snabblänkar */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Åtgärder som väntar
            </h2>
            <Link
              href="/admin/overview"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Se hela attention-listan →
            </Link>
          </header>

          {attentionQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Laddar…</div>
          ) : billingAttention.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Inga ekonomi-relaterade åtgärder just nu.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {billingAttention.map((item) => (
                <li key={`${item.type}-${item.subjectId ?? item.id}`}>
                  <Link
                    href={
                      item.customerProfileId
                        ? `/admin/customers/${item.customerProfileId}/billing`
                        : '/admin/overview'
                    }
                    className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.title ?? item.label ?? item.type}
                      </p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs',
                        item.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-600',
                      )}
                    >
                      {item.severity ?? 'warning'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Snabblänkar</h2>
            <ul className="space-y-2 text-sm">
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
          </div>

          <StripeSyncFeed limit={10} />
        </aside>
      </div>
    </div>
  );
}
