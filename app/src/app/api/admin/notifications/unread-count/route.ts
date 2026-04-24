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

    const lastSeenDate = payload.attentionFeedSeenAt
      ? new Date(payload.attentionFeedSeenAt)
      : null;
    
    const count = payload.attentionItems.filter((item) => {
      const timestamp = attentionTimestamp(item);
      if (!timestamp) return false;
      return lastSeenDate ? +timestamp > +lastSeenDate : true;
    }).length;

    return {
      count,
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
          'Cache-Control': 'private, max-age=15',
        },
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Kunde inte hamta antalet olasta notifikationer',
      500,
    );
  }
}, ['admin']);

