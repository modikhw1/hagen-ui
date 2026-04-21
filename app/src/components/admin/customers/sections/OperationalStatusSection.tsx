'use client';

import { useMemo } from 'react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { deriveCustomerOperationalSignals } from '@/lib/admin-derive';
import {
  bufferLabel,
  CustomerChecklistRow,
  CustomerRouteError,
  CustomerSectionSkeleton,
  CustomerSection,
  CustomerStatusPill,
  onboardingLabel,
} from '@/components/admin/customers/routes/shared';
import { shortDateSv } from '@/lib/admin/time';
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
        <div className="flex flex-wrap gap-2">
          <CustomerStatusPill
            label={onboardingLabel(derived.onboardingState)}
            tone={
              derived.onboardingState === 'settled' || derived.onboardingState === 'live'
                ? 'success'
                : derived.onboardingState === 'cm_ready'
                  ? 'warning'
                  : 'info'
            }
          />
          <CustomerStatusPill
            label={bufferLabel(derived.bufferStatus)}
            tone={
              derived.bufferStatus === 'ok'
                ? 'success'
                : derived.bufferStatus === 'under'
                  ? 'danger'
                  : derived.bufferStatus === 'paused'
                    ? 'neutral'
                    : 'warning'
            }
          />
          {derived.blocking.state !== 'none' ? (
            <CustomerStatusPill
              label={`${derived.blocking.state === 'escalated' ? 'Eskalerad' : 'Blockerad'} ${derived.visibleBlockingDays}d`}
              tone={derived.blocking.state === 'escalated' ? 'danger' : 'warning'}
            />
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Onboarding-checklista
          </div>
          <CustomerChecklistRow label="Innehallsplan satt" done={derived.onboardingChecklist.contentPlanSet} />
          <CustomerChecklistRow label="Startbuffer laddad" done={derived.onboardingChecklist.startConceptsLoaded} />
          <CustomerChecklistRow label="TikTok-profil bekraftad" done={derived.onboardingChecklist.tiktokHandleConfirmed} />
          <CustomerChecklistRow label="Forsta publicering gjord" done={derived.onboardingChecklist.firstPublication} />
        </div>

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          <div>
            Senaste publicering:{' '}
            {customer.last_published_at
              ? shortDateSv(customer.last_published_at)
              : 'Ingen an - blockerad sedan aktivering'}
          </div>
          <div>Planerad buffer till: {shortDateSv(customer.latest_planned_publish_date)}</div>
          <div>Planerad paus till: {shortDateSv(customer.paused_until)}</div>
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
