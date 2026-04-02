import {
  deriveCustomerFeedStatus,
  getCustomerConceptPlacementBucket,
  getCustomerFeedStatusLabel,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import type { CustomerFeedBucket, CustomerFeedResponse, CustomerFeedSlot } from '@/types/customer-feed';

type FeedConceptRecord = {
  id?: string | null;
  backend_data?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
  is_active?: boolean | null;
} | null;

type FeedConceptRelation = FeedConceptRecord | FeedConceptRecord[];

type RawCustomerFeedRow = {
  id: string;
  concept_id: string | null;
  content_overrides: Record<string, unknown> | null;
  custom_headline: string | null;
  custom_description: string | null;
  custom_script: string | null;
  custom_why_it_works: string | null;
  custom_production_notes: string[] | null;
  match_percentage: number | null;
  status: string | null;
  feed_order: number | null;
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  notes: string | null;
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
  const current = slots.find((slot) => slot.bucket === 'current') ?? null;
  const upcoming = slots
    .filter((slot) => slot.bucket === 'upcoming')
    .sort((a, b) => a.feedOrder - b.feedOrder);
  const history = slots
    .filter((slot) => slot.bucket === 'history')
    .sort((a, b) => b.feedOrder - a.feedOrder);

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
  const baseOverrides = (concept?.overrides ?? {}) as Record<string, unknown>;
  const backendData = (concept?.backend_data ?? {}) as Record<string, unknown>;
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
    readString(row.custom_why_it_works) ??
    readString(baseOverrides.whyItWorks_sv) ??
    readString(backendData.whyItWorks_sv);

  const script =
    contentOverrides.script ??
    readString(baseOverrides.script_sv) ??
    readString(backendData.script_sv);

  const productionNotes = sanitizeProductionNotes(
    row.custom_production_notes ??
      readStringArray(row.content_overrides?.production_checklist) ??
      readStringArray(row.content_overrides?.productionNotes_sv) ??
      readStringArray(baseOverrides.productionNotes_sv) ??
      readStringArray(backendData.productionNotes_sv)
  );

  const note = sanitizeText(row.cm_note ?? row.notes);
  const title = sanitizeText(rawTitle) ?? FALLBACK_TITLES[bucket];
  const summary = sanitizeText(rawSummary) ?? FALLBACK_SUMMARIES[bucket];
  const hasScript = Boolean(sanitizeText(script));
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
    customerConceptId: row.id,
    sourceConceptId: row.concept_id,
    conceptId: row.concept_id,
    assignmentStatus: normalizeCustomerConceptAssignmentStatus(row.status),
    feedOrder: row.feed_order,
    bucket,
    title,
    summary,
    note,
    detailHint: buildDetailHint({ bucket, hasScript, productionNotesCount: productionNotes.length, note }),
    status,
    statusLabel: getCustomerFeedStatusLabel(status),
    matchPercentage: typeof row.match_percentage === 'number' ? row.match_percentage : null,
    hasScript,
    scriptPreview: toScriptPreview(script),
    productionNotes,
    sourceUrl: readString(backendData.url),
    tiktokUrl: sanitizeText(row.tiktok_url),
    sharedAt: row.sent_at,
    producedAt: row.produced_at,
    publishedAt: row.published_at,
  };
}

function buildDetailHint(input: {
  bucket: CustomerFeedBucket;
  hasScript: boolean;
  productionNotesCount: number;
  note: string | null;
}): string | null {
  if (input.hasScript && input.productionNotesCount > 0) {
    return 'Manus och inspelningsstöd finns i konceptdetaljen.';
  }

  if (input.hasScript) {
    return 'Manus finns klart i konceptdetaljen.';
  }

  if (input.note) {
    return 'Det finns en notering från din content manager.';
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
