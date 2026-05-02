import type { AdminSettingsDto } from '@/lib/admin/schemas/settings';

export type SettingsFormValues = {
  default_billing_interval: 'month' | 'quarter' | 'year';
  default_payment_terms_days: number;
  default_currency: string;
  default_commission_rate_percent: number;
};

export function settingsToForm(settings: AdminSettingsDto): SettingsFormValues {
  return {
    default_billing_interval: settings.default_billing_interval,
    default_payment_terms_days: settings.default_payment_terms_days,
    default_currency: settings.default_currency,
    default_commission_rate_percent:
      Math.round(settings.default_commission_rate * 1000) / 10,
  };
}

export function formToSettings(values: SettingsFormValues) {
  return {
    default_billing_interval: values.default_billing_interval,
    default_payment_terms_days: values.default_payment_terms_days,
    default_currency: values.default_currency,
    default_commission_rate: values.default_commission_rate_percent / 100,
  };
}
