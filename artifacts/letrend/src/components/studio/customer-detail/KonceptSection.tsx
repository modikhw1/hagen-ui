import React from 'react';
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import {
  getConceptPriority,
  isCollaborationCustomerConcept,
  isStudioAssignedCustomerConcept,
} from '@/lib/studio/customer-concepts';
import type { CustomerConcept } from '@/types/studio-v2';
import type { KonceptSectionProps } from './feedTypes';
import { ActiveConceptCard } from './ActiveConceptCard';
import { ProducedConceptCard } from './ProducedConceptCard';
import { CollaborationCard, type CollaborationCardData } from './CollaborationCard';
import {
  CollaborationModal,
  EMPTY_COLLABORATION_FORM,
  type CollaborationFormValues,
  type CollaborationScopeId,
} from './CollaborationModal';

function toCollaborationCardData(concept: CustomerConcept): CollaborationCardData {
  return {
    id: concept.id,
    partner_name: concept.partner_name,
    collaborator_reach: concept.collaborator_reach,
    collaborator_avatar_url: concept.collaborator_avatar_url,
    scope: (concept.scope ?? []).filter((s): s is CollaborationScopeId =>
      s === 'medverka' || s === 'skriva' || s === 'producera' || s === 'skriva_medverka'
    ),
    price: concept.price,
    confirmed: concept.confirmed,
    date: concept.result?.planned_publish_at ?? null,
    date_type: concept.collaboration_date_type ?? 'exact',
  };
}

function toCollaborationFormValues(concept: CustomerConcept): CollaborationFormValues {
  return {
    partner_name: concept.partner_name ?? '',
    collaborator_reach: concept.collaborator_reach ?? '',
    collaborator_avatar_url: concept.collaborator_avatar_url ?? '',
    scope: (concept.scope ?? []).filter((s): s is CollaborationScopeId =>
      s === 'medverka' || s === 'skriva' || s === 'producera' || s === 'skriva_medverka'
    ),
    date: concept.result?.planned_publish_at
      ? concept.result.planned_publish_at.slice(0, 10)
      : '',
    date_type: concept.collaboration_date_type ?? 'exact',
    price: concept.price != null ? String(concept.price) : '',
    confirmed: concept.confirmed,
    collaboration_note: concept.collaboration_note ?? '',
  };
}

function ProducedClipsSparkline({ concepts }: { concepts: CustomerConcept[] }) {
  const sorted = [...concepts]
    .filter((c) => c.result?.produced_at)
    .sort((a, b) => new Date(a.result.produced_at!).getTime() - new Date(b.result.produced_at!).getTime())
    .slice(-12);

  if (sorted.length < 2) return null;

  const W = 72;
  const H = 24;
  const gap = 2;
  const barW = Math.max(2, Math.floor((W - gap * (sorted.length - 1)) / sorted.length));

  const rates = sorted.map((c) => {
    const views = c.result.tiktok_views ?? 0;
    const likes = c.result.tiktok_likes ?? 0;
    const comments = c.result.tiktok_comments ?? 0;
    if (views === 0) return null;
    return ((likes + comments) / views) * 100;
  });

  const maxRate = Math.max(1, ...rates.filter((r): r is number => r != null));

  return (
    <svg width={W} height={H} style={{ flexShrink: 0, display: 'block' }} aria-label="Engagemang per producerat klipp">
      {sorted.map((c, i) => {
        const rate = rates[i];
        const pct = rate != null ? rate / maxRate : 0.08;
        const barH = Math.max(2, Math.round(pct * (H - 2)));
        const color = rate == null ? '#d1d5db' : rate >= 5 ? '#16a34a' : rate >= 2 ? '#d97706' : '#9ca3af';
        return (
          <rect
            key={c.id}
            x={i * (barW + gap)}
            y={H - barH}
            width={barW}
            height={barH}
            rx={1}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

interface SortableConceptRowProps {
  id: string;
  positionLabel: string;
  concept: CustomerConcept;
  tags: string[];
  onUpdateTags?: (conceptId: string, newTags: string[]) => Promise<void>;
  children: React.ReactNode;
}

function SortableConceptRow({
  id,
  positionLabel,
  concept,
  tags,
  onUpdateTags,
  children,
}: SortableConceptRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: 'relative',
  };

  const [editingTags, setEditingTags] = React.useState(false);
  const [tagInput, setTagInput] = React.useState('');
  const [savingTags, setSavingTags] = React.useState(false);

  const addTag = async (tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed || tags.includes(trimmed) || !onUpdateTags) return;
    setSavingTags(true);
    await onUpdateTags(id, [...tags, trimmed]);
    setSavingTags(false);
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    if (!onUpdateTags) return;
    setSavingTags(true);
    await onUpdateTags(id, tags.filter((t) => t !== tag));
    setSavingTags(false);
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Row header: drag handle + position label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          userSelect: 'none',
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            color: '#d1d5db',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 4,
            flexShrink: 0,
          }}
          title="Dra för att ändra ordning"
        >
          ⠿
        </div>

        {/* Position indicator */}
        {positionLabel && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: concept.placement.feed_order !== null ? '#1e40af' : '#9ca3af',
              background: concept.placement.feed_order !== null ? '#dbeafe' : '#f9fafb',
              border: `1px solid ${concept.placement.feed_order !== null ? '#bfdbfe' : '#e5e7eb'}`,
              borderRadius: 999,
              padding: '1px 7px',
              flexShrink: 0,
            }}
          >
            {positionLabel}
          </span>
        )}

        {/* Tags row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'wrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#374151',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 999,
                padding: '1px 7px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {tag}
              {onUpdateTags && (
                <button
                  type="button"
                  onClick={() => void removeTag(tag)}
                  disabled={savingTags}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: '#9ca3af',
                    fontSize: 11,
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}

          {onUpdateTags && !editingTags && (
            <button
              type="button"
              onClick={() => setEditingTags(true)}
              style={{
                fontSize: 11,
                color: '#9ca3af',
                background: 'none',
                border: '1px dashed #d1d5db',
                borderRadius: 999,
                padding: '1px 7px',
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >
              + Tagg
            </button>
          )}

          {onUpdateTags && editingTags && (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTag(tagInput);
                }
                if (e.key === 'Escape') {
                  setEditingTags(false);
                  setTagInput('');
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) {
                  void addTag(tagInput);
                } else {
                  setEditingTags(false);
                  setTagInput('');
                }
              }}
              placeholder="tagg-namn"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                border: `1px solid ${LeTrendColors.borderStrong}`,
                borderRadius: 999,
                outline: 'none',
                width: 90,
                background: '#fff',
              }}
            />
          )}
        </div>
      </div>

      {/* Concept card */}
      {children}
    </div>
  );
}

export const KonceptSection = React.memo(function KonceptSection({
  concepts,
  notes,
  expandedConceptId,
  setExpandedConceptId,
  handleDeleteConcept,
  handleChangeStatus,
  openConceptEditor,
  setShowAddConceptPanel,
  formatDate,
  getConceptDetails,
  onSendConcept,
  handleUpdateCmNote,
  handleUpdateWhyItFits,
  handleUpdateConceptTags,
  handleAddConceptNote,
  justAddedConceptId,
  justProducedConceptId,
  cmDisplayNames,
  brief,
  onNavigateToFeedSlot,
  onBeginFeedPlacement,
  onReorderConcepts,
  onCreateCollaboration,
  onUpdateCollaboration,
}: KonceptSectionProps) {
  const [showProducedSection, setShowProducedSection] = React.useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = React.useState<string[]>([]);
  const [batchUpdatingStatus, setBatchUpdatingStatus] = React.useState<string | null>(null);
  const [collabModal, setCollabModal] = React.useState<
    | { mode: 'create' }
    | { mode: 'edit'; conceptId: string; initial: CollaborationFormValues }
    | null
  >(null);
  const [savingCollab, setSavingCollab] = React.useState(false);

  const collaborationConcepts = React.useMemo(
    () => concepts.filter(isCollaborationCustomerConcept),
    [concepts]
  );

  React.useEffect(() => {
    if (justProducedConceptId) {
      setShowProducedSection(true);
    }
  }, [justProducedConceptId]);

  const assignmentConcepts = React.useMemo(
    () => concepts.filter(isStudioAssignedCustomerConcept),
    [concepts]
  );

  const activeConcepts = React.useMemo(
    () => assignmentConcepts
      .filter((concept) => concept.assignment.status !== 'produced' && concept.assignment.status !== 'archived')
      .sort((left, right) => getConceptPriority(right) - getConceptPriority(left)),
    [assignmentConcepts]
  );

  const producedConcepts = React.useMemo(
    () => assignmentConcepts
      .filter((concept) => concept.assignment.status === 'produced')
      .sort((left, right) => {
        const leftTime = left.result.produced_at ? new Date(left.result.produced_at).getTime() : 0;
        const rightTime = right.result.produced_at ? new Date(right.result.produced_at).getTime() : 0;
        return rightTime - leftTime;
      }),
    [assignmentConcepts]
  );

  // DnD ordered IDs — kept in sync with activeConcepts
  const [sortedIds, setSortedIds] = React.useState<string[]>(() =>
    activeConcepts.map((c) => c.id)
  );

  // Sync sorted IDs when activeConcepts changes (concepts added/removed).
  // Initialize prevIds to match sortedIds so the first effect run doesn't
  // treat all existing IDs as "new" additions (which caused duplicate keys).
  const prevIds = React.useRef<string[]>(activeConcepts.map((c) => c.id));
  React.useEffect(() => {
    const newIds = activeConcepts.map((c) => c.id);
    const added = newIds.filter((id) => !prevIds.current.includes(id));
    const removed = new Set(prevIds.current.filter((id) => !newIds.includes(id)));
    if (added.length > 0 || removed.size > 0) {
      setSortedIds((current) => [
        ...current.filter((id) => !removed.has(id)),
        ...added,
      ]);
    }
    prevIds.current = newIds;
  }, [activeConcepts]);

  const orderedActiveConcepts = React.useMemo(() => {
    const map = new Map(activeConcepts.map((c) => [c.id, c]));
    return sortedIds.map((id) => map.get(id)).filter((c): c is typeof activeConcepts[0] => c !== undefined);
  }, [sortedIds, activeConcepts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortedIds.indexOf(active.id as string);
      const newIndex = sortedIds.indexOf(over.id as string);
      const newOrder = arrayMove(sortedIds, oldIndex, newIndex);
      setSortedIds(newOrder);
      if (onReorderConcepts) {
        await onReorderConcepts(newOrder);
      }
    },
    [sortedIds, onReorderConcepts]
  );

  React.useEffect(() => {
    setSelectedConceptIds((current) =>
      current.filter((conceptId) => activeConcepts.some((concept) => concept.id === conceptId))
    );
  }, [activeConcepts]);

  const selectedActiveConcepts = React.useMemo(
    () => activeConcepts.filter((concept) => selectedConceptIds.includes(concept.id)),
    [activeConcepts, selectedConceptIds]
  );

  const toggleSelectedConcept = React.useCallback((conceptId: string) => {
    setSelectedConceptIds((current) =>
      current.includes(conceptId)
        ? current.filter((id) => id !== conceptId)
        : [...current, conceptId]
    );
  }, []);

  const applyBatchStatus = React.useCallback(async (status: 'draft' | 'sent' | 'archived') => {
    if (selectedConceptIds.length === 0 || batchUpdatingStatus) return;
    setBatchUpdatingStatus(status);
    try {
      for (const conceptId of selectedConceptIds) {
        await handleChangeStatus(conceptId, status);
      }
      setSelectedConceptIds([]);
    } finally {
      setBatchUpdatingStatus(null);
    }
  }, [batchUpdatingStatus, handleChangeStatus, selectedConceptIds]);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: LeTrendRadius.lg,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          gap: 12,
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: LeTrendColors.brownDark,
            margin: 0,
          }}
        >
          Koncept
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCreateCollaboration ? (
            <button
              type="button"
              onClick={() => setCollabModal({ mode: 'create' })}
              style={{
                padding: '10px 16px',
                background: '#fff',
                color: LeTrendColors.brownDark,
                border: `1.5px solid ${LeTrendColors.brownDark}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              data-testid="button-planera-samarbete"
            >
              <span>✦</span> Planera samarbete
            </button>
          ) : null}
          <button
            onClick={() => setShowAddConceptPanel(true)}
            style={{
              padding: '10px 16px',
              background: LeTrendColors.success,
              color: '#fff',
              border: 'none',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Lägg till koncept
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: 20,
          padding: '12px 14px',
          borderRadius: LeTrendRadius.md,
          background: LeTrendColors.surface,
          border: `1px solid ${LeTrendColors.border}`,
          color: LeTrendColors.textSecondary,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Varje rad är ett kunduppdrag i CM-flödet. Dra i handtaget (⠿) för att ändra ordning. Taggar synkroniseras med feedplanen.
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, lineHeight: 1.5 }}>
        {brief.tone || brief.current_focus || brief.constraints ? (
          <div style={{ color: LeTrendColors.textSecondary }}>
            <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
            {[brief.tone, brief.current_focus].filter(Boolean).join(' · ')}
            {brief.constraints ? (
              <span style={{ color: LeTrendColors.textMuted }}>
                {' · '}<strong style={{ color: LeTrendColors.brownDark }}>Begränsningar:</strong> {brief.constraints}
              </span>
            ) : null}
          </div>
        ) : (
          <em style={{ color: LeTrendColors.textMuted }}>
            Brief saknas. Fyll i kundbriefen i sidopanelen för bättre konceptpassning.
          </em>
        )}
      </div>

      {activeConcepts.length > 0 ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            background: '#faf7f2',
            border: `1px solid ${LeTrendColors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5 }}>
            {selectedActiveConcepts.length > 0
              ? `${selectedActiveConcepts.length} kunduppdrag markerade for batchstatus.`
              : 'Markera flera kunduppdrag for att uppdatera status i batch.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedConceptIds(activeConcepts.map((concept) => concept.id))}
              style={{
                border: `1px solid ${LeTrendColors.border}`,
                background: '#fff',
                color: LeTrendColors.brownDark,
                padding: '7px 10px',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Markera alla
            </button>
            <button
              type="button"
              disabled={selectedActiveConcepts.length === 0 || batchUpdatingStatus !== null}
              onClick={() => void applyBatchStatus('draft')}
              style={{
                border: 'none',
                background: selectedActiveConcepts.length > 0 ? '#f59e0b' : LeTrendColors.textMuted,
                color: '#fff',
                padding: '7px 10px',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: selectedActiveConcepts.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {batchUpdatingStatus === 'draft' ? 'Sparar...' : 'Satt som utkast'}
            </button>
            <button
              type="button"
              disabled={selectedActiveConcepts.length === 0 || batchUpdatingStatus !== null}
              onClick={() => void applyBatchStatus('sent')}
              style={{
                border: 'none',
                background: selectedActiveConcepts.length > 0 ? '#2563eb' : LeTrendColors.textMuted,
                color: '#fff',
                padding: '7px 10px',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: selectedActiveConcepts.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {batchUpdatingStatus === 'sent' ? 'Sparar...' : 'Satt som delad'}
            </button>
            <button
              type="button"
              disabled={selectedActiveConcepts.length === 0 || batchUpdatingStatus !== null}
              onClick={() => void applyBatchStatus('archived')}
              style={{
                border: `1px solid ${selectedActiveConcepts.length > 0 ? '#9ca3af' : LeTrendColors.border}`,
                background: '#fff',
                color: selectedActiveConcepts.length > 0 ? '#4b5563' : LeTrendColors.textMuted,
                padding: '7px 10px',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: selectedActiveConcepts.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {batchUpdatingStatus === 'archived' ? 'Sparar...' : 'Arkivera'}
            </button>
            {selectedConceptIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedConceptIds([])}
                style={{
                  border: `1px solid ${LeTrendColors.border}`,
                  background: '#fff',
                  color: LeTrendColors.textSecondary,
                  padding: '7px 10px',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Avmarkera
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {collaborationConcepts.length > 0 ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: LeTrendColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Samarbeten ({collaborationConcepts.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {collaborationConcepts.map((c) => (
              <CollaborationCard
                key={c.id}
                data={toCollaborationCardData(c)}
                onClick={() => setCollabModal({ mode: 'edit', conceptId: c.id, initial: toCollaborationFormValues(c) })}
                onDelete={() => void handleDeleteConcept(c.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeConcepts.length === 0 && producedConcepts.length === 0 && collaborationConcepts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: LeTrendColors.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>[ ]</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Inga kunduppdrag ännu
          </div>
          <div style={{ fontSize: 14 }}>
            Lägg till ett koncept från biblioteket för att skapa kundens arbetskopia.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* DnD-sortable active concepts */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
              {orderedActiveConcepts.map((concept, index) => {
                const feedOrder = concept.placement.feed_order;
                const positionLabel = feedOrder !== null
                  ? feedOrder === 0 ? 'Nu' : `+${feedOrder}`
                  : `#${index + 1}`;
                const tags = concept.markers.tags ?? [];

                return (
                  <SortableConceptRow
                    key={concept.id}
                    id={concept.id}
                    positionLabel={positionLabel}
                    concept={concept}
                    tags={tags}
                    onUpdateTags={handleUpdateConceptTags}
                  >
                    <ActiveConceptCard
                      concept={concept}
                      isExpanded={expandedConceptId === concept.id}
                      justAdded={justAddedConceptId === concept.id}
                      selected={selectedConceptIds.includes(concept.id)}
                      formatDate={formatDate}
                      getConceptDetails={getConceptDetails}
                      onToggleExpanded={() => setExpandedConceptId(expandedConceptId === concept.id ? null : concept.id)}
                      onToggleSelected={toggleSelectedConcept}
                      onDelete={handleDeleteConcept}
                      onChangeStatus={handleChangeStatus}
                      onOpenEditor={openConceptEditor}
                      onSendConcept={onSendConcept}
                      onUpdateCmNote={handleUpdateCmNote}
                      onUpdateWhyItFits={handleUpdateWhyItFits}
                      onAddConceptNote={handleAddConceptNote}
                      onNavigateToFeedSlot={onNavigateToFeedSlot}
                      onBeginFeedPlacement={onBeginFeedPlacement}
                      cmDisplayNames={cmDisplayNames}
                    />
                  </SortableConceptRow>
                );
              })}
            </SortableContext>
          </DndContext>

          {producedConcepts.length > 0 ? (
            <div style={{ marginTop: activeConcepts.length > 0 ? 8 : 0 }}>
              <button
                onClick={() => setShowProducedSection((current) => !current)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  background: 'none',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  textAlign: 'left',
                }}
              >
                <span style={{ flex: 1 }}>Producerade och publicerade ({producedConcepts.length})</span>
                <ProducedClipsSparkline concepts={producedConcepts} />
                <span style={{ fontSize: 11 }}>{showProducedSection ? '▲' : '▼'}</span>
              </button>

              {showProducedSection ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {producedConcepts.map((concept) => (
                    <ProducedConceptCard
                      key={concept.id}
                      concept={concept}
                      conceptNotes={notes.filter((note) => note.primary_customer_concept_id === concept.id)}
                      highlight={justProducedConceptId === concept.id}
                      formatDate={formatDate}
                      getConceptDetails={getConceptDetails}
                      onAddConceptNote={handleAddConceptNote}
                      cmDisplayNames={cmDisplayNames}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {collabModal ? (
        <CollaborationModal
          mode={collabModal.mode}
          initialValues={collabModal.mode === 'edit' ? collabModal.initial : EMPTY_COLLABORATION_FORM}
          saving={savingCollab}
          onClose={() => setCollabModal(null)}
          onSave={async (values) => {
            setSavingCollab(true);
            try {
              if (collabModal.mode === 'create') {
                if (onCreateCollaboration) await onCreateCollaboration(values);
              } else {
                if (onUpdateCollaboration) await onUpdateCollaboration(collabModal.conceptId, values);
              }
              setCollabModal(null);
            } finally {
              setSavingCollab(false);
            }
          }}
        />
      ) : null}
    </div>
  );
});
