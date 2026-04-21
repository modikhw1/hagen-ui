'use client';

import { useQuery } from '@tanstack/react-query';
import type { OverviewPayload } from '@/lib/admin/overview-types';

async function safeJson<T>(response: Response, fallback: T): Promise<T> {
  return response.ok ? ((await response.json()) as T) : fallback;
}

async function fetchCustomers(): Promise<OverviewPayload['customers']> {
  const response = await fetch('/api/admin/customers', { credentials: 'include' });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    customers?: OverviewPayload['customers'];
    profiles?: OverviewPayload['customers'];
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hamta kunder');
  }

  return payload.customers ?? payload.profiles ?? [];
}

async function fetchTeam(): Promise<OverviewPayload['team']> {
  const response = await fetch('/api/admin/team', { credentials: 'include' });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    members?: Array<OverviewPayload['team'][number]>;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hamta teamet');
  }

  return payload.members ?? [];
}

async function fetchOperationalData() {
  const response = await fetch('/api/admin/overview/operational', { credentials: 'include' });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    interactions?: OverviewPayload['interactions'];
    bufferRows?: OverviewPayload['bufferRows'];
    cmNotifications?: OverviewPayload['cmNotifications'];
    attentionSnoozes?: OverviewPayload['attentionSnoozes'];
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hamta overview-data');
  }

  return {
    interactions: payload.interactions ?? [],
    bufferRows: payload.bufferRows ?? [],
    cmNotifications: payload.cmNotifications ?? [],
    attentionSnoozes: payload.attentionSnoozes ?? [],
  };
}

async function fetchOverview(): Promise<OverviewPayload> {
  const [customers, team, operational, invoicesRes, subsRes, healthRes, costsRes, demosRes] = await Promise.all([
    fetchCustomers(),
    fetchTeam(),
    fetchOperationalData(),
    fetch('/api/admin/invoices?status=open&limit=20&page=1', { credentials: 'include' }),
    fetch('/api/admin/subscriptions?limit=100&page=1', { credentials: 'include' }),
    fetch('/api/admin/billing-health', { credentials: 'include' }),
    fetch('/api/admin/service-costs?days=30', { credentials: 'include' }),
    fetch('/api/admin/demos?days=30', { credentials: 'include' }),
  ]);

  return {
    customers,
    team,
    interactions: operational.interactions,
    bufferRows: operational.bufferRows,
    invoices: ((await safeJson(invoicesRes, { invoices: [] })) as { invoices: Array<OverviewPayload['invoices'][number] & { customer_profile_id?: string }> }).invoices.map(
      (invoice) => ({
        ...invoice,
        customer_id: invoice.customer_id ?? invoice.customer_profile_id,
      }),
    ),
    subscriptions: ((await safeJson(subsRes, { subscriptions: [] })) as { subscriptions: OverviewPayload['subscriptions'] }).subscriptions,
    billingHealth: (await safeJson(healthRes, null)) as OverviewPayload['billingHealth'],
    serviceCosts: (await safeJson(costsRes, { entries: [], total: 0 })) as OverviewPayload['serviceCosts'],
    demos: (await safeJson(demosRes, { sent: 0, converted: 0, demos: [] })) as OverviewPayload['demos'],
    cmNotifications: operational.cmNotifications,
    attentionSnoozes: operational.attentionSnoozes,
  };
}

export function useOverviewData() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: fetchOverview,
    staleTime: 60_000,
  });
}
