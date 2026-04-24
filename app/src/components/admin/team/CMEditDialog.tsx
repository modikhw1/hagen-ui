'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Users } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import Link from 'next/link';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { AdminField } from '@/components/admin/shared/AdminField';
import { ApiError, apiClient } from '@/lib/admin/api-client';
import { cmEditCopy } from '@/lib/admin/copy/team';
import { cmEditSchema, type CmEditInput } from '@/lib/admin/schemas/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';
import { AvatarUpload } from '@/components/admin/ui/form/AvatarUpload';
import { uploadCmAvatar } from '@/lib/admin/team/upload-avatar';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { TEAM_COLORS } from '@/lib/admin/teamPalette';

type CMOption = {
  id: string;
  name: string;
  is_active: boolean;
};

type Props = {
  open: boolean;
  cm: TeamMemberView;
  allCMs: CMOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type ReassignResponse = {
  reassignedCount: number;
};

type CmEditFormValues = z.input<typeof cmEditSchema>;

function defaultValues(cm: TeamMemberView): CmEditInput {
  return {
    name: cm.name,
    email: cm.email,
    phone: cm.phone ?? '',
    city: cm.city ?? '',
    bio: cm.bio ?? '',
    avatar_url: cm.avatar_url ?? '',
    commission_rate_pct: Math.round(cm.commission_rate * 100),
  };
}

export default function CMEditDialog({
  open,
  cm,
  allCMs,
  onClose,
  onSaved,
}: Props) {
  const reassignSectionRef = useRef<HTMLDivElement>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [archiveBlocked, setArchiveBlocked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CmEditFormValues, unknown, CmEditInput>({
    resolver: zodResolver(cmEditSchema),
    defaultValues: defaultValues(cm),
    mode: 'onChange',
  });

  const {
    control,
    formState: { errors, isValid },
    handleSubmit,
    register,
    reset,
    setValue,
  } = form;

  const watchedName = useWatch({ control, name: 'name' });
  const watchedAvatarUrl = useWatch({ control, name: 'avatar_url' });
  const otherCMs = allCMs.filter((item) => item.id !== cm.id && item.is_active);

  useEffect(() => {
    reset(defaultValues(cm));
    setReassignTo('');
    setConfirmArchiveOpen(false);
    setArchiveBlocked(false);
    setFormError(null);
  }, [cm, reset]);

  const handleReassign = async () => {
    if (!reassignTo || cm.customers.length === 0) return;

    setIsReassigning(true);
    setFormError(null);
    setArchiveBlocked(false);

    try {
      await apiClient.post<ReassignResponse>(`/api/admin/team/${cm.id}/reassign-customers`, {
        targetCmId: reassignTo,
        customerIds: 'all',
      });
      await onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : cmEditCopy.reassignFailed);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleSave = handleSubmit(async (values) => {
    setIsSaving(true);
    setFormError(null);
    setArchiveBlocked(false);

    try {
      await apiClient.patch(`/api/admin/team/${cm.id}`, {
        name: values.name,
        email: values.email,
        phone: values.phone || null,
        city: values.city || null,
        bio: values.bio || null,
        avatar_url: values.avatar_url || '',
        commission_rate: values.commission_rate_pct / 100,
      });
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : cmEditCopy.saveFailed);
    } finally {
      setIsSaving(false);
    }
  });

  const handleArchive = async () => {
    setIsSaving(true);
    setFormError(null);
    setArchiveBlocked(false);

    try {
      await apiClient.del(`/api/admin/team/${cm.id}`);
      await onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setArchiveBlocked(true);
        setFormError(error.message || cmEditCopy.archiveBlocked);
        setConfirmArchiveOpen(false);
        reassignSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setFormError(error instanceof Error ? error.message : cmEditCopy.saveFailed);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <AdminFormDialog
        open={open}
        onClose={onClose}
        title={cmEditCopy.title}
        description={cmEditCopy.description}
        size="md"
        footer={
          <div className="flex w-full items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Avbryt
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setConfirmArchiveOpen(true)}
              disabled={isSaving || isReassigning}
              className="rounded-md border border-status-danger-fg/20 px-4 py-2 text-sm font-medium text-status-danger-fg hover:bg-status-danger-bg/10 disabled:opacity-50"
            >
              Arkivera
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isReassigning || !isValid}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {isSaving ? cmEditCopy.saving : cmEditCopy.save}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <AvatarUpload
            initials={(watchedName || cm.name).charAt(0)}
            currentUrl={watchedAvatarUrl || null}
            fallbackColor={TEAM_COLORS[0]}
            onUploaded={(url) =>
              setValue('avatar_url', url, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            uploadFn={uploadCmAvatar}
          />

          <div className="grid gap-4">
            <AdminField
              label={cmEditCopy.name}
              htmlFor="cm-edit-name"
              hint={cmEditCopy.nameHint}
              error={errors.name?.message}
            >
              <input
                id="cm-edit-name"
                {...register('name')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>

            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField
                label={cmEditCopy.email}
                htmlFor="cm-edit-email"
                error={errors.email?.message}
              >
                <input
                  id="cm-edit-email"
                  {...register('email')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </AdminField>
              <AdminField
                label={cmEditCopy.phone}
                htmlFor="cm-edit-phone"
                error={errors.phone?.message}
              >
                <input
                  id="cm-edit-phone"
                  {...register('phone')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </AdminField>
            </div>

            <AdminField
              label={cmEditCopy.city}
              htmlFor="cm-edit-city"
              error={errors.city?.message}
            >
              <input
                id="cm-edit-city"
                {...register('city')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>

            <AdminField
              label={cmEditCopy.bio}
              htmlFor="cm-edit-bio"
              hint={cmEditCopy.bioHint}
              error={errors.bio?.message}
            >
              <textarea
                id="cm-edit-bio"
                {...register('bio')}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>

            <AdminField
              label={cmEditCopy.commissionRate}
              htmlFor="cm-edit-commission-rate"
              error={errors.commission_rate_pct?.message}
            >
              <input
                id="cm-edit-commission-rate"
                {...register('commission_rate_pct')}
                inputMode="decimal"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>

            {cm.customers.length > 0 ? (
              <div ref={reassignSectionRef} className="rounded-lg bg-secondary/20 p-4 border border-border">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {cmEditCopy.reassignAll}
                </div>
                <div className="flex gap-2">
                  <select
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">{cmEditCopy.selectCm}</option>
                    {otherCMs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleReassign()}
                    disabled={!reassignTo || isReassigning}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {isReassigning ? 'Flyttar...' : 'Flytta'}
                  </button>
                </div>
              </div>
            ) : null}

            {formError ? (
              <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
                {formError}
              </div>
            ) : null}
          </div>
        </div>
      </AdminFormDialog>

      <ConfirmActionDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={cmEditCopy.archiveTitle}
        description={
          cm.customers.length > 0
            ? cmEditCopy.archiveDescriptionWithCustomers(cm.customers.length)
            : cmEditCopy.archiveDescriptionWithoutCustomers
        }
        confirmLabel={cmEditCopy.archive}
        onConfirm={() => void handleArchive()}
        pending={isSaving}
      />
    </>
  );
}
