import { useState } from 'react';
import { DEFAULT_GRID_CONFIG } from '@/types/studio-v2';
import type { CmTag, GridConfig } from '@/types/studio-v2';
import type { MotorSignalKind } from '@/lib/studio/motor-signal';

type MotorSignalRow = {
  id: string;
  signal_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
  auto_resolved_at: string | null;
};

export function useFeedPlannerState() {
  const [gridConfig, setGridConfig] = useState<GridConfig>(DEFAULT_GRID_CONFIG);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [cmTags, setCmTags] = useState<CmTag[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [pendingAdvanceCue, setPendingAdvanceCue] = useState<{
    imported: number;
    kind: MotorSignalKind;
    publishedAt: string | null;
  } | null>(null);
  const [advancingPlan, setAdvancingPlan] = useState(false);
  const [markProducedDialogOpen, setMarkProducedDialogOpen] = useState(false);
  const [markProducedDialogConceptId, setMarkProducedDialogConceptId] = useState<string | null>(null);
  const [motorSignals, setMotorSignals] = useState<MotorSignalRow[]>([]);

  const handleOpenMarkProducedDialog = (conceptId: string) => {
    setMarkProducedDialogConceptId(conceptId);
    setMarkProducedDialogOpen(true);
  };

  const handleCloseMarkProducedDialog = () => {
    setMarkProducedDialogOpen(false);
    setMarkProducedDialogConceptId(null);
  };

  return {
    gridConfig,
    setGridConfig,
    historyOffset,
    setHistoryOffset,
    cmTags,
    setCmTags,
    showTagManager,
    setShowTagManager,
    pendingAdvanceCue,
    setPendingAdvanceCue,
    advancingPlan,
    setAdvancingPlan,
    markProducedDialogOpen,
    setMarkProducedDialogOpen,
    markProducedDialogConceptId,
    setMarkProducedDialogConceptId,
    motorSignals,
    setMotorSignals,
    handleOpenMarkProducedDialog,
    handleCloseMarkProducedDialog,
  };
}
