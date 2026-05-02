'use client';

import { Tabs, Box } from '@mantine/core';
import { useRouter } from 'next/navigation';

import { CustomerOverviewRoute } from './routes/CustomerOverviewRoute';
import { CustomerBillingRoute } from './routes/CustomerBillingRoute';
import { CustomerPulseRoute } from './routes/CustomerPulseRoute';
import { CustomerOrganisationRoute } from './routes/CustomerOrganisationRoute';

import type {
  CustomerOverviewInitialData,
} from './routes/CustomerOverviewRoute';
import type {
  CustomerBillingInitialData,
} from './routes/CustomerBillingRoute';
import type {
  CustomerPulseInitialData,
} from './routes/CustomerPulseRoute';

export interface CustomerViewProps {
  customerId: string;
  customerName: string;
  activeTab: 'overview' | 'billing' | 'pulse' | 'organisation';
  data: {
    overview: CustomerOverviewInitialData;
    billing: CustomerBillingInitialData;
    pulse: CustomerPulseInitialData;
    organisation: Parameters<typeof CustomerOrganisationRoute>[0]['initialData'];
  };
}

export function CustomerView({
  customerId, customerName, activeTab, data,
}: CustomerViewProps) {
  const router = useRouter();

  return (
    <Tabs
      value={activeTab}
      onChange={(value) => {
        if (value) {
          router.push(`/admin/customers/${customerId}/${value}`);
        }
      }}
    >
      <Tabs.List>
        <Tabs.Tab value="overview">Översikt</Tabs.Tab>
        <Tabs.Tab value="billing">Fakturering & Betalning</Tabs.Tab>
        <Tabs.Tab value="pulse">Operativ Puls</Tabs.Tab>
        <Tabs.Tab value="organisation">Organisation</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="overview" pt="xl">
        <CustomerOverviewRoute customerId={customerId} initialData={data.overview} />
      </Tabs.Panel>
      <Tabs.Panel value="billing" pt="xl">
        <CustomerBillingRoute
          customerId={customerId}
          customerName={customerName}
          initialData={data.billing}
        />
      </Tabs.Panel>
      <Tabs.Panel value="pulse" pt="xl">
        <CustomerPulseRoute customerId={customerId} initialData={data.pulse} />
      </Tabs.Panel>
      <Tabs.Panel value="organisation" pt="xl">
        <CustomerOrganisationRoute customerId={customerId} initialData={data.organisation} />
      </Tabs.Panel>
    </Tabs>
  );
}
