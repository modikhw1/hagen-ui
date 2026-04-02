import { normalizeCustomerConceptAssignmentStatus } from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function normalizeStudioCustomerConcept(row: Record<string, unknown>) {
  const status = normalizeCustomerConceptAssignmentStatus(
    typeof row.status === 'string' ? row.status : null
  ) ?? 'draft';
  const contentOverrides = resolveCustomerConceptContentOverrides({
    content_overrides: (row.content_overrides as Record<string, unknown> | null) ?? null,
    custom_headline: (row.custom_headline as string | null) ?? null,
    custom_description: (row.custom_description as string | null) ?? null,
    custom_script: (row.custom_script as string | null) ?? null,
    custom_why_it_works: (row.custom_why_it_works as string | null) ?? null,
    custom_instructions: (row.custom_instructions as string | null) ?? null,
    custom_target_audience: (row.custom_target_audience as string | null) ?? null,
    why_it_fits: (row.why_it_fits as string | null) ?? null,
    filming_instructions: (row.filming_instructions as string | null) ?? null,
  });

  return {
    ...row,
    id: row.id,
    customer_id: row.customer_id || row.customer_profile_id || null,
    concept_id: row.concept_id,
    cm_id: row.cm_id ?? null,
    status,
    custom_script: contentOverrides.script ?? null,
    why_it_fits: contentOverrides.why_it_fits ?? null,
    filming_instructions: contentOverrides.filming_instructions ?? null,
    tiktok_url: row.tiktok_url ?? null,
    tiktok_thumbnail_url: row.tiktok_thumbnail_url ?? null,
    tiktok_views: row.tiktok_views ?? null,
    tiktok_likes: row.tiktok_likes ?? null,
    tiktok_comments: row.tiktok_comments ?? null,
    tiktok_watch_time_seconds: row.tiktok_watch_time_seconds ?? null,
    tiktok_last_synced_at: row.tiktok_last_synced_at ?? null,
    content_overrides: Object.keys(contentOverrides).length > 0 ? contentOverrides : null,
    feed_order: row.feed_order ?? null,
    feed_slot: row.feed_slot ?? null,
    tags: asStringArray(row.tags),
    collection_id: row.collection_id ?? null,
    cm_note: row.cm_note ?? row.notes ?? null,
    added_at: row.added_at ?? null,
    sent_at: row.sent_at ?? null,
    produced_at: row.produced_at ?? null,
    planned_publish_at: row.planned_publish_at ?? null,
    content_loaded_at: row.content_loaded_at ?? null,
    content_loaded_seen_at: row.content_loaded_seen_at ?? null,
    published_at: row.published_at ?? null,
  };
}
