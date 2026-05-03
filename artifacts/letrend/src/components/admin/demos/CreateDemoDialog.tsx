'use client';

import { useMemo, useState } from 'react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { useCreateDemo } from '@/hooks/admin/useDemos';
import { demosCopy } from '@/lib/admin/copy/demos';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

type FormState = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  tiktok_handle: string;
  proposed_concepts_per_week: string;
};

function initialState(): FormState {
  return {
    company_name: '',
    contact_name: '',
    contact_email: '',
    tiktok_handle: '',
    proposed_concepts_per_week: '2',
  };
}

export default function CreateDemoDialog({ open, onClose, onCreated }: Props) {
  if (!open) {
    return null;
  }

  return (
    <CreateDemoDialogSession
      key="create-demo-session"
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function CreateDemoDialogSession({ onClose, onCreated }: Omit<Props, 'open'>) {
  const [form, setForm] = useState<FormState>(initialState);
  const createDemo = useCreateDemo();

  const canSubmit = useMemo(() => form.company_name.trim().length > 0, [form.company_name]);

  const handleSubmit = async () => {
    if (!canSubmit || createDemo.isPending) return;

    await createDemo.mutateAsync({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      tiktok_handle: normalizeHandle(form.tiktok_handle),
      proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
      proposed_price_ore: null,
      status: 'draft',
      lost_reason: null,
    });

    await onCreated();
    onClose();
  };

  return (
    <AdminFormDialog
      open
      onClose={onClose}
      title={demosCopy.createDialogTitle}
      description={demosCopy.createDescription}
      error={createDemo.error instanceof Error ? createDemo.error.message : null}
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={createDemo.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createDemo.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createDemo.isPending ? demosCopy.createDialogSubmitting : demosCopy.createDialogSubmit}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.companyLabelRequired} htmlFor="company_name">
            <input
              id="company_name"
              value={form.company_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, company_name: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder={demosCopy.createCompanyPlaceholder}
            />
          </AdminField>
          <AdminField label={demosCopy.contactLabel} htmlFor="contact_name">
            <input
              id="contact_name"
              value={form.contact_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, contact_name: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="Maria Holm"
            />
          </AdminField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.emailLabel} htmlFor="contact_email">
            <input
              id="contact_email"
              value={form.contact_email}
              onChange={(event) =>
                setForm((current) => ({ ...current, contact_email: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="info@example.se"
              type="email"
            />
          </AdminField>
          <AdminField label={demosCopy.tiktokLabel} htmlFor="tiktok_handle">
            <input
              id="tiktok_handle"
              value={form.tiktok_handle}
              onChange={(event) =>
                setForm((current) => ({ ...current, tiktok_handle: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="@konto"
            />
          </AdminField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.conceptsPerWeekLabel} htmlFor="proposed_concepts_per_week">
            <input
              id="proposed_concepts_per_week"
              value={form.proposed_concepts_per_week}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposed_concepts_per_week: event.target.value,
                }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              inputMode="numeric"
              placeholder="2"
            />
          </AdminField>
        </div>

        <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Efter att demot skapats kan du öppna det i Studio för att fylla feedplanen, och sedan kopiera den publika demo-länken från listan.
        </p>
      </div>
    </AdminFormDialog>
  );
}

function normalizeHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function parseOptionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
