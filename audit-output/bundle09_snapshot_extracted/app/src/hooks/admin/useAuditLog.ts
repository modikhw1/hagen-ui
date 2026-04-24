'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  auditLogFilterSchema,
  auditLogResponseSchema,
  type AuditLogFilter,
} from '@/lib/admin/schemas/audit';
import { qk } from '@/lib/admin/queryKeys';

export function useAuditLog(filter: Partial<AuditLogFilter>) {
  const normalizedFilter = auditLogFilterSchema.parse({
    limit: 50,
    ...filter,
  });

  return useInfiniteQuery({
    queryKey: qk.auditLog.list(normalizedFilter),
    queryFn: async ({ signal, pageParam }) => {
      const payload = await apiClient.get('/api/admin/audit-log', {
        signal,
        query: {
          ...normalizedFilter,
          cursor: typeof pageParam === 'string' ? pageParam : normalizedFilter.cursor ?? null,
        },
      });
      return parseDto(auditLogResponseSchema, payload);
    },
    initialPageParam: normalizedFilter.cursor ?? null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 10_000,
  });
}
