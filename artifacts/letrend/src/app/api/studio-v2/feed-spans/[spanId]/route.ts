import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { logInteraction } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { DEFAULT_GRID_CONFIG, type FeedSpan } from '@/types/studio-v2';
import {
  feedOrderToFrac,
  fracToFeedOrder,
} from '@/lib/feed-planner-utils';

function normalizeSpan(span: FeedSpan, historyOffset: number): FeedSpan {
  if (
    typeof span.start_feed_order === 'number' &&
    typeof span.end_feed_order === 'number'
  ) {
    return {
      ...span,
      frac_start: feedOrderToFrac(span.start_feed_order, historyOffset, DEFAULT_GRID_CONFIG),
      frac_end: feedOrderToFrac(span.end_feed_order, historyOffset, DEFAULT_GRID_CONFIG),
    };
  }

  return span;
}

export const PATCH = withAuth(async (request, user, { params }: { params: Promise<{ spanId: string }> }) => {
  const { spanId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const historyOffset =
    typeof body?.history_offset === 'number' && Number.isFinite(body.history_offset)
      ? body.history_offset
      : 0;

  const patchBody = {
    ...body,
    start_feed_order:
      typeof body?.start_feed_order === 'number'
        ? body.start_feed_order
        : typeof body?.frac_start === 'number'
          ? fracToFeedOrder(body.frac_start, historyOffset, DEFAULT_GRID_CONFIG)
          : body?.start_feed_order ?? null,
    end_feed_order:
      typeof body?.end_feed_order === 'number'
        ? body.end_feed_order
        : typeof body?.frac_end === 'number'
          ? fracToFeedOrder(body.frac_end, historyOffset, DEFAULT_GRID_CONFIG)
          : body?.end_feed_order ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('feed_spans')
    .update(patchBody)
    .eq('id', spanId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logInteraction({
    type: 'feedplan_edit',
    cmProfileId: user.id,
    customerId: data.customer_id ?? null,
    metadata: { action: 'update', span_id: data.id },
    client: supabase,
  });

  return NextResponse.json({ span: normalizeSpan(data as FeedSpan, historyOffset) });
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (_request, user, { params }: { params: Promise<{ spanId: string }> }) => {
  const { spanId } = await params;
  const supabase = createSupabaseAdmin();
  const { data: existingSpan } = await supabase
    .from('feed_spans')
    .select('id, customer_id')
    .eq('id', spanId)
    .maybeSingle();

  const { error } = await supabase
    .from('feed_spans')
    .delete()
    .eq('id', spanId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logInteraction({
    type: 'feedplan_edit',
    cmProfileId: user.id,
    customerId: existingSpan?.customer_id ?? null,
    metadata: { action: 'delete', span_id: spanId },
    client: supabase,
  });

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
