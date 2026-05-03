'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  CmChangePreviewInput,
  CmChangePreviewResult,
} from '@/lib/admin/cm-change-preview';
import { apiClient } from '@/lib/admin/api-client';

type PreviewResponse = {
  preview: CmChangePreviewResult | null;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

export function usePreviewCmChange(
  customerId: string,
  input: CmChangePreviewInput | null,
) {
  const debouncedInput = useDebouncedValue(input, 250);

  return useQuery({
    queryKey: ['admin', 'customer', customerId, 'cm-change-preview', debouncedInput],
    enabled: debouncedInput !== null,
    queryFn: async ({ signal }) => {
      const payload = await apiClient.post<PreviewResponse>(
        `/api/admin/customers/${customerId}/actions/change_account_manager/preview`,
        {
          next_cm_id: debouncedInput?.next?.id ?? null,
          mode: debouncedInput?.mode,
          effective_date: debouncedInput?.effective_date,
          coverage_end_date: debouncedInput?.coverage_end_date ?? null,
          compensation_mode: debouncedInput?.compensation_mode ?? 'covering_cm',
        },
        { signal },
      );

      return payload.preview;
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });
}
