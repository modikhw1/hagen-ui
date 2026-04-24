type PrefetchRouter = {
  prefetch: (href: string) => void;
};

export const ROUTE_SIBLINGS: Record<string, string[]> = {
  '/admin/billing': ['/admin/invoices', '/admin/subscriptions', '/admin/billing-health'],
  '/admin/team': ['/admin/team/payroll'],
  '/admin/settings': ['/admin/payroll', '/admin/audit-log'],
};

export function prefetchSection(href: string, router: PrefetchRouter) {
  const siblings = ROUTE_SIBLINGS[href] ?? [];
  for (const route of siblings) {
    try {
      router.prefetch(route);
    } catch {
      // Best effort only: prefetch misses should not block navigation.
    }
  }
}
