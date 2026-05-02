import {
  deriveCustomerFeedStatus,
  getCustomerConceptPlacementBucket,
  getCustomerFeedStatusLabel,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptAssignmentNote } from '@/lib/customer-concept-assignment';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { asJsonObject } from '@/lib/database/json';
import type { Json } from '@/types/database';
import type { CustomerFeedBucket, CustomerFeedResponse, CustomerFeedSlot } from '@/types/customer-feed';

type FeedConceptRecord = {
  id?: string | null;
  backend_data?: Json | null;
  overrides?: Json | null;
  is_active?: boolean | null;
} | null;

type FeedConceptRelation = FeedConceptRecord | FeedConceptRecord[];

type RawCustomerFeedRow = {
  id: string;
  concept_id: string | null;
  content_overrides: Json | null;
  match_percentage: number | null;
  status: string | null;
  feed_order: number | null;
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  cm_note: string | null;
  concepts: FeedConceptRelation;
};

const FALLBACK_TITLES: Record<CustomerFeedBucket, string> = {
  current: 'Aktuellt koncept',
  upcoming: 'Kommande koncept',
  history: 'Tidigare koncept',
};

const FALLBACK_SUMMARIES: Record<CustomerFeedBucket, string> = {
  current: 'Det här är det tydligaste nästa steget i din plan just nu.',
  upcoming: 'Det här ligger i din kommande plan och förbereds tillsammans med din content manager.',
  history: 'Det här konceptet ligger i din historik som tidigare leverans eller referens.',
};

export function buildCustomerFeedResponse(rows: RawCustomerFeedRow[]): CustomerFeedResponse {
  return {
    slots: rows
      .map(buildCustomerFeedSlot)
      .filter((slot): slot is CustomerFeedSlot => slot !== null),
    generatedAt: new Date().toISOString(),
  };
}

export function splitCustomerFeedSlots(slots: CustomerFeedSlot[]) {
  const formalCurrent = slots.find((slot) => slot.placement.bucket === 'current') ?? null;
  const allUpcoming = slots
    .filter((slot) => slot.placement.bucket === 'upcoming')
    .sort((a, b) => a.placement.feedOrder - b.placement.feedOrder);
  const history = slots
    .filter((slot) => slot.placement.bucket === 'history')
    .sort((a, b) => b.placement.feedOrder - a.placement.feedOrder);

  // Display-layer promotion: if feed_order=0 is vacant, show the nearest upcoming
  // concept as JUST NU in the customer list. No data is mutated — the planner grid
  // continues reading feed_order positions directly and is unaffected.
  const current = formalCurrent ?? allUpcoming[0] ?? null;
  const upcoming = formalCurrent ? allUpcoming : allUpcoming.slice(1);

  return { current, upcoming, history };
}

function buildCustomerFeedSlot(row: RawCustomerFeedRow): CustomerFeedSlot | null {
  if (row.feed_order === null) {
    return null;
  }

  const bucket = getCustomerConceptPlacementBucket(row.feed_order);
  if (!bucket) {
    return null;
  }

  const concept = getConceptRecord(row.concepts);
  const baseOverrides = asJsonObject(concept?.overrides);
  const backendData = asJsonObject(concept?.backend_data);
  const rawContentOverrides = asJsonObject(row.content_overrides);
  const contentOverrides = resolveCustomerConceptContentOverrides(row);

  const rawTitle =
    contentOverrides.headline ??
    readString(baseOverrides.headline_sv) ??
    readString(baseOverrides.headline) ??
    readString(backendData.headline_sv) ??
    readString(backendData.headline);

  const rawSummary =
    contentOverrides.summary ??
    readString(baseOverrides.description_sv) ??
    readString(backendData.description_sv) ??
    readString(baseOverrides.whyItWorks_sv) ??
    readString(backendData.whyItWorks_sv);

  const script =
    contentOverrides.script ??
    readString(baseOverrides.script_sv) ??
    readString(backendData.script_sv);

  const productionNotes = sanitizeProductionNotes(
    readStringArray(rawContentOverrides.production_checklist) ??
      readStringArray(rawContentOverrides.productionNotes_sv) ??
      readStringArray(baseOverrides.productionNotes_sv) ??
      readStringArray(backendData.productionNotes_sv)
  );

  const note = sanitizeText(resolveCustomerConceptAssignmentNote(row));
  const title = sanitizeText(rawTitle) ?? FALLBACK_TITLES[bucket];
  const summary = sanitizeText(rawSummary) ?? FALLBACK_SUMMARIES[bucket];
  const hasScript = Boolean(sanitizeText(script));
  const hasWhyItFits = Boolean(
    sanitizeText(readString(contentOverrides.why_it_fits as string | null | undefined))
  );
  const status = deriveCustomerFeedStatus({
    rawStatus: row.status,
    feedOrder: row.feed_order,
    sentAt: row.sent_at,
    producedAt: row.produced_at,
    publishedAt: row.published_at,
    publishedClipUrl: row.tiktok_url,
  });

  return {
    assignmentId: row.id,
    assignmentStatus: normalizeCustomerConceptAssignmentStatus(row.status),
    rowKind: row.concept_id === null ? 'imported_history' : 'assignment',
    title,
    summary,
    note,
    detailHint: buildDetailHint({ bucket, hasScript, productionNotesCount: productionNotes.length, hasWhyItFits }),
    status,
    statusLabel: getCustomerFeedStatusLabel(status),
    matchPercentage: typeof row.match_percentage === 'number' ? row.match_percentage : null,
    hasScript,
    scriptPreview: toScriptPreview(script),
    productionNotes,
    sourceUrl: readString(backendData.url),
    // Boundary-grouped sub-objects
    placement: {
      feedOrder: row.feed_order,
      bucket,
    },
    result: {
      sharedAt: row.sent_at,
      producedAt: row.produced_at,
      publishedAt: row.published_at,
      tiktokUrl: sanitizeText(row.tiktok_url),
      tiktokThumbnailUrl: sanitizeText(row.tiktok_thumbnail_url),
      tiktokViews: typeof row.tiktok_views === 'number' ? row.tiktok_views : null,
      tiktokLikes: typeof row.tiktok_likes === 'number' ? row.tiktok_likes : null,
    },
  };
}

function buildDetailHint(input: {
  bucket: CustomerFeedBucket;
  hasScript: boolean;
  productionNotesCount: number;
  hasWhyItFits: boolean;
}): string | null {
  if (input.hasScript && input.productionNotesCount > 0) {
    return 'Manus och inspelningsstöd finns i konceptdetaljen.';
  }

  if (input.hasScript) {
    return 'Manus finns klart i konceptdetaljen.';
  }

  if (input.hasWhyItFits) {
    return 'Varför det passar er finns beskrivet i konceptdetaljen.';
  }

  if (input.bucket === 'upcoming') {
    return 'Detaljerna fylls på innan det här ligger först i planen.';
  }

  return null;
}

function sanitizeProductionNotes(value: string[] | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter((item): item is string => Boolean(item));
}

function toScriptPreview(value: string | null): string | null {
  const normalized = sanitizeText(value);
  if (!normalized) return null;
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

function getConceptRecord(value: FeedConceptRelation): FeedConceptRecord {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
