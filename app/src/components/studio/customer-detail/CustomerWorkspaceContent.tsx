'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadConcepts as loadConceptsFromDB } from '@/lib/conceptLoaderDB';
import type { TranslatedConcept } from '@/lib/translator';
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
import { buildSlotMap } from '@/lib/feed-planner-utils';
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
import { SlotPopupModal } from '@/features/studio/customer-workspace/components/SlotPopupModal';
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
  const [cmDisplayNames, setCmDisplayNames] = useState<Record<string, string>>({});

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
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(null);
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
  const [slotPopupData, setSlotPopupData] = useState<{
    slot: FeedSlot;
    concept: CustomerConcept | null;
    details: TranslatedConcept | null;
  } | null>(null);

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

  const customerCacheKey = `studio-v2:workspace:${customerId}:customer`;
  const gamePlanCacheKey = `studio-v2:workspace:${customerId}:game-plan`;
  const conceptsCacheKey = `studio-v2:workspace:${customerId}:concepts`;
  const notesCacheKey = `studio-v2:workspace:${customerId}:notes`;
  const emailLogCacheKey = `studio-v2:workspace:${customerId}:email-log`;
  const emailJobsCacheKey = `studio-v2:workspace:${customerId}:email-jobs`;

  const applyCustomerState = (profile: WorkspaceCustomerProfile) => {
    setCustomer(profile);
    setBrief(profile.brief || { tone: '', constraints: '', current_focus: '' });
  };

  useEffect(() => {
    setActiveSection(getStudioWorkspaceSection(searchParams.get('section')));
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
        setGridConfig(cached.value);
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
          return (profile?.grid_config as GridConfig) || DEFAULT_GRID_CONFIG;
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

  // Load CM display names once for note/email attribution
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      if (!data) return;
      const names: Record<string, string> = {};
      for (const row of data) {
        if (row.full_name) names[row.id as string] = row.full_name as string;
      }
      setCmDisplayNames(names);
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
  const handleAddConcept = async (conceptId: string) => {
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

      await fetchConcepts(true);
      setShowAddConceptPanel(false);

      // Auto-expand the new concept
      if (data?.concept?.id) {
        setExpandedConceptId(data.concept.id);
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

  const handleMarkProduced = async (conceptId: string, tiktokUrl?: string) => {
    try {
      const response = await fetch('/api/studio-v2/feed/mark-produced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: conceptId,
          customer_id: customerId,
          tiktok_url: tiktokUrl
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
      const res = await fetch('/api/demo/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, clips, replace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import misslyckades');

      await fetchConcepts(true);
      setShowImportHistoryModal(false);
      setImportHistoryJson('');
    } catch (err) {
      setImportHistoryError((err as Error).message);
    } finally {
      setImportingHistory(false);
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
                    placeholder="Vem är kunden? Vilken röst ska vi ha?"
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
                    placeholder="Vad ska alltid finnas med i innehållet?"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textSecondary, display: 'block', marginBottom: 4 }}>
                    Fokus just nu
                  </label>
                  <AutoSaveTextarea
                    value={brief.current_focus}
                    onChange={(val) => setBrief({ ...brief, current_focus: val })}
                    onSave={(val) => handleSaveBrief('current_focus', val)}
                    rows={2}
                    placeholder="Strategisk prioritet?"
                  />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
                {!brief.tone && !brief.constraints && !brief.current_focus ? (
                  <em>Ingen brief ifylld än</em>
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
              brief={{ tone: brief.tone, current_focus: brief.current_focus }}
            />
          )}

          {activeSection === 'feed' && (
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
                setSlotPopupData({ slot, concept, details });
                if (concept && hasUnreadUploadMarker(concept)) {
                  void handleUpdateConcept(concept.id, {
                    content_loaded_seen_at: new Date().toISOString()
                  });
                }
              }}
              showTagManager={showTagManager}
              setShowTagManager={setShowTagManager}
              refreshCmTags={fetchCmTags}
            />
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
                    onClick={() => setShowImportHistoryModal(true)}
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
        onClose={() => { setShowAddConceptPanel(false); setAddConceptSearch(''); }}
        title="Lägg till koncept"
      >
        {(brief.tone || brief.current_focus) && (
          <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: LeTrendRadius.md, background: LeTrendColors.surface, border: `1px solid ${LeTrendColors.border}`, fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5 }}>
            <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
            {[brief.tone, brief.current_focus].filter(Boolean).join(' · ')}
          </div>
        )}
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
                c.vibeAlignments.some(v => v.toLowerCase().includes(q))
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
                {concept.vibeAlignments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {concept.vibeAlignments.map((vibe) => (
                      <span key={vibe} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                        {vibe}
                      </span>
                    ))}
                  </div>
                )}
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
                  onClick={() => handleAddConcept(concept.id)}
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
                  + Lägg till koncept
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
      </SidePanel>

      <ConceptEditWizard
        isOpen={Boolean(editingConceptId)}
        concept={editingConcept}
        details={editingConceptDetails}
        initialSections={editorInitialSections}
        onClose={() => setEditingConceptId(null)}
        onSave={handleUpdateConcept}
      />

      {slotPopupData && (
        <SlotPopupModal
          slotData={slotPopupData}
          onClose={() => setSlotPopupData(null)}
          onAddConcept={() => {
            setSelectedFeedSlot(slotPopupData.slot.feedOrder);
            setShowFeedSlotPanel(true);
          }}
        />
      )}

      {/* Import TikTok History Modal */}
      {showImportHistoryModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowImportHistoryModal(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.lg,
            padding: 28,
            width: '100%',
            maxWidth: 560,
            maxHeight: '85vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: LeTrendColors.brownDark, margin: 0 }}>
                  Importera TikTok-historik
                </h3>
                <p style={{ fontSize: 13, color: LeTrendColors.textSecondary, margin: '4px 0 0' }}>
                  Klistra in en JSON-array med klipp. Nyaste klipp = slot #6 (feed_order -1).
                </p>
              </div>
              <button
                onClick={() => setShowImportHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: LeTrendColors.textMuted, padding: '0 4px' }}
              >
                ×
              </button>
            </div>

            {/* JSON format hint */}
            <div style={{
              background: LeTrendColors.surface,
              borderRadius: LeTrendRadius.md,
              padding: '10px 14px',
              fontSize: 11,
              color: LeTrendColors.textSecondary,
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}>
              {'['}<br />
              {'  { "tiktok_url": "https://tiktok.com/@...", "tiktok_thumbnail_url": "...",'}
              <br />
              {'    "tiktok_views": 12000, "tiktok_likes": 500, "tiktok_comments": 30,'}
              <br />
              {'    "description": "Klippbeskrivning", "published_at": "2025-03-15" }'}
              <br />
              {']'}
            </div>

            <textarea
              value={importHistoryJson}
              onChange={e => {
                setImportHistoryJson(e.target.value);
                setImportHistoryError(null);
              }}
              placeholder='[{ "tiktok_url": "...", "tiktok_views": 12000, ... }]'
              rows={10}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: LeTrendRadius.md,
                border: `1px solid ${importHistoryError ? LeTrendColors.error : LeTrendColors.borderMedium}`,
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'vertical',
                color: LeTrendColors.textPrimary,
                boxSizing: 'border-box',
              }}
            />

            {importHistoryError && (
              <div style={{ fontSize: 12, color: LeTrendColors.error }}>
                {importHistoryError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => void handleImportHistory(true)}
                disabled={importingHistory || !importHistoryJson.trim()}
                style={{
                  padding: '9px 16px',
                  background: LeTrendColors.surface,
                  border: `1px solid ${LeTrendColors.borderMedium}`,
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 500,
                  color: LeTrendColors.textSecondary,
                  cursor: importingHistory ? 'not-allowed' : 'pointer',
                }}
              >
                Ersätt historik
              </button>
              <button
                onClick={() => void handleImportHistory(false)}
                disabled={importingHistory || !importHistoryJson.trim()}
                style={{
                  padding: '9px 16px',
                  background: LeTrendColors.brownLight,
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  color: LeTrendColors.cream,
                  cursor: importingHistory ? 'not-allowed' : 'pointer',
                }}
              >
                {importingHistory ? 'Importerar...' : 'Lägg till historik'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  cmDisplayNames: Record<string, string>;
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
  handleMarkProduced: (conceptId: string, tiktokUrl?: string) => Promise<void>;
  handleRemoveFromSlot: (conceptId: string) => Promise<void>;
  handleAssignToSlot: (conceptId: string, feedOrder: number) => Promise<void>;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (slot: FeedSlot, concept: CustomerConcept | null, details: TranslatedConcept | null) => void;
  showTagManager: boolean;
  setShowTagManager: (show: boolean) => void;
  refreshCmTags: (force?: boolean) => Promise<void>;
}

interface FeedSlotProps {
  slot: FeedSlot;
  tags: CmTag[];
  config: GridConfig;
  spanCoverage?: number;
  spanColor?: string | null;
  showSpanCoverageLabels?: boolean;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onMarkProduced: (conceptId: string, tiktokUrl?: string) => Promise<void>;
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
  cmDisplayNames: Record<string, string>;
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
              onClick={() => setEditingGamePlan(true)}
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
              Redigera
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
                Ingen Game Plan sparad än. Nästa steg är att skriva den strategiska planen och spara den innan kunden ska få någon ny riktning.
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
                    {formatDateTime(note.created_at)} av {(note.cm_id && cmDisplayNames[note.cm_id]) || note.cm_id || 'okänd'}
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
  brief: { tone: string; current_focus: string };
}) {
  const [editingNoteForConcept, setEditingNoteForConcept] = React.useState<string | null>(null);
  const [localNoteText, setLocalNoteText] = React.useState('');

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
  };

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

      {(brief.tone || brief.current_focus) && (
        <div style={{ marginBottom: 16, fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.5 }}>
          <strong style={{ color: LeTrendColors.brownDark }}>Kundbrief:</strong>{' '}
          {[brief.tone, brief.current_focus].filter(Boolean).join(' · ')}
        </div>
      )}

      {concepts.length === 0 ? (
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
          {concepts.map((concept: CustomerConcept) => {
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
                      <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginBottom: 4 }}>Varför det funkar</div>
                      <div style={{ fontSize: 14, color: LeTrendColors.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {resolved.fit.whyItWorks_sv || 'Inga argument tillagda'}
                      </div>
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
                            placeholder="Varför passar det här konceptet den här kunden?"
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
                        <div style={{ fontSize: 14, color: concept.cm_note ? LeTrendColors.textPrimary : LeTrendColors.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {concept.cm_note || 'Ingen notering ännu.'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
  refreshCmTags
}: FeedPlannerSectionProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [eelPath, setEelPath] = React.useState('');
  const [eelSegments, setEelSegments] = React.useState<string[]>([]);
  const [eelGradients, setEelGradients] = React.useState<PositionedEelGradient[]>([]);
  const maxExtraHistorySlots = gridConfig.columns * 4; // support going back ~12 clips

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
  const [showCoverageLabels, setShowCoverageLabels] = React.useState(true);
  const [eelHovered, setEelHovered] = React.useState(false);
  const [lastCreatedSpanId, setLastCreatedSpanId] = React.useState<string | null>(null);
  const [showConceptPicker, setShowConceptPicker] = React.useState(false);
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
    spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset
  });
  // Keep refs in sync
  spanHandlerRefs.current = { spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset };

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
    const onUp = () => { void stableHandlers.onUp(); };

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

  // Track newly created spans for undo
  const prevSpanCountRef = React.useRef(spans.length);
  React.useEffect(() => {
    if (spans.length > prevSpanCountRef.current && spans.length > 0) {
      setLastCreatedSpanId(spans[spans.length - 1].id);
    }
    prevSpanCountRef.current = spans.length;
  }, [spans.length, spans]);

  const animatedCountRef = React.useRef(0);
  React.useEffect(() => {
    animatedCountRef.current = animatedCount;
  }, [animatedCount]);

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

  return (
    <div style={{
      background: LeTrendColors.cream,
      borderRadius: LeTrendRadius.lg,
      padding: 24,
      border: `1px solid ${LeTrendColors.border}`
    }}>
      {/* Header med Hantera taggar-länk */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: 0
        }}>
          Feed-planerare
        </h2>
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

      {/* Color picker för nästa span */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '10px 14px',
          background: 'rgba(74,47,24,0.04)',
          borderRadius: LeTrendRadius.md
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: LeTrendColors.textMuted,
            fontWeight: 600
          }}
        >
          Nästa tematiskt spann:
        </span>
        {SPAN_COLOR_PALETTE.map((p, i) => (
          <div
            key={i}
            onClick={() => setNextColorIdx(i)}
            style={{
              width: i === nextColorIdx ? 14 : 10,
              height: i === nextColorIdx ? 14 : 10,
              borderRadius: '50%',
              background: p.color,
              cursor: 'pointer',
              outline: i === nextColorIdx ? `2px solid ${p.color}` : 'none',
              outlineOffset: 2,
              transition: 'all 0.15s',
              opacity: i === nextColorIdx ? 1 : 0.4
            }}
            title={p.name}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowCoverageLabels((prev) => !prev)}
          aria-pressed={showCoverageLabels}
          style={{
            marginLeft: 'auto',
            padding: '5px 9px',
            borderRadius: LeTrendRadius.sm,
            border: `1px solid ${LeTrendColors.border}`,
            background: showCoverageLabels ? 'white' : 'transparent',
            color: showCoverageLabels ? LeTrendColors.brownDark : LeTrendColors.textMuted,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            lineHeight: 1
          }}
          title="Visa/dölj selekterade slots"
        >
          {showCoverageLabels ? 'Selektion: På' : 'Selektion: Av'}
        </button>
      </div>

      <div
        style={{
          marginBottom: 18,
          padding: '10px 14px',
          background: 'rgba(74,47,24,0.04)',
          borderRadius: LeTrendRadius.md,
          fontSize: 11,
          color: LeTrendColors.textMuted,
          lineHeight: 1.6
        }}
      >
        <strong style={{ color: LeTrendColors.brownDark }}>Dra</strong> längs åliden för att skapa
        ett tematiskt spann. <strong style={{ color: LeTrendColors.brownDark }}>Klicka</strong> på
        pricken för att redigera. Dra i <strong style={{ color: LeTrendColors.brownDark }}>ändpunkterna</strong> för
        att justera längd. Åliden lyser upp vid hover. Tomma kommande slots tar odelade kunduppdrag, nu-slot är det som ska produceras härnäst och historik används bara för redan publicerade klipp.
      </div>

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

      {/* Grid med Åliden till vänster */}
      <div style={{ position: 'relative', paddingLeft: 70 }}>
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
                const viewClim = span.climax !== null ? span.climax - fracOffset : null;
                // Clamp klimax to the visible part of the span
                const clampedClim = viewClim !== null
                  ? Math.max(clampedStart, Math.min(clampedEnd, viewClim))
                  : null;
                const yClim = clampedClim !== null && clampedEnd > clampedStart
                  ? fracToY(clampedClim, slotAnchors)
                  : null;

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
                        />
                        <circle
                          cx={18} cy={yEnd} r={4}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                        />
                      </>
                    )}

                    {/* Climax mark with date */}
                    {yClim !== null && (
                      <g>
                        <line
                          x1={8} y1={yClim} x2={28} y2={yClim}
                          stroke={col} strokeWidth={2} opacity={0.9}
                        />
                        <circle
                          cx={18} cy={yClim} r={isVis ? 5 : 3}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'pointer', pointerEvents: 'all' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSpan(span.id);
                            setEditingSpan(span.id);
                            setEditTitle(span.title);
                            setEditBody(span.body);
                          }}
                        />
                        {/* Date label */}
                        {span.climax_date && (
                          <text
                            x={32} y={yClim + 3}
                            fontSize={8} fill={col} fontWeight="700"
                            fontFamily="DM Sans, system-ui"
                            style={{ pointerEvents: 'none' }}
                          >
                            {new Date(span.climax_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                          </text>
                        )}
                        {isVis && !span.climax_date && (
                          <text
                            x={32} y={yClim + 3}
                            fontSize={7} fill={LeTrendColors.textMuted}
                            fontFamily="DM Sans, system-ui"
                            style={{ pointerEvents: 'none' }}
                          >
                            klicka för datum
                          </text>
                        )}
                      </g>
                    )}

                    {/* Center dot — always visible, opens edit on click */}
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
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
              showSpanCoverageLabels={showCoverageLabels && (eelHovered || !!activeSpan || !!editingSpan || !!drag)}
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
      </div>

      {/* Scroll controls + undo */}
      <div style={{
        marginTop: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Scroll forward (see more future) */}
        <button
          onClick={() => setHistoryOffset(prev => prev - gridConfig.columns)}
          disabled={historyOffset <= -gridConfig.columns * 2}
          style={{
            padding: '8px 14px',
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: historyOffset <= -gridConfig.columns * 2 ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            opacity: historyOffset <= -gridConfig.columns * 2 ? 0.4 : 1
          }}
        >
          Framtid →
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
            Tillbaka till NU
          </button>
        )}

        {/* Scroll back (see more history) — always available up to 12 extra slots */}
        <button
          onClick={() => setHistoryOffset(prev => prev + gridConfig.columns)}
          disabled={historyOffset >= maxExtraHistorySlots}
          style={{
            padding: '8px 14px',
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: historyOffset >= maxExtraHistorySlots ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            opacity: historyOffset >= maxExtraHistorySlots ? 0.4 : 1
          }}
        >
          ← Äldre historik
        </button>

        {historyOffset !== 0 && (
          <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
            Visar klipp {historyOffset > 0 ? `${historyOffset} steg bakåt` : `${Math.abs(historyOffset)} steg framåt`}
          </span>
        )}

        {/* Undo last span creation */}
        {lastCreatedSpanId && spans.some(s => s.id === lastCreatedSpanId) && (
          <button
            onClick={async () => {
              const id = lastCreatedSpanId;
              setLastCreatedSpanId(null);
              setSpans(prev => prev.filter(s => s.id !== id));
              if (activeSpan === id) setActiveSpan(null);
              if (editingSpan === id) setEditingSpan(null);
              try {
                await fetch(`/api/studio-v2/feed-spans/${id}`, { method: 'DELETE' });
              } catch { /* ignore */ }
            }}
            style={{
              marginLeft: 'auto',
              padding: '8px 14px',
              background: 'transparent',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: LeTrendColors.textMuted
            }}
          >
            Ångra senaste spann
          </button>
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

      {/* Edit Panel för Spans */}
      {editingSpan &&
        (() => {
          const span = spans.find((s) => s.id === editingSpan);
          if (!span) return null;

          const col = SPAN_COLOR_PALETTE[span.color_index].color;
          const count = slotAnchors.length
            ? touchedSlots(span, slotAnchors).length
            : 0;
          const countToDisplay = editingSpan === span.id ? animatedCount : count;

          return (
            <div
              style={{
                marginTop: 16,
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                padding: '16px 18px',
                boxShadow: '0 4px 20px rgba(74,47,24,0.1)',
                borderTop: `3px solid ${col}`
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: col
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: col,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}
                  >
                    {SPAN_COLOR_PALETTE[span.color_index].name}
                  </span>
                  <span style={{ fontSize: 10, color: LeTrendColors.textMuted }}>
                    · {countToDisplay} klipp
                  </span>
                </div>
                <button
                  onClick={() => { setEditingSpan(null); setActiveSpan(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: LeTrendColors.textMuted,
                    fontSize: 18,
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>

              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Rubrik — t.ex. Alla hjärtans dag"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: LeTrendRadius.md,
                  border: `1.5px solid ${col}44`,
                  fontSize: 13,
                  fontWeight: 600,
                  color: LeTrendColors.brownDark,
                  background: LeTrendColors.cream,
                  outline: 'none',
                  marginBottom: 8,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />

              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Beskriv innehållet, strategi och tankar för detta spann..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: LeTrendRadius.md,
                  border: `1.5px solid ${LeTrendColors.border}`,
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: LeTrendColors.brownDark,
                  background: '#fff',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />

              {/* Klimax controls */}
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <button
                  onClick={() => {
                    if (span.climax !== null) {
                      setSpans((prev) =>
                        prev.map((s) =>
                          s.id === span.id ? { ...s, climax: null, climax_date: null } : s
                        )
                      );
                      void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ climax: null, climax_date: null })
                      }).catch(() => void reloadSpansFromServer());
                    } else {
                      const newClimaxFrac = (span.frac_start + span.frac_end) / 2;
                      setSpans((prev) =>
                        prev.map((s) =>
                          s.id === span.id ? { ...s, climax: newClimaxFrac, climax_date: null } : s
                        )
                      );
                      void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ climax: newClimaxFrac, climax_date: null })
                      }).catch(() => void reloadSpansFromServer());
                    }
                  }}
                  style={{
                    fontSize: 10,
                    padding: '4px 10px',
                    borderRadius: LeTrendRadius.sm,
                    background:
                      span.climax !== null ? `${col}22` : LeTrendColors.surface,
                    color:
                      span.climax !== null ? col : LeTrendColors.textMuted,
                    border: `1px solid ${span.climax !== null ? `${col}44` : LeTrendColors.border}`,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {span.climax !== null
                    ? 'Ta bort klimax'
                    : 'Sätt klimax-punkt'}
                </button>
                {span.climax !== null && (
                  <input
                    type="date"
                    value={span.climax_date ? span.climax_date.slice(0, 10) : ''}
                    onChange={(e) => {
                      const newDate = e.target.value || null;
                      setSpans(prev => prev.map(s =>
                        s.id === span.id ? { ...s, climax_date: newDate } : s
                      ));
                      void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ climax_date: newDate })
                      }).catch(() => {});
                    }}
                    style={{
                      fontSize: 10,
                      padding: '3px 7px',
                      borderRadius: LeTrendRadius.sm,
                      border: `1px solid ${col}44`,
                      color: col,
                      background: `${col}0d`,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 12,
                  justifyContent: 'space-between'
                }}
              >
                <button
                  onClick={async () => {
                    if (!confirm('Ta bort detta spann?')) return;

                    try {
                      await fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'DELETE'
                      });
                      setSpans((prev) => prev.filter((s) => s.id !== span.id));
                      setEditingSpan(null);
                      setActiveSpan(null);
                    } catch (error) {
                      console.error('Error deleting span:', error);
                      alert('Kunde inte ta bort spann');
                    }
                  }}
                  style={{
                    fontSize: 10,
                    padding: '5px 12px',
                    borderRadius: LeTrendRadius.sm,
                    background: 'transparent',
                    border: `1px solid ${LeTrendColors.border}`,
                    color: LeTrendColors.textMuted,
                    cursor: 'pointer'
                  }}
                >
                  Ta bort spann
                </button>

                <button
                  onClick={async () => {
                    setSpans((prev) =>
                      prev.map((s) =>
                        s.id === span.id
                          ? { ...s, title: editTitle, body: editBody }
                          : s
                      )
                    );

                    try {
                      await fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: editTitle, body: editBody })
                      });
                      setEditingSpan(null);
                      setActiveSpan(null);
                    } catch (error) {
                      console.error('Error saving span:', error);
                      alert('Kunde inte spara spann');
                      void reloadSpansFromServer();
                    }
                  }}
                  style={{
                    fontSize: 10,
                    padding: '5px 16px',
                    borderRadius: LeTrendRadius.sm,
                    background: LeTrendColors.brownDark,
                    color: LeTrendColors.cream,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Spara
                </button>
              </div>
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
  const [showTagPicker, setShowTagPicker] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState(false);
  const [editingTikTok, setEditingTikTok] = React.useState(false);
  const [editingMetadata, setEditingMetadata] = React.useState(false);
  const [localNote, setLocalNote] = React.useState('');
  const [localTikTokUrl, setLocalTikTokUrl] = React.useState('');
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
    setEditingNote(false);
    setEditingTikTok(false);
    setEditingMetadata(false);
    setShowTagPicker(false);
  }, [
    concept?.id,
    markers?.assignment_note,
    result?.tiktok_url,
    result?.tiktok_thumbnail_url,
    result?.tiktok_views,
    result?.tiktok_likes,
    result?.tiktok_comments,
    result?.tiktok_watch_time_seconds
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

  const requestDateIso = (title: string, currentValue: string | null): string | null | undefined => {
    const currentDate = currentValue ? new Date(currentValue) : null;
    const defaultValue =
      currentDate && !Number.isNaN(currentDate.getTime())
        ? `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`
        : '';
    const value = prompt(`${title} (YYYY-MM-DD HH:mm). Lämna tomt för att rensa.`, defaultValue);
    if (value === null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Ogiltigt datumformat. Använd YYYY-MM-DD HH:mm');
    }
    return parsed.toISOString();
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

  const handleSetPlannedPublishAt = async () => {
    if (!concept) return;
    try {
      const nextValue = requestDateIso('Planerad publicering', result?.planned_publish_at ?? null);
      if (nextValue === undefined) return;
      await onPatchConcept(concept.id, { planned_publish_at: nextValue });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte spara planerat datum');
    }
  };

  const handleSetPublishedAt = async () => {
    if (!concept) return;
    try {
      const nextValue = requestDateIso('Publicerad', result?.published_at ?? null);
      if (nextValue === undefined) return;
      await onPatchConcept(concept.id, { published_at: nextValue });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte spara publicerat datum');
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
      border: `1px solid ${LeTrendColors.border}`,
      opacity: 1
    },
    current: {
      bg: 'rgba(107, 68, 35, 0.05)',
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
          <span style={{ fontSize: 32, color: LeTrendColors.textMuted, opacity: 0.5 }}>+</span>
        ) : isPastSlot ? (
          <span style={{ fontSize: 11, color: LeTrendColors.textMuted, opacity: 0.4 }}>tom</span>
        ) : null}
      </div>
    );
  }

  // Build background: thumbnail for history, or span tint, or default
  const thumbnailUrl = result?.tiktok_thumbnail_url;
  const hasThumbnail = type === 'history' && thumbnailUrl;
  const slotBackgroundColor = style.bg;
  const slotBackgroundImage = hasThumbnail
    ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url(${thumbnailUrl})`
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
        border: style.border,
        borderRadius: LeTrendRadius.lg,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        opacity: style.opacity,
        cursor: 'pointer',
        boxShadow: spanOutline
      }}
      onClick={() => onSlotClick(slot, concept, details)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showSpanCoveragePill && (
        <div
          style={{
            position: 'absolute',
            top: type === 'current' ? 32 : 8,
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

      {/* Current-badge */}
      {type === 'current' && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: LeTrendColors.brownDark,
          color: 'white',
          padding: '2px 8px',
          borderRadius: LeTrendRadius.sm,
          fontSize: 10,
          fontWeight: 700
        }}>
          NU
        </div>
      )}

      {result?.content_loaded_at && (
        <div
          style={{
            position: 'absolute',
            top: type === 'current' ? 8 : 26,
            left: type === 'current' ? 44 : 8,
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
          onClick={(e) => {
            e.stopPropagation();
            setShowContextMenu(!showContextMenu);
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
          ?
        </button>
      )}

      {type === 'history' && (result?.produced_at || result?.published_at) && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            fontSize: 10,
            color: LeTrendColors.textMuted,
            textAlign: 'right',
            lineHeight: 1.2
          }}
        >
          {result?.produced_at ? `Prod: ${formatDate(result.produced_at)}` : null}
          {result?.published_at ? (
            <div>{`Pub: ${formatDate(result.published_at)}`}</div>
          ) : null}
        </div>
      )}

      {/* TikTok play indicator for history */}
      {type === 'history' && result?.tiktok_url && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 16,
            color: LeTrendColors.brownDark,
            opacity: 0.55,
            pointerEvents: 'none'
          }}
        >
          ?
        </div>
      )}

      {/* Koncept-rubrik */}
      {concept && (
        <div>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: hasThumbnail ? 'white' : LeTrendColors.brownDark,
            lineHeight: 1.3,
            maxHeight: 32,
            overflow: 'hidden',
            textShadow: hasThumbnail ? '0 1px 3px rgba(0,0,0,0.5)' : undefined
          }}>
            {getStudioCustomerConceptDisplayTitle(
              concept,
              details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
            )}
          </div>

          {(result?.planned_publish_at || result?.content_loaded_at) && (
            <div style={{ marginTop: 6, fontSize: 10, color: LeTrendColors.textMuted, lineHeight: 1.3 }}>
              {result?.planned_publish_at ? <div>{`Plan: ${formatDate(result.planned_publish_at)}`}</div> : null}
              {result?.content_loaded_at ? <div>{`In: ${formatDate(result.content_loaded_at)}`}</div> : null}
            </div>
          )}

          {type === 'history' && (result?.tiktok_views || result?.tiktok_likes || result?.tiktok_comments) && (
            <div style={{ marginTop: 6, fontSize: 10, color: LeTrendColors.textSecondary }}>
              {`Visn ${formatMetric(result?.tiktok_views ?? null)} · Likes ${formatMetric(result?.tiktok_likes ?? null)} · Komm ${formatMetric(result?.tiktok_comments ?? null)}`}
            </div>
          )}
        </div>
      )}

      {/* Taggar + note indicator */}
      {concept && markers && (markers.tags.length > 0 || markers.assignment_note) && (
        <div style={{
          display: 'flex',
          gap: 2,
          marginTop: 8,
          alignItems: 'center'
        }}>
          {markers.tags.slice(0, 3).map((tagName) => {
            const tag = tags.find(t => t.name === tagName);
            return tag ? (
              <div
                key={tagName}
                title={tagName}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: tag.color,
                  opacity: type === 'history' ? 0.6 : 1
                }}
              />
            ) : null;
          })}
          {markers.assignment_note && (
            <div
              title={markers.assignment_note}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#d97706',
                opacity: type === 'history' ? 0.6 : 1,
                flexShrink: 0
              }}
            />
          )}
        </div>
      )}

      {/* Markera som producerat (current slot) */}
      {type === 'current' && concept && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const url = prompt('TikTok-länk (valfritt):');
            onMarkProduced(concept.id, url || undefined);
          }}
          style={{
            marginTop: 8,
            padding: '6px',
            background: LeTrendColors.success,
            border: 'none',
            color: 'white',
            borderRadius: LeTrendRadius.sm,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%'
          }}
        >
          ? Markera producerat
        </button>
      )}

      {/* Context menu */}
      {showContextMenu && concept && (
        <div
          style={{
            position: 'absolute',
            top: 32,
            right: 8,
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 10,
            minWidth: 160
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenConcept(concept.id, ['script', 'instructions', 'fit']);
              setShowContextMenu(false);
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Redigera instruktioner
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTagPicker((prev) => !prev);
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            {showTagPicker ? 'Dölj taggar' : 'Hantera taggar'}
          </button>


          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleSetPlannedPublishAt();
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Sätt planerad publicering
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleMarkContentLoadedNow();
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Markera innehåll uppladdat
          </button>

          {hasUnreadUpload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleAcknowledgeUpload();
              }}
              style={{
                width: '100%',
                padding: 8,
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              Markera uppladdning sedd
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleSetPublishedAt();
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Sätt publicerat datum
          </button>

          {concept && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingNote((prev) => !prev);
              }}
              style={{
                width: '100%',
                padding: 8,
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
            </button>
          )}

          {type === 'history' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingTikTok((prev) => !prev);
              }}
              style={{
                width: '100%',
                padding: 8,
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              {editingTikTok ? 'Avbryt TikTok-länk' : 'Redigera TikTok-länk'}
            </button>
          )}


          {type === 'history' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingMetadata((prev) => !prev);
              }}
              style={{
                width: '100%',
                padding: 8,
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              {editingMetadata ? 'Avbryt metadata' : 'Redigera TikTok-metadata'}
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromSlot(concept.id);
              setShowContextMenu(false);
            }}
            style={{
              width: '100%',
              padding: 8,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Ta bort från flödet
          </button>

          {showTagPicker && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                maxHeight: 180,
                overflowY: 'auto'
              }}
            >
              {tags.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: LeTrendColors.textMuted }}>
                  Inga taggar skapade ännu
                </div>
              ) : (
                tags.map((tag) => {
                  const selected = (markers?.tags ?? []).includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleTag(tag.name);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: 'none',
                        background: selected ? 'rgba(74, 47, 24, 0.08)' : 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: tag.color,
                          display: 'inline-block'
                        }}
                      />
                      <span style={{ flex: 1, textAlign: 'left' }}>{tag.name}</span>
                      <span style={{ opacity: selected ? 1 : 0.25 }}>?</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {editingNote && concept && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                padding: 8
              }}
            >
              <textarea
                value={localNote}
                onChange={(e) => setLocalNote(e.target.value)}
                rows={3}
                placeholder="Intern notering..."
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12,
                  resize: 'vertical'
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSaveNote();
                }}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: 6,
                  border: 'none',
                  borderRadius: LeTrendRadius.sm,
                  background: LeTrendColors.brownLight,
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Spara notering
              </button>
            </div>
          )}

          {editingTikTok && type === 'history' && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                padding: 8
              }}
            >
              <input
                value={localTikTokUrl}
                onChange={(e) => setLocalTikTokUrl(e.target.value)}
                placeholder="https://www.tiktok.com/..."
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSaveTikTok();
                }}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: 6,
                  border: 'none',
                  borderRadius: LeTrendRadius.sm,
                  background: LeTrendColors.brownLight,
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Spara TikTok-länk
              </button>
            </div>
          )}

          {editingMetadata && type === 'history' && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                padding: 8,
                display: 'grid',
                gap: 6
              }}
            >
              <input
                value={localThumbnailUrl}
                onChange={(e) => setLocalThumbnailUrl(e.target.value)}
                placeholder="Thumbnail URL"
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <input
                value={localViews}
                onChange={(e) => setLocalViews(e.target.value)}
                placeholder="Visningar"
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <input
                value={localLikes}
                onChange={(e) => setLocalLikes(e.target.value)}
                placeholder="Likes"
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <input
                value={localComments}
                onChange={(e) => setLocalComments(e.target.value)}
                placeholder="Kommentarer"
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <input
                value={localWatchTime}
                onChange={(e) => setLocalWatchTime(e.target.value)}
                placeholder="Watch time (sek)"
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSaveTikTokMetadata();
                }}
                style={{
                  marginTop: 4,
                  width: '100%',
                  padding: 6,
                  border: 'none',
                  borderRadius: LeTrendRadius.sm,
                  background: LeTrendColors.brownLight,
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Spara metadata
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
                          {formatDateTime(email.sent_at)} av {(email.cm_id && cmDisplayNames[email.cm_id]) || email.cm_id || 'okänd'}
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
