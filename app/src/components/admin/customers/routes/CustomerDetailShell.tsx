'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { customerStatusConfig } from '@/lib/admin/labels';
import { CustomerRouteError } from './shared';

const tabs = [
  { suffix: '', label: 'Oversikt' },
  { suffix: '/contract', label: 'Avtal' },
  { suffix: '/billing', label: 'Fakturor' },
  { suffix: '/subscription', label: 'Abonnemang' },
  { suffix: '/team', label: 'Team' },
  { suffix: '/activity', label: 'Aktivitet' },
] as const;

export default function CustomerDetailShell({
  customerId,
  children,
}: {
  customerId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? `/admin/customers/${customerId}`;
  const { data: customer, error } = useCustomerDetail(customerId);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/80 px-1 pb-4 pt-1 backdrop-blur">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
              return;
            }

            router.push('/admin/customers');
          }}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till kunder
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {customer?.business_name || 'Kunddetalj'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {customer?.contact_email || 'Laddar kontaktuppgifter...'}
              {customer?.customer_contact_name ? ` · ${customer.customer_contact_name}` : ''}
              {customer?.tiktok_handle ? (
                <span className="ml-2 text-primary">@{customer.tiktok_handle}</span>
              ) : null}
            </p>
          </div>
          {customer ? (
            <span
              className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${customerStatusConfig(customer.status).className}`}
            >
              {customerStatusConfig(customer.status).label}
            </span>
          ) : null}
        </div>

        <nav className="mt-4 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const href = `/admin/customers/${customerId}${tab.suffix}`;
            const isActive =
              tab.suffix === ''
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                scroll={false}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {error ? <CustomerRouteError message={error.message} /> : null}

      {children}
    </div>
  );
}
