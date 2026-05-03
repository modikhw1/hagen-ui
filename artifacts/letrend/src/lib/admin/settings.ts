import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingRelationError } from '@/lib/admin/schema-guards';

export type BillingInterval = 'month' | 'quarter' | 'year';

export type AdminSettings = {
  default_billing_interval: BillingInterval;
  default_payment_terms_days: number;
  default_currency: string;
  default_commission_rate: number;
  updated_at: string | null;
};

export type AdminSettingsResult = {
  settings: AdminSettings;
  schemaWarnings: string[];
};

export type AdminSettingsUpdate = Partial<{
  default_billing_interval: BillingInterval;
  default_payment_terms_days: number;
  default_currency: string;
  default_commission_rate: number;
}>;

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  default_billing_interval: 'month',
  default_payment_terms_days: 14,
  default_currency: 'SEK',
  default_commission_rate: 0.2,
  updated_at: null,
};

export class SettingsStorageUnavailableError extends Error {
  constructor(message = 'Settings-tabellen saknas i databasen. Kor migrationen for §2.') {
    super(message);
    this.name = 'SettingsStorageUnavailableError';
  }
}

export async function getAdminSettings(
  supabaseAdmin: SupabaseClient,
): Promise<AdminSettingsResult> {
  const result = await (((supabaseAdmin.from('settings' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(
    'id, default_billing_interval, default_payment_terms_days, default_currency, default_commission_rate, updated_at',
  )).eq('id', true).maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error.message) || isMissingColumnError(result.error.message)) {
      return {
        settings: DEFAULT_ADMIN_SETTINGS,
        schemaWarnings: ['Settings-tabellen eller nagon av dess kolumner saknas. Kor migrationen for §2.'],
      };
    }

    throw new Error(result.error.message || 'Kunde inte hämta admin settings');
  }

  return {
    settings: normalizeSettings(result.data),
    schemaWarnings: [],
  };
}

export async function updateAdminSettings(
  supabaseAdmin: SupabaseClient,
  input: AdminSettingsUpdate,
): Promise<AdminSettingsResult> {
  const payload = {
    id: true,
    ...(input.default_billing_interval
      ? { default_billing_interval: input.default_billing_interval }
      : {}),
    ...(input.default_payment_terms_days !== undefined
      ? { default_payment_terms_days: Math.max(1, Math.min(120, Math.round(input.default_payment_terms_days))) }
      : {}),
    ...(input.default_currency
      ? { default_currency: input.default_currency.trim().toUpperCase() || DEFAULT_ADMIN_SETTINGS.default_currency }
      : {}),
    ...(input.default_commission_rate !== undefined
      ? { default_commission_rate: clampCommissionRate(input.default_commission_rate) }
      : {}),
  };

  const result = await (((supabaseAdmin.from('settings' as never) as never) as {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).upsert(payload, { onConflict: 'id' })).select(
    'id, default_billing_interval, default_payment_terms_days, default_currency, default_commission_rate, updated_at',
  ).single();

  if (result.error) {
    if (isMissingRelationError(result.error.message) || isMissingColumnError(result.error.message)) {
      throw new SettingsStorageUnavailableError();
    }
    throw new Error(result.error.message || 'Kunde inte spara admin settings');
  }

  return {
    settings: normalizeSettings(result.data),
    schemaWarnings: [],
  };
}

function normalizeSettings(row: Record<string, unknown> | null | undefined): AdminSettings {
  return {
    default_billing_interval: normalizeInterval(row?.default_billing_interval),
    default_payment_terms_days: normalizeNumber(
      row?.default_payment_terms_days,
      DEFAULT_ADMIN_SETTINGS.default_payment_terms_days,
    ),
    default_currency: normalizeCurrency(row?.default_currency),
    default_commission_rate: clampCommissionRate(
      normalizeNumber(row?.default_commission_rate, DEFAULT_ADMIN_SETTINGS.default_commission_rate),
    ),
    updated_at: typeof row?.updated_at === 'string' ? row.updated_at : null,
  };
}

function normalizeInterval(value: unknown): BillingInterval {
  if (value === 'quarter' || value === 'year') return value;
  return 'month';
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_ADMIN_SETTINGS.default_currency;
  const normalized = value.trim().toUpperCase();
  return normalized || DEFAULT_ADMIN_SETTINGS.default_currency;
}

function normalizeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampCommissionRate(value: number) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : DEFAULT_ADMIN_SETTINGS.default_commission_rate;
  return Math.max(0, Math.min(1, safe));
}
