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
import { CollaborationConceptRow } from './CollaborationConceptRow';
import {
  CollaborationModal,
  EMPTY_COLLABORATION_FORM,
  type CollaborationFormValues,
  type CollaborationScopeId,
} from './CollaborationModal';
import { TagManager } from '@/features/studio/customer-workspace/components/TagManager';
import { buildFeedPlannerModel } from '@/lib/studio/planner';

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
  children: React.ReactNode;
}

function SortableConceptRow({
  id,
  positionLabel,
  concept,
  children,
}: SortableConceptRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          userSelect: 'none',
        }}
      >
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
      </div>
      {children}
    </div>
  );
}

export const KonceptSection = React.memo(function KonceptSection({
  concepts,
  notes,
  handleDeleteConcept,
  handleChangeStatus,
  setShowAddConceptPanel,
  formatDate,
  getConceptDetails,
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
  cmTags = [],
  showTagManager,
  setShowTagManager,
  refreshCmTags,
  libraryAssignmentCounts = {},
  libraryAssignmentCmIds = {},
  onPatchConcept,
}: KonceptSectionProps) {
  const [showProducedSection, setShowProducedSection] = React.useState(false);
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

  const activeCollaborationConcepts = React.useMemo(
    () => collaborationConcepts.filter(
      (c) => c.assignment.status !== 'produced' && c.assignment.status !== 'archived'
    ),
    [collaborationConcepts]
  );

  const plannerOrder = React.useMemo(() => {
    const model = buildFeedPlannerModel({ concepts });
    return [model.currentCard, ...model.upcomingCards]
      .filter((card): card is NonNullable<typeof card> => card != null)
      .map((card, index) => ({ id: card.id, displayIndex: index }));
  }, [concepts]);

  const plannerOrderIndex = React.useMemo(
    () => new Map(plannerOrder.map((item, index) => [item.id, index])),
    [plannerOrder]
  );

  const plannerDisplayIndex = React.useMemo(
    () => new Map(plannerOrder.map((item) => [item.id, item.displayIndex])),
    [plannerOrder]
  );

  const allActiveSortable = React.useMemo(
    () => [...activeConcepts, ...activeCollaborationConcepts].sort((a, b) => {
      const plannerA = plannerOrderIndex.get(a.id);
      const plannerB = plannerOrderIndex.get(b.id);
      if (plannerA != null && plannerB != null) return plannerA - plannerB;
      if (plannerA != null) return -1;
      if (plannerB != null) return 1;
      const priorityDelta = getConceptPriority(b) - getConceptPriority(a);
      if (priorityDelta !== 0) return priorityDelta;
      return b.added_at.localeCompare(a.added_at);
    }),
    [activeConcepts, activeCollaborationConcepts, plannerOrderIndex]
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

  // DnD ordered IDs — kept in sync with allActiveSortable (regular + collaboration concepts)
  const [sortedIds, setSortedIds] = React.useState<string[]>(() =>
    allActiveSortable.map((c) => c.id)
  );

  // Sync local DnD order whenever the planner-derived order changes.
  React.useEffect(() => {
    const newIds = allActiveSortable.map((c) => c.id);
    setSortedIds((current) => {
      if (current.length === newIds.length && current.every((id, index) => id === newIds[index])) {
        return current;
      }
      return newIds;
    });
  }, [allActiveSortable]);

  const orderedActiveConcepts = React.useMemo(() => {
    const map = new Map(allActiveSortable.map((c) => [c.id, c]));
    return sortedIds.map((id) => map.get(id)).filter((c): c is CustomerConcept => c !== undefined);
  }, [sortedIds, allActiveSortable]);

  // Pre-compute per-unplaced index so position labels count only among unplaced concepts (#1, #2, …).
  const unplacedIndexMap = React.useMemo(() => {
    const result = new Map<string, number>();
    let counter = 0;
    for (const c of orderedActiveConcepts) {
      if (c.placement.feed_order === null) {
        result.set(c.id, ++counter);
      }
    }
    return result;
  }, [orderedActiveConcepts]);

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {setShowTagManager && (
            <button
              type="button"
              onClick={() => setShowTagManager(true)}
              style={{
                padding: '10px 16px',
                background: '#fff',
                color: LeTrendColors.textSecondary,
                border: `1.5px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              🏷 Hantera taggar
            </button>
          )}
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

      {allActiveSortable.length === 0 && producedConcepts.length === 0 ? (
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
              {orderedActiveConcepts.map((concept) => {
                const displayIndex = plannerDisplayIndex.get(concept.id);
                const positionLabel = displayIndex != null
                  ? displayIndex === 0 ? 'Nu' : String(displayIndex + 1)
                  : `#${unplacedIndexMap.get(concept.id) ?? 1}`;
                const isCollab = isCollaborationCustomerConcept(concept);

                return (
                  <SortableConceptRow
                    key={concept.id}
                    id={concept.id}
                    positionLabel={positionLabel}
                    concept={concept}
                  >
                    {isCollab ? (
                      <CollaborationConceptRow
                        concept={concept}
                        onEdit={() => setCollabModal({ mode: 'edit', conceptId: concept.id, initial: toCollaborationFormValues(concept) })}
                        onDelete={handleDeleteConcept}
                      />
                    ) : (
                      <ActiveConceptCard
                        concept={concept}
                        justAdded={justAddedConceptId === concept.id}
                        formatDate={formatDate}
                        getConceptDetails={getConceptDetails}
                        onDelete={handleDeleteConcept}
                        onChangeStatus={handleChangeStatus}
                        onUpdateCmNote={handleUpdateCmNote}
                        onUpdateWhyItFits={handleUpdateWhyItFits}
                        onPatchConcept={onPatchConcept}
                        onNavigateToFeedSlot={onNavigateToFeedSlot}
                        onBeginFeedPlacement={onBeginFeedPlacement}
                        cmDisplayNames={cmDisplayNames}
                        cmTags={cmTags}
                        tags={concept.markers.tags ?? []}
                        onUpdateTags={handleUpdateConceptTags}
                        libraryAssignmentCounts={libraryAssignmentCounts}
                        libraryAssignmentCmIds={libraryAssignmentCmIds}
                        postingWeekdays={brief.posting_weekdays}
                      />
                    )}
                  </SortableConceptRow>
                );
              })}
            </SortableContext>
          </DndContext>

          {producedConcepts.length > 0 ? (
            <div style={{ marginTop: allActiveSortable.length > 0 ? 8 : 0 }}>
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

      {showTagManager && setShowTagManager && refreshCmTags ? (
        <TagManager
          tags={cmTags}
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={() => refreshCmTags(true)}
        />
      ) : null}
    </div>
  );
});
