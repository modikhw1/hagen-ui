'use client';

/**
 * CustomerWorkspaceContent â€” main studio workspace for a single customer.
 *
 * Section components extracted to separate files:
 *   - GamePlanSection.tsx      â€” Game Plan tab (notes + rich text editor)
 *   - KonceptSection.tsx       â€” Koncept tab (concept list + lifecycle)
 *   - FeedPlannerSection.tsx   â€” Feed Planner tab (grid, eel curve, motor signals)
 *   - KommunikationSection.tsx â€” Kommunikation tab (email log + composer)
 *   - FeedSlot.tsx             â€” Individual feed slot card (used by FeedPlannerSection)
 *
 * Shared utilities and types:
 *   - shared.ts     â€” EMAIL_TEMPLATES, cache constants, hexToRgba, hasUnreadUploadMarker,
 *                     getWorkspaceConceptDetails, getWorkspaceConceptTitle, feedSlotMenuBtnStyle
 *   - feedTypes.ts  â€” Shared prop interfaces (FeedSlotProps, FeedPlannerSectionProps, etc.)
 */

import React, { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadConcepts as loadConceptsFromDB } from '@/lib/conceptLoaderDB';
import type { TranslatedConcept } from '@/lib/translator';
import { display } from '@/lib/display';
import { FeedTimeline } from '@/components/studio/FeedTimeline';
import { LeTrendColors, LeTrendGradients, LeTrendRadius, LeTrendShadows } from '@/styles/letrend-design-system';
import { SidePanel } from '@/components/studio-v2/SidePanel';
import { AutoSaveTextarea } from '@/components/studio-v2/AutoSaveTextarea';
import { ConceptEditWizard } from '@/components/studio-v2/ConceptEditWizard';
import { clearClientCache, fetchAndCacheClient, readClientCache, writeClientCache } from '@/lib/client-cache';
import { detectLinkType, getHostname, normalizeHref } from '@/components/gameplan-editor/utils/link-helpers';
import { normalizeWeeklySummaryPreferences } from '@/lib/email/helpers';
import type {
  CustomerBrief,
  CustomerConcept,
  CustomerGamePlanSummary,
  CustomerNote,
  EmailJobEntry,
  EmailLogEntry,
  Section,
  GridConfig,
  CmTag,
  ConceptContentOverrides,
} from '@/types/studio-v2';
import { DEFAULT_GRID_CONFIG } from '@/types/studio-v2';
import { classifyMotorSignal } from '@/lib/studio/motor-signal';
import { DEFAULT_TEMPO_WEEKDAYS } from '@/lib/feed-planner-utils';
import {
  getCustomerConceptPlacementBucket,
  getCustomerConceptPlacementLabel,
  getStudioFeedOrderDescription,
  getStudioFeedOrderLabel,
} from '@/lib/customer-concept-lifecycle';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import { getStudioCustomerStatusMeta } from '@/lib/studio/customer-status';
import {
  buildStudioWorkspaceHref,
  STUDIO_WORKSPACE_SECTIONS,
  getStudioWorkspaceSection,
  getStudioWorkspaceSectionMeta,
} from '@/lib/studio/navigation';
import {
  isStudioAssignedCustomerConcept,
} from '@/lib/studio/customer-concepts';
import { extractGamePlanEmailData, type GamePlanGenerateInput } from '@/lib/game-plan';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import {
  EMAIL_TEMPLATES,
  WORKSPACE_CACHE_MAX_STALE_MS,
  WORKSPACE_CACHE_TTL_MS,
  EmailScheduleRecord,
  WorkspaceCustomerProfile,
  WorkspaceGamePlanResponse,
  hasUnreadUploadMarker,
  getWorkspaceConceptDetails,
  getWorkspaceConceptTitle,
} from './shared';
import { formatLastEmailSent } from './KommunikationSection';
import { CustomerImportHistoryModal } from './CustomerImportHistoryModal';
import { MarkProducedDialog } from './MarkProducedDialog';
import type { CMIdentity } from './feedTypes';
import { GamePlanSection } from './GamePlanSection';
import { KonceptSection } from './KonceptSection';
import { FeedPlannerSection } from './FeedPlannerSection';
import { KommunikationSection } from './KommunikationSection';
import { useConceptWorkspace } from '@/hooks/useConceptWorkspace';
import { useFeedPlannerState } from '@/hooks/useFeedPlannerState';
import { useCommunicationState } from '@/hooks/useCommunicationState';

const MemoGamePlanSection = React.memo(GamePlanSection);
const MemoKonceptSection = React.memo(KonceptSection);
const MemoFeedPlannerSection = React.memo(FeedPlannerSection);
const MemoKommunikationSection = React.memo(KommunikationSection);

type WorkspaceLibraryConcept = TranslatedConcept & {
  source?: 'hagen' | 'cm_created' | null;
};

const WORKSPACE_DIFFICULTY_OPTIONS = [
  { key: 'all', label: 'Svarighetsgrad' },
  { key: 'easy', label: 'Lätt' },
  { key: 'medium', label: 'Medium' },
  { key: 'advanced', label: 'Avancerad' },
];

const WORKSPACE_PEOPLE_OPTIONS = [
  { key: 'all', label: 'Personer' },
  { key: 'solo', label: '1 person' },
  { key: 'duo', label: '2 personer' },
  { key: 'small_team', label: '3 personer' },
  { key: 'team', label: '4+ personer' },
];

const WORKSPACE_FILM_TIME_OPTIONS = [
  { key: 'all', label: 'Inspelningstid' },
  { key: 'quick', label: 'Snabbt' },
  { key: 'medium', label: 'Medel' },
  { key: 'long', label: 'Längre' },
];

const WORKSPACE_BUSINESS_TYPE_OPTIONS = [
  { key: 'all', label: 'Bransch' },
  { key: 'bar', label: display.businessType('bar').label },
  { key: 'restaurang', label: display.businessType('restaurang').label },
  { key: 'cafe', label: display.businessType('cafe').label },
  { key: 'bistro', label: display.businessType('bistro').label },
  { key: 'hotell', label: display.businessType('hotell').label },
  { key: 'foodtruck', label: display.businessType('foodtruck').label },
  { key: 'nattklubb', label: display.businessType('nattklubb').label },
  { key: 'bageri', label: display.businessType('bageri').label },
];

const WORKSPACE_SCRIPT_OPTIONS = [
  { key: 'all', label: 'Manus' },
  { key: 'with_script', label: 'Med manus' },
  { key: 'without_script', label: 'Utan manus' },
];

const WORKSPACE_BUDGET_OPTIONS = [
  { key: 'all', label: 'Budget' },
  { key: 'free', label: display.budget('free').label },
  { key: 'low', label: display.budget('low').label },
  { key: 'medium', label: display.budget('medium').label },
  { key: 'high', label: display.budget('high').label },
];

const WORKSPACE_SOURCE_OPTIONS = [
  { key: 'all', label: 'Källa' },
  { key: 'hagen', label: 'LeTrend' },
  { key: 'cm_created', label: 'CM-skapat' },
];

function matchWorkspacePeopleRange(people: string | undefined, filter: string) {
  if (filter === 'all') return true;
  return people === filter;
}

function matchWorkspaceFilmTimeRange(filmTime: string | undefined, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'quick') return ['5min', '10min', '15min'].includes(filmTime ?? '');
  if (filter === 'medium') return ['15min', '20min', '30min'].includes(filmTime ?? '');
  if (filter === 'long') return ['30min', '1hr', '1hr_plus'].includes(filmTime ?? '');
  return true;
}

function matchWorkspaceBusinessType(types: string[] | undefined, filter: string) {
  if (filter === 'all') return true;
  return (types || []).includes(filter);
}

function matchWorkspaceScript(hasScript: boolean | undefined, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'with_script') return Boolean(hasScript);
  if (filter === 'without_script') return !hasScript;
  return true;
}

function WorkspaceLibraryFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 10px',
        borderRadius: LeTrendRadius.md,
        border: `1px solid ${value !== 'all' ? LeTrendColors.brownLight : LeTrendColors.border}`,
        background: value !== 'all' ? LeTrendColors.surface : '#fff',
        fontSize: 12,
        color: value !== 'all' ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
      }}
    >
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const NOTE_MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const NOTE_BARE_URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;

type NoteLinkMatch = {
  start: number;
  end: number;
  label: string;
  url: string;
};

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[.,!?;:]+$/g, '');
}

function getNoteLinkMatches(text: string): NoteLinkMatch[] {
  const markdownLinkRegex = new RegExp(NOTE_MARKDOWN_LINK_REGEX);
  const bareUrlRegex = new RegExp(NOTE_BARE_URL_REGEX);
  const matches: NoteLinkMatch[] = [];

  for (const match of text.matchAll(markdownLinkRegex)) {
    const start = match.index ?? -1;
    const url = normalizeHref(trimTrailingUrlPunctuation(match[2] || ''));
    if (start < 0 || !url) continue;

    matches.push({
      start,
      end: start + match[0].length,
      label: (match[1] || '').trim() || getHostname(url) || url,
      url,
    });
  }

  const maskedText = text.replace(markdownLinkRegex, (full) => ' '.repeat(full.length));

  for (const match of maskedText.matchAll(bareUrlRegex)) {
    const start = match.index ?? -1;
    const rawUrl = trimTrailingUrlPunctuation(match[0] || '');
    const url = normalizeHref(rawUrl);
    if (start < 0 || !url) continue;

    matches.push({
      start,
      end: start + rawUrl.length,
      label: rawUrl,
      url,
    });
  }

  return matches.sort((left, right) => left.start - right.start);
}

function getPlainTextFromNoteContent(text: string): string {
  return text.replace(new RegExp(NOTE_MARKDOWN_LINK_REGEX), (_full, label) => String(label || '').trim()).trim();
}

function getNoteObservation(text: string): string | undefined {
  const bareUrlRegex = new RegExp(NOTE_BARE_URL_REGEX);
  const plainText = getPlainTextFromNoteContent(text);
  const observation = plainText
    .replace(bareUrlRegex, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return observation.length >= 6 ? observation : undefined;
}

function buildNoteReferencePayload(content: string) {
  const seen = new Set<string>();

  return getNoteLinkMatches(content).flatMap((match) => {
    const key = match.url.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      kind: 'link',
      label: match.label !== match.url ? match.label : undefined,
      url: match.url,
      platform: detectLinkType(match.url),
    }];
  });
}

function buildGamePlanAiDefaults(
  customer: WorkspaceCustomerProfile | null,
  brief: CustomerBrief,
  notes: CustomerNote[],
): GamePlanGenerateInput {
  const referenceMap = new Map<string, GamePlanGenerateInput['references'][number]>();

  const mergeReference = (reference: GamePlanGenerateInput['references'][number]) => {
    const url = normalizeHref(reference.url || '');
    if (!url) return;

    const key = url.toLowerCase();
    const current = referenceMap.get(key);
    const label = (reference.label || '').trim();
    const note = (reference.note || '').trim();

    if (!current) {
      referenceMap.set(key, {
        url,
        label: label || undefined,
        note: note || undefined,
        platform: reference.platform || detectLinkType(url),
      });
      return;
    }

    referenceMap.set(key, {
      url,
      label: current.label || label || undefined,
      note: current.note || note || undefined,
      platform: current.platform || reference.platform || detectLinkType(url),
    });
  };

  if (customer?.tiktok_profile_url) {
    mergeReference({
      url: customer.tiktok_profile_url,
      label: `${customer.business_name || 'Kunden'} idag`,
    });
  }

  for (const note of notes.slice(0, 8)) {
    const observation = getNoteObservation(note.content);
    const structuredReferences = note.references?.length
      ? note.references
      : buildNoteReferencePayload(note.content);

    for (const reference of structuredReferences || []) {
      const url = normalizeHref(reference.url || '');
      if (!url) continue;

      mergeReference({
        url,
        label: reference.label || getHostname(url) || undefined,
        note: observation,
        platform: detectLinkType(url),
      });
    }
  }

  return {
    customer_name: customer?.business_name || '',
    niche: '',
    audience: '',
    platform: customer?.tiktok_profile_url ? 'TikTok' : 'Content',
    tone: brief.tone || '',
    constraints: brief.constraints || '',
    focus: brief.current_focus || '',
    references: Array.from(referenceMap.values()).slice(0, 6),
    images: [],
    notes: notes
      .slice(0, 4)
      .map((note) => getPlainTextFromNoteContent(note.content))
      .filter(Boolean),
  };
}

export default function CustomerWorkspacePage() {
  return (
    <Suspense fallback={<WorkspacePageFallback />}>
      <CustomerWorkspacePageContent />
    </Suspense>
  );
}

function CustomerWorkspacePageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { } = useAuth();
  const customerId = params?.id as string;
  const currentSectionParam = searchParams?.get('section');
  const justAddedParam = searchParams?.get('justAdded') ?? null;

  // Data state
  const [customer, setCustomer] = useState<WorkspaceCustomerProfile | null>(null);
  const [brief, setBrief] = useState<CustomerBrief>({ tone: '', constraints: '', current_focus: '' });
  const [concepts, setConcepts] = useState<CustomerConcept[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [allConcepts, setAllConcepts] = useState<WorkspaceLibraryConcept[]>([]);
  const [libraryAssignmentCounts, setLibraryAssignmentCounts] = useState<Record<string, number>>({});
  const [gamePlanHtml, setGamePlanHtml] = useState('');
  const [gamePlanSummary, setGamePlanSummary] = useState<CustomerGamePlanSummary | null>(null);
  const [cmDisplayNames, setCmDisplayNames] = useState<Record<string, CMIdentity>>({});

  // UI state
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const urlSection = currentSectionParam;
    // Explicit URL param always wins
    if (urlSection) return getStudioWorkspaceSection(urlSection);
    // Restore last visited section for this customer (client-side only)
    if (typeof window !== 'undefined' && customerId) {
      const stored = window.sessionStorage.getItem(`studio:workspace:last-section:${customerId}`);
      if (stored) return getStudioWorkspaceSection(stored);
    }
    return 'gameplan';
  });
  const [loading, setLoading] = useState(true);
  const [editingBrief, setEditingBrief] = useState(false);
  const [editingGamePlan, setEditingGamePlan] = useState(false);
  const [loadingGamePlan, setLoadingGamePlan] = useState(false);
  const [savingGamePlan, setSavingGamePlan] = useState(false);
  const [gamePlanError, setGamePlanError] = useState<string | null>(null);
  const [gamePlanSaveMessage, setGamePlanSaveMessage] = useState<string | null>(null);
  const [generatingGamePlanAi, setGeneratingGamePlanAi] = useState(false);
  const addConceptSearchInputRef = useRef<HTMLInputElement | null>(null);
  const {
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
  } = useConceptWorkspace({ initialConceptId: justAddedParam });

  const {
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
    markProducedDialogConceptId,
    motorSignals,
    setMotorSignals,
    handleOpenMarkProducedDialog,
    handleCloseMarkProducedDialog,
  } = useFeedPlannerState();

  // Notes state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const {
    emailType,
    setEmailType,
    emailSubject,
    setEmailSubject,
    emailIntro,
    setEmailIntro,
    emailOutro,
    setEmailOutro,
    selectedConceptIds,
    setSelectedConceptIds,
    sendingEmail,
    setSendingEmail,
    previewingEmail,
    setPreviewingEmail,
    emailPreview,
    setEmailPreview,
    showEmailPreview,
    setShowEmailPreview,
    emailJobs,
    setEmailJobs,
    retryingEmailJobId,
    setRetryingEmailJobId,
    communicationFeedback,
    setCommunicationFeedback,
    weeklySchedule,
    setWeeklySchedule,
    scheduleDayOfWeek,
    setScheduleDayOfWeek,
    scheduleSendTime,
    setScheduleSendTime,
    scheduleSubject,
    setScheduleSubject,
    scheduleIntro,
    setScheduleIntro,
    scheduleOutro,
    setScheduleOutro,
    scheduleActive,
    setScheduleActive,
    scheduleRules,
    setScheduleRules,
    savingSchedule,
    setSavingSchedule,
    deletingSchedule,
    setDeletingSchedule,
    previewingSchedule,
    setPreviewingSchedule,
    schedulePreview,
    setSchedulePreview,
    showSchedulePreview,
    setShowSchedulePreview,
    scheduleFeedback,
    setScheduleFeedback,
    pendingEmailPrompt,
    setPendingEmailPrompt,
    openEmailComposer: primeEmailComposer,
  } = useCommunicationState();

  // Demo state
  const [showImportHistoryModal, setShowImportHistoryModal] = useState(false);
  const [importHistoryJson, setImportHistoryJson] = useState('');
  const [importingHistory, setImportingHistory] = useState(false);
  const [importHistoryError, setImportHistoryError] = useState<string | null>(null);
  const [importHistoryResult, setImportHistoryResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [fetchingFromHagen, setFetchingFromHagen] = useState(false);
  const [fetchFromHagenError, setFetchFromHagenError] = useState<string | null>(null);
  const [fetchedFromUsernames, setFetchedFromUsernames] = useState<string[]>([]);
  const [tiktokProfileUrlInput, setTiktokProfileUrlInput] = useState('');
  const [savingTiktokProfile, setSavingTiktokProfile] = useState(false);
  const [fetchingProfileHistory, setFetchingProfileHistory] = useState(false);
  const [profileHistoryFetchResult, setProfileHistoryFetchResult] = useState<{ fetched: number; imported: number; skipped: number } | null>(null);
  const [profileHistoryFetchError, setProfileHistoryFetchError] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState<number | null>(null);
  const [pendingFeedPlacementConceptId, setPendingFeedPlacementConceptId] = useState<string | null>(null);

  // Derive cue from backend truth whenever the customer profile changes.
  // Shows the nudge when there is unseen pending evidence; hides it otherwise.
  // seen_at is cleared by sync on new evidence, so fresh clips always re-surface.
  // No guard â€” allows count to update if a new sync arrives while the cue is already showing.
  useEffect(() => {
    if (customer?.pending_history_advance && !customer.pending_history_advance_seen_at) {
      const kind = classifyMotorSignal(customer) ?? 'fresh_activity';
      setPendingAdvanceCue({ imported: customer.pending_history_advance, kind, publishedAt: customer.pending_history_advance_published_at ?? null });
    } else {
      // Signal absent or already acknowledged â€” clear any stale local cue so the
      // workspace stays in sync with backend truth after a refetch or dismiss.
      setPendingAdvanceCue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.pending_history_advance, customer?.pending_history_advance_seen_at, customer?.pending_history_advance_published_at]);
  // Derived: active nudges need CM action; auto-resolved nudges are informational (cron handled them)
  const activeNudges = motorSignals.filter(s => !s.auto_resolved_at);
  const autoResolvedNudges = motorSignals.filter(s => s.auto_resolved_at !== null);
  // Guard: prevents auto-fetch from firing more than once per workspace open cycle
  const profileHistoryAutoFetchRef = useRef(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [syncHistoryResult, setSyncHistoryResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [syncHistoryError, setSyncHistoryError] = useState<string | null>(null);
  const [previewingSync, setPreviewingSync] = useState(false);
  const [syncPreviewResult, setSyncPreviewResult] = useState<{
    handle: string;
    wouldImport: number;
    wouldSkip: number;
    totalMatched: number;
    samples: Array<{ tiktok_url: string; source_username: string | null; description: string | null }>;
    availableUsernames?: string[];
  } | null>(null);
  const [syncPreviewError, setSyncPreviewError] = useState<string | null>(null);

  const customerCacheKey = `studio-v2:workspace:${customerId}:customer`;
  const gamePlanCacheKey = `studio-v2:workspace:${customerId}:game-plan`;
  const conceptsCacheKey = `studio-v2:workspace:${customerId}:concepts`;
  const notesCacheKey = `studio-v2:workspace:${customerId}:notes`;
  const emailLogCacheKey = `studio-v2:workspace:${customerId}:email-log`;
  const emailJobsCacheKey = `studio-v2:workspace:${customerId}:email-jobs`;

  const applyCustomerState = (profile: WorkspaceCustomerProfile) => {
    setCustomer(profile);
    setBrief(profile.brief || { tone: '', constraints: '', current_focus: '' });
    setTiktokProfileUrlInput(profile.tiktok_profile_url || (profile.tiktok_handle ? `https://www.tiktok.com/@${profile.tiktok_handle}` : ''));
  };

  useEffect(() => {
    // Only sync from URL when a section param is explicitly present.
    // Without this guard, the effect would fire on mount with no param and
    // overwrite whatever the lazy initializer just restored from sessionStorage.
    const urlSection = searchParams?.get('section');
    if (urlSection) {
      setActiveSection(getStudioWorkspaceSection(urlSection));
    }
  }, [searchParams]);

  // Auto-populate email fields when template changes
  useEffect(() => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === emailType);
    if (!template || !customer || emailType === 'custom') return;

    const count = selectedConceptIds.length || 0;
    const countText = count === 1 ? 'ett'
      : count === 2 ? 'tv\u00e5'
        : count === 3 ? 'tre'
          : count === 4 ? 'fyra'
            : count === 5 ? 'fem'
              : String(count);
    const businessName = customer.business_name || 'er verksamhet';
    const contactName = customer.customer_contact_name ? ` ${customer.customer_contact_name}` : '';
    const week = getWeekNumber();
    const countCapitalized = countText.charAt(0).toUpperCase() + countText.slice(1);

    setEmailSubject(
      template.subject
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', String(count))
        .replace('{{count_capitalized}}', countCapitalized)
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName)
    );

    setEmailIntro(
      template.intro
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', count > 0 ? countText : 'nya')
        .replace('{{count_capitalized}}', countCapitalized)
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName)
    );
    setEmailOutro(
      template.outro
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', count > 0 ? countText : 'nya')
        .replace('{{count_capitalized}}', countCapitalized)
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName)
    );
  }, [emailType, customer, selectedConceptIds.length, setEmailIntro, setEmailOutro, setEmailSubject]);

  useEffect(() => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === emailType);
    if (!template?.maxConcepts) return;

    setSelectedConceptIds((current) => current.slice(0, template.maxConcepts));
  }, [emailType, setSelectedConceptIds]);
  function getWeekNumber(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 604800000;
    return Math.ceil(diff / oneWeek);
  }

  // Load all data
  useEffect(() => {
    if (!customerId) return;

    // Reset auto-fetch guard and history pagination state on customer change
    profileHistoryAutoFetchRef.current = false;
    setHistoryHasMore(false);
    setHistoryNextCursor(null);
    setProfileHistoryFetchResult(null);
    setProfileHistoryFetchError(null);

    let isMounted = true;

    const hydrateFromCache = () => {
      const cacheOptions = { allowExpired: true, maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS };
      let hasCachedState = false;

      const cachedCustomer = readClientCache<WorkspaceCustomerProfile>(customerCacheKey, cacheOptions);
      if (cachedCustomer?.value) {
        hasCachedState = true;
        if (isMounted) applyCustomerState(cachedCustomer.value);
      }

      const cachedGamePlan = readClientCache<WorkspaceGamePlanResponse>(gamePlanCacheKey, cacheOptions);
      if (cachedGamePlan?.value) {
        hasCachedState = true;
        if (isMounted) {
          setGamePlanSummary(cachedGamePlan.value.game_plan ?? null);
          setGamePlanHtml(cachedGamePlan.value.game_plan?.html || '');
        }
      }

      const cachedConcepts = readClientCache<CustomerConcept[]>(conceptsCacheKey, cacheOptions);
      if (cachedConcepts?.value) {
        hasCachedState = true;
        if (isMounted) setConcepts(cachedConcepts.value);
      }

      const cachedNotes = readClientCache<CustomerNote[]>(notesCacheKey, cacheOptions);
      if (cachedNotes?.value) {
        hasCachedState = true;
        if (isMounted) setNotes(cachedNotes.value);
      }

      const cachedEmailLog = readClientCache<EmailLogEntry[]>(emailLogCacheKey, cacheOptions);
      if (cachedEmailLog?.value) {
        hasCachedState = true;
        if (isMounted) setEmailLog(cachedEmailLog.value);
      }

      const cachedEmailJobs = readClientCache<EmailJobEntry[]>(emailJobsCacheKey, cacheOptions);
      if (cachedEmailJobs?.value) {
        hasCachedState = true;
        if (isMounted) setEmailJobs(cachedEmailJobs.value);
      }

      return hasCachedState;
    };

    const loadInitialData = async () => {
      const hasCachedState = hydrateFromCache();
      setLoading(!hasCachedState);

      try {
        await Promise.allSettled([
          fetchCustomer(hasCachedState),
          fetchGamePlan(hasCachedState),
          fetchConcepts(hasCachedState),
          fetchNotes(hasCachedState),
          fetchEmailLog(hasCachedState),
          fetchEmailJobs(hasCachedState),
          fetchEmailSchedule(),
          fetchMotorSignals(),
        ]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Load concept library separately so core workspace data renders first
  useEffect(() => {
    if (customerId) {
      const loadConceptLibrary = async () => {
        const [dbConcepts, conceptMetaResult, assignmentResult] = await Promise.all([
          loadConceptsFromDB(),
          supabase.from('concepts').select('id, source').eq('is_active', true),
          supabase.from('customer_concepts').select('concept_id'),
        ]);

        const conceptSourceMap = new Map<string, 'hagen' | 'cm_created' | null>();
        for (const row of conceptMetaResult.data ?? []) {
          const id = typeof row.id === 'string' ? row.id : null;
          if (!id) continue;
          conceptSourceMap.set(
            id,
            row.source === 'hagen' || row.source === 'cm_created' ? row.source : null
          );
        }

        const counts: Record<string, number> = {};
        for (const row of assignmentResult.data ?? []) {
          const conceptId = typeof row.concept_id === 'string' ? row.concept_id : null;
          if (!conceptId) continue;
          counts[conceptId] = (counts[conceptId] ?? 0) + 1;
        }

        setLibraryAssignmentCounts(counts);
        setAllConcepts(
          dbConcepts.map((concept) => ({
            ...concept,
            source: conceptSourceMap.get(concept.id) ?? null,
          }))
        );
      };

      void loadConceptLibrary();
    }
  }, [customerId]);

  // Auto-fetch real customer profile history on first open â€” only when no history exists yet.
  // Conservative policy: fires once per customer lifetime (when last_history_sync_at is null).
  // Subsequent refreshes and load-more are explicit CM actions to preserve API budget.
  useEffect(() => {
    if (!customerId || !customer) return;
    if (!customer.tiktok_profile_url || !customer.tiktok_handle) return;
    if (profileHistoryAutoFetchRef.current) return;
    // Only fire when history has never been fetched for this customer
    if (customer.last_history_sync_at) return;

    profileHistoryAutoFetchRef.current = true;
    void (async () => {
      setFetchingProfileHistory(true);
      try {
        const res = await fetch(`/api/studio-v2/customers/${customerId}/fetch-profile-history`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Historik-hÃ¤mtning misslyckades');
        setProfileHistoryFetchResult({ fetched: data.fetched ?? 0, imported: data.imported ?? 0, skipped: data.skipped ?? 0 });
        setHistoryHasMore(data.has_more ?? false);
        setHistoryNextCursor(data.cursor ?? null);
        await Promise.all([fetchCustomer(true), fetchConcepts(true)]);
      } catch (err) {
        setProfileHistoryFetchError((err as Error).message);
      } finally {
        setFetchingProfileHistory(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const fetchGridConfig = React.useCallback(async (force = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cacheKey = `studio-v2:workspace:cm:${user.id}:grid-config`;
      const cached = readClientCache<GridConfig>(cacheKey, {
        allowExpired: true,
        maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS
      });

      if (cached?.value) {
        // Always enforce canonical currentSlotIndex â€” stored value may be stale (e.g. old 2â†’4 migration)
        setGridConfig({ ...cached.value, currentSlotIndex: DEFAULT_GRID_CONFIG.currentSlotIndex });
      }

      const nextConfig = await fetchAndCacheClient<GridConfig>(
        cacheKey,
        async () => {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('grid_config')
            .eq('id', user.id)
            .single();

          if (error) throw error;
          const raw = (profile?.grid_config as Partial<GridConfig>) || {};
          // Always enforce canonical currentSlotIndex regardless of what's stored in the DB
          return { ...DEFAULT_GRID_CONFIG, ...raw, currentSlotIndex: DEFAULT_GRID_CONFIG.currentSlotIndex };
        },
        WORKSPACE_CACHE_TTL_MS,
        { force: force || Boolean(cached) }
      );

      setGridConfig(nextConfig);
    } catch (error) {
      console.error('Error loading grid config:', error);
    }
  }, [setGridConfig]);

  const fetchCmTags = React.useCallback(async (force = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cacheKey = `studio-v2:workspace:cm:${user.id}:tags`;
      const cached = readClientCache<CmTag[]>(cacheKey, {
        allowExpired: true,
        maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS
      });

      if (cached?.value) {
        setCmTags(cached.value);
      }

      const nextTags = await fetchAndCacheClient<CmTag[]>(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('cm_tags')
            .select('*')
            .eq('cm_id', user.id)
            .order('name');

          if (error) throw error;
          return (data || []) as CmTag[];
        },
        WORKSPACE_CACHE_TTL_MS,
        { force: force || Boolean(cached) }
      );

      setCmTags(nextTags);
    } catch (error) {
      console.error('Error loading CM tags:', error);
    }
  }, [setCmTags]);

  // Load feed planner data (grid config and tags)
  useEffect(() => {
    const loadFeedPlannerData = async () => {
      await Promise.allSettled([fetchGridConfig(), fetchCmTags()]);
    };

    void loadFeedPlannerData();
  }, [fetchCmTags, fetchGridConfig]);

  // Load CM identity once for note/email/concept attribution badges.
  // Pass 1: team_members â€” preferred (name + avatar_url + color for badge rendering)
  // Pass 2: profiles.email username fallback for CMs without a team_members link
  useEffect(() => {
    void (async () => {
      const identities: Record<string, CMIdentity> = {};

      const { data: teamData } = await supabase
        .from('team_members')
        .select('profile_id, name, avatar_url, color')
        .not('profile_id', 'is', null);
      for (const row of teamData ?? []) {
        if (row.profile_id && row.name) {
          identities[row.profile_id as string] = {
            name: row.name as string,
            avatarUrl: (row.avatar_url as string | null) ?? undefined,
            color: (row.color as string | null) ?? undefined,
          };
        }
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email')
        .in('role', ['admin', 'content_manager']);
      for (const row of profileData ?? []) {
        const id = row.id as string;
        if (!identities[id] && row.email) identities[id] = { name: (row.email as string).split('@')[0] };
      }

      setCmDisplayNames(identities);
    })();
  }, []);

  const fetchCustomer = async (force = false) => {
    try {
      const data = await fetchAndCacheClient<WorkspaceCustomerProfile>(
        customerCacheKey,
        async () => {
          const { data: customerData, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .eq('id', customerId)
            .single();

          if (error) throw error;
          return customerData as WorkspaceCustomerProfile;
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      applyCustomerState(data);
    } catch (err) {
      console.error('Error fetching customer:', err);
    }
  };

  const fetchMotorSignals = async () => {
    if (!customerId) return;
    const { data } = await supabase
      .from('feed_motor_signals')
      .select('*')
      .eq('customer_id', customerId)
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    setMotorSignals((data ?? []) as Array<{
      id: string;
      signal_type: string;
      payload: Record<string, unknown>;
      created_at: string;
      acknowledged_at: string | null;
      auto_resolved_at: string | null;
    }>);
  };

  const fetchGamePlan = async (force = false) => {
    setLoadingGamePlan(true);
    setGamePlanError(null);
    try {
      const data = await fetchAndCacheClient<WorkspaceGamePlanResponse>(
        gamePlanCacheKey,
        async () => {
          const response = await fetch(`/api/studio-v2/customers/${customerId}/game-plan`);
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(payload.error || `Failed to fetch game plan (${response.status})`);
          }

          return payload as WorkspaceGamePlanResponse;
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      setGamePlanSummary(data.game_plan ?? null);
      setGamePlanHtml(data.game_plan?.html || '');
    } catch (err) {
      console.error('Error fetching game plan:', err);
      setGamePlanError('Kunde inte ladda Game Plan. Visar senaste kÃ¤nda version om den finns.');
    } finally {
      setLoadingGamePlan(false);
    }
  };

  const fetchConcepts = async (force = false) => {
    try {
      const conceptData = await fetchAndCacheClient<CustomerConcept[]>(
        conceptsCacheKey,
        async () => {
          const response = await fetch(`/api/studio-v2/customers/${customerId}/concepts`);
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || `Failed to fetch concepts (${response.status})`);
          }

          return Array.isArray(data.concepts) ? data.concepts as CustomerConcept[] : [];
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      setConcepts(conceptData);
    } catch (err) {
      console.error('Error fetching concepts:', err);
    }
  };

  const fetchNotes = async (force = false) => {
    try {
      const noteData = await fetchAndCacheClient<CustomerNote[]>(
        notesCacheKey,
        async () => {
          const response = await fetch(`/api/studio-v2/customers/${customerId}/notes`);
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || `Failed to fetch notes (${response.status})`);
          }

          return Array.isArray(data.notes) ? data.notes as CustomerNote[] : [];
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      setNotes(noteData);
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  const fetchEmailLog = async (force = false) => {
    try {
      const logData = await fetchAndCacheClient<EmailLogEntry[]>(
        emailLogCacheKey,
        async () => {
          const { data, error } = await supabase
            .from('email_log')
            .select('*')
            .eq('customer_id', customerId)
            .order('sent_at', { ascending: false });

          if (error) throw error;
          return (data || []) as EmailLogEntry[];
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      setEmailLog(logData);
    } catch (err) {
      console.error('Error fetching email log:', err);
    }
  };

  const fetchEmailJobs = async (force = false) => {
    try {
      const jobsData = await fetchAndCacheClient<EmailJobEntry[]>(
        emailJobsCacheKey,
        async () => {
          const response = await fetch(
            `/api/studio-v2/email/jobs?customer_id=${encodeURIComponent(customerId)}&limit=10`
          );
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || `Failed to fetch email jobs (${response.status})`);
          }

          return Array.isArray(data.jobs) ? data.jobs as EmailJobEntry[] : [];
        },
        WORKSPACE_CACHE_TTL_MS,
        { force }
      );

      setEmailJobs(jobsData);
    } catch (err) {
      console.error('Error fetching email jobs:', err);
    }
  };

  const fetchEmailSchedule = async () => {
    try {
      const response = await fetch(`/api/studio/email/schedules?customer_id=${encodeURIComponent(customerId)}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Failed to fetch schedules (${response.status})`);
      }

      const nextSchedule = Array.isArray(data.schedules)
        ? (data.schedules.find((schedule: EmailScheduleRecord) => schedule.schedule_type === 'weekly') || data.schedules[0] || null)
        : null;

      applyWeeklySchedule(nextSchedule as EmailScheduleRecord | null);
    } catch (err) {
      console.error('Error fetching email schedule:', err);
      applyWeeklySchedule(null);
    }
  };

  // Brief handlers
  const handleSaveBrief = async (field: keyof CustomerBrief, value: string) => {
    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });

      if (!response.ok) throw new Error('Failed to save brief');
      clearClientCache(customerCacheKey);
    } catch (err) {
      console.error('Error saving brief:', err);
    }
  };

  // Soft tempo cadence â€” saves posting_weekdays to brief JSONB (display-only, never writes to planned_publish_at)
  const handleSaveTempoWeekdays = async (weekdays: number[]) => {
    setBrief(prev => ({ ...prev, posting_weekdays: weekdays }));
    try {
      await fetch(`/api/studio-v2/customers/${customerId}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posting_weekdays: weekdays })
      });
      clearClientCache(customerCacheKey);
    } catch (err) {
      console.error('Error saving tempo weekdays:', err);
    }
  };

  // Notes handlers
  const handleAddNote = async () => {
    if (!newNoteContent.trim() || addingNote) return;

    setAddingNote(true);
    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newNoteContent,
          references: buildNoteReferencePayload(newNoteContent),
        })
      });

      if (!response.ok) throw new Error('Failed to add note');

      await fetchNotes(true);
      setNewNoteContent('');
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Kunde inte lÃ¤gga till notering');
    } finally {
      setAddingNote(false);
    }
  };

  const handleUpdateNote = async (noteId: string, content: string) => {
    if (!content.trim()) return;

    try {
      const response = await fetch(
        `/api/studio-v2/customers/${customerId}/notes?note_id=${noteId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            references: buildNoteReferencePayload(content),
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to update note');

      await fetchNotes(true);
    } catch (err) {
      console.error('Error updating note:', err);
      alert('Kunde inte uppdatera notering');
    }
  };

  const handleAddConceptNote = async (conceptId: string, content: string) => {
    if (!content.trim()) return;
    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, primary_customer_concept_id: conceptId })
      });
      if (!response.ok) throw new Error('Failed to add concept note');
      await fetchNotes(true);
    } catch (err) {
      console.error('Error adding concept note:', err);
      alert('Kunde inte lÃ¤gga till notering');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Ta bort denna notering?')) return;

    try {
      const response = await fetch(
        `/api/studio-v2/customers/${customerId}/notes?note_id=${noteId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete note');

      await fetchNotes(true);
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Kunde inte ta bort notering');
    }
  };

  // Concept handlers
  const handleAddConcept = async (conceptId: string, targetFeedOrder?: number) => {
    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, concept_id: conceptId })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to add concept');
      }

      // Slot-aware path: if a target slot was provided, place the new concept there
      // immediately. The PATCH writes feed_order to the DB before fetchConcepts so the
      // refetch returns the concept already placed. Local setConcepts in handleUpdateConcept
      // is a no-op here (concept not in state yet) but the DB write is correct.
      if (targetFeedOrder !== undefined && data?.concept?.id) {
        await handleUpdateConcept(data.concept.id, { feed_order: targetFeedOrder });
        setSlotAddTargetFeedOrder(null);
      }

      await fetchConcepts(true);
      setShowAddConceptPanel(false);
      resetAddConceptPanelState();

      // Auto-expand the new concept and signal post-add note nudge
      if (data?.concept?.id) {
        setExpandedConceptId(data.concept.id);
        setJustAddedConceptId(data.concept.id);
        setPendingEmailPrompt({
          title: '1 nytt koncept tillagt',
          description: 'Skicka ett kundmail med det nya konceptet medan det fortfarande är färskt.',
          emailType: 'new_concept',
          conceptIds: [data.concept.id],
          actionLabel: 'Skicka email',
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Kunde inte lÃ¤gga till koncept');
    }
  };

  const applyOptimisticConceptUpdate = (
    concept: CustomerConcept,
    updates: Partial<CustomerConcept>
  ): CustomerConcept => {
    const nextConcept = {
      ...concept,
      ...updates,
      updated_at: new Date().toISOString(),
    } as CustomerConcept;

    if ('status' in updates && updates.status) {
      nextConcept.status = updates.status;
      nextConcept.assignment = {
        ...concept.assignment,
        status: updates.status,
      };
    }

    if ('feed_order' in updates) {
      const feedOrder = updates.feed_order ?? null;
      nextConcept.feed_order = feedOrder;
      nextConcept.placement = {
        ...concept.placement,
        feed_order: feedOrder,
        bucket: getCustomerConceptPlacementBucket(feedOrder),
      };
    }

    if ('tags' in updates && Array.isArray(updates.tags)) {
      nextConcept.tags = updates.tags;
      nextConcept.markers = {
        ...concept.markers,
        tags: updates.tags,
      };
    }

    if ('cm_note' in updates) {
      const note = updates.cm_note ?? null;
      nextConcept.cm_note = note;
      nextConcept.markers = {
        ...nextConcept.markers,
        assignment_note: note,
      };
    }

    if ('tiktok_url' in updates) {
      const tiktokUrl = updates.tiktok_url ?? null;
      nextConcept.tiktok_url = tiktokUrl;
      nextConcept.result = {
        ...concept.result,
        tiktok_url: tiktokUrl,
      };
    }

    if ('content_overrides' in updates) {
      const overrideUpdates = updates.content_overrides as ConceptContentOverrides | null;
      const mergedOverrides = {
        ...((overrideUpdates === null ? {} : concept.content.content_overrides) ?? {}),
        ...(overrideUpdates ?? {}),
      };
      const nextOverrides = Object.keys(mergedOverrides).length > 0 ? mergedOverrides : null;

      nextConcept.content_overrides = nextOverrides;
      nextConcept.content = {
        ...concept.content,
        content_overrides: nextOverrides,
        custom_script: typeof mergedOverrides.script === 'string' ? mergedOverrides.script : null,
        why_it_fits: typeof mergedOverrides.why_it_fits === 'string' ? mergedOverrides.why_it_fits : null,
        filming_instructions: typeof mergedOverrides.filming_instructions === 'string' ? mergedOverrides.filming_instructions : null,
      };
      nextConcept.custom_script = nextConcept.content.custom_script;
      nextConcept.why_it_fits = nextConcept.content.why_it_fits;
      nextConcept.filming_instructions = nextConcept.content.filming_instructions;
    }

    return nextConcept;
  };

  const handleUpdateConcept = async (conceptId: string, updates: Partial<CustomerConcept>) => {
    const previousConcepts = concepts;
    setConcepts((prev) =>
      prev.map((concept) =>
        concept.id === conceptId ? applyOptimisticConceptUpdate(concept, updates) : concept
      )
    );

    try {
      const response = await fetch(`/api/studio-v2/concepts/${conceptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || `Failed to update concept (${response.status})`);
      }
      const data = await response.json();
      if (data?.concept) {
        setConcepts(prev =>
          prev.map(concept => (concept.id === conceptId ? { ...concept, ...data.concept } : concept))
        );
      }
      clearClientCache(conceptsCacheKey);
    } catch (err) {
      setConcepts(previousConcepts);
      console.error('Error updating concept:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte uppdatera koncept');
    }
  };

  const handleDeleteConcept = async (conceptId: string) => {
    if (!confirm('Ta bort detta koncept frÃ¥n kunden?')) return;

    try {
      const response = await fetch(
        `/api/studio-v2/customers/${customerId}/concepts?concept_id=${conceptId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete concept');

      await fetchConcepts(true);
    } catch (err) {
      console.error('Error deleting concept:', err);
      alert('Kunde inte ta bort koncept');
    }
  };

  const handleChangeStatus = async (
    conceptId: string,
    newStatus: CustomerConceptAssignmentStatus
  ) => {
    if (newStatus === 'produced') {
      handleOpenMarkProducedDialog(conceptId);
      return;
    }

    await handleUpdateConcept(conceptId, { status: newStatus });
  };

  // Feed planner handlers (uppdaterade fÃ¶r feed_order)
  const handleAssignToFeedOrder = async (conceptId: string, feedOrder: number) => {
    await handleUpdateConcept(conceptId, { feed_order: feedOrder });
    setShowFeedSlotPanel(false);
    setSelectedFeedSlot(null);
    if (pendingFeedPlacementConceptId === conceptId) {
      setPendingFeedPlacementConceptId(null);
    }
  };

  const handleRemoveFromSlot = async (conceptId: string) => {
    await handleUpdateConcept(conceptId, { feed_order: null });
  };

  const handleAssignToSlot = async (conceptId: string, feedOrder: number) => {
    await handleUpdateConcept(conceptId, { feed_order: feedOrder });
    if (pendingFeedPlacementConceptId === conceptId) {
      setPendingFeedPlacementConceptId(null);
    }
  };

  // Atomically swaps the feed_order of two concepts (Task 12).
  const handleSwapFeedOrder = async (conceptIdA: string, conceptIdB: string) => {
    try {
      const { error } = await supabase.rpc('swap_feed_order', {
        p_concept_a: conceptIdA,
        p_concept_b: conceptIdB,
      });
      if (error) throw new Error(error.message);
      await fetchConcepts(true);
    } catch (err) {
      console.error('Swap feed_order error:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte byta ordning');
    }
  };

  const handleMarkProduced = async (conceptId: string, tiktokUrl?: string, publishedAt?: string) => {
    try {
      const response = await fetch('/api/studio-v2/feed/mark-produced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: conceptId,
          customer_id: customerId,
          tiktok_url: tiktokUrl,
          published_at: publishedAt,
        })
      });

      if (!response.ok) throw new Error('Failed to mark as produced');

      // Refetch concepts to get updated feed_order values
      await fetchConcepts(true);
      setJustProducedConceptId(conceptId);
    } catch (err) {
      console.error('Error marking as produced:', err);
      alert('Kunde inte markera som producerat');
    }
  };

  // Called when CM clicks "Markera som gjord" on the nu card.
  // Fetches the latest clips from TikTok first. If a new clip was imported,
  // auto-reconcile already advanced the plan â€” no separate mark-produced needed.
  // Returns 'advanced' (clip found, plan moved) or 'no_clip' (nothing new on profile).
  const handleCheckAndMarkProduced = async (conceptId: string): Promise<'advanced' | 'no_clip'> => {
    void conceptId;
    try {
      const response = await fetch(
        `/api/studio-v2/customers/${customerId}/fetch-profile-history`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 5 }),
        }
      );
      if (!response.ok) return 'no_clip';
      const data = await response.json() as { imported?: number };
      if ((data.imported ?? 0) > 0) {
        // Auto-reconcile ran inside the fetch and already marked nu as produced.
        clearClientCache(conceptsCacheKey);
        await fetchConcepts(true);
        return 'advanced';
      }
      return 'no_clip';
    } catch {
      return 'no_clip';
    }
  };

  const handleUpdateConceptTags = async (conceptId: string, tags: string[]) => {
    await handleUpdateConcept(conceptId, { tags });
  };

  const handleUpdateCmNote = async (conceptId: string, note: string) => {
    await handleUpdateConcept(conceptId, { cm_note: note });
  };

  const handleUpdateWhyItFits = async (conceptId: string, text: string) => {
    await handleUpdateConcept(conceptId, { content_overrides: { why_it_fits: text } });
  };

  const handleUpdateTikTokUrl = async (conceptId: string, url: string) => {
    await handleUpdateConcept(conceptId, { tiktok_url: url.trim() || null });
  };

  const handleReconcileHistory = async (
    historyConceptId: string,
    options: { mode?: 'use_now_slot'; linkedCustomerConceptId?: string } = {}
  ) => {
    try {
      const response = await fetch('/api/studio-v2/history/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_concept_id: historyConceptId,
          ...(options.mode === 'use_now_slot'
            ? { mode: 'use_now_slot' }
            : { linked_customer_concept_id: options.linkedCustomerConceptId }),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Failed to reconcile history');
      }

      // Reconciliation affects two rows simultaneously: the imported clip (visibility)
      // and the LeTrend assignment card (enrichment/stats). A full refetch is required.
      clearClientCache(conceptsCacheKey);
      await fetchConcepts(true);
    } catch (err) {
      console.error('Error reconciling history:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte koppla historiken');
    }
  };

  const handleUndoHistoryReconciliation = async (historyConceptId: string) => {
    try {
      const response = await fetch('/api/studio-v2/history/reconciliation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_concept_id: historyConceptId }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Failed to remove reconciliation');
      }

      // Same as reconcile: two rows change at once. Full refetch required so the
      // LeTrend card loses its enrichment and the imported clip reappears in the grid.
      clearClientCache(conceptsCacheKey);
      await fetchConcepts(true);
    } catch (err) {
      console.error('Error removing history reconciliation:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte ta bort kopplingen');
    }
  };

  const setWorkspaceSection = (section: Section) => {
    setActiveSection(section);
    router.replace(buildStudioWorkspaceHref(customerId, section));
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`studio:workspace:last-section:${customerId}`, section);
    }
  };

  useEffect(() => {
    if (!showAddConceptPanel) return;

    const focusTimeoutId = window.setTimeout(() => {
      addConceptSearchInputRef.current?.focus();
      addConceptSearchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(focusTimeoutId);
  }, [showAddConceptPanel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return;
      }

      event.preventDefault();
      setActiveSection('koncept');
      router.replace(buildStudioWorkspaceHref(customerId, 'koncept'));
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`studio:workspace:last-section:${customerId}`, 'koncept');
      }
      setShowAddConceptPanel(true);
      setSlotAddTargetFeedOrder(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customerId, router, setShowAddConceptPanel, setSlotAddTargetFeedOrder]);

  const applyWeeklySchedule = (schedule: EmailScheduleRecord | null) => {
    setWeeklySchedule(schedule);
    setScheduleDayOfWeek(schedule?.day_of_week ?? 1);
    setScheduleSendTime(schedule?.send_time || '09:00');
    setScheduleSubject(schedule?.email_subject || 'Veckouppdatering - LeTrend');
    setScheduleIntro(schedule?.email_intro || 'Hej! Har ar veckans sammanfattning:');
    setScheduleOutro(schedule?.email_outro || 'Med vanliga halsningar,\nLeTrend');
    setScheduleActive(schedule?.is_active !== false);
    setScheduleRules(normalizeWeeklySummaryPreferences(schedule?.rules as Record<string, unknown> | null | undefined));
  };

  const getStructuredGamePlan = () => {
    const extracted = extractGamePlanEmailData(gamePlanSummary);
    if (!extracted.title && !extracted.description && (extracted.goals?.length ?? 0) === 0) {
      return undefined;
    }
    return extracted;
  };

  const openEmailComposer = (nextEmailType: string, conceptIds: string[] = []) => {
    primeEmailComposer(nextEmailType, conceptIds);
    setCommunicationFeedback(null);
    setWorkspaceSection('kommunikation');
  };

  const handleSaveSchedule = async () => {
    if (!customerId || savingSchedule) return;

    const trimmedSubject = scheduleSubject.trim();
    const trimmedIntro = scheduleIntro.trim();
    const trimmedOutro = scheduleOutro.trim();

    if (!trimmedSubject) {
      setScheduleFeedback({ tone: 'error', text: 'Ämne krävs för veckoschemat.' });
      return;
    }

    setSavingSchedule(true);
    setScheduleFeedback(null);
    try {
      const response = await fetch('/api/studio/email/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_profile_id: customerId,
          schedule_type: 'weekly',
          day_of_week: scheduleDayOfWeek,
          send_time: scheduleSendTime,
          rules: scheduleRules,
          email_subject: trimmedSubject,
          email_intro: trimmedIntro || undefined,
          email_outro: trimmedOutro || undefined,
          is_active: scheduleActive,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte spara schemat');
      }

      applyWeeklySchedule((data.schedule as EmailScheduleRecord | undefined) || null);
      setScheduleFeedback({
        tone: 'success',
        text: scheduleActive ? 'Veckoschemat sparades.' : 'Schemat sparades som inaktivt.',
      });
    } catch (err) {
      setScheduleFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte spara schemat',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!weeklySchedule?.id || deletingSchedule) return;

    setDeletingSchedule(true);
    setScheduleFeedback(null);
    try {
      const response = await fetch(
        `/api/studio/email/schedules?id=${encodeURIComponent(weeklySchedule.id)}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte ta bort schemat');
      }

      applyWeeklySchedule(null);
      setSchedulePreview(null);
      setShowSchedulePreview(false);
      setScheduleFeedback({ tone: 'info', text: 'Veckoschemat togs bort.' });
    } catch (err) {
      setScheduleFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte ta bort schemat',
      });
    } finally {
      setDeletingSchedule(false);
    }
  };

  const handlePreviewSchedule = async () => {
    if (!customerId || previewingSchedule) return;

    setPreviewingSchedule(true);
    setScheduleFeedback(null);
    try {
      const response = await fetch('/api/studio-v2/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          email_type: 'weekly_summary',
          subject: scheduleSubject.trim() || undefined,
          intro: scheduleIntro.trim() || undefined,
          outro: scheduleOutro.trim() || undefined,
          weekly_summary: {
            preferences: scheduleRules,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte förhandsgranska veckoschemat');
      }

      setSchedulePreview({
        subject: typeof data.subject === 'string' ? data.subject : scheduleSubject.trim(),
        html: typeof data.html === 'string' ? data.html : '',
      });
      setShowSchedulePreview(true);
    } catch (err) {
      setScheduleFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte förhandsgranska veckoschemat',
      });
    } finally {
      setPreviewingSchedule(false);
    }
  };

  const openConceptEditor = (
    conceptId: string,
    sections: ConceptSectionKey[] = ['script', 'instructions', 'fit']
  ) => {
    setEditorInitialSections(sections);
    setEditingConceptId(conceptId);
    setWorkspaceSection('koncept');
    setExpandedConceptId(conceptId);
  };

  const handleOpenConceptFromFeed = (conceptId: string) => {
    openConceptEditor(conceptId, ['script', 'instructions', 'fit']);
  };

  const pendingFeedPlacementConcept = React.useMemo(
    () => concepts.find((concept) => concept.id === pendingFeedPlacementConceptId) ?? null,
    [concepts, pendingFeedPlacementConceptId]
  );

  useEffect(() => {
    if (pendingFeedPlacementConceptId && !pendingFeedPlacementConcept) {
      setPendingFeedPlacementConceptId(null);
    }
  }, [pendingFeedPlacementConcept, pendingFeedPlacementConceptId]);

  const handleBeginFeedPlacement = (conceptId: string) => {
    setPendingFeedPlacementConceptId(conceptId);
    setWorkspaceSection('feed');
  };

  const availableAddConcepts = React.useMemo(
    () => allConcepts.filter((concept) => !concepts.find((customerConcept) => customerConcept.concept_id === concept.id)),
    [allConcepts, concepts]
  );

  const filteredAddConcepts = React.useMemo(() => {
    const query = addConceptSearch.trim().toLowerCase();

    return availableAddConcepts.filter((concept) => {
      const matchesSearch =
        !query ||
        (concept.headline_sv || concept.headline || '').toLowerCase().includes(query) ||
        (concept.description_sv || '').toLowerCase().includes(query) ||
        concept.vibeAlignments.some((vibe) => vibe.toLowerCase().includes(query)) ||
        (concept.mechanism || '').toLowerCase().includes(query) ||
        display.mechanism(concept.mechanism).label.toLowerCase().includes(query) ||
        concept.businessTypes.some((type) => display.businessType(type).label.toLowerCase().includes(query));

      return (
        matchesSearch &&
        (addConceptDifficultyFilter === 'all' || concept.difficulty === addConceptDifficultyFilter) &&
        matchWorkspacePeopleRange(concept.peopleNeeded, addConceptPeopleFilter) &&
        matchWorkspaceFilmTimeRange(concept.filmTime, addConceptFilmTimeFilter) &&
        matchWorkspaceBusinessType(concept.businessTypes, addConceptBusinessTypeFilter) &&
        matchWorkspaceScript(concept.hasScript, addConceptScriptFilter) &&
        (addConceptBudgetFilter === 'all' || concept.estimatedBudget === addConceptBudgetFilter) &&
        (addConceptSourceFilter === 'all' || concept.source === addConceptSourceFilter)
      );
    });
  }, [
    addConceptBudgetFilter,
    addConceptBusinessTypeFilter,
    addConceptDifficultyFilter,
    addConceptFilmTimeFilter,
    addConceptPeopleFilter,
    addConceptScriptFilter,
    addConceptSearch,
    addConceptSourceFilter,
    availableAddConcepts,
  ]);

  const activeAddConceptFilterCount = [
    addConceptDifficultyFilter !== 'all',
    addConceptPeopleFilter !== 'all',
    addConceptFilmTimeFilter !== 'all',
    addConceptBusinessTypeFilter !== 'all',
    addConceptScriptFilter !== 'all',
    addConceptBudgetFilter !== 'all',
    addConceptSourceFilter !== 'all',
  ].filter(Boolean).length;

  const buildEmailPayload = () => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === emailType);
    const maxConcepts = template?.supportsConceptAttachment === false ? 0 : (template?.maxConcepts || 10);
    const conceptIds = Array.from(new Set(selectedConceptIds)).slice(0, maxConcepts);
    const trimmedSubject = emailSubject.trim();
    const trimmedIntro = emailIntro.trim();
    const trimmedOutro = emailOutro.trim();
    const gameplan = emailType === 'gameplan_updated' || emailType === 'gameplan_summary'
      ? getStructuredGamePlan()
      : undefined;

    return {
      conceptIds,
      trimmedSubject,
      trimmedIntro,
      trimmedOutro,
      payload: {
        customer_id: customerId,
        email_type: emailType,
        subject: trimmedSubject || undefined,
        intro: trimmedIntro || undefined,
        outro: trimmedOutro || undefined,
        concept_ids: conceptIds,
        gameplan,
      },
    };
  };

  const handleSendEmail = async () => {
    if (sendingEmail) return;

    const recipientEmail = customer?.contact_email?.trim();
    const { conceptIds, trimmedSubject, trimmedIntro, trimmedOutro, payload } = buildEmailPayload();

    if (!recipientEmail) {
      alert('Kunden saknar email-adress');
      return;
    }

    if (!trimmedSubject && emailType === 'custom') {
      alert('\u00c4mne \u00e4r obligatoriskt f\u00f6r anpassade email');
      return;
    }

    if (trimmedSubject.length > 250) {
      alert('\u00c4mnet \u00e4r f\u00f6r l\u00e5ngt (max 250 tecken)');
      return;
    }

    if (trimmedIntro.length > 20_000 || trimmedOutro.length > 20_000) {
      alert('Inneh\u00e5llet \u00e4r f\u00f6r l\u00e5ngt (max 20 000 tecken per f\u00e4lt)');
      return;
    }

    setSendingEmail(true);
    setCommunicationFeedback(null);
    try {
      const response = await fetch('/api/studio-v2/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      const feedbackText = [
        data.message || 'Email k\u00f6at f\u00f6r utskick.',
        conceptIds.length > 0
          ? `${conceptIds.length} valda kunduppdrag markeras som delade med kund.`
          : 'Inga specifika kunduppdrag valdes i utskicket.',
        typeof data.warning === 'string' && data.warning.trim() ? `Varning: ${data.warning}` : null,
      ]
        .filter(Boolean)
        .join(' ');

      setCommunicationFeedback({
        tone: typeof data.warning === 'string' && data.warning.trim() ? 'warning' : 'success',
        text: feedbackText,
      });
      setEmailSubject('');
      setEmailIntro('');
      setEmailOutro('');
      setSelectedConceptIds([]);
      setEmailType('new_concept');
      setEmailPreview(null);
      setShowEmailPreview(false);
      await Promise.all([fetchConcepts(true), fetchEmailLog(true), fetchEmailJobs(true)]);
    } catch (err: unknown) {
      setCommunicationFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte skicka email',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePreviewEmail = async () => {
    if (previewingEmail) return;

    const recipientEmail = customer?.contact_email?.trim();
    const { trimmedSubject, trimmedIntro, trimmedOutro, payload } = buildEmailPayload();

    if (!recipientEmail) {
      alert('Kunden saknar email-adress');
      return;
    }

    if (!trimmedSubject && emailType === 'custom') {
      alert('\u00c4mne \u00e4r obligatoriskt f\u00f6r anpassade email');
      return;
    }

    if (trimmedSubject.length > 250) {
      alert('\u00c4mnet \u00e4r f\u00f6r l\u00e5ngt (max 250 tecken)');
      return;
    }

    if (trimmedIntro.length > 20_000 || trimmedOutro.length > 20_000) {
      alert('Inneh\u00e5llet \u00e4r f\u00f6r l\u00e5ngt (max 20 000 tecken per f\u00e4lt)');
      return;
    }

    setPreviewingEmail(true);
    setCommunicationFeedback(null);
    try {
      const response = await fetch('/api/studio-v2/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte f\u00f6rhandsgranska email');
      }

      setEmailPreview({
        subject: typeof data.subject === 'string' ? data.subject : trimmedSubject,
        html: typeof data.html === 'string' ? data.html : '',
      });
      setShowEmailPreview(true);
    } catch (err: unknown) {
      setCommunicationFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte f\u00f6rhandsgranska email',
      });
    } finally {
      setPreviewingEmail(false);
    }
  };
  const handleRetryEmailJob = async (jobId: string) => {
    if (!jobId || retryingEmailJobId) return;

    setRetryingEmailJobId(jobId);
    setCommunicationFeedback(null);
    try {
      const response = await fetch(`/api/studio-v2/email/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte kÃ¶a om email-jobbet');
      }

      await fetchEmailJobs(true);
      setCommunicationFeedback({
        tone: 'info',
        text: data.message || 'Email-jobbet har kÃ¶ats om.',
      });
    } catch (err: unknown) {
      setCommunicationFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Kunde inte koa om email-jobbet',
      });
    } finally {
      setRetryingEmailJobId(null);
    }
  };

  // Demo handlers
  const handleImportHistory = async (replace: boolean) => {
    if (!customerId || importingHistory) return;
    setImportHistoryError(null);
    setImportHistoryResult(null);

    let clips: unknown[];
    try {
      clips = JSON.parse(importHistoryJson);
      if (!Array.isArray(clips)) throw new Error('MÃ¥ste vara en JSON-array');
    } catch (e) {
      setImportHistoryError(`Ogiltig JSON: ${(e as Error).message}`);
      return;
    }

    setImportingHistory(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/import-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips, replace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import misslyckades');

      await fetchConcepts(true);
      setImportHistoryJson('');
      setImportHistoryResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 });
    } catch (err) {
      setImportHistoryError((err as Error).message);
    } finally {
      setImportingHistory(false);
    }
  };

  const handleFetchFromHagen = async () => {
    if (!customerId || fetchingFromHagen) return;
    setFetchFromHagenError(null);
    setFetchedFromUsernames([]);
    setFetchingFromHagen(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/hagen-clips`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kunde inte hÃ¤mta klipp frÃ¥n hagen');
      if (!Array.isArray(data.clips) || data.clips.length === 0) throw new Error('Inga TikTok-klipp hittades i hagen');
      setImportHistoryJson(JSON.stringify(data.clips, null, 2));
      setImportHistoryError(null);
      // Collect unique source usernames for CM discernibility display
      const usernames = [
        ...new Set(
          (data.clips as Array<{ source_username?: string | null }>)
            .map((c) => c.source_username)
            .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
        ),
      ];
      setFetchedFromUsernames(usernames);
    } catch (err) {
      setFetchFromHagenError((err as Error).message);
    } finally {
      setFetchingFromHagen(false);
    }
  };

  const handleSaveTikTokProfile = async () => {
    if (!customerId || savingTiktokProfile) return;
    setSavingTiktokProfile(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_profile_url: tiktokProfileUrlInput.trim() || null }),
      });
      if (!res.ok) throw new Error('Kunde inte spara TikTok-profil');
      await fetchCustomer(true);
    } catch (err) {
      console.error('Error saving tiktok profile url:', err);
    } finally {
      setSavingTiktokProfile(false);
    }
  };

  const handleFetchProfileHistory = async () => {
    if (!customerId || fetchingProfileHistory) return;
    setProfileHistoryFetchResult(null);
    setProfileHistoryFetchError(null);
    setHistoryHasMore(false);
    setHistoryNextCursor(null);
    setFetchingProfileHistory(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/fetch-profile-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Historik-hÃ¤mtning misslyckades');
      const imported = data.imported ?? 0;
      setProfileHistoryFetchResult({ fetched: data.fetched ?? 0, imported, skipped: data.skipped ?? 0 });
      setHistoryHasMore(data.has_more ?? false);
      setHistoryNextCursor(data.cursor ?? null);
      // Cue is derived from backend via the customer profile effect â€” no direct set needed here.
      await Promise.all([fetchCustomer(true), fetchConcepts(true)]);
    } catch (err) {
      setProfileHistoryFetchError((err as Error).message);
    } finally {
      setFetchingProfileHistory(false);
    }
  };

  const handleAdvancePlan = async () => {
    if (!customerId || advancingPlan) return;
    setAdvancingPlan(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/advance-plan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kunde inte flytta planen');
      setPendingAdvanceCue(null); // optimistic local clear; fetchCustomer below will confirm
      await Promise.all([fetchCustomer(true), fetchConcepts(true)]);
    } catch (err) {
      console.error('Advance plan error:', err);
    } finally {
      setAdvancingPlan(false);
    }
  };

  // Dismiss the nudge without advancing. Clears local state immediately (optimistic).
  // If a motor signal ID is provided, sets acknowledged_at on that row (new path).
  // Also patches the legacy profile column for backward compat.
  const handleDismissAdvanceCue = (signalId?: string) => {
    setPendingAdvanceCue(null);
    if (signalId) {
      // Acknowledge the specific feed_motor_signals row (optimistic)
      setMotorSignals(prev => prev.filter(s => s.id !== signalId));
      void supabase
        .from('feed_motor_signals')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', signalId)
        .then(({ error }) => { if (error) console.error('[motor-signal] ack error:', error); });
    }
    if (customerId) {
      // DEPRECATED: migrate to feed_motor_signals acknowledged_at
      void fetch(`/api/studio-v2/customers/${customerId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge_advance_cue: true }),
      }).catch((err) => console.error('Acknowledge advance cue error:', err));
    }
  };

  // Dismiss all auto-resolved motor signals (informational badge). Sets acknowledged_at on each.
  const handleDismissAutoResolvedSignals = () => {
    const now = new Date().toISOString();
    const ids = autoResolvedNudges.map(s => s.id);
    setMotorSignals(prev => prev.filter(s => !ids.includes(s.id)));
    ids.forEach(id => {
      void supabase
        .from('feed_motor_signals')
        .update({ acknowledged_at: now })
        .eq('id', id)
        .then(({ error }) => { if (error) console.error('[motor-signal] ack auto-resolved error:', error); });
    });
  };

  const handleLoadMoreHistory = async (count = 6) => {
    if (!customerId || fetchingProfileHistory || !historyNextCursor) return;
    setProfileHistoryFetchError(null);
    setFetchingProfileHistory(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/fetch-profile-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, cursor: historyNextCursor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Historik-hÃ¤mtning misslyckades');
      setProfileHistoryFetchResult({ fetched: data.fetched ?? 0, imported: data.imported ?? 0, skipped: data.skipped ?? 0 });
      setHistoryHasMore(data.has_more ?? false);
      setHistoryNextCursor(data.cursor ?? null);
      await Promise.all([fetchCustomer(true), fetchConcepts(true)]);
    } catch (err) {
      setProfileHistoryFetchError((err as Error).message);
    } finally {
      setFetchingProfileHistory(false);
    }
  };

  const handleSyncHistory = async () => {
    if (!customerId || syncingHistory || !customer?.tiktok_handle) return;
    setSyncHistoryError(null);
    setSyncHistoryResult(null);
    setSyncPreviewResult(null);
    setSyncingHistory(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/sync-history`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Synk misslyckades');
      setSyncHistoryResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 });
      // Cue is derived from backend via the customer profile effect â€” no direct set needed here.
      await fetchCustomer(true);
      await fetchConcepts(true);
    } catch (err) {
      setSyncHistoryError((err as Error).message);
    } finally {
      setSyncingHistory(false);
    }
  };

  const handlePreviewSync = async () => {
    if (!customerId || previewingSync || !customer?.tiktok_handle) return;
    setSyncPreviewError(null);
    setSyncPreviewResult(null);
    setSyncHistoryResult(null);
    setSyncHistoryError(null);
    setPreviewingSync(true);
    try {
      const res = await fetch(`/api/studio-v2/customers/${customerId}/sync-history?preview=true`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'FÃ¶rhandsvisning misslyckades');
      setSyncPreviewResult({
        handle: data.handle ?? '',
        wouldImport: data.wouldImport ?? 0,
        wouldSkip: data.wouldSkip ?? 0,
        totalMatched: data.totalMatched ?? 0,
        samples: data.samples ?? [],
      });
    } catch (err) {
      setSyncPreviewError((err as Error).message);
    } finally {
      setPreviewingSync(false);
    }
  };

  // Game Plan handlers
  const handleSaveGamePlan = async () => {
    if (!customer) return;

    setSavingGamePlan(true);
    setGamePlanError(null);
    setGamePlanSaveMessage(null);
    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/game-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: gamePlanHtml }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save game plan');
      }

      const nextGamePlan = data as WorkspaceGamePlanResponse;
      setGamePlanSummary(nextGamePlan.game_plan ?? null);
      setGamePlanHtml(nextGamePlan.game_plan?.html || '');
      writeClientCache(gamePlanCacheKey, nextGamePlan, WORKSPACE_CACHE_TTL_MS);
      setEditingGamePlan(false);
      setGamePlanSaveMessage('Game Plan sparad.');
      setPendingEmailPrompt({
        title: 'Game Plan sparad',
        description: 'Vill du meddela kunden direkt med den uppdaterade planen?',
        emailType: 'gameplan_updated',
        actionLabel: 'Skicka uppdatering',
      });
    } catch (err) {
      console.error('Error saving game plan:', err);
      setGamePlanError('Kunde inte spara Game Plan. FÃ¶rsÃ¶k igen.');
    } finally {
      setSavingGamePlan(false);
    }
  };

  const handleCancelGamePlanEdit = () => {
    setGamePlanHtml(gamePlanSummary?.html || '');
    setGamePlanError(null);
    setGamePlanSaveMessage(null);
    setEditingGamePlan(false);
  };

  const hasUnsavedGamePlanChanges = gamePlanHtml !== (gamePlanSummary?.html || '');
  const gamePlanAiDefaults = buildGamePlanAiDefaults(customer, brief, notes);

  const handleGenerateGamePlanAi = async (input: GamePlanGenerateInput): Promise<boolean> => {
    setGeneratingGamePlanAi(true);
    setGamePlanError(null);
    setGamePlanSaveMessage(null);

    try {
      const response = await fetch(`/api/studio-v2/customers/${customerId}/game-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate game plan');
      }

      const nextHtml = typeof data.html === 'string' ? data.html : '';
      if (!nextHtml.trim()) {
        throw new Error('Generated game plan was empty');
      }

      setGamePlanHtml(nextHtml);
      setEditingGamePlan(true);
      setGamePlanSaveMessage(
        data.source === 'fallback'
          ? `Utkast skapat med fallback${typeof data.reason === 'string' && data.reason ? ` (${data.reason})` : ''}. Granska och justera innan du sparar.`
          : `Utkast skapat med AI${typeof data.model === 'string' && data.model ? ` via ${data.model}` : ''}. Granska och justera innan du sparar.`
      );
      return true;
    } catch (err) {
      console.error('Error generating game plan with AI:', err);
      setGamePlanError('Kunde inte generera Game Plan-utkast just nu. Forsok igen.');
      return false;
    } finally {
      setGeneratingGamePlanAi(false);
    }
  };

  // Helper functions
  const getConceptDetails = (conceptId: string): TranslatedConcept | undefined => {
    return allConcepts.find(c => c.id === conceptId);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseMarkdownLinks = (text: string) => {
    const matches = getNoteLinkMatches(text);
    if (matches.length === 0) {
      return text;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      if (match.start > lastIndex) {
        parts.push(text.substring(lastIndex, match.start));
      }

      parts.push(
        <a
          key={`${match.start}-${match.url}`}
          href={match.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: LeTrendColors.brownLight,
            textDecoration: 'underline'
          }}
        >
          {match.label}
        </a>
      );
      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const getDraftConcepts = () => {
    // Return sourced assignment rows that are still drafts and not yet placed in the feed
    return concepts.filter(
      (concept) =>
        isStudioAssignedCustomerConcept(concept) &&
        concept.assignment.status === 'draft' &&
        concept.placement.feed_order === null
    );
  };

  const getPlacedConcepts = () =>
    concepts.filter((concept) => concept.placement.feed_order !== null);

  // @deprecated - These functions are no longer used with the new feed_order system
  // const getSlotType = (slotNumber: number): 'upcoming' | 'current' | 'history' => {
  //   if (slotNumber >= 6) return 'history';
  //   if (slotNumber === 5) return 'current';
  //   return 'upcoming';
  // };

  // const getConceptForSlot = (slotNumber: number): CustomerConcept | null => {
  //   return concepts.find(c => c.feed_slot === slotNumber) || null;
  // };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: LeTrendColors.textMuted }}>
        Laddar kundarbetsyta...
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>[!]</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: LeTrendColors.brownDark, marginBottom: 8 }}>
          Kund hittades inte
        </div>
        <button
          onClick={() => router.push('/studio/customers')}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: LeTrendColors.brownLight,
            color: '#fff',
            border: 'none',
            borderRadius: LeTrendRadius.md,
            cursor: 'pointer'
          }}
        >
          Tillbaka till Mina kunder
        </button>
      </div>
    );
  }

  const draftCount = getDraftConcepts().length;
  const editingConcept = editingConceptId ? concepts.find((concept) => concept.id === editingConceptId) ?? null : null;
  const editingConceptDetails = getWorkspaceConceptDetails(editingConcept, getConceptDetails);
  const latestEmailJob = emailJobs[0] || null;
  const activeSectionMeta = getStudioWorkspaceSectionMeta(activeSection);
  const customerStatusMeta = getStudioCustomerStatusMeta(customer.status);

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/studio/customers"
          style={{
            color: LeTrendColors.textSecondary,
            fontSize: 14,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          Till kundarbete
        </Link>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* LEFT COLUMN - Fixed width */}
        <div style={{
          width: 280,
          flexShrink: 0,
          position: 'sticky',
          top: 100
        }}>
          {/* Customer Header */}
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            marginBottom: 16,
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 12
            }}>
              <h2 style={{
                fontSize: 20,
                fontWeight: 700,
                color: LeTrendColors.brownDark,
                margin: 0
              }}>
                {customer.business_name}
              </h2>
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                Kunduppgifter hanteras i Admin
              </div>
            </div>

            {customer.customer_contact_name && (
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 4 }}>
                Kontakt: {customer.customer_contact_name}
              </div>
            )}

            {customer.contact_email && (
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 8 }}>
                Email: {customer.contact_email}
              </div>
            )}

            {customer.account_manager && (
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 8 }}>
                AM: {customer.account_manager}
              </div>
            )}

            <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 12 }}>
              Pris: {customer.monthly_price > 0 ? `${customer.monthly_price} kr/mÃ¥n` : 'Pris ej satt'}
            </div>
            <div style={{ marginBottom: 12, fontSize: 11, color: LeTrendColors.textMuted }}>
              Pris och avtal hanteras i Admin.
            </div>

            <div style={{
              padding: '6px 12px',
              borderRadius: LeTrendRadius.md,
              fontSize: 12,
              fontWeight: 600,
              background: customerStatusMeta.bg,
              color: customerStatusMeta.text,
              border: `1px solid ${customerStatusMeta.border}`,
              display: 'inline-block'
            }}>
              {customerStatusMeta.label}
            </div>

            {concepts.length > 0 && (
              <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginTop: 10 }}>
                {concepts.length} koncept{draftCount > 0 ? ` Â· ${draftCount} utkast` : ''}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              {formatLastEmailSent(emailLog[0]?.sent_at)}
            </div>

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              {gamePlanHtml.length > 50 ? 'Game Plan: skrivet' : 'Game Plan: ej pÃ¥bÃ¶rjat'}
            </div>

          </div>

          {/* Brief */}
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            marginBottom: 16,
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12
            }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 600,
                color: LeTrendColors.brownDark,
                margin: 0
              }}>
                Kundbrief
              </h3>
              <button
                onClick={() => setEditingBrief(!editingBrief)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: LeTrendColors.brownLight,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {editingBrief ? 'Klart' : 'Redigera'}
              </button>
            </div>

            {editingBrief ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textSecondary, display: 'block', marginBottom: 4 }}>
                    KÃ¤nsla och ton
                  </label>
                  <AutoSaveTextarea
                    value={brief.tone}
                    onChange={(val) => setBrief({ ...brief, tone: val })}
                    onSave={(val) => handleSaveBrief('tone', val)}
                    rows={2}
                    placeholder='T.ex. "Humor, relatable, livsstilsinspirerat â€” inte fÃ¶r sÃ¤ljigt"'
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textSecondary, display: 'block', marginBottom: 4 }}>
                    BegrÃ¤nsningar
                  </label>
                  <AutoSaveTextarea
                    value={brief.constraints}
                    onChange={(val) => setBrief({ ...brief, constraints: val })}
                    onSave={(val) => handleSaveBrief('constraints', val)}
                    rows={2}
                    placeholder='T.ex. "Alltid produktplacering, aldrig pris i bild"'
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textSecondary, display: 'block', marginBottom: 4 }}>
                    Periodens ingÃ¥ng â€” syns som intro i kundens feed
                  </label>
                  <AutoSaveTextarea
                    value={brief.current_focus}
                    onChange={(val) => setBrief({ ...brief, current_focus: val })}
                    onSave={(val) => handleSaveBrief('current_focus', val)}
                    rows={2}
                    placeholder='T.ex. "Den hÃ¤r perioden fokuserar vi pÃ¥ format som bygger trovÃ¤rdighet infÃ¶r hÃ¶st..."'
                  />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
                {!brief.tone && !brief.constraints && !brief.current_focus ? (
                  <>
                    <em>Ingen brief ifylld Ã¤n</em>
                    {gamePlanHtml.length > 200 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ marginBottom: 6, fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.5 }}>
                          Du har ett Game Plan â€” fyll i kundbriefen fÃ¶r bÃ¤ttre konceptpassning.
                        </div>
                        <button
                          onClick={() => setEditingBrief(true)}
                          style={{
                            background: 'none',
                            border: `1px solid ${LeTrendColors.brownLight}`,
                            borderRadius: LeTrendRadius.md,
                            color: LeTrendColors.brownLight,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '4px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          Fyll i brief
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {brief.tone && <div style={{ marginBottom: 8 }}><strong>KÃ¤nsla och ton:</strong> {brief.tone}</div>}
                    {brief.constraints && <div style={{ marginBottom: 8 }}><strong>BegrÃ¤nsningar:</strong> {brief.constraints}</div>}
                    {brief.current_focus && <div><strong>Fokus:</strong> {brief.current_focus}</div>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Section Navigation */}
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.lg,
            padding: 12,
            border: `1px solid ${LeTrendColors.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}>
            {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'primary').map(({ key, short_label, description }) => {
              const badge =
                key === 'gameplan' ? notes.length :
                key === 'koncept' ? draftCount :
                undefined;

              return (
              <button
                key={key}
                onClick={() => setWorkspaceSection(key)}
                style={{
                  background: activeSection === key ? LeTrendColors.surface : 'transparent',
                  border: 'none',
                  padding: '12px 16px',
                  borderRadius: LeTrendRadius.md,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 14,
                  fontWeight: activeSection === key ? 600 : 500,
                  color: activeSection === key ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
                  transition: 'all 0.2s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ display: 'grid', gap: 2 }}>
                  <span>{short_label}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: LeTrendColors.textMuted }}>
                    {description}
                  </span>
                </span>
                {badge !== undefined && badge > 0 && (
                  <span style={{
                    background: '#f59e0b',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 10,
                    minWidth: 20,
                    textAlign: 'center'
                  }}>
                    {badge}
                  </span>
                )}
              </button>
              );
            })}
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, margin: '4px 0' }} />
            {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'utility').map(({ key, short_label, description }) => (
              <button
                key={key}
                onClick={() => setWorkspaceSection(key)}
                style={{
                  background: activeSection === key ? LeTrendColors.surface : 'transparent',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: LeTrendRadius.md,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: activeSection === key ? 600 : 400,
                  color: activeSection === key ? LeTrendColors.brownDark : LeTrendColors.textMuted,
                  transition: 'all 0.2s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ display: 'grid', gap: 1 }}>
                  <span>{short_label}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: LeTrendColors.textMuted }}>
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN - Flexible content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            marginBottom: 16,
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: LeTrendColors.textMuted, marginBottom: 6 }}>
              Aktiv del
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: LeTrendColors.brownDark, marginBottom: 6 }}>
              {activeSectionMeta.label}
            </div>
            <div style={{ fontSize: 14, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
              {activeSectionMeta.description}
            </div>
          </div>

          {pendingEmailPrompt && (
            <div
              style={{
                background: '#FFF9F0',
                borderRadius: LeTrendRadius.lg,
                padding: 18,
                marginBottom: 16,
                border: `1px solid ${LeTrendColors.borderStrong}`,
                boxShadow: LeTrendShadows.warmthCard,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: LeTrendColors.brownDark, marginBottom: 6 }}>
                {pendingEmailPrompt.title}
              </div>
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
                {pendingEmailPrompt.description}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => openEmailComposer(pendingEmailPrompt.emailType, pendingEmailPrompt.conceptIds || [])}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: 'none',
                    background: LeTrendGradients.gradientCTA,
                    color: '#FAF8F5',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pendingEmailPrompt.actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingEmailPrompt(null)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: `1px solid ${LeTrendColors.borderStrong}`,
                    background: '#FFFFFF',
                    color: LeTrendColors.brownDark,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Nej tack
                </button>
              </div>
            </div>
          )}

          {/* Section content will be rendered here based on activeSection */}
          {activeSection === 'gameplan' && (
            <MemoGamePlanSection
              notes={notes}
              customerName={customer?.business_name || ''}
              aiDefaults={gamePlanAiDefaults}
              gamePlanHtml={gamePlanHtml}
              gamePlanSummary={gamePlanSummary}
              setGamePlanHtml={setGamePlanHtml}
              editingGamePlan={editingGamePlan}
              setEditingGamePlan={setEditingGamePlan}
              loadingGamePlan={loadingGamePlan}
              savingGamePlan={savingGamePlan}
              gamePlanError={gamePlanError}
              gamePlanSaveMessage={gamePlanSaveMessage}
              generatingGamePlanAi={generatingGamePlanAi}
              hasUnsavedGamePlanChanges={hasUnsavedGamePlanChanges}
              handleReloadGamePlan={fetchGamePlan}
              handleSaveGamePlan={handleSaveGamePlan}
              handleCancelGamePlanEdit={handleCancelGamePlanEdit}
              handleGenerateGamePlanAi={handleGenerateGamePlanAi}
              newNoteContent={newNoteContent}
              setNewNoteContent={setNewNoteContent}
              addingNote={addingNote}
              handleAddNote={handleAddNote}
              handleUpdateNote={handleUpdateNote}
              handleDeleteNote={handleDeleteNote}
              parseMarkdownLinks={parseMarkdownLinks}
              formatDateTime={formatDateTime}
              cmDisplayNames={cmDisplayNames}
            />
          )}

          {activeSection === 'koncept' && (
            <MemoKonceptSection
              concepts={concepts}
              notes={notes}
              expandedConceptId={expandedConceptId}
              setExpandedConceptId={setExpandedConceptId}
              handleDeleteConcept={handleDeleteConcept}
              handleChangeStatus={handleChangeStatus}
              openConceptEditor={openConceptEditor}
              setShowAddConceptPanel={setShowAddConceptPanel}
              formatDate={formatDate}
              getConceptDetails={getConceptDetails}
              onSendConcept={(conceptId) => openEmailComposer('new_concept', [conceptId])}
              handleUpdateCmNote={handleUpdateCmNote}
              handleUpdateWhyItFits={handleUpdateWhyItFits}
              handleAddConceptNote={handleAddConceptNote}
              justAddedConceptId={justAddedConceptId}
              justProducedConceptId={justProducedConceptId}
              cmDisplayNames={cmDisplayNames}
              brief={{ tone: brief.tone, constraints: brief.constraints, current_focus: brief.current_focus }}
              onNavigateToFeedSlot={(feedOrder) => {
                setWorkspaceSection('feed');
                setHistoryOffset(gridConfig.currentSlotIndex - feedOrder);
              }}
              onBeginFeedPlacement={handleBeginFeedPlacement}
            />
          )}

          {activeSection === 'feed' && (
            <>
              {/* Pending advance badge (Task 9): mark-produced op in progress >60s */}
              {customer.pending_history_advance_at && (() => {
                const startedAt = new Date(customer.pending_history_advance_at).getTime();
                const isStale = Date.now() - startedAt > 60_000;
                if (!isStale) return null;
                return (
                  <div style={{
                    padding: '8px 14px',
                    background: '#fffbeb',
                    border: '1px solid #f59e0b',
                    borderRadius: LeTrendRadius.md,
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <span style={{ fontSize: 14 }}>â³</span>
                    Synkronisering pÃ¥gÃ¥r â€” plan-framflyttning tog lÃ¤ngre tid Ã¤n fÃ¶rvÃ¤ntat.
                  </div>
                );
              })()}
              {!customer.tiktok_profile_url && (
                <div style={{
                  padding: '20px 24px',
                  background: '#fffbeb',
                  border: '1px solid #f59e0b',
                  borderRadius: LeTrendRadius.md,
                  marginBottom: 20,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#92400e', marginBottom: 4 }}>
                    Koppla TikTok-profil
                  </div>
                  <div style={{ fontSize: 13, color: '#b45309', marginBottom: 14, opacity: 0.85 }}>
                    LeTrend hÃ¤mtar kundens klipp automatiskt och skapar motor-signaler nÃ¤r profil-URL:en Ã¤r satt.
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="https://www.tiktok.com/@kund"
                      value={tiktokProfileUrlInput}
                      onChange={e => setTiktokProfileUrlInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleSaveTikTokProfile(); }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #f59e0b',
                        borderRadius: LeTrendRadius.md,
                        fontSize: 13,
                        outline: 'none',
                        background: '#fff',
                      }}
                    />
                    <button
                      onClick={() => void handleSaveTikTokProfile()}
                      disabled={savingTiktokProfile || !tiktokProfileUrlInput.trim()}
                      style={{
                        padding: '8px 18px',
                        background: '#b45309',
                        border: 'none',
                        borderRadius: LeTrendRadius.md,
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        cursor: savingTiktokProfile || !tiktokProfileUrlInput.trim() ? 'not-allowed' : 'pointer',
                        opacity: savingTiktokProfile || !tiktokProfileUrlInput.trim() ? 0.6 : 1,
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {savingTiktokProfile ? 'Sparar...' : 'Koppla profil'}
                    </button>
                  </div>
                </div>
              )}
              <MemoFeedPlannerSection
                customerId={customerId}
              concepts={concepts}
              pendingPlacementConcept={pendingFeedPlacementConcept}
              cmTags={cmTags}
              gridConfig={gridConfig}
              historyOffset={historyOffset}
              setHistoryOffset={setHistoryOffset}
              getConceptDetails={getConceptDetails}
              handleUpdateConceptTags={handleUpdateConceptTags}
              handleUpdateCmNote={handleUpdateCmNote}
              handleUpdateTikTokUrl={handleUpdateTikTokUrl}
              handlePatchConcept={handleUpdateConcept}
              handleMarkProduced={handleMarkProduced}
              handleCheckAndMarkProduced={handleCheckAndMarkProduced}
              handleReconcileHistory={handleReconcileHistory}
              handleUndoHistoryReconciliation={handleUndoHistoryReconciliation}
              handleRemoveFromSlot={handleRemoveFromSlot}
              handleAssignToSlot={handleAssignToSlot}
              handleSwapFeedOrder={handleSwapFeedOrder}
              handleOpenMarkProducedDialog={handleOpenMarkProducedDialog}
              onOpenConcept={handleOpenConceptFromFeed}
              onSlotClick={(slot, concept) => {
                // Acknowledge unread upload regardless of which action follows
                if (concept && hasUnreadUploadMarker(concept)) {
                  void handleUpdateConcept(concept.id, {
                    content_loaded_seen_at: new Date().toISOString()
                  });
                }
                // Empty kommande/nu slot â†’ direct to concept picker, no modal
                if (!concept && slot.feedOrder >= 0) {
                  if (pendingFeedPlacementConcept) {
                    void handleAssignToSlot(pendingFeedPlacementConcept.id, slot.feedOrder);
                    return;
                  }
                  setSelectedFeedSlot(slot.feedOrder);
                  setShowFeedSlotPanel(true);
                  return;
                }
                // Empty past slot (historik) â†’ no-op
                if (!concept) return;
                // Historik â€” context menu handled directly in FeedSlot onClick; no-op here
                if (slot.type === 'history') return;
                // Nu card â€” card + context menu is self-sufficient after E87; suppress modal
                if (slot.type === 'current') return;
                // Kommande â€” open concept detail directly (planning view)
                if (slot.type === 'planned') {
                  handleOpenConceptFromFeed(concept.id);
                  return;
                }
              }}
              showTagManager={showTagManager}
              setShowTagManager={setShowTagManager}
              refreshCmTags={fetchCmTags}
              historyHasMore={historyHasMore}
              fetchingProfileHistory={fetchingProfileHistory}
              onLoadMoreHistory={handleLoadMoreHistory}
              pendingAdvanceCue={pendingAdvanceCue}
              activeNudges={activeNudges}
              autoResolvedNudges={autoResolvedNudges}
              onAdvancePlan={handleAdvancePlan}
              advancingPlan={advancingPlan}
              onDismissAdvanceCue={handleDismissAdvanceCue}
              onDismissAutoResolvedSignals={handleDismissAutoResolvedSignals}
              tempoWeekdays={brief.posting_weekdays != null ? brief.posting_weekdays : DEFAULT_TEMPO_WEEKDAYS}
              isTempoExplicit={brief.posting_weekdays != null}
              onTempoWeekdaysChange={handleSaveTempoWeekdays}
              onOpenKonceptSection={() => setWorkspaceSection('koncept')}
              onCancelPendingPlacement={() => setPendingFeedPlacementConceptId(null)}
            />
            </>
          )}

          {activeSection === 'kommunikation' && (
            <MemoKommunikationSection
              customer={customer}
              emailLog={emailLog}
              emailType={emailType}
              setEmailType={setEmailType}
              emailSubject={emailSubject}
              setEmailSubject={setEmailSubject}
              emailIntro={emailIntro}
              setEmailIntro={setEmailIntro}
              emailOutro={emailOutro}
              setEmailOutro={setEmailOutro}
              selectedConceptIds={selectedConceptIds}
              setSelectedConceptIds={setSelectedConceptIds}
              sendingEmail={sendingEmail}
              previewingEmail={previewingEmail}
              emailPreview={emailPreview}
              showEmailPreview={showEmailPreview}
              setShowEmailPreview={setShowEmailPreview}
              communicationFeedback={communicationFeedback}
              latestEmailJob={latestEmailJob}
              retryingEmailJobId={retryingEmailJobId}
              weeklySchedule={weeklySchedule}
              scheduleDayOfWeek={scheduleDayOfWeek}
              setScheduleDayOfWeek={setScheduleDayOfWeek}
              scheduleSendTime={scheduleSendTime}
              setScheduleSendTime={setScheduleSendTime}
              scheduleSubject={scheduleSubject}
              setScheduleSubject={setScheduleSubject}
              scheduleIntro={scheduleIntro}
              setScheduleIntro={setScheduleIntro}
              scheduleOutro={scheduleOutro}
              setScheduleOutro={setScheduleOutro}
              scheduleActive={scheduleActive}
              setScheduleActive={setScheduleActive}
              scheduleRules={scheduleRules}
              setScheduleRules={setScheduleRules}
              savingSchedule={savingSchedule}
              deletingSchedule={deletingSchedule}
              previewingSchedule={previewingSchedule}
              scheduleFeedback={scheduleFeedback}
              schedulePreview={schedulePreview}
              showSchedulePreview={showSchedulePreview}
              setShowSchedulePreview={setShowSchedulePreview}
              handleSendEmail={handleSendEmail}
              handlePreviewEmail={handlePreviewEmail}
              handleRetryEmailJob={handleRetryEmailJob}
              handleSaveSchedule={handleSaveSchedule}
              handleDeleteSchedule={handleDeleteSchedule}
              handlePreviewSchedule={handlePreviewSchedule}
              getDraftConcepts={getDraftConcepts}
              getConceptDetails={getConceptDetails}
              formatDateTime={formatDateTime}
              cmDisplayNames={cmDisplayNames}
            />
          )}

          {activeSection === 'demo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Header row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <h2 style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: LeTrendColors.brownDark,
                    margin: 0,
                  }}>
                    Demo-fÃ¶rberedelse
                  </h2>
                  <p style={{ fontSize: 13, color: LeTrendColors.textSecondary, margin: '4px 0 0' }}>
                    Pre-seeda feedplanen och fÃ¶rbered kundanpassad demo-sida.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setImportHistoryResult(null); setImportHistoryError(null); setShowImportHistoryModal(true); }}
                    style={{
                      padding: '8px 14px',
                      background: LeTrendColors.surface,
                      border: `1px solid ${LeTrendColors.borderMedium}`,
                      borderRadius: LeTrendRadius.md,
                      fontSize: 13,
                      fontWeight: 500,
                      color: LeTrendColors.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    + Importera TikTok-historik
                  </button>
                  <a
                    href={`/demo/${customerId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 14px',
                      background: LeTrendColors.brownLight,
                      border: 'none',
                      borderRadius: LeTrendRadius.md,
                      fontSize: 13,
                      fontWeight: 600,
                      color: LeTrendColors.cream,
                      cursor: 'pointer',
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                  >
                    Ã–ppna demo-sida â†—
                  </a>
                </div>
              </div>

              {/* TikTok-profil */}
              <div style={{
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                border: `1px solid ${LeTrendColors.border}`,
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  TikTok-profil
                </div>

                {/* Profile URL identity row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={tiktokProfileUrlInput}
                    onChange={e => setTiktokProfileUrlInput(e.target.value)}
                    placeholder="https://www.tiktok.com/@kundenshandle"
                    style={{
                      padding: '7px 10px',
                      borderRadius: LeTrendRadius.md,
                      border: `1px solid ${LeTrendColors.borderMedium}`,
                      fontSize: 13,
                      color: LeTrendColors.textPrimary,
                      width: 260,
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => void handleSaveTikTokProfile()}
                    disabled={savingTiktokProfile}
                    style={{
                      padding: '7px 12px',
                      background: LeTrendColors.surface,
                      border: `1px solid ${LeTrendColors.borderMedium}`,
                      borderRadius: LeTrendRadius.md,
                      fontSize: 12,
                      fontWeight: 500,
                      color: LeTrendColors.textSecondary,
                      cursor: savingTiktokProfile ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingTiktokProfile ? 'Sparar...' : 'Spara'}
                  </button>
                  {customer?.tiktok_handle && (
                    <span style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
                      @{customer.tiktok_handle}
                    </span>
                  )}
                </div>

                {/* Real profile-history fetch â€” primary action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void handleFetchProfileHistory()}
                      disabled={fetchingProfileHistory || !customer?.tiktok_profile_url}
                      title={!customer?.tiktok_profile_url ? 'Spara TikTok-profil URL fÃ¶rst' : undefined}
                      style={{
                        padding: '7px 14px',
                        background: customer?.tiktok_profile_url ? LeTrendColors.brownLight : LeTrendColors.surface,
                        border: customer?.tiktok_profile_url ? 'none' : `1px solid ${LeTrendColors.borderMedium}`,
                        borderRadius: LeTrendRadius.md,
                        fontSize: 12,
                        fontWeight: 600,
                        color: customer?.tiktok_profile_url ? LeTrendColors.cream : LeTrendColors.textMuted,
                        cursor: (fetchingProfileHistory || !customer?.tiktok_profile_url) ? 'not-allowed' : 'pointer',
                        opacity: !customer?.tiktok_profile_url ? 0.5 : 1,
                      }}
                    >
                      {fetchingProfileHistory ? 'HÃ¤mtar TikTok-historik...' : 'HÃ¤mta historik'}
                    </button>
                    {profileHistoryFetchResult && !fetchingProfileHistory && (
                      <span style={{ fontSize: 12, color: profileHistoryFetchResult.imported > 0 ? '#166534' : LeTrendColors.textMuted }}>
                        {profileHistoryFetchResult.imported > 0
                          ? `${profileHistoryFetchResult.imported} nya klipp importerade`
                          : 'Historik Ã¤r uppdaterad'}
                        {profileHistoryFetchResult.skipped > 0 && ` Â· ${profileHistoryFetchResult.skipped} redan finns`}
                      </span>
                    )}
                    {profileHistoryFetchError && !fetchingProfileHistory && (
                      <span style={{ fontSize: 12, color: LeTrendColors.error }}>{profileHistoryFetchError}</span>
                    )}
                    {customer?.last_history_sync_at && !fetchingProfileHistory && !profileHistoryFetchResult && !profileHistoryFetchError && (
                      <span style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
                        {concepts.filter(c => (c.feed_order ?? 1) < 0).length} klipp Â· Senast: {new Date(customer.last_history_sync_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {historyHasMore && !fetchingProfileHistory && (
                    <button
                      onClick={() => void handleLoadMoreHistory()}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '5px 10px',
                        background: 'transparent',
                        border: `1px solid ${LeTrendColors.borderMedium}`,
                        borderRadius: LeTrendRadius.md,
                        fontSize: 11,
                        fontWeight: 500,
                        color: LeTrendColors.textSecondary,
                        cursor: 'pointer',
                      }}
                    >
                      Ladda Ã¤ldre historik
                    </button>
                  )}
                </div>

                {/* hagen-library import â€” separate secondary workflow */}
                <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Importera frÃ¥n hagen-biblioteket
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void handlePreviewSync()}
                      disabled={previewingSync || !customer?.tiktok_handle}
                      title={!customer?.tiktok_handle ? 'Ange och spara ett TikTok-konto fÃ¶rst' : undefined}
                      style={{
                        padding: '6px 10px',
                        background: LeTrendColors.surface,
                        border: `1px solid ${LeTrendColors.borderMedium}`,
                        borderRadius: LeTrendRadius.md,
                        fontSize: 11,
                        fontWeight: 500,
                        color: LeTrendColors.textSecondary,
                        cursor: (previewingSync || !customer?.tiktok_handle) ? 'not-allowed' : 'pointer',
                        opacity: !customer?.tiktok_handle ? 0.5 : 1,
                      }}
                    >
                      {previewingSync ? 'Kollar...' : 'FÃ¶rhandsgranska'}
                    </button>
                    <button
                      onClick={() => void handleSyncHistory()}
                      disabled={syncingHistory || !customer?.tiktok_handle}
                      title={!customer?.tiktok_handle ? 'Ange och spara ett TikTok-konto fÃ¶rst' : undefined}
                      style={{
                        padding: '6px 10px',
                        background: LeTrendColors.surface,
                        border: `1px solid ${LeTrendColors.borderMedium}`,
                        borderRadius: LeTrendRadius.md,
                        fontSize: 11,
                        fontWeight: 500,
                        color: LeTrendColors.textSecondary,
                        cursor: (syncingHistory || !customer?.tiktok_handle) ? 'not-allowed' : 'pointer',
                        opacity: !customer?.tiktok_handle ? 0.5 : 1,
                      }}
                    >
                      {syncingHistory ? 'Syncar...' : 'Synca frÃ¥n hagen'}
                    </button>
                    {syncHistoryResult && (
                      <span style={{ fontSize: 11, color: '#166534' }}>
                        {syncHistoryResult.imported} klipp importerade{syncHistoryResult.skipped > 0 ? `, ${syncHistoryResult.skipped} redan finns` : ''}
                      </span>
                    )}
                    {syncHistoryError && (
                      <span style={{ fontSize: 11, color: LeTrendColors.error }}>{syncHistoryError}</span>
                    )}
                    {syncPreviewError && (
                      <span style={{ fontSize: 11, color: LeTrendColors.error }}>{syncPreviewError}</span>
                    )}
                  </div>
                  {/* Preview result */}
                  {syncPreviewResult && (
                    <div style={{
                      background: LeTrendColors.surface,
                      borderRadius: LeTrendRadius.md,
                      padding: '8px 12px',
                      fontSize: 11,
                      color: LeTrendColors.textSecondary,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      <div style={{ fontWeight: 600, color: LeTrendColors.textPrimary }}>
                        @{syncPreviewResult.handle} â€” {syncPreviewResult.totalMatched} matchade klipp
                        {' Â· '}<span style={{ color: '#166534' }}>{syncPreviewResult.wouldImport} nya</span>
                        {syncPreviewResult.wouldSkip > 0 && (
                          <span style={{ color: LeTrendColors.textMuted }}>, {syncPreviewResult.wouldSkip} redan finns</span>
                        )}
                      </div>
                      {syncPreviewResult.samples.map((s, i) => (
                        <div key={i} style={{ fontSize: 10, color: LeTrendColors.textMuted, fontFamily: 'monospace' }}>
                          {s.source_username ? `@${s.source_username}` : ''}
                          {s.description ? ` â€” ${s.description.slice(0, 60)}${s.description.length > 60 ? 'â€¦' : ''}` : ''}
                          {' '}
                          <span style={{ opacity: 0.6 }}>{s.tiktok_url.replace('https://www.tiktok.com', '').slice(0, 40)}</span>
                        </div>
                      ))}
                      {syncPreviewResult.totalMatched === 0 && syncPreviewResult.availableUsernames && syncPreviewResult.availableUsernames.length > 0 && (
                        <div style={{ marginTop: 2, color: LeTrendColors.textSecondary }}>
                          TillgÃ¤ngliga konton i hagen: {syncPreviewResult.availableUsernames.map(u => `@${u}`).join(', ')}
                        </div>
                      )}
                      {syncPreviewResult.totalMatched === 0 && (!syncPreviewResult.availableUsernames || syncPreviewResult.availableUsernames.length === 0) && (
                        <div style={{ color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
                          Inga klipp hittades i hagen.
                        </div>
                      )}
                      {syncPreviewResult.totalMatched > 0 && syncPreviewResult.wouldImport === 0 && (
                        <div style={{ color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
                          Inga nya klipp att importera.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Feed Timeline */}
              <div style={{
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                border: `1px solid ${LeTrendColors.border}`,
                padding: '20px 20px 16px',
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Feed-tidslinje
                </div>
                <FeedTimeline
                  concepts={getPlacedConcepts()}
                  onAddHistory={() => setShowImportHistoryModal(true)}
                />
              </div>

              {/* Demo URL */}
              <div style={{
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                border: `1px solid ${LeTrendColors.border}`,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: LeTrendColors.textMuted, letterSpacing: '0.06em', marginBottom: 4 }}>
                    PUBLIK DEMO-URL
                  </div>
                  <code style={{
                    fontSize: 13,
                    color: LeTrendColors.textPrimary,
                    background: LeTrendColors.surface,
                    padding: '4px 8px',
                    borderRadius: 4,
                    display: 'block',
                    wordBreak: 'break-all',
                  }}>
                    {typeof window !== 'undefined' ? window.location.origin : ''}/demo/{customerId}
                  </code>
                </div>
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      void navigator.clipboard.writeText(`${window.location.origin}/demo/${customerId}`);
                    }
                  }}
                  style={{
                    padding: '8px 14px',
                    background: LeTrendColors.surface,
                    border: `1px solid ${LeTrendColors.borderMedium}`,
                    borderRadius: LeTrendRadius.md,
                    fontSize: 12,
                    fontWeight: 500,
                    color: LeTrendColors.textSecondary,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Kopiera
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Concept Side Panel */}
      <SidePanel
        isOpen={showAddConceptPanel}
        onClose={() => { setShowAddConceptPanel(false); resetAddConceptPanelState(); }}
        title="LÃ¤gg till koncept"
      >
        {/* Slot context header â€” shown when CM arrived via the slot-aware entry point */}
        {slotAddTargetFeedOrder !== null && (
          <div style={{
            marginBottom: 12,
            padding: '6px 10px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: LeTrendRadius.md,
            fontSize: 12,
            color: '#166534',
          }}>
            VÃ¤ljer fÃ¶r <strong>{getStudioFeedOrderLabel(slotAddTargetFeedOrder)}</strong> â€” konceptet placeras direkt i den sloten
          </div>
        )}
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: LeTrendRadius.md, background: LeTrendColors.surface, border: `1px solid ${LeTrendColors.border}`, fontSize: 12, lineHeight: 1.5 }}>
          {(brief.tone || brief.current_focus || brief.constraints) ? (
            <div style={{ color: LeTrendColors.textSecondary }}>
              <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
              {[brief.tone, brief.current_focus].filter(Boolean).join(' Â· ')}
              {brief.constraints && (
                <div style={{ marginTop: 4, color: LeTrendColors.textMuted }}>
                  <strong style={{ color: LeTrendColors.brownDark }}>BegrÃ¤nsningar:</strong>{' '}{brief.constraints}
                </div>
              )}
            </div>
          ) : (
            <em style={{ color: LeTrendColors.textMuted }}>Brief saknas â€” fyll i kundbriefen i sidopanelen fÃ¶r bÃ¤ttre konceptpassning.</em>
          )}
        </div>
        <input
          ref={addConceptSearchInputRef}
          type="text"
          value={addConceptSearch}
          onChange={(e) => setAddConceptSearch(e.target.value)}
          placeholder="Sök titel, beskrivning eller vibe..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <WorkspaceLibraryFilter label="Svårighet" value={addConceptDifficultyFilter} options={WORKSPACE_DIFFICULTY_OPTIONS} onChange={setAddConceptDifficultyFilter} />
          <WorkspaceLibraryFilter label="Personer" value={addConceptPeopleFilter} options={WORKSPACE_PEOPLE_OPTIONS} onChange={setAddConceptPeopleFilter} />
          <WorkspaceLibraryFilter label="Tid" value={addConceptFilmTimeFilter} options={WORKSPACE_FILM_TIME_OPTIONS} onChange={setAddConceptFilmTimeFilter} />
          <WorkspaceLibraryFilter label="Bransch" value={addConceptBusinessTypeFilter} options={WORKSPACE_BUSINESS_TYPE_OPTIONS} onChange={setAddConceptBusinessTypeFilter} />
          <WorkspaceLibraryFilter label="Manus" value={addConceptScriptFilter} options={WORKSPACE_SCRIPT_OPTIONS} onChange={setAddConceptScriptFilter} />
          <WorkspaceLibraryFilter label="Budget" value={addConceptBudgetFilter} options={WORKSPACE_BUDGET_OPTIONS} onChange={setAddConceptBudgetFilter} />
          <WorkspaceLibraryFilter label="Källa" value={addConceptSourceFilter} options={WORKSPACE_SOURCE_OPTIONS} onChange={setAddConceptSourceFilter} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 12, color: LeTrendColors.textMuted, flexWrap: 'wrap' }}>
          <span>{filteredAddConcepts.length} av {availableAddConcepts.length} koncept</span>
          {activeAddConceptFilterCount > 0 ? (
            <button
              type="button"
              onClick={resetAddConceptFilters}
              style={{
                border: 'none',
                background: 'none',
                color: LeTrendColors.brownLight,
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Rensa filter ({activeAddConceptFilterCount})
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredAddConcepts.map((concept) => (
            <div
              key={concept.id}
              style={{
                background: '#fff',
                borderRadius: LeTrendRadius.md,
                padding: 16,
                border: `1px solid ${LeTrendColors.border}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                <h4 style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: LeTrendColors.brownDark,
                  margin: 0
                }}>
                  {concept.headline_sv || concept.headline}
                </h4>
                <span style={{ fontSize: 11, color: libraryAssignmentCounts[concept.id] > 0 ? LeTrendColors.success : LeTrendColors.textMuted, whiteSpace: 'nowrap' }}>
                  {libraryAssignmentCounts[concept.id] > 0
                    ? `${libraryAssignmentCounts[concept.id]} kund${libraryAssignmentCounts[concept.id] > 1 ? 'er' : ''}`
                    : 'Ej tilldelad'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {concept.mechanism && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#7c3aed', fontWeight: 600 }}>
                    {display.mechanism(concept.mechanism).label}
                  </span>
                )}
                {concept.businessTypes.slice(0, 2).map((businessType) => (
                  <span key={businessType} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#f5f1eb', border: `1px solid ${LeTrendColors.border}`, color: LeTrendColors.brownDark, fontWeight: 600 }}>
                    {display.businessType(businessType).label}
                  </span>
                ))}
                {concept.vibeAlignments.slice(0, 2).map((vibe) => (
                  <span key={vibe} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                    {vibe}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: LeTrendColors.textMuted, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{display.difficulty(concept.difficulty).label}</span>
                <span>·</span>
                <span>{display.filmTime(concept.filmTime).label}</span>
                <span>·</span>
                <span>{display.peopleNeeded(concept.peopleNeeded).label}</span>
                <span>·</span>
                <span>{concept.hasScript ? 'Med manus' : 'Utan manus'}</span>
                {concept.source ? (
                  <>
                    <span>·</span>
                    <span>{concept.source === 'hagen' ? 'LeTrend' : 'CM-skapat'}</span>
                  </>
                ) : null}
                {concept.trendLevel >= 4 && (
                  <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontWeight: 600 }}>
                    {display.trendLevel(concept.trendLevel).icon} {display.trendLevel(concept.trendLevel).label}
                  </span>
                )}
              </div>
              {concept.description_sv && (
                <p style={{
                  fontSize: 12,
                  color: LeTrendColors.textSecondary,
                  margin: '0 0 12px',
                  lineHeight: 1.5
                }}>
                  {concept.description_sv.length > 100 ? concept.description_sv.substring(0, 100) + '...' : concept.description_sv}
                </p>
              )}
              <button
                onClick={() => handleAddConcept(concept.id, slotAddTargetFeedOrder ?? undefined)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: LeTrendColors.brownLight,
                  color: '#fff',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {slotAddTargetFeedOrder !== null ? `+ Lägg till i ${getStudioFeedOrderLabel(slotAddTargetFeedOrder)}` : '+ Lägg till koncept'}
              </button>
            </div>
          ))}
          {filteredAddConcepts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: LeTrendColors.textMuted, fontSize: 13 }}>
              Inga koncept matchar det aktuella urvalet.
            </div>
          )}
        </div>
      </SidePanel>

      {/* Feed Slot Assignment Panel */}
      <SidePanel
        isOpen={showFeedSlotPanel}
        onClose={() => {
          setShowFeedSlotPanel(false);
          setSelectedFeedSlot(null);
        }}
        title={selectedFeedSlot !== null
          ? `VÃ¤lj kunduppdrag fÃ¶r ${getStudioFeedOrderLabel(selectedFeedSlot)}`
          : 'VÃ¤lj kunduppdrag fÃ¶r plan-slot'}
      >
        {selectedFeedSlot !== null && (
          <div style={{ margin: '0 0 12px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: LeTrendColors.textSecondary }}>
              {getCustomerConceptPlacementLabel(selectedFeedSlot, 'studio') ?? 'Planen'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: LeTrendColors.textMuted, lineHeight: 1.5 }}>
              {getStudioFeedOrderDescription(selectedFeedSlot)}
            </p>
          </div>
        )}
        {getDraftConcepts().length === 0 ? (
          <p style={{ color: LeTrendColors.textSecondary, fontSize: 14 }}>
            Inga ej-placerade utkast finns. LÃ¤gg till eller frigÃ¶r ett kunduppdrag fÃ¶rst.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {getDraftConcepts().map(concept => {
              const details = getWorkspaceConceptDetails(concept, getConceptDetails);
              return (
                <button
                  key={concept.id}
                  onClick={() => selectedFeedSlot !== null && handleAssignToFeedOrder(concept.id, selectedFeedSlot)}
                style={{
                  background: '#fff',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: LeTrendColors.brownDark
                }}>
                  {getWorkspaceConceptTitle(concept, details ?? null)}
                </div>
              </button>
            );
          })}
        </div>
        )}
        {/* Secondary entry point: add a brand-new concept from the library directly
            into this slot. Stores the target feed_order before opening the library
            panel so the add action can place the concept immediately on creation. */}
        <div style={{ marginTop: 16, borderTop: `1px solid ${LeTrendColors.border}`, paddingTop: 12 }}>
          <button
            onClick={() => {
              if (selectedFeedSlot === null) return;
              setSlotAddTargetFeedOrder(selectedFeedSlot);
              setShowFeedSlotPanel(false);
              setSelectedFeedSlot(null);
              setShowAddConceptPanel(true);
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'none',
              border: `1px dashed ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              color: LeTrendColors.textSecondary,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            + LÃ¤gg till nytt koncept frÃ¥n biblioteket
          </button>
        </div>
      </SidePanel>

      <ConceptEditWizard
        isOpen={Boolean(editingConceptId)}
        concept={editingConcept}
        details={editingConceptDetails}
        initialSections={editorInitialSections}
        onClose={() => setEditingConceptId(null)}
        onSave={handleUpdateConcept}
      />


      {/* Mark Produced Dialog (Task 5) */}
      {markProducedDialogConceptId && (
        <MarkProducedDialog
          isOpen={markProducedDialogOpen}
          onClose={handleCloseMarkProducedDialog}
          nuConceptId={markProducedDialogConceptId}
          customerId={customerId}
          importedConcepts={concepts.filter((c) => c.row_kind === 'imported_history' && !c.reconciliation.is_reconciled)}
          freshestImportedConcept={
            concepts
              .filter((c) => c.row_kind === 'imported_history' && !c.reconciliation.is_reconciled && c.result.published_at)
              .sort((a, b) => new Date(b.result.published_at!).getTime() - new Date(a.result.published_at!).getTime())[0] ?? null
          }
          onMarkProduced={handleMarkProduced}
          onReconcileHistory={handleReconcileHistory}
        />
      )}

      {/* Import TikTok History Modal */}
      <CustomerImportHistoryModal
        isOpen={showImportHistoryModal}
        importHistoryJson={importHistoryJson}
        setImportHistoryJson={setImportHistoryJson}
        importingHistory={importingHistory}
        importHistoryError={importHistoryError}
        importHistoryResult={importHistoryResult}
        clearError={() => setImportHistoryError(null)}
        onClose={() => { setShowImportHistoryModal(false); setImportHistoryResult(null); }}
        onImportHistory={handleImportHistory}
        onFetchFromHagen={handleFetchFromHagen}
        fetchingFromHagen={fetchingFromHagen}
        fetchFromHagenError={fetchFromHagenError ?? null}
        fetchedFromUsernames={fetchedFromUsernames}
      />
    </div>
  );
}

function WorkspacePageFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
      Laddar kundarbetsyta...
    </div>
  );
}


