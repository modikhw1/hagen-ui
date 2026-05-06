import { useState } from 'react';
import { DEFAULT_GRID_CONFIG } from '@/types/studio-v2';
import type { CmTag, GridConfig } from '@/types/studio-v2';

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
  const [markProducedDialogOpen, setMarkProducedDialogOpen] = useState(false);
  const [markProducedDialogConceptId, setMarkProducedDialogConceptId] = useState<string | null>(null);
  const [preferredImportedConceptId, setPreferredImportedConceptId] = useState<string | null>(null);
  const [cueSignalId, setCueSignalId] = useState<string | null>(null);
  const [motorSignals, setMotorSignals] = useState<MotorSignalRow[]>([]);

  const handleOpenMarkProducedDialog = (conceptId: string, preferredClipId?: string, signalId?: string) => {
    setMarkProducedDialogConceptId(conceptId);
    setPreferredImportedConceptId(preferredClipId ?? null);
    setCueSignalId(signalId ?? null);
    setMarkProducedDialogOpen(true);
  };

  const handleCloseMarkProducedDialog = () => {
    setMarkProducedDialogOpen(false);
    setMarkProducedDialogConceptId(null);
    setPreferredImportedConceptId(null);
    setCueSignalId(null);
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
    markProducedDialogOpen,
    setMarkProducedDialogOpen,
    markProducedDialogConceptId,
    setMarkProducedDialogConceptId,
    preferredImportedConceptId,
    setPreferredImportedConceptId,
    cueSignalId,
    setCueSignalId,
    motorSignals,
    setMotorSignals,
    handleOpenMarkProducedDialog,
    handleCloseMarkProducedDialog,
  };
}
