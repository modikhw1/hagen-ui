import {
  getCustomerConceptAssignmentLabel,
  getCustomerConceptPlacementBucket,
  getCustomerConceptPlacementLabel,
  getCustomerConceptResultLabel,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptAssignmentNote } from '@/lib/customer-concept-assignment';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { display } from '@/lib/display';
import { translateClipToConcept, type BackendClip, type ClipOverride, type TranslatedConcept } from '@/lib/translator';
import type {
  CustomerConceptDetailResponse,
  CustomerConceptListItem,
  CustomerConceptMetadata,
} from '@/types/customer-concept';

type FeedConceptRecord = {
  backend_data?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
} | null;

type FeedConceptRelation = FeedConceptRecord | FeedConceptRecord[];

export type RawCustomerConceptDetailRow = {
  id: string;
  /** Null for imported-history rows (concept_id IS NULL in storage). */
  concept_id: string | null;
  content_overrides: Record<string, unknown> | null;
  match_percentage: number | null;
  status: string | null;
  tags: string[] | null;
  cm_note: string | null;
  tiktok_url: string | null;
  feed_order: number | null;
  added_at: string | null;
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  concepts: FeedConceptRelation;
};

/**
 * The raw row shape expected by buildCustomerConceptListItem.
 * Matches what GET /api/customer/concepts selects from customer_concepts.
 */
export type RawCustomerConceptListRow = {
  id: string;
  /** Null for imported-history rows (concept_id IS NULL in storage). */
  concept_id: string | null;
  content_overrides: Record<string, unknown> | null;
  match_percentage: number | null;
  status: string | null;
  tags: string[] | null;
  cm_note: string | null;
  feed_order: number | null;
  added_at: string | null;
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  concepts: FeedConceptRelation;
};

export function buildCustomerConceptDetailResponse(
  row: RawCustomerConceptDetailRow
): CustomerConceptDetailResponse {
  const concept = getConceptRecord(row.concepts);
  const rawBackendData = (concept?.backend_data ?? {}) as Record<string, unknown>;
  const backendData: BackendClip = {
    ...(rawBackendData as unknown as BackendClip),
    id: readString(rawBackendData.id) ?? row.concept_id ?? '',
    url: readString(rawBackendData.url) ?? '',
  };
  const baseOverrides = (concept?.overrides ?? {}) as ClipOverride;
  const translated = translateClipToConcept(backendData, baseOverrides);
  const rawContentOverrides = (row.content_overrides ?? {}) as Record<string, unknown>;
  const contentOverrides = resolveCustomerConceptContentOverrides(row);

  const assignmentStatus = normalizeCustomerConceptAssignmentStatus(row.status);
  const assignmentNote = sanitizeText(resolveCustomerConceptAssignmentNote(row));

  const placementBucket = getCustomerConceptPlacementBucket(row.feed_order);
  const placementLabel = getCustomerConceptPlacementLabel(row.feed_order);
  const resultLabel = getCustomerConceptResultLabel({
    rawStatus: row.status,
    producedAt: row.produced_at,
    publishedAt: row.published_at,
    publishedClipUrl: row.tiktok_url,
  });

  return {
    // Assignment identity and lifecycle status
    assignment: {
      id: row.id,
      source_concept_id: row.concept_id,
      concept_id: row.concept_id,
      status: assignmentStatus,
      lifecycle_label: assignmentStatus ? getCustomerConceptAssignmentLabel(assignmentStatus) : null,
      match_percentage: typeof row.match_percentage === 'number' ? row.match_percentage : null,
      cm_note: assignmentNote,
      added_at: row.added_at,
    },
    // Placement boundary: where the assignment sits in the customer's plan
    placement: {
      feed_order: row.feed_order,
      bucket: placementBucket,
      placement_label: placementLabel,
    },
    // Result boundary: production and publication outcome
    result: {
      sent_at: row.sent_at,
      produced_at: row.produced_at,
      published_at: row.published_at,
      tiktok_url: row.tiktok_url,
      result_label: resultLabel,
    },
    // Content boundary: adapted text, script, and production guidance
    metadata: resolveCustomerConceptMetadataSection({
      contentOverrides,
      rawContentOverrides,
      translated,
      tags: row.tags,
    }),
    // Source media references
    media: {
      source_reference_url: sanitizeText(translated.sourceUrl ?? readString(backendData.url)),
      reference_video_gcs_uri: sanitizeText(translated.gcsUri ?? readString(backendData.gcs_uri)),
    },
  };
}

/**
 * Builds a single customer concept list item for GET /api/customer/concepts.
 *
 * Returns explicit boundary-grouped sections only:
 * - assignment: identity and lifecycle status
 * - placement: where the assignment sits in the customer's plan
 * - result: production and publication outcome
 * - metadata: adapted content — same shape as CustomerConceptDetailResponse.metadata
 * - difficulty_label: pre-computed display label
 * - is_new: whether the concept was recently added to the library
 */
export function buildCustomerConceptListItem(
  row: RawCustomerConceptListRow
): CustomerConceptListItem {
  const concept = getConceptRecord(row.concepts);
  const rawBackendData = (concept?.backend_data ?? {}) as Record<string, unknown>;
  const backendData: BackendClip = {
    ...(rawBackendData as unknown as BackendClip),
    id: readString(rawBackendData.id) ?? row.concept_id ?? '',
    url: readString(rawBackendData.url) ?? '',
  };
  const baseOverrides = (concept?.overrides ?? {}) as ClipOverride;
  const contentOverrides = resolveCustomerConceptContentOverrides(row);
  const assignmentStatus = normalizeCustomerConceptAssignmentStatus(row.status);
  const assignmentNote = sanitizeText(resolveCustomerConceptAssignmentNote(row));

  const translated = translateClipToConcept(backendData, baseOverrides);

  const rawContentOverrides = (row.content_overrides ?? {}) as Record<string, unknown>;

  const placementBucket = getCustomerConceptPlacementBucket(row.feed_order);
  const placementLabel = getCustomerConceptPlacementLabel(row.feed_order);
  const resultLabel = getCustomerConceptResultLabel({
    rawStatus: row.status,
    producedAt: row.produced_at,
    publishedAt: row.published_at,
    publishedClipUrl: row.tiktok_url,
  });

  return {
    // Assignment boundary: identity and lifecycle status
    assignment: {
      id: row.id,
      source_concept_id: row.concept_id,
      concept_id: row.concept_id,
      status: assignmentStatus,
      lifecycle_label: assignmentStatus ? getCustomerConceptAssignmentLabel(assignmentStatus) : null,
      match_percentage: typeof row.match_percentage === 'number' ? row.match_percentage : null,
      cm_note: assignmentNote,
      added_at: row.added_at,
    },
    // Placement boundary: where this assignment sits in the customer's plan
    placement: {
      feed_order: row.feed_order,
      bucket: placementBucket,
      placement_label: placementLabel,
    },
    // Result boundary: production and publication outcome
    result: {
      sent_at: row.sent_at,
      produced_at: row.produced_at,
      published_at: row.published_at,
      tiktok_url: row.tiktok_url,
      result_label: resultLabel,
    },
    difficulty_label: display.difficulty(translated.difficulty).label,
    // Content boundary: adapted text, script, and production guidance
    metadata: resolveCustomerConceptMetadataSection({
      contentOverrides,
      rawContentOverrides,
      translated,
      tags: row.tags,
    }),
    is_new: translated.isNew === true,
  };
}

type MetadataSectionInput = {
  contentOverrides: {
    headline?: string;
    summary?: string;
    script?: string;
    why_it_fits?: string;
    filming_instructions?: string;
  };
  rawContentOverrides: Record<string, unknown>;
  translated: TranslatedConcept;
  tags?: string[] | null;
};

function resolveCustomerConceptMetadataSection(input: MetadataSectionInput): CustomerConceptMetadata {
  const productionChecklist = sanitizeStringArray(
    readStringArray(input.rawContentOverrides.production_checklist) ??
      readStringArray(input.rawContentOverrides.productionNotes_sv) ??
      (input.translated.productionNotes_sv as string[] | undefined) ??
      null
  );
  const whyItFits =
    sanitizeText(
      input.contentOverrides.why_it_fits ??
        readJoinedStringArray(input.rawContentOverrides.whyItFits_sv) ??
        readJoinedStringArray(input.translated.whyItFits_sv) ??
        input.translated.whyItWorks_sv ??
        (Array.isArray(input.translated.whyItFits) ? input.translated.whyItFits.join(' ') : null)
    ) ?? null;
  const filmingGuidance =
    sanitizeText(input.contentOverrides.filming_instructions ?? null) ??
    (productionChecklist.length > 0 ? productionChecklist[0] : null);
  return {
    title:
      sanitizeText(
        input.contentOverrides.headline ??
          input.translated.headline_sv ??
          input.translated.headline
      ) ?? 'Koncept',
    summary: sanitizeText(input.contentOverrides.summary ?? input.translated.description_sv) ?? null,
    script: sanitizeText(input.contentOverrides.script ?? input.translated.script_sv) ?? null,
    why_it_fits: whyItFits,
    filming_guidance: filmingGuidance,
    production_checklist: productionChecklist,
    tags: sanitizeTags(input.tags ?? null),
  };
}

function getConceptRecord(value: FeedConceptRelation): FeedConceptRecord {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeStringArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter((item): item is string => Boolean(item));
}

function sanitizeTags(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => sanitizeText(item)?.toLowerCase())
        .filter((item): item is string => Boolean(item))
    )
  );
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

function readJoinedStringArray(value: unknown): string | null {
  const items = readStringArray(value);
  if (!items || items.length === 0) return null;
  return items.join(' ');
}
