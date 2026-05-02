'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/lib/admin/api-client';
import { customerCoverageAbsenceSchema } from '@/lib/admin/dtos/customer';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

const customerCoverageResponseSchema = z.object({
  coverage_absences: z.array(customerCoverageAbsenceSchema).default([]),
});

export function useCustomerCmCoverage(id: string) {
  return useQuery({
    queryKey: qk.customers.cmCoverage(id),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/coverage`, { signal });
      return (await parseDto(customerCoverageResponseSchema, payload, {
        name: 'customerCoveragePayload',
        path: `/api/admin/customers/${id}/coverage`,
      })).coverage_absences;
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });
}
