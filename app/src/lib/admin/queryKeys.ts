import type { EnvFilter } from '@/lib/admin/billing';

export const qk = {
  customers: {
    list: () => ['admin', 'customers'] as const,
    detail: (id: string) => ['admin', 'customers', id] as const,
    invoices: (id: string) => ['admin', 'customers', id, 'invoices'] as const,
    subscription: (id: string, stripeSubId: string | null = null) =>
      ['admin', 'customers', id, 'subscription', stripeSubId] as const,
    tiktok: (id: string) => ['admin', 'customers', id, 'tiktok'] as const,
    activity: (id: string) => ['admin', 'customers', id, 'activity'] as const,
    pendingItems: (id: string) => ['admin', 'customers', id, 'pending-items'] as const,
    buffer: () => ['admin', 'customers', 'buffer'] as const,
  },
  team: {
    list: () => ['admin', 'team'] as const,
    overview: () => ['admin', 'team', 'overview'] as const,
    member: (id: string) => ['admin', 'team', id] as const,
  },
  billing: {
    invoices: (env: EnvFilter) => ['admin', 'billing', 'invoices', env] as const,
    subscriptions: (env: EnvFilter) =>
      ['admin', 'billing', 'subscriptions', env] as const,
    health: () => ['admin', 'billing', 'health'] as const,
  },
  overview: {
    main: () => ['admin', 'overview'] as const,
    operational: () => ['admin', 'overview', 'operational'] as const,
  },
  notifications: () => ['admin', 'notifications'] as const,
  demos: {
    board: () => ['admin', 'demos-board'] as const,
  },
  payroll: {
    period: (period: string) => ['admin', 'payroll', period] as const,
  },
  settings: () => ['admin', 'settings'] as const,
  auditLog: () => ['admin', 'audit-log'] as const,
} as const;
