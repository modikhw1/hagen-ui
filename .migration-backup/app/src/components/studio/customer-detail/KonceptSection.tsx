import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import {
  getConceptPriority,
  isStudioAssignedCustomerConcept,
} from '@/lib/studio/customer-concepts';
import type { KonceptSectionProps } from './feedTypes';
import { ActiveConceptCard } from './ActiveConceptCard';
import { ProducedConceptCard } from './ProducedConceptCard';

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
  handleAddConceptNote,
  justAddedConceptId,
  justProducedConceptId,
  cmDisplayNames,
  brief,
  onNavigateToFeedSlot,
  onBeginFeedPlacement,
}: KonceptSectionProps) {
  const [showProducedSection, setShowProducedSection] = React.useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = React.useState<string[]>([]);
  const [batchUpdatingStatus, setBatchUpdatingStatus] = React.useState<string | null>(null);

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
        Varje rad är ett kunduppdrag i CM-flödet. Här ser du vad som behöver göras nu, vad som redan är delat och vad som ligger placerat i planen.
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

      {activeConcepts.length === 0 && producedConcepts.length === 0 ? (
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
          {activeConcepts.map((concept) => (
            <ActiveConceptCard
              key={concept.id}
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
          ))}

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
    </div>
  );
});
