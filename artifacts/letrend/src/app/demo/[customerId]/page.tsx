// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { notFound } from '@/lib/navigation-compat';
import { normalizeCustomerBrief } from '@/lib/database/json';
import { resolveGamePlanDocument } from '@/lib/game-plan';
import { supabase } from '@/lib/supabase/client';
import DemoView from './DemoView';
import type { TimelineConcept } from '@/components/studio/FeedTimeline';

interface DemoData {
  customerId: string;
  businessName: string;
  logoUrl: string | null;
  brief: ReturnType<typeof normalizeCustomerBrief>;
  gamePlanHtml: string | null;
  concepts: TimelineConcept[];
}

export default function DemoPage() {
  const params = useParams<{ customerId: string }>();
  const customerKey = params.customerId ?? '';

  const [data, setData] = useState<DemoData | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerKey) return;

    async function load() {
      try {
        const customerSelect = 'id, business_name, logo_url, brief, game_plan, status';

        const byIdResult = await supabase
          .from('customer_profiles')
          .select(customerSelect)
          .eq('id', customerKey)
          .maybeSingle();

        const invalidUuidLookup =
          byIdResult.error?.message?.toLowerCase().includes('invalid input syntax for type uuid') ?? false;

        let customer = byIdResult.data;
        if (!customer && (invalidUuidLookup || !byIdResult.error)) {
          const bySlugResult = await supabase
            .from('customer_profiles')
            .select(customerSelect)
            .filter('profile_data->>demo_slug', 'eq', customerKey)
            .maybeSingle();
          customer = bySlugResult.data;
        }

        if (!customer || customer.status === 'archived') {
          setNotFoundState(true);
          return;
        }

        const resolvedCustomerId = customer.id;

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

        setData({
          customerId: resolvedCustomerId,
          businessName: customer.business_name,
          logoUrl: customer.logo_url ?? null,
          brief: normalizeCustomerBrief(customer.brief),
          gamePlanHtml,
          concepts: timelineConcepts,
        });
      } catch (err) {
        console.error('DemoPage load error', err);
        setNotFoundState(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [customerKey]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: 14, color: '#7D6E5D' }}>Laddar demo…</div>
      </div>
    );
  }

  if (notFoundState || !data) {
    notFound();
    return null;
  }

  return (
    <DemoView
      customerId={data.customerId}
      businessName={data.businessName}
      logoUrl={data.logoUrl}
      brief={data.brief}
      gamePlanHtml={data.gamePlanHtml}
      concepts={data.concepts}
    />
  );
}
