'use client';

import { useMemo } from 'react';
import { deriveCustomerOperationalSignals } from '@/lib/admin-derive';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import {
  bufferLabel,
  CustomerChecklistRow,
  CustomerRouteError,
  CustomerSection,
  CustomerSectionSkeleton,
  CustomerStatusPill,
  onboardingLabel,
} from '@/components/admin/customers/routes/shared';
import AttentionPanel from './AttentionPanel';

export default function OperationalStatusSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const derived = useMemo(
    () => (customer ? deriveCustomerOperationalSignals(customer) : null),
    [customer],
  );

  if (isLoading) {
    return <CustomerSectionSkeleton blocks={4} />;
  }

  if (error || !customer || !derived) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  return (
    <CustomerSection title="Operativ status">
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Onboarding-checklista
          </div>
          <CustomerChecklistRow
            label="Innehållsplan satt"
            done={derived.onboardingChecklist.contentPlanSet}
          />
          <CustomerChecklistRow
            label="Start-koncept laddade"
            done={derived.onboardingChecklist.startConceptsLoaded}
          />
          <CustomerChecklistRow
            label="TikTok-profil bekräftad"
            done={derived.onboardingChecklist.tiktokHandleConfirmed}
          />
          <CustomerChecklistRow
            label="Första publicering gjord"
            done={derived.onboardingChecklist.firstPublication}
          />
        </div>

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          <div>
            Senaste publicering:{' '}
            {customer.last_published_at
              ? shortDateSv(customer.last_published_at)
              : 'Ingen än - väntar på första publicering'}
          </div>
          <div>Planerad innehållskö till: {shortDateSv(customer.latest_planned_publish_date)}</div>
          {customer.paused_until && (
            <div>Planerad paus till: {shortDateSv(customer.paused_until)}</div>
          )}
        </div>

        <AttentionPanel
          customerId={customerId}
          customer={customer}
          blocking={derived.blocking}
          onboardingState={derived.onboardingState}
          activeSnooze={derived.activeSnooze}
        />
      </div>
    </CustomerSection>
  );
}
