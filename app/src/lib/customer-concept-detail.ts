import {
  getCustomerConceptAssignmentLabel,
  getCustomerConceptPlacementBucket,
  getCustomerConceptPlacementLabel,
  getCustomerConceptResultLabel,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { translateClipToConcept, type BackendClip, type ClipOverride } from '@/lib/translator';
import type { CustomerConceptDetailResponse } from '@/types/customer-concept';

type FeedConceptRecord = {
  backend_data?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
} | null;

type FeedConceptRelation = FeedConceptRecord | FeedConceptRecord[];

export type RawCustomerConceptDetailRow = {
  id: string;
  concept_id: string;
  custom_headline: string | null;
  custom_description: string | null;
  custom_why_it_works: string | null;
  custom_instructions: string | null;
  custom_script: string | null;
  custom_production_notes: string[] | null;
  content_overrides: Record<string, unknown> | null;
  why_it_fits: string | null;
  filming_instructions: string | null;
  match_percentage: number | null;
  status: string | null;
  tags: string[] | null;
  cm_note: string | null;
  notes: string | null;
  tiktok_url: string | null;
  feed_order: number | null;
  added_at: string | null;
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  concepts: FeedConceptRelation;
};

export function buildCustomerConceptDetailResponse(
  row: RawCustomerConceptDetailRow
): CustomerConceptDetailResponse {
  const concept = getConceptRecord(row.concepts);
  const rawBackendData = (concept?.backend_data ?? {}) as Record<string, unknown>;
  const backendData: BackendClip = {
    ...(rawBackendData as unknown as BackendClip),
    id: readString(rawBackendData.id) ?? row.concept_id,
    url: readString(rawBackendData.url) ?? '',
  };
  const baseOverrides = (concept?.overrides ?? {}) as ClipOverride;
  const translated = translateClipToConcept(backendData, baseOverrides);
  const rawContentOverrides = (row.content_overrides ?? {}) as Record<string, unknown>;
  const contentOverrides = resolveCustomerConceptContentOverrides(row);

  const productionChecklist = sanitizeStringArray(
    row.custom_production_notes ??
      readStringArray(rawContentOverrides.production_checklist) ??
      readStringArray(rawContentOverrides.productionNotes_sv) ??
      translated.productionNotes_sv ??
      null
  );

  const whyItFits =
    sanitizeText(
      contentOverrides.why_it_fits ??
        readJoinedStringArray(rawContentOverrides.whyItFits_sv) ??
        readJoinedStringArray(translated.whyItFits_sv) ??
        translated.whyItWorks_sv ??
        translated.whyItFits.join(' ')
    ) ?? null;

  const filmingGuidance =
    sanitizeText(contentOverrides.filming_instructions ?? null) ??
    (productionChecklist.length > 0 ? productionChecklist[0] : null);
  const assignmentStatus = normalizeCustomerConceptAssignmentStatus(row.status);

  return {
    assignment: {
      id: row.id,
      source_concept_id: row.concept_id,
      concept_id: row.concept_id,
      status: assignmentStatus,
      lifecycle_label: assignmentStatus ? getCustomerConceptAssignmentLabel(assignmentStatus) : null,
      placement_bucket: getCustomerConceptPlacementBucket(row.feed_order),
      feed_order: row.feed_order,
      placement_label: getCustomerConceptPlacementLabel(row.feed_order),
      match_percentage: typeof row.match_percentage === 'number' ? row.match_percentage : null,
      cm_note: sanitizeText(row.cm_note ?? row.notes),
      added_at: row.added_at,
    },
    metadata: {
      title:
        sanitizeText(
          contentOverrides.headline ??
            translated.headline_sv ??
            translated.headline
        ) ?? 'Koncept',
      summary:
        sanitizeText(
          contentOverrides.summary ??
            translated.description_sv
        ) ?? null,
      script:
        sanitizeText(
          contentOverrides.script ??
            translated.script_sv
        ) ?? null,
      why_it_fits: whyItFits,
      filming_guidance: filmingGuidance,
      production_checklist: productionChecklist,
      tags: sanitizeTags(row.tags ?? readStringArray(contentOverrides.tags) ?? null),
    },
    media: {
      source_reference_url: sanitizeText(translated.sourceUrl ?? readString(backendData.url)),
      reference_video_gcs_uri: sanitizeText(translated.gcsUri ?? readString(backendData.gcs_uri)),
      published_clip_url: sanitizeText(row.tiktok_url),
      result_label: getCustomerConceptResultLabel({
        rawStatus: row.status,
        producedAt: row.produced_at,
        publishedAt: row.published_at,
        publishedClipUrl: row.tiktok_url,
      }),
    },
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
