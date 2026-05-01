import type { EnvFilter } from '@/lib/admin/billing';

export type CustomerListFilter = {
  status?: 'active' | 'invited' | 'paused' | 'archived' | 'all';
  cmId?: string | null;
  q?: string;
  page?: number;
  limit?: number;
};

type BillingListFilter = {
  status?: string;
  sort?: string;
  q?: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
};

type NotificationFilter = {
  unread?: boolean;
};

type AuditLogFilter = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  onlyErrors?: boolean;
  billingOnly?: boolean;
  limit: number;
  cursor?: string | null;
};

const stable = <T extends object>(value: T) =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([, currentValue]) => currentValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  ) as T;

export const qk = {
  customers: {
    all: () => ['admin', 'customers'] as const,
    list: (filter: CustomerListFilter = {}) =>
      ['admin', 'customers', 'list', stable(filter)] as const,
    detail: (id: string) => ['admin', 'customers', 'detail', id] as const,
    invoices: (id: string) => ['admin', 'customers', id, 'invoices'] as const,
    subscription: (id: string) => ['admin', 'customers', id, 'subscription'] as const,
    cmCoverage: (id: string) => ['admin', 'customers', id, 'cm-coverage'] as const,
    tiktok: (id: string) => ['admin', 'customers', id, 'tiktok'] as const,
    activity: (id: string) => ['admin', 'customers', id, 'activity'] as const,
    pendingItems: (id: string) => ['admin', 'customers', id, 'pending-items'] as const,
    buffer: () => ['admin', 'customers', 'buffer'] as const,
  },
  team: {
    all: () => ['admin', 'team'] as const,
    list: (sort: 'standard' | 'anomalous' = 'standard') =>
      ['admin', 'team', 'list', sort] as const,
    overview: () => ['admin', 'team', 'overview'] as const,
    member: (id: string) => ['admin', 'team', 'member', id] as const,
    lite: (filter: { role?: 'admin' | 'content_manager'; includeInactive?: boolean } = {}) =>
      ['admin', 'team', 'lite', stable(filter)] as const,
    absences: (cmId?: string) => ['admin', 'team', 'absences', cmId ?? 'all'] as const,
  },
  billing: {
    all: () => ['admin', 'billing'] as const,
    invoices: (env: EnvFilter, filter: BillingListFilter = {}) =>
      ['admin', 'billing', 'invoices', env, stable(filter)] as const,
    invoiceLines: (invoiceId: string) => ['admin', 'billing', 'invoice-lines', invoiceId] as const,
    invoiceOps: (invoiceId: string) => ['admin', 'billing', 'invoice-ops', invoiceId] as const,
    subscriptions: (env: EnvFilter, filter: BillingListFilter = {}) =>
      ['admin', 'billing', 'subscriptions', env, stable(filter)] as const,
    health: () => ['admin', 'billing', 'health'] as const,
    healthStatus: (env: EnvFilter) => ['admin', 'billing', 'health', env] as const,
    // Compatibility aliases while migrating call sites.
    invoiceList: (env: EnvFilter, status: string, page: number, limit: number) =>
      ['admin', 'billing', 'invoices', env, stable({ status, page, limit })] as const,
    subscriptionList: (env: EnvFilter, status: string, page: number, limit: number) =>
      ['admin', 'billing', 'subscriptions', env, stable({ status, page, limit })] as const,
    invoiceOperations: (invoiceId: string | null) =>
      ['admin', 'billing', 'invoice-ops', invoiceId ?? 'none'] as const,
    invoiceOperation: (invoiceId: string) => ['admin', 'billing', 'invoice-ops', invoiceId] as const,
  },
  overview: {
    all: () => ['admin', 'overview'] as const,
    main: () => ['admin', 'overview', 'main'] as const,
    metrics: () => ['admin', 'overview', 'metrics'] as const,
    attention: (sort: 'standard' | 'lowest_activity' = 'standard') =>
      ['admin', 'overview', 'attention', sort] as const,
    cmPulse: (sort: 'standard' | 'lowest_activity' = 'standard') =>
      ['admin', 'overview', 'cm-pulse', sort] as const,
    costs: () => ['admin', 'overview', 'costs'] as const,
  },
  notifications: {
    all: () => ['admin', 'notifications'] as const,
    root: () => ['admin', 'notifications'] as const,
    unreadCount: () => ['admin', 'notifications', 'unread-count'] as const,
    list: (filter: NotificationFilter = {}) =>
      ['admin', 'notifications', 'list', stable(filter)] as const,
  },
  demos: {
    all: () => ['admin', 'demos'] as const,
    root: () => ['admin', 'demos'] as const,
    board: (days = 30) => ['admin', 'demos', 'board', days] as const,
    detail: (id: string) => ['admin', 'demos', 'detail', id] as const,
  },
  payroll: {
    all: () => ['admin', 'payroll'] as const,
    root: () => ['admin', 'payroll'] as const,
    period: (key: string | null) => ['admin', 'payroll', key ?? 'current'] as const,
    breakdown: (period: string, cmId: string) =>
      ['admin', 'payroll', 'breakdown', period, cmId] as const,
  },
  settings: {
    all: () => ['admin', 'settings'] as const,
    root: () => ['admin', 'settings'] as const,
  },
  auditLog: {
    all: () => ['admin', 'audit-log'] as const,
    root: () => ['admin', 'audit-log'] as const,
    list: (filter: { actor?: string; entity?: string; limit: number; cursor?: string | null }) =>
      ['admin', 'audit-log', filter] as const,
  },
} as const;
