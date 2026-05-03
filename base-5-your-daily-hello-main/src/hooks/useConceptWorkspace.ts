import { useEffect, useState } from 'react';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';

type UseConceptWorkspaceOptions = {
  initialConceptId: string | null;
};

export function useConceptWorkspace({ initialConceptId }: UseConceptWorkspaceOptions) {
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(() => initialConceptId);
  const [justAddedConceptId, setJustAddedConceptId] = useState<string | null>(() => initialConceptId);
  const [justProducedConceptId, setJustProducedConceptId] = useState<string | null>(null);
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editorInitialSections, setEditorInitialSections] = useState<ConceptSectionKey[]>([
    'script',
    'instructions',
    'fit',
  ]);
  const [showAddConceptPanel, setShowAddConceptPanel] = useState(false);
  const [addConceptSearch, setAddConceptSearch] = useState('');
  const [showFeedSlotPanel, setShowFeedSlotPanel] = useState(false);
  const [selectedFeedSlot, setSelectedFeedSlot] = useState<number | null>(null);
  const [slotAddTargetFeedOrder, setSlotAddTargetFeedOrder] = useState<number | null>(null);
  const [addConceptDifficultyFilter, setAddConceptDifficultyFilter] = useState('all');
  const [addConceptPeopleFilter, setAddConceptPeopleFilter] = useState('all');
  const [addConceptFilmTimeFilter, setAddConceptFilmTimeFilter] = useState('all');
  const [addConceptBusinessTypeFilter, setAddConceptBusinessTypeFilter] = useState('all');
  const [addConceptScriptFilter, setAddConceptScriptFilter] = useState('all');
  const [addConceptBudgetFilter, setAddConceptBudgetFilter] = useState('all');
  const [addConceptSourceFilter, setAddConceptSourceFilter] = useState('all');

  useEffect(() => {
    if (!justProducedConceptId) return;

    const timeoutId = window.setTimeout(() => {
      setJustProducedConceptId(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [justProducedConceptId]);

  const resetAddConceptFilters = () => {
    setAddConceptSearch('');
    setAddConceptDifficultyFilter('all');
    setAddConceptPeopleFilter('all');
    setAddConceptFilmTimeFilter('all');
    setAddConceptBusinessTypeFilter('all');
    setAddConceptScriptFilter('all');
    setAddConceptBudgetFilter('all');
    setAddConceptSourceFilter('all');
  };

  const resetAddConceptPanelState = () => {
    resetAddConceptFilters();
    setSlotAddTargetFeedOrder(null);
  };

  return {
    expandedConceptId,
    setExpandedConceptId,
    justAddedConceptId,
    setJustAddedConceptId,
    justProducedConceptId,
    setJustProducedConceptId,
    editingConceptId,
    setEditingConceptId,
    editorInitialSections,
    setEditorInitialSections,
    showAddConceptPanel,
    setShowAddConceptPanel,
    addConceptSearch,
    setAddConceptSearch,
    showFeedSlotPanel,
    setShowFeedSlotPanel,
    selectedFeedSlot,
    setSelectedFeedSlot,
    slotAddTargetFeedOrder,
    setSlotAddTargetFeedOrder,
    addConceptDifficultyFilter,
    setAddConceptDifficultyFilter,
    addConceptPeopleFilter,
    setAddConceptPeopleFilter,
    addConceptFilmTimeFilter,
    setAddConceptFilmTimeFilter,
    addConceptBusinessTypeFilter,
    setAddConceptBusinessTypeFilter,
    addConceptScriptFilter,
    setAddConceptScriptFilter,
    addConceptBudgetFilter,
    setAddConceptBudgetFilter,
    addConceptSourceFilter,
    setAddConceptSourceFilter,
    resetAddConceptFilters,
    resetAddConceptPanelState,
  };
}
