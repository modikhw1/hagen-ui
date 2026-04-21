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

export const STUDIO_CUSTOMER_CONCEPT_SELECT = `
  id,
  customer_profile_id,
  customer_id,
  concept_id,
  status,
  content_overrides,
  cm_id,
  cm_note,
  match_percentage,
  feed_order,
  tags,
  collection_id,
  updated_at,
  added_at,
  sent_at,
  produced_at,
  planned_publish_at,
  content_loaded_at,
  content_loaded_seen_at,
  published_at,
  reconciled_customer_concept_id,
  reconciled_by_cm_id,
  reconciled_at,
  tiktok_url,
  tiktok_thumbnail_url,
  tiktok_views,
  tiktok_likes,
  tiktok_comments,
  tiktok_watch_time_seconds,
  tiktok_last_synced_at,
  partner_name,
  profile_name,
  profile_image_url,
  visual_variant
`;

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

export function isConceptPlaced(concept: Pick<CustomerConcept, 'placement'>): boolean {
  return concept.placement.feed_order !== null;
}

export function isConceptShared(concept: Pick<CustomerConcept, 'markers'>): boolean {
  return Boolean(concept.markers.shared_at);
}

export function isConceptActionable(concept: CustomerConcept): boolean {
  if (concept.assignment.status === 'archived' || concept.assignment.status === 'produced') {
    return false;
  }

  if (!concept.content.why_it_fits) return true;
  if (!concept.markers.assignment_note) return true;
  if (concept.assignment.status === 'sent' && concept.placement.feed_order === null) return true;

  return concept.assignment.status === 'draft';
}

export function getConceptPriority(concept: CustomerConcept): number {
  const updatedAt = concept.updated_at ? new Date(concept.updated_at).getTime() : 0;
  const statusWeight = concept.assignment.status === 'sent'
    ? 300
    : concept.assignment.status === 'draft'
      ? 200
      : concept.assignment.status === 'produced'
        ? 100
        : 0;
  const placementWeight = concept.placement.feed_order === 0
    ? 80
    : typeof concept.placement.feed_order === 'number'
      ? 40
      : 0;
  const actionableWeight = isConceptActionable(concept) ? 25 : 0;

  return statusWeight + placementWeight + actionableWeight + updatedAt / 1_000_000_000_000;
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
  const updatedAt = readString(row.updated_at);
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
  const reconciledCustomerConceptId = readString(row.reconciled_customer_concept_id);
  const reconciledByCmId = readString(row.reconciled_by_cm_id);
  const reconciledAt = readString(row.reconciled_at);
  const partnerName = readString(row.partner_name);
  const profileName = readString(row.profile_name);
  const profileImageUrl = readString(row.profile_image_url);
  const visualVariant = readString(row.visual_variant);
  // Only present on enriched LeTrend historik cards — the ID of the imported clip
  // that supplies their TikTok stats. Used for undo-reconciliation from the LeTrend side.
  const reconciledImportedClipId = readString(row.reconciled_imported_clip_id);

  const normalizedConcept = {
    ...row,
    id,
    customer_id: customerId,
    concept_id: sourceConceptId,
    cm_id: cmId,
    row_kind: rowKind,
    updated_at: updatedAt,
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
    reconciled_customer_concept_id: reconciledCustomerConceptId,
    reconciled_by_cm_id: reconciledByCmId,
    reconciled_at: reconciledAt,
    content_overrides: normalizedContentOverrides,
    partner_name: partnerName,
    profile_name: profileName,
    profile_image_url: profileImageUrl,
    visual_variant: visualVariant,
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
    reconciliation: {
      linked_customer_concept_id: reconciledCustomerConceptId,
      linked_by_cm_id: reconciledByCmId,
      linked_at: reconciledAt,
      is_reconciled: Boolean(reconciledCustomerConceptId),
      reconciled_clip_id: reconciledImportedClipId,
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
