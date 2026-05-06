'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { useCreateDemo } from '@/hooks/admin/useDemos';
import { useTeamLite } from '@/hooks/admin/useTeamLite';
import { demosCopy } from '@/lib/admin/copy/demos';

export type CreateDemoResult = {
  demo?: { id?: string; [key: string]: unknown };
  studio?: {
    customerId?: string;
    created?: boolean;
  };
  sync?: {
    status?: 'ok' | 'skipped' | 'error';
    fetched?: number;
    imported?: number;
    statsUpdated?: number;
    error?: string;
    reason?: string;
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result?: CreateDemoResult) => void | Promise<void>;
};

type FormState = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  tiktok_handle: string;
  proposed_concepts_per_week: string;
  proposed_price_sek: string;
  owner_admin_id: string;
};

function initialState(): FormState {
  return {
    company_name: '',
    contact_name: '',
    contact_email: '',
    tiktok_handle: '',
    proposed_concepts_per_week: '2',
    proposed_price_sek: '',
    owner_admin_id: '',
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
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const createDemo = useCreateDemo();
  const { data: teamMembers = [] } = useTeamLite();
  const contentManagers = useMemo(
    () =>
      teamMembers.filter(
        (member) => member.role === 'content_manager' || member.role === 'admin',
      ),
    [teamMembers],
  );

  const canSubmit = useMemo(() => form.company_name.trim().length > 0, [form.company_name]);
  const creating = createDemo.isPending;
  const normalizedTikTokHandle = normalizeHandle(form.tiktok_handle);

  useEffect(() => {
    if (form.owner_admin_id || contentManagers.length === 0) return;
    setForm((current) => ({ ...current, owner_admin_id: contentManagers[0]?.id ?? '' }));
  }, [contentManagers, form.owner_admin_id]);

  const handleSubmit = async () => {
    if (!canSubmit || creating) return;

    setSubmitStatus(
      normalizedTikTokHandle
        ? 'Skapar demo, kundprofil och hamtar TikTok-historik...'
        : 'Skapar demo och kundprofil...',
    );

    try {
      const result = await createDemo.mutateAsync({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        tiktok_handle: normalizedTikTokHandle,
        proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
        proposed_price_ore: parseOptionalSekToOre(form.proposed_price_sek),
        owner_admin_id: form.owner_admin_id || null,
        game_plan: null,
        game_plan_html: null,
        game_plan_generation_context: {},
        game_plan_source: null,
        preview_notes: null,
        prepare_studio: true,
        sync_tiktok_history: Boolean(normalizedTikTokHandle),
        status: 'draft',
        lost_reason: null,
      }) as CreateDemoResult;

      await onCreated(result);
      onClose();
    } catch {
      setSubmitStatus(null);
    }
  };

  return (
    <AdminFormDialog
      open
      onClose={onClose}
      title={demosCopy.createDialogTitle}
      description={demosCopy.createDescription}
      error={createDemo.error instanceof Error ? createDemo.error.message : null}
      size="lg"
      loading={creating}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={creating}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || creating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {creating
              ? normalizedTikTokHandle
                ? demosCopy.createDialogSubmittingWithSync
                : demosCopy.createDialogSubmitting
              : demosCopy.createDialogSubmit}
          </button>
        </>
      }
    >
      <div className="space-y-5">
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
              autoFocus
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
          <AdminField label={demosCopy.createPriceMonthlySek} htmlFor="proposed_price_sek">
            <input
              id="proposed_price_sek"
              value={form.proposed_price_sek}
              onChange={(event) =>
                setForm((current) => ({ ...current, proposed_price_sek: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              inputMode="numeric"
              placeholder="12000"
            />
          </AdminField>
        </div>

        <AdminField label={demosCopy.ownerLabel} htmlFor="owner_admin_id">
          <select
            id="owner_admin_id"
            value={form.owner_admin_id}
            onChange={(event) =>
              setForm((current) => ({ ...current, owner_admin_id: event.target.value }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">{demosCopy.ownerPlaceholder}</option>
            {contentManagers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </AdminField>

        <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          {demosCopy.gamePlanNextStepHint}
        </p>

        {submitStatus ? (
          <div
            className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{submitStatus}</span>
          </div>
        ) : null}
      </div>
    </AdminFormDialog>
  );
}

function normalizeHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('@')) return trimmed.slice(1).split('/')[0] ?? null;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('tiktok.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const handlePart = parts.find((part) => part.startsWith('@'));
      if (handlePart) return handlePart.slice(1);
      return parts[0]?.replace('@', '') || null;
    }
  } catch {
    // Treat non-URL input as a plain handle below.
  }
  return trimmed.replace('@', '').split('/')[0] ?? null;
}

function parseOptionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalSekToOre(value: string) {
  const trimmed = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}
