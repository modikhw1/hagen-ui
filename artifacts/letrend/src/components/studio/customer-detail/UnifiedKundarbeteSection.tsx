'use client';

import React, { useState } from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import type { CMIdentity } from './feedTypes';
import type { CmTag } from '@/types/studio-v2';
import {
  isCollaborationCustomerConcept,
  isStudioAssignedCustomerConcept,
} from '@/lib/studio/customer-concepts';
import { getWorkspaceConceptDetails, getWorkspaceConceptTitle } from './shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedKundarbeteSectionProps {
  customerId: string;
  concepts: CustomerConcept[];
  expandedConceptId: string | null;
  setExpandedConceptId: (id: string | null) => void;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  handleDeleteConcept: (conceptId: string) => Promise<void>;
  handleChangeStatus: (conceptId: string, newStatus: CustomerConceptAssignmentStatus) => Promise<void>;
  handleUpdateConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  handleUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  handleUpdateConceptTags?: (conceptId: string, tags: string[]) => Promise<void>;
  handleMarkProduced: (conceptId: string) => Promise<void>;
  handleRemoveFromSlot: (conceptId: string) => Promise<void>;
  handleAssignToSlot: (conceptId: string, feedOrder: number) => Promise<void>;
  handleSwapFeedOrder: (conceptIdA: string, conceptIdB: string) => Promise<void>;
  openConceptEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  setShowAddConceptPanel: (show: boolean) => void;
  formatDate: (dateStr: string | null) => string;
  onSendConcept: (conceptId: string) => void;
  cmDisplayNames: Record<string, CMIdentity>;
  cmTags?: CmTag[];
  brief: { tone: string; constraints: string; current_focus: string };
  justAddedConceptId: string | null;
  justProducedConceptId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function feedOrderLabel(feedOrder: number | null): string {
  if (feedOrder === null) return 'Ej placerad';
  if (feedOrder === 0) return 'Nu';
  if (feedOrder > 0) return `Kommande +${feedOrder}`;
  return `Historik ${feedOrder}`;
}

function statusLabel(status: string): { text: string; color: string } {
  switch (status) {
    case 'draft': return { text: 'Utkast', color: '#6b7280' };
    case 'sent': return { text: 'Skickat', color: '#2563eb' };
    case 'produced': return { text: 'Producerat', color: '#16a34a' };
    case 'archived': return { text: 'Arkiverat', color: '#9ca3af' };
    default: return { text: status, color: '#6b7280' };
  }
}

// ---------------------------------------------------------------------------
// Concept Card
// ---------------------------------------------------------------------------

function ConceptCard({
  concept,
  isExpanded,
  onToggleExpand,
  getConceptDetails,
  handleUpdateConcept,
  handleChangeStatus,
  handleMarkProduced,
  handleRemoveFromSlot,
  handleAssignToSlot,
  handleSwapFeedOrder,
  handleDeleteConcept,
  handleUpdateCmNote,
  openConceptEditor,
  onSendConcept,
  formatDate,
  isHighlighted,
  concepts,
}: {
  concept: CustomerConcept;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  handleUpdateConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  handleChangeStatus: (conceptId: string, newStatus: CustomerConceptAssignmentStatus) => Promise<void>;
  handleMarkProduced: (conceptId: string) => Promise<void>;
  handleRemoveFromSlot: (conceptId: string) => Promise<void>;
  handleAssignToSlot: (conceptId: string, feedOrder: number) => Promise<void>;
  handleSwapFeedOrder: (conceptIdA: string, conceptIdB: string) => Promise<void>;
  handleDeleteConcept: (conceptId: string) => Promise<void>;
  handleUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  openConceptEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSendConcept: (conceptId: string) => void;
  formatDate: (dateStr: string | null) => string;
  isHighlighted: boolean;
  concepts: CustomerConcept[];
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(concept.cm_note ?? '');
  const [savingNote, setSavingNote] = useState(false);

  const details = isStudioAssignedCustomerConcept(concept)
    ? getConceptDetails(concept.concept_id ?? '')
    : undefined;
  const isCollab = isCollaborationCustomerConcept(concept);
  const title = isCollab
    ? (concept.partner_name || 'Samarbete')
    : getWorkspaceConceptTitle(concept, details);
  const status = statusLabel(concept.assignment?.status ?? 'draft');
  const feedOrder = concept.placement?.feed_order ?? null;
  const overrides = (concept.content_overrides ?? {}) as Record<string, string | undefined>;
  const hasScript = Boolean(overrides.script || details?.script_sv);
  const hasInstructions = Boolean(overrides.filming_instructions || details?.productionNotes_sv?.length);

  const neighborAbove = feedOrder !== null && feedOrder > 0
    ? concepts.find(c => c.placement?.feed_order === feedOrder - 1) : undefined;
  const neighborBelow = feedOrder !== null && feedOrder >= 0
    ? concepts.find(c => c.placement?.feed_order === feedOrder + 1) : undefined;

  return (
    <div
      style={{
        background: '#fff',
        border: `1.5px solid ${isHighlighted ? LeTrendColors.brownLight : '#e5e7eb'}`,
        borderRadius: LeTrendRadius.md,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={onToggleExpand}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: feedOrder !== null ? '#1e40af' : '#9ca3af',
          background: feedOrder !== null ? '#dbeafe' : '#f3f4f6',
          borderRadius: 999,
          padding: '2px 8px',
          flexShrink: 0,
        }}>
          {feedOrderLabel(feedOrder)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: LeTrendColors.brownDark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: status.color, fontWeight: 600, flexShrink: 0 }}>
          {status.text}
        </span>
        {hasScript && <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>📝</span>}
        <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
          {/* Metadata preview */}
          {details?.description_sv && (
            <p style={{ fontSize: 12, color: LeTrendColors.textSecondary, margin: '12px 0 0', lineHeight: 1.5 }}>
              {details.description_sv}
            </p>
          )}

          {/* Content fields summary */}
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {overrides.headline && (
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                Rubrik ✓
              </span>
            )}
            {hasScript && (
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                Manus ✓
              </span>
            )}
            {overrides.why_it_fits && (
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                Varför ✓
              </span>
            )}
            {hasInstructions && (
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                Instruktioner ✓
              </span>
            )}
          </div>

          {/* CM Note inline */}
          <div style={{ marginTop: 12 }}>
            {editingNote ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="CM-notering..."
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSavingNote(true);
                      void handleUpdateCmNote(concept.id, noteValue).finally(() => {
                        setSavingNote(false);
                        setEditingNote(false);
                      });
                    }
                    if (e.key === 'Escape') setEditingNote(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSavingNote(true);
                    void handleUpdateCmNote(concept.id, noteValue).finally(() => {
                      setSavingNote(false);
                      setEditingNote(false);
                    });
                  }}
                  disabled={savingNote}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: 'pointer' }}
                >
                  {savingNote ? '...' : 'Spara'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setNoteValue(concept.cm_note ?? ''); setEditingNote(true); }}
                style={{ fontSize: 11, color: LeTrendColors.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {concept.cm_note
                  ? <span style={{ color: LeTrendColors.textSecondary }}>📌 {concept.cm_note}</span>
                  : '+ Lägg till notering'}
              </button>
            )}
          </div>

          {/* TikTok stats if produced */}
          {concept.result?.tiktok_views != null && concept.result.tiktok_views > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: LeTrendColors.textMuted, display: 'flex', gap: 12 }}>
              <span>{concept.result.tiktok_views.toLocaleString('sv-SE')} visningar</span>
              {concept.result.tiktok_likes != null && <span>{concept.result.tiktok_likes.toLocaleString('sv-SE')} likes</span>}
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => openConceptEditor(concept.id)}
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', color: LeTrendColors.brownDark, fontWeight: 600 }}
            >
              Redigera
            </button>

            {feedOrder === null && (
              <button
                type="button"
                onClick={() => {
                  const maxPlaced = concepts
                    .filter(c => c.placement?.feed_order != null && (c.placement?.feed_order ?? 0) > 0)
                    .reduce((max, c) => Math.max(max, c.placement?.feed_order ?? 0), 0);
                  void handleAssignToSlot(concept.id, maxPlaced + 1);
                }}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#dbeafe', cursor: 'pointer', color: '#1e40af', fontWeight: 600 }}
              >
                Placera näst →
              </button>
            )}

            {feedOrder !== null && feedOrder >= 0 && concept.assignment?.status === 'draft' && (
              <button
                type="button"
                onClick={() => onSendConcept(concept.id)}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#dbeafe', cursor: 'pointer', color: '#1e40af', fontWeight: 600 }}
              >
                Skicka till kund
              </button>
            )}

            {concept.assignment?.status === 'sent' && (
              <button
                type="button"
                onClick={() => void handleMarkProduced(concept.id)}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#dcfce7', cursor: 'pointer', color: '#166534', fontWeight: 600 }}
              >
                Markera producerat
              </button>
            )}

            {neighborAbove && (
              <button type="button" onClick={() => void handleSwapFeedOrder(concept.id, neighborAbove.id)}
                style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', color: '#6b7280' }}>
                ↑
              </button>
            )}
            {neighborBelow && (
              <button type="button" onClick={() => void handleSwapFeedOrder(concept.id, neighborBelow.id)}
                style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', color: '#6b7280' }}>
                ↓
              </button>
            )}

            {feedOrder !== null && (
              <button
                type="button"
                onClick={() => void handleRemoveFromSlot(concept.id)}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid #fecaca`, background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}
              >
                Ta bort ur plan
              </button>
            )}

            <button
              type="button"
              onClick={() => { if (confirm('Ta bort koncept?')) void handleDeleteConcept(concept.id); }}
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid #fecaca`, background: '#fff', cursor: 'pointer', color: '#dc2626' }}
            >
              Radera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Group
// ---------------------------------------------------------------------------

function SectionGroup({ title, count, children, defaultOpen = true }: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: open ? 10 : 0,
          width: '100%',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: LeTrendColors.brownDark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontWeight: 600 }}>
          ({count})
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline Overview Bar
// ---------------------------------------------------------------------------

function TimelineOverviewBar({ concepts }: { concepts: CustomerConcept[] }) {
  const placed = concepts
    .filter(c => c.placement?.feed_order != null)
    .sort((a, b) => (a.placement?.feed_order ?? 0) - (b.placement?.feed_order ?? 0));

  if (placed.length === 0) return null;

  const minOrder = Math.min(...placed.map(c => c.placement?.feed_order ?? 0));
  const maxOrder = Math.max(...placed.map(c => c.placement?.feed_order ?? 0));
  const range = maxOrder - minOrder + 1;
  const slots = Array.from({ length: Math.min(range, 12) }, (_, i) => minOrder + i);

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '10px 16px',
      background: LeTrendColors.surface,
      borderRadius: LeTrendRadius.md,
      marginBottom: 16,
      alignItems: 'center',
      overflowX: 'auto',
    }}>
      <span style={{ fontSize: 10, color: LeTrendColors.textMuted, marginRight: 8, flexShrink: 0 }}>Plan:</span>
      {slots.map((order) => {
        const concept = placed.find(c => c.placement?.feed_order === order);
        const status = concept?.assignment?.status;
        const color = !concept ? '#e5e7eb'
          : status === 'produced' ? '#16a34a'
          : status === 'sent' ? '#2563eb'
          : '#d1d5db';
        const isCurrent = order === 0;
        return (
          <div
            key={order}
            title={concept ? getWorkspaceConceptTitle(concept, null) : `Slot ${order}`}
            style={{
              width: isCurrent ? 14 : 10,
              height: isCurrent ? 14 : 10,
              borderRadius: 999,
              background: color,
              border: isCurrent ? '2px solid #1e40af' : 'none',
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const UnifiedKundarbeteSection = React.memo(function UnifiedKundarbeteSection(props: UnifiedKundarbeteSectionProps) {
  const {
    concepts,
    expandedConceptId,
    setExpandedConceptId,
    getConceptDetails,
    handleDeleteConcept,
    handleChangeStatus,
    handleUpdateConcept,
    handleUpdateCmNote,
    handleMarkProduced,
    handleRemoveFromSlot,
    handleAssignToSlot,
    handleSwapFeedOrder,
    openConceptEditor,
    setShowAddConceptPanel,
    formatDate,
    onSendConcept,
    justAddedConceptId,
    justProducedConceptId,
  } = props;

  // Group concepts by placement state
  const unplaced = concepts.filter(c =>
    c.placement?.feed_order == null &&
    c.assignment?.status !== 'archived' &&
    !isCollaborationCustomerConcept(c)
  );
  const current = concepts.filter(c => c.placement?.feed_order === 0);
  const upcoming = concepts
    .filter(c => (c.placement?.feed_order ?? -1) > 0)
    .sort((a, b) => (a.placement?.feed_order ?? 0) - (b.placement?.feed_order ?? 0));
  const history = concepts
    .filter(c => (c.placement?.feed_order ?? 0) < 0)
    .sort((a, b) => (b.placement?.feed_order ?? 0) - (a.placement?.feed_order ?? 0));
  const collaborations = concepts.filter(c => isCollaborationCustomerConcept(c) && c.assignment?.status !== 'archived');

  const [showAllHistory, setShowAllHistory] = useState(false);
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);

  const renderCard = (concept: CustomerConcept) => (
    <ConceptCard
      key={concept.id}
      concept={concept}
      isExpanded={expandedConceptId === concept.id}
      onToggleExpand={() => setExpandedConceptId(expandedConceptId === concept.id ? null : concept.id)}
      getConceptDetails={getConceptDetails}
      handleUpdateConcept={handleUpdateConcept}
      handleChangeStatus={handleChangeStatus}
      handleMarkProduced={handleMarkProduced}
      handleRemoveFromSlot={handleRemoveFromSlot}
      handleAssignToSlot={handleAssignToSlot}
      handleSwapFeedOrder={handleSwapFeedOrder}
      handleDeleteConcept={handleDeleteConcept}
      handleUpdateCmNote={handleUpdateCmNote}
      openConceptEditor={openConceptEditor}
      onSendConcept={onSendConcept}
      formatDate={formatDate}
      isHighlighted={concept.id === justAddedConceptId || concept.id === justProducedConceptId}
      concepts={concepts}
    />
  );

  return (
    <div>
      <TimelineOverviewBar concepts={concepts} />

      <SectionGroup title="Nästa att göra" count={unplaced.length} defaultOpen={true}>
        {unplaced.map(renderCard)}
      </SectionGroup>

      <SectionGroup title="Nu" count={current.length} defaultOpen={true}>
        {current.map(renderCard)}
      </SectionGroup>

      <SectionGroup title="Kommande" count={upcoming.length} defaultOpen={true}>
        {upcoming.map(renderCard)}
      </SectionGroup>

      {collaborations.length > 0 && (
        <SectionGroup title="Samarbeten" count={collaborations.length} defaultOpen={true}>
          {collaborations.map(renderCard)}
        </SectionGroup>
      )}

      <SectionGroup title="Historik" count={history.length} defaultOpen={history.length > 0 && history.length <= 5}>
        {visibleHistory.map(renderCard)}
        {history.length > 5 && !showAllHistory && (
          <button
            type="button"
            onClick={() => setShowAllHistory(true)}
            style={{ fontSize: 11, color: LeTrendColors.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontStyle: 'italic' }}
          >
            Visa {history.length - 5} äldre...
          </button>
        )}
      </SectionGroup>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: `1px solid ${LeTrendColors.border}` }}>
        <button
          type="button"
          onClick={() => setShowAddConceptPanel(true)}
          style={{
            padding: '8px 14px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.brownLight}`,
            background: '#fff',
            color: LeTrendColors.brownDark,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Lägg till koncept
        </button>
      </div>

      {concepts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: LeTrendColors.textMuted }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Inga koncept ännu</div>
          <div style={{ fontSize: 12 }}>Ladda upp eller välj koncept från biblioteket för att komma igång.</div>
        </div>
      )}
    </div>
  );
});
