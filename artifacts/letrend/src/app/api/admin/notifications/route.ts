import { z } from 'zod';
import { attentionTimestamp } from '@/lib/admin-derive/attention';
import { loadOverviewAttentionSection } from '@/lib/admin/server/overview';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';

const querySchema = z
  .object({
    unread: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'overview.read');

  const parsed = querySchema.safeParse({
    unread: request.nextUrl.searchParams.get('unread') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  try {
    const payload = await loadOverviewAttentionSection({
      sortMode: 'standard',
      userId: user.id,
    });
    const lastSeenAt = payload.attentionFeedSeenAt;
    const lastSeenDate = lastSeenAt ? new Date(lastSeenAt) : null;
    const unreadItems = payload.attentionItems.filter((item) => {
      const timestamp = attentionTimestamp(item);
      if (!timestamp) {
        return false;
      }
      return lastSeenDate ? +timestamp > +lastSeenDate : true;
    });
    const items = parsed.data.unread === 'true' ? unreadItems : payload.attentionItems;
    const limit = parsed.data.limit ?? items.length;

    return new Response(
      JSON.stringify({
        items: items.slice(0, limit),
        snoozedItems: payload.snoozedAttentionItems.slice(0, limit),
        unreadCount: unreadItems.length,
        totalCount: payload.attentionItems.length,
        snoozedCount: payload.snoozedAttentionItems.length,
        lastSeenAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=10',
        },
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte h\u00e4mta notifikationer',
      500,
    );
  }
}, ['admin']);
