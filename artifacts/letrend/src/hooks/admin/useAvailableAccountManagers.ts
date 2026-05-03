// app/src/hooks/admin/useAvailableAccountManagers.ts

'use client';

import { useQuery } from '@tanstack/react-query';

export interface AccountManagerOption {
  id: string;
  full_name: string;
  email: string | null;
  city: string | null;
  avatar_url: string | null;
  commission_rate: number | null;
  start_date: string | null;
  active_customer_count: number;
  on_absence: boolean;
}

interface UseAvailableAccountManagersOptions {
  excludeId?: string;
  enabled?: boolean;
}

async function fetchAvailableAccountManagers(): Promise<
  AccountManagerOption[]
> {
  const res = await fetch('/api/admin/account-managers/available', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as { items: AccountManagerOption[] };
  return json.items;
}

export function useAvailableAccountManagers(
  options: UseAvailableAccountManagersOptions = {},
) {
  const { excludeId, enabled = true } = options;

  return useQuery({
    queryKey: ['admin', 'account-managers', 'available'],
    queryFn: fetchAvailableAccountManagers,
    enabled,
    staleTime: 30_000,
    select: (data) =>
      excludeId ? data.filter((cm) => cm.id !== excludeId) : data,
  });
}
