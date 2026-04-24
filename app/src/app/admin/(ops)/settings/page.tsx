import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { qk } from '@/lib/admin/queryKeys';
import { fetchAdminSettingsServer } from '@/lib/admin/server/settings';

import { getAdminActionSession } from '@/app/admin/_actions/shared';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const queryClient = new QueryClient();

  // Parallelize auth and settings prefetching
  await Promise.all([
    getAdminActionSession('settings.read' as any),
    queryClient.prefetchQuery({
      queryKey: qk.settings.root(),
      queryFn: () => fetchAdminSettingsServer(),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
