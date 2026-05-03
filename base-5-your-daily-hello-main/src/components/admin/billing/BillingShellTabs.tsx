'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FilterChips } from '@/components/admin/ui/FilterChips';

export default function BillingShellTabs({
  defaultHealthEnv,
}: {
  defaultHealthEnv: string;
}) {
  const pathname = usePathname() ?? '/admin/billing';
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabs = [
    { label: 'Billing', href: '/admin/billing' },
    { label: 'Health',  href: '/admin/billing/health' },
  ];

  const env = searchParams?.get('env') || 'all';

  const updateEnv = (newEnv: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (newEnv === 'all') {
      params.delete('env');
    } else {
      params.set('env', newEnv);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <nav className="mb-6 flex w-full items-center justify-between border-b border-border">
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.href === '/admin/billing' 
            ? (pathname === '/admin/billing' || pathname.startsWith('/admin/billing/invoices') || pathname.startsWith('/admin/billing/subscriptions'))
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {pathname === "/admin/billing/health" ? (
        <div className="pb-2">
          <FilterChips 
            value={env === 'all' ? 'live' : env} 
            onChange={updateEnv} 
            options={[
              { key: 'test', label: 'Test' },
              { key: 'live', label: 'Live' }
            ]} 
          />
        </div>
      ) : null}
    </nav>
  );
}
