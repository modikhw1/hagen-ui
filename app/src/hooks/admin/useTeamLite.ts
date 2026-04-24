'use client';

import { useTeamMembers } from '@/hooks/admin/useTeamMembers';

export function useTeamLite(role?: 'admin' | 'content_manager') {
  return useTeamMembers(role ? { role } : undefined);
}
