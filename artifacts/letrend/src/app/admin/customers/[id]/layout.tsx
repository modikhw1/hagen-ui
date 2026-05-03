'use client';

import { type ReactNode, Suspense } from 'react';
import { useParams } from 'wouter';
import { ExternalLink, Sparkles, Tag } from 'lucide-react';

import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { customerStatusConfig, onboardingLabel, onboardingTone } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { studioUrlForCustomer } from '@/lib/studio/urls';
import CustomerBackButton from '@/components/admin/customers/routes/CustomerBackButton';
import CustomerHeaderBanner from '@/components/admin/customers/routes/CustomerHeaderBanner';
import CustomerDetailTabs from '@/components/admin/customers/routes/CustomerDetailTabs';
import CustomerRealtimeBridge from '@/components/admin/customers/routes/CustomerRealtimeBridge';

function CustomerHeader({ id }: { id: string }) {
  const { data: customer, isLoading } = useCustomerDetail(id);

  if (isLoading || !customer) {
    return (
      <div className="h-24 animate-pulse rounded bg-muted" />
    );
  }

  const statusConfig = customerStatusConfig(customer.status);
  const studioHref = studioUrlForCustomer({ id: customer.id, status: customer.status });
  // Suppress the redundant "Onboarding: …" pill once the customer has reached
  // a settled lifecycle status (active / paused / cancelled / archived). For
  // those customers the main status pill already conveys the truth and the
  // legacy onboarding_state column is just stale metadata.
  const settledStatuses = ['active', 'paused', 'cancelled', 'archived'];
  const showOnboarding =
    customer.onboarding_state &&
    customer.onboarding_state !== 'live' &&
    !settledStatuses.includes(String(customer.status ?? ''));
  const accountManagerName = customer.account_manager ?? null;
  const accountManagerAvatar = customer.cm_avatar_url ?? null;

  return (
    <>
      <CustomerBackButton />

      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-heading text-2xl font-bold text-foreground">
              {customer.business_name || 'Kunddetalj'}
            </h1>
            <StatusPill label={statusConfig.label} tone={statusConfig.tone} />

            {showOnboarding ? (
              <StatusPill
                label={`Onboarding: ${onboardingLabel(customer.onboarding_state as any)}`}
                tone={onboardingTone(customer.onboarding_state as any)}
              />
            ) : null}

            {studioHref ? (
              <a
                href={studioHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                Öppna Studio
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {customer.contact_email || 'Inga kontaktuppgifter ännu'}
            {customer.customer_contact_name ? ` · ${customer.customer_contact_name}` : ''}
            {customer.tiktok_handle ? (
              <>
                {' · '}
                <a
                  href={`https://www.tiktok.com/@${customer.tiktok_handle.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  @{customer.tiktok_handle.replace('@', '')}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Fact
            label="MRR"
            value={customer.monthly_price != null ? formatSek(customer.monthly_price, { unit: 'sek' }) : '—'}
          />
          {customer.discount_type && customer.discount_type !== 'none' && customer.discount_value != null ? (
            <div className="flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700">
              <Tag size={11} />
              {customer.discount_value}
              {customer.discount_type === 'percent' ? '%' : 'kr'} rabatt
            </div>
          ) : null}
        </div>
        <Fact
          label="CM"
          value={
            accountManagerName ? (
              <span className="inline-flex items-center gap-2">
                <AdminAvatar
                  name={accountManagerName}
                  avatarUrl={accountManagerAvatar}
                  size="sm"
                />
                <span>{firstName(accountManagerName)}</span>
              </span>
            ) : (
              'Ingen'
            )
          }
        />
        <Fact
          label="Nästa faktura"
          value={customer.next_invoice_date ? shortDateSv(customer.next_invoice_date) : '—'}
        />
        <Fact
          label="Kund sedan"
          value={customer.created_at ? shortDateSv(customer.created_at) : '—'}
        />
      </dl>

      <CustomerHeaderBanner customer={customer as any} />
    </>
  );
}

function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default function CustomerLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  return (
    <div className="space-y-6">
      <header className="sticky top-0 z-30 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <Suspense fallback={<div className="h-24 animate-pulse rounded bg-muted" />}>
          <CustomerHeader id={id} />
        </Suspense>
        <CustomerDetailTabs customerId={id} />
        <CustomerRealtimeBridge customerId={id} />
      </header>
      <main>
        {children}
      </main>
    </div>
  );
}
