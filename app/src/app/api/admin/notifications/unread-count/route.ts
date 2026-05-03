import { attentionTimestamp } from '@/lib/admin-derive/attention';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { loadOverviewAttentionSection } from '@/lib/admin/server/overview';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

const getCachedUnreadCount = (userId: string) => unstable_cache(
  async () => {
    const payload = await loadOverviewAttentionSection({
      sortMode: 'standard',
      userId,
    });

    return {
      count: payload.attentionItems.length,
      fetchedAt: new Date().toISOString()
    };
  },
  ['admin-unread-count-v2', userId],
  { revalidate: 30, tags: ['admin-notifications'] }
)();
export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'overview.read');

  try {
    const { count, fetchedAt } = await getCachedUnreadCount(user.id);

    return new Response(
      JSON.stringify({ count, fetchedAt }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Kunde inte hämta antalet olästa notifikationer',
      500,
    );
  }
}, ['admin']);

