'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';
import { toast } from 'sonner';

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; pinned?: boolean }) => {
      const res = await apiClient.post(
        `/api/admin/customers/${customerId}/notes`,
        input,
      );
      return (res as { note: AdminCustomerNote }).note;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
      toast.success('Anteckning sparad');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Kunde inte spara anteckning');
    },
  });
}

export function useUpdateAdminCustomerNote(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      noteId: string;
      body?: string;
      pinned?: boolean;
    }) => {
      const { noteId, ...rest } = input;
      const res = await apiClient.patch(
        `/api/admin/customers/${customerId}/notes/${noteId}`,
        rest,
      );
      return (res as { note: AdminCustomerNote }).note;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Kunde inte uppdatera');
    },
  });
}

export function useDeleteAdminCustomerNote(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      await apiClient.del(
        `/api/admin/customers/${customerId}/notes/${noteId}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customers.activity(customerId) });
      toast.success('Anteckning borttagen');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Kunde inte ta bort');
    },
  });
}
