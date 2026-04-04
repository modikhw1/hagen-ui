import {
  getCustomerConceptPlacementBucket,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptAssignmentNote } from '@/lib/customer-concept-assignment';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import type {
  AssignedCustomerConcept,
  CustomerConcept,
  CustomerConceptRowKind,
} from '@/types/studio-v2';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getStudioCustomerConceptRowKind(source: {
  concept_id?: unknown;
}): CustomerConceptRowKind {
  return readString(source.concept_id) ? 'assignment' : 'imported_history';
}

export function getStudioCustomerConceptSourceConceptId(
  concept: Pick<CustomerConcept, 'concept_id' | 'assignment'>
): string | null {
  return concept.assignment.source_concept_id ?? concept.concept_id ?? null;
}

export function getStudioCustomerConceptDisplayTitle(
  concept: Pick<CustomerConcept, 'id' | 'row_kind' | 'concept_id' | 'assignment'>,
  preferredTitle?: string | null
): string {
  if (typeof preferredTitle === 'string' && preferredTitle.trim()) {
    return preferredTitle;
  }

  return (
    getStudioCustomerConceptSourceConceptId(concept) ??
    (concept.row_kind === 'imported_history' ? 'Importerat historikklipp' : concept.id)
  );
}

export function isStudioAssignedCustomerConcept(
  concept: CustomerConcept
): concept is AssignedCustomerConcept {
  return concept.row_kind === 'assignment' && concept.assignment.has_source_concept;
}

export function normalizeStudioCustomerConcept(row: Record<string, unknown>): CustomerConcept {
  const status = normalizeCustomerConceptAssignmentStatus(
    typeof row.status === 'string' ? row.status : null
  ) ?? 'draft';
  const id = readString(row.id) ?? '';
  const customerId = readString(row.customer_id) ?? readString(row.customer_profile_id) ?? '';
  const sourceConceptId = readString(row.concept_id);
  const rowKind = getStudioCustomerConceptRowKind({ concept_id: sourceConceptId });
  const contentOverrides = resolveCustomerConceptContentOverrides({
    content_overrides: readNullableRecord(row.content_overrides),
  });
  const note = resolveCustomerConceptAssignmentNote({
    cm_note: readString(row.cm_note),
  });
  const feedOrder = readNumber(row.feed_order);
  const placementBucket = getCustomerConceptPlacementBucket(feedOrder);
  const cmId = readString(row.cm_id);
  const normalizedContentOverrides = Object.keys(contentOverrides).length > 0 ? contentOverrides : null;
  const tags = asStringArray(row.tags);
  const collectionId = readString(row.collection_id);
  const addedAt = readString(row.added_at) ?? '';
  const sentAt = readString(row.sent_at);
  const producedAt = readString(row.produced_at);
  const plannedPublishAt = readString(row.planned_publish_at);
  const contentLoadedAt = readString(row.content_loaded_at);
  const contentLoadedSeenAt = readString(row.content_loaded_seen_at);
  const publishedAt = readString(row.published_at);
  const tiktokUrl = readString(row.tiktok_url);
  const tiktokThumbnailUrl = readString(row.tiktok_thumbnail_url);
  const tiktokViews = readNumber(row.tiktok_views);
  const tiktokLikes = readNumber(row.tiktok_likes);
  const tiktokComments = readNumber(row.tiktok_comments);
  const tiktokWatchTimeSeconds = readNumber(row.tiktok_watch_time_seconds);
  const tiktokLastSyncedAt = readString(row.tiktok_last_synced_at);

  const normalizedConcept = {
    ...row,
    id,
    customer_id: customerId,
    concept_id: sourceConceptId,
    cm_id: cmId,
    row_kind: rowKind,
    status,
    custom_script: contentOverrides.script ?? null,
    why_it_fits: contentOverrides.why_it_fits ?? null,
    filming_instructions: contentOverrides.filming_instructions ?? null,
    tiktok_url: tiktokUrl,
    tiktok_thumbnail_url: tiktokThumbnailUrl,
    tiktok_views: tiktokViews,
    tiktok_likes: tiktokLikes,
    tiktok_comments: tiktokComments,
    tiktok_watch_time_seconds: tiktokWatchTimeSeconds,
    tiktok_last_synced_at: tiktokLastSyncedAt,
    content_overrides: normalizedContentOverrides,
    feed_order: feedOrder,
    tags,
    collection_id: collectionId,
    cm_note: note,
    added_at: addedAt,
    sent_at: sentAt,
    produced_at: producedAt,
    planned_publish_at: plannedPublishAt,
    content_loaded_at: contentLoadedAt,
    content_loaded_seen_at: contentLoadedSeenAt,
    published_at: publishedAt,
    assignment: {
      customer_concept_id: id,
      customer_id: customerId,
      cm_id: cmId,
      source_concept_id: sourceConceptId,
      has_source_concept: Boolean(sourceConceptId),
      status,
      added_at: addedAt,
    },
    content: {
      custom_script: contentOverrides.script ?? null,
      why_it_fits: contentOverrides.why_it_fits ?? null,
      filming_instructions: contentOverrides.filming_instructions ?? null,
      content_overrides: normalizedContentOverrides,
    },
    placement: {
      feed_order: feedOrder,
      bucket: placementBucket,
    },
    result: {
      sent_at: sentAt,
      produced_at: producedAt,
      planned_publish_at: plannedPublishAt,
      content_loaded_at: contentLoadedAt,
      content_loaded_seen_at: contentLoadedSeenAt,
      published_at: publishedAt,
      tiktok_url: tiktokUrl,
      tiktok_thumbnail_url: tiktokThumbnailUrl,
      tiktok_views: tiktokViews,
      tiktok_likes: tiktokLikes,
      tiktok_comments: tiktokComments,
      tiktok_watch_time_seconds: tiktokWatchTimeSeconds,
      tiktok_last_synced_at: tiktokLastSyncedAt,
    },
    markers: {
      tags,
      collection_id: collectionId,
      assignment_note: note,
      shared_at: sentAt,
    },
  };

  if (rowKind === 'assignment' && sourceConceptId) {
    return {
      ...normalizedConcept,
      row_kind: 'assignment',
      concept_id: sourceConceptId,
      assignment: {
        ...normalizedConcept.assignment,
        source_concept_id: sourceConceptId,
        has_source_concept: true,
      },
    };
  }

  return {
    ...normalizedConcept,
    row_kind: 'imported_history',
    concept_id: null,
    assignment: {
      ...normalizedConcept.assignment,
      source_concept_id: null,
      has_source_concept: false,
    },
  };
}
