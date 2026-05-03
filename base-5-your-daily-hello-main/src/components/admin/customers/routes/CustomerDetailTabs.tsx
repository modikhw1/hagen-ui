'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const customerTabs = [
  { suffix: '',        label: 'Drift' },
  { suffix: '/avtal', label: 'Avtal' },
] as const;

export default function CustomerDetailTabs({ 
  customerId, 
  status 
}: { 
  customerId: string;
  status?: string;
}) {
  const pathname = usePathname() ?? `/admin/customers/${customerId}`;

  const tabs = useMemo(
    () => {
      const visibleTabs = customerTabs.filter((tab) => {
        if (status === 'prospect') {
          return tab.suffix === '';
        }
        return true;
      });

      return visibleTabs.map((tab) => {
        const href = `/admin/customers/${customerId}${tab.suffix}`;
        const isActive =
          tab.suffix === ''
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

        return {
          ...tab,
          href,
          isActive,
        };
      });
    },
    [customerId, pathname, status],
  );

  return (
    <nav className="mt-4 -mb-px flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.isActive ? 'page' : undefined}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab.isActive
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
