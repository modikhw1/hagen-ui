'use client';

import React, { useState } from 'react';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { GamePlanEditor } from '@/components/gameplan-editor/GamePlanEditor';
import { getCustomerNoteTypeMeta } from '@/lib/customer-notes';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CMIdentity, GamePlanSectionProps } from './feedTypes';
import { GamePlanAiSheet } from './GamePlanAiSheet';

const GAME_PLAN_STARTER_TEMPLATE = [
  '<h3>Kundprofil</h3>',
  '<p>[Beskriv kunden, deras nisch, målgrupp och plattformshistorik.]</p>',
  '<h3>Ton och röst</h3>',
  '<p>[Vilken känsla ska innehållet ha? Vad ska det inte vara?]</p>',
  '<h3>Begränsningar</h3>',
  '<p>[Vad ska alltid eller aldrig finnas med?]</p>',
  '<h3>Fokus just nu</h3>',
  '<p>[Vad är den strategiska prioriteten den här perioden?]</p>',
].join('');

function renderCmBadge(identity: CMIdentity): React.ReactNode {
  const initials = identity.name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {identity.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.avatarUrl}
          alt={identity.name}
          style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: identity.color || '#6B4423',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
      )}
      <span style={{ fontSize: 12 }}>{identity.name}</span>
    </span>
  );
}

function buttonBase(background: string, color: string, border = 'none') {
  return {
    padding: '8px 14px',
    background,
    color,
    border,
    borderRadius: LeTrendRadius.md,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;
}

export function GamePlanSection({
  customerId,
  notes,
  customerName,
  aiDefaults,
  gamePlanHtml,
  gamePlanSummary,
  setGamePlanHtml,
  editingGamePlan,
  setEditingGamePlan,
  loadingGamePlan,
  savingGamePlan,
  gamePlanError,
  gamePlanSaveMessage,
  generatingGamePlanAi,
  hasUnsavedGamePlanChanges,
  handleReloadGamePlan,
  handleSaveGamePlan,
  handleCancelGamePlanEdit,
  handleGenerateGamePlanAi,
  newNoteContent,
  setNewNoteContent,
  addingNote,
  handleAddNote,
  handleUpdateNote,
  handleDeleteNote,
  parseMarkdownLinks,
  formatDateTime,
  cmDisplayNames,
}: GamePlanSectionProps) {
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const sourceLabel =
    gamePlanSummary?.source === 'customer_game_plans'
      ? 'Aktuell'
      : gamePlanSummary?.source === 'legacy_customer_profiles'
        ? 'Äldre'
        : 'Tom';

  return (
    <div
      style={{
        background: LeTrendColors.surfaceCard,
        borderRadius: 12,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`,
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: LeTrendColors.brownInk,
              margin: 0,
            }}
          >
            Game Plan
          </h2>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!editingGamePlan ? (
              <button
                type="button"
                onClick={() => void handleReloadGamePlan(true)}
                disabled={loadingGamePlan}
                style={{
                  ...buttonBase('#FFFFFF', LeTrendColors.brownInk, `1px solid ${LeTrendColors.border}`),
                  cursor: loadingGamePlan ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingGamePlan ? 'Laddar...' : 'Ladda om'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowAiSheet(true)}
              disabled={generatingGamePlanAi}
              style={{
                ...buttonBase('#FFFFFF', LeTrendColors.brownLight, `1px solid ${LeTrendColors.border}`),
                cursor: generatingGamePlanAi ? 'not-allowed' : 'pointer',
              }}
            >
              {generatingGamePlanAi ? 'Genererar...' : 'Generera utkast'}
            </button>

            {!editingGamePlan ? (
              <button
                type="button"
                onClick={() => {
                  if (!gamePlanHtml.trim()) {
                    setGamePlanHtml(GAME_PLAN_STARTER_TEMPLATE);
                  }
                  setEditingGamePlan(true);
                }}
                style={buttonBase(LeTrendColors.brownLight, '#fff')}
              >
                {gamePlanHtml.trim() ? 'Redigera' : 'Starta Game Plan'}
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span
            style={{
              padding: '5px 10px',
              borderRadius: LeTrendRadius.pill,
              background: LeTrendColors.surfaceHighlight,
              color: LeTrendColors.textMuted,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
            title={customerName ? `${customerName} • ${sourceLabel}` : sourceLabel}
          >
            {sourceLabel}
          </span>
          {gamePlanSummary?.updated_at ? (
            <span style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
              Sparad {formatDateTime(gamePlanSummary.updated_at)}
            </span>
          ) : null}
          {hasUnsavedGamePlanChanges ? (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: LeTrendRadius.pill,
                background: LeTrendColors.warningLight,
                color: LeTrendColors.warningText,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Ej sparade ändringar
            </span>
          ) : null}
        </div>

        {gamePlanSummary?.source === 'legacy_customer_profiles' && !editingGamePlan ? (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: LeTrendColors.warningLight,
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: LeTrendColors.warningText,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Det här dokumentet använder en äldre lagringsmetod. Nästa gång du sparar uppgraderas det automatiskt.
          </div>
        ) : null}

        {gamePlanError ? (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: LeTrendColors.errorLight,
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: LeTrendColors.errorText,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {gamePlanError}
          </div>
        ) : null}

        {!editingGamePlan && gamePlanSaveMessage && !gamePlanError ? (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: LeTrendColors.successLight,
              border: '1px solid rgba(16, 185, 129, 0.2)',
              color: '#047857',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {gamePlanSaveMessage}
          </div>
        ) : null}

        {editingGamePlan ? (
          <div>
            <GamePlanEditor initialHtml={gamePlanHtml} onChange={setGamePlanHtml} isFullscreen={false} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void handleSaveGamePlan()}
                disabled={savingGamePlan || !hasUnsavedGamePlanChanges}
                style={{
                  ...buttonBase(
                    savingGamePlan || !hasUnsavedGamePlanChanges ? LeTrendColors.textMuted : LeTrendColors.success,
                    '#fff',
                  ),
                  cursor: savingGamePlan || !hasUnsavedGamePlanChanges ? 'not-allowed' : 'pointer',
                }}
              >
                {savingGamePlan ? 'Sparar...' : hasUnsavedGamePlanChanges ? 'Spara ändringar' : 'Inga ändringar'}
              </button>
              <button
                type="button"
                onClick={handleCancelGamePlanEdit}
                disabled={savingGamePlan}
                style={{
                  ...buttonBase('#FFFFFF', LeTrendColors.brownInk, `1px solid ${LeTrendColors.border}`),
                  cursor: savingGamePlan ? 'not-allowed' : 'pointer',
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div style={{ minHeight: 100 }}>
            {gamePlanHtml.trim() ? (
              <GamePlanDisplay html={gamePlanHtml} />
            ) : (
              <div
                style={{
                  padding: '20px 18px',
                  borderRadius: LeTrendRadius.md,
                  background: LeTrendColors.surfaceMuted,
                  border: `1px dashed ${LeTrendColors.border}`,
                  color: LeTrendColors.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.6,
                  textAlign: 'center',
                }}
              >
                Ingen Game Plan skriven än. Starta från mallen eller generera ett utkast för att komma igång.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: LeTrendColors.brownInk,
              margin: 0,
            }}
          >
            Noteringar
          </h3>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            value={newNoteContent}
            onChange={(event) => setNewNoteContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleAddNote();
              }
            }}
            placeholder="Skriv en observation..."
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.borderStrong}`,
              fontSize: 14,
              color: LeTrendColors.editorBody,
              boxSizing: 'border-box',
            }}
          />
          {addingNote ? (
            <div style={{ marginTop: 8, fontSize: 12, color: LeTrendColors.textMuted }}>
              Sparar notering...
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 24,
                color: LeTrendColors.textSecondary,
                fontSize: 14,
                lineHeight: 1.6,
                background: LeTrendColors.surfaceMuted,
                borderRadius: LeTrendRadius.md,
                border: `1px dashed ${LeTrendColors.border}`,
              }}
            >
              Inga noteringar ännu. Skriv en snabb observation ovan.
            </div>
          ) : (
            notes.map((note) => {
              const noteMeta = getCustomerNoteTypeMeta(note.note_type || 'update');
              const isEditing = editingNoteId === note.id;
              const showNoteActions = isEditing || hoveredNoteId === note.id;

              return (
                <div
                  key={note.id}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId((current) => (current === note.id ? null : current))}
                  style={{
                    background: LeTrendColors.surfaceMuted,
                    borderRadius: LeTrendRadius.md,
                    padding: 12,
                    border: `1px solid ${LeTrendColors.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: LeTrendRadius.pill,
                          background: noteMeta.bg,
                          color: noteMeta.text,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {noteMeta.label}
                      </span>
                      <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                        {formatDateTime(note.created_at)}
                      </div>
                      <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                        av{' '}
                        {note.cm_id && cmDisplayNames[note.cm_id]
                          ? renderCmBadge(cmDisplayNames[note.cm_id]!)
                          : (note.cm_id || 'okand')}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 12,
                        opacity: showNoteActions ? 1 : 0,
                        pointerEvents: showNoteActions ? 'auto' : 'none',
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setEditingNoteContent(note.content);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: LeTrendColors.textSecondary,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        Redigera
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteNote(note.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        value={editingNoteContent}
                        onChange={(event) => setEditingNoteContent(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleUpdateNote(note.id, editingNoteContent);
                            setEditingNoteId(null);
                            setEditingNoteContent('');
                          }
                          if (event.key === 'Escape') {
                            setEditingNoteId(null);
                            setEditingNoteContent('');
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.borderStrong}`,
                          fontSize: 14,
                          color: LeTrendColors.editorBody,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => {
                            void handleUpdateNote(note.id, editingNoteContent);
                            setEditingNoteId(null);
                            setEditingNoteContent('');
                          }}
                          style={buttonBase(LeTrendColors.brownLight, '#fff')}
                        >
                          Spara
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingNoteContent('');
                          }}
                          style={buttonBase('#FFFFFF', LeTrendColors.brownInk, `1px solid ${LeTrendColors.border}`)}
                      >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onDoubleClick={() => {
                        setEditingNoteId(note.id);
                        setEditingNoteContent(note.content);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setEditingNoteId(note.id);
                          setEditingNoteContent(note.content);
                        }
                      }}
                      style={{
                        fontSize: 14,
                        color: LeTrendColors.editorBody,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        cursor: 'text',
                      }}
                    >
                      {parseMarkdownLinks(note.content)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showAiSheet ? (
        <GamePlanAiSheet
          customerId={customerId}
          loading={generatingGamePlanAi}
          initialValues={aiDefaults}
          onClose={() => setShowAiSheet(false)}
          onGenerate={handleGenerateGamePlanAi}
        />
      ) : null}
    </div>
  );
}
