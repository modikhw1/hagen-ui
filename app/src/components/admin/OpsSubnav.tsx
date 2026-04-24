'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isRouteActive, type RouteMatcherItem } from '@/lib/admin/navigation/active';
import { prefetchSection } from '@/lib/admin/navigation/prefetch';
import { StatusPill } from '@/components/admin/ui/StatusPill';

type OpsItem = RouteMatcherItem & {
  href: string;
  label: string;
};

const opsItems: OpsItem[] = [
  { href: '/admin/settings', label: 'Settings', exact: true },
  { href: '/admin/payroll', label: 'Payroll' },
  { href: '/admin/audit-log', label: 'Audit-logg', matchers: ['/admin/audit-log'] },
];

export function OpsSubnav() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [settingsDirty, setSettingsDirty] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ isDirty?: boolean }>).detail;
      setSettingsDirty(Boolean(detail?.isDirty));
    };

    window.addEventListener('admin:settings-dirty', handler);
    return () => window.removeEventListener('admin:settings-dirty', handler);
  }, []);

  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
      {opsItems.map((item) => {
        const isActive = isRouteActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onMouseEnter={() => prefetchSection(item.href, router)}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {item.label}
              {item.href === '/admin/settings' && settingsDirty ? (
                <StatusPill label="Osparat" tone="warning" size="xs" />
              ) : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
