'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { StatusChip } from '@/components/studio-v2/StatusChip';
import {
  getNextCustomerConceptAssignmentStatus,
  getStudioFeedOrderLabel,
} from '@/lib/customer-concept-lifecycle';
import { resolveConceptContent, type ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import {
  getStudioCustomerConceptSourceConceptId,
  isConceptPlaced,
  isConceptShared,
} from '@/lib/studio/customer-concepts';
import type { CustomerConcept } from '@/types/studio-v2';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import type { TranslatedConcept } from '@/lib/translator';
import type { CMIdentity } from './feedTypes';
import { getWorkspaceConceptDetails, getWorkspaceConceptTitle } from './shared';

interface ActiveConceptCardProps {
  concept: CustomerConcept;
  isExpanded: boolean;
  justAdded: boolean;
  selected?: boolean;
  formatDate: (dateStr: string | null) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onToggleExpanded: () => void;
  onToggleSelected?: (conceptId: string) => void;
  onDelete: (conceptId: string) => Promise<void>;
  onChangeStatus: (conceptId: string, newStatus: CustomerConceptAssignmentStatus) => Promise<void>;
  onOpenEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSendConcept: (conceptId: string) => void;
  onUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  onUpdateWhyItFits: (conceptId: string, text: string) => Promise<void>;
  onAddConceptNote: (conceptId: string, content: string) => Promise<void>;
  onNavigateToFeedSlot?: (feedOrder: number) => void;
  onBeginFeedPlacement?: (conceptId: string) => void;
  cmDisplayNames: Record<string, CMIdentity>;
}

function formatWorkspaceShortId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? value : value.slice(0, 8);
}

function renderCmBadge(identity: CMIdentity): React.ReactNode {
  const initials = identity.name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {identity.avatarUrl ? (
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
            background: identity.color || '#4f46e5',
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

function getOperatorNextStepLabel(concept: CustomerConcept): string {
  if (concept.assignment.status === 'archived') {
    return 'Ingen aktiv nästa handling i CM-flödet.';
  }

  if (concept.assignment.status === 'produced' || concept.result.produced_at) {
    return concept.result.published_at
      ? 'Klippet är publicerat. Justera bara historiken om något ser fel ut.'
      : 'Klippet är producerat. Lägg in publicerat datum eller TikTok-länk när det är live.';
  }

  if (concept.assignment.status === 'sent') {
    if (concept.placement.feed_order === 0) {
      return 'Uppdraget ligger i nu-slot. Nästa steg är att markera det som gjort när klippet är filmat.';
    }

    if (typeof concept.placement.feed_order === 'number' && concept.placement.feed_order > 0) {
      return 'Uppdraget är delat och placerat. Håll slotten uppdaterad tills det når nu-slot.';
    }

    return 'Uppdraget är delat men inte placerat. Lägg det i planen när timingen är bestämd.';
  }

  if (typeof concept.placement.feed_order === 'number') {
    return concept.placement.feed_order === 0
      ? 'Uppdraget ligger i nu-slot. Dela det med kunden när det ska bli kundsynligt.'
      : 'Uppdraget ligger redan i planen. Dela det med kunden när timingen är rätt.';
  }

  return 'Redigera uppdraget och avgör om nästa steg är att dela det eller placera det i planen.';
}

function ConceptMetaBadges({
  concept,
  formatDate,
  onNavigateToFeedSlot,
}: {
  concept: CustomerConcept;
  formatDate: (dateStr: string | null) => string;
  onNavigateToFeedSlot?: (feedOrder: number) => void;
}) {
  const sourceConceptId = getStudioCustomerConceptSourceConceptId(concept);
  const metaBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: 999,
    background: '#fff',
    border: `1px solid ${LeTrendColors.border}`,
    fontSize: 10,
    fontWeight: 600,
    color: LeTrendColors.textSecondary,
    opacity: 0.8,
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      <span style={metaBadgeStyle}>
        Kunduppdrag {formatWorkspaceShortId(concept.id)}
      </span>
      <span style={metaBadgeStyle}>
        {sourceConceptId
          ? `Källa ${formatWorkspaceShortId(sourceConceptId) ?? sourceConceptId}`
          : 'Importerat historikklipp'}
      </span>
      {isConceptPlaced(concept) && typeof concept.placement.feed_order === 'number' ? (
        <button
          type="button"
          onClick={() => onNavigateToFeedSlot?.(concept.placement.feed_order!)}
          style={{
            ...metaBadgeStyle,
            cursor: onNavigateToFeedSlot ? 'pointer' : 'default',
            color: LeTrendColors.brownDark,
          }}
          title="Öppna feedslot"
        >
          I plan: {getStudioFeedOrderLabel(concept.placement.feed_order)}
        </button>
      ) : (
        <span style={metaBadgeStyle}>Ej placerad i plan</span>
      )}
      <span style={{ ...metaBadgeStyle, color: isConceptShared(concept) ? '#1d4ed8' : LeTrendColors.textSecondary }}>
        {concept.markers.shared_at ? `Delad ${formatDate(concept.markers.shared_at)}` : 'Inte delad ännu'}
      </span>
      {concept.updated_at ? (
        <span style={metaBadgeStyle}>Senast redigerad {formatDate(concept.updated_at)}</span>
      ) : null}
    </div>
  );
}

export function ActiveConceptCard({
  concept,
  isExpanded,
  justAdded,
  selected = false,
  formatDate,
  getConceptDetails,
  onToggleExpanded,
  onToggleSelected,
  onDelete,
  onChangeStatus,
  onOpenEditor,
  onSendConcept,
  onUpdateCmNote,
  onUpdateWhyItFits,
  onAddConceptNote,
  onNavigateToFeedSlot,
  onBeginFeedPlacement,
  cmDisplayNames,
}: ActiveConceptCardProps) {
  const details = getWorkspaceConceptDetails(concept, getConceptDetails);
  const resolved = resolveConceptContent(concept, details ?? null);
  const nextStatus = getNextCustomerConceptAssignmentStatus(concept.assignment.status);
  const assignmentNote = concept.markers.assignment_note ?? concept.cm_note ?? '';
  const [editingNote, setEditingNote] = React.useState(false);
  const [localNoteText, setLocalNoteText] = React.useState(assignmentNote);
  const [editingWhyItFits, setEditingWhyItFits] = React.useState(false);
  const [localWhyItFitsText, setLocalWhyItFitsText] = React.useState(concept.content.why_it_fits ?? '');
  const [addingConceptNote, setAddingConceptNote] = React.useState(false);
  const [localConceptNoteText, setLocalConceptNoteText] = React.useState('');
  const [savingConceptNote, setSavingConceptNote] = React.useState(false);
  const autoStartedRef = React.useRef(false);

  React.useEffect(() => {
    setLocalNoteText(assignmentNote);
  }, [assignmentNote]);

  React.useEffect(() => {
    setLocalWhyItFitsText(concept.content.why_it_fits ?? '');
  }, [concept.content.why_it_fits]);

  React.useEffect(() => {
    if (justAdded && !autoStartedRef.current && !assignmentNote) {
      autoStartedRef.current = true;
      setEditingNote(true);
    }
  }, [assignmentNote, justAdded]);

  const canBeginFeedPlacement =
    concept.assignment.status === 'draft' && concept.placement.feed_order === null;

  return (
    <article
      style={{
        background: justAdded ? '#fffaf1' : LeTrendColors.surface,
        borderRadius: LeTrendRadius.lg,
        padding: 16,
        border: `1px solid ${
          selected ? LeTrendColors.brownLight : justAdded ? '#d6b284' : LeTrendColors.border
        }`,
        boxShadow: justAdded ? '0 0 0 1px rgba(74,47,24,0.05)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {onToggleSelected ? (
                  <button
                    type="button"
                    onClick={() => onToggleSelected(concept.id)}
                    aria-pressed={selected}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: `1px solid ${selected ? LeTrendColors.brownLight : LeTrendColors.border}`,
                      background: selected ? LeTrendColors.brownLight : '#fff',
                      color: selected ? '#fff' : LeTrendColors.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title={selected ? 'Avmarkera for batchstatus' : 'Markera for batchstatus'}
                  >
                    {selected ? '✓' : ''}
                  </button>
                ) : null}
                <h3 style={{ fontSize: 16, fontWeight: 700, color: LeTrendColors.brownDark, margin: 0 }}>
                  {getWorkspaceConceptTitle(concept, details ?? null)}
                </h3>
                {typeof concept.placement.feed_order === 'number' ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToFeedSlot?.(concept.placement.feed_order!)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: `1px solid ${LeTrendColors.brownLight}`,
                      background: '#fff',
                      color: LeTrendColors.brownDark,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: onNavigateToFeedSlot ? 'pointer' : 'default',
                      flexShrink: 0,
                    }}
                    title={`Öppna ${getStudioFeedOrderLabel(concept.placement.feed_order)}`}
                  >
                    {concept.placement.feed_order}
                  </button>
                ) : null}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: LeTrendColors.brownDark, lineHeight: 1.5 }}>
                Nästa steg: {getOperatorNextStepLabel(concept)}
              </div>
            </div>

            <StatusChip
              status={concept.assignment.status}
              onClick={() => {
                if (!nextStatus) return;
                void onChangeStatus(concept.id, nextStatus);
              }}
              editable={Boolean(nextStatus)}
            />
          </div>

          <ConceptMetaBadges concept={concept} formatDate={formatDate} onNavigateToFeedSlot={onNavigateToFeedSlot} />

          {details?.vibeAlignments && details.vibeAlignments.length > 0 ? (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {details.vibeAlignments.map((vibe) => (
                <span
                  key={vibe}
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                  }}
                >
                  {vibe}
                </span>
              ))}
            </div>
          ) : null}

          {resolved.fit.whyItWorks_sv && !isExpanded ? (
            <div style={{ marginTop: 8, fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              <strong style={{ color: LeTrendColors.brownDark }}>Varför det funkar:</strong> {resolved.fit.whyItWorks_sv}
            </div>
          ) : null}

          {assignmentNote && !isExpanded ? (
            <div style={{ marginTop: 6, fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              <strong style={{ color: LeTrendColors.brownDark }}>CM:</strong> {assignmentNote}
            </div>
          ) : null}

          {!concept.content.why_it_fits && !isExpanded ? (
            <button
              type="button"
              onClick={() => onOpenEditor(concept.id, ['fit'])}
              style={{
                marginTop: 8,
                border: 'none',
                background: 'none',
                padding: 0,
                color: '#b45309',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Fyll i kundpassning →
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={onToggleExpanded} style={{ background: 'none', border: `1px solid ${LeTrendColors.border}`, padding: '6px 12px', borderRadius: LeTrendRadius.md, cursor: 'pointer', fontSize: 12, color: LeTrendColors.brownLight, fontWeight: 600 }}>
            {isExpanded ? 'Dölj' : 'Visa'}
          </button>
          <button onClick={() => onOpenEditor(concept.id)} style={{ background: LeTrendColors.brownLight, border: 'none', color: '#fff', padding: '6px 12px', borderRadius: LeTrendRadius.md, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Redigera
          </button>
          {concept.assignment.status === 'draft' ? (
            <button onClick={() => onSendConcept(concept.id)} style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: LeTrendRadius.md, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Kommunikation →
            </button>
          ) : null}
          {canBeginFeedPlacement && onBeginFeedPlacement ? (
            <button
              type="button"
              onClick={() => onBeginFeedPlacement(concept.id)}
              style={{
                background: '#0f766e',
                border: 'none',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: LeTrendRadius.md,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Placera i feed
            </button>
          ) : null}
          <button onClick={() => void onDelete(concept.id)} style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: LeTrendRadius.md, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Ta bort
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
            <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginBottom: 4 }}>Manus</div>
            <div style={{ fontSize: 14, color: LeTrendColors.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {resolved.script.script_sv || 'Inget manus tillagt'}
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>Passning till kunden</div>
                <div style={{ fontSize: 10, color: LeTrendColors.textMuted, marginTop: 1 }}>Syns hos kunden under &quot;Varfor det passar er&quot;</div>
              </div>
              {!editingWhyItFits ? (
                <button onClick={() => setEditingWhyItFits(true)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  {concept.content.why_it_fits ? 'Redigera' : 'Lägg till'}
                </button>
              ) : null}
            </div>
            {editingWhyItFits ? (
              <div>
                <textarea
                  value={localWhyItFitsText}
                  onChange={(event) => setLocalWhyItFitsText(event.target.value)}
                  rows={3}
                  placeholder="Varför passar det här konceptet just den här kunden?"
                  style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={async () => { await onUpdateWhyItFits(concept.id, localWhyItFitsText); setEditingWhyItFits(false); }} style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Spara
                  </button>
                  <button onClick={() => { setLocalWhyItFitsText(concept.content.why_it_fits ?? ''); setEditingWhyItFits(false); }} style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: concept.content.why_it_fits ? LeTrendColors.textPrimary : LeTrendColors.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {concept.content.why_it_fits || 'Ingen kundspecifik passning ännu.'}
              </div>
            )}
          </div>

          <div style={{ height: 10 }} />

          <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
            <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginBottom: 4 }}>Instruktioner</div>
            <div style={{ fontSize: 14, color: LeTrendColors.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {resolved.instructions.filming_instructions || 'Inga instruktioner tillagda'}
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>CM-notering</div>
              {!editingNote ? (
                <button onClick={() => setEditingNote(true)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0 }}>
                  Redigera
                </button>
              ) : null}
            </div>
            {editingNote ? (
              <div>
                <textarea
                  value={localNoteText}
                  onChange={(event) => setLocalNoteText(event.target.value)}
                  rows={3}
                  placeholder="Något att nämna kring timing, kontext eller nästa steg?"
                  style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={async () => { await onUpdateCmNote(concept.id, localNoteText); setEditingNote(false); if (justAdded && !concept.content.why_it_fits) setEditingWhyItFits(true); }} style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Spara
                  </button>
                  <button onClick={() => { setLocalNoteText(assignmentNote); setEditingNote(false); }} style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, color: assignmentNote ? LeTrendColors.textPrimary : LeTrendColors.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {assignmentNote || 'Ingen notering ännu.'}
                </div>
                {assignmentNote && concept.cm_id && cmDisplayNames[concept.cm_id] ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: LeTrendColors.textMuted }}>
                    av {renderCmBadge(cmDisplayNames[concept.cm_id]!)}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ height: 10 }} />

          <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>Notering</div>
                <div style={{ fontSize: 10, color: LeTrendColors.textMuted, marginTop: 1 }}>Syns i kundens flöde som en uppdatering</div>
              </div>
              {!addingConceptNote ? (
                <button onClick={() => setAddingConceptNote(true)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  Lägg till
                </button>
              ) : null}
            </div>
            {addingConceptNote ? (
              <div>
                <textarea
                  value={localConceptNoteText}
                  onChange={(event) => setLocalConceptNoteText(event.target.value)}
                  rows={3}
                  placeholder="Vad vill du notera kring detta koncept just nu?"
                  style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={async () => {
                      if (!localConceptNoteText.trim() || savingConceptNote) return;
                      setSavingConceptNote(true);
                      await onAddConceptNote(concept.id, localConceptNoteText);
                      setSavingConceptNote(false);
                      setAddingConceptNote(false);
                      setLocalConceptNoteText('');
                    }}
                    disabled={savingConceptNote || !localConceptNoteText.trim()}
                    style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: localConceptNoteText.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    {savingConceptNote ? 'Sparar...' : 'Spara'}
                  </button>
                  <button onClick={() => { setAddingConceptNote(false); setLocalConceptNoteText(''); }} style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Avbryt
                  </button>
                </div>
              </div>
            ) : null}
          </div>

        </div>
      ) : null}
    </article>
  );
}
