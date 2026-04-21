import React from 'react';
import type {
  CustomerConcept,
  CustomerGamePlanSummary,
  CustomerNote,
  CustomerProfile,
  EmailJobEntry,
  EmailLogEntry,
  GridConfig,
  CmTag,
  FeedSlot as FeedSlotData,
} from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import type { GamePlanGenerateInput } from '@/lib/game-plan';
import type { WeeklySummaryPreferences } from '@/lib/email/types';
import type { EmailScheduleRecord } from './shared';

export type InlineFeedbackTone = 'success' | 'warning' | 'error' | 'info';

export type InlineFeedback = {
  tone: InlineFeedbackTone;
  text: string;
};

export interface CMIdentity {
  name: string;
  avatarUrl?: string;
  color?: string;
}

export interface GamePlanSectionProps {
  customerId: string;
  notes: CustomerNote[];
  customerName: string;
  aiDefaults: GamePlanGenerateInput;
  gamePlanHtml: string;
  gamePlanSummary: CustomerGamePlanSummary | null;
  setGamePlanHtml: (html: string) => void;
  editingGamePlan: boolean;
  setEditingGamePlan: (editing: boolean) => void;
  loadingGamePlan: boolean;
  savingGamePlan: boolean;
  gamePlanError: string | null;
  gamePlanSaveMessage: string | null;
  generatingGamePlanAi: boolean;
  hasUnsavedGamePlanChanges: boolean;
  handleReloadGamePlan: (force?: boolean) => Promise<void>;
  handleSaveGamePlan: () => Promise<void>;
  handleCancelGamePlanEdit: () => void;
  handleGenerateGamePlanAi: (input: GamePlanGenerateInput) => Promise<boolean>;
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  addingNote: boolean;
  handleAddNote: () => Promise<void>;
  handleUpdateNote: (noteId: string, content: string) => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  parseMarkdownLinks: (text: string) => React.ReactNode[] | string;
  formatDateTime: (dateStr: string) => string;
  cmDisplayNames: Record<string, CMIdentity>;
}

export interface FeedPlannerSectionProps {
  customerId: string;
  concepts: CustomerConcept[];
  pendingPlacementConcept: CustomerConcept | null;
  cmTags: CmTag[];
  gridConfig: GridConfig;
  historyOffset: number;
  setHistoryOffset: (offset: number | ((prev: number) => number)) => void;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  handleUpdateConceptTags: (conceptId: string, tags: string[]) => Promise<void>;
  handleUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  handleUpdateTikTokUrl: (conceptId: string, url: string) => Promise<void>;
  handlePatchConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  handleMarkProduced: (conceptId: string, tiktokUrl?: string, publishedAt?: string) => Promise<void>;
  handleCheckAndMarkProduced: (conceptId: string) => Promise<'advanced' | 'no_clip'>;
  handleReconcileHistory: (
    historyConceptId: string,
    options?: { mode?: 'use_now_slot'; linkedCustomerConceptId?: string }
  ) => Promise<void>;
  handleUndoHistoryReconciliation: (historyConceptId: string) => Promise<void>;
  handleRemoveFromSlot: (conceptId: string) => Promise<void>;
  handleAssignToSlot: (conceptId: string, feedOrder: number) => Promise<void>;
  handleSwapFeedOrder: (conceptIdA: string, conceptIdB: string) => Promise<void>;
  handleOpenMarkProducedDialog: (conceptId: string) => void;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (slot: FeedSlotData, concept: CustomerConcept | null, details: TranslatedConcept | null) => void;
  showTagManager: boolean;
  setShowTagManager: (show: boolean) => void;
  refreshCmTags: (force?: boolean) => Promise<void>;
  // History motor integration
  historyHasMore: boolean;
  fetchingProfileHistory: boolean;
  onLoadMoreHistory: (count?: number) => Promise<void>;
  activeNudges: Array<{ id: string; payload: Record<string, unknown>; created_at: string; auto_resolved_at: string | null }>;
  autoResolvedNudges: Array<{ id: string; payload: Record<string, unknown>; created_at: string; auto_resolved_at: string | null }>;
  onDismissAdvanceCue: (signalId?: string) => void;
  onDismissAutoResolvedSignals: () => void;
  tempoWeekdays: number[];
  isTempoExplicit: boolean;
  onTempoWeekdaysChange: (weekdays: number[]) => Promise<void>;
  onOpenKonceptSection?: () => void;
  onCancelPendingPlacement?: () => void;
}

export interface FeedSlotProps {
  slot: FeedSlotData;
  tags: CmTag[];
  config: GridConfig;
  historyReconciliationTargets: CustomerConcept[];
  currentHistoryDefaultTarget: CustomerConcept | null;
  spanCoverage?: number;
  spanColor?: string | null;
  showSpanCoverageLabels?: boolean;
  projectedDate?: Date | null;
  isFreshEvidence?: boolean;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  // Checks TikTok for a new clip before producing. Returns 'advanced' if a clip was found and
  // auto-reconcile already advanced the plan, or 'no_clip' if nothing new was found.
  onCheckAndMarkProduced: (conceptId: string) => Promise<'advanced' | 'no_clip'>;
  onMarkProduced: (conceptId: string, tiktokUrl?: string, publishedAt?: string) => Promise<void>;
  onOpenMarkProducedDialog: (conceptId: string) => void;
  onReconcileHistory: (
    historyConceptId: string,
    options?: { mode?: 'use_now_slot'; linkedCustomerConceptId?: string }
  ) => Promise<void>;
  onUndoHistoryReconciliation: (historyConceptId: string) => Promise<void>;
  onRemoveFromSlot: (conceptId: string) => Promise<void>;
  onAssignToSlot?: (conceptId: string, feedOrder: number) => Promise<void>;
  onSwapFeedOrder?: (conceptIdA: string, conceptIdB: string) => Promise<void>;
  onUpdateTags: (conceptId: string, tags: string[]) => Promise<void>;
  onUpdateNote: (conceptId: string, note: string) => Promise<void>;
  onUpdateTikTokUrl: (conceptId: string, url: string) => Promise<void>;
  onPatchConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (slot: FeedSlotData, concept: CustomerConcept | null, details: TranslatedConcept | null) => void;
  /** All concepts for the same customer — used to find swap neighbors. */
  allConcepts?: CustomerConcept[];
}

export interface KommunikationSectionProps {
  customer: CustomerProfile;
  emailLog: EmailLogEntry[];
  emailType: string;
  setEmailType: (value: string) => void;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailIntro: string;
  setEmailIntro: (value: string) => void;
  emailOutro: string;
  setEmailOutro: (value: string) => void;
  selectedConceptIds: string[];
  setSelectedConceptIds: React.Dispatch<React.SetStateAction<string[]>>;
  sendingEmail: boolean;
  previewingEmail: boolean;
  emailPreview: { subject: string; html: string } | null;
  showEmailPreview: boolean;
  setShowEmailPreview: (show: boolean) => void;
  communicationFeedback: InlineFeedback | null;
  latestEmailJob: EmailJobEntry | null;
  retryingEmailJobId: string | null;
  weeklySchedule: EmailScheduleRecord | null;
  scheduleDayOfWeek: number;
  setScheduleDayOfWeek: (value: number) => void;
  scheduleSendTime: string;
  setScheduleSendTime: (value: string) => void;
  scheduleSubject: string;
  setScheduleSubject: (value: string) => void;
  scheduleIntro: string;
  setScheduleIntro: (value: string) => void;
  scheduleOutro: string;
  setScheduleOutro: (value: string) => void;
  scheduleActive: boolean;
  setScheduleActive: (value: boolean) => void;
  scheduleRules: WeeklySummaryPreferences;
  setScheduleRules: React.Dispatch<React.SetStateAction<WeeklySummaryPreferences>>;
  savingSchedule: boolean;
  deletingSchedule: boolean;
  previewingSchedule: boolean;
  scheduleFeedback: InlineFeedback | null;
  schedulePreview: { subject: string; html: string } | null;
  showSchedulePreview: boolean;
  setShowSchedulePreview: (show: boolean) => void;
  handleSendEmail: () => Promise<void>;
  handlePreviewEmail: () => Promise<void>;
  handleRetryEmailJob: (jobId: string) => Promise<void>;
  handleSaveSchedule: () => Promise<void>;
  handleDeleteSchedule: () => Promise<void>;
  handlePreviewSchedule: () => Promise<void>;
  getDraftConcepts: () => CustomerConcept[];
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  formatDateTime: (dateStr: string) => string;
  cmDisplayNames: Record<string, CMIdentity>;
}

export interface KonceptSectionProps {
  concepts: CustomerConcept[];
  notes: CustomerNote[];
  expandedConceptId: string | null;
  setExpandedConceptId: (conceptId: string | null) => void;
  handleDeleteConcept: (conceptId: string) => Promise<void>;
  handleChangeStatus: (
    conceptId: string,
    newStatus: CustomerConceptAssignmentStatus
  ) => Promise<void>;
  openConceptEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  setShowAddConceptPanel: (show: boolean) => void;
  formatDate: (dateStr: string | null) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onSendConcept: (conceptId: string) => void;
  handleUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  handleUpdateWhyItFits: (conceptId: string, text: string) => Promise<void>;
  handleAddConceptNote: (conceptId: string, content: string) => Promise<void>;
  justAddedConceptId: string | null;
  justProducedConceptId: string | null;
  cmDisplayNames: Record<string, CMIdentity>;
  brief: { tone: string; constraints: string; current_focus: string };
  onNavigateToFeedSlot?: (feedOrder: number) => void;
  onBeginFeedPlacement?: (conceptId: string) => void;
}
