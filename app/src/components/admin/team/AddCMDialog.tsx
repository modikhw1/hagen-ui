'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/admin/ui/form/AvatarUpload';
import { uploadCmAvatar } from '@/lib/admin/team/upload-avatar';
import { ColorSwatchGrid } from '@/components/admin/shared/ColorSwatchGrid';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/admin/api-client';
import {
  addAdminBreadcrumb,
  captureAdminError,
} from '@/lib/admin/admin-telemetry';
import { TEAM_COLORS } from '@/lib/admin/teamPalette';
import { useCreateTeamMember, type CreateTeamMemberPayload } from '@/hooks/admin/useCreateTeamMember';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const sharedFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Namn är obligatoriskt').max(120),
  email: z.string().trim().email('Ange en giltig e-post'),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === '' || /^\+?[0-9 ()-]{6,40}$/.test(value), {
      message: 'Ange ett giltigt telefonnummer',
    }),
  city: z.string().trim().max(80),
  bio: z.string().trim().max(2000),
  avatar_url: z.union([z.string().trim().url('Ange en giltig URL'), z.literal('')]),
  color: z.enum(TEAM_COLORS),
  sendInvite: z.boolean(),
});

const addTeamMemberFormSchema = z.discriminatedUnion('role', [
  sharedFieldsSchema.extend({
    role: z.literal('admin'),
    commission_rate_percent: z.literal(0),
  }),
  sharedFieldsSchema.extend({
    role: z.literal('content_manager'),
    commission_rate_percent: z.number().min(0).max(50),
  }),
]);

type AddTeamMemberFormValues = z.input<typeof addTeamMemberFormSchema>;

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
  const router = useRouter();
  const createTeamMember = useCreateTeamMember();
  const [warning, setWarning] = useState<string | null>(null);
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
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
    setError,
    clearErrors,
    control,
    getValues,
  } = form;

  const role = useWatch({ control, name: 'role' });
  const name = useWatch({ control, name: 'name' });
  const avatarUrl = useWatch({ control, name: 'avatar_url' });
  const color = useWatch({ control, name: 'color' });
  const sendInvite = useWatch({ control, name: 'sendInvite' });
  const commissionRatePercent = useWatch({ control, name: 'commission_rate_percent' });
  const bio = useWatch({ control, name: 'bio' });

  const switchRole = (nextRole: 'admin' | 'content_manager') => {
    const current = getValues();
    const nextCommission =
      nextRole === 'admin'
        ? 0
        : current.commission_rate_percent === 0
          ? 20
          : current.commission_rate_percent;
    reset({
      ...current,
      role: nextRole,
      commission_rate_percent: nextCommission,
    } as AddTeamMemberFormValues);
    setWarning(null);
    setExistingMemberId(null);
    createTeamMember.reset();
  };

  const onSubmit = handleSubmit(async (values) => {
    setWarning(null);
    setExistingMemberId(null);
    clearErrors('email');

    const payload: CreateTeamMemberPayload = {
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
      const result = await createTeamMember.mutateAsync(payload);
      addAdminBreadcrumb('admin.team.create', {
        phase: 'success',
        role: values.role,
        email: values.email,
      });

      if (result.warning) {
        setWarning(result.warning);
        toast.warning(result.warning);
        return;
      }

      toast.success(values.role === 'admin' ? 'Admin skapad.' : 'CM skapad.', {
        action: {
          label: 'Öppna profil',
          onClick: () => router.push(`/admin/team?focus=${result.member.id}`),
        },
      });

      await onSaved();
      reset(defaultValues);
      createTeamMember.reset();
      onClose();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        const raw =
          submitError.raw && typeof submitError.raw === 'object'
            ? (submitError.raw as { existingMemberId?: unknown; field?: unknown })
            : null;
        setError('email', { type: 'server', message: submitError.message });
        if (typeof raw?.existingMemberId === 'string') {
          setExistingMemberId(raw.existingMemberId);
        }
        return;
      }

      captureAdminError('admin.team.create', submitError, payload);
    }
  });

  const handleClose = () => {
    reset(defaultValues);
    createTeamMember.reset();
    setWarning(null);
    setExistingMemberId(null);
    onClose();
  };

  const dialogError =
    createTeamMember.error instanceof ApiError && createTeamMember.error.status === 409
      ? null
      : createTeamMember.error instanceof Error
        ? createTeamMember.error.message
        : null;

  return (
    <AdminFormDialog
      open
      onClose={handleClose}
      title={role === 'admin' ? 'Lägg till admin' : 'Lägg till CM'}
      description={
        role === 'admin'
          ? 'Skapa en ny adminanvändare och skicka inbjudan.'
          : 'Skapa en ny content manager och skicka inbjudan.'
      }
      error={dialogError}
      warning={warning}
      size="md"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={isSubmitting || createTeamMember.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={onSubmit}
            disabled={!isValid || isSubmitting || createTeamMember.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting || createTeamMember.isPending
              ? 'Skapar...'
              : role === 'admin'
                ? 'Skapa admin & skicka inbjudan'
                : 'Skapa CM & skicka inbjudan'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <AvatarUpload
          initials={(name || (role === 'admin' ? 'A' : 'C')).charAt(0)}
          currentUrl={avatarUrl || null}
          fallbackColor={color}
          onUploaded={(url) =>
            setValue('avatar_url', url, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          uploadFn={uploadCmAvatar}
        />

        <AdminField label="Namn" htmlFor="team_name" error={errors.name?.message}>
          <Input id="team_name" {...register('name')} />
        </AdminField>

        <AdminField label="Roll" htmlFor="team_role">
          <Select value={role} onValueChange={(next) => switchRole(next as 'admin' | 'content_manager')}>
            <SelectTrigger id="team_role">
              <SelectValue placeholder="Välj roll" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="content_manager">Content Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </AdminField>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="E-post" htmlFor="team_email" error={errors.email?.message}>
            <Input id="team_email" type="email" autoComplete="email" {...register('email')} />
          </AdminField>
          <AdminField label="Telefon" htmlFor="team_phone" error={errors.phone?.message}>
            <Input
              id="team_phone"
              placeholder="+46 70 123 45 67"
              autoComplete="tel"
              {...register('phone')}
            />
          </AdminField>
        </div>

        {existingMemberId ? (
          <div className="text-xs text-status-warning-fg">
            En teammedlem med samma e-post finns redan.{' '}
            <Link
              href={`/admin/team?focus=${existingMemberId}`}
              className="font-medium underline underline-offset-4"
            >
              Visa befintlig CM
            </Link>
            .
          </div>
        ) : null}

        <AdminField label="Ort" htmlFor="team_city" error={errors.city?.message}>
          <Input id="team_city" {...register('city')} />
        </AdminField>

        <AdminField
          label="Bio"
          htmlFor="team_bio"
          hint={`${bio.length} / 2000 tecken`}
          error={errors.bio?.message}
        >
          <Textarea
            id="team_bio"
            {...register('bio')}
            rows={4}
          />
        </AdminField>

        {role === 'content_manager' ? (
          <>
            <AdminField
              label="Kommission (%)"
              htmlFor="team_commission_rate"
              hint="Dra reglaget eller skriv exakt procent."
              error={errors.commission_rate_percent?.message}
            >
              <div className="grid gap-2">
                <Slider
                  id="team_commission_rate"
                  min={0}
                  max={50}
                  step={1}
                  value={commissionRatePercent}
                  onChange={(event) => {
                    setValue('commission_rate_percent', Number(event.target.value), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={commissionRatePercent}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    setValue(
                      'commission_rate_percent',
                      Number.isFinite(parsed) ? parsed : 0,
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      },
                    );
                  }}
                />
              </div>
            </AdminField>

            <AdminField label="Färg" error={errors.color?.message}>
              <ColorSwatchGrid
                value={color}
                colors={TEAM_COLORS}
                onChange={(next) =>
                  setValue('color', next as (typeof TEAM_COLORS)[number], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </AdminField>
          </>
        ) : (
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            Admin-invites skapas utan payrollfokus. Kommission används bara för CMs.
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-3 text-left">
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">Skicka inbjudan direkt</span>
            <span className="block text-xs text-muted-foreground">
              Ny teammedlem får inviteflödet direkt efter skapandet.
            </span>
          </span>
          <Switch
            checked={sendInvite}
            onCheckedChange={(next) =>
              setValue('sendInvite', next, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            aria-label="Skicka inbjudan direkt"
          />
        </div>
      </div>
    </AdminFormDialog>
  );
}
