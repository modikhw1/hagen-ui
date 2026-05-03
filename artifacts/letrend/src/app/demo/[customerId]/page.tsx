import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import DemoView from './DemoView';
import { normalizeCustomerBrief } from '@/lib/database/json';
import { resolveGamePlanDocument } from '@/lib/game-plan';
import type { TimelineConcept } from '@/components/studio/FeedTimeline';

export default function DemoPage() {
  const { customerId: customerKey } = useParams<{ customerId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['demo-customer', customerKey],
    enabled: !!customerKey,
    queryFn: async () => {
      const sel = 'id, business_name, logo_url, brief, game_plan, status';
      let { data: customer } = await supabase.from('customer_profiles').select(sel).eq('id', customerKey!).maybeSingle();
      if (!customer) {
        const { data: bySlug } = await supabase.from('customer_profiles').select(sel).filter('profile_data->>demo_slug', 'eq', customerKey!).maybeSingle();
        customer = bySlug;
      }
      if (!customer || customer.status === 'archived') return null;
      const { data: gamePlanRecord } = await supabase.from('customer_game_plans').select('html, plain_text, editor_version, updated_at').eq('customer_id', customer.id).maybeSingle();
      const gamePlanHtml = resolveGamePlanDocument(gamePlanRecord, customer.game_plan).html;
      const { data: concepts } = await supabase.from('customer_concepts').select('id, cm_note, tags, tiktok_thumbnail_url, tiktok_views, tiktok_likes, feed_order, published_at').eq('customer_profile_id', customer.id).not('feed_order', 'is', null).order('feed_order', { ascending: false });
      const timelineConcepts: TimelineConcept[] = (concepts ?? []).map(c => ({
        id: String(c.id), feed_order: c.feed_order ?? null, cm_note: c.cm_note ?? null,
        tags: (c.tags as string[]) ?? [], tiktok_thumbnail_url: c.tiktok_thumbnail_url ?? null,
        tiktok_views: c.tiktok_views ?? null, tiktok_likes: c.tiktok_likes ?? null, published_at: c.published_at ?? null,
      }));
      return { customer, gamePlanHtml, timelineConcepts };
    },
  });
  if (isLoading) return <div style={{ padding: 40 }}>Laddar...</div>;
  if (!data) return <div style={{ padding: 40 }}>Demo hittades inte.</div>;
  return <DemoView customerId={data.customer.id} businessName={data.customer.business_name} logoUrl={data.customer.logo_url ?? null} brief={normalizeCustomerBrief(data.customer.brief)} gamePlanHtml={data.gamePlanHtml} concepts={data.timelineConcepts} />;
}
