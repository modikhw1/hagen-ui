'use client';

import { useEffect } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import {
  adminModalInputStyle,
  adminModalLabelStyle,
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
  adminModalSectionStyle,
} from '@/components/admin/ui/adminModalTokens';
import { LeTrendColors } from '@/styles/letrend-design-system';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { AvatarUploader } from '@/components/admin/shared/AvatarUploader';

const Schema = z.object({
  name: z.string().min(2, 'Namn måste vara minst 2 tecken').max(120),
  email: z.string().email('Ogiltig e-post').max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  bio: z.string().max(500).optional().or(z.literal('')),
  avatar_url: z.string().url('Ange en giltig URL').optional().or(z.literal('')),
  commission_rate_pct: z.number().min(0, 'Minst 0 %').max(50, 'Max 50 %'),
  role: z.string(),
});

type FormValues = z.infer<typeof Schema>;

export interface CMEditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cmId: string;
  initialValues: FormValues;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={adminModalSectionStyle}>
      <div style={adminModalLabelStyle}>{label}</div>
      {children}
      {error ? <div style={{ fontSize: 11, color: LeTrendColors.error }}>{error}</div> : null}
    </div>
  );
}

export function CMEditProfileDialog({
  open,
  onOpenChange,
  cmId,
  initialValues,
}: CMEditProfileDialogProps) {
  const refresh = useAdminRefresh();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (open) {
      reset(initialValues);
    }
  }, [initialValues, open, reset]);
  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedAvatarUrl = useWatch({ control, name: 'avatar_url' }) ?? '';
  const watchedRole = useWatch({ control, name: 'role' }) ?? 'content_manager';

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const res = await fetch(`/api/admin/team/${cmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          city: values.city || null,
          bio: values.bio || null,
          avatar_url: values.avatar_url || '',
          commission_rate_pct: values.role === 'admin' ? 0 : values.commission_rate_pct,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte spara (${res.status})`);
        return;
      }

      toast.success('Profil uppdaterad.');
      onOpenChange(false);
      void refresh(['team', 'customers']);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    }
  };

  return (
    <AdminModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title="Redigera CM-profil"
      size="lg"
      disableClose={isSubmitting}
      footer={
        <>
          <button
            type="button"
            style={{ ...adminModalSecondaryButtonStyle, opacity: isSubmitting ? 0.5 : 1 }}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Avbryt
          </button>
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(!isSubmitting)}
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sparar…' : 'Spara'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AvatarUploader
          name={watchedName}
          value={watchedAvatarUrl}
          onChange={(value) => setValue('avatar_url', value, { shouldDirty: true })}
          error={errors.avatar_url?.message ?? null}
        />

        <Field label="Namn" error={errors.name?.message}>
          <input style={adminModalInputStyle} {...register('name')} />
        </Field>
        <Field label="E-post" error={errors.email?.message}>
          <input type="email" style={adminModalInputStyle} {...register('email')} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Telefon" error={errors.phone?.message}>
            <input style={adminModalInputStyle} {...register('phone')} />
          </Field>
          <Field label="Ort" error={errors.city?.message}>
            <input style={adminModalInputStyle} {...register('city')} />
          </Field>
        </div>
        <Field label="Bio" error={errors.bio?.message}>
          <textarea rows={3} style={{ ...adminModalInputStyle, resize: 'vertical', lineHeight: 1.5 }} {...register('bio')} />
        </Field>
        {watchedRole !== 'admin' ? (
          <Field label="Kommission (%)" error={errors.commission_rate_pct?.message}>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              style={adminModalInputStyle}
              {...register('commission_rate_pct', { valueAsNumber: true })}
            />
          </Field>
        ) : null}
      </form>
    </AdminModalShell>
  );
}
