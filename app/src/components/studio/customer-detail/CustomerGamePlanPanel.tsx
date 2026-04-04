import React from 'react';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { GamePlanEditor } from '@/components/gameplan-editor/GamePlanEditor';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerGamePlanSummary, CustomerNote } from '@/types/studio-v2';
import { CustomerNotesPanel } from './CustomerNotesPanel';

interface CustomerGamePlanPanelProps {
  notes: CustomerNote[];
  gamePlanHtml: string;
  gamePlanSummary: CustomerGamePlanSummary | null;
  setGamePlanHtml: (html: string) => void;
  editingGamePlan: boolean;
  setEditingGamePlan: (editing: boolean) => void;
  loadingGamePlan: boolean;
  savingGamePlan: boolean;
  gamePlanError: string | null;
  gamePlanSaveMessage: string | null;
  hasUnsavedGamePlanChanges: boolean;
  handleReloadGamePlan: (force?: boolean) => Promise<void>;
  handleSaveGamePlan: () => Promise<void>;
  handleCancelGamePlanEdit: () => void;
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  addingNote: boolean;
  handleAddNote: () => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  parseMarkdownLinks: (text: string) => React.ReactNode[] | string;
  formatDateTime: (dateStr: string) => string;
}

export function CustomerGamePlanPanel({
  notes,
  gamePlanHtml,
  gamePlanSummary,
  setGamePlanHtml,
  editingGamePlan,
  setEditingGamePlan,
  loadingGamePlan,
  savingGamePlan,
  gamePlanError,
  gamePlanSaveMessage,
  hasUnsavedGamePlanChanges,
  handleReloadGamePlan,
  handleSaveGamePlan,
  handleCancelGamePlanEdit,
  newNoteContent,
  setNewNoteContent,
  addingNote,
  handleAddNote,
  handleDeleteNote,
  parseMarkdownLinks,
  formatDateTime,
}: CustomerGamePlanPanelProps) {
  const sourceLabel =
    gamePlanSummary?.source === 'customer_game_plans'
      ? 'Primär lagring'
      : gamePlanSummary?.source === 'legacy_customer_profiles'
        ? 'Legacy-spegel'
        : 'Tomt dokument';

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: LeTrendRadius.lg,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`,
      }}
    >
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: '0 0 24px',
        }}
      >
        Game Plan
      </h2>

      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              margin: 0,
            }}
          >
            Strategiskt innehåll
          </h3>
          {!editingGamePlan && (
            <button
              onClick={() => void handleReloadGamePlan(true)}
              disabled={loadingGamePlan}
              style={{
                padding: '6px 12px',
                background: '#fff',
                color: LeTrendColors.brownDark,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: loadingGamePlan ? 'not-allowed' : 'pointer',
                marginRight: 8,
              }}
            >
              {loadingGamePlan ? 'Laddar...' : 'Ladda om'}
            </button>
          )}
          {!editingGamePlan && (
            <button
              onClick={() => setEditingGamePlan(true)}
              style={{
                padding: '6px 12px',
                background: LeTrendColors.brownLight,
                color: '#fff',
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Redigera
            </button>
          )}
        </div>

        <div
          style={{
            fontSize: 12,
            color: LeTrendColors.textMuted,
            marginBottom: 12,
          }}
        >
          Sparas via den nya Game Plan-boundaryn och speglas tillbaka till legacy-fältet bara för kompatibilitet.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: '#F7F2EC',
              color: LeTrendColors.brownDark,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {sourceLabel}
          </span>
          {gamePlanSummary?.updated_at && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: '#F7F2EC',
                color: LeTrendColors.textSecondary,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Senast sparad {formatDateTime(gamePlanSummary.updated_at)}
            </span>
          )}
          {hasUnsavedGamePlanChanges && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#92400e',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Ej sparade ändringar
            </span>
          )}
        </div>

        {gamePlanSummary?.source === 'legacy_customer_profiles' && !editingGamePlan && (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#92400e',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Dokumentet läses just nu från legacy-spegeln i kundprofilen. Nästa sparning skriver till
            {' '}
            <code>customer_game_plans</code>
            {' '}
            och fortsätter bara spegla tillbaka för kompatibilitet.
          </div>
        )}

        {gamePlanError && (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#b91c1c',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {gamePlanError}
          </div>
        )}

        {!editingGamePlan && gamePlanSaveMessage && !gamePlanError && (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              color: '#047857',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {gamePlanSaveMessage}
          </div>
        )}

        {editingGamePlan ? (
          <div>
            <GamePlanEditor initialHtml={gamePlanHtml} onChange={setGamePlanHtml} isFullscreen={false} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleSaveGamePlan}
                disabled={savingGamePlan || !hasUnsavedGamePlanChanges}
                style={{
                  padding: '10px 16px',
                  background:
                    savingGamePlan || !hasUnsavedGamePlanChanges
                      ? LeTrendColors.textMuted
                      : LeTrendColors.success,
                  color: '#fff',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingGamePlan || !hasUnsavedGamePlanChanges ? 'not-allowed' : 'pointer',
                }}
              >
                {savingGamePlan ? 'Sparar...' : hasUnsavedGamePlanChanges ? 'Spara ändringar' : 'Inga ändringar'}
              </button>
              <button
                onClick={handleCancelGamePlanEdit}
                disabled={savingGamePlan}
                style={{
                  padding: '10px 16px',
                  background: '#fff',
                  color: LeTrendColors.brownDark,
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingGamePlan ? 'not-allowed' : 'pointer',
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div style={{ minHeight: 100 }}>
            <GamePlanDisplay html={gamePlanHtml} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <CustomerNotesPanel
          notes={notes}
          newNoteContent={newNoteContent}
          setNewNoteContent={setNewNoteContent}
          addingNote={addingNote}
          handleAddNote={handleAddNote}
          handleDeleteNote={handleDeleteNote}
          parseMarkdownLinks={parseMarkdownLinks}
          formatDateTime={formatDateTime}
        />
      </div>
    </div>
  );
}
