'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadConcepts as loadConceptsFromDB } from '@/lib/conceptLoaderDB';
import type { TranslatedConcept } from '@/lib/translator';
import { display } from '@/lib/display';
import { FeedTimeline } from '@/components/studio/FeedTimeline';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { SidePanel } from '@/components/studio-v2/SidePanel';
import { AutoSaveTextarea } from '@/components/studio-v2/AutoSaveTextarea';
import { ConceptEditWizard } from '@/components/studio-v2/ConceptEditWizard';
import { StatusChip } from '@/components/studio-v2/StatusChip';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { GamePlanEditor } from '@/components/gameplan-editor/GamePlanEditor';
import { clearClientCache, fetchAndCacheClient, readClientCache, writeClientCache } from '@/lib/client-cache';
import type {
  CustomerBrief,
  CustomerConcept,
  CustomerGamePlanSummary,
  CustomerNote,
  CustomerProfile,
  EmailJobEntry,
  EmailLogEntry,
  Section,
  GridConfig,
  CmTag,
  FeedSlot,
  FeedSpan
} from '@/types/studio-v2';
import { DEFAULT_GRID_CONFIG, SPAN_COLOR_PALETTE } from '@/types/studio-v2';
import { classifyMotorSignal } from '@/lib/studio/motor-signal';
import type { MotorSignalKind } from '@/lib/studio/motor-signal';
import { buildSlotMap, projectTempoDate, DEFAULT_TEMPO_WEEKDAYS, TEMPO_PRESETS, globalFracToProjectedDate, dateToGlobalFrac } from '@/lib/feed-planner-utils';
import {
  getNextCustomerConceptAssignmentStatus,
  getCustomerConceptAssignmentLabel,
  getCustomerConceptPlacementLabel,
  getStudioFeedOrderDescription,
  getStudioFeedOrderLabel,
} from '@/lib/customer-concept-lifecycle';
import { resolveConceptContent, type ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import { getStudioCustomerStatusMeta } from '@/lib/studio/customer-status';
import {
  calculateSlotCenters,
  buildCurvePath,
  buildSegmentPaths,
  buildGradients,
  updateGradientPositions
} from '@/lib/eel-renderer';
import { createSpanHandlers, fracToY as spanFracToY } from '@/components/studio-v2/SpanHandlers';
import type { SpanHandlerRefs } from '@/components/studio-v2/SpanHandlers';
import { TagManager } from '@/features/studio/customer-workspace/components/TagManager';
import {
  buildStudioWorkspaceHref,
  STUDIO_WORKSPACE_SECTIONS,
  getStudioWorkspaceSection,
  getStudioWorkspaceSectionMeta,
} from '@/lib/studio/navigation';
import {
  getStudioCustomerConceptDisplayTitle,
  getStudioCustomerConceptSourceConceptId,
  isStudioAssignedCustomerConcept,
} from '@/lib/studio/customer-concepts';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import {
  EMAIL_TEMPLATES,
  WORKSPACE_CACHE_MAX_STALE_MS,
  WORKSPACE_CACHE_TTL_MS,
  WorkspaceCustomerProfile,
  WorkspaceGamePlanResponse,
  hasUnreadUploadMarker,
  hexToRgba,
} from './shared';
import { CustomerImportHistoryModal } from './CustomerImportHistoryModal';

type PositionedEelGradient = ReturnType<typeof updateGradientPositions>[number];
type InlineFeedbackTone = 'success' | 'warning' | 'error' | 'info';

type InlineFeedback = {
  tone: InlineFeedbackTone;
  text: string;
};
/*
  {
    id: 'new_concept',
    name: 'Nytt koncept',
    subject: 'Nytt koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till ett nytt koncept som vi tror passar perfekt för er verksamhet.',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'new_concepts',
    name: 'Nya koncept',
    subject: 'Nya koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till {{count}} nya koncept för er!',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'gameplan_updated',
    name: 'Game Plan uppdaterad',
    subject: 'Uppdaterad gameplan för {{business_name}} - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nDin Game Plan har uppdaterats. Kolla in de senaste uppdateringarna!',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'weekly_summary',
    name: 'Veckosammanfattning',
    subject: 'Veckoupdatering - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nHär är en sammanfattning av veckan som gick:',
    outro: '\n\nTack för ett bra samarbete!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'custom',
    name: 'Eget meddelande',
    subject: '',
    intro: '',
    outro: ''
  }
];

const WORKSPACE_CACHE_TTL_MS = 45_000;
const WORKSPACE_CACHE_MAX_STALE_MS = 5 * 60_000;
*/

function formatWorkspaceShortId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? value : value.slice(0, 8);
}

function getWorkspaceConceptDetails(
  concept: CustomerConcept | null | undefined,
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined
): TranslatedConcept | undefined {
  const sourceConceptId = concept ? getStudioCustomerConceptSourceConceptId(concept) : null;
  return sourceConceptId ? getConceptDetails(sourceConceptId) : undefined;
}

function getWorkspaceConceptTitle(
  concept: CustomerConcept,
  details?: Pick<TranslatedConcept, 'headline' | 'headline_sv'> | null
): string {
  return getStudioCustomerConceptDisplayTitle(
    concept,
    details?.headline_sv || details?.headline || null
  );
}

function getInlineFeedbackStyle(tone: InlineFeedbackTone) {
  switch (tone) {
    case 'success':
      return {
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        color: '#047857',
      };
    case 'warning':
      return {
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.24)',
        color: '#92400e',
      };
    case 'error':
      return {
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        color: '#b91c1c',
      };
    case 'info':
    default:
      return {
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        color: '#1d4ed8',
      };
  }
}

function formatCompactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

function getOperatorNextStepLabel(concept: CustomerConcept): string {
  const assignment = concept.assignment;
  const placement = concept.placement;
  const result = concept.result;

  if (assignment.status === 'archived') {
    return 'Ingen aktiv nästa handling i CM-flödet.';
  }

  if (assignment.status === 'produced' || result.produced_at) {
    return result.published_at
      ? 'Klippet är publicerat. Flytta bara om du justerar historiken.'
      : 'Klippet är producerat. Sätt publicerat datum eller TikTok-länk när det är live.';
  }

  if (assignment.status === 'sent') {
    if (placement.feed_order === 0) {
      return 'Kunden har fått uppdraget. Nästa steg är att markera slotten som producerad.';
    }

    if (typeof placement.feed_order === 'number' && placement.feed_order > 0) {
      return 'Kunden har fått uppdraget. Håll slotten uppdaterad tills den når nu-slot.';
    }

    return 'Kunden har fått uppdraget. Placera uppdraget i planen när det ska bli synligt.';
  }

  if (typeof placement.feed_order === 'number') {
    return placement.feed_order === 0
      ? 'Uppdraget ligger i nu-slot. Dela det med kunden om det ska vara kundsynligt.'
      : 'Uppdraget ligger redan i planen. Dela det med kunden när det ska bli kundsynligt.';
  }

  return 'Redigera uppdraget och dela eller planera det som nästa steg.';
}

interface CMIdentity {
  name: string;
  avatarUrl?: string;
  color?: string;
}

function renderCmBadge(identity: CMIdentity): React.ReactNode {
  const initials = identity.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {identity.avatarUrl ? (
        <img
          src={identity.avatarUrl}
          alt={identity.name}
          style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          background: identity.color || '#4f46e5',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0
        }}>
          {initials}
        </span>
      )}
      <span>{identity.name}</span>
    </span>
  );
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

  // Data state
  const [customer, setCustomer] = useState<WorkspaceCustomerProfile | null>(null);
  const [brief, setBrief] = useState<CustomerBrief>({ tone: '', constraints: '', current_focus: '' });
  const [concepts, setConcepts] = useState<CustomerConcept[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [allConcepts, setAllConcepts] = useState<TranslatedConcept[]>([]);
  const [gamePlanHtml, setGamePlanHtml] = useState('');
  const [gamePlanSummary, setGamePlanSummary] = useState<CustomerGamePlanSummary | null>(null);
  const [cmDisplayNames, setCmDisplayNames] = useState<Record<string, CMIdentity>>({});

  // UI state
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const urlSection = searchParams.get('section');
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
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(() =>
    searchParams.get('justAdded') ?? null
  );
  const [justAddedConceptId, setJustAddedConceptId] = useState<string | null>(() =>
    searchParams.get('justAdded') ?? null
  );
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editorInitialSections, setEditorInitialSections] = useState<ConceptSectionKey[]>([
    'script',
    'instructions',
    'fit'
  ]);
  const [showAddConceptPanel, setShowAddConceptPanel] = useState(false);
  const [addConceptSearch, setAddConceptSearch] = useState('');
  const [showFeedSlotPanel, setShowFeedSlotPanel] = useState(false);
  const [selectedFeedSlot, setSelectedFeedSlot] = useState<number | null>(null);
  // When CM enters the library panel via "Lägg till nytt koncept" from a slot, this
  // remembers the target slot so the new concept can be placed immediately on add.
  const [slotAddTargetFeedOrder, setSlotAddTargetFeedOrder] = useState<number | null>(null);

  // Feed planner state (nya)
  const [gridConfig, setGridConfig] = useState<GridConfig>(DEFAULT_GRID_CONFIG);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [cmTags, setCmTags] = useState<CmTag[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);

  // Notes state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Email state
  const [emailType, setEmailType] = useState('new_concept');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailJobs, setEmailJobs] = useState<EmailJobEntry[]>([]);
  const [retryingEmailJobId, setRetryingEmailJobId] = useState<string | null>(null);
  const [communicationFeedback, setCommunicationFeedback] = useState<InlineFeedback | null>(null);

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
  const [pendingAdvanceCue, setPendingAdvanceCue] = useState<{ imported: number; kind: MotorSignalKind; publishedAt: string | null } | null>(null);
  const [advancingPlan, setAdvancingPlan] = useState(false);

  // Derive cue from backend truth whenever the customer profile changes.
  // Shows the nudge when there is unseen pending evidence; hides it otherwise.
  // seen_at is cleared by sync on new evidence, so fresh clips always re-surface.
  // No guard — allows count to update if a new sync arrives while the cue is already showing.
  useEffect(() => {
    if (customer?.pending_history_advance && !customer.pending_history_advance_seen_at) {
      const kind = classifyMotorSignal(customer) ?? 'fresh_activity';
      setPendingAdvanceCue({ imported: customer.pending_history_advance, kind, publishedAt: customer.pending_history_advance_published_at ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.pending_history_advance, customer?.pending_history_advance_seen_at, customer?.pending_history_advance_published_at]);
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
    const urlSection = searchParams.get('section');
    if (urlSection) {
      setActiveSection(getStudioWorkspaceSection(urlSection));
    }
  }, [searchParams]);

  // Auto-populate email fields when template changes
  useEffect(() => {
    const template = EMAIL_TEMPLATES.find(t => t.id === emailType);
    if (!template || !customer || emailType === 'custom') return;

    const count = selectedConceptIds.length || 0;
    const countText = count === 1 ? 'ett' :
                      count === 2 ? 'två' :
                      count === 3 ? 'tre' :
                      count === 4 ? 'fyra' :
                      count === 5 ? 'fem' : String(count);
    const businessName = customer.business_name || 'er verksamhet';
    const contactName = customer.customer_contact_name ? ` ${customer.customer_contact_name}` : '';
    const week = getWeekNumber();

    // For new_concepts, use Swedish text in subject
    let finalSubject = template.subject;
    if (emailType === 'new_concepts' && count > 0) {
      finalSubject = `${countText.charAt(0).toUpperCase() + countText.slice(1)} nya koncept - LeTrend`;
    }

    setEmailSubject(
      finalSubject
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', String(count))
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName)
    );

    const intro = template.intro
      .replace('{{business_name}}', businessName)
      .replace('{{count}}', count > 0 ? countText : 'nya')
      .replace('{{week}}', String(week))
      .replace('{{contact_name}}', contactName);

    setEmailBody(intro + template.outro);
  }, [emailType, customer, selectedConceptIds.length]);

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
          fetchEmailJobs(hasCachedState)
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
        const dbConcepts = await loadConceptsFromDB();
        setAllConcepts(dbConcepts);
      };

      void loadConceptLibrary();
    }
  }, [customerId]);

  // Auto-fetch real customer profile history on first open — only when no history exists yet.
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
        if (!res.ok) throw new Error(data?.error || 'Historik-hämtning misslyckades');
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

  const fetchGridConfig = async (force = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cacheKey = `studio-v2:workspace:cm:${user.id}:grid-config`;
      const cached = readClientCache<GridConfig>(cacheKey, {
        allowExpired: true,
        maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS
      });

      if (cached?.value) {
        // Always enforce canonical currentSlotIndex — stored value may be stale (e.g. old 2→4 migration)
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
  };

  const fetchCmTags = async (force = false) => {
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
  };

  // Load feed planner data (grid config and tags)
  useEffect(() => {
    const loadFeedPlannerData = async () => {
      await Promise.allSettled([fetchGridConfig(), fetchCmTags()]);
    };

    void loadFeedPlannerData();
  }, []);

  // Load CM identity once for note/email/concept attribution badges.
  // Pass 1: team_members — preferred (name + avatar_url + color for badge rendering)
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
      setGamePlanError('Kunde inte ladda Game Plan. Visar senaste kända version om den finns.');
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

  // Soft tempo cadence — saves posting_weekdays to brief JSONB (display-only, never writes to planned_publish_at)
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
        body: JSON.stringify({ content: newNoteContent })
      });

      if (!response.ok) throw new Error('Failed to add note');

      await fetchNotes(true);
      setNewNoteContent('');
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Kunde inte lägga till notering');
    } finally {
      setAddingNote(false);
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
      alert('Kunde inte lägga till notering');
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
      setAddConceptSearch('');

      // Auto-expand the new concept and signal post-add note nudge
      if (data?.concept?.id) {
        setExpandedConceptId(data.concept.id);
        setJustAddedConceptId(data.concept.id);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Kunde inte lägga till koncept');
    }
  };

  const handleUpdateConcept = async (conceptId: string, updates: Partial<CustomerConcept>) => {
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
      console.error('Error updating concept:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte uppdatera koncept');
    }
  };

  const handleDeleteConcept = async (conceptId: string) => {
    if (!confirm('Ta bort detta koncept från kunden?')) return;

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
      const tiktokUrl = prompt('Ange TikTok URL:');
      await handleUpdateConcept(conceptId, {
        status: newStatus,
        tiktok_url: tiktokUrl || undefined
      });
    } else {
      await handleUpdateConcept(conceptId, { status: newStatus });
    }
  };

  // Feed planner handlers (uppdaterade för feed_order)
  const handleAssignToFeedOrder = async (conceptId: string, feedOrder: number) => {
    await handleUpdateConcept(conceptId, { feed_order: feedOrder });
    setShowFeedSlotPanel(false);
    setSelectedFeedSlot(null);
  };

  const handleRemoveFromSlot = async (conceptId: string) => {
    await handleUpdateConcept(conceptId, { feed_order: null });
  };

  const handleAssignToSlot = async (conceptId: string, feedOrder: number) => {
    await handleUpdateConcept(conceptId, { feed_order: feedOrder });
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
    } catch (err) {
      console.error('Error marking as produced:', err);
      alert('Kunde inte markera som producerat');
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

  const setWorkspaceSection = (section: Section) => {
    setActiveSection(section);
    router.replace(buildStudioWorkspaceHref(customerId, section));
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`studio:workspace:last-section:${customerId}`, section);
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

  // Build email HTML with concept details
  const buildEmailHtml = () => {
    let html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">`;

    // Main body text (convert newlines to <br>)
    html += `<div style="margin-bottom: 24px; line-height: 1.6;">${emailBody.replace(/\n/g, '<br>')}</div>`;

    // Attached concepts
    if (selectedConceptIds.length > 0) {
      html += `<div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #f0efe9;">`;
      html += `<h3 style="font-size: 16px; color: #4A2F18; margin-bottom: 16px;">Bifogade koncept</h3>`;

      selectedConceptIds.forEach(ccId => {
        const customerConcept = concepts.find(c => c.id === ccId);
        if (!customerConcept) return;

        const details = getWorkspaceConceptDetails(customerConcept, getConceptDetails);
        if (!details) return;

        const resolved = resolveConceptContent(customerConcept, details);
        const headline = resolved.script.headline_sv || details.headline;
        const whyItWorks = resolved.fit.whyItWorks_sv;
        const instructions = resolved.instructions.filming_instructions;

        html += `<div style="background: #FAF8F5; border-radius: 8px; padding: 16px; margin-bottom: 16px; border: 1px solid #e5e4e1;">`;
        html += `<h4 style="font-size: 15px; color: #4A2F18; margin: 0 0 8px;">${headline}</h4>`;

        if (whyItWorks) {
          html += `<p style="font-size: 14px; color: #5D3A1A; margin: 0 0 8px; line-height: 1.5;"><strong>Varför det funkar:</strong> ${whyItWorks}</p>`;
        }

        if (instructions) {
          html += `<p style="font-size: 14px; color: #5D3A1A; margin: 0; line-height: 1.5;"><strong>Filmtips:</strong> ${instructions}</p>`;
        }

        html += `</div>`;
      });

      html += `</div>`;
    }

    // Footer
    html += `<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e4e1; font-size: 12px; color: #7D6E5D;">`;
    html += `<img src="https://letrend.se/lt-transparent.png" alt="LeTrend" style="width: 24px; height: 24px; margin-bottom: 8px;">`;
    html += `<p style="margin: 0;">LeTrend - Kreativa koncept för TikTok</p>`;
    html += `</div>`;

    html += `</div>`;

    return html;
  };

  // Email handlers
  const handleSendEmail = async () => {
    if (sendingEmail) return;

    const recipientEmail = customer?.contact_email?.trim();
    const trimmedSubject = emailSubject.trim();
    const trimmedBody = emailBody.trim();
    const conceptIds = Array.from(new Set(selectedConceptIds));

    if (!recipientEmail) {
      alert('Kunden saknar email-adress');
      return;
    }

    if (!trimmedSubject || !trimmedBody) {
      alert('Ämne och innehåll är obligatoriska');
      return;
    }

    if (trimmedSubject.length > 250) {
      alert('Ämnet är för långt (max 250 tecken)');
      return;
    }

    if (trimmedBody.length > 20_000) {
      alert('Innehållet är för långt (max 20 000 tecken)');
      return;
    }

    setSendingEmail(true);
    setCommunicationFeedback(null);
    try {
      const emailHtml = buildEmailHtml();

      const response = await fetch('/api/studio-v2/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          subject: trimmedSubject,
          body_html: emailHtml,
          concept_ids: conceptIds
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      const feedbackText = [
        data.message || 'Email köat för utskick.',
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
      setEmailBody('');
      setSelectedConceptIds([]);
      setEmailType('new_concept');
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
        throw new Error(data.error || 'Kunde inte köa om email-jobbet');
      }

      await fetchEmailJobs(true);
      setCommunicationFeedback({
        tone: 'info',
        text: data.message || 'Email-jobbet har köats om.',
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
      if (!Array.isArray(clips)) throw new Error('Måste vara en JSON-array');
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
      if (!res.ok) throw new Error(data?.error || 'Kunde inte hämta klipp från hagen');
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
      if (!res.ok) throw new Error(data?.error || 'Historik-hämtning misslyckades');
      const imported = data.imported ?? 0;
      setProfileHistoryFetchResult({ fetched: data.fetched ?? 0, imported, skipped: data.skipped ?? 0 });
      setHistoryHasMore(data.has_more ?? false);
      setHistoryNextCursor(data.cursor ?? null);
      // Cue is derived from backend via the customer profile effect — no direct set needed here.
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

  // Dismiss the nudge without advancing. Clears local state immediately (optimistic),
  // then persists the acknowledgement to the backend so the cue does not reappear on reload.
  // The pending_history_advance signal is kept on the server — evidence is not erased.
  const handleDismissAdvanceCue = () => {
    setPendingAdvanceCue(null);
    if (customerId) {
      void fetch(`/api/studio-v2/customers/${customerId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge_advance_cue: true }),
      }).catch((err) => console.error('Acknowledge advance cue error:', err));
    }
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
      if (!res.ok) throw new Error(data?.error || 'Historik-hämtning misslyckades');
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
      // Cue is derived from backend via the customer profile effect — no direct set needed here.
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
      if (!res.ok) throw new Error(data?.error || 'Förhandsvisning misslyckades');
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
    } catch (err) {
      console.error('Error saving game plan:', err);
      setGamePlanError('Kunde inte spara Game Plan. Försök igen.');
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
    // Parse [text](url) format to clickable links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: LeTrendColors.brownLight,
            textDecoration: 'underline'
          }}
        >
          {match[1]}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
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
              Pris: {customer.monthly_price > 0 ? `${customer.monthly_price} kr/mån` : 'Pris ej satt'}
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
                {concepts.length} koncept{draftCount > 0 ? ` · ${draftCount} utkast` : ''}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              {formatLastEmailSent(emailLog[0]?.sent_at)}
            </div>

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              {gamePlanHtml.length > 50 ? 'Game Plan: skrivet' : 'Game Plan: ej påbörjat'}
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
                    Känsla och ton
                  </label>
                  <AutoSaveTextarea
                    value={brief.tone}
                    onChange={(val) => setBrief({ ...brief, tone: val })}
                    onSave={(val) => handleSaveBrief('tone', val)}
                    rows={2}
                    placeholder='T.ex. "Humor, relatable, livsstilsinspirerat — inte för säljigt"'
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textSecondary, display: 'block', marginBottom: 4 }}>
                    Begränsningar
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
                    Periodens ingång — syns som intro i kundens feed
                  </label>
                  <AutoSaveTextarea
                    value={brief.current_focus}
                    onChange={(val) => setBrief({ ...brief, current_focus: val })}
                    onSave={(val) => handleSaveBrief('current_focus', val)}
                    rows={2}
                    placeholder='T.ex. "Den här perioden fokuserar vi på format som bygger trovärdighet inför höst..."'
                  />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
                {!brief.tone && !brief.constraints && !brief.current_focus ? (
                  <>
                    <em>Ingen brief ifylld än</em>
                    {gamePlanHtml.length > 200 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ marginBottom: 6, fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.5 }}>
                          Du har ett Game Plan — fyll i kundbriefen för bättre konceptpassning.
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
                    {brief.tone && <div style={{ marginBottom: 8 }}><strong>Känsla och ton:</strong> {brief.tone}</div>}
                    {brief.constraints && <div style={{ marginBottom: 8 }}><strong>Begränsningar:</strong> {brief.constraints}</div>}
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

          {/* Section content will be rendered here based on activeSection */}
          {activeSection === 'gameplan' && (
            <GamePlanSection
              notes={notes}
              gamePlanHtml={gamePlanHtml}
              gamePlanSummary={gamePlanSummary}
              setGamePlanHtml={setGamePlanHtml}
              editingGamePlan={editingGamePlan}
              setEditingGamePlan={setEditingGamePlan}
              loadingGamePlan={loadingGamePlan}
              savingGamePlan={savingGamePlan}
              gamePlanError={gamePlanError}
              gamePlanSaveMessage={gamePlanSaveMessage}
              hasUnsavedGamePlanChanges={hasUnsavedGamePlanChanges}
              handleReloadGamePlan={fetchGamePlan}
              handleSaveGamePlan={handleSaveGamePlan}
              handleCancelGamePlanEdit={handleCancelGamePlanEdit}
              newNoteContent={newNoteContent}
              setNewNoteContent={setNewNoteContent}
              addingNote={addingNote}
              handleAddNote={handleAddNote}
              handleDeleteNote={handleDeleteNote}
              parseMarkdownLinks={parseMarkdownLinks}
              formatDateTime={formatDateTime}
              cmDisplayNames={cmDisplayNames}
            />
          )}

          {activeSection === 'koncept' && (
            <KonceptSection
              concepts={concepts}
              expandedConceptId={expandedConceptId}
              setExpandedConceptId={setExpandedConceptId}
              handleDeleteConcept={handleDeleteConcept}
              handleChangeStatus={handleChangeStatus}
              openConceptEditor={openConceptEditor}
              setShowAddConceptPanel={setShowAddConceptPanel}
              formatDate={formatDate}
              getConceptDetails={getConceptDetails}
              onSendConcept={(conceptId) => {
                setSelectedConceptIds([conceptId]);
                setWorkspaceSection('kommunikation');
              }}
              handleUpdateCmNote={handleUpdateCmNote}
              handleUpdateWhyItFits={handleUpdateWhyItFits}
              handleAddConceptNote={handleAddConceptNote}
              justAddedConceptId={justAddedConceptId}
              cmDisplayNames={cmDisplayNames}
              brief={{ tone: brief.tone, constraints: brief.constraints, current_focus: brief.current_focus }}
            />
          )}

          {activeSection === 'feed' && (
            <>
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
                    LeTrend hämtar kundens klipp automatiskt och skapar motor-signaler när profil-URL:en är satt.
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
              <FeedPlannerSection
                customerId={customerId}
              concepts={concepts}
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
              handleRemoveFromSlot={handleRemoveFromSlot}
              handleAssignToSlot={handleAssignToSlot}
              onOpenConcept={handleOpenConceptFromFeed}
              onSlotClick={(slot, concept, details) => {
                // Acknowledge unread upload regardless of which action follows
                if (concept && hasUnreadUploadMarker(concept)) {
                  void handleUpdateConcept(concept.id, {
                    content_loaded_seen_at: new Date().toISOString()
                  });
                }
                // Empty kommande/nu slot → direct to concept picker, no modal
                if (!concept && slot.feedOrder >= 0) {
                  setSelectedFeedSlot(slot.feedOrder);
                  setShowFeedSlotPanel(true);
                  return;
                }
                // Empty past slot (historik) → no-op
                if (!concept) return;
                // Historik — context menu handled directly in FeedSlot onClick; no-op here
                if (slot.type === 'history') return;
                // Nu card — card + context menu is self-sufficient after E87; suppress modal
                if (slot.type === 'current') return;
                // Kommande — open concept detail directly (planning view)
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
              onAdvancePlan={handleAdvancePlan}
              advancingPlan={advancingPlan}
              onDismissAdvanceCue={handleDismissAdvanceCue}
              tempoWeekdays={brief.posting_weekdays != null ? brief.posting_weekdays : DEFAULT_TEMPO_WEEKDAYS}
              isTempoExplicit={brief.posting_weekdays != null}
              onTempoWeekdaysChange={handleSaveTempoWeekdays}
            />
            </>
          )}

          {activeSection === 'kommunikation' && (
            <KommunikationSection
              customer={customer}
              emailLog={emailLog}
              emailType={emailType}
              setEmailType={setEmailType}
              emailSubject={emailSubject}
              setEmailSubject={setEmailSubject}
              emailBody={emailBody}
              setEmailBody={setEmailBody}
              selectedConceptIds={selectedConceptIds}
              setSelectedConceptIds={setSelectedConceptIds}
              sendingEmail={sendingEmail}
              communicationFeedback={communicationFeedback}
              latestEmailJob={latestEmailJob}
              retryingEmailJobId={retryingEmailJobId}
              handleSendEmail={handleSendEmail}
              handleRetryEmailJob={handleRetryEmailJob}
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
                    Demo-förberedelse
                  </h2>
                  <p style={{ fontSize: 13, color: LeTrendColors.textSecondary, margin: '4px 0 0' }}>
                    Pre-seeda feedplanen och förbered kundanpassad demo-sida.
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
                    Öppna demo-sida ↗
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

                {/* Real profile-history fetch — primary action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void handleFetchProfileHistory()}
                      disabled={fetchingProfileHistory || !customer?.tiktok_profile_url}
                      title={!customer?.tiktok_profile_url ? 'Spara TikTok-profil URL först' : undefined}
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
                      {fetchingProfileHistory ? 'Hämtar TikTok-historik...' : 'Hämta historik'}
                    </button>
                    {profileHistoryFetchResult && !fetchingProfileHistory && (
                      <span style={{ fontSize: 12, color: profileHistoryFetchResult.imported > 0 ? '#166534' : LeTrendColors.textMuted }}>
                        {profileHistoryFetchResult.imported > 0
                          ? `${profileHistoryFetchResult.imported} nya klipp importerade`
                          : 'Historik är uppdaterad'}
                        {profileHistoryFetchResult.skipped > 0 && ` · ${profileHistoryFetchResult.skipped} redan finns`}
                      </span>
                    )}
                    {profileHistoryFetchError && !fetchingProfileHistory && (
                      <span style={{ fontSize: 12, color: LeTrendColors.error }}>{profileHistoryFetchError}</span>
                    )}
                    {customer?.last_history_sync_at && !fetchingProfileHistory && !profileHistoryFetchResult && !profileHistoryFetchError && (
                      <span style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
                        {concepts.filter(c => (c.feed_order ?? 1) < 0).length} klipp · Senast: {new Date(customer.last_history_sync_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                      Ladda äldre historik
                    </button>
                  )}
                </div>

                {/* hagen-library import — separate secondary workflow */}
                <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Importera från hagen-biblioteket
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void handlePreviewSync()}
                      disabled={previewingSync || !customer?.tiktok_handle}
                      title={!customer?.tiktok_handle ? 'Ange och spara ett TikTok-konto först' : undefined}
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
                      {previewingSync ? 'Kollar...' : 'Förhandsgranska'}
                    </button>
                    <button
                      onClick={() => void handleSyncHistory()}
                      disabled={syncingHistory || !customer?.tiktok_handle}
                      title={!customer?.tiktok_handle ? 'Ange och spara ett TikTok-konto först' : undefined}
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
                      {syncingHistory ? 'Syncar...' : 'Synca från hagen'}
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
                        @{syncPreviewResult.handle} — {syncPreviewResult.totalMatched} matchade klipp
                        {' · '}<span style={{ color: '#166534' }}>{syncPreviewResult.wouldImport} nya</span>
                        {syncPreviewResult.wouldSkip > 0 && (
                          <span style={{ color: LeTrendColors.textMuted }}>, {syncPreviewResult.wouldSkip} redan finns</span>
                        )}
                      </div>
                      {syncPreviewResult.samples.map((s, i) => (
                        <div key={i} style={{ fontSize: 10, color: LeTrendColors.textMuted, fontFamily: 'monospace' }}>
                          {s.source_username ? `@${s.source_username}` : ''}
                          {s.description ? ` — ${s.description.slice(0, 60)}${s.description.length > 60 ? '…' : ''}` : ''}
                          {' '}
                          <span style={{ opacity: 0.6 }}>{s.tiktok_url.replace('https://www.tiktok.com', '').slice(0, 40)}</span>
                        </div>
                      ))}
                      {syncPreviewResult.totalMatched === 0 && syncPreviewResult.availableUsernames && syncPreviewResult.availableUsernames.length > 0 && (
                        <div style={{ marginTop: 2, color: LeTrendColors.textSecondary }}>
                          Tillgängliga konton i hagen: {syncPreviewResult.availableUsernames.map(u => `@${u}`).join(', ')}
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
        onClose={() => { setShowAddConceptPanel(false); setAddConceptSearch(''); setSlotAddTargetFeedOrder(null); }}
        title="Lägg till koncept"
      >
        {/* Slot context header — shown when CM arrived via the slot-aware entry point */}
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
            Väljer för <strong>{getStudioFeedOrderLabel(slotAddTargetFeedOrder)}</strong> — konceptet placeras direkt i den sloten
          </div>
        )}
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: LeTrendRadius.md, background: LeTrendColors.surface, border: `1px solid ${LeTrendColors.border}`, fontSize: 12, lineHeight: 1.5 }}>
          {(brief.tone || brief.current_focus || brief.constraints) ? (
            <div style={{ color: LeTrendColors.textSecondary }}>
              <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
              {[brief.tone, brief.current_focus].filter(Boolean).join(' · ')}
              {brief.constraints && (
                <div style={{ marginTop: 4, color: LeTrendColors.textMuted }}>
                  <strong style={{ color: LeTrendColors.brownDark }}>Begränsningar:</strong>{' '}{brief.constraints}
                </div>
              )}
            </div>
          ) : (
            <em style={{ color: LeTrendColors.textMuted }}>Brief saknas — fyll i kundbriefen i sidopanelen för bättre konceptpassning.</em>
          )}
        </div>
        <input
          type="text"
          value={addConceptSearch}
          onChange={(e) => setAddConceptSearch(e.target.value)}
          placeholder="Sök titel, beskrivning eller vibe..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allConcepts
            .filter(c => !concepts.find(cc => cc.concept_id === c.id))
            .filter(c => {
              if (!addConceptSearch.trim()) return true;
              const q = addConceptSearch.toLowerCase();
              return (
                (c.headline_sv || c.headline || '').toLowerCase().includes(q) ||
                (c.description_sv || '').toLowerCase().includes(q) ||
                c.vibeAlignments.some(v => v.toLowerCase().includes(q)) ||
                (c.mechanism || '').toLowerCase().includes(q) ||
                display.mechanism(c.mechanism).label.toLowerCase().includes(q)
              );
            })
            .map(concept => (
              <div
                key={concept.id}
                style={{
                  background: '#fff',
                  borderRadius: LeTrendRadius.md,
                  padding: 16,
                  border: `1px solid ${LeTrendColors.border}`
                }}
              >
                <h4 style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: LeTrendColors.brownDark,
                  margin: '0 0 8px'
                }}>
                  {concept.headline_sv || concept.headline}
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {concept.mechanism && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#7c3aed', fontWeight: 600 }}>
                      {display.mechanism(concept.mechanism).label}
                    </span>
                  )}
                  {concept.vibeAlignments.map((vibe) => (
                    <span key={vibe} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                      {vibe}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: LeTrendColors.textMuted, alignItems: 'center' }}>
                  <span>{display.difficulty(concept.difficulty).label}</span>
                  <span>·</span>
                  <span>{display.filmTime(concept.filmTime).label}</span>
                  <span>·</span>
                  <span>{display.peopleNeeded(concept.peopleNeeded).label}</span>
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
          {allConcepts.filter(c => !concepts.find(cc => cc.concept_id === c.id)).filter(c => {
            if (!addConceptSearch.trim()) return true;
            const q = addConceptSearch.toLowerCase();
            return (
              (c.headline_sv || c.headline || '').toLowerCase().includes(q) ||
              (c.description_sv || '').toLowerCase().includes(q) ||
              c.vibeAlignments.some(v => v.toLowerCase().includes(q))
            );
          }).length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: LeTrendColors.textMuted, fontSize: 13 }}>
              Inga koncept matchar &quot;{addConceptSearch}&quot;
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
          ? `Välj kunduppdrag för ${getStudioFeedOrderLabel(selectedFeedSlot)}`
          : 'Välj kunduppdrag för plan-slot'}
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
            Inga ej-placerade utkast finns. Lägg till eller frigör ett kunduppdrag först.
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
            + Lägg till nytt koncept från biblioteket
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

// SECTION COMPONENTS (defined below main component for better organization)

interface GamePlanSectionProps {
  notes: CustomerNote[];
  gamePlanHtml: string;
  gamePlanSummary: CustomerGamePlanSummary | null;
  setGamePlanHtml: (html: string) => void;
  editingGamePlan: boolean;
  setEditingGamePlan: (editing: boolean) => void;
  loadingGamePlan: boolean;
  savingGamePlan: boolean;
  gamePlanError: string | null;
  gamePlanSaveMessage: string | null;
  hasUnsavedGamePlanChanges: boolean;
  handleReloadGamePlan: (force?: boolean) => Promise<void>;
  handleSaveGamePlan: () => Promise<void>;
  handleCancelGamePlanEdit: () => void;
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  addingNote: boolean;
  handleAddNote: () => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  parseMarkdownLinks: (text: string) => React.ReactNode[] | string;
  formatDateTime: (dateStr: string) => string;
  cmDisplayNames: Record<string, CMIdentity>;
}

interface FeedPlannerSectionProps {
  customerId: string;
  concepts: CustomerConcept[];
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
  handleRemoveFromSlot: (conceptId: string) => Promise<void>;
  handleAssignToSlot: (conceptId: string, feedOrder: number) => Promise<void>;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (slot: FeedSlot, concept: CustomerConcept | null, details: TranslatedConcept | null) => void;
  showTagManager: boolean;
  setShowTagManager: (show: boolean) => void;
  refreshCmTags: (force?: boolean) => Promise<void>;
  // History motor integration
  historyHasMore: boolean;
  fetchingProfileHistory: boolean;
  onLoadMoreHistory: (count?: number) => Promise<void>;
  pendingAdvanceCue: { imported: number; kind: MotorSignalKind; publishedAt: string | null } | null;
  onAdvancePlan: () => Promise<void>;
  advancingPlan: boolean;
  onDismissAdvanceCue: () => void;
  tempoWeekdays: number[];
  isTempoExplicit: boolean;
  onTempoWeekdaysChange: (weekdays: number[]) => Promise<void>;
}

interface FeedSlotProps {
  slot: FeedSlot;
  tags: CmTag[];
  config: GridConfig;
  spanCoverage?: number;
  spanColor?: string | null;
  showSpanCoverageLabels?: boolean;
  projectedDate?: Date | null;
  isFreshEvidence?: boolean;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onMarkProduced: (conceptId: string, tiktokUrl?: string, publishedAt?: string) => Promise<void>;
  onRemoveFromSlot: (conceptId: string) => Promise<void>;
  onAssignToSlot?: (conceptId: string, feedOrder: number) => Promise<void>;
  onUpdateTags: (conceptId: string, tags: string[]) => Promise<void>;
  onUpdateNote: (conceptId: string, note: string) => Promise<void>;
  onUpdateTikTokUrl: (conceptId: string, url: string) => Promise<void>;
  onPatchConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (slot: FeedSlot, concept: CustomerConcept | null, details: TranslatedConcept | null) => void;
}

interface KommunikationSectionProps {
  customer: CustomerProfile;
  emailLog: EmailLogEntry[];
  emailType: string;
  setEmailType: (value: string) => void;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailBody: string;
  setEmailBody: (value: string) => void;
  selectedConceptIds: string[];
  setSelectedConceptIds: React.Dispatch<React.SetStateAction<string[]>>;
  sendingEmail: boolean;
  communicationFeedback: InlineFeedback | null;
  latestEmailJob: EmailJobEntry | null;
  retryingEmailJobId: string | null;
  handleSendEmail: () => Promise<void>;
  handleRetryEmailJob: (jobId: string) => Promise<void>;
  getDraftConcepts: () => CustomerConcept[];
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  formatDateTime: (dateStr: string) => string;
  cmDisplayNames: Record<string, CMIdentity>;
}


function GamePlanSection({
  notes,
  gamePlanHtml,
  gamePlanSummary,
  setGamePlanHtml,
  editingGamePlan,
  setEditingGamePlan,
  loadingGamePlan,
  savingGamePlan,
  gamePlanError,
  gamePlanSaveMessage,
  hasUnsavedGamePlanChanges,
  handleReloadGamePlan,
  handleSaveGamePlan,
  handleCancelGamePlanEdit,
  newNoteContent,
  setNewNoteContent,
  addingNote,
  handleAddNote,
  handleDeleteNote,
  parseMarkdownLinks,
  formatDateTime,
  cmDisplayNames,
}: GamePlanSectionProps) {
  const sourceLabel =
    gamePlanSummary?.source === 'customer_game_plans'
      ? 'Primär lagring'
      : gamePlanSummary?.source === 'legacy_customer_profiles'
        ? 'Legacy-spegel'
        : 'Tomt dokument';

  return (
    <div style={{
      background: '#fff',
      borderRadius: LeTrendRadius.lg,
      padding: 24,
      border: `1px solid ${LeTrendColors.border}`
    }}>
      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        color: LeTrendColors.brownDark,
        margin: '0 0 24px'
      }}>
        Game Plan
      </h2>

      {/* Rich Text Game Plan */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap'
        }}>
          <h3 style={{
            fontSize: 16,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            margin: 0
          }}>
            Strategiskt innehåll
          </h3>
          {!editingGamePlan && (
            <button
              onClick={() => void handleReloadGamePlan(true)}
              disabled={loadingGamePlan}
              style={{
                padding: '6px 12px',
                background: '#fff',
                color: LeTrendColors.brownDark,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: loadingGamePlan ? 'not-allowed' : 'pointer',
                marginRight: 8
              }}
            >
              {loadingGamePlan ? 'Laddar...' : 'Ladda om'}
            </button>
          )}
          {!editingGamePlan && (
            <button
              onClick={() => {
                if (!gamePlanHtml.trim()) {
                  setGamePlanHtml(GAME_PLAN_STARTER_TEMPLATE);
                }
                setEditingGamePlan(true);
              }}
              style={{
                padding: '6px 12px',
                background: LeTrendColors.brownLight,
                color: '#fff',
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {gamePlanHtml.trim() ? 'Redigera' : 'Starta Game Plan'}
            </button>
          )}
        </div>

        <div style={{
          fontSize: 12,
          color: LeTrendColors.textMuted,
          marginBottom: 12,
          lineHeight: 1.6
        }}>
          Det här är kundens strategidokument. Spara här innan du ber kunden att läsa sin plan eller när du vill att teamet ska utgå från samma version.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            padding: '6px 10px',
            borderRadius: 999,
            background: '#F7F2EC',
            color: LeTrendColors.brownDark,
            fontSize: 12,
            fontWeight: 600
          }}>
            {sourceLabel}
          </span>
          {gamePlanSummary?.updated_at && (
            <span style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: '#F7F2EC',
              color: LeTrendColors.textSecondary,
              fontSize: 12,
              fontWeight: 600
            }}>
              Senast sparad {formatDateTime(gamePlanSummary.updated_at)}
            </span>
          )}
          {hasUnsavedGamePlanChanges && (
            <span style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(245, 158, 11, 0.14)',
              color: '#92400e',
              fontSize: 12,
              fontWeight: 700
            }}>
              Ej sparade ändringar
            </span>
          )}
        </div>

        {gamePlanSummary?.source === 'legacy_customer_profiles' && !editingGamePlan && (
          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            color: '#92400e',
            fontSize: 13,
            lineHeight: 1.6
          }}>
            Dokumentet läses just nu från legacy-spegeln i kundprofilen. Nästa sparning skriver till `customer_game_plans`
            och fortsätter bara spegla tillbaka för kompatibilitet.
          </div>
        )}

        {gamePlanError && (
          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#b91c1c',
            fontSize: 13,
            lineHeight: 1.6
          }}>
            {gamePlanError}
          </div>
        )}

        {!editingGamePlan && gamePlanSaveMessage && !gamePlanError && (
          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            color: '#047857',
            fontSize: 13,
            lineHeight: 1.6
          }}>
            {gamePlanSaveMessage}
          </div>
        )}

        {editingGamePlan ? (
          <div>
            <GamePlanEditor
              initialHtml={gamePlanHtml}
              onChange={setGamePlanHtml}
              isFullscreen={false}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleSaveGamePlan}
                disabled={savingGamePlan || !hasUnsavedGamePlanChanges}
                style={{
                  padding: '10px 16px',
                  background: savingGamePlan || !hasUnsavedGamePlanChanges
                    ? LeTrendColors.textMuted
                    : LeTrendColors.success,
                  color: '#fff',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingGamePlan || !hasUnsavedGamePlanChanges ? 'not-allowed' : 'pointer'
                }}
              >
                {savingGamePlan ? 'Sparar...' : hasUnsavedGamePlanChanges ? 'Spara ändringar' : 'Inga ändringar'}
              </button>
              <button
                onClick={handleCancelGamePlanEdit}
                disabled={savingGamePlan}
                style={{
                  padding: '10px 16px',
                  background: '#fff',
                  color: LeTrendColors.brownDark,
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingGamePlan ? 'not-allowed' : 'pointer'
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div style={{ minHeight: 100 }}>
            {gamePlanHtml.trim() ? (
              <GamePlanDisplay html={gamePlanHtml} />
            ) : (
              <div
                style={{
                  padding: '20px 18px',
                  borderRadius: LeTrendRadius.md,
                  background: LeTrendColors.surface,
                  border: `1px dashed ${LeTrendColors.border}`,
                  color: LeTrendColors.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Ingen Game Plan skriven än. Klicka "Starta Game Plan" ovan — du får en mall med Kundprofil, Ton, Begränsningar och Fokus att fylla i direkt.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes feed */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 600,
          color: LeTrendColors.brownDark,
          margin: '0 0 16px'
        }}>
          Noteringar
        </h3>

        {/* Add note */}
        <div style={{ marginBottom: 20 }}>
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Lägg till en notering (stödjer [text](url))"
            rows={3}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              resize: 'vertical'
            }}
          />
          <button
            onClick={handleAddNote}
            disabled={!newNoteContent.trim() || addingNote}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              background: newNoteContent.trim() ? LeTrendColors.brownLight : LeTrendColors.textMuted,
              color: '#fff',
              border: 'none',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 600,
              cursor: newNoteContent.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            {addingNote ? 'Lägger till...' : 'Lägg till notering'}
          </button>
        </div>

        {/* Notes list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 32,
              color: LeTrendColors.textMuted,
              fontSize: 14
            }}>
              Inga noteringar ännu
            </div>
          ) : (
            notes.map((note: CustomerNote) => (
              <div
                key={note.id}
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: 12,
                  border: `1px solid ${LeTrendColors.border}`
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                  <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                    {formatDateTime(note.created_at)} av{' '}
                    {note.cm_id && cmDisplayNames[note.cm_id]
                      ? renderCmBadge(cmDisplayNames[note.cm_id]!)
                      : (note.cm_id || 'okänd')}
                  </div>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    Ta bort
                  </button>
                </div>
                <div style={{
                  fontSize: 14,
                  color: LeTrendColors.textPrimary,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {parseMarkdownLinks(note.content)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KonceptSection({
  concepts,
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
  cmDisplayNames,
  brief,
}: {
  concepts: CustomerConcept[];
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
  cmDisplayNames: Record<string, CMIdentity>;
  brief: { tone: string; constraints: string; current_focus: string };
}) {
  const [editingNoteForConcept, setEditingNoteForConcept] = React.useState<string | null>(null);
  const [localNoteText, setLocalNoteText] = React.useState('');
  const [editingWhyItFitsForConcept, setEditingWhyItFitsForConcept] = React.useState<string | null>(null);
  const [localWhyItFitsText, setLocalWhyItFitsText] = React.useState('');
  const [addingConceptNoteForConcept, setAddingConceptNoteForConcept] = React.useState<string | null>(null);
  const [localConceptNoteText, setLocalConceptNoteText] = React.useState('');
  const [savingConceptNote, setSavingConceptNote] = React.useState(false);
  const [showProducedSection, setShowProducedSection] = React.useState(false);

  const startWhyItFitsEdit = (conceptId: string, currentText: string | null) => {
    setEditingWhyItFitsForConcept(conceptId);
    setLocalWhyItFitsText(currentText ?? '');
  };

  const cancelWhyItFitsEdit = () => {
    setEditingWhyItFitsForConcept(null);
    setLocalWhyItFitsText('');
  };

  const saveWhyItFits = async (conceptId: string) => {
    await handleUpdateWhyItFits(conceptId, localWhyItFitsText);
    setEditingWhyItFitsForConcept(null);
    setLocalWhyItFitsText('');
  };

  const startNoteEdit = (conceptId: string, currentNote: string | null) => {
    setEditingNoteForConcept(conceptId);
    setLocalNoteText(currentNote ?? '');
  };

  const cancelNoteEdit = () => {
    setEditingNoteForConcept(null);
    setLocalNoteText('');
  };

  const saveNote = async (conceptId: string) => {
    await handleUpdateCmNote(conceptId, localNoteText);
    setEditingNoteForConcept(null);
    setLocalNoteText('');
    // After saving cm_note on a just-added concept, auto-open why_it_fits if not already set
    if (justAddedConceptId === conceptId) {
      const concept = concepts.find(c => c.id === conceptId);
      if (concept && !concept.content.content_overrides?.why_it_fits) {
        startWhyItFitsEdit(conceptId, null);
      }
    }
  };

  // Auto-open note editing immediately after a concept is added, but only once per add
  const autoStartedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (justAddedConceptId && !autoStartedRef.current.has(justAddedConceptId)) {
      const concept = concepts.find(c => c.id === justAddedConceptId);
      if (concept && !concept.cm_note) {
        autoStartedRef.current.add(justAddedConceptId);
        startNoteEdit(justAddedConceptId, null);
      }
    }
  }, [justAddedConceptId, concepts]);

  // Only LeTrend-origin rows belong in this tab.
  // Imported profile-history rows (row_kind='imported_history') are read-only
  // TikTok scrapes; they live in feedplan historik, not here.
  const assignmentConcepts = concepts.filter(isStudioAssignedCustomerConcept);

  // Lifecycle split — grounded in current fields, no new backend state needed:
  //   active   = draft + sent  (utkast / planerad / nu — still in CM workflow)
  //   produced = produced status (producerad / publicerad — cycle complete)
  //   archived rows are suppressed from both areas (out of workflow)
  const activeConcepts = assignmentConcepts.filter(
    (c) => c.assignment.status !== 'produced' && c.assignment.status !== 'archived'
  );
  const producedConcepts = assignmentConcepts
    .filter((c) => c.assignment.status === 'produced')
    .sort((a, b) => {
      const tA = a.result.produced_at ? new Date(a.result.produced_at).getTime() : 0;
      const tB = b.result.produced_at ? new Date(b.result.produced_at).getTime() : 0;
      return tB - tA; // most recent first
    });

  return (
    <div style={{
      background: '#fff',
      borderRadius: LeTrendRadius.lg,
      padding: 24,
      border: `1px solid ${LeTrendColors.border}`
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24
      }}>
        <h2 style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: 0
        }}>
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
            cursor: 'pointer'
          }}
        >
          + Lägg till koncept
        </button>
      </div>

      <div style={{
        marginBottom: 20,
        padding: '12px 14px',
        borderRadius: LeTrendRadius.md,
        background: LeTrendColors.surface,
        border: `1px solid ${LeTrendColors.border}`,
        color: LeTrendColors.textSecondary,
        fontSize: 13,
        lineHeight: 1.6
      }}>
        Varje rad är ett kunduppdrag i CM-flödet, inte bara ett bibliotekskoncept. Du redigerar kundens kopia, ser om den är delad eller placerad, och kan avgöra nästa steg direkt här.
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, lineHeight: 1.5 }}>
        {(brief.tone || brief.current_focus || brief.constraints) ? (
          <div style={{ color: LeTrendColors.textSecondary }}>
            <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
            {[brief.tone, brief.current_focus].filter(Boolean).join(' · ')}
            {brief.constraints && (
              <span style={{ color: LeTrendColors.textMuted }}>
                {' · '}<strong style={{ color: LeTrendColors.brownDark }}>Begränsningar:</strong>{' '}{brief.constraints}
              </span>
            )}
          </div>
        ) : (
          <em style={{ color: LeTrendColors.textMuted }}>Brief saknas — fyll i kundbriefen i sidopanelen för bättre konceptpassning.</em>
        )}
      </div>

      {activeConcepts.length === 0 && producedConcepts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 60,
          color: LeTrendColors.textMuted
        }}>
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
          {activeConcepts.map((concept) => {
            const details = getWorkspaceConceptDetails(concept, getConceptDetails);
            const sourceConceptId = getStudioCustomerConceptSourceConceptId(concept);
            const resolved = resolveConceptContent(concept, details ?? null);
            const isExpanded = expandedConceptId === concept.id;

            return (
              <div
                key={concept.id}
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.lg,
                  padding: 16,
                  border: `1px solid ${LeTrendColors.border}`
                }}
              >
                {/* Concept header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: isExpanded ? 16 : 0
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: LeTrendColors.brownDark,
                      margin: '0 0 8px'
                    }}>
                      {getWorkspaceConceptTitle(concept, details ?? null)}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#fff',
                        border: `1px solid ${LeTrendColors.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: LeTrendColors.textSecondary
                      }}>
                        Kunduppdrag {formatWorkspaceShortId(concept.id)}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#fff',
                        border: `1px solid ${LeTrendColors.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: LeTrendColors.textSecondary
                      }}>
                        {sourceConceptId
                          ? `Källa ${formatWorkspaceShortId(sourceConceptId) ?? sourceConceptId}`
                          : 'Importerat historikklipp'}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#fff',
                        border: `1px solid ${LeTrendColors.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: LeTrendColors.textSecondary
                      }}>
                        {getStudioFeedOrderLabel(concept.placement.feed_order)}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#fff',
                        border: `1px solid ${LeTrendColors.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: concept.markers.shared_at ? '#1d4ed8' : LeTrendColors.textSecondary
                      }}>
                        {concept.markers.shared_at
                          ? `Delad ${formatDate(concept.markers.shared_at)}`
                          : 'Inte delad ännu'}
                      </span>
                      {(concept.result.tiktok_url || concept.result.published_at) && (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#166534'
                        }}>
                          {concept.result.tiktok_views && concept.result.tiktok_views > 0
                            ? `Publicerad · ${formatCompactViews(concept.result.tiktok_views)} visningar`
                            : 'Publicerad på TikTok'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                      <StatusChip
                        status={concept.assignment.status}
                        onClick={() => {
                          const nextStatus = getNextCustomerConceptAssignmentStatus(concept.assignment.status);
                          if (!nextStatus) return;
                          void handleChangeStatus(concept.id, nextStatus);
                        }}
                        editable={Boolean(getNextCustomerConceptAssignmentStatus(concept.assignment.status))}
                      />
                      <span style={{ color: LeTrendColors.textMuted }}>
                        Tillagd: {formatDate(concept.assignment.added_at)}
                      </span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5 }}>
                      <strong style={{ color: LeTrendColors.brownDark }}>Nästa steg:</strong>{' '}
                      {getOperatorNextStepLabel(concept)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.5 }}>
                      {Boolean(getNextCustomerConceptAssignmentStatus(concept.assignment.status))
                        ? `Statusknappen flyttar uppdraget vidare till ${getCustomerConceptAssignmentLabel(getNextCustomerConceptAssignmentStatus(concept.assignment.status) as CustomerConceptAssignmentStatus)}.`
                        : 'Uppdraget är redan i sista statusen i den aktiva kedjan.'}
                    </div>
                    {details?.vibeAlignments && details.vibeAlignments.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {details.vibeAlignments.map((vibe) => (
                          <span key={vibe} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                            {vibe}
                          </span>
                        ))}
                      </div>
                    )}
                    {resolved.fit.whyItWorks_sv && !isExpanded && (
                      <div style={{ marginTop: 8, fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        <strong style={{ color: LeTrendColors.brownDark }}>Varför det funkar:</strong>{' '}{resolved.fit.whyItWorks_sv}
                      </div>
                    )}
                    {concept.cm_note && !isExpanded && (
                      <div style={{ marginTop: 6, fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        <strong style={{ color: LeTrendColors.brownDark }}>CM:</strong>{' '}{concept.cm_note}
                      </div>
                    )}
                    {!concept.content.content_overrides?.why_it_fits && !isExpanded && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', lineHeight: 1.5 }}>
                        Passning till kunden ej ifylld — syns tomt hos kunden
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setExpandedConceptId(isExpanded ? null : concept.id)}
                      style={{
                        background: 'none',
                        border: `1px solid ${LeTrendColors.border}`,
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: LeTrendColors.brownLight,
                        fontWeight: 600
                      }}
                    >
                      {isExpanded ? 'Dölj' : 'Visa'}
                    </button>
                    <button
                      onClick={() => openConceptEditor(concept.id)}
                      style={{
                        background: LeTrendColors.brownLight,
                        border: 'none',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      Redigera
                    </button>
                    {concept.assignment.status === 'draft' && (
                      <button
                        onClick={() => onSendConcept(concept.id)}
                        style={{
                          background: '#4f46e5',
                          border: 'none',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: LeTrendRadius.md,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600
                        }}
                      >
                        Kommunikation →
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteConcept(concept.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
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
                          <div style={{ fontSize: 10, color: LeTrendColors.textMuted, marginTop: 1 }}>syns hos kunden under "Varför det passar er"</div>
                        </div>
                        {editingWhyItFitsForConcept !== concept.id && (
                          <button
                            onClick={() => startWhyItFitsEdit(concept.id, concept.content.content_overrides?.why_it_fits ?? null)}
                            style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                          >
                            {concept.content.content_overrides?.why_it_fits ? 'Redigera' : 'Lägg till'}
                          </button>
                        )}
                      </div>
                      {editingWhyItFitsForConcept === concept.id ? (
                        <div>
                          <textarea
                            value={localWhyItFitsText}
                            onChange={(e) => setLocalWhyItFitsText(e.target.value)}
                            rows={3}
                            placeholder="Varför passar det här konceptet just den här kunden? Vad i deras brief gör det relevant?"
                            style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              onClick={() => void saveWhyItFits(concept.id)}
                              style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Spara
                            </button>
                            <button
                              onClick={cancelWhyItFitsEdit}
                              style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: concept.content.content_overrides?.why_it_fits ? LeTrendColors.textPrimary : LeTrendColors.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {concept.content.content_overrides?.why_it_fits || 'Ingen kundspecifik passning ännu.'}
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
                        {editingNoteForConcept !== concept.id && (
                          <button
                            onClick={() => startNoteEdit(concept.id, concept.cm_note)}
                            style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0 }}
                          >
                            Redigera
                          </button>
                        )}
                      </div>
                      {editingNoteForConcept === concept.id ? (
                        <div>
                          <textarea
                            value={localNoteText}
                            onChange={(e) => setLocalNoteText(e.target.value)}
                            rows={3}
                            placeholder="Något att nämna kring timingen, kontexten eller nästa steg?"
                            style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              onClick={() => void saveNote(concept.id)}
                              style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Spara
                            </button>
                            <button
                              onClick={cancelNoteEdit}
                              style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 14, color: concept.cm_note ? LeTrendColors.textPrimary : LeTrendColors.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {concept.cm_note || 'Ingen notering ännu.'}
                          </div>
                          {concept.cm_note && concept.cm_id && cmDisplayNames[concept.cm_id] && (
                            <div style={{ marginTop: 4, fontSize: 11, color: LeTrendColors.textMuted }}>
                              av{' '}{renderCmBadge(cmDisplayNames[concept.cm_id]!)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ height: 10 }} />
                    <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div>
                          <div style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>Notering</div>
                          <div style={{ fontSize: 10, color: LeTrendColors.textMuted, marginTop: 1 }}>syns i kundens flöde som en uppdatering</div>
                        </div>
                        {addingConceptNoteForConcept !== concept.id && (
                          <button
                            onClick={() => { setAddingConceptNoteForConcept(concept.id); setLocalConceptNoteText(''); }}
                            style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: LeTrendColors.brownLight, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                          >
                            Lägg till
                          </button>
                        )}
                      </div>
                      {addingConceptNoteForConcept === concept.id && (
                        <div>
                          <textarea
                            value={localConceptNoteText}
                            onChange={(e) => setLocalConceptNoteText(e.target.value)}
                            rows={3}
                            placeholder="Vad vill du notera kring detta koncept just nu?"
                            style={{ width: '100%', padding: 8, borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              onClick={async () => {
                                if (!localConceptNoteText.trim() || savingConceptNote) return;
                                setSavingConceptNote(true);
                                await handleAddConceptNote(concept.id, localConceptNoteText);
                                setAddingConceptNoteForConcept(null);
                                setLocalConceptNoteText('');
                                setSavingConceptNote(false);
                              }}
                              disabled={savingConceptNote || !localConceptNoteText.trim()}
                              style={{ padding: '6px 12px', background: LeTrendColors.brownLight, color: '#fff', border: 'none', borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: localConceptNoteText.trim() ? 'pointer' : 'not-allowed' }}
                            >
                              {savingConceptNote ? 'Sparar...' : 'Spara'}
                            </button>
                            <button
                              onClick={() => { setAddingConceptNoteForConcept(null); setLocalConceptNoteText(''); }}
                              style={{ padding: '6px 12px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Avbryt
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Producerade / publicerade ───────────────────────────── */}
          {producedConcepts.length > 0 && (
            <div style={{ marginTop: activeConcepts.length > 0 ? 8 : 0 }}>
              <button
                onClick={() => setShowProducedSection((p) => !p)}
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
                <span style={{ flex: 1 }}>
                  Producerade &amp; publicerade ({producedConcepts.length})
                </span>
                <span style={{ fontSize: 11 }}>{showProducedSection ? '▲' : '▼'}</span>
              </button>

              {showProducedSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {producedConcepts.map((concept) => {
                    const details = getWorkspaceConceptDetails(concept, getConceptDetails);
                    return (
                      <div
                        key={concept.id}
                        style={{
                          background: LeTrendColors.surface,
                          borderRadius: LeTrendRadius.md,
                          padding: '10px 14px',
                          border: `1px solid ${LeTrendColors.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: LeTrendColors.brownDark,
                            marginBottom: 6,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}>
                            {getWorkspaceConceptTitle(concept, details ?? null)}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: LeTrendColors.textSecondary, alignItems: 'center' }}>
                            {concept.result.produced_at && (
                              <span>Producerad {formatDate(concept.result.produced_at)}</span>
                            )}
                            {concept.result.tiktok_url ? (
                              <a
                                href={concept.result.tiktok_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#166534', fontWeight: 600, textDecoration: 'none' }}
                              >
                                Publicerad{concept.result.published_at ? ` ${formatDate(concept.result.published_at)}` : ''} ↗
                              </a>
                            ) : concept.result.published_at ? (
                              <span style={{ color: '#166534' }}>
                                Publicerad {formatDate(concept.result.published_at)}
                              </span>
                            ) : null}
                            {concept.result.tiktok_views && concept.result.tiktok_views > 0 && (
                              <span style={{ color: LeTrendColors.textMuted }}>
                                {formatCompactViews(concept.result.tiktok_views)} visningar
                              </span>
                            )}
                            {concept.result.tiktok_likes && concept.result.tiktok_likes > 0 && (
                              <span style={{ color: LeTrendColors.textMuted }}>
                                {formatCompactViews(concept.result.tiktok_likes)} gilla
                              </span>
                            )}
                          </div>
                        </div>
                        {concept.result.tiktok_thumbnail_url && (
                          <img
                            src={concept.result.tiktok_thumbnail_url}
                            alt=""
                            style={{
                              width: 36,
                              height: 64,
                              objectFit: 'cover',
                              borderRadius: LeTrendRadius.sm,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedPlannerSection({
  customerId,
  concepts,
  cmTags,
  gridConfig,
  historyOffset,
  setHistoryOffset,
  getConceptDetails,
  handleUpdateConceptTags,
  handleUpdateCmNote,
  handleUpdateTikTokUrl,
  handlePatchConcept,
  handleMarkProduced,
  handleRemoveFromSlot,
  handleAssignToSlot,
  onOpenConcept,
  onSlotClick,
  showTagManager,
  setShowTagManager,
  refreshCmTags,
  historyHasMore,
  fetchingProfileHistory,
  onLoadMoreHistory,
  pendingAdvanceCue,
  onAdvancePlan,
  advancingPlan,
  onDismissAdvanceCue,
  tempoWeekdays,
  isTempoExplicit,
  onTempoWeekdaysChange,
}: FeedPlannerSectionProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const gridWrapperRef = React.useRef<HTMLDivElement>(null);
  const [eelPath, setEelPath] = React.useState('');
  const [eelSegments, setEelSegments] = React.useState<string[]>([]);
  const [eelGradients, setEelGradients] = React.useState<PositionedEelGradient[]>([]);
  const [markingProducedFromCue, setMarkingProducedFromCue] = React.useState(false);
  // Purely local defer — hides the cue for this session without writing pending_history_advance_seen_at.
  // The signal stays unresolved on the backend: next page load will show the cue again.
  // Use "Inte nu" when the CM wants to think about it; use × for explicit acknowledgement.
  const [deferredAdvanceCue, setDeferredAdvanceCue] = React.useState(false);
  // Local focus state: set of imported-history concept IDs identified as fresh evidence for the
  // current motor cue. Populated when CM clicks "Granska historiken".
  // Pure UI — never written to backend. Used to apply a thin visual treatment in historik.
  const [focusedEvidenceIds, setFocusedEvidenceIds] = React.useState<ReadonlySet<string>>(new Set());
  // Auto-clear focusedEvidenceIds when the motor signal is resolved (pendingAdvanceCue → null).
  // Prevents stale "nytt" badges from persisting after the cue is acknowledged via an action button.
  React.useEffect(() => {
    if (!pendingAdvanceCue) setFocusedEvidenceIds(new Set());
  }, [pendingAdvanceCue]);
  const maxExtraHistorySlots = gridConfig.columns * 8; // support going back ~24 clips (8 rows)
  const maxForwardSlots = gridConfig.columns * 5;      // allow planning up to 5 extra rows forward (~13 clips at 3 cols)

  // Wheel scroll: stable ref pattern so the DOM listener never needs re-attaching.
  // Fetch is NOT triggered here — a separate useEffect handles threshold-based load-more.
  const wheelCbRef = React.useRef<(e: WheelEvent) => void>(() => {});
  React.useEffect(() => {
    const cooldown = { active: false };
    wheelCbRef.current = (e: WheelEvent) => {
      e.preventDefault();
      if (scrollLockedRef.current) return;
      if (cooldown.active) return;
      cooldown.active = true;
      setTimeout(() => { cooldown.active = false; }, 400);
      if (e.deltaY > 0) {
        // Gate: do not advance into historik while a fetch is already in flight
        if (fetchingProfileHistory) return;
        setHistoryOffset(prev => Math.min(prev + gridConfig.columns, maxExtraHistorySlots));
      } else if (e.deltaY < 0) {
        setHistoryOffset(prev => Math.max(prev - gridConfig.columns, -maxForwardSlots));
      }
    };
  }, [gridConfig, maxExtraHistorySlots, maxForwardSlots, fetchingProfileHistory, setHistoryOffset]);
  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cb = (e: WheelEvent) => wheelCbRef.current(e);
    el.addEventListener('wheel', cb, { passive: false });
    return () => el.removeEventListener('wheel', cb);
  }, []);

  // Threshold-based history fetch gate.
  // Fires onLoadMoreHistory (debounced 500 ms) when the visible planner bottom
  // is within one row of the deepest currently-loaded historik clip.
  // Never fires from inside a state mutation; runs as a separate effect.
  const loadMoreDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    // Always cancel any pending debounce before evaluating new conditions
    if (loadMoreDebounceRef.current !== null) {
      clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }

    // Do nothing if there is no more data, a fetch is already running, or we
    // haven't scrolled into historik at all yet
    if (!historyHasMore || fetchingProfileHistory || historyOffset <= 0) return;

    // Deepest feed_order currently loaded (most-negative value, or 0 if none)
    const deepestLoadedOrder = concepts
      .map(c => c.placement.feed_order)
      .filter((v): v is number => typeof v === 'number' && v < 0)
      .reduce<number>((min, v) => Math.min(min, v), 0);

    if (deepestLoadedOrder === 0) return; // no historik rows in memory yet

    // feed_order of the bottom-right slot in the current window:
    //   feedOrder = currentSlotIndex − (totalSlots − 1) − historyOffset
    const visibleBottomFeedOrder =
      gridConfig.currentSlotIndex - (gridConfig.columns * gridConfig.rows - 1) - historyOffset;

    // Schedule fetch when the visible bottom is within one row of the loaded edge
    if (visibleBottomFeedOrder <= deepestLoadedOrder + gridConfig.columns) {
      loadMoreDebounceRef.current = setTimeout(() => {
        loadMoreDebounceRef.current = null;
        void onLoadMoreHistory(10);
      }, 500);
    }

    return () => {
      if (loadMoreDebounceRef.current !== null) {
        clearTimeout(loadMoreDebounceRef.current);
        loadMoreDebounceRef.current = null;
      }
    };
  }, [historyOffset, historyHasMore, fetchingProfileHistory, concepts, gridConfig, onLoadMoreHistory]);

  // Spans state
  const [spans, setSpans] = React.useState<FeedSpan[]>([]);
  const [spansHydrated, setSpansHydrated] = React.useState(false);
  const [drag, setDrag] = React.useState<{
    type: 'create' | 'start' | 'end' | 'climax';
    spanId?: string;
    a?: number;
    b?: number;
    colorIdx?: number;
  } | null>(null);
  const [hoveredSpan, setHoveredSpan] = React.useState<string | null>(null);
  const [activeSpan, setActiveSpan] = React.useState<string | null>(null);
  const [editingSpan, setEditingSpan] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editBody, setEditBody] = React.useState('');
  const [nextColorIdx, setNextColorIdx] = React.useState(0);
  const [eelHovered, setEelHovered] = React.useState(false);
  const [editingPeriod, setEditingPeriod] = React.useState(false);
  const [showConceptPicker, setShowConceptPicker] = React.useState(false);
  const [showTempoModal, setShowTempoModal] = React.useState(false);
  const [scrollLocked, setScrollLocked] = React.useState(false);
  const scrollLockedRef = React.useRef(false);
  React.useEffect(() => { scrollLockedRef.current = scrollLocked; }, [scrollLocked]);
  const [slotAnchors, setSlotAnchors] = React.useState<Array<{
    yTop: number;
    yMid: number;
    yBot: number;
  }>>([]);
  const [animatedCount, setAnimatedCount] = React.useState(0);
  const spansCacheKey = React.useMemo(
    () => `studio-v2:workspace:${customerId}:feed-spans`,
    [customerId]
  );

  // Helper to get draft concepts
  const getDraftConcepts = React.useCallback(
    () =>
      concepts.filter(
        (concept) =>
          isStudioAssignedCustomerConcept(concept) &&
          concept.assignment.status === 'draft' &&
          concept.placement.feed_order === null
      ),
    [concepts]
  );

  // Frac offset: shifts span positions when grid is scrolled
  const totalSlots = gridConfig.columns * gridConfig.rows;
  const fracOffset = historyOffset / totalSlots;

  // Bygg slot-map
  const slotMap = React.useMemo(() =>
    buildSlotMap(
      concepts.filter((concept) => concept.placement.feed_order !== null),
      gridConfig,
      historyOffset
    ),
    [concepts, gridConfig, historyOffset]
  );

  // Soft tempo projection — display-only, never written to DB.
  // Anchor: planned_publish_at on the current slot (feed_order=0) if it is in the
  // future, otherwise today. published_at is intentionally excluded — it is always
  // historical and would produce past projected dates for upcoming slots (E112).
  const tempoAnchor = React.useMemo(() => {
    const today = new Date();
    const nowConcept = concepts.find((c) => c.placement.feed_order === 0);
    if (nowConcept?.result?.planned_publish_at) {
      const d = new Date(nowConcept.result.planned_publish_at);
      return d > today ? d : today;
    }
    return today;
  }, [concepts]);

  const tempoDateMap = React.useMemo(() => {
    const map = new Map<number, Date>();
    for (const slot of slotMap) {
      if (slot.feedOrder > 0) {
        const d = projectTempoDate(slot.feedOrder, tempoAnchor, tempoWeekdays);
        if (d) map.set(slot.feedOrder, d);
      }
    }
    return map;
  }, [slotMap, tempoAnchor, tempoWeekdays]);
  /**
   * Position-based slot selection.
   *
   * Each row is divided into vertical zones, one per column:
   *   Top third    → col 0 (left)
   *   Middle third → col 1 (center)
   *   Bottom third → col 2 (right)
   *
   * A column is selected if the span overlaps its zone (with a small margin).
   * This means starting a drag near the bottom of a row selects the
   * rightmost clip first, which matches the chronological flow.
   */
  const touchedSlots = React.useCallback((span: FeedSpan, anchors: typeof slotAnchors) => {
    if (anchors.length === 0) return [];
    const cols = gridConfig.columns;
    const total = anchors[anchors.length - 1].yBot - anchors[0].yTop;
    if (total <= 0) return [];

    const viewStart = span.frac_start - fracOffset;
    const viewEnd = span.frac_end - fracOffset;
    if (viewEnd < 0 || viewStart > 1) return [];

    const result: Array<{ idx: number; coverage: number }> = [];

    const rowCount = Math.ceil(anchors.length / cols);
    for (let row = 0; row < rowCount; row++) {
      const rowStartIdx = row * cols;
      const rowEndIdx = Math.min(rowStartIdx + cols, anchors.length);
      if (rowStartIdx >= anchors.length) break;

      const rowTop = anchors[rowStartIdx].yTop;
      const rowBot = anchors[rowEndIdx - 1].yBot;
      const rowFracTop = (rowTop - anchors[0].yTop) / total;
      const rowFracBot = (rowBot - anchors[0].yTop) / total;
      const rowHeight = rowFracBot - rowFracTop;
      if (rowHeight <= 0) continue;

      // Does the span overlap this row at all?
      const overlapStart = Math.max(viewStart, rowFracTop);
      const overlapEnd = Math.min(viewEnd, rowFracBot);
      if (overlapEnd <= overlapStart) continue;

      const colsInRow = rowEndIdx - rowStartIdx;
      const zoneHeight = rowHeight / colsInRow;
      const margin = zoneHeight * 0.1; // 10% margin for easier selection

      for (let col = 0; col < colsInRow; col++) {
        const zoneTop = rowFracTop + col * zoneHeight + margin;
        const zoneBot = rowFracTop + (col + 1) * zoneHeight - margin;
        // Column is selected if the span overlaps its zone
        if (overlapEnd > zoneTop && overlapStart < zoneBot) {
          result.push({ idx: rowStartIdx + col, coverage: 1 });
        }
      }
    }

    return result;
  }, [gridConfig.columns, fracOffset]);

  // Load spans from API (cache-first + background refresh)
  React.useEffect(() => {
    const fetchSpans = async () => {
      if (!customerId) return;
      setSpansHydrated(false);

      try {
        const cached = readClientCache<FeedSpan[]>(spansCacheKey, {
          allowExpired: true,
          maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS
        });

        if (cached?.value) {
          setSpans(cached.value);
        }

        const spanData = await fetchAndCacheClient<FeedSpan[]>(
          spansCacheKey,
          async () => {
            const res = await fetch(`/api/studio-v2/feed-spans?customer_id=${customerId}`);
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              throw new Error(data.error || `Failed to fetch spans (${res.status})`);
            }

            return Array.isArray(data.spans) ? data.spans as FeedSpan[] : [];
          },
          WORKSPACE_CACHE_TTL_MS,
          { force: Boolean(cached) }
        );

        setSpans(spanData);
      } catch (error) {
        console.error('Error fetching spans:', error);
      } finally {
        setSpansHydrated(true);
      }
    };

    void fetchSpans();
  }, [customerId, spansCacheKey]);

  React.useEffect(() => {
    if (!customerId || !spansHydrated) return;
    writeClientCache(spansCacheKey, spans, WORKSPACE_CACHE_TTL_MS);
  }, [customerId, spans, spansHydrated, spansCacheKey]);

  const reloadSpansFromServer = React.useCallback(async () => {
    if (!customerId) return;

    try {
      clearClientCache(spansCacheKey);
      const res = await fetch(`/api/studio-v2/feed-spans?customer_id=${customerId}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Failed to reload spans (${res.status})`);
      }

      const nextSpans = Array.isArray(data.spans) ? data.spans as FeedSpan[] : [];
      setSpans(nextSpans);
      writeClientCache(spansCacheKey, nextSpans, WORKSPACE_CACHE_TTL_MS);
    } catch (error) {
      console.error('Error reloading spans:', error);
    }
  }, [customerId, spansCacheKey]);

  // Measure slot positions
  React.useEffect(() => {
    if (!gridRef.current || slotMap.length === 0) return;

    const measureSlots = () => {
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const gridRect = gridEl.getBoundingClientRect();
      const slots = gridEl.querySelectorAll('[data-slot-index]');

      const anchors = Array.from(slots).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          yTop: rect.top - gridRect.top,
          yMid: rect.top - gridRect.top + rect.height / 2,
          yBot: rect.bottom - gridRect.top
        };
      });

      setSlotAnchors(anchors);
    };

    measureSlots();

    const resizeObserver = new ResizeObserver(measureSlots);
    if (gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [slotMap]);

  // Beräkna åliden när slots ändras
  React.useEffect(() => {
    if (!gridRef.current || slotMap.length === 0) return;

    const updateEel = () => {
      const centers = calculateSlotCenters(gridRef.current as HTMLDivElement);
      if (centers.length > 0) {
        const path = buildCurvePath(centers);
        const segments = buildSegmentPaths(centers);
        const gradients = buildGradients(slotMap, cmTags);
        const gradientsWithPos = updateGradientPositions(gradients, centers);
        setEelPath(path);
        setEelSegments(segments);
        setEelGradients(gradientsWithPos);
      }
    };

    // Initial calculation
    updateEel();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(updateEel);
    if (gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [slotMap, gridConfig, cmTags]);

  const fracToY = React.useCallback((frac: number, anchors: typeof slotAnchors) => {
    return spanFracToY(frac, anchors);
  }, []);

  // Ref-based span handlers - avoids stale closures and listener churn
  const getGridElement = React.useCallback(() => gridRef.current, []);
  const spanHandlerRefs = React.useRef<SpanHandlerRefs>({
    spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset, reloadSpans: reloadSpansFromServer
  });
  // Keep refs in sync
  spanHandlerRefs.current = { spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset, reloadSpans: reloadSpansFromServer };

  const stableHandlers = React.useMemo(
    () =>
      createSpanHandlers(
        getGridElement,
        spanHandlerRefs,
        setDrag,
        setSpans,
        setActiveSpan,
        setHoveredSpan,
        setEditingSpan,
        setEditTitle,
        setEditBody,
        setNextColorIdx,
        customerId
      ),
    // Only recreate when customerId changes (stable identity otherwise)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId]
  );

  const onEelDown = React.useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      stableHandlers.onEelDown(e);
    },
    [stableHandlers]
  );

  // Stable event listeners - no churn on drag/spans state changes
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => stableHandlers.onMove(e);
    const onUp = () => { stableHandlers.onUp(); };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [stableHandlers]);

  const visSpan = activeSpan || hoveredSpan;
  const visSpanData = React.useMemo(
    () => spans.find((span) => span.id === visSpan) ?? null,
    [spans, visSpan]
  );
  // Calculate which slots are selected — includes in-progress drag as a virtual span
  const allSpansCoverage = React.useMemo(() => {
    if (slotAnchors.length === 0) return new Map<number, { coverage: number; color: string }>();

    const coverageMap = new Map<number, { coverage: number; color: string }>();

    // Build list: persisted spans + in-progress drag (as virtual span)
    const spansToCheck: Array<{ span: FeedSpan | null; frac_start: number; frac_end: number; color: string }> = [];

    spans.forEach((span) => {
      const color = SPAN_COLOR_PALETTE[
        ((span.color_index % SPAN_COLOR_PALETTE.length) + SPAN_COLOR_PALETTE.length) %
          SPAN_COLOR_PALETTE.length
      ].color;
      spansToCheck.push({ span, frac_start: span.frac_start, frac_end: span.frac_end, color });
    });

    // Add drag-in-progress as virtual span (view-space → global-space)
    if (drag?.type === 'create' && drag.a !== undefined && drag.b !== undefined) {
      const a = Math.min(drag.a, drag.b) + fracOffset;
      const b = Math.max(drag.a, drag.b) + fracOffset;
      if (b - a > 0.01) {
        const color = SPAN_COLOR_PALETTE[drag.colorIdx || 0].color;
        spansToCheck.push({ span: null, frac_start: a, frac_end: b, color });
      }
    }

    spansToCheck.forEach(({ frac_start, frac_end, color }) => {
      const virtualSpan = { frac_start, frac_end } as FeedSpan;
      const touched = touchedSlots(virtualSpan, slotAnchors);
      touched.forEach(({ idx, coverage }) => {
        const existing = coverageMap.get(idx);
        if (!existing || coverage > existing.coverage) {
          coverageMap.set(idx, { coverage, color });
        }
      });
    });

    return coverageMap;
  }, [spans, slotAnchors, touchedSlots, drag, fracOffset]);

  // Reset period edit mode when a different span is opened
  React.useEffect(() => { setEditingPeriod(false); }, [editingSpan]);

  const animatedCountRef = React.useRef(0);
  React.useEffect(() => {
    animatedCountRef.current = animatedCount;
  }, [animatedCount]);

  // Auto-save title/body if dirty when the edit panel is closed or a different span is opened.
  // Fire-and-forget: optimistic local update first, PATCH async, reload on failure.
  const saveCurrentSpanTextIfDirty = React.useCallback(async () => {
    if (!editingSpan) return;
    const span = spans.find((s) => s.id === editingSpan);
    if (!span) return;
    if (editTitle === span.title && editBody === span.body) return;
    setSpans((prev) =>
      prev.map((s) => s.id === editingSpan ? { ...s, title: editTitle, body: editBody } : s)
    );
    try {
      const res = await fetch(`/api/studio-v2/feed-spans/${editingSpan}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, body: editBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `PATCH failed (${res.status})`);
      }
    } catch (err) {
      console.error('[åliden] auto-save title/body failed:', err);
      void reloadSpansFromServer();
    }
  }, [editingSpan, editTitle, editBody, spans, reloadSpansFromServer]);

  React.useEffect(() => {
    const countSpan = editingSpan
      ? spans.find((span) => span.id === editingSpan) ?? null
      : visSpanData;

    if (!countSpan || slotAnchors.length === 0) {
      setAnimatedCount(0);
      return;
    }

    const targetCount = touchedSlots(countSpan, slotAnchors).length;
    const startCount = animatedCountRef.current;
    if (startCount === targetCount) return;

    const duration = 200;
    const start = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(startCount + (targetCount - startCount) * progress);
      setAnimatedCount(value);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [editingSpan, spans, visSpanData, slotAnchors, touchedSlots]);

  // Y position of the edit panel — centered at the editing span's visual midpoint
  const editPanelY = React.useMemo(() => {
    if (!editingSpan) return null;
    const span = spans.find(s => s.id === editingSpan);
    if (!span) return null;
    if (slotAnchors.length === 0) return 200; // fallback before grid is measured
    const midFrac = (span.frac_start + span.frac_end) / 2 - fracOffset;
    const clampedMid = Math.max(0.05, Math.min(0.95, midFrac));
    return fracToY(clampedMid, slotAnchors);
  }, [editingSpan, spans, slotAnchors, fracOffset, fracToY]);

  // True when at least one LeTrend-managed concept is placed in nu (0) or kommande (>0).
  // Used both in the toolbar header (standalone advance affordance) and in the cue block.
  const hasActivePlan = concepts.some(
    (c) =>
      c.row_kind === 'assignment' &&
      typeof c.placement.feed_order === 'number' &&
      c.placement.feed_order >= 0
  );

  // The LeTrend concept currently at nu (feed_order === 0), if any.
  // Only derived for fresh_activity signals — backfill does not imply a LeTrend concept was produced.
  // Used in the motor cue to bridge external publication evidence with the internal production path.
  const nuConcept =
    pendingAdvanceCue?.kind === 'fresh_activity'
      ? (concepts.find(
          (c) => c.row_kind === 'assignment' && c.placement.feed_order === 0
        ) ?? null)
      : null;

  // Derive the ordered list and ID-set of imported-history clips that constitute fresh evidence
  // for the current motor cue. Both the cue glimpse and the historik highlight use the same source
  // so the CM always sees the same evidence in both surfaces.
  //
  // Primary path: any imported clip with published_at >= pending_history_advance_published_at
  //   (the seam stored by the sync engine for the triggering batch).
  // Fallback: when no seam is available, the N most-recent imported clips (N = signal count).
  // Conservative: only rows present in memory. Never invents a match.
  const { freshImportedConcepts, freshImportedIds } = React.useMemo(() => {
    if (!pendingAdvanceCue) return { freshImportedConcepts: [] as typeof concepts, freshImportedIds: new Set<string>() as ReadonlySet<string> };
    const imported = concepts
      .filter(c => c.row_kind === 'imported_history')
      .sort((a, b) => {
        const tA = a.result.published_at ? new Date(a.result.published_at).getTime() : 0;
        const tB = b.result.published_at ? new Date(b.result.published_at).getTime() : 0;
        return tB - tA; // newest first
      });
    let fresh: typeof imported;
    if (pendingAdvanceCue.publishedAt) {
      const seam = new Date(pendingAdvanceCue.publishedAt).getTime();
      fresh = imported.filter(c => c.result.published_at ? new Date(c.result.published_at).getTime() >= seam : false);
    } else {
      // No seam: fall back to the N most-recent imported clips where N = imported signal count
      fresh = imported.slice(0, pendingAdvanceCue.imported);
    }
    return {
      freshImportedConcepts: fresh,
      freshImportedIds: new Set(fresh.map(c => c.id)) as ReadonlySet<string>,
    };
  }, [pendingAdvanceCue, concepts]);

  return (
    <div style={{
      background: LeTrendColors.cream,
      borderRadius: LeTrendRadius.lg,
      padding: 24,
      border: `1px solid ${LeTrendColors.border}`
    }}>
      {/* Header med Hantera taggar-länk */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: 0
        }}>
          Feed-planerare
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasActivePlan && (
            <button
              onClick={() => void onAdvancePlan()}
              disabled={advancingPlan}
              style={{
                background: 'none',
                border: '1px solid #9ca3af',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                color: '#4b5563',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                padding: '3px 10px',
                fontWeight: 400,
              }}
            >
              {advancingPlan ? 'Flyttar...' : 'Flytta planen framåt'}
            </button>
          )}
          <button
            onClick={() => setShowTagManager(true)}
            style={{
              background: 'none',
              border: 'none',
              color: LeTrendColors.brownLight,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Hantera taggar
          </button>
        </div>
      </div>

      {/* History controls removed from planner surface — auto-loads on workspace open;
          manual import/fetch available in the Demo-förberedelse tab */}

      {/* Rytm: compact summary trigger — opens TempoModal for full picker */}
      {(() => {
        const tempoSortedKey = [...tempoWeekdays].sort().join(',');
        const matchedPreset = TEMPO_PRESETS.find(
          (p) => [...p.weekdays].sort().join(',') === tempoSortedKey
        );
        const DAY_LABELS = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
        const tempoLabel = tempoWeekdays.length === 0
          ? 'Ingen rytm'
          : matchedPreset
            ? matchedPreset.label
            : tempoWeekdays.map((d) => DAY_LABELS[d]).join(' · ');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontWeight: 500 }}>Rytm:</span>
            <button
              onClick={() => setShowTempoModal(true)}
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                border: `1px solid ${isTempoExplicit ? LeTrendColors.brownLight : LeTrendColors.border}`,
                background: isTempoExplicit ? LeTrendColors.brownLight : 'transparent',
                color: isTempoExplicit ? 'white' : LeTrendColors.textMuted,
                fontSize: 11,
                fontWeight: isTempoExplicit ? 500 : 400,
                cursor: 'pointer',
                opacity: isTempoExplicit ? 1 : 0.65,
              }}
            >
              {isTempoExplicit ? tempoLabel : `${tempoLabel} (standard)`}
            </button>
          </div>
        );
      })()}

      {/* TempoModal — preset + free-form weekday picker */}
      {showTempoModal && (() => {
        const DAY_LABELS = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
        const tempoSortedKey = [...tempoWeekdays].sort().join(',');
        const matchedPreset = TEMPO_PRESETS.find(
          (p) => [...p.weekdays].sort().join(',') === tempoSortedKey
        );
        const tempoLabel = tempoWeekdays.length === 0
          ? 'Ingen projektion'
          : matchedPreset
            ? `~${matchedPreset.label}`
            : `~${tempoWeekdays.map((d) => DAY_LABELS[d]).join('/')}`;

        const toggleWeekday = (day: number) => {
          const next = tempoWeekdays.includes(day)
            ? tempoWeekdays.filter((d) => d !== day)
            : [...tempoWeekdays, day].sort((a, b) => a - b);
          void onTempoWeekdaysChange(next);
        };

        return (
          <div
            onClick={() => setShowTempoModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 95,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(26,22,18,0.32)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(480px, calc(100vw - 32px))',
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, color: '#4A2F18' }}>Postningsrytm</h3>
                <button
                  type="button"
                  onClick={() => setShowTempoModal(false)}
                  style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', color: LeTrendColors.textMuted }}
                >×</button>
              </div>

              {/* Presets */}
              <div style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Förinställningar
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {TEMPO_PRESETS.map((preset) => {
                  const isActive = [...preset.weekdays].sort().join(',') === tempoSortedKey;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => void onTempoWeekdaysChange(preset.weekdays)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 999,
                        border: `1px solid ${isActive ? '#4A2F18' : 'rgba(74,47,24,0.18)'}`,
                        background: isActive ? '#4A2F18' : 'transparent',
                        color: isActive ? 'white' : LeTrendColors.textMuted,
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Free-form weekday picker */}
              <div style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Anpassade dagar
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {DAY_LABELS.map((label, idx) => {
                  const active = tempoWeekdays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeekday(idx)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        border: `1px solid ${active ? '#4A2F18' : 'rgba(74,47,24,0.18)'}`,
                        background: active ? '#4A2F18' : 'transparent',
                        color: active ? 'white' : LeTrendColors.textMuted,
                        fontSize: 11,
                        fontWeight: active ? 700 : 400,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {label.slice(0, 2)}
                    </button>
                  );
                })}
              </div>

              {/* Live preview */}
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic', opacity: 0.7 }}>
                {tempoLabel}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Advancement cue — shown when new clips appear in the customer's historik.
          Hidden when deferredAdvanceCue is true (session-local only, no backend write).
          Hidden when pendingAdvanceCue is null (signal resolved or not yet arrived). */}
      {pendingAdvanceCue && !deferredAdvanceCue && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 16,
          padding: '10px 14px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: LeTrendRadius.md,
          fontSize: 13,
        }}>
          {(() => {
            return (
              <>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#166534', fontWeight: 600 }}>
              {pendingAdvanceCue.kind === 'fresh_activity'
                ? `${pendingAdvanceCue.imported} nya klipp i historiken`
                : `${pendingAdvanceCue.imported} historiska klipp importerade`}
            </div>
            <div style={{ color: '#166534', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
              {pendingAdvanceCue.kind === 'fresh_activity'
                ? (nuConcept
                    ? 'Var det nu-konceptet som publicerades?'
                    : (hasActivePlan
                        ? 'Kunden publicerade nytt – flytta kommande och nu ett steg framåt.'
                        : 'Placera ett koncept i planen för att kunna flytta framåt.'))
                : (hasActivePlan
                    ? 'Äldre innehåll – granska historiken innan du flyttar planen.'
                    : 'Äldre innehåll importerat till historiken.')}
            </div>
            {/* Nu-concept reference — shows the active nu concept when the signal is fresh_activity.
                Bridges the external evidence (imported clips) with the LeTrend production path. */}
            {nuConcept && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#166534', opacity: 0.8 }}>
                Nu: <span style={{ fontWeight: 600 }}>
                  {nuConcept.content.content_overrides?.headline ?? 'Aktivt koncept'}
                </span>
              </div>
            )}
            {/* History glimpse — the same fresh-evidence set that will be highlighted in historik.
                Uses freshImportedConcepts (same derivation as focusedEvidenceIds) so glimpse
                and historik highlight always show the same clips. */}
            {freshImportedConcepts.length > 0 && (() => {
              const glimpse = freshImportedConcepts.slice(0, 3);
              return (
                <>
                  <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, marginTop: 8, marginBottom: 3, fontWeight: 600, letterSpacing: '0.03em' }}>
                    {freshImportedConcepts.length} {freshImportedConcepts.length === 1 ? 'nytt klipp' : 'nya klipp'}
                    {freshImportedConcepts.length > 3 ? ` · visar ${glimpse.length}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {glimpse.map((clip) => {
                      const caption = clip.content.content_overrides?.script ?? null;
                      const date = clip.result.published_at
                        ? new Date(clip.result.published_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                        : null;
                      return (
                        <div
                          key={clip.id}
                          style={{
                            display: 'flex',
                            gap: 5,
                            alignItems: 'flex-start',
                            flex: 1,
                            minWidth: 0,
                            background: 'rgba(255,255,255,0.55)',
                            borderRadius: LeTrendRadius.sm,
                            padding: '5px 6px',
                          }}
                        >
                          {clip.result.tiktok_thumbnail_url && (
                            <img
                              src={clip.result.tiktok_thumbnail_url}
                              alt=""
                              style={{ width: 20, height: 35, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                            />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {caption && (
                              <div style={{
                                fontSize: 10,
                                color: '#166534',
                                opacity: 0.85,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.3,
                                marginBottom: 2,
                              }}>
                                {caption}
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: '#166534', opacity: 0.6, lineHeight: 1.3 }}>
                              {date ?? '—'}
                              {clip.result.tiktok_views && clip.result.tiktok_views > 0
                                ? ` · ${formatCompactViews(clip.result.tiktok_views)}`
                                : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            {/* Tertiary cue actions — no backend writes, purely local navigation aids.
                Granska: scrolls the grid into historik and marks the same fresh-evidence clips
                         shown in the glimpse above — so the CM can review them in context.
                Inte nu: defers the cue locally for this session without acknowledging the signal. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setHistoryOffset(gridConfig.columns);
                  setFocusedEvidenceIds(freshImportedIds);
                }}
                style={{
                  background: 'none', border: 'none', fontSize: 11,
                  color: '#166534', opacity: 0.75, cursor: 'pointer',
                  padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                {freshImportedIds.size > 0
                  ? `Granska ${freshImportedIds.size} klipp i historiken`
                  : 'Granska historiken'}
              </button>
              {/* Post-click confirmation: appears once focusedEvidenceIds is set */}
              {focusedEvidenceIds.size > 0 && (
                <span style={{ fontSize: 10, color: '#166534', opacity: 0.5 }}>
                  ↓ markerade nedan
                </span>
              )}
              <span style={{ fontSize: 10, color: '#166534', opacity: 0.35 }}>·</span>
              <button
                onClick={() => setDeferredAdvanceCue(true)}
                style={{
                  background: 'none', border: 'none', fontSize: 11,
                  color: '#6b7280', opacity: 0.75, cursor: 'pointer',
                  padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                Inte nu
              </button>
            </div>
          </div>
          {nuConcept ? (
            // fresh_activity + nu concept exists: offer Markera och flytta as primary,
            // Flytta utan länk as secondary (advance without closing the concept cycle / without linking URL)
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <button
                onClick={() => {
                  void (async () => {
                    setMarkingProducedFromCue(true);
                    try {
                      // If fresh evidence clips are present, attach the newest clip's TikTok URL.
                      // The CM has already reviewed these clips in the glimpse above — linking the
                      // freshest one closes the concept cycle with real publication proof.
                      const linkClip = freshImportedConcepts.length > 0 ? freshImportedConcepts[0] : null;
                      await handleMarkProduced(
                        nuConcept.id,
                        linkClip?.result.tiktok_url ?? undefined,
                        linkClip?.result.published_at ?? undefined,
                      );
                      onDismissAdvanceCue(); // consume motor signal (acknowledge) and clear local cue
                    } finally {
                      setMarkingProducedFromCue(false);
                    }
                  })();
                }}
                disabled={markingProducedFromCue || advancingPlan}
                style={{
                  padding: '5px 12px',
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: markingProducedFromCue || advancingPlan ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {markingProducedFromCue ? 'Markerar...' : 'Markera och flytta'}
              </button>
              {/* Inline signal: shows which clip will be linked when CM confirms.
                  Only rendered when the freshest clip has a URL (no URL = no link label). */}
              {freshImportedConcepts.length > 0 && freshImportedConcepts[0].result.tiktok_url && (
                <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, textAlign: 'right' }}>
                  {'↑ länkar klippet'}
                  {freshImportedConcepts[0].result.published_at
                    ? ` · ${new Date(freshImportedConcepts[0].result.published_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
                    : ''}
                </div>
              )}
              <button
                onClick={() => void onAdvancePlan()}
                disabled={advancingPlan || markingProducedFromCue}
                style={{
                  padding: '3px 10px',
                  background: 'none',
                  border: '1px solid #9ca3af',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 11,
                  fontWeight: 400,
                  color: '#4b5563',
                  cursor: advancingPlan || markingProducedFromCue ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {advancingPlan ? 'Flyttar...' : 'Flytta utan länk'}
              </button>
            </div>
          ) : hasActivePlan ? (
            // No nu concept (only kommande) or backfill: keep existing advance-only CTA
            <button
              onClick={() => void onAdvancePlan()}
              disabled={advancingPlan}
              style={pendingAdvanceCue.kind === 'fresh_activity' ? {
                padding: '5px 12px',
                background: '#16a34a',
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              } : {
                padding: '5px 12px',
                background: 'none',
                border: '1px solid #9ca3af',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 400,
                color: '#4b5563',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {advancingPlan ? 'Flyttar...' : 'Flytta planen framåt'}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', paddingTop: 3 }}>
              Inget kommande i planen
            </span>
          )}
          <button
            onClick={onDismissAdvanceCue}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0 2px',
            }}
          >
            ×
          </button>
        </>
      );
    })()}
        </div>
      )}

      {/* Deferred cue indicator — visible when CM clicked "Inte nu" and has not entered review mode.
          Reminds them the motor signal is still pending and will return on next page load.
          Keeps "I have deferred the cue" distinguishable from "cue resolved" or "reviewing". */}
      {pendingAdvanceCue && deferredAdvanceCue && focusedEvidenceIds.size === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
          padding: '5px 10px',
          background: 'rgba(107,114,128,0.06)',
          border: '1px solid rgba(107,114,128,0.18)',
          borderRadius: LeTrendRadius.sm,
          fontSize: 11,
          color: '#6b7280',
        }}>
          <span style={{ opacity: 0.8 }}>
            Signal pausad – återkommer vid nästa inläsning
            <span style={{ opacity: 0.6, marginLeft: 4 }}>
              ({pendingAdvanceCue.imported} {pendingAdvanceCue.kind === 'fresh_activity' ? 'nya' : 'historiska'} klipp)
            </span>
          </span>
          <button
            onClick={() => setDeferredAdvanceCue(false)}
            style={{
              background: 'none', border: 'none', fontSize: 11,
              color: '#6b7280', cursor: 'pointer', padding: 0,
              textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Återuppta
          </button>
        </div>
      )}

      {/* Koncept-väljare dropdown */}
      {getDraftConcepts().length > 0 && (
        <div
          style={{
            marginBottom: 16,
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            overflow: 'hidden'
          }}
        >
          <button
            onClick={() => setShowConceptPicker(!showConceptPicker)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'white',
              border: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: LeTrendColors.brownDark
            }}
          >
            <span>Odelade kunduppdrag ({getDraftConcepts().length})</span>
            <span style={{ fontSize: 16 }}>{showConceptPicker ? '−' : '+'}</span>
          </button>

          {showConceptPicker && (
            <div
              style={{
                padding: '8px 12px 12px',
                maxHeight: 300,
                overflow: 'auto',
                background: '#FAFAFA'
              }}
            >
              <div style={{
                fontSize: 11,
                color: LeTrendColors.textMuted,
                marginBottom: 8,
                paddingLeft: 4
              }}>
                Dra ett kunduppdrag till en tom slot. Om du vill välja plats först, klicka på en tom slot i planen.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {getDraftConcepts().map(concept => {
                  const details = getWorkspaceConceptDetails(concept, getConceptDetails);
                  return (
                    <div
                      key={concept.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/concept-id', concept.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      style={{
                        background: 'white',
                        border: `1px solid ${LeTrendColors.border}`,
                        borderRadius: LeTrendRadius.sm,
                        padding: '10px 12px',
                        textAlign: 'left',
                        cursor: 'grab',
                        transition: 'all 0.15s',
                        fontSize: 13,
                        color: LeTrendColors.brownDark,
                        fontWeight: 500,
                        userSelect: 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = LeTrendColors.brownLight;
                        e.currentTarget.style.background = '#F9FAFB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = LeTrendColors.border;
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      {getWorkspaceConceptTitle(concept, details ?? null)}
                      <span style={{ fontSize: 10, color: LeTrendColors.textMuted, marginLeft: 8 }}>
                        dra till tom kommande slot
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Granskningsläge-banner — visible when CM is reviewing fresh evidence in historik.
          Self-sufficient: shows signal context and kind even when the cue block is not visible
          (e.g. cue deferred). Includes a re-open path when the cue has been deferred.
          Dismissable: × clears focusedEvidenceIds without resolving the cue. */}
      {focusedEvidenceIds.size > 0 && pendingAdvanceCue && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
          padding: '5px 10px',
          background: 'rgba(22,101,52,0.06)',
          border: '1px solid rgba(22,101,52,0.18)',
          borderRadius: LeTrendRadius.sm,
          fontSize: 11,
          color: '#166534',
        }}>
          <span style={{ opacity: 0.75, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>
              Granskningsläge
              {' · '}
              {focusedEvidenceIds.size} {pendingAdvanceCue.kind === 'fresh_activity' ? 'nya' : 'historiska'} klipp markerade med <strong style={{ fontWeight: 700 }}>nytt</strong>
            </span>
            {/* When cue is deferred: signal the deferred state and offer to re-open the cue */}
            {deferredAdvanceCue && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ opacity: 0.6 }}>signal pausad</span>
                <button
                  onClick={() => setDeferredAdvanceCue(false)}
                  style={{
                    background: 'none', border: 'none', fontSize: 11,
                    color: '#166534', cursor: 'pointer', padding: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                >
                  Återuppta
                </button>
              </>
            )}
          </span>
          <button
            onClick={() => setFocusedEvidenceIds(new Set())}
            style={{
              background: 'none', border: 'none', fontSize: 13, lineHeight: 1,
              color: '#166534', opacity: 0.45, cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
            title="Stäng granskningsläge"
          >
            ×
          </button>
        </div>
      )}

      {/* Grid med Åliden till vänster */}
      <div ref={gridWrapperRef} style={{ position: 'relative', paddingLeft: 70 }}>
        {/* Åliden SVG - till vänster om grid via padding */}
        {eelPath && (
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 60,
              height: '100%',
              pointerEvents: 'all',
              zIndex: 3,
              overflow: 'visible',
              cursor: drag?.type === 'create' ? 'ns-resize' : 'crosshair',
              opacity: eelHovered || editingSpan || drag ? 1 : 0.35,
              transition: 'opacity 0.2s ease'
            }}
            onMouseDown={onEelDown}
            onMouseEnter={() => setEelHovered(true)}
            onMouseLeave={() => {
              setEelHovered(false);
              if (!drag) setHoveredSpan(null);
            }}
          >
            <defs>
              {/* Glow filter for spans */}
              <filter id="glow-span">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Gradients for tags */}
              {eelGradients.map((grad, i) => (
                <linearGradient key={i} id={grad.id} {...grad.attrs}>
                  <stop offset="0%" stopColor={grad.fromColor} />
                  <stop offset="100%" stopColor={grad.toColor} />
                </linearGradient>
              ))}

              {/* Gradients for spans (shifted by fracOffset for scroll) */}
              {spans.map((span) => {
                const viewStart = span.frac_start - fracOffset;
                const viewEnd = span.frac_end - fracOffset;
                // Skip if entirely out of view
                if (viewEnd < -0.1 || viewStart > 1.1) return null;
                const yStart = fracToY(Math.max(0, viewStart), slotAnchors);
                const yEnd = fracToY(Math.min(1, viewEnd), slotAnchors);
                const col = SPAN_COLOR_PALETTE[span.color_index].color;
                return (
                  <linearGradient
                    key={`span-grad-${span.id}`}
                    id={`span-grad-${span.id}`}
                    x1={0}
                    y1={yStart}
                    x2={0}
                    y2={yEnd}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={col} stopOpacity={viewStart < 0 ? 0.85 : 0.08} />
                    <stop offset="18%" stopColor={col} stopOpacity={0.85} />
                    <stop offset="82%" stopColor={col} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={col} stopOpacity={viewEnd > 1 ? 0.85 : 0.08} />
                  </linearGradient>
                );
              }).filter(Boolean)}

              {/* Gradient for drag creation (already in view-space since drag uses grid coords) */}
              {drag?.type === 'create' &&
                drag.a !== undefined &&
                drag.b !== undefined &&
                (() => {
                  const yA = fracToY(Math.max(0, Math.min(drag.a, drag.b)), slotAnchors);
                  const yB = fracToY(Math.min(1, Math.max(drag.a, drag.b)), slotAnchors);
                  const col = SPAN_COLOR_PALETTE[drag.colorIdx || 0].color;
                  return (
                    <linearGradient
                      id="span-drag-grad"
                      x1={0}
                      y1={yA}
                      x2={0}
                      y2={yB}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={col} stopOpacity={0.05} />
                      <stop offset="25%" stopColor={col} stopOpacity={0.65} />
                      <stop offset="75%" stopColor={col} stopOpacity={0.65} />
                      <stop offset="100%" stopColor={col} stopOpacity={0.05} />
                    </linearGradient>
                  );
                })()}
            </defs>

            {/* Render spans (positions shifted by fracOffset for scroll) */}
            {slotAnchors.length > 0 &&
              spans.map((span) => {
                const viewStart = span.frac_start - fracOffset;
                const viewEnd = span.frac_end - fracOffset;
                // Skip spans entirely outside visible area
                if (viewEnd < -0.05 || viewStart > 1.05) return null;
                const clampedStart = Math.max(0, viewStart);
                const clampedEnd = Math.min(1, viewEnd);
                const yStart = fracToY(clampedStart, slotAnchors);
                const yEnd = fracToY(clampedEnd, slotAnchors);
                const yMid = (yStart + yEnd) / 2;
                const col = SPAN_COLOR_PALETTE[span.color_index].color;
                const isVis = visSpan === span.id;
                // Climax mark disabled — functionality TBD
                // const climaxGlobalFrac = span.climax_date
                //   ? climaxDateToGlobalFrac(new Date(span.climax_date), tempoAnchor, tempoWeekdays, gridConfig)
                //   : null;
                // const yClim = climaxGlobalFrac !== null ? fracToY(Math.max(0,Math.min(1,climaxGlobalFrac-fracOffset)),slotAnchors) : null;

                return (
                  <g key={`span-${span.id}`}>
                    {/* Glow effect when hovered/active */}
                    {isVis && (
                      <line
                        x1={18}
                        y1={yStart}
                        x2={18}
                        y2={yEnd}
                        stroke={col}
                        strokeWidth={14}
                        opacity={0.12}
                        strokeLinecap="round"
                        filter="url(#glow-span)"
                      />
                    )}

                    {/* Main span line */}
                    <line
                      x1={18}
                      y1={yStart}
                      x2={18}
                      y2={yEnd}
                      stroke={`url(#span-grad-${span.id})`}
                      strokeWidth={isVis ? 5 : 3}
                      strokeLinecap="round"
                      style={{
                        transition: 'stroke-width 0.2s ease',
                        cursor: 'pointer',
                        pointerEvents: 'all'
                      }}
                    />

                    {/* Drag handles at endpoints — only when active */}
                    {isVis && (
                      <>
                        <circle
                          cx={18} cy={yStart} r={4}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                          onMouseDown={(e) => { e.stopPropagation(); stableHandlers.openSpan(span.id); stableHandlers.beginResize(span.id, 'start'); }}
                        />
                        <circle
                          cx={18} cy={yEnd} r={4}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                          onMouseDown={(e) => { e.stopPropagation(); stableHandlers.openSpan(span.id); stableHandlers.beginResize(span.id, 'end'); }}
                        />
                      </>
                    )}

                    {/* Climax mark disabled */}

                    {/* Center dot — always visible, opens edit on click */}
                    <g
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingSpan && editingSpan !== span.id) {
                          void saveCurrentSpanTextIfDirty();
                        }
                        setActiveSpan(span.id);
                        setEditingSpan(span.id);
                        setEditTitle(span.title);
                        setEditBody(span.body);
                      }}
                      onMouseEnter={() => setHoveredSpan(span.id)}
                      onMouseLeave={() => setHoveredSpan(null)}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    >
                      <circle
                        cx={18} cy={yMid}
                        r={isVis ? 8 : 5}
                        fill={col}
                        opacity={isVis ? 1 : 0.55}
                      />
                      <circle
                        cx={18} cy={yMid}
                        r={isVis ? 2.5 : 1.5}
                        fill="white"
                        opacity={0.9}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  </g>
                );
              })}

            {/* In-progress drag creation */}
            {drag?.type === 'create' &&
              drag.a !== undefined &&
              drag.b !== undefined &&
              slotAnchors.length > 0 &&
              (() => {
                const yA = fracToY(Math.min(drag.a, drag.b), slotAnchors);
                const yB = fracToY(Math.max(drag.a, drag.b), slotAnchors);
                return (
                  <line
                    x1={18}
                    y1={yA}
                    x2={18}
                    y2={yB}
                    stroke="url(#span-drag-grad)"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })()}

            {/* Z-linjen (eelPath) gömd enligt användarens önskemål */}
            {false && eelSegments.length > 0 ? (
              eelSegments.map((segmentPath, i) => (
                <path
                  key={`eel-segment-${i}`}
                  d={segmentPath}
                  stroke={eelGradients[i] ? `url(#${eelGradients[i].id})` : '#D1C4B5'}
                  strokeWidth={2.5}
                  fill="none"
                  opacity={0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))
            ) : (
              false && <path
                d={eelPath}
                stroke="#D1C4B5"
                strokeWidth={2.5}
                fill="none"
                opacity={0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        )}

        {/* Grid — clicking it clears active span so eel returns to idle */}
        <div
          ref={gridRef}
          onClick={() => {
            if (activeSpan && !editingSpan) setActiveSpan(null);
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
            gap: 8,
            position: 'relative',
            zIndex: 2
          }}
        >
          {slotMap.map((slot, slotIdx) => {
            const spanData = allSpansCoverage.get(slotIdx);
            return (
              <FeedSlot
                key={slot.slotIndex}
                slot={slot}
                tags={cmTags}
              config={gridConfig}
              spanCoverage={spanData?.coverage ?? 0}
              spanColor={spanData?.color ?? null}
              showSpanCoverageLabels={eelHovered || !!activeSpan || !!editingSpan || !!drag}
              projectedDate={tempoDateMap.get(slot.feedOrder) ?? null}
              isFreshEvidence={slot.concept != null && focusedEvidenceIds.has(slot.concept.id)}
              getConceptDetails={getConceptDetails}
              onMarkProduced={handleMarkProduced}
              onRemoveFromSlot={handleRemoveFromSlot}
              onAssignToSlot={handleAssignToSlot}
              onUpdateTags={handleUpdateConceptTags}
              onUpdateNote={handleUpdateCmNote}
              onUpdateTikTokUrl={handleUpdateTikTokUrl}
              onPatchConcept={handlePatchConcept}
              onOpenConcept={onOpenConcept}
              onSlotClick={onSlotClick}
            />
            );
          })}
        </div>

        {/* Floating edit panel — positioned over grid, centered at span midpoint */}
        {editingSpan && editPanelY !== null && (() => {
          const span = spans.find(s => s.id === editingSpan);
          if (!span) return null;
          const col = SPAN_COLOR_PALETTE[span.color_index].color;
          const count = slotAnchors.length ? touchedSlots(span, slotAnchors).length : 0;
          const countToDisplay = editingSpan === span.id ? animatedCount : count;
          const isDirty = editTitle !== span.title || editBody !== span.body;

          return (
            <div
              style={{
                position: 'absolute',
                left: 78,
                right: 0,
                top: editPanelY,
                transform: 'translateY(-50%)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 'min(300px, 100%)',
                  background: '#fff',
                  borderRadius: LeTrendRadius.lg,
                  padding: '14px 16px',
                  boxShadow: '0 6px 28px rgba(74,47,24,0.16)',
                  borderTop: `3px solid ${col}`,
                  pointerEvents: 'all',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {SPAN_COLOR_PALETTE[span.color_index].name}
                    </span>
                    <span style={{ fontSize: 10, color: LeTrendColors.textMuted }}>· {countToDisplay} klipp</span>
                    {isDirty && (
                      <span style={{ fontSize: 9, color: '#d97706', fontWeight: 600, background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>
                        Osparad
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      // Close without saving — restore to last saved values
                      setEditTitle(span.title);
                      setEditBody(span.body);
                      setEditingSpan(null);
                      setActiveSpan(null);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: LeTrendColors.textMuted, fontSize: 18, lineHeight: 1 }}
                  >×</button>
                </div>

                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Rubrik — t.ex. Alla hjärtans dag"
                  style={{
                    width: '100%', padding: '7px 9px', borderRadius: LeTrendRadius.md,
                    border: `1.5px solid ${col}44`, fontSize: 12, fontWeight: 600,
                    color: LeTrendColors.brownDark, background: LeTrendColors.cream,
                    outline: 'none', marginBottom: 7, boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />

                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Strategi och innehållstankar för detta spann..."
                  rows={3}
                  style={{
                    width: '100%', padding: '7px 9px', borderRadius: LeTrendRadius.md,
                    border: `1.5px solid ${LeTrendColors.border}`, fontSize: 11, lineHeight: 1.5,
                    color: LeTrendColors.brownDark, background: '#fff', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />

                {/* Färgval */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: LeTrendColors.textMuted, fontWeight: 600, flexShrink: 0 }}>Färg:</span>
                  {SPAN_COLOR_PALETTE.map((p, i) => (
                    <div
                      key={i}
                      title={p.name}
                      onClick={() => {
                        setSpans(prev => prev.map(s => s.id === span.id ? { ...s, color_index: i } : s));
                        setNextColorIdx(i);
                        void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ color_index: i })
                        }).catch(() => void reloadSpansFromServer());
                      }}
                      style={{
                        width: i === span.color_index ? 14 : 10,
                        height: i === span.color_index ? 14 : 10,
                        borderRadius: '50%',
                        background: p.color,
                        cursor: 'pointer',
                        outline: i === span.color_index ? `2px solid ${p.color}` : 'none',
                        outlineOffset: 2,
                        opacity: i === span.color_index ? 1 : 0.4,
                        transition: 'all 0.12s',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Spandatum — visar range, klicka "ändra" för att editera */}
                {(() => {
                  const startDate = globalFracToProjectedDate(span.frac_start, tempoAnchor, tempoWeekdays, gridConfig);
                  const endDate   = globalFracToProjectedDate(span.frac_end,   tempoAnchor, tempoWeekdays, gridConfig);
                  if (!startDate && !endDate) return null;
                  const fmt = (d: Date | null) => d ? d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : '?';
                  const toVal = (d: Date | null) => d ? d.toISOString().slice(0, 10) : '';
                  const fromInput = (val: string, fallback: number) => {
                    if (!val) return fallback;
                    const f = dateToGlobalFrac(new Date(val), tempoAnchor, tempoWeekdays, gridConfig);
                    return f ?? fallback;
                  };
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: LeTrendColors.textMuted, fontWeight: 600, flexShrink: 0 }}>Period:</span>
                        {!editingPeriod ? (
                          <>
                            <span style={{ fontSize: 11, color: col, fontWeight: 500 }}>{fmt(startDate)} – {fmt(endDate)}</span>
                            <button type="button" onClick={() => setEditingPeriod(true)}
                              style={{ fontSize: 9, color: LeTrendColors.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 }}>
                              ändra
                            </button>
                          </>
                        ) : (
                          <>
                            <input type="date" defaultValue={toVal(startDate)} key={`start-${span.id}`}
                              onBlur={(e) => {
                                const newFrac = fromInput(e.target.value, span.frac_start);
                                if (Math.abs(newFrac - span.frac_start) < 0.001) return;
                                setSpans(prev => prev.map(s => s.id === span.id ? { ...s, frac_start: Math.min(newFrac, s.frac_end - 0.01) } : s));
                                void fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frac_start: Math.min(newFrac, span.frac_end - 0.01) }) }).catch(() => void reloadSpansFromServer());
                              }}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: LeTrendRadius.sm, border: `1px solid ${col}44`, color: col, background: `${col}0d`, outline: 'none', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 9, color: LeTrendColors.textMuted }}>–</span>
                            <input type="date" defaultValue={toVal(endDate)} key={`end-${span.id}`}
                              onBlur={(e) => {
                                const newFrac = fromInput(e.target.value, span.frac_end);
                                if (Math.abs(newFrac - span.frac_end) < 0.001) return;
                                setSpans(prev => prev.map(s => s.id === span.id ? { ...s, frac_end: Math.max(newFrac, s.frac_start + 0.01) } : s));
                                void fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frac_end: Math.max(newFrac, span.frac_start + 0.01) }) }).catch(() => void reloadSpansFromServer());
                              }}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: LeTrendRadius.sm, border: `1px solid ${col}44`, color: col, background: `${col}0d`, outline: 'none', cursor: 'pointer' }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Klimaxdatum — inaktiverat */}

                {/* Footer actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
                  <button
                    onClick={async () => {
                      if (!confirm('Ta bort detta spann?')) return;
                      try {
                        await fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'DELETE' });
                        setSpans(prev => prev.filter(s => s.id !== span.id));
                        setEditingSpan(null); setActiveSpan(null);
                      } catch { alert('Kunde inte ta bort spann'); }
                    }}
                    style={{ fontSize: 10, padding: '5px 10px', borderRadius: LeTrendRadius.sm, background: 'transparent', border: `1px solid ${LeTrendColors.border}`, color: LeTrendColors.textMuted, cursor: 'pointer' }}
                  >
                    Ta bort spann
                  </button>
                  <button
                    onClick={async () => {
                      setSpans(prev => prev.map(s => s.id === span.id ? { ...s, title: editTitle, body: editBody } : s));
                      try {
                        await fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title: editTitle, body: editBody })
                        });
                        setEditingSpan(null); setActiveSpan(null);
                      } catch {
                        alert('Kunde inte spara spann');
                        void reloadSpansFromServer();
                      }
                    }}
                    style={{ fontSize: 10, padding: '5px 14px', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownDark, color: LeTrendColors.cream, border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Godkänn
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Scroll controls + undo */}
      <div style={{
        marginTop: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Scroll forward (see more kommande/future) — capped at maxForwardSlots */}
        <button
          onClick={() => setHistoryOffset(prev => Math.max(prev - gridConfig.columns, -maxForwardSlots))}
          disabled={historyOffset <= -maxForwardSlots}
          style={{
            padding: '8px 14px',
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: historyOffset <= -maxForwardSlots ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            opacity: historyOffset <= -maxForwardSlots ? 0.4 : 1
          }}
        >
          ⬆ Framåt
        </button>

        {/* Scroll lock toggle */}
        <button
          onClick={() => setScrollLocked(p => !p)}
          title={scrollLocked ? 'Skroll låst — klicka för att låsa upp' : 'Lås skroll'}
          style={{
            padding: '8px 14px',
            background: scrollLocked ? LeTrendColors.brownDark : 'white',
            border: `1px solid ${scrollLocked ? LeTrendColors.brownDark : LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: scrollLocked ? 'white' : LeTrendColors.textMuted,
          }}
        >
          {scrollLocked ? '🔒' : '🔓'}
        </button>

        {/* Back to now */}
        {historyOffset !== 0 && (
          <button
            onClick={() => setHistoryOffset(0)}
            style={{
              padding: '8px 14px',
              background: LeTrendColors.brownDark,
              border: 'none',
              borderRadius: LeTrendRadius.md,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: 'white'
            }}
          >
            ↻ Nu
          </button>
        )}

        {/* Scroll back (see more historik) — fetch is handled by threshold useEffect, not here */}
        <button
          onClick={() => {
            // Gate: don't move viewport deeper while a fetch is in flight
            if (fetchingProfileHistory) return;
            setHistoryOffset(prev => Math.min(prev + gridConfig.columns, maxExtraHistorySlots));
          }}
          disabled={historyOffset >= maxExtraHistorySlots || fetchingProfileHistory}
          style={{
            padding: '8px 14px',
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: (historyOffset >= maxExtraHistorySlots || fetchingProfileHistory) ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            opacity: (historyOffset >= maxExtraHistorySlots || fetchingProfileHistory) ? 0.4 : 1
          }}
        >
          {fetchingProfileHistory ? 'Laddar historik…' : 'Historik ⬇'}
        </button>
        {!historyHasMore && historyOffset > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
              Äldsta klipp visas
            </span>
            <button
              onClick={() => void reloadSpansFromServer()}
              style={{
                padding: '4px 10px',
                background: 'transparent',
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                color: LeTrendColors.textMuted,
              }}
            >
              Ladda äldre historik
            </button>
          </span>
        )}

        {historyOffset !== 0 && (
          <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
            Visar klipp {historyOffset > 0 ? `${historyOffset} steg bakåt` : `${Math.abs(historyOffset)} steg framåt`}
          </span>
        )}

      </div>

      {/* Passive span body preview — visible on center-dot hover, hides when editing */}
      {hoveredSpan && !editingSpan && (() => {
        const hSpan = spans.find(s => s.id === hoveredSpan);
        if (!hSpan?.body?.trim()) return null;
        const col = SPAN_COLOR_PALETTE[hSpan.color_index].color;
        return (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: LeTrendRadius.md,
            borderLeft: `3px solid ${col}`,
            background: `${col}0a`,
            fontSize: 11.5,
            color: LeTrendColors.textSecondary,
            lineHeight: 1.6
          }}>
            {hSpan.title && (
              <div style={{ fontWeight: 700, color: col, fontSize: 11, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {hSpan.title}
              </div>
            )}
            {hSpan.body}
          </div>
        );
      })()}

      {/* Tag Manager Modal */}
      {showTagManager && (
        <TagManager
          tags={cmTags}
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={async () => {
            await refreshCmTags(true);
          }}
        />
      )}
    </div>
  );
}

function FeedSlot({
  slot,
  tags,
  spanCoverage = 0,
  spanColor = null,
  showSpanCoverageLabels = true,
  projectedDate = null,
  isFreshEvidence = false,
  getConceptDetails,
  onMarkProduced,
  onRemoveFromSlot,
  onAssignToSlot,
  onUpdateTags,
  onUpdateNote,
  onUpdateTikTokUrl,
  onPatchConcept,
  onOpenConcept,
  onSlotClick
}: FeedSlotProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState<{
    top: number; left: number;
    triggerBottom: number; triggerTop: number;
  } | null>(null);

  // After menu renders: flip upward if height overflows bottom; clamp left if width overflows right
  React.useLayoutEffect(() => {
    if (!showContextMenu || !menuRef.current || !menuPos) return;
    const menuEl = menuRef.current;
    const { width: menuWidth, height: menuHeight } = menuEl.getBoundingClientRect();
    // Vertical flip
    if (menuPos.triggerBottom + menuHeight + 8 > window.innerHeight) {
      menuEl.style.top = `${Math.max(8, menuPos.triggerTop - menuHeight - 4)}px`;
    }
    // Horizontal clamp: shift left if right edge overflows viewport
    const rightOverflow = menuPos.left + menuWidth + 8 - window.innerWidth;
    if (rightOverflow > 0) {
      menuEl.style.left = `${Math.max(8, menuPos.left - rightOverflow)}px`;
    }
  }, [showContextMenu, menuPos]);
  const [showTagPicker, setShowTagPicker] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState(false);
  const [editingTikTok, setEditingTikTok] = React.useState(false);
  const [editingMetadata, setEditingMetadata] = React.useState(false);
  const [editingPlannedDate, setEditingPlannedDate] = React.useState(false);
  const [editingPublishedDate, setEditingPublishedDate] = React.useState(false);
  const [localNote, setLocalNote] = React.useState('');
  const [localTikTokUrl, setLocalTikTokUrl] = React.useState('');
  const [localPlannedDate, setLocalPlannedDate] = React.useState('');
  const [localPublishedDate, setLocalPublishedDate] = React.useState('');
  const [localThumbnailUrl, setLocalThumbnailUrl] = React.useState('');
  const [localViews, setLocalViews] = React.useState('');
  const [localLikes, setLocalLikes] = React.useState('');
  const [localComments, setLocalComments] = React.useState('');
  const [localWatchTime, setLocalWatchTime] = React.useState('');

  const { concept, type } = slot;
  const details = concept ? getWorkspaceConceptDetails(concept, getConceptDetails) ?? null : null;
  const result = concept?.result ?? null;
  const markers = concept?.markers ?? null;
  const isPastSlot = slot.feedOrder < 0;
  const canAddConcept = type === 'empty' && !isPastSlot;
  const hasUnreadUpload = hasUnreadUploadMarker(concept);

  React.useEffect(() => {
    setLocalNote(markers?.assignment_note ?? '');
    setLocalTikTokUrl(result?.tiktok_url ?? '');
    setLocalThumbnailUrl(result?.tiktok_thumbnail_url ?? '');
    setLocalViews(result?.tiktok_views != null ? String(result.tiktok_views) : '');
    setLocalLikes(result?.tiktok_likes != null ? String(result.tiktok_likes) : '');
    setLocalComments(result?.tiktok_comments != null ? String(result.tiktok_comments) : '');
    setLocalWatchTime(result?.tiktok_watch_time_seconds != null ? String(result.tiktok_watch_time_seconds) : '');
    setLocalPlannedDate(result?.planned_publish_at ? result.planned_publish_at.slice(0, 10) : '');
    setLocalPublishedDate(result?.published_at ? result.published_at.slice(0, 10) : '');
    setEditingNote(false);
    setEditingTikTok(false);
    setEditingMetadata(false);
    setEditingPlannedDate(false);
    setEditingPublishedDate(false);
    setShowTagPicker(false);
  }, [
    concept?.id,
    markers?.assignment_note,
    result?.tiktok_url,
    result?.tiktok_thumbnail_url,
    result?.tiktok_views,
    result?.tiktok_likes,
    result?.tiktok_comments,
    result?.tiktok_watch_time_seconds,
    result?.planned_publish_at,
    result?.published_at
  ]);

  const formatMetric = (value: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return new Intl.NumberFormat('sv-SE', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseInputNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Ange ett icke-negativt tal');
    }
    return Math.round(parsed);
  };

  const handleSavePlannedDate = async () => {
    if (!concept) return;
    try {
      const value = localPlannedDate ? new Date(localPlannedDate).toISOString() : null;
      await onPatchConcept(concept.id, { planned_publish_at: value });
      setEditingPlannedDate(false);
      setShowContextMenu(false);
    } catch {
      alert('Kunde inte spara planerat datum');
    }
  };

  const handleSavePublishedDate = async () => {
    if (!concept) return;
    try {
      const value = localPublishedDate ? new Date(localPublishedDate).toISOString() : null;
      await onPatchConcept(concept.id, { published_at: value });
      setEditingPublishedDate(false);
      setShowContextMenu(false);
    } catch {
      alert('Kunde inte spara publicerat datum');
    }
  };


  const handleToggleTag = async (tagName: string) => {
    if (!concept) return;
    const currentTags = markers?.tags ?? [];
    const nextTags = currentTags.includes(tagName)
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName];

    try {
      await onUpdateTags(concept.id, nextTags);
    } catch (error) {
      console.error('Error updating concept tags:', error);
      alert('Kunde inte uppdatera taggar');
    }
  };

  const handleSaveNote = async () => {
    if (!concept) return;
    try {
      await onUpdateNote(concept.id, localNote);
      setEditingNote(false);
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Kunde inte spara notering');
    }
  };

  const handleSaveTikTok = async () => {
    if (!concept) return;
    try {
      await onUpdateTikTokUrl(concept.id, localTikTokUrl);
      setEditingTikTok(false);
    } catch (error) {
      console.error('Error updating TikTok URL:', error);
      alert('Kunde inte spara TikTok-länk');
    }
  };

  const handleSaveTikTokMetadata = async () => {
    if (!concept) return;
    try {
      await onPatchConcept(concept.id, {
        tiktok_thumbnail_url: localThumbnailUrl.trim() || null,
        tiktok_views: parseInputNumber(localViews),
        tiktok_likes: parseInputNumber(localLikes),
        tiktok_comments: parseInputNumber(localComments),
        tiktok_watch_time_seconds: parseInputNumber(localWatchTime),
        tiktok_last_synced_at: new Date().toISOString()
      });
      setEditingMetadata(false);
    } catch (error) {
      console.error('Error updating TikTok metadata:', error);
      alert(error instanceof Error ? error.message : 'Kunde inte spara TikTok-metadata');
    }
  };

  const handleMarkContentLoadedNow = async () => {
    if (!concept) return;
    try {
      await onPatchConcept(concept.id, {
        content_loaded_at: new Date().toISOString(),
        content_loaded_seen_at: null
      });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte markera uppladdning');
    }
  };

  const handleAcknowledgeUpload = async () => {
    if (!concept || !hasUnreadUpload) return;
    try {
      await onPatchConcept(concept.id, {
        content_loaded_seen_at: new Date().toISOString()
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte markera uppladdning som sedd');
    }
  };

  // Visuell styling per slot-typ
  const slotStyles = {
    empty: {
      bg: LeTrendColors.cream,
      border: `2px dashed ${LeTrendColors.border}`,
      opacity: 1
    },
    planned: {
      bg: 'white',
      border: `1px solid rgba(74,47,24,0.1)`,
      opacity: 1
    },
    current: {
      bg: 'rgba(74,47,24,0.035)',
      border: `2px solid ${LeTrendColors.brownDark}`,
      opacity: 1
    },
    history: {
      bg: '#F0EDE8',
      border: `1px solid ${LeTrendColors.border}`,
      opacity: 0.85
    }
  };

  const style = slotStyles[type];
  const isSpanSelected = spanCoverage >= 1;
  // Tint and outline only visible when coverage labels are active (eel hovered/editing)
  const spanTint = isSpanSelected && spanColor && showSpanCoverageLabels ? hexToRgba(spanColor, 0.12) : null;
  const spanOutline = isSpanSelected && spanColor && showSpanCoverageLabels
    ? `inset 0 0 0 2px ${hexToRgba(spanColor, 0.5)}`
    : undefined;
  const showSpanCoveragePill = Boolean(showSpanCoverageLabels && isSpanSelected && spanColor);

  const [dragOver, setDragOver] = React.useState(false);
  const emptyBaseColor = canAddConcept ? style.bg : '#ECE7DF';
  const emptyBackgroundColor = dragOver ? 'rgba(107, 68, 35, 0.08)' : emptyBaseColor;
  const emptyBackgroundImage = !dragOver && spanTint
    ? `linear-gradient(${spanTint}, ${spanTint})`
    : 'none';

  // Tom slot
  if (type === 'empty') {
    return (
      <div
        data-slot-index={slot.slotIndex}
        onClick={() => {
          onSlotClick(slot, null, null);
        }}
        onDragOver={(e) => {
          if (canAddConcept) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const conceptId = e.dataTransfer.getData('text/concept-id');
          if (conceptId && canAddConcept && onAssignToSlot) {
            void onAssignToSlot(conceptId, slot.feedOrder);
          }
        }}
        style={{
          aspectRatio: '9/16',
          maxHeight: 280,
          backgroundColor: emptyBackgroundColor,
          backgroundImage: emptyBackgroundImage,
          backgroundPosition: '0% 0%',
          backgroundSize: 'auto',
          backgroundRepeat: 'repeat',
          border: dragOver
            ? `2px solid ${LeTrendColors.brownDark}`
            : canAddConcept ? style.border : `1px solid ${LeTrendColors.border}`,
          borderRadius: LeTrendRadius.lg,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canAddConcept ? 'pointer' : 'default',
          transition: 'all 0.2s',
          boxShadow: spanOutline
        }}
        onMouseEnter={(e) => {
          if (canAddConcept) {
            e.currentTarget.style.borderStyle = 'solid';
          }
        }}
        onMouseLeave={(e) => {
          if (canAddConcept) {
            e.currentTarget.style.borderStyle = 'dashed';
          }
        }}
      >
        {showSpanCoveragePill && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: spanColor || LeTrendColors.textMuted,
              boxShadow: `0 0 0 2px ${hexToRgba(spanColor || '#999', 0.3)}`,
              pointerEvents: 'none'
            }}
          />
        )}
        {canAddConcept ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'none', userSelect: 'none' }}>
            <span style={{ fontSize: 32, color: LeTrendColors.textMuted, opacity: 0.5 }}>+</span>
            {projectedDate && (
              <span style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.38, fontStyle: 'italic', letterSpacing: '0.02em', textAlign: 'center', lineHeight: 1.2 }}>
                ~{projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ) : isPastSlot ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'none', userSelect: 'none' }}>
            <span style={{ fontSize: 16, color: LeTrendColors.textMuted, opacity: 0.2, lineHeight: 1 }}>◦</span>
            <span style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.35, fontStyle: 'italic', letterSpacing: '0.04em' }}>historik</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Build background: thumbnail for history, or span tint, or default
  const thumbnailUrl = result?.tiktok_thumbnail_url;
  const hasThumbnail = type === 'history' && thumbnailUrl;
  const slotBackgroundColor = style.bg;
  const slotBackgroundImage = hasThumbnail
    ? `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 30%, rgba(0,0,0,0.22) 58%, rgba(0,0,0,0.80) 100%), url(${thumbnailUrl})`
    : spanTint
      ? `linear-gradient(${spanTint}, ${spanTint})`
      : 'none';

  // Filled slot
  return (
    <div
      data-slot-index={slot.slotIndex}
      style={{
        aspectRatio: '9/16',
        maxHeight: 280,
        backgroundColor: slotBackgroundColor,
        backgroundImage: slotBackgroundImage,
        backgroundSize: hasThumbnail ? 'cover' : 'auto',
        backgroundPosition: hasThumbnail ? 'center' : '0% 0%',
        backgroundRepeat: hasThumbnail ? 'no-repeat' : 'repeat',
        border: isFreshEvidence && type === 'history' ? '2px solid rgba(22, 101, 52, 0.55)' : style.border,
        borderRadius: LeTrendRadius.lg,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        opacity: isFreshEvidence && type === 'history' ? 1 : style.opacity,
        cursor: 'pointer',
        filter: type === 'history' ? (isHovered ? 'saturate(1)' : 'saturate(0.82)') : undefined,
        transition: type === 'history' ? 'filter 0.2s' : undefined,
        boxShadow: [
          spanOutline,
          isFreshEvidence && type === 'history' ? '0 0 0 3px rgba(22, 101, 52, 0.15)' : null,
          hasThumbnail ? 'inset 0 0 0 1px rgba(255,255,255,0.07)' : null,
        ].filter(Boolean).join(', ') || undefined
      }}
      onClick={(e) => {
        // Historik — always open context menu; activate URL editor only when no link exists yet
        if (type === 'history' && concept) {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenuPos({
            top: rect.top + 8,
            left: Math.max(8, rect.right - 196),
            triggerBottom: rect.bottom,
            triggerTop: rect.top + 8,
          });
          setShowContextMenu(true);
          if (!result?.tiktok_url) setEditingTikTok(true);
          return;
        }
        onSlotClick(slot, concept, details);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showSpanCoveragePill && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: spanColor || LeTrendColors.textMuted,
            boxShadow: `0 0 0 2px ${hexToRgba(spanColor || '#999', 0.3)}`,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Fresh-evidence badge — shown when CM arrived via "Granska historiken" from the motor cue */}
      {isFreshEvidence && type === 'history' && (
        <div style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: '#166534',
          color: 'rgba(255,255,255,0.92)',
          padding: '1px 5px',
          borderRadius: LeTrendRadius.sm,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          zIndex: 3,
        }}>
          nytt
        </div>
      )}

      {result?.content_loaded_at && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: hasUnreadUpload ? 'rgba(16, 185, 129, 0.14)' : 'rgba(107,114,128,0.12)',
            color: hasUnreadUpload ? '#047857' : '#4b5563',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            border: hasUnreadUpload ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(107,114,128,0.25)'
          }}
          title={hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
        >
          {hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
        </div>
      )}

      {/* Context menu icon */}
      {concept && (isHovered || showContextMenu) && (
        <button
          ref={menuBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!showContextMenu && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              setMenuPos({
                top: rect.bottom + 4,
                left: Math.max(8, rect.right - 196),
                triggerBottom: rect.bottom,
                triggerTop: rect.top,
              });
            }
            setShowContextMenu(v => !v);
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: LeTrendColors.textMuted
          }}
        >
          ⋯
        </button>
      )}

      {/* Koncept-innehåll — v2 layout för planned/current och history */}
      {concept && (type === 'planned' || type === 'current') ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 0 }}>
          {/* Övre: Nu-badge (current) + titel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {type === 'current' && (
              <div style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#4A2F18',
                color: '#FAF8F5',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                padding: '3px 7px 3px 5px',
                borderRadius: 5,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4813A', flexShrink: 0 }} />
                Nu
              </div>
            )}
            <div style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: '#1a1008',
              lineHeight: 1.35,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: type === 'current' ? 3 : 4,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {getStudioCustomerConceptDisplayTitle(
                concept,
                details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
              )}
            </div>
          </div>

          {/* Nedre: taggar + notering + datum + markera-knapp */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Taggar som pills */}
            {markers && markers.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {markers.tags.slice(0, 2).map((tagName) => {
                  const tag = tags.find(t => t.name === tagName);
                  if (!tag) return null;
                  return (
                    <span key={tagName} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      borderRadius: 5,
                      padding: '2px 6px 2px 4px',
                      fontSize: 9.5,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      background: `${tag.color}1a`,
                      color: tag.color,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Notering — ikon + trunkerad text + title-tooltip */}
            {markers?.assignment_note && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1, opacity: 0.35, color: '#4A2F18' }}>
                  <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="3.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" strokeWidth="1"/>
                  <line x1="3.5" y1="6.5" x2="7.5" y2="6.5" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span
                  title={markers.assignment_note}
                  style={{
                    fontSize: 10,
                    color: '#9CA3AF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}
                >
                  {markers.assignment_note}
                </span>
              </div>
            )}

            {/* Datum */}
            {(() => {
              const realDate = result?.planned_publish_at ?? result?.content_loaded_at ?? null;
              if (realDate) {
                return (
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280' }}>
                    {new Date(realDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                  </div>
                );
              }
              if (projectedDate) {
                return (
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: '#9CA3AF' }}>
                    ~{projectedDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                  </div>
                );
              }
              return null;
            })()}

            {/* Markera-knapp — bara på Nu-kort */}
            {type === 'current' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onMarkProduced(concept.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid rgba(74,47,24,0.18)',
                  background: 'transparent',
                  borderRadius: 7,
                  padding: '6px 9px',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: '#4A2F18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="8" height="6" viewBox="0 0 8 6">
                    <polyline points="1,3 3,5 7,1" stroke="#FAF8F5" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#4A2F18', whiteSpace: 'nowrap' }}>
                  Markera som gjord
                </span>
              </button>
            )}
          </div>
        </div>
      ) : concept && type === 'history' ? (
        /* History layout v2 — logo+date top, tags+title+note+stats bottom */
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 0 }}>
          {/* Top row: logo left + date right */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {concept.row_kind === 'assignment' ? (
              <img
                src="/lt-logo.png"
                alt="LeTrend"
                aria-hidden="true"
                style={{ width: 21, height: 21, opacity: hasThumbnail ? 0.88 : 0.6, filter: hasThumbnail ? 'brightness(10)' : undefined, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none', flexShrink: 0 }}
              />
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0, opacity: hasThumbnail ? 0.78 : 0.55 }} fill={hasThumbnail ? 'rgba(255,255,255,0.75)' : LeTrendColors.textMuted}>
                <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z"/>
              </svg>
            )}
            {(() => {
              const d = result?.published_at ?? result?.produced_at ?? result?.content_loaded_at ?? null;
              if (!d) return null;
              return (
                <span style={{ fontSize: 10, fontWeight: 500, color: hasThumbnail ? 'rgba(255,255,255,0.6)' : LeTrendColors.textMuted, lineHeight: 1 }}>
                  {new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                </span>
              );
            })()}
          </div>

          {/* Bottom: tags + title + note + StatRow */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Tag pills */}
            {markers && markers.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {markers.tags.slice(0, 2).map((tagName) => {
                  const tag = tags.find(t => t.name === tagName);
                  return (
                    <span key={tagName} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2.5,
                      background: hasThumbnail ? 'rgba(255,255,255,0.1)' : `${tag?.color ?? '#999'}1a`,
                      borderRadius: 4, padding: '1.5px 5px 1.5px 3.5px',
                      fontSize: 9, fontWeight: 500,
                      color: hasThumbnail ? 'rgba(255,255,255,0.75)' : (tag?.color ?? LeTrendColors.textMuted),
                      whiteSpace: 'nowrap',
                    }}>
                      {tag && <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />}
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Title — TikTok clips show video description, LeTrend shows concept headline */}
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: hasThumbnail ? '#fff' : LeTrendColors.brownDark,
              lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: concept.row_kind === 'imported_history' ? 4 : 3,
              WebkitBoxOrient: 'vertical' as const,
              textShadow: hasThumbnail ? '0 1px 3px rgba(0,0,0,0.5)' : undefined,
            }}>
              {concept.row_kind === 'imported_history'
                ? (((concept as Record<string, any>).content?.content_overrides?.script as string | undefined) ?? getStudioCustomerConceptDisplayTitle(concept, details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null))
                : getStudioCustomerConceptDisplayTitle(concept, details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null)
              }
            </div>
            {/* Note preview */}
            {markers?.assignment_note && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: hasThumbnail ? 'rgba(255,255,255,0.35)' : 'rgba(74,47,24,0.35)', flexShrink: 0 }} />
                <span title={markers.assignment_note} style={{
                  fontSize: 9.5, color: hasThumbnail ? 'rgba(255,255,255,0.42)' : '#9CA3AF',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: 118, fontStyle: 'italic',
                }}>
                  {markers.assignment_note}
                </span>
              </div>
            )}
            {/* StatRow: views | likes | comments */}
            {(() => {
              const statItems = [
                result?.tiktok_views != null ? { key: 'views', value: result.tiktok_views } : null,
                result?.tiktok_likes != null ? { key: 'likes', value: result.tiktok_likes } : null,
                result?.tiktok_comments != null ? { key: 'comments', value: result.tiktok_comments } : null,
              ].filter((s): s is { key: string; value: number } => s !== null);
              if (statItems.length === 0) return null;
              const iconColor = hasThumbnail ? 'rgba(255,255,255,0.7)' : LeTrendColors.textMuted;
              const dividerColor = hasThumbnail ? 'rgba(255,255,255,0.12)' : 'rgba(74,47,24,0.12)';
              const textColor = hasThumbnail ? '#fff' : LeTrendColors.brownDark;
              return (
                <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${hasThumbnail ? 'rgba(255,255,255,0.1)' : 'rgba(74,47,24,0.1)'}`, paddingTop: 6, gap: 2 }}>
                  {statItems.map((stat, idx) => (
                    <React.Fragment key={stat.key}>
                      {idx > 0 && <div style={{ width: 1, height: 11, background: dividerColor, margin: '0 3px', flexShrink: 0 }} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                        {stat.key === 'views' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <polygon points="3,2 11,6.5 3,11" fill={iconColor} />
                          </svg>
                        )}
                        {stat.key === 'likes' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <path d="M6.5 10.5C6.5 10.5 1.5 7 1.5 4.5a2.5 2.5 0 015 0 2.5 2.5 0 015 0c0 2.5-5 6-5 6z" fill={iconColor} />
                          </svg>
                        )}
                        {stat.key === 'comments' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <path d="M2 2.5Q2 1.5 3 1.5h7Q11 1.5 11 2.5V8Q11 9 10 9H7L5.5 11 4 9H3Q2 9 2 8Z" stroke={iconColor} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: textColor, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatMetric(stat.value)}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Context menu — viewport-fixed positioning, backdrop for click-outside */}
      {showContextMenu && concept && menuPos && (<>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); }}
        />
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100,
            minWidth: 192,
            maxHeight: 'min(360px, 55vh)',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── KOMMANDE ── */}
          {type === 'planned' && (<>
            <button onClick={(e) => { e.stopPropagation(); onOpenConcept(concept.id, ['script', 'instructions', 'fit']); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
              Redigera koncept
            </button>
            <button onClick={(e) => {
              e.stopPropagation();
              if (!editingPlannedDate && !result?.planned_publish_at && projectedDate) {
                setLocalPlannedDate(projectedDate.toISOString().slice(0, 10));
              }
              setEditingPlannedDate(p => !p);
            }} style={feedSlotMenuBtnStyle}>
              {editingPlannedDate
                ? 'Avbryt'
                : result?.planned_publish_at
                  ? 'Redigera planerad publicering'
                  : projectedDate
                    ? `Sätt planerad publicering (~${projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })})`
                    : 'Sätt planerad publicering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowTagPicker(p => !p); }} style={feedSlotMenuBtnStyle}>
              {showTagPicker ? 'Dölj taggar' : 'Hantera taggar'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); void onRemoveFromSlot(concept.id); setShowContextMenu(false); }} style={{ ...feedSlotMenuBtnStyle, color: '#b91c1c' }}>
              Ta bort från flödet
            </button>
          </>)}

          {/* ── NU ── */}
          {type === 'current' && (<>
            <button onClick={(e) => { e.stopPropagation(); onOpenConcept(concept.id, ['script', 'instructions', 'fit']); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
              Redigera koncept
            </button>
            <button onClick={(e) => { e.stopPropagation(); void handleMarkContentLoadedNow(); }} style={feedSlotMenuBtnStyle}>
              Markera innehåll uppladdat
            </button>
            {hasUnreadUpload && (
              <button onClick={(e) => { e.stopPropagation(); void handleAcknowledgeUpload(); }} style={feedSlotMenuBtnStyle}>
                Markera uppladdning sedd
              </button>
            )}
            <button onClick={(e) => {
              e.stopPropagation();
              if (!editingPlannedDate && !result?.planned_publish_at && projectedDate) {
                setLocalPlannedDate(projectedDate.toISOString().slice(0, 10));
              }
              setEditingPlannedDate(p => !p);
            }} style={feedSlotMenuBtnStyle}>
              {editingPlannedDate
                ? 'Avbryt'
                : result?.planned_publish_at
                  ? 'Redigera planerad publicering'
                  : projectedDate
                    ? `Sätt planerad publicering (~${projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })})`
                    : 'Sätt planerad publicering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); void onRemoveFromSlot(concept.id); setShowContextMenu(false); }} style={{ ...feedSlotMenuBtnStyle, color: '#b91c1c' }}>
              Ta bort från flödet
            </button>
          </>)}

          {/* ── HISTORIK ── */}
          {type === 'history' && (<>
            {result?.tiktok_url && (
              <button onClick={(e) => { e.stopPropagation(); window.open(result.tiktok_url!, '_blank', 'noopener,noreferrer'); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
                Öppna TikTok ↗
              </button>
            )}
            {concept.row_kind === 'assignment' && (
              <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
                {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setEditingTikTok(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingTikTok ? 'Avbryt' : result?.tiktok_url ? 'Redigera TikTok-länk' : 'Lägg till TikTok-länk'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingMetadata(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingMetadata ? 'Avbryt metadata' : 'Redigera TikTok-metadata'}
            </button>
            {concept.row_kind !== 'assignment' && (
              <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
                {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setEditingPublishedDate(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingPublishedDate ? 'Avbryt' : result?.published_at ? 'Redigera publicerat datum' : 'Sätt publicerat datum'}
            </button>
          </>)}

          {/* Shared: tag picker (kommande + nu only) */}
          {showTagPicker && type !== 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, maxHeight: 160, overflowY: 'auto' }}>
              {tags.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: LeTrendColors.textMuted }}>Inga taggar skapade ännu</div>
              ) : tags.map((tag) => {
                const selected = (markers?.tags ?? []).includes(tag.name);
                return (
                  <button key={tag.id} onClick={(e) => { e.stopPropagation(); void handleToggleTag(tag.name); }}
                    style={{ width: '100%', padding: '8px 10px', border: 'none', background: selected ? 'rgba(74,47,24,0.08)' : 'white', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, display: 'inline-block' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{tag.name}</span>
                    <span style={{ opacity: selected ? 1 : 0.25 }}>✓</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Shared: note editor */}
          {editingNote && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <textarea value={localNote} onChange={(e) => setLocalNote(e.target.value)} rows={3} placeholder="Intern notering..."
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12, resize: 'vertical' }} />
              <button onClick={(e) => { e.stopPropagation(); void handleSaveNote(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara notering
              </button>
            </div>
          )}

          {/* Historik: TikTok URL editor */}
          {editingTikTok && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input value={localTikTokUrl} onChange={(e) => setLocalTikTokUrl(e.target.value)} placeholder="https://www.tiktok.com/..."
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              <button onClick={(e) => { e.stopPropagation(); void handleSaveTikTok(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara TikTok-länk
              </button>
            </div>
          )}

          {/* Historik: metadata editor */}
          {editingMetadata && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8, display: 'grid', gap: 6 }}>
              {([
                [localThumbnailUrl, setLocalThumbnailUrl, 'Thumbnail URL'],
                [localViews,        setLocalViews,        'Visningar'],
                [localLikes,        setLocalLikes,        'Likes'],
                [localComments,     setLocalComments,     'Kommentarer'],
                [localWatchTime,    setLocalWatchTime,    'Watch time (sek)'],
              ] as [string, (v: string) => void, string][]).map(([val, setter, ph]) => (
                <input key={ph} value={val} onChange={(e) => setter(e.target.value)} placeholder={ph}
                  style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              ))}
              <button onClick={(e) => { e.stopPropagation(); void handleSaveTikTokMetadata(); }}
                style={{ marginTop: 4, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara metadata
              </button>
            </div>
          )}

          {/* Planerat datum editor — kommande + nu */}
          {editingPlannedDate && (type === 'planned' || type === 'current') && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input type="date" value={localPlannedDate} onChange={(e) => setLocalPlannedDate(e.target.value)}
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              {!result?.planned_publish_at && projectedDate && localPlannedDate === projectedDate.toISOString().slice(0, 10) && (
                <div style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.55, fontStyle: 'italic', marginTop: 3 }}>
                  Förslag från rytm
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); void handleSavePlannedDate(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara datum
              </button>
            </div>
          )}

          {/* Publicerat datum editor — historik */}
          {editingPublishedDate && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input type="date" value={localPublishedDate} onChange={(e) => setLocalPublishedDate(e.target.value)}
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              <button onClick={(e) => { e.stopPropagation(); void handleSavePublishedDate(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara datum
              </button>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}

const feedSlotMenuBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
};

function KommunikationSection({
  customer,
  emailLog,
  emailType,
  setEmailType,
  emailSubject,
  setEmailSubject,
  emailBody,
  setEmailBody,
  selectedConceptIds,
  setSelectedConceptIds,
  sendingEmail,
  communicationFeedback,
  latestEmailJob,
  retryingEmailJobId,
  handleSendEmail,
  handleRetryEmailJob,
  getDraftConcepts,
  getConceptDetails,
  formatDateTime,
  cmDisplayNames,
}: KommunikationSectionProps) {
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const getEmailJobStatusLabel = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'queued':
        return 'I ko';
      case 'processing':
        return 'Bearbetas';
      case 'sent':
        return 'Skickat';
      case 'failed':
        return 'Misslyckades';
      case 'canceled':
        return 'Avbrutet';
      default:
        return status;
    }
  };

  const getEmailJobStatusStyle = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'sent':
        return {
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#047857',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        };
      case 'failed':
        return {
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#b91c1c',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        };
      case 'canceled':
        return {
          background: 'rgba(107, 114, 128, 0.12)',
          color: '#374151',
          border: '1px solid rgba(107, 114, 128, 0.3)',
        };
      case 'processing':
        return {
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#1d4ed8',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        };
      case 'queued':
      default:
        return {
          background: 'rgba(245, 158, 11, 0.1)',
          color: '#92400e',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
    }
  };

  const latestJobStatusStyle = latestEmailJob ? getEmailJobStatusStyle(latestEmailJob.status) : null;
  const canRetryLatestJob = Boolean(latestEmailJob && ['failed', 'canceled'].includes(latestEmailJob.status));

  return (
    <div style={{
      background: '#fff',
      borderRadius: LeTrendRadius.lg,
      padding: 24,
      border: `1px solid ${LeTrendColors.border}`
    }}>
      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        color: LeTrendColors.brownDark,
        margin: '0 0 24px'
      }}>
        Kommunikation
      </h2>

      <div
        style={{
          marginBottom: 20,
          padding: '12px 14px',
          borderRadius: LeTrendRadius.md,
          background: LeTrendColors.surface,
          border: `1px solid ${LeTrendColors.border}`,
          color: LeTrendColors.textSecondary,
          fontSize: 13,
          lineHeight: 1.6
        }}
      >
        Skicka mail här när kunduppdrag faktiskt ska delas med kunden. Valda kunduppdrag markeras som delade i CM-flödet, så välj bara de uppdrag som ska bli kundsynliga nu.
      </div>

      {communicationFeedback && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            fontSize: 13,
            lineHeight: 1.6,
            ...getInlineFeedbackStyle(communicationFeedback.tone)
          }}
        >
          {communicationFeedback.text}
        </div>
      )}

      {/* Latest queue status */}
      <div style={{
        background: LeTrendColors.surface,
        borderRadius: LeTrendRadius.lg,
        padding: 16,
        marginBottom: 20,
        border: `1px solid ${LeTrendColors.border}`
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: latestEmailJob?.last_error ? 10 : 0,
          flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginBottom: 6 }}>
              Senaste email-jobb
            </div>
            {latestEmailJob ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: '4px 10px',
                    ...(latestJobStatusStyle || {})
                  }}
                >
                  {getEmailJobStatusLabel(latestEmailJob.status)}
                </span>
                <span style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>
                  {formatDateTime(latestEmailJob.updated_at || latestEmailJob.created_at)}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary }}>
                Inget jobb i kö-historik ännu
              </div>
            )}
          </div>

          {latestEmailJob && canRetryLatestJob && (
            <button
              onClick={() => void handleRetryEmailJob(latestEmailJob.id)}
              disabled={retryingEmailJobId === latestEmailJob.id}
              style={{
                padding: '8px 12px',
                borderRadius: LeTrendRadius.md,
                border: `1px solid ${LeTrendColors.border}`,
                background: retryingEmailJobId === latestEmailJob.id ? '#f1f1f1' : '#fff',
                color: LeTrendColors.brownDark,
                fontSize: 12,
                fontWeight: 600,
                cursor: retryingEmailJobId === latestEmailJob.id ? 'not-allowed' : 'pointer'
              }}
            >
              {retryingEmailJobId === latestEmailJob.id ? 'Koar om...' : 'Forsok igen'}
            </button>
          )}
        </div>

        {latestEmailJob?.last_error && (
          <div
            style={{
              fontSize: 12,
              color: '#b91c1c',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: LeTrendRadius.md,
              padding: '8px 10px',
              lineHeight: 1.5
            }}
          >
            Fel: {latestEmailJob.last_error}
          </div>
        )}
      </div>

      {/* Compose area */}
      <div style={{
        background: LeTrendColors.surface,
        borderRadius: LeTrendRadius.lg,
        padding: 20,
        marginBottom: 32,
        border: `1px solid ${LeTrendColors.border}`
      }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 600,
          color: LeTrendColors.brownDark,
          margin: '0 0 16px'
        }}>
          Nytt email
        </h3>

        {/* Template selector */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.textSecondary,
            marginBottom: 6
          }}>
            Välj mall
          </label>
          <select
            value={emailType}
            onChange={(e) => setEmailType(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            {EMAIL_TEMPLATES.map(template => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.textSecondary,
            marginBottom: 6
          }}>
            Till
          </label>
          <input
            type="text"
            value={customer.contact_email}
            disabled
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              background: '#f9f9f9',
              color: LeTrendColors.textMuted
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.textSecondary,
            marginBottom: 6
          }}>
            Ämne
          </label>
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Email-ämne"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.textSecondary,
            marginBottom: 6
          }}>
            Innehåll
          </label>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Email-innehåll"
            rows={8}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              resize: 'vertical',
              lineHeight: 1.6
            }}
          />
          <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 4 }}>
            Tips: Välj koncept nedan för att automatiskt bifoga dem i mailet.
          </div>
        </div>

        {/* Concept selection */}
        {getDraftConcepts().length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 8
            }}>
              Markera kunduppdrag att dela
            </label>
            <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginBottom: 8 }}>
              {selectedConceptIds.length > 0
                ? `${selectedConceptIds.length} kunduppdrag valda för detta utskick.`
                : 'Inget kunduppdrag valt ännu.'}
            </div>
            <div style={{
              background: '#fff',
              borderRadius: LeTrendRadius.md,
              padding: 12,
              border: `1px solid ${LeTrendColors.border}`,
              maxHeight: 200,
              overflowY: 'auto'
            }}>
              {getDraftConcepts().map((concept: CustomerConcept) => {
                const details = getWorkspaceConceptDetails(concept, getConceptDetails);
                return (
                  <label
                    key={concept.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedConceptIds.includes(concept.id)}
                      onChange={() => {
                        setSelectedConceptIds((prev: string[]) =>
                          prev.includes(concept.id)
                            ? prev.filter((id: string) => id !== concept.id)
                            : [...prev, concept.id]
                        );
                      }}
                    />
                    <span style={{ fontSize: 13, color: LeTrendColors.textPrimary }}>
                      {getWorkspaceConceptTitle(concept, details ?? null)}
                    </span>
                    <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                      {getStudioFeedOrderLabel(concept.placement.feed_order)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              border: `1px solid ${LeTrendColors.border}`,
              color: LeTrendColors.textSecondary,
              fontSize: 13,
              lineHeight: 1.6
            }}
          >
            Inga odelade kunduppdrag finns att bifoga just nu. Lägg till nya uppdrag i Koncept eller använd redan delade uppdrag utan att markera dem här.
          </div>
        )}

        <button
          onClick={handleSendEmail}
          disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
          style={{
            padding: '12px 24px',
            background: emailSubject.trim() && emailBody.trim() ? LeTrendColors.brownLight : LeTrendColors.textMuted,
            color: '#fff',
            border: 'none',
            borderRadius: LeTrendRadius.md,
            fontSize: 14,
            fontWeight: 600,
            cursor: emailSubject.trim() && emailBody.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          {sendingEmail ? 'Skickar...' : 'Skicka email'}
        </button>
      </div>

      {/* Email history */}
      <div>
        <h3 style={{
          fontSize: 16,
          fontWeight: 600,
          color: LeTrendColors.brownDark,
          margin: '0 0 16px'
        }}>
          Historik
        </h3>

        {emailLog.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 32,
            color: LeTrendColors.textMuted,
            fontSize: 14
          }}>
            Inga skickade email ännu
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {emailLog.map((email: EmailLogEntry) => {
              const isExpanded = expandedEmailId === email.id;
              return (
                <div
                  key={email.id}
                  style={{
                    background: LeTrendColors.surface,
                    borderRadius: LeTrendRadius.md,
                    padding: 16,
                    border: `1px solid ${LeTrendColors.border}`
                  }}
                >
                  <div
                    onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: LeTrendColors.brownDark,
                          marginBottom: 4
                        }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
                          {formatDateTime(email.sent_at)} av{' '}
                          {email.cm_id && cmDisplayNames[email.cm_id]
                            ? renderCmBadge(cmDisplayNames[email.cm_id]!)
                            : (email.cm_id || 'okänd')}
                        </div>
                      </div>
                      <span style={{ fontSize: 16 }}>{isExpanded ? 'Dölj' : 'Visa'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: `1px solid ${LeTrendColors.border}`,
                        fontSize: 13,
                        color: LeTrendColors.textPrimary,
                        lineHeight: 1.6
                      }}
                      dangerouslySetInnerHTML={{ __html: email.body_html }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// Game Plan starter template — pre-fills the editor when a CM opens an empty GP for the first time.
// The four sections mirror the brief fields (tone → constraints → current_focus) plus a brand overview.
// Cancel discards it; Save persists it. CMs can freely edit or delete any section.
const GAME_PLAN_STARTER_TEMPLATE = [
  '<h3>Kundprofil</h3>',
  '<p>[Beskriv kunden, deras nisch, målgrupp och plattformshistorik på TikTok.]</p>',
  '<h3>Ton och röst</h3>',
  '<p>[Vilken känsla ska innehållet ha? Vad ska det INTE vara? T.ex. "Humor, relatable — inte för säljigt."]</p>',
  '<h3>Begränsningar</h3>',
  '<p>[Vad ska alltid eller aldrig finnas med? T.ex. "Alltid produktplacering, aldrig pris i bild."]</p>',
  '<h3>Fokus just nu</h3>',
  '<p>[Vad är den strategiska prioriteten den här perioden? T.ex. "Sommarsäsong — lyfta friluftslinjen."]</p>',
].join('');

const MONTHS_SV_WS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatLastEmailSent(isoString: string | undefined): string {
  if (!isoString) return 'Ingen mailhistorik';
  const sent = new Date(isoString);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff === 0) return 'Senaste mail: idag';
  if (daysDiff === 1) return 'Senaste mail: igår';
  if (daysDiff < 14) return `Senaste mail: ${daysDiff} dagar sedan`;
  return `Senaste mail: ${sent.getDate()} ${MONTHS_SV_WS[sent.getMonth()]}`;
}
