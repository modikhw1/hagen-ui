'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { useUpdateDemo } from '@/hooks/admin/useDemos';
import { useTeamLite } from '@/hooks/admin/useTeamLite';
import { demosCopy } from '@/lib/admin/copy/demos';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';

type Props = {
  demo: DemoCardDto | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
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

function stateFromDemo(demo: DemoCardDto): FormState {
  return {
    company_name: demo.companyName,
    contact_name: demo.contactName ?? '',
    contact_email: demo.contactEmail ?? '',
    tiktok_handle: demo.tiktokHandle ? `@${demo.tiktokHandle}` : '',
    proposed_concepts_per_week: demo.proposedConceptsPerWeek?.toString() ?? '',
    proposed_price_sek:
      demo.proposedPriceOre == null ? '' : String(Math.round(demo.proposedPriceOre / 100)),
    owner_admin_id: demo.ownerAdminId ?? '',
  };
}

export default function EditDemoDialog({ demo, open, onClose, onSaved }: Props) {
  if (!open || !demo) return null;
  return <EditDemoDialogSession key={demo.id} demo={demo} onClose={onClose} onSaved={onSaved} />;
}

function EditDemoDialogSession({
  demo,
  onClose,
  onSaved,
}: Omit<Props, 'open'> & { demo: DemoCardDto }) {
  const [form, setForm] = useState<FormState>(() => stateFromDemo(demo));
  const updateDemo = useUpdateDemo();
  const { data: teamMembers = [] } = useTeamLite();
  const contentManagers = useMemo(
    () =>
      teamMembers.filter(
        (member) => member.role === 'content_manager' || member.role === 'admin',
      ),
    [teamMembers],
  );
  const canSubmit = form.company_name.trim().length > 0;
  const saving = updateDemo.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    await updateDemo.mutateAsync({
      id: demo.id,
      payload: {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        tiktok_handle: normalizeHandle(form.tiktok_handle),
        proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
        proposed_price_ore: parseOptionalSekToOre(form.proposed_price_sek),
        owner_admin_id: form.owner_admin_id || null,
      },
    });
    await onSaved();
    onClose();
  };

  return (
    <AdminFormDialog
      open
      onClose={onClose}
      title={demosCopy.editDialogTitle}
      description={demosCopy.editDescription}
      error={updateDemo.error instanceof Error ? updateDemo.error.message : null}
      loading={saving}
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? demosCopy.saveInProgress : demosCopy.editDialogSubmit}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.companyLabelRequired} htmlFor="edit_company_name">
            <input
              id="edit_company_name"
              value={form.company_name}
              onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </AdminField>
          <AdminField label={demosCopy.contactLabel} htmlFor="edit_contact_name">
            <input
              id="edit_contact_name"
              value={form.contact_name}
              onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </AdminField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.emailLabel} htmlFor="edit_contact_email">
            <input
              id="edit_contact_email"
              value={form.contact_email}
              onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              type="email"
            />
          </AdminField>
          <AdminField label={demosCopy.tiktokLabel} htmlFor="edit_tiktok_handle">
            <input
              id="edit_tiktok_handle"
              value={form.tiktok_handle}
              onChange={(event) => setForm((current) => ({ ...current, tiktok_handle: event.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="@konto"
            />
          </AdminField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.conceptsPerWeekLabel} htmlFor="edit_concepts_per_week">
            <input
              id="edit_concepts_per_week"
              value={form.proposed_concepts_per_week}
              onChange={(event) =>
                setForm((current) => ({ ...current, proposed_concepts_per_week: event.target.value }))
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              inputMode="numeric"
            />
          </AdminField>
          <AdminField label={demosCopy.createPriceMonthlySek} htmlFor="edit_price">
            <input
              id="edit_price"
              value={form.proposed_price_sek}
              onChange={(event) => setForm((current) => ({ ...current, proposed_price_sek: event.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              inputMode="numeric"
            />
          </AdminField>
        </div>

        <AdminField label={demosCopy.ownerLabel} htmlFor="edit_owner_admin_id">
          <select
            id="edit_owner_admin_id"
            value={form.owner_admin_id}
            onChange={(event) => setForm((current) => ({ ...current, owner_admin_id: event.target.value }))}
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
