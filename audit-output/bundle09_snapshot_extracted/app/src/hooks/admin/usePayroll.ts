'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import { payrollResponseSchema } from '@/lib/admin/schemas/payroll';
import { qk } from '@/lib/admin/queryKeys';

export function usePayroll(periodKey: string | null) {
  return useQuery({
    queryKey: qk.payroll.period(periodKey),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get('/api/admin/payroll', {
        signal,
        query: { period: periodKey },
      });
      return parseDto(payrollResponseSchema, payload);
    },
    staleTime: 60_000,
  });
}
