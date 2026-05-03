import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { logInteraction } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  DEFAULT_GRID_CONFIG,
  type FeedSpan,
} from '@/types/studio-v2';
import {
  feedOrderToFrac,
  fracToFeedOrder,
} from '@/lib/feed-planner-utils';

function parseHistoryOffset(request: NextRequest): number {
  const raw = new URL(request.url).searchParams.get('history_offset');
  const value = raw == null ? 0 : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function normalizeSpanForViewport(span: FeedSpan, historyOffset: number): FeedSpan {
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

export const GET = withAuth(async (request) => {
  const customerId = new URL(request.url).searchParams.get('customer_id');
  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const historyOffset = parseHistoryOffset(request);
  const { data, error } = await supabase
    .from('feed_spans')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const spans = ((data ?? []) as FeedSpan[]).map((span) =>
    normalizeSpanForViewport(span, historyOffset)
  );

  return NextResponse.json({ spans });
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const historyOffset =
    typeof body?.history_offset === 'number' && Number.isFinite(body.history_offset)
      ? body.history_offset
      : 0;

  const startFeedOrder =
    typeof body?.start_feed_order === 'number'
      ? body.start_feed_order
      : typeof body?.frac_start === 'number'
        ? fracToFeedOrder(body.frac_start, historyOffset, DEFAULT_GRID_CONFIG)
        : null;
  const endFeedOrder =
    typeof body?.end_feed_order === 'number'
      ? body.end_feed_order
      : typeof body?.frac_end === 'number'
        ? fracToFeedOrder(body.frac_end, historyOffset, DEFAULT_GRID_CONFIG)
        : null;

  const insertBody = {
    ...body,
    cm_id: body?.cm_id || user.id,
    start_feed_order: startFeedOrder,
    end_feed_order: endFeedOrder,
  };

  const { data, error } = await supabase
    .from('feed_spans')
    .insert(insertBody)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logInteraction({
    type: 'feedplan_edit',
    cmProfileId: user.id,
    customerId: data.customer_id ?? body?.customer_id ?? null,
    metadata: { action: 'create', span_id: data.id },
    client: supabase,
  });

  return NextResponse.json({
    span: normalizeSpanForViewport(data as FeedSpan, historyOffset),
  });
}, ['admin', 'content_manager']);
