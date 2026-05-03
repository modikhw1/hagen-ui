import type { Json } from '@/types/database';
import type { CustomerBrief } from '@/types/studio-v2';

export type JsonObject = { [key: string]: Json | undefined };

export const EMPTY_CUSTOMER_BRIEF: CustomerBrief = {
  tone: '',
  constraints: '',
  current_focus: '',
};

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function normalizeCustomerBrief(value: unknown): CustomerBrief {
  const record = asJsonObject(value);
  const postingWeekdays = Array.isArray(record.posting_weekdays)
    ? record.posting_weekdays.filter(
        (day): day is number => typeof day === 'number' && Number.isInteger(day),
      )
    : record.posting_weekdays === null
      ? null
      : undefined;

  const brief: CustomerBrief = {
    tone: typeof record.tone === 'string' ? record.tone : '',
    constraints: typeof record.constraints === 'string' ? record.constraints : '',
    current_focus: typeof record.current_focus === 'string' ? record.current_focus : '',
  };

  if (postingWeekdays !== undefined) {
    brief.posting_weekdays = postingWeekdays;
  }

  return brief;
}
