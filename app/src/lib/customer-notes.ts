import { normalizeHref } from '@/components/gameplan-editor/utils/link-helpers';
import { sanitizeRichTextHtml } from '@/components/gameplan-editor/utils/sanitize';

export type CustomerNoteType = 'update' | 'reference' | 'feedback' | 'milestone';

export interface CustomerNoteReference {
  kind: string;
  label?: string;
  url?: string;
  platform?: string;
  customer_concept_id?: string;
}

export interface CustomerNoteAttachment {
  kind: string;
  url?: string;
  caption?: string;
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
}

const NOTE_TYPES: CustomerNoteType[] = ['update', 'reference', 'feedback', 'milestone'];

const CUSTOMER_NOTE_TYPE_META: Record<CustomerNoteType, { label: string; bg: string; text: string }> = {
  update: { label: 'Uppdatering', bg: '#EDE9FE', text: '#6D28D9' },
  reference: { label: 'Referens', bg: '#DBEAFE', text: '#1D4ED8' },
  feedback: { label: 'Feedback', bg: '#FEF3C7', text: '#B45309' },
  milestone: { label: 'Milstolpe', bg: '#D1FAE5', text: '#065F46' },
};

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim();
}

function sanitizeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^(javascript|data):/i.test(trimmed)) return undefined;
  return normalizeHref(trimmed);
}

function sanitizeReferences(value: unknown): CustomerNoteReference[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    const kind = sanitizeText(record.kind);
    if (!kind) return [];

    return [{
      kind,
      label: sanitizeText(record.label) || undefined,
      url: sanitizeOptionalUrl(record.url),
      platform: sanitizeText(record.platform) || undefined,
      customer_concept_id: sanitizeText(record.customer_concept_id) || undefined,
    }];
  });
}

function sanitizeAttachments(value: unknown): CustomerNoteAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    const kind = sanitizeText(record.kind);
    if (!kind) return [];

    return [{
      kind,
      url: sanitizeOptionalUrl(record.url),
      caption: sanitizeText(record.caption) || undefined,
      storage_path: sanitizeText(record.storage_path) || undefined,
      file_name: sanitizeText(record.file_name) || undefined,
      mime_type: sanitizeText(record.mime_type) || undefined,
    }];
  });
}

export function normalizeCustomerNotePayload(value: unknown) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const content = sanitizeText(record.content);
  const contentHtml = typeof record.content_html === 'string'
    ? sanitizeRichTextHtml(record.content_html)
    : null;
  const noteType = NOTE_TYPES.includes(record.note_type as CustomerNoteType)
    ? record.note_type as CustomerNoteType
    : 'update';
  const references = sanitizeReferences(record.references);
  const attachments = sanitizeAttachments(record.attachments);
  const primaryCustomerConceptId = sanitizeText(record.primary_customer_concept_id) || null;

  return {
    content,
    content_html: contentHtml && contentHtml.trim() ? contentHtml : null,
    note_type: noteType,
    primary_customer_concept_id: primaryCustomerConceptId,
    references,
    attachments,
    updated_at: new Date().toISOString(),
  };
}

export function getCustomerNoteTypeMeta(type: CustomerNoteType) {
  return CUSTOMER_NOTE_TYPE_META[type] ?? CUSTOMER_NOTE_TYPE_META.update;
}
