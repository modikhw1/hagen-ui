'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminSection } from '@/components/admin/shared/AdminSection';
import { EnvSwitch } from './EnvSwitch';
import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useAdminSettings, useUpdateAdminSettings } from '@/hooks/admin/useAdminSettings';
import { settingsCopy } from '@/lib/admin/copy/settings';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import {
  formToSettings,
  settingsToForm,
  type SettingsFormValues,
} from '@/lib/admin/transforms/settings';
import { StatusPill } from '@/components/admin/ui/StatusPill';

const settingsFormSchema = z.object({
  default_billing_interval: z.enum(['month', 'quarter', 'year']),
  default_payment_terms_days: z.number().int().min(1).max(120),
  default_currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  default_commission_rate_percent: z.number().min(0).max(100),
});

export function SettingsForm() {
  const { data, isLoading, error } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      default_billing_interval: 'month',
      default_payment_terms_days: 30,
      default_currency: 'SEK',
      default_commission_rate_percent: 20,
    },
  });
  const {
    formState: { errors, isSubmitting, isDirty },
    register,
    control,
    handleSubmit,
  } = form;

  useBeforeUnload(isDirty, settingsCopy.unsavedLeaveMessage);

  useEffect(() => {
    if (!data) {
      return;
    }

    form.reset(settingsToForm(data.settings));
  }, [data, form]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('admin:settings-dirty', {
        detail: { isDirty },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent('admin:settings-dirty', {
          detail: { isDirty: false },
        }),
      );
    };
  }, [isDirty]);

  if (isLoading) {
    return <SettingsFormSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : settingsCopy.loadError}
      </div>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    await updateSettings.mutateAsync(formToSettings(values));
    toast.success(settingsCopy.saveSuccess);
    form.reset(values);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={settingsCopy.title}
        subtitle={settingsCopy.subtitle}
        actions={
          <>
            {isDirty && (
              <StatusPill label={settingsCopy.unsavedBadge} tone="warning" size="sm" />
            )}
            <button
              onClick={onSubmit}
              disabled={!isDirty || updateSettings.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {updateSettings.isPending ? settingsCopy.saveButtonSaving : settingsCopy.saveButton}
            </button>
          </>
        }
      />

      <SchemaWarningBanner warnings={data.schemaWarnings} />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,800px)]">
        <AdminSection
          title={settingsCopy.sectionBillingTitle}
          description={settingsCopy.sectionBillingDescription}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <AdminField
              label={settingsCopy.defaultBillingIntervalLabel}
              htmlFor="default_billing_interval"
              error={errors.default_billing_interval?.message}
            >
              <select
                id="default_billing_interval"
                {...register('default_billing_interval')}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="month">Månadsvis</option>
                <option value="quarter">Kvartalsvis</option>
                <option value="year">Årsvis</option>
              </select>
            </AdminField>

            <AdminField
              label={settingsCopy.paymentTermsDaysLabel}
              htmlFor="default_payment_terms_days"
              error={errors.default_payment_terms_days?.message}
            >
              <input
                id="default_payment_terms_days"
                {...register('default_payment_terms_days', { valueAsNumber: true })}
                inputMode="numeric"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </AdminField>

            <AdminField
              label={settingsCopy.currencyLabel}
              htmlFor="default_currency"
              error={errors.default_currency?.message}
            >
              <Controller
                control={control}
                name="default_currency"
                render={({ field }) => (
                  <input
                    id="default_currency"
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    onBlur={field.onBlur}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                )}
              />
            </AdminField>
          </div>
        </AdminSection>

        <AdminSection
          title={settingsCopy.sectionCommissionTitle}
          description={settingsCopy.sectionCommissionDescription}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <AdminField
              label={settingsCopy.commissionLabel}
              htmlFor="default_commission_rate_percent"
              error={errors.default_commission_rate_percent?.message}
            >
              <div className="relative">
                <input
                  id="default_commission_rate_percent"
                  {...register('default_commission_rate_percent', { valueAsNumber: true })}
                  inputMode="decimal"
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span>
              </div>
            </AdminField>
          </div>
        </AdminSection>

        <AdminSection
          title={settingsCopy.sectionNotificationsTitle}
          description={settingsCopy.sectionNotificationsDescription}
        >
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Den här sektionen fylls på när notifikations-defaults landar.
          </div>
        </AdminSection>

        <AdminSection
          title={OPERATOR_COPY.env.settingsLabel}
          description={OPERATOR_COPY.env.settingsHint}
        >
          <EnvSwitch />
        </AdminSection>

        {updateSettings.isError ? (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {updateSettings.error instanceof Error
              ? updateSettings.error.message
              : settingsCopy.saveError}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function SettingsFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-72 animate-pulse rounded bg-secondary" />
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
              <div className="h-10 w-full animate-pulse rounded bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
