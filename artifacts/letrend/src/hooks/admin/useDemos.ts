'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { moveDemoBetweenColumns } from '@/lib/admin-derive/demos';
import { invalidateFor } from '@/lib/admin/cache-invalidation';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  convertDemoResultSchema,
  demosBoardDtoSchema,
  type ConvertDemoInput,
  type CreateDemoInput,
  type DemosBoardDto,
  type UpdateDemoStatusInput,
} from '@/lib/admin/schemas/demos';
import { qk } from '@/lib/admin/queryKeys';

export function useDemosBoard(days = 30) {
  return useQuery({
    queryKey: qk.demos.board(days),
    queryFn: async ({ signal }): Promise<DemosBoardDto> => {
      const payload = await apiClient.get('/api/admin/demos', {
        signal,
        query: { days },
      });
      return parseDto(demosBoardDtoSchema, payload, {
        name: 'demosBoardDto',
        path: '/api/admin/demos',
      });
    },
    staleTime: 15_000,
  });
}

export function useUpdateDemoStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string } & UpdateDemoStatusInput) =>
      apiClient.patch(`/api/admin/demos/${input.id}`, {
        status: input.status,
        lost_reason: input.lost_reason ?? null,
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: qk.demos.root() });

      const snapshots = queryClient.getQueriesData<DemosBoardDto>({
        queryKey: qk.demos.root(),
      });

      snapshots.forEach(([queryKey, current]) => {
        if (!current) {
          return;
        }
        queryClient.setQueryData(
          queryKey,
          moveDemoBetweenColumns(current, variables.id, variables.status),
        );
      });

      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([queryKey, snapshot]) => {
        queryClient.setQueryData(queryKey, snapshot);
      });
    },
    onSettled: async () => {
      await invalidateFor(queryClient, 'demos.update_status');
    },
  });
}

export function useConvertDemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; payload: ConvertDemoInput }) => {
      const payload = await apiClient.post(`/api/admin/demos/${input.id}/convert`, input.payload);
      return parseDto(convertDemoResultSchema, payload, {
        name: 'convertDemoResult',
        path: `/api/admin/demos/${input.id}/convert`,
      });
    },
    onSuccess: async () => {
      await invalidateFor(queryClient, 'demos.convert');
    },
  });
}

export function useCreateDemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDemoInput) => apiClient.post('/api/admin/demos', input),
    onSuccess: async () => {
      await invalidateFor(queryClient, 'demos.create');
    },
  });
}
