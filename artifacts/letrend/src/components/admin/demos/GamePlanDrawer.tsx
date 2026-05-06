'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { useUpdateDemo } from '@/hooks/admin/useDemos';
import { apiClient } from '@/lib/admin/api-client';
import { demosCopy } from '@/lib/admin/copy/demos';

type Props = {
  open: boolean;
  onClose: () => void;
  demoId: string | null;
  initialValues?: {
    game_plan?: string | null;
    game_plan_html?: string | null;
    preview_notes?: string | null;
    strategy_view?: string | null;
    opportunities?: string | null;
    letrend_fit?: string | null;
    company_name?: string | null;
    contact_name?: string | null;
    tiktok_handle?: string | null;
    proposed_concepts_per_week?: number | null;
  };
  onSaved?: () => void;
};

type DrawerState = {
  game_plan: string;
  game_plan_html: string;
  game_plan_source: string;
  preview_notes: string;
  strategy_view: string;
  opportunities: string;
  letrend_fit: string;
};

function stateFromInitial(values: Props['initialValues']): DrawerState {
  return {
    game_plan: values?.game_plan ?? '',
    game_plan_html: values?.game_plan_html ?? '',
    game_plan_source: '',
    preview_notes: values?.preview_notes ?? '',
    strategy_view: values?.strategy_view ?? '',
    opportunities: values?.opportunities ?? '',
    letrend_fit: values?.letrend_fit ?? '',
  };
}

export default function GamePlanDrawer({ open, onClose, demoId, initialValues, onSaved }: Props) {
  if (!open || !demoId) return null;
  return (
    <GamePlanDrawerSession
      key={demoId}
      demoId={demoId}
      initialValues={initialValues}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function GamePlanDrawerSession({
  demoId,
  initialValues,
  onClose,
  onSaved,
}: Omit<Props, 'open'> & { demoId: string }) {
  const [form, setForm] = useState<DrawerState>(() => stateFromInitial(initialValues));
  const [aiExpanded, setAiExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateDemo = useUpdateDemo();
  const saving = updateDemo.isPending;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaveError(null);
    try {
      await updateDemo.mutateAsync({
        id: demoId,
        payload: {
          game_plan: form.game_plan.trim() || null,
          game_plan_html: form.game_plan_html.trim() || null,
          game_plan_source: form.game_plan_source || null,
          game_plan_generation_context: {
            strategy_view: form.strategy_view.trim(),
            opportunities: form.opportunities.trim(),
            letrend_fit: form.letrend_fit.trim(),
            source: form.game_plan_source || null,
          },
          preview_notes: form.preview_notes.trim() || null,
        },
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte spara.');
    }
  };

  const handleGenerateGamePlan = async () => {
    if (generating) return;
    setGenerating(true);
    setAiMessage(demosCopy.gamePlanAiGenerating);
    setAiError(null);

    try {
      const result = await apiClient.post('/api/admin/demos/game-plan/generate', {
        company_name: initialValues?.company_name?.trim() || 'Prospekt',
        contact_name: initialValues?.contact_name?.trim() || null,
        tiktok_handle: initialValues?.tiktok_handle ?? null,
        platform: 'TikTok',
        proposed_concepts_per_week: initialValues?.proposed_concepts_per_week ?? null,
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
      if (!plainText && !html) throw new Error('Tomt Game Plan-svar');

      setForm((current) => ({
        ...current,
        game_plan: plainText || stripHtml(html),
        game_plan_html: html,
        game_plan_source: result.source ?? 'ai',
      }));
      setAiMessage(demosCopy.gamePlanAiSuccess);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Kunde inte generera Game Plan-utkast.');
      setAiMessage(null);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,12,6,0.40)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={demosCopy.gamePlanDrawerTitle}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: 560,
          height: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          outline: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            padding: '20px 20px 0',
            borderBottom: '1px solid #e8e0d8',
            paddingBottom: 16,
            marginBottom: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1c0f08' }}>
              <span style={{ marginRight: 6 }}>✦</span>
              {demosCopy.gamePlanDrawerTitle}
            </div>
            <div style={{ fontSize: 11.5, color: '#8c7a6e', marginTop: 4, lineHeight: 1.4 }}>
              {demosCopy.gamePlanDrawerDescription}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: '1px solid #e8e0d8',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: '#8c7a6e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-5">
          <AdminField
            label={demosCopy.gamePlanLabel}
            htmlFor="gp_game_plan"
            hint={demosCopy.gamePlanHelp}
          >
            <textarea
              id="gp_game_plan"
              value={form.game_plan}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  game_plan: e.target.value,
                  game_plan_html: '',
                  game_plan_source: '',
                }))
              }
              className="min-h-40 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder={demosCopy.gamePlanPlaceholder}
            />
          </AdminField>

          <AdminField label={demosCopy.previewNotesLabel} htmlFor="gp_preview_notes">
            <textarea
              id="gp_preview_notes"
              value={form.preview_notes}
              onChange={(e) =>
                setForm((current) => ({ ...current, preview_notes: e.target.value }))
              }
              className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder={demosCopy.previewNotesPlaceholder}
            />
          </AdminField>

          <div className="rounded-lg border border-border bg-secondary/20">
            <button
              type="button"
              onClick={() => setAiExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                AI-underlag
              </span>
              {aiExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>

            {aiExpanded && (
              <div className="space-y-3 px-3 pb-3">
                <AdminField label={demosCopy.strategyViewLabel} htmlFor="gp_strategy_view">
                  <textarea
                    id="gp_strategy_view"
                    value={form.strategy_view}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, strategy_view: e.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.strategyViewPlaceholder}
                  />
                </AdminField>
                <AdminField label={demosCopy.opportunitiesLabel} htmlFor="gp_opportunities">
                  <textarea
                    id="gp_opportunities"
                    value={form.opportunities}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, opportunities: e.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.opportunitiesPlaceholder}
                  />
                </AdminField>
                <AdminField label={demosCopy.letrendFitLabel} htmlFor="gp_letrend_fit">
                  <textarea
                    id="gp_letrend_fit"
                    value={form.letrend_fit}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, letrend_fit: e.target.value }))
                    }
                    className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder={demosCopy.letrendFitPlaceholder}
                  />
                </AdminField>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleGenerateGamePlan()}
                    disabled={generating}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {generating ? demosCopy.gamePlanAiGenerating : demosCopy.gamePlanAiButton}
                  </button>
                  {aiMessage ? (
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      {aiMessage}
                    </span>
                  ) : null}
                  {aiError ? (
                    <span className="text-xs text-destructive">{aiError}</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {saveError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {saveError}
            </p>
          ) : null}
        </div>

        <div
          style={{
            borderTop: '1px solid #e8e0d8',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: '#fff',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {demosCopy.gamePlanDrawerSkip}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? demosCopy.saveInProgress : demosCopy.gamePlanDrawerSave}
          </button>
        </div>
      </div>
    </div>
  );
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
