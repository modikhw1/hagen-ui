import type { RawGamePlanNote } from '@/components/gameplan-editor/utils/legacy-converter';
import { gamePlanNotesToHtml } from '@/components/gameplan-editor/utils/legacy-converter';
import { sanitizeRichTextHtml, stripHtml } from '@/components/gameplan-editor/utils/sanitize';
import type { CustomerGamePlanSummary } from '@/types/studio-v2';

export interface LegacyGamePlanBlob {
  html?: string;
  notes?: RawGamePlanNote[];
  version?: number;
  updated_at?: string;
}

export interface CustomerGamePlanRecord {
  customer_id: string;
  html: string;
  plain_text: string;
  editor_version: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResolvedGamePlanDocument {
  html: string;
  plainText: string;
  updatedAt: string | null;
  editorVersion: number;
  hasGamePlan: boolean;
  source: 'customer_game_plans' | 'legacy_customer_profiles' | 'empty';
}

export interface GamePlanDocumentResponse {
  game_plan: CustomerGamePlanSummary;
  has_game_plan: boolean;
}

function asLegacyGamePlan(value: unknown): LegacyGamePlanBlob | null {
  if (!value || typeof value !== 'object') return null;
  return value as LegacyGamePlanBlob;
}

export function resolveLegacyGamePlan(legacyValue: unknown): ResolvedGamePlanDocument {
  const legacy = asLegacyGamePlan(legacyValue);
  if (!legacy) {
    return {
      html: '',
      plainText: '',
      updatedAt: null,
      editorVersion: 1,
      hasGamePlan: false,
      source: 'empty',
    };
  }

  let html = '';
  if (typeof legacy.html === 'string' && legacy.html.trim()) {
    html = sanitizeRichTextHtml(legacy.html);
  } else if (Array.isArray(legacy.notes) && legacy.notes.length > 0) {
    html = gamePlanNotesToHtml(legacy.notes);
  }

  const plainText = stripHtml(html);

  return {
    html,
    plainText,
    updatedAt: typeof legacy.updated_at === 'string' ? legacy.updated_at : null,
    editorVersion: typeof legacy.version === 'number' ? legacy.version : 1,
    hasGamePlan: Boolean(plainText),
    source: html ? 'legacy_customer_profiles' : 'empty',
  };
}

export function resolveGamePlanDocument(
  record: Partial<CustomerGamePlanRecord> | null | undefined,
  legacyValue?: unknown
): ResolvedGamePlanDocument {
  if (record && typeof record.html === 'string' && record.html.trim()) {
    const html = sanitizeRichTextHtml(record.html);
    const plainText = typeof record.plain_text === 'string' && record.plain_text.trim()
      ? record.plain_text.trim()
      : stripHtml(html);

    return {
      html,
      plainText,
      updatedAt: typeof record.updated_at === 'string' ? record.updated_at : null,
      editorVersion: typeof record.editor_version === 'number' ? record.editor_version : 1,
      hasGamePlan: Boolean(plainText),
      source: 'customer_game_plans',
    };
  }

  return resolveLegacyGamePlan(legacyValue);
}

export function buildGamePlanSummary(document: ResolvedGamePlanDocument): CustomerGamePlanSummary {
  return {
    html: document.html,
    plain_text: document.plainText,
    updated_at: document.updatedAt,
    editor_version: document.editorVersion,
    source: document.source,
  };
}

export function buildGamePlanDocumentResponse(
  document: ResolvedGamePlanDocument
): GamePlanDocumentResponse {
  return {
    game_plan: buildGamePlanSummary(document),
    has_game_plan: document.hasGamePlan,
  };
}

export function buildGamePlanWritePayload(input: unknown, updatedBy?: string | null) {
  const html = sanitizeRichTextHtml(typeof input === 'string' ? input : '');
  const plainText = stripHtml(html);
  const updatedAt = new Date().toISOString();

  return {
    html,
    plain_text: plainText,
    editor_version: 1,
    updated_by: updatedBy ?? null,
    updated_at: updatedAt,
  };
}

export function buildLegacyGamePlanMirror(html: string, updatedAt: string) {
  return {
    html,
    version: 2,
    updated_at: updatedAt,
  };
}
