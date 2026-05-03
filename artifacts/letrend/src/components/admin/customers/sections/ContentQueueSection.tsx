'use client';

import { useMemo } from 'react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { deriveCustomerOperationalSignals } from '@/lib/admin-derive';
import { shortDateSv } from '@/lib/admin/time';
import { CustomerSection, CustomerSectionSkeleton, CustomerChecklistRow } from '@/components/admin/customers/routes/shared';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { bufferLabel, bufferTone } from '@/lib/admin/labels';

export default function ContentQueueSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const derived = useMemo(
    () => (customer ? deriveCustomerOperationalSignals(customer) : null),
    [customer],
  );

  if (isLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (!customer || !derived) return null;

  return (
    <CustomerSection 
      title="Status & innehållskö"
      action={
        <StatusPill 
          label={bufferLabel(derived.bufferStatus)} 
          tone={bufferTone(derived.bufferStatus)} 
          size="xs" 
        />
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
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

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-[11px] text-muted-foreground space-y-2">
          <div className="flex justify-between items-center">
            <span>Senaste publicering</span>
            <span className="text-foreground font-medium">
              {customer.last_published_at
                ? shortDateSv(customer.last_published_at)
                : 'Väntar på första publicering'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>Planerad innehållskö till</span>
            <span className="text-foreground font-medium">
              {shortDateSv(customer.latest_planned_publish_date) ?? '—'}
            </span>
          </div>
          {customer.paused_until && (
            <div className="flex justify-between items-center pt-1 border-t border-border/50">
              <span>Planerad paus till</span>
              <span className="text-status-warning-fg font-medium">{shortDateSv(customer.paused_until)}</span>
            </div>
          )}
        </div>
      </div>
    </CustomerSection>
  );
}
