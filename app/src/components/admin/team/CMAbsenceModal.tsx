'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ModeButton } from '@/components/admin/_primitives';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { addAdminBreadcrumb, captureAdminError } from '@/lib/admin/admin-telemetry';
import { apiClient } from '@/lib/admin/api-client';
import { cmAbsenceCopy } from '@/lib/admin/copy/team';
import { invalidateAdminScopes } from '@/lib/admin/invalidate';
import { absenceSchema, type CmAbsenceInput } from '@/lib/admin/schemas/team';
import { todayDateInput } from '@/lib/admin/time';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

type AbsenceResponse = {
  absence?: { id: string };
  payrollImpact?: {
    primaryCmEarnsDuringAbsence: boolean;
    coveringCmEarns: boolean;
  };
  error?: string;
};

function createDefaultValues(today: string): CmAbsenceInput {
  return {
    absence_type: 'vacation',
    starts_on: today,
    ends_on: today,
    backup_cm_id: null,
    compensation_mode: 'covering_cm',
    note: null,
  };
}

export default function CMAbsenceModal({
  open,
  cm,
  team,
  onClose,
  onSaved,
}: {
  open: boolean;
  cm: TeamMemberView;
  team: TeamMemberView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayDateInput();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  
  const form = useForm<CmAbsenceInput>({
    resolver: zodResolver(absenceSchema),
    defaultValues: createDefaultValues(today),
    mode: 'onBlur',
  });

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = form;

  const startsOn = useWatch({ control, name: 'starts_on' });
  const backupCmId = useWatch({ control, name: 'backup_cm_id' });
  const compensationMode = useWatch({ control, name: 'compensation_mode' });

  const backupOptions = useMemo(
    () => team.filter((member) => member.id !== cm.id && member.is_active),
    [cm.id, team],
  );

  const payrollPreview = useMemo(
    () => ({
      primaryCmEarnsDuringAbsence: compensationMode === 'primary_cm',
      coveringCmEarns: compensationMode === 'covering_cm' && Boolean(backupCmId),
    }),
    [backupCmId, compensationMode],
  );

  const handleSave = handleSubmit(async (values) => {
    setFormError(null);
    const payload = {
      cm_id: cm.id,
      backup_cm_id: values.backup_cm_id,
      absence_type: values.absence_type,
      compensation_mode: values.compensation_mode,
      starts_on: values.starts_on,
      ends_on: values.ends_on,
      note: values.note,
    };

    try {
      addAdminBreadcrumb('admin.team.absence_create', payload);
      const result = await apiClient.post<AbsenceResponse>('/api/admin/team/absences', payload);
      const description =
        result.payrollImpact?.primaryCmEarnsDuringAbsence && result.payrollImpact?.coveringCmEarns
          ? `${cmAbsenceCopy.payrollImpactPrimaryRetained}. ${cmAbsenceCopy.payrollImpactBackupRetained}.`
          : result.payrollImpact?.primaryCmEarnsDuringAbsence
            ? cmAbsenceCopy.payrollImpactPrimaryRetained
            : result.payrollImpact?.coveringCmEarns
              ? cmAbsenceCopy.payrollImpactBackupRetained
              : cmAbsenceCopy.payrollImpactBackupSuppressed;

      await invalidateAdminScopes(queryClient, ['team']);
      toast.success(cmAbsenceCopy.savedTitle, { description });
      onSaved();
      onClose();
    } catch (error) {
      captureAdminError('admin.team.absence_create', error, payload);
      setFormError(error instanceof Error ? error.message : cmAbsenceCopy.saveFailed);
    }
  });

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title={cmAbsenceCopy.title}
      description={cmAbsenceCopy.description(cm.name)}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? cmAbsenceCopy.saving : cmAbsenceCopy.save}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <AdminField label={cmAbsenceCopy.type} error={errors.absence_type?.message}>
          <select
            {...register('absence_type')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            {Object.entries(cmAbsenceCopy.typeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </AdminField>

        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label={cmAbsenceCopy.startsOn} error={errors.starts_on?.message}>
            <input
              type="date"
              min={today}
              {...register('starts_on')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </AdminField>
          <AdminField label={cmAbsenceCopy.endsOn} error={errors.ends_on?.message}>
            <input
              type="date"
              min={startsOn || today}
              {...register('ends_on')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </AdminField>
        </div>

        <AdminField label={cmAbsenceCopy.backupCm} error={errors.backup_cm_id?.message}>
          <select
            value={backupCmId ?? ''}
            onChange={(e) => setValue('backup_cm_id', e.target.value || null, { shouldDirty: true, shouldValidate: true })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="">{cmAbsenceCopy.noBackupCm}</option>
            {backupOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </AdminField>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ersättning</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeButton
              active={compensationMode === 'covering_cm'}
              onClick={() => setValue('compensation_mode', 'covering_cm', { shouldDirty: true, shouldValidate: true })}
              title={cmAbsenceCopy.replacementEarns}
              description={cmAbsenceCopy.replacementEarnsDescription}
            />
            <ModeButton
              active={compensationMode === 'primary_cm'}
              onClick={() => setValue('compensation_mode', 'primary_cm', { shouldDirty: true, shouldValidate: true })}
              title={cmAbsenceCopy.primaryEarns}
              description={cmAbsenceCopy.primaryEarnsDescription}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/20 p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {cmAbsenceCopy.payrollImpactTitle}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ordinarie CM</span>
              <span className="font-semibold text-foreground">
                {payrollPreview.primaryCmEarnsDuringAbsence ? 'Behåller ersättning' : 'Ingen ersättning'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ersättare</span>
              <span className="font-semibold text-foreground">
                {payrollPreview.coveringCmEarns ? 'Får ersättning' : 'Ingen ersättning'}
              </span>
            </div>
          </div>
        </div>

        <AdminField label={cmAbsenceCopy.note} error={errors.note?.message}>
          <textarea
            {...register('note')}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="Valfri notering..."
          />
        </AdminField>

        {formError && (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {formError}
          </div>
        )}
      </div>
    </AdminFormDialog>
  );
}
