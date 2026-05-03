'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';

export type AdminCustomerNote = {
  id: string;
  body: string;
  pinned: boolean;
  author_name: string | null;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function useCreateAdminCustomerNote(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; pinned?: boolean }) => {
      const response = await apiClient.post(
        `/api/admin/customers/${customerId}/notes`,
        input,
      );
      return (response as { note: AdminCustomerNote }).note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
      toast.success('Anteckning sparad');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara anteckning');
    },
  });
}

export function useUpdateAdminCustomerNote(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      noteId: string;
      body?: string;
      pinned?: boolean;
    }) => {
      const { noteId, ...rest } = input;
      const response = await apiClient.patch(
        `/api/admin/customers/${customerId}/notes/${noteId}`,
        rest,
      );
      return (response as { note: AdminCustomerNote }).note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera');
    },
  });
}

export function useDeleteAdminCustomerNote(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      await apiClient.del(`/api/admin/customers/${customerId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
      toast.success('Anteckning borttagen');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort');
    },
  });
}
