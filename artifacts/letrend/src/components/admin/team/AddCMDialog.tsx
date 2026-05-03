'use client';

import { useState } from 'react';
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
import { AvatarUploader } from '@/components/admin/shared/AvatarUploader';
import { useCreateTeamMember } from '@/hooks/admin/useCreateTeamMember';

const Schema = z.object({
  name: z.string().min(2, 'Namn måste vara minst 2 tecken').max(120),
  email: z.string().email('Ogiltig e-post').max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  bio: z.string().max(500).optional().or(z.literal('')),
  avatar_url: z.string().url('Ange en giltig URL').optional().or(z.literal('')),
  commission_rate_pct: z.number().min(0, 'Minst 0 %').max(50, 'Max 50 %'),
});

type FormValues = z.infer<typeof Schema>;

export interface AddCMDialogProps {
  trigger?: React.ReactNode;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div style={{ fontSize: 11, color: LeTrendColors.error }}>{message}</div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={adminModalSectionStyle}>
      <div style={adminModalLabelStyle}>{label}</div>
      {children}
      <FieldError message={error} />
    </div>
  );
}

export function AddCMDialog({ trigger }: AddCMDialogProps) {
  const [open, setOpen] = useState(false);
  const createTeamMember = useCreateTeamMember();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      city: '',
      bio: '',
      avatar_url: '',
      commission_rate_pct: 20,
    },
  });
  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedAvatarUrl = useWatch({ control, name: 'avatar_url' }) ?? '';

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const result = await createTeamMember.mutateAsync({
        role: 'content_manager',
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        city: values.city || undefined,
        bio: values.bio || undefined,
        avatar_url: values.avatar_url || undefined,
        commission_rate: values.commission_rate_pct / 100,
        sendInvite: true,
      });

      toast.success(
        result.warning
          ? `${values.name} skapades, men inbjudan behöver följas upp.`
          : `${values.name} har lagts till som CM.`,
      );
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    }
  };

  const submitting = isSubmitting || createTeamMember.isPending;

  return (
    <>
      <div onClick={() => setOpen(true)} className="inline-block">
        {trigger ?? (
          <button type="button" style={adminModalPrimaryButtonStyle(true)}>
            + Lägg till CM
          </button>
        )}
      </div>

      <AdminModalShell
        open={open}
        onClose={() => setOpen(false)}
        title="Lägg till content manager"
        description="Skapar teammedlem och skickar inbjudan via e-post direkt."
        size="lg"
        disableClose={submitting}
        footer={
          <>
            <button
              type="button"
              style={{ ...adminModalSecondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Avbryt
            </button>
            <button
              type="button"
              style={adminModalPrimaryButtonStyle(!submitting)}
              onClick={handleSubmit(onSubmit)}
              disabled={submitting}
            >
              {submitting ? 'Sparar…' : 'Lägg till CM'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AvatarUploader
            name={watchedName}
            value={watchedAvatarUrl}
            onChange={(value) => setValue('avatar_url', value, { shouldDirty: true })}
            error={errors.avatar_url?.message ?? null}
          />

          <Field label="Fullständigt namn" error={errors.name?.message}>
            <input style={adminModalInputStyle} placeholder="Anna Andersson" {...register('name')} />
          </Field>

          <Field label="E-post" error={errors.email?.message}>
            <input type="email" style={adminModalInputStyle} placeholder="anna@letrend.se" {...register('email')} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Telefon" error={errors.phone?.message}>
              <input style={adminModalInputStyle} placeholder="070-123 45 67" {...register('phone')} />
            </Field>
            <Field label="Ort" error={errors.city?.message}>
              <input style={adminModalInputStyle} placeholder="Stockholm" {...register('city')} />
            </Field>
          </div>

          <Field label="Bio" error={errors.bio?.message}>
            <textarea
              rows={3}
              style={{ ...adminModalInputStyle, resize: 'vertical', lineHeight: 1.5 }}
              {...register('bio')}
            />
          </Field>

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
        </form>
      </AdminModalShell>
    </>
  );
}
