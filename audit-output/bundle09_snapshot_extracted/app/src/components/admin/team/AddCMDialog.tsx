'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/shared/AdminFormDialog';
import {
  addAdminBreadcrumb,
  captureAdminError,
} from '@/lib/admin/admin-telemetry';
import { TEAM_COLORS } from '@/lib/admin/teamPalette';
import { useCreateTeamMember } from '@/hooks/admin/useCreateTeamMember';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const addTeamMemberFormSchema = z
  .object({
    role: z.enum(['admin', 'content_manager']),
    name: z.string().trim().min(1, 'Namn ar obligatoriskt').max(120),
    email: z.string().trim().email('Ange en giltig e-post'),
    phone: z.string().trim().max(40),
    city: z.string().trim().max(80),
    bio: z.string().trim().max(2000),
    avatar_url: z.union([z.string().trim().url('Ange en giltig URL'), z.literal('')]),
    color: z.enum(TEAM_COLORS),
    commission_rate_percent: z.number().min(0).max(100),
    sendInvite: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'admin' && value.commission_rate_percent !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commission_rate_percent'],
        message: 'Admin ska ha commission_rate = 0',
      });
    }
  });

type AddTeamMemberFormValues = z.infer<typeof addTeamMemberFormSchema>;

const defaultValues: AddTeamMemberFormValues = {
  role: 'content_manager',
  name: '',
  email: '',
  phone: '',
  city: '',
  bio: '',
  avatar_url: '',
  color: TEAM_COLORS[0],
  commission_rate_percent: 20,
  sendInvite: true,
};

export default function AddCMDialog({ open, onClose, onSaved }: Props) {
  if (!open) {
    return null;
  }

  return <AddCMDialogSession onClose={onClose} onSaved={onSaved} />;
}

function AddCMDialogSession({ onClose, onSaved }: Omit<Props, 'open'>) {
  const createTeamMember = useCreateTeamMember();
  const [warning, setWarning] = useState<string | null>(null);
  const form = useForm<AddTeamMemberFormValues>({
    resolver: zodResolver(addTeamMemberFormSchema),
    defaultValues,
    mode: 'onChange',
  });

  const {
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
    reset,
    setValue,
    control,
  } = form;

  const role = useWatch({ control, name: 'role' });
  const name = useWatch({ control, name: 'name' });
  const avatarUrl = useWatch({ control, name: 'avatar_url' });
  const color = useWatch({ control, name: 'color' });
  const sendInvite = useWatch({ control, name: 'sendInvite' });
  const commissionRatePercent = useWatch({ control, name: 'commission_rate_percent' });

  useEffect(() => {
    if (role === 'admin') {
      setValue('commission_rate_percent', 0, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else if (commissionRatePercent === 0) {
      setValue('commission_rate_percent', 20, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [commissionRatePercent, role, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setWarning(null);
    const payload = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      city: values.city,
      bio: values.bio,
      avatar_url: values.avatar_url,
      color: values.color,
      role: values.role,
      commission_rate:
        values.role === 'content_manager' ? values.commission_rate_percent / 100 : 0,
      sendInvite: values.sendInvite,
    };

    try {
      addAdminBreadcrumb('admin.team.create', payload);
      const result = (await createTeamMember.mutateAsync(payload)) as { warning?: string };
      addAdminBreadcrumb('admin.team.create', {
        phase: 'success',
        role: values.role,
        email: values.email,
      });
      setWarning(result.warning ?? null);

      if (result.warning) {
        return;
      }

      await onSaved();
      reset(defaultValues);
      createTeamMember.reset();
      setWarning(null);
      onClose();
    } catch (submitError) {
      captureAdminError('admin.team.create', submitError, payload);
    }
  });

  const handleClose = () => {
    reset(defaultValues);
    createTeamMember.reset();
    setWarning(null);
    onClose();
  };

  return (
    <AdminFormDialog
      open
      onClose={handleClose}
      title={role === 'admin' ? 'Lagg till admin' : 'Lagg till CM'}
      description={
        role === 'admin'
          ? 'Skapa en ny adminanvandare och skicka inbjudan.'
          : 'Skapa en ny content manager och skicka inbjudan.'
      }
      submitLabel={
        role === 'admin' ? 'Lagg till admin och bjud in' : 'Lagg till CM och bjud in'
      }
      submittingLabel="Skapar..."
      onSubmit={onSubmit}
      submitting={isSubmitting || createTeamMember.isPending}
      canSubmit={isValid}
      error={createTeamMember.error instanceof Error ? createTeamMember.error.message : null}
      warning={warning}
      size="md"
    >
      <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-3">
        <AdminAvatar
          name={name || 'Ny CM'}
          avatarUrl={avatarUrl || null}
          size="lg"
        />
        <div>
          <div className="text-sm font-semibold text-foreground">
            {name || (role === 'admin' ? 'Ny admin' : 'Ny CM')}
          </div>
          <div className="text-xs text-muted-foreground">
            Lagg till profilbild via URL-faltet nedan.
          </div>
        </div>
      </div>

      <AdminField label="Namn" htmlFor="team_name" error={errors.name?.message}>
        <input
          id="team_name"
          {...register('name')}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </AdminField>

      <AdminField label="Roll" htmlFor="team_role" error={errors.role?.message}>
        <select
          id="team_role"
          {...register('role')}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="content_manager">Content Manager</option>
          <option value="admin">Admin</option>
        </select>
      </AdminField>

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="E-post" htmlFor="team_email" error={errors.email?.message}>
          <input
            id="team_email"
            {...register('email')}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </AdminField>
        <AdminField label="Telefon" htmlFor="team_phone" error={errors.phone?.message}>
          <input
            id="team_phone"
            {...register('phone')}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </AdminField>
      </div>

      <AdminField label="Ort" htmlFor="team_city" error={errors.city?.message}>
        <input
          id="team_city"
          {...register('city')}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </AdminField>

      <AdminField label="Bio" htmlFor="team_bio" error={errors.bio?.message}>
        <textarea
          id="team_bio"
          {...register('bio')}
          rows={3}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </AdminField>

      <AdminField
        label="Profilbild (URL)"
        htmlFor="team_avatar_url"
        error={errors.avatar_url?.message}
      >
        <input
          id="team_avatar_url"
          {...register('avatar_url')}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          placeholder="https://..."
        />
      </AdminField>

      {role === 'content_manager' ? (
        <AdminField
          label="Kommission (%)"
          htmlFor="team_commission_rate"
          error={errors.commission_rate_percent?.message}
        >
          <input
            id="team_commission_rate"
            {...register('commission_rate_percent', { valueAsNumber: true })}
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </AdminField>
      ) : (
        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Admin-invites skapas utan payrollfokus. Kommission anvands bara for CMs.
        </div>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={sendInvite}
          onChange={(event) =>
            setValue('sendInvite', event.target.checked, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <span className="space-y-1">
          <span className="block font-medium text-foreground">Skicka inbjudan direkt</span>
          <span className="block text-xs text-muted-foreground">
            Ny teammedlem far inviteflodet direkt efter skapandet.
          </span>
        </span>
      </label>

      <AdminField label="Farg" error={errors.color?.message}>
        <div className="flex flex-wrap gap-2">
          {TEAM_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() =>
                setValue('color', item, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className={`h-8 w-8 rounded-full border-2 ${
                color === item ? 'border-foreground' : 'border-transparent'
              }`}
              style={{ backgroundColor: item }}
            />
          ))}
        </div>
      </AdminField>
    </AdminFormDialog>
  );
}
