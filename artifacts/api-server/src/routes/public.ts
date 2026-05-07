import { Router } from 'express';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();

type JsonRecord = Record<string, unknown>;

type DemoPreviewConcept = {
  id: string;
  feedOrder: number;
  title: string;
  source: 'letrend' | 'tiktok' | 'imported_history';
  tag: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  headline: string | null;
  whyWorks: string | null;
  whyFits: string | null;
  originalUrl: string | null;
};

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function firstRecord(value: unknown): JsonRecord | null {
  if (!value) return null;
  if (!Array.isArray(value)) return asRecord(value);
  return value.length > 0 ? asRecord(value[0]) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value);
    if (text) return text;
  }
  return null;
}

function firstStringFromArray(value: unknown): string | null {
  const arr = readStringArray(value);
  return arr[0] ?? null;
}

function joinedStringArray(value: unknown): string | null {
  const arr = readStringArray(value);
  return arr.length > 0 ? arr.join(' ') : null;
}

function getJoinedConcept(row: JsonRecord): JsonRecord {
  const joined = row['concepts'];
  if (Array.isArray(joined)) return asRecord(joined[0]);
  return asRecord(joined);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(value: string | null): string | null {
  if (!value) return null;
  const blocks = value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return null;
  return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
}

function readLegacyGamePlanText(value: unknown): string | null {
  const record = asRecord(value);
  return firstString(
    record['plain_text'],
    record['description'],
    record['summary'],
    joinedStringArray(record['goals']),
    joinedStringArray(record['contentThemes']),
  );
}

function buildPreviewConcept(row: JsonRecord): DemoPreviewConcept | null {
  const id = readString(row['id']);
  const feedOrder = readNumber(row['feed_order']);
  if (!id || feedOrder === null) return null;

  const joinedConcept = getJoinedConcept(row);
  const backendData = asRecord(joinedConcept['backend_data']);
  const baseOverrides = asRecord(joinedConcept['overrides']);
  const contentOverrides = asRecord(row['content_overrides']);
  const tags = readStringArray(row['tags']);
  const script = asRecord(backendData['script']);
  const humor = asRecord(script['humor']);
  const humorAnalysis = asRecord(backendData['humor_analysis']);
  const sigmaTaste = asRecord(backendData['sigma_taste']);
  const classification = asRecord(sigmaTaste['content_classification']);
  const replicability = asRecord(backendData['replicability']);

  const hasSourceConcept = Boolean(readString(row['concept_id']));
  const source: DemoPreviewConcept['source'] = hasSourceConcept
    ? 'letrend'
    : readString(row['history_source']) === 'tiktok_profile'
      ? 'tiktok'
      : 'imported_history';

  const title = firstString(
    contentOverrides['headline'],
    row['custom_headline'],
    baseOverrides['headline_sv'],
    backendData['headline_sv'],
    backendData['headline'],
    script['conceptCore'],
    backendData['title'],
    contentOverrides['script'],
  ) ?? (source === 'letrend' ? 'LeTrend-koncept' : 'TikTok-klipp');

  const whyWorks = firstString(
    row['custom_why_it_works'],
    baseOverrides['whyItWorks_sv'],
    backendData['whyItWorks_sv'],
    humor['whyItWorks'],
    classification['classification_reasoning'],
    humorAnalysis['why'],
    backendData['replicability_analysis'],
    replicability['replicability_notes'],
  );

  const whyFits = firstString(
    contentOverrides['why_it_fits'],
    row['why_it_fits'],
    firstStringFromArray(baseOverrides['whyItFits_sv']),
    firstStringFromArray(backendData['whyItFits_sv']),
    row['cm_note'],
  );

  return {
    id,
    feedOrder,
    title,
    source,
    tag: tags[0] ?? readString(contentOverrides['tag']),
    thumbnailUrl: firstString(
      row['tiktok_thumbnail_url'],
      contentOverrides['thumbnail_url'],
      contentOverrides['thumbnailUrl'],
      backendData['thumbnail_url'],
      backendData['thumbnailUrl'],
      backendData['cover_image_url'],
      backendData['coverImageUrl'],
    ),
    publishedAt: readString(row['published_at']),
    views: readNumber(row['tiktok_views']),
    headline: firstString(contentOverrides['headline'], row['custom_headline'], baseOverrides['headline_sv']) ?? title,
    whyWorks,
    whyFits,
    originalUrl: firstString(row['tiktok_url'], backendData['source_url'], backendData['url']),
  };
}

function extractFeedplanFallback(plan: unknown): DemoPreviewConcept[] {
  const record = asRecord(plan);
  const rawItems = Array.isArray(plan)
    ? plan
    : Array.isArray(record['items'])
      ? record['items']
      : [];

  return rawItems
    .map((item, index) => {
      const row = asRecord(item);
      const feedOrder = readNumber(row['feed_order']) ?? readNumber(row['feedOrder']) ?? index + 1;
      const sourceRaw = readString(row['source']);
      return {
        id: readString(row['id']) ?? `fallback-${index}`,
        feedOrder,
        title: firstString(row['title'], row['description'], row['headline']) ?? 'Koncept',
        source:
          sourceRaw === 'tiktok' || sourceRaw === 'imported_history'
            ? sourceRaw
            : 'letrend',
        tag: readString(row['tag']),
        thumbnailUrl: firstString(row['thumbnail_url'], row['thumbnailUrl']),
        publishedAt: firstString(row['published_at'], row['publishedAt']),
        views: readNumber(row['views']),
        headline: firstString(row['headline'], row['title']),
        whyWorks: firstString(row['why_works'], row['whyWorks']),
        whyFits: firstString(row['why_fits'], row['whyFits']),
        originalUrl: firstString(row['original_url'], row['originalUrl']),
      } satisfies DemoPreviewConcept;
    })
    .slice(0, 60);
}

async function loadPreviewConcepts(supabase: ReturnType<typeof createSupabaseAdmin>, customerId: string) {
  // Load ALL non-archived rows — both planned (feed_order set) and history imports (feed_order null).
  // History rows get synthetic negative feed_orders below, based on published_at ordering.
  const { data, error } = await (supabase as any)
    .from('customer_concepts')
    .select('*, concepts ( id, backend_data, overrides, is_active, source, version )')
    .eq('customer_profile_id', customerId)
    .neq('status', 'archived')
    .order('feed_order', { ascending: false, nullsFirst: false })
    .limit(80);

  if (error) throw error;

  const rawRows = (data ?? []) as JsonRecord[];

  // Assign synthetic feed_orders to history import rows that lack one.
  // Sort by published_at descending so most recently published → -1, next → -2, etc.
  // This mirrors the feed planner's history semantics (feed_order < 0 = past).
  const historyPending = rawRows
    .filter(
      (row) =>
        row['feed_order'] === null &&
        (readString(row['history_source']) || readString(row['tiktok_url'])),
    )
    .sort((a, b) => {
      const ta = readString(a['published_at']) ? new Date(readString(a['published_at'])!).getTime() : 0;
      const tb = readString(b['published_at']) ? new Date(readString(b['published_at'])!).getTime() : 0;
      return tb - ta;
    });

  historyPending.forEach((row, idx) => {
    row['feed_order'] = -(idx + 1);
  });

  const reconciledByTarget = new Map<string, JsonRecord>();
  for (const row of rawRows) {
    const targetId = readString(row['reconciled_customer_concept_id']);
    if (!readString(row['concept_id']) && targetId) {
      reconciledByTarget.set(targetId, row);
    }
  }

  return rawRows
    .filter((row) => row['feed_order'] !== null)
    .filter((row) => readString(row['concept_id']) || !readString(row['reconciled_customer_concept_id']))
    .map((row) => {
      const importedStats = readString(row['concept_id']) ? reconciledByTarget.get(String(row['id'])) : null;
      const merged = importedStats
        ? {
            ...row,
            tiktok_url: importedStats['tiktok_url'] ?? row['tiktok_url'],
            tiktok_thumbnail_url: importedStats['tiktok_thumbnail_url'] ?? row['tiktok_thumbnail_url'],
            tiktok_views: importedStats['tiktok_views'] ?? row['tiktok_views'],
            tiktok_likes: importedStats['tiktok_likes'] ?? row['tiktok_likes'],
            tiktok_comments: importedStats['tiktok_comments'] ?? row['tiktok_comments'],
            published_at: importedStats['published_at'] ?? row['published_at'],
          }
        : row;
      return buildPreviewConcept(merged);
    })
    .filter((item): item is DemoPreviewConcept => item !== null);
}

async function loadPreviewMetrics(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  customerId: string,
  concepts: DemoPreviewConcept[],
) {
  const [{ data: snapshots }, { data: videos }] = await Promise.all([
    (supabase as any)
      .from('tiktok_stats')
      .select('snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate')
      .eq('customer_profile_id', customerId)
      .order('snapshot_date', { ascending: false })
      .limit(30),
    (supabase as any)
      .from('tiktok_videos')
      .select('uploaded_at, views, likes, comments, shares, share_url, cover_image_url')
      .eq('customer_profile_id', customerId)
      .order('uploaded_at', { ascending: false })
      .limit(60),
  ]);

  const statsRows = (snapshots ?? []) as JsonRecord[];
  const videoRows = (videos ?? []) as JsonRecord[];
  const latest = statsRows[0] ?? null;
  const prev7 = statsRows.find((row) => {
    const date = readString(row['snapshot_date']);
    return date ? new Date(date).getTime() <= Date.now() - 7 * 24 * 3600 * 1000 : false;
  });
  const prev30 = statsRows[statsRows.length - 1] ?? null;

  const conceptViews = concepts
    .map((concept) => concept.views)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  const latestFollowers = readNumber(latest?.['followers']) ?? 0;

  if (statsRows.length === 0 && videoRows.length === 0 && conceptViews.length === 0) {
    return {};
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;

  const endOfToday = new Date();
  endOfToday.setUTCHours(0, 0, 0, 0);
  const chartLabels: string[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(endOfToday);
    d.setUTCDate(endOfToday.getUTCDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const buckets = new Map(chartLabels.map((l) => [l, 0]));

  let totalViews30d = 0;
  let totalLikes30d = 0;
  const videos30d: JsonRecord[] = [];
  for (const row of videoRows) {
    const uploadedAt = readString(row['uploaded_at']);
    if (!uploadedAt) continue;
    const t = new Date(uploadedAt).getTime();
    if (t < thirtyDaysAgo) continue;
    const views = readNumber(row['views']) ?? 0;
    const likes = readNumber(row['likes']) ?? 0;
    totalViews30d += views;
    totalLikes30d += likes;
    videos30d.push(row);
    const key = new Date(uploadedAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + views);
  }

  const videoCount30d = videos30d.length;
  const avgViews30d = videoCount30d > 0 ? Math.round(totalViews30d / videoCount30d) : null;
  const likeRate30d = totalViews30d > 0 ? Math.round((totalLikes30d / totalViews30d) * 1000) / 10 : 0;

  const hitThreshold = avgViews30d != null ? avgViews30d * 10 : null;
  const viralThreshold = avgViews30d != null ? avgViews30d * 20 : null;
  let genombrott_viral = 0;
  let genombrott_hit = 0;
  for (const row of videos30d) {
    const views = readNumber(row['views']) ?? 0;
    if (viralThreshold != null && views >= viralThreshold) genombrott_viral++;
    else if (hitThreshold != null && views >= hitThreshold) genombrott_hit++;
  }

  const chartValues = chartLabels.map((l) => buckets.get(l) ?? 0);

  const videoViews = videoRows
    .map((row) => readNumber(row['views']))
    .filter((value): value is number => value !== null && value > 0);
  const viewsForAverage = videoViews.length > 0 ? videoViews : conceptViews;
  const avgViewsAll = viewsForAverage.length > 0
    ? Math.round(viewsForAverage.reduce((sum, value) => sum + value, 0) / viewsForAverage.length)
    : null;

  return {
    source: 'live_studio',
    followers: latestFollowers,
    current_followers: latestFollowers,
    follower_delta_7d: latestFollowers - (readNumber(prev7?.['followers']) ?? latestFollowers),
    follower_delta_30d: latestFollowers - (readNumber(prev30?.['followers']) ?? latestFollowers),
    avg_engagement: readNumber(latest?.['engagement_rate']),
    engagement_rate: readNumber(latest?.['engagement_rate']),
    avg_views: avgViews30d ?? avgViewsAll,
    avg_views_30d: avgViews30d,
    averageViews: avgViews30d ?? avgViewsAll,
    total_views_30d: totalViews30d,
    video_count_30d: videoCount30d,
    like_rate_30d: likeRate30d,
    like_rate: likeRate30d,
    genombrott_viral,
    genombrott_hit,
    genombrott_klipp: videoCount30d,
    chart_labels: chartLabels,
    chart_values: chartValues,
    recent_video_count: videoRows.length,
    latest_video_views: readNumber(videoRows[0]?.['views']),
    stats_updated_at: readString(latest?.['snapshot_date']),
  };
}

router.get('/demos/:token', async (req, res) => {
  try {
    const token = typeof req.params['token'] === 'string' ? req.params['token'].trim() : '';
    if (!token) {
      res.status(404).json({ error: 'Demo hittades inte' });
      return;
    }

    const supabase = createSupabaseAdmin();
    const { data: demoRows, error: demoError } = await (supabase as any)
      .from('demos')
      .select('*')
      .eq('share_token', token)
      .limit(1);

    if (demoError) {
      res.status(500).json({ error: demoError.message });
      return;
    }
    const demo = firstRecord(demoRows);
    if (!demo || demo.status === 'expired') {
      res.status(404).json({ error: 'Demo hittades inte' });
      return;
    }

    const demoRow = demo as JsonRecord;
    const customerId = readString(demoRow['converted_customer_id']);

    let customer: JsonRecord | null = null;
    let gamePlanRecord: JsonRecord | null = null;
    let concepts: DemoPreviewConcept[] = [];
    let livePreviewMetrics: JsonRecord = {};

    if (customerId) {
      const [customerResult, gamePlanResult] = await Promise.all([
        (supabase as any)
          .from('customer_profiles')
          .select('*')
          .eq('id', customerId)
          .limit(1),
        (supabase as any)
          .from('customer_game_plans')
          .select('html, plain_text, updated_at')
          .eq('customer_id', customerId)
          .limit(1),
      ]);
      if (customerResult.error) {
        logger.warn({ err: customerResult.error, customerId }, 'public demo customer fetch failed');
      }
      if (gamePlanResult.error) {
        logger.warn({ err: gamePlanResult.error, customerId }, 'public demo game plan fetch failed');
      }
      customer = firstRecord(customerResult.data);
      gamePlanRecord = firstRecord(gamePlanResult.data);
      try {
        concepts = await loadPreviewConcepts(supabase, customerId);
      } catch (err) {
        logger.warn({ err, customerId }, 'public demo concepts fetch failed');
        concepts = [];
      }
    }

    if (concepts.length === 0) {
      concepts = extractFeedplanFallback(demoRow['preliminary_feedplan']);
    }

    if (customerId) {
      try {
        livePreviewMetrics = await loadPreviewMetrics(supabase, customerId, concepts);
      } catch (err) {
        logger.warn({ err, customerId }, 'public demo metrics fetch failed');
        livePreviewMetrics = {};
      }
    }

    const ownerAdminId = readString(demoRow['owner_admin_id']);
    let owner: JsonRecord | null = null;
    if (ownerAdminId) {
      const { data: ownerRows } = await (supabase as any)
        .from('team_members')
        .select('id, profile_id, name, avatar_url, color, city, region')
        .eq('id', ownerAdminId)
        .limit(1);
      owner = firstRecord(ownerRows);
    }

    if (!owner && customer) {
      const ownerProfileId = readString(customer['account_manager_profile_id']);
      if (ownerProfileId) {
        const { data: ownerRows } = await (supabase as any)
          .from('team_members')
          .select('id, profile_id, name, avatar_url, color, city, region')
          .eq('profile_id', ownerProfileId)
          .limit(1);
        owner = firstRecord(ownerRows);
      }
    }

    const demoGamePlan = readString(demoRow['game_plan']);
    const demoGamePlanHtml = readString(demoRow['game_plan_html']);
    const gamePlanPlain = demoGamePlan ?? readString(gamePlanRecord?.['plain_text']) ?? readLegacyGamePlanText(customer?.['game_plan']);
    const gamePlanHtml = demoGamePlanHtml ?? (demoGamePlan
      ? plainTextToHtml(demoGamePlan)
      : readString(gamePlanRecord?.['html']) ?? plainTextToHtml(gamePlanPlain));
    const previewMetrics = {
      ...asRecord(demoRow['preview_metrics']),
      ...livePreviewMetrics,
    };

    if (demoRow['status'] === 'sent' || demoRow['status'] === 'draft') {
      void (supabase as any)
        .from('demos')
        .update({
          status: 'opened',
          status_changed_at: new Date().toISOString(),
          opened_at: new Date().toISOString(),
          preview_metrics: previewMetrics,
        })
        .eq('id', demoRow['id']);
    } else if (Object.keys(livePreviewMetrics).length > 0) {
      void (supabase as any)
        .from('demos')
        .update({ preview_metrics: previewMetrics })
        .eq('id', demoRow['id']);
    }

    res.json({
      demo: {
        id: demoRow['id'],
        companyName: readString(customer?.['business_name']) ?? readString(demoRow['company_name']) ?? '',
        contactName: readString(demoRow['contact_name']) ?? readString(customer?.['customer_contact_name']),
        contactEmail: readString(demoRow['contact_email']) ?? readString(customer?.['contact_email']),
        tiktokHandle: readString(customer?.['tiktok_handle']) ?? readString(demoRow['tiktok_handle']),
        tiktokProfilePicUrl:
          readString(customer?.['tiktok_profile_pic_url']) ?? readString(demoRow['tiktok_profile_pic_url']),
        proposedConceptsPerWeek:
          readNumber(demoRow['proposed_concepts_per_week']) ??
          readNumber(customer?.['expected_concepts_per_week']) ??
          readNumber(customer?.['concepts_per_week']) ??
          2,
        proposedPriceOre: readNumber(demoRow['proposed_price_ore']),
        status: demoRow['status'],
        shareToken: demoRow['share_token'],
        customerId,
        logoUrl: readString(customer?.['logo_url']),
        previewNotes: readString(demoRow['preview_notes']),
        previewSettings: asRecord(demoRow['preview_settings']),
        previewMetrics,
        gamePlanText: gamePlanPlain,
        gamePlanHtml,
        contentManager: owner
          ? {
              id: readString(owner['id']),
              profileId: readString(owner['profile_id']),
              name: readString(owner['name']) ?? 'LeTrend',
              avatarUrl: readString(owner['avatar_url']),
              color: readString(owner['color']),
              city: readString(owner['city']) ?? readString(owner['region']),
            }
          : {
              id: null,
              profileId: null,
              name: readString(customer?.['account_manager']) ?? 'LeTrend',
              avatarUrl: readString(customer?.['cm_avatar_url']),
              color: readString(customer?.['cm_initial_color']),
              city: null,
            },
      },
      concepts,
    });
  } catch (err) {
    logger.error(err, 'public demo preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
