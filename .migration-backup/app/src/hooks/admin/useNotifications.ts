'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  notificationsUnreadCountSchema,
  notificationsResponseSchema,
  type NotificationsUnreadCountDTO,
  type NotificationsDTO,
} from '@/lib/admin/dtos/overview';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { qk } from '@/lib/admin/queryKeys';

export function useNotifications(options: { unread?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: qk.notifications.list({ unread: options.unread }),
    queryFn: async ({ signal }): Promise<NotificationsDTO> => {
      const payload = await apiClient.get('/api/admin/notifications', {
        signal,
        query: {
          unread: options.unread ? 'true' : undefined,
          limit: options.limit,
        },
      });

      return parseDto(notificationsResponseSchema, payload, {
        name: 'notificationsPayload',
        path: '/api/admin/notifications',
      });
    },
    staleTime: 30_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useNotificationsUnreadCount() {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: async ({ signal }): Promise<NotificationsUnreadCountDTO> => {
      const payload = await apiClient.get('/api/admin/notifications/unread-count', {
        signal,
      });
      return parseDto(notificationsUnreadCountSchema, payload, {
        name: 'notificationsUnreadCount',
        path: '/api/admin/notifications/unread-count',
      });
    },
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useMarkNotificationsSeen() {
  const refresh = useAdminRefresh();

  return useMutation({
    mutationFn: async (surface: 'overview' | 'notifications' = 'notifications') =>
      apiClient.post('/api/admin/notifications/mark-seen', { surface }),
    onSuccess: async () => {
      await refresh([{ type: 'global', scope: 'notifications' }]);
    },
  });
}

export function useMarkNotificationRead() {
  const refresh = useAdminRefresh();

  return useMutation({
    mutationFn: async (id: string) => apiClient.post(`/api/admin/notifications/${id}/read`, {}),
    onSuccess: async () => {
      await refresh([{ type: 'global', scope: 'notifications' }]);
    },
  });
}
