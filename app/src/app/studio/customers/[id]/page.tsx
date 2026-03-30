'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { loadConcepts as loadConceptsFromJson } from '@/lib/conceptLoader';
import { loadConcepts as loadConceptsFromDB } from '@/lib/conceptLoaderDB';
import type { TranslatedConcept } from '@/lib/translator';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { AutoSaveTextarea } from '@/components/studio-v2/AutoSaveTextarea';
import { StatusChip } from '@/components/studio-v2/StatusChip';
import { SidePanel } from '@/components/studio-v2/SidePanel';
import { ConceptEditWizard } from '@/components/studio-v2/ConceptEditWizard';
import { GamePlanEditor } from '@/components/gameplan-editor/GamePlanEditor';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { gamePlanNotesToHtml, type RawGamePlanNote } from '@/components/gameplan-editor/utils/legacy-converter';
import { sanitizeRichTextHtml } from '@/components/gameplan-editor/utils/sanitize';
import { clearClientCache, fetchAndCacheClient, readClientCache, writeClientCache } from '@/lib/client-cache';
import type {
  CustomerProfile,
  CustomerBrief,
  CustomerConcept,
  CustomerNote,
  EmailLogEntry,
  EmailJobEntry,
  Section,
  GridConfig,
  CmTag,
  FeedSlot,
  FeedSpan
} from '@/types/studio-v2';
import { DEFAULT_GRID_CONFIG, SPAN_COLOR_PALETTE } from '@/types/studio-v2';
import { buildSlotMap, hasMoreHistory } from '@/lib/feed-planner-utils';
import { resolveConceptContent, type ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import {
  calculateSlotCenters,
  buildCurvePath,
  buildSegmentPaths,
  buildGradients,
  updateGradientPositions
} from '@/lib/eel-renderer';
import { createSpanHandlers, fracToY as spanFracToY, yToFrac as spanYToFrac } from '@/components/studio-v2/SpanHandlers';
import type { SpanHandlerRefs } from '@/components/studio-v2/SpanHandlers';
import { SlotPopupModal } from '@/features/studio/customer-workspace/components/SlotPopupModal';
import { TagManager } from '@/features/studio/customer-workspace/components/TagManager';

type PositionedEelGradient = ReturnType<typeof updateGradientPositions>[number];

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hasUnreadUploadMarker(concept: CustomerConcept | null): boolean {
  if (!concept?.content_loaded_at) return false;
  if (!concept.content_loaded_seen_at) return true;
  return concept.content_loaded_seen_at < concept.content_loaded_at;
}

// Email templates
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  intro: string;
  outro: string;
}

type WorkspaceCustomerProfile = CustomerProfile & {
  game_plan?: {
    notes?: RawGamePlanNote[];
    html?: string;
  } | null;
};

const EMAIL_TEMPLATES: EmailTemplate[] = [
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

export default function CustomerWorkspacePage() {
  const params = useParams();
  const router = useRouter();
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

  // UI state
  const [activeSection, setActiveSection] = useState<Section>('gameplan');
  const [loading, setLoading] = useState(true);
  const [editingBrief, setEditingBrief] = useState(false);
  const [editingGamePlan, setEditingGamePlan] = useState(false);
  const [savingGamePlan, setSavingGamePlan] = useState(false);
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(null);
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editorInitialSections, setEditorInitialSections] = useState<ConceptSectionKey[]>([
    'script',
    'instructions',
    'fit'
  ]);
  const [showAddConceptPanel, setShowAddConceptPanel] = useState(false);
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

  const customerCacheKey = `studio-v2:workspace:${customerId}:customer`;
  const conceptsCacheKey = `studio-v2:workspace:${customerId}:concepts`;
  const notesCacheKey = `studio-v2:workspace:${customerId}:notes`;
  const emailLogCacheKey = `studio-v2:workspace:${customerId}:email-log`;
  const emailJobsCacheKey = `studio-v2:workspace:${customerId}:email-jobs`;

  const applyCustomerState = (profile: WorkspaceCustomerProfile) => {
    setCustomer(profile);
    setBrief(profile.brief || { tone: '', constraints: '', current_focus: '' });
    const html = typeof profile.game_plan?.html === 'string' ? sanitizeRichTextHtml(profile.game_plan.html) : '';
    if (html.trim()) {
      setGamePlanHtml(html);
      return;
    }

    const legacyNotes = (profile.game_plan?.notes || []) as RawGamePlanNote[];
    if (legacyNotes.length > 0) {
      setGamePlanHtml(gamePlanNotesToHtml(legacyNotes));
      return;
    }

    setGamePlanHtml('');
  };

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
        setAllConcepts(dbConcepts.length > 0 ? dbConcepts : loadConceptsFromJson());
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

  const handleChangeStatus = async (conceptId: string, newStatus: 'draft' | 'sent' | 'produced' | 'archived') => {
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

  const openConceptEditor = (
    conceptId: string,
    sections: ConceptSectionKey[] = ['script', 'instructions', 'fit']
  ) => {
    setEditorInitialSections(sections);
    setEditingConceptId(conceptId);
    setActiveSection('koncept');
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

        const details = getConceptDetails(customerConcept.concept_id);
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

      alert(data.message || 'Email köat för utskick!');
      if (typeof data.warning === 'string' && data.warning.trim()) {
        alert(`Skickat med varning: ${data.warning}`);
      }
      setEmailSubject('');
      setEmailBody('');
      setSelectedConceptIds([]);
      setEmailType('new_concept');
      await Promise.all([fetchConcepts(true), fetchEmailLog(true), fetchEmailJobs(true)]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Kunde inte skicka email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRetryEmailJob = async (jobId: string) => {
    if (!jobId || retryingEmailJobId) return;

    setRetryingEmailJobId(jobId);
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
      alert('Email-jobbet har köats om');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Kunde inte köa om email-jobbet');
    } finally {
      setRetryingEmailJobId(null);
    }
  };

  // Game Plan handlers
  const handleSaveGamePlan = async () => {
    if (!customer) return;

    setSavingGamePlan(true);
    try {
      const sanitizedHtml = sanitizeRichTextHtml(gamePlanHtml);
      const { error } = await supabase
        .from('customer_profiles')
        .update({
          game_plan: {
            html: sanitizedHtml,
            version: 2,
            updated_at: new Date().toISOString()
          }
        })
        .eq('id', customerId);

      if (error) throw error;

      await fetchCustomer(true);
      setEditingGamePlan(false);
    } catch (err) {
      console.error('Error saving game plan:', err);
      alert('Kunde inte spara Game Plan');
    } finally {
      setSavingGamePlan(false);
    }
  };

  // Helper functions
  const getConceptDetails = (conceptId: string): TranslatedConcept | undefined => {
    return allConcepts.find(c => c.id === conceptId);
  };

  const formatDate = (dateStr: string) => {
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
    // Return draft concepts that are not yet placed in the feed
    return concepts.filter(c => c.status === 'draft' && c.feed_order === null);
  };

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
          onClick={() => router.push('/studio')}
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
  const editingConceptDetails = editingConcept ? getConceptDetails(editingConcept.concept_id) : undefined;
  const latestEmailJob = emailJobs[0] || null;

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/studio"
          style={{
            color: LeTrendColors.textSecondary,
            fontSize: 14,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          Tillbaka till kunder
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
              background: customer.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(156, 163, 175, 0.1)',
              color: customer.status === 'active' ? '#10b981' : '#9ca3af',
              border: `1px solid ${customer.status === 'active' ? '#10b981' : '#9ca3af'}`,
              display: 'inline-block'
            }}>
              {customer.status === 'active' ? 'Aktiv' : customer.status}
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
            {[
              { key: 'gameplan' as Section, label: 'Game Plan', icon: '[GP]', badge: notes.length },
              { key: 'koncept' as Section, label: 'Koncept', icon: '[K]', badge: draftCount },
              { key: 'feed' as Section, label: 'Feed-planerare', icon: '[F]' },
              { key: 'kommunikation' as Section, label: 'Kommunikation', icon: '[M]' }
            ].map(({ key, label, icon, badge }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
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
                <span>
                  <span style={{ marginRight: 8 }}>{icon}</span>
                  {label}
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
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN - Flexible content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section content will be rendered here based on activeSection */}
          {activeSection === 'gameplan' && (
            <GamePlanSection
              notes={notes}
              gamePlanHtml={gamePlanHtml}
              setGamePlanHtml={setGamePlanHtml}
              editingGamePlan={editingGamePlan}
              setEditingGamePlan={setEditingGamePlan}
              savingGamePlan={savingGamePlan}
              handleSaveGamePlan={handleSaveGamePlan}
              newNoteContent={newNoteContent}
              setNewNoteContent={setNewNoteContent}
              addingNote={addingNote}
              handleAddNote={handleAddNote}
              handleDeleteNote={handleDeleteNote}
              parseMarkdownLinks={parseMarkdownLinks}
              formatDateTime={formatDateTime}
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
              setShowFeedSlotPanel={setShowFeedSlotPanel}
              setSelectedFeedSlot={setSelectedFeedSlot}
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
              latestEmailJob={latestEmailJob}
              retryingEmailJobId={retryingEmailJobId}
              handleSendEmail={handleSendEmail}
              handleRetryEmailJob={handleRetryEmailJob}
              getDraftConcepts={getDraftConcepts}
              getConceptDetails={getConceptDetails}
              formatDateTime={formatDateTime}
            />
          )}
        </div>
      </div>

      {/* Add Concept Side Panel */}
      <SidePanel
        isOpen={showAddConceptPanel}
        onClose={() => setShowAddConceptPanel(false)}
        title="Lägg till koncept"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allConcepts
            .filter(c => !concepts.find(cc => cc.concept_id === c.id))
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
                {concept.description_sv && (
                  <p style={{
                    fontSize: 12,
                    color: LeTrendColors.textSecondary,
                    margin: '0 0 12px',
                    lineHeight: 1.5
                  }}>
                    {concept.description_sv.substring(0, 100)}...
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
        </div>
      </SidePanel>

      {/* Feed Slot Assignment Panel */}
      <SidePanel
        isOpen={showFeedSlotPanel}
        onClose={() => {
          setShowFeedSlotPanel(false);
          setSelectedFeedSlot(null);
        }}
        title={`Välj koncept för position ${selectedFeedSlot !== null ? (selectedFeedSlot > 0 ? '+' : '') + selectedFeedSlot : ''}`}
      >
        {selectedFeedSlot !== null && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: LeTrendColors.textSecondary }}>
            {selectedFeedSlot > 0 ? 'Planerad video' : selectedFeedSlot === 0 ? 'Nuvarande video' : 'Historik'}
          </p>
        )}
        {getDraftConcepts().length === 0 ? (
          <p style={{ color: LeTrendColors.textSecondary, fontSize: 14 }}>
            Inga ej-placerade utkast finns. Lägg till koncept från biblioteket först.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {getDraftConcepts().map(concept => {
              const details = getConceptDetails(concept.concept_id);
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
                  {details?.headline_sv || details?.headline || concept.concept_id}
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
    </div>
  );
}

// SECTION COMPONENTS (defined below main component for better organization)

interface GamePlanSectionProps {
  notes: CustomerNote[];
  gamePlanHtml: string;
  setGamePlanHtml: (html: string) => void;
  editingGamePlan: boolean;
  setEditingGamePlan: (editing: boolean) => void;
  savingGamePlan: boolean;
  handleSaveGamePlan: () => Promise<void>;
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  addingNote: boolean;
  handleAddNote: () => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  parseMarkdownLinks: (text: string) => React.ReactNode[] | string;
  formatDateTime: (dateStr: string) => string;
}

interface KonceptSectionProps {
  concepts: CustomerConcept[];
  expandedConceptId: string | null;
  setExpandedConceptId: (conceptId: string | null) => void;
  handleDeleteConcept: (conceptId: string) => Promise<void>;
  handleChangeStatus: (conceptId: string, newStatus: 'draft' | 'sent' | 'produced' | 'archived') => Promise<void>;
  openConceptEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  setShowAddConceptPanel: (show: boolean) => void;
  formatDate: (dateStr: string) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
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
  setShowFeedSlotPanel: (show: boolean) => void;
  setSelectedFeedSlot: (feedOrder: number | null) => void;
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
  latestEmailJob: EmailJobEntry | null;
  retryingEmailJobId: string | null;
  handleSendEmail: () => Promise<void>;
  handleRetryEmailJob: (jobId: string) => Promise<void>;
  getDraftConcepts: () => CustomerConcept[];
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  formatDateTime: (dateStr: string) => string;
}


function GamePlanSection({
  notes,
  gamePlanHtml,
  setGamePlanHtml,
  editingGamePlan,
  setEditingGamePlan,
  savingGamePlan,
  handleSaveGamePlan,
  newNoteContent,
  setNewNoteContent,
  addingNote,
  handleAddNote,
  handleDeleteNote,
  parseMarkdownLinks,
  formatDateTime,
}: GamePlanSectionProps) {
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
          marginBottom: 16
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
                disabled={savingGamePlan}
                style={{
                  padding: '10px 16px',
                  background: savingGamePlan ? LeTrendColors.textMuted : LeTrendColors.success,
                  color: '#fff',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingGamePlan ? 'not-allowed' : 'pointer'
                }}
              >
                {savingGamePlan ? 'Sparar...' : 'Spara'}
              </button>
              <button
                onClick={() => setEditingGamePlan(false)}
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
            <GamePlanDisplay html={gamePlanHtml} />
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
                    {formatDateTime(note.created_at)} av {note.cm_id || 'okänd'}
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
  getConceptDetails
}: KonceptSectionProps) {
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

      {concepts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 60,
          color: LeTrendColors.textMuted
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>[ ]</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Inga koncept ännu
          </div>
          <div style={{ fontSize: 14 }}>
            Lägg till ett koncept för att komma igång.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {concepts.map((concept: CustomerConcept) => {
            const details = getConceptDetails(concept.concept_id);
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
                      {details?.headline_sv || details?.headline || concept.concept_id}
                    </h3>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                      <StatusChip
                        status={concept.status}
                        onClick={() => {
                          if (concept.status === 'archived') {
                            return;
                          }
                          const nextStatus = concept.status === 'draft'
                            ? 'sent'
                            : concept.status === 'sent'
                              ? 'produced'
                              : concept.status === 'produced'
                                ? 'archived'
                                : 'archived';
                          handleChangeStatus(concept.id, nextStatus);
                        }}
                        editable={concept.status !== 'archived'}
                      />
                      <span style={{ color: LeTrendColors.textMuted }}>
                        Tillagd: {formatDate(concept.added_at)}
                      </span>
                    </div>
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
  setShowFeedSlotPanel,
  setSelectedFeedSlot,
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
  const getDraftConcepts = React.useCallback(() => {
    return concepts.filter(c => c.status === 'draft' && c.feed_order === null);
  }, [concepts]);

  // Frac offset: shifts span positions when grid is scrolled
  const totalSlots = gridConfig.columns * gridConfig.rows;
  const fracOffset = historyOffset / totalSlots;

  // Bygg slot-map
  const slotMap = React.useMemo(() =>
    buildSlotMap(
      concepts.filter(c => c.feed_order !== null),
      gridConfig,
      historyOffset
    ),
    [concepts, gridConfig, historyOffset]
  );
  const canShowMoreHistory = hasMoreHistory(
    concepts.filter(c => c.feed_order !== null),
    gridConfig,
    historyOffset
  ) && historyOffset < maxExtraHistorySlots;

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
        att justera längd. Åliden lyser upp vid hover.
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
            <span>? Tillgängliga koncept ({getDraftConcepts().length})</span>
            <span style={{ fontSize: 16 }}>{showConceptPicker ? '?' : '?'}</span>
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
                Dra ett koncept till en tom slot, eller klicka för att välja plats
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {getDraftConcepts().map(concept => {
                  const details = getConceptDetails(concept.concept_id);
                  return (
                    <div
                      key={concept.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/concept-id', concept.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        setSelectedFeedSlot(1);
                        setShowFeedSlotPanel(true);
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
                      {details?.headline_sv || details?.headline || concept.concept_id}
                      <span style={{ fontSize: 10, color: LeTrendColors.textMuted, marginLeft: 8 }}>dra till slot</span>
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
                          style={{ cursor: isVis ? 'ns-resize' : 'pointer', pointerEvents: 'all' }}
                          onClick={(e) => {
                            if (!isVis) return;
                            e.stopPropagation();
                            const current = span.climax_date || '';
                            const input = prompt('Klimax-datum (YYYY-MM-DD):', current);
                            if (input === null) return;
                            const trimmed = input.trim() || null;
                            setSpans(prev => prev.map(s =>
                              s.id === span.id ? { ...s, climax_date: trimmed } : s
                            ));
                            void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ climax_date: trimmed })
                            }).catch(() => {});
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
                  onClick={async () => {
                    if (span.climax !== null) {
                      // Remove climax
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
                      // Set climax + prompt for date
                      const dateInput = prompt('Klimax-datum (YYYY-MM-DD), t.ex. 2026-02-14:');
                      if (dateInput === null) return;
                      const newClimaxFrac = (span.frac_start + span.frac_end) / 2;
                      const climaxDate = dateInput.trim() || null;
                      setSpans((prev) =>
                        prev.map((s) =>
                          s.id === span.id ? { ...s, climax: newClimaxFrac, climax_date: climaxDate } : s
                        )
                      );
                      void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ climax: newClimaxFrac, climax_date: climaxDate })
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
                {span.climax !== null && span.climax_date && (
                  <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>
                    {new Date(span.climax_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
                  </span>
                )}
                {span.climax !== null && !span.climax_date && (
                  <button
                    onClick={() => {
                      const dateInput = prompt('Klimax-datum (YYYY-MM-DD):');
                      if (dateInput === null) return;
                      const trimmed = dateInput.trim() || null;
                      setSpans(prev => prev.map(s =>
                        s.id === span.id ? { ...s, climax_date: trimmed } : s
                      ));
                      void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ climax_date: trimmed })
                      }).catch(() => {});
                    }}
                    style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: LeTrendRadius.sm,
                      background: 'transparent',
                      border: `1px dashed ${LeTrendColors.border}`,
                      color: LeTrendColors.textMuted,
                      cursor: 'pointer'
                    }}
                  >
                    + Lägg till datum
                  </button>
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
  config,
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
  const details = concept ? (getConceptDetails(concept.concept_id) ?? null) : null;
  const isFutureSlot = slot.feedOrder > 0;
  const isCurrentSlot = slot.feedOrder === 0;
  const isPastSlot = slot.feedOrder < 0;
  const canAddConcept = type === 'empty' && !isPastSlot;
  const hasUnreadUpload = hasUnreadUploadMarker(concept);

  React.useEffect(() => {
    setLocalNote(concept?.cm_note ?? '');
    setLocalTikTokUrl(concept?.tiktok_url ?? '');
    setLocalThumbnailUrl(concept?.tiktok_thumbnail_url ?? '');
    setLocalViews(concept?.tiktok_views != null ? String(concept.tiktok_views) : '');
    setLocalLikes(concept?.tiktok_likes != null ? String(concept.tiktok_likes) : '');
    setLocalComments(concept?.tiktok_comments != null ? String(concept.tiktok_comments) : '');
    setLocalWatchTime(concept?.tiktok_watch_time_seconds != null ? String(concept.tiktok_watch_time_seconds) : '');
    setEditingNote(false);
    setEditingTikTok(false);
    setEditingMetadata(false);
    setShowTagPicker(false);
  }, [
    concept?.id,
    concept?.cm_note,
    concept?.tiktok_url,
    concept?.tiktok_thumbnail_url,
    concept?.tiktok_views,
    concept?.tiktok_likes,
    concept?.tiktok_comments,
    concept?.tiktok_watch_time_seconds
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
    const currentTags = concept.tags || [];
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
      const nextValue = requestDateIso('Planerad publicering', concept.planned_publish_at ?? null);
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
      const nextValue = requestDateIso('Publicerad', concept.published_at ?? null);
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
  const thumbnailUrl = concept?.tiktok_thumbnail_url;
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

      {concept?.content_loaded_at && (
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

      {type === 'history' && (concept?.produced_at || concept?.published_at) && (
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
          {concept?.produced_at ? `Prod: ${formatDate(concept.produced_at)}` : null}
          {concept?.published_at ? (
            <div>{`Pub: ${formatDate(concept.published_at)}`}</div>
          ) : null}
        </div>
      )}

      {/* TikTok play indicator for history */}
      {type === 'history' && concept?.tiktok_url && (
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
            {details?.headline_sv?.substring(0, 60) || concept.concept_id}
          </div>

          {(concept.planned_publish_at || concept.content_loaded_at) && (
            <div style={{ marginTop: 6, fontSize: 10, color: LeTrendColors.textMuted, lineHeight: 1.3 }}>
              {concept.planned_publish_at ? <div>{`Plan: ${formatDate(concept.planned_publish_at)}`}</div> : null}
              {concept.content_loaded_at ? <div>{`In: ${formatDate(concept.content_loaded_at)}`}</div> : null}
            </div>
          )}

          {type === 'history' && (concept.tiktok_views || concept.tiktok_likes || concept.tiktok_comments) && (
            <div style={{ marginTop: 6, fontSize: 10, color: LeTrendColors.textSecondary }}>
              {`Visn ${formatMetric(concept.tiktok_views)} · Likes ${formatMetric(concept.tiktok_likes)} · Komm ${formatMetric(concept.tiktok_comments)}`}
            </div>
          )}
        </div>
      )}

      {/* Taggar */}
      {concept && concept.tags && concept.tags.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 2,
          marginTop: 8
        }}>
          {concept.tags.slice(0, 3).map((tagName) => {
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

          {type === 'history' && (
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
              {editingNote ? 'Avbryt notering' : 'Redigera notering'}
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
                  const selected = (concept.tags || []).includes(tag.name);
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

          {editingNote && type === 'history' && (
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
  latestEmailJob,
  retryingEmailJobId,
  handleSendEmail,
  handleRetryEmailJob,
  getDraftConcepts,
  getConceptDetails,
  formatDateTime,
}: KommunikationSectionProps) {
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const getEmailJobStatusLabel = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'queued':
        return 'I kö';
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
              {retryingEmailJobId === latestEmailJob.id ? 'Köar om...' : 'Retry'}
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
        {getDraftConcepts().length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 8
            }}>
              Bifoga koncept
            </label>
            <div style={{
              background: '#fff',
              borderRadius: LeTrendRadius.md,
              padding: 12,
              border: `1px solid ${LeTrendColors.border}`,
              maxHeight: 200,
              overflowY: 'auto'
            }}>
              {getDraftConcepts().map((concept: CustomerConcept) => {
                const details = getConceptDetails(concept.concept_id);
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
                      {details?.headline_sv || details?.headline || concept.concept_id}
                    </span>
                  </label>
                );
              })}
            </div>
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
                          {formatDateTime(email.sent_at)} av {email.cm_id || 'okänd'}
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



