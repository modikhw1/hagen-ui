'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { BillingFilterBar, type BillingView } from './shared/BillingFilterBar';
import InvoicesRoute from './invoices/InvoicesRoute';
import SubscriptionsRoute from './subscriptions/SubscriptionsRoute';
import SummaryCard from '@/components/admin/ui/SummaryCard';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/admin/queryKeys';
import { apiClient } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';

export default function BillingPageRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const view = (searchParams?.get('view') as BillingView) || 'invoices';
  const status = searchParams?.get('status') || 'all';
  const search = searchParams?.get('q') || '';
  const page = Number(searchParams?.get('page') || '1');
  const env = searchParams?.get('env') || 'all';

  // Hämta stats för sammanfattningskorten
  const { data: invData } = useQuery({
    queryKey: qk.billing.invoiceList(env as any, 'all', 1, 1),
    queryFn: async () => apiClient.get<any>('/api/admin/invoices', { query: { limit: 1, environment: env === 'all' ? undefined : env } }),
  });

  const { data: subData } = useQuery({
    queryKey: qk.billing.subscriptionList(env as any, 'all', 1, 1),
    queryFn: async () => apiClient.get<any>('/api/admin/subscriptions', { query: { limit: 1, environment: env === 'all' ? undefined : env } }),
  });

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [key, value] of Object.entries(updates)) {
      if (value === '' || value === 'all' || (key === 'page' && value === '1')) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const statusOptions = view === 'invoices' 
    ? [
        { key: 'all', label: 'Alla' },
        { key: 'open', label: 'Obetalda' },
        { key: 'paid', label: 'Betalda' },
        { key: 'partially_refunded', label: 'Krediterade' },
      ]
    : [
        { key: 'all', label: 'Alla' },
        { key: 'active', label: 'Aktiva' },
        { key: 'past_due', label: 'Förfallna' },
        { key: 'trialing', label: 'Trial' },
      ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Billing" 
        subtitle="Stripe / fakturahantering" 
      />

      <div className="grid gap-4 md:grid-cols-3">
        {view === 'invoices' ? (
          <>
            <SummaryCard 
              label="Obetalt (Fakturor)" 
              value={formatSek(invData?.summary?.openOre ?? 0)} 
              tone="warning" 
            />
            <SummaryCard 
              label="Betalt (30d)" 
              value={formatSek(invData?.summary?.paidOre ?? 0)} 
              tone="success"
            />
            <SummaryCard 
              label="Antal" 
              value={String(invData?.summary?.totalCount ?? 0)} 
            />
          </>
        ) : (
          <>
            <SummaryCard 
              label="MRR (Abonnemang)" 
              value={formatSek(subData?.summary?.mrrOre ?? 0)} 
              tone="success" 
            />
            <SummaryCard 
              label="Aktiva" 
              value={String(subData?.summary?.activeCount ?? 0)} 
            />
            <SummaryCard 
              label="Löper ut snart" 
              value={String(subData?.summary?.expiringCount ?? 0)} 
              tone={(subData?.summary?.expiringCount ?? 0) > 0 ? 'warning' : 'neutral'}
            />
          </>
        )}
      </div>

      <BillingFilterBar
        view={view}
        onViewChange={(v) => updateParams({ view: v, status: 'all', page: '1' })}
        status={status}
        onStatusChange={(s) => updateParams({ status: s, page: '1' })}
        statusOptions={statusOptions}
        search={search}
        onSearchChange={(q) => updateParams({ q, page: '1' })}
      />

      {view === 'invoices' ? (
        <InvoicesRoute env={env as any} status={status as any} page={page} />
      ) : (
        <SubscriptionsRoute env={env as any} status={status as any} page={page} />
      )}
    </div>
  );
}
