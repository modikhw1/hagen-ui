'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { useCreateDemo } from '@/hooks/admin/useDemos';
import { useTeamLite } from '@/hooks/admin/useTeamLite';
import { apiClient } from '@/lib/admin/api-client';
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
  proposed_price_sek: string;
  owner_admin_id: string;
  game_plan: string;
  game_plan_html: string;
  game_plan_source: string;
  preview_notes: string;
  strategy_view: string;
  opportunities: string;
  letrend_fit: string;
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
    game_plan: '',
    game_plan_html: '',
    game_plan_source: '',
    preview_notes: '',
    strategy_view: '',
    opportunities: '',
    letrend_fit: '',
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
  const [gamePlanMessage, setGamePlanMessage] = useState<string | null>(null);
  const [gamePlanError, setGamePlanError] = useState<string | null>(null);
  const [generatingGamePlan, setGeneratingGamePlan] = useState(false);
  const createDemo = useCreateDemo();
  const { data: contentManagers = [] } = useTeamLite('content_manager');

  const canSubmit = useMemo(() => form.company_name.trim().length > 0, [form.company_name]);

  useEffect(() => {
    if (form.owner_admin_id || contentManagers.length === 0) return;
    setForm((current) => ({ ...current, owner_admin_id: contentManagers[0]?.id ?? '' }));
  }, [contentManagers, form.owner_admin_id]);

  const handleSubmit = async () => {
    if (!canSubmit || createDemo.isPending) return;

    await createDemo.mutateAsync({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      tiktok_handle: normalizeHandle(form.tiktok_handle),
      proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
      proposed_price_ore: parseOptionalSekToOre(form.proposed_price_sek),
      owner_admin_id: form.owner_admin_id || null,
      game_plan: form.game_plan.trim() || null,
      game_plan_html: form.game_plan_html.trim() || null,
      game_plan_generation_context: buildGamePlanContext(form),
      game_plan_source: form.game_plan_source || null,
      preview_notes: form.preview_notes.trim() || null,
      status: 'draft',
      lost_reason: null,
    });

    await onCreated();
    onClose();
  };

  const handleGenerateGamePlan = async () => {
    if (!canSubmit || generatingGamePlan) return;

    setGeneratingGamePlan(true);
    setGamePlanMessage(null);
    setGamePlanError(null);

    try {
      const result = await apiClient.post('/api/admin/demos/game-plan/generate', {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        tiktok_handle: normalizeHandle(form.tiktok_handle),
        platform: 'TikTok',
        proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
        strategy_view: form.strategy_view.trim(),
        opportunities: form.opportunities.trim(),
        letrend_fit: form.letrend_fit.trim(),
      }) as {
        html?: string;
        plainText?: string;
        source?: string;
        model?: string;
        reason?: string;
      };

      const plainText = typeof result.plainText === 'string' ? result.plainText : '';
      const html = typeof result.html === 'string' ? result.html : '';
      if (!plainText && !html) {
        throw new Error('Tomt Game Plan-svar');
      }

      setForm((current) => ({
        ...current,
        game_plan: plainText || stripHtml(html),
        game_plan_html: html,
        game_plan_source: result.source ?? 'ai',
      }));
      setGamePlanMessage(demosCopy.gamePlanAiSuccess);
    } catch (err) {
      setGamePlanError(err instanceof Error ? err.message : 'Kunde inte generera Game Plan-utkast.');
    } finally {
      setGeneratingGamePlan(false);
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

        <div className="grid gap-3 sm:grid-cols-2">
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
          <AdminField label={demosCopy.previewNotesLabel} htmlFor="preview_notes">
            <textarea
              id="preview_notes"
              value={form.preview_notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, preview_notes: event.target.value }))
              }
              className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder={demosCopy.previewNotesPlaceholder}
            />
          </AdminField>
        </div>

        <AdminField
          label={demosCopy.gamePlanLabel}
          htmlFor="game_plan"
          hint={demosCopy.gamePlanHelp}
        >
          <div className="space-y-2">
            <textarea
              id="game_plan"
              value={form.game_plan}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  game_plan: event.target.value,
                  game_plan_html: '',
                  game_plan_source: '',
                }))
              }
              className="min-h-40 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder={demosCopy.gamePlanPlaceholder}
            />
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                AI-underlag
              </div>
              <div className="grid gap-3">
                <AdminField label={demosCopy.strategyViewLabel} htmlFor="strategy_view">
                  <textarea
                    id="strategy_view"
                    value={form.strategy_view}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, strategy_view: event.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.strategyViewPlaceholder}
                  />
                </AdminField>
                <AdminField label={demosCopy.opportunitiesLabel} htmlFor="opportunities">
                  <textarea
                    id="opportunities"
                    value={form.opportunities}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, opportunities: event.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.opportunitiesPlaceholder}
                  />
                </AdminField>
                <AdminField label={demosCopy.letrendFitLabel} htmlFor="letrend_fit">
                  <textarea
                    id="letrend_fit"
                    value={form.letrend_fit}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, letrend_fit: event.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.letrendFitPlaceholder}
                  />
                </AdminField>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleGenerateGamePlan()}
                  disabled={!canSubmit || generatingGamePlan}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                >
                  {generatingGamePlan ? demosCopy.gamePlanAiGenerating : demosCopy.gamePlanAiButton}
                </button>
                {gamePlanMessage ? (
                  <span className="text-xs text-success">{gamePlanMessage}</span>
                ) : null}
                {gamePlanError ? (
                  <span className="text-xs text-destructive">{gamePlanError}</span>
                ) : null}
              </div>
            </div>
          </div>
        </AdminField>

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

function parseOptionalSekToOre(value: string) {
  const trimmed = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function buildGamePlanContext(form: FormState) {
  return {
    strategy_view: form.strategy_view.trim(),
    opportunities: form.opportunities.trim(),
    letrend_fit: form.letrend_fit.trim(),
    source: form.game_plan_source || null,
  };
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
