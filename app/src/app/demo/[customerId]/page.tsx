import { notFound } from 'next/navigation';
import { normalizeCustomerBrief } from '@/lib/database/json';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { resolveGamePlanDocument } from '@/lib/game-plan';
import DemoView from './DemoView';
import type { TimelineConcept } from '@/components/studio/FeedTimeline';

// Server component that fetches demo data and passes it to the client view.

export default async function DemoPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId: customerKey } = await params;
  const supabase = createSupabaseAdmin();

  const customerSelect = 'id, business_name, logo_url, brief, game_plan, status';
  const byIdResult = await supabase
    .from('customer_profiles')
    .select(customerSelect)
    .eq('id', customerKey)
    .maybeSingle();
  const invalidUuidLookup =
    byIdResult.error?.message?.toLowerCase().includes('invalid input syntax for type uuid') ??
    false;

  let customer = byIdResult.data;
  if (!customer && (invalidUuidLookup || !byIdResult.error)) {
    const bySlugResult = await supabase
      .from('customer_profiles')
      .select(customerSelect)
      .filter('profile_data->>demo_slug', 'eq', customerKey)
      .maybeSingle();
    customer = bySlugResult.data;
  }

  if (!customer) {
    notFound();
  }
  const resolvedCustomerId = customer.id;

  if (customer.status === 'archived') {
    notFound();
  }

  const { data: gamePlanRecord } = await supabase
    .from('customer_game_plans')
    .select('html, plain_text, editor_version, updated_at')
    .eq('customer_id', resolvedCustomerId)
    .maybeSingle();

  const gamePlanHtml = resolveGamePlanDocument(gamePlanRecord, customer.game_plan).html;

  const { data: concepts } = await supabase
    .from('customer_concepts')
    .select('id, cm_note, tags, tiktok_thumbnail_url, tiktok_views, tiktok_likes, feed_order, published_at')
    .eq('customer_profile_id', resolvedCustomerId)
    .not('feed_order', 'is', null)
    .order('feed_order', { ascending: false });

  const timelineConcepts: TimelineConcept[] = (concepts ?? []).map((concept) => ({
    id: String(concept.id),
    feed_order: concept.feed_order ?? null,
    cm_note: concept.cm_note ?? null,
    tags: (concept.tags as string[]) ?? [],
    tiktok_thumbnail_url: concept.tiktok_thumbnail_url ?? null,
    tiktok_views: concept.tiktok_views ?? null,
    tiktok_likes: concept.tiktok_likes ?? null,
    published_at: concept.published_at ?? null,
  }));

  return (
    <DemoView
      customerId={resolvedCustomerId}
      businessName={customer.business_name}
      logoUrl={customer.logo_url ?? null}
      brief={normalizeCustomerBrief(customer.brief)}
      gamePlanHtml={gamePlanHtml}
      concepts={timelineConcepts}
    />
  );
}
