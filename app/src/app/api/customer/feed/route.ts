import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildCustomerFeedResponse } from '@/lib/customer-feed';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/feed
 *
 * Returns the customer-facing feed contract for the currently logged-in customer.
 * The response is normalized so customer surfaces don't have to interpret
 * raw `customer_concepts` fields or internal status values directly.
 */
export const GET = withAuth(async (_request, user) => {
  const supabase = createSupabaseAdmin();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('matching_data')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const customerProfileId = (profile.matching_data as Record<string, unknown>)
    ?.customer_profile_id as string | undefined;

  if (!customerProfileId) {
    return NextResponse.json({ slots: [], generatedAt: new Date().toISOString() });
  }

  const { data: rows, error } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      concept_id,
      content_overrides,
      match_percentage,
      status,
      feed_order,
      sent_at,
      produced_at,
      published_at,
      tiktok_url,
      cm_note,
      concepts (
        id,
        backend_data,
        overrides,
        is_active
      )
    `)
    .eq('customer_profile_id', customerProfileId)
    .neq('status', 'archived')
    .not('feed_order', 'is', null)
    .order('feed_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(buildCustomerFeedResponse(rows ?? []));
}, ['customer', 'admin', 'content_manager']);
