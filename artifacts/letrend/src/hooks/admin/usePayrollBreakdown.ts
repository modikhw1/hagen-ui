'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';
import {
  payrollBreakdownResponseSchema,
  type PayrollBreakdownResponse,
} from '@/lib/admin/schemas/payroll';

export function usePayrollBreakdown(params: {
  periodKey: string;
  cmId: string;
  enabled: boolean;
}) {
  return useQuery<PayrollBreakdownResponse>({
    queryKey: qk.payroll.breakdown(params.periodKey, params.cmId),
    enabled: params.enabled,
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get(
        `/api/admin/payroll/${encodeURIComponent(params.periodKey)}/cm/${encodeURIComponent(params.cmId)}/breakdown`,
        { signal },
      );

      return parseDto(payrollBreakdownResponseSchema, payload, {
        name: 'payrollBreakdownResponse',
        path: `/api/admin/payroll/${params.periodKey}/cm/${params.cmId}/breakdown`,
      });
    },
    staleTime: 60_000,
  });
}
