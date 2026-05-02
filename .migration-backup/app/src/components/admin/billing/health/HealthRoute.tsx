'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import SummaryCard from '@/components/admin/_shared/SummaryCard';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import RecentFailuresList from '@/components/admin/billing/health/RecentFailuresList';
import SyncLogList from '@/components/admin/billing/health/SyncLogList';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { apiClient } from '@/lib/admin/api-client';
import { type EnvFilter } from '@/lib/admin/billing';
import { useBillingHealthRetry } from '@/lib/admin/billing-ops';
import {
  billingHealthResponseSchema,
  type BillingHealthResponse,
} from '@/lib/admin/dtos/billing';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';
import { timeAgoSv } from '@/lib/admin/time';
import { cn } from '@/lib/utils';

import AdminTable from '@/components/admin/ui/AdminTable';
import { AdminSection } from '@/components/admin/ui/AdminSection';

export default function HealthRoute({ env }: { env: EnvFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    run: retrySync,
    isPending,
    error,
    rateLimitRemainingSeconds,
  } = useBillingHealthRetry();
  const [confirmRetryOpen, setConfirmRetryOpen] = useState(false);
  
  const { data: health, isLoading } = useQuery({
    queryKey: qk.billing.healthStatus(env),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get<BillingHealthResponse>('/api/admin/billing/health', {
        signal,
        query: {
          env: env === 'all' ? undefined : env,
        },
      });

      return parseDto(billingHealthResponseSchema, payload, {
        name: 'billingHealthResponse',
        path: '/api/admin/billing/health',
      });
    },
    staleTime: 60_000,
  });

  const entries = health?.recentSyncs ?? [];
  const failures = health?.recentFailures ?? entries.filter((entry) => entry.status === 'failed');
  const retryBlocked = isPending || rateLimitRemainingSeconds > 0;

  // Mock data for "Sync-status per kund" since DTO doesn't have it yet
  const customersWithErrors: any[] = []; 

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Billing Health" 
        subtitle="Systemstatus och synkronisering"
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmRetryOpen(true)}
              disabled={retryBlocked}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending
                ? 'Kör om sync...'
                : rateLimitRemainingSeconds > 0
                  ? `Vänta ${rateLimitRemainingSeconds} s`
                  : 'Kör om billing-sync'}
            </button>
          </div>
        }
      />

      {health?.schemaWarnings?.length ? (
        <div className="rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
          {health.schemaWarnings[0]}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Speglade fakturor" value={String(health?.stats.mirroredInvoices ?? 0)} />
        <SummaryCard
          label="Speglade abonnemang"
          value={String(health?.stats.mirroredSubscriptions ?? 0)}
        />
        <SummaryCard
          label="Misslyckade syncar"
          value={String(health?.stats.failedSyncs ?? 0)}
          tone={(health?.stats.failedSyncs ?? 0) > 0 ? 'warning' : 'success'}
        />
        <SummaryCard 
          label="Senaste lyckade sync" 
          value={{
            primary: timeAgoSv(health?.stats.latestSuccessfulSyncAt ?? null),
            secondary: health?.stats.latestSuccessfulSyncAt ? `Uppdaterades nyss` : 'Aldrig kört'
          }}
        />
      </div>

      <div className="space-y-10">
        <AdminSection title="Senaste misslyckade events" description="Webhooks, jobs, retries">
          <RecentFailuresList entries={failures} isLoading={isLoading} />
        </AdminSection>

        <AdminSection title="Sync-status per kund" description="Kunder med aktuella problem">
          <AdminTable
            columns={[
              { key: 'customer', header: 'Kund', render: (c: any) => c.name },
              { key: 'error', header: 'Felmeddelande', render: (c: any) => c.error },
              { key: 'action', header: '', align: 'right', width: '100px', render: (c: any) => <Link href={`/admin/customers/${c.id}`} className="text-xs text-primary hover:underline">Visa kund →</Link> }
            ]}
            rows={customersWithErrors}
            getRowKey={(c: any) => c.id}
            emptyLabel="Inga kunder har aktuella synk-problem."
            density="compact"
          />
        </AdminSection>

        <AdminSection title="Sync-logg" description="Senaste 100 körningarna">
          <SyncLogList entries={entries} isLoading={isLoading} />
        </AdminSection>
      </div>

      <ConfirmActionDialog
        open={confirmRetryOpen}
        onOpenChange={setConfirmRetryOpen}
        title="Kör om billing-sync?"
        description="Det här hämtar om Stripe-händelser för den aktiva miljön. Fortsätt bara om du misstänker att data saknas."
        confirmLabel="Kör om sync"
        onConfirm={() => {
          setConfirmRetryOpen(false);
          void retrySync();
        }}
        pending={isPending}
      />
    </div>
  );
}
