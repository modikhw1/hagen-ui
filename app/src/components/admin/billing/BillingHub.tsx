'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import HealthTab from '@/components/admin/billing/tabs/HealthTab';
import InvoicesTab from '@/components/admin/billing/tabs/InvoicesTab';
import SubscriptionsTab from '@/components/admin/billing/tabs/SubscriptionsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type BillingTab = 'invoices' | 'subscriptions' | 'health';
export type EnvFilter = 'all' | 'test' | 'live';

export default function BillingHub({
  initialTab = 'invoices',
}: {
  initialTab?: BillingTab;
}) {
  const [tab, setTab] = useState<BillingTab>(initialTab);
  const [env, setEnv] = useState<EnvFilter>('all');
  const queryClient = useQueryClient();

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ['admin', 'billing', 'health'],
      queryFn: async () => {
        const response = await fetch('/api/admin/billing-health', {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Kunde inte ladda billing health');
        return response.json();
      },
      staleTime: 60_000,
    });
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fakturor, abonnemang och synkstatus
          </p>
        </div>

        <div className="flex gap-1 rounded-md border border-border bg-secondary p-1">
          {(['all', 'test', 'live'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setEnv(item)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                env === item
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item === 'all' ? 'Alla miljöer' : item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as BillingTab)}>
        <TabsList className="mb-6 h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          {[
            { value: 'invoices', label: 'Fakturor' },
            { value: 'subscriptions', label: 'Abonnemang' },
            { value: 'health', label: 'Sync & Health' },
          ].map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="invoices">
          <InvoicesTab env={env} />
        </TabsContent>
        <TabsContent value="subscriptions">
          <SubscriptionsTab env={env} />
        </TabsContent>
        <TabsContent value="health">
          <HealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
