'use client';

import { Link } from 'wouter';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from '@/lib/navigation-compat';
import { useAuth } from '@/contexts/AuthContext';
import { VideoPlayer } from '@/components/shared/VideoPlayer';
import {
  BUSINESS_TYPE_VALUES,
  DIFFICULTY_VALUES,
  FILM_TIME_VALUES,
  PEOPLE_VALUES,
  SCRIPT_MODE_VALUES,
} from '@/lib/concept-enrichment';
import { categoryOptions, display } from '@/lib/display';
import { supabase } from '@/lib/supabase/client';
import { getSigma, hasSigmaSignals, readScriptMode, readSetupComplexity, readSkillRequired, readSetting, translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';
import { buildSuggestionsFromOverrides, hasApplicableSuggestions, countApplicableSuggestions, getSuggestionState } from '@/lib/reanalyze-suggestions';
import { conceptFieldConstraints } from '@/lib/concept-field-constraints';
import { describeTranscriptLanguage, detectTranscriptLanguage } from '@/lib/transcript-language';
import { RegenerateField } from '@/components/studio/RegenerateField';

const SIGMA_LABEL: Record<string, string> = {
  solo: 'Solo (1)',
  duo: 'Duo (2)',
  small_group: 'Litet team (3-4)',
  crowd: 'Stort team (5+)',
  anyone: 'Vem som helst',
  comfortable_on_camera: 'Bekväm framför kamera',
  acting_required: 'Skådespel krävs',
  professional: 'Professionell skådespelare',
  point_and_shoot: 'Point-and-shoot',
  basic_tripod: 'Stativ + grundsetup',
  multi_location: 'Flera platser',
  elaborate_staging: 'Avancerad scenografi',
  none: 'Inga rekvisita',
  common_items: 'Vardagsföremål',
  specific_props: 'Specifika rekvisita',
  custom_fabrication: 'Specialbyggda rekvisita',
  any_venue: 'Valfri lokal',
  similar_venue_type: 'Liknande lokal',
  specific_setting_needed: 'Specifik miljö krävs',
  basic_cuts: 'Enkla klipp',
  timed_edits: 'Timade klipp',
  effects_required: 'Effekter krävs',
  professional_post: 'Professionell post-prod',
  under_15min: 'Under 15 min',
  under_1hr: 'Under 1 timme',
  half_day: 'Halvdag',
  full_day_plus: 'Heldag eller mer',
  hospitality_sketch: 'Hospitality-sketch',
  workplace_relatable: 'Arbetsplats-relaterbar',
  customer_interaction: 'Kundinteraktion',
  product_showcase: 'Produktvisning',
  atmosphere_vibe: 'Stämning/vibe',
  in_scope: 'Relevant för hospitality',
  out_of_scope: 'Utanför scope',
  edge_case: 'Gränsfall',
  sketch_comedy: 'Sketch-komedi',
  reaction_content: 'Reaktion',
  informational: 'Informativt',
  interview_format: 'Intervju',
  montage_visual: 'Montage',
  tutorial_how_to: 'Tutorial',
  testimonial: 'Testimonial',
  promotional_direct: 'Direkt reklam',
  trend_recreation: 'Trend-återskapning',
  hybrid: 'Hybrid',
};
const sigmaLabel = (value?: string | null) => (value ? SIGMA_LABEL[value] ?? value : '—');

const cardStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as const;
const fieldLabelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 } as const;
const inputBaseStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
} as const;
const textareaBaseStyle = {
  ...inputBaseStyle,
  resize: 'vertical' as const,
} as const;

const difficultyOptions = DIFFICULTY_VALUES.map((key) => ({ key, ...display.difficulty(key) }));
const filmTimeGroups = FILM_TIME_VALUES.reduce<Array<{ key: string; label: string; value: string }>>((groups, value) => {
  const range = display.filmTimeRange(value);
  if (!groups.some((group) => group.key === range.key)) groups.push({ key: range.key, label: range.label, value });
  return groups;
}, []);
const peopleOptions = PEOPLE_VALUES.map((key) => ({
  key,
  label: display.peopleNeeded(key).label,
  shortLabel: display.peopleNeededShort(key),
}));
const businessTypeOptions = BUSINESS_TYPE_VALUES.map((key) => ({ key, ...display.businessType(key) }));
const marketOptions = categoryOptions.markets();
const scriptModeOptions = SCRIPT_MODE_VALUES.map((key) => ({
  key,
  label: ({ none: 'Inget manus', text_overlay: 'Textoverlay', short_dialogue: 'Kort dialog', long_dialogue: 'Lång dialog', visual_only: 'Visuellt' } as Record<string, string>)[key] ?? key,
}));
const setupComplexityOptions: Array<{ key: string; label: string }> = [
  { key: 'point_and_shoot', label: 'Point-and-shoot' },
  { key: 'basic_tripod', label: 'Stativ' },
  { key: 'multi_location', label: 'Flera platser' },
  { key: 'elaborate_staging', label: 'Scenografi' },
];
const skillRequiredOptions: Array<{ key: string; label: string }> = [
  { key: 'anyone', label: 'Vem som helst' },
  { key: 'comfortable_on_camera', label: 'Kameravant' },
  { key: 'acting_required', label: 'Skådespel' },
  { key: 'professional', label: 'Professionell' },
];
const reviewSettingOptions: Array<{ key: string; label: string }> = [
  { key: 'any_venue', label: 'Valfri lokal' },
  { key: 'similar_venue_type', label: 'Liknande lokal' },
  { key: 'specific_setting_needed', label: 'Specifik miljö' },
];

function detectPlatform(url: string): string | null {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram.com')) return 'Instagram';
  return null;
}

function textAreaToList(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function listToTextArea(value?: string[]) {
  return (value || []).join('\n');
}

function getListPreview(value: string) {
  return textAreaToList(value).slice(0, 4);
}

interface RawConcept {
  id: string;
  source: string;
  backend_data: BackendClip;
  overrides: Record<string, unknown>;
  is_active: boolean;
  created_by?: string | null;
  version: number;
}

interface ReanalyzeSuggestions {
  strategy: 'full_reanalyze' | 'enrich_only';
  script_mode?: string | null;
  setup_complexity?: string | null;
  skill_required?: string | null;
  setting?: string | null;
  peopleNeeded?: string | null;
  difficulty?: string | null;
  filmTime?: string | null;
  businessTypes?: string[] | null;
  enrich_failed?: boolean;
}

function counterColor(len: number, min: number, max: number) {
  if (len === 0) return '#9ca3af';
  if (len < min || len > max) return '#dc2626';
  return '#16a34a';
}

export default function ConceptReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { session, user } = useAuth();
  const conceptId = params?.id as string;

  const [raw, setRaw] = useState<RawConcept | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showClassification, setShowClassification] = useState(false);

  const [headlineSv, setHeadlineSv] = useState('');
  const [descriptionSv, setDescriptionSv] = useState('');
  const [whyItWorksSv, setWhyItWorksSv] = useState('');
  const [scriptSv, setScriptSv] = useState('');
  const [productionNotesText, setProductionNotesText] = useState('');
  const [whyItFitsText, setWhyItFitsText] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [filmTime, setFilmTime] = useState('');
  const [market, setMarket] = useState('');
  const [peopleNeeded, setPeopleNeeded] = useState('');
  const [scriptMode, setScriptMode] = useState('none');
  const [setupComplexity, setSetupComplexity] = useState<string | null>(null);
  const [skillRequired, setSkillRequired] = useState<string | null>(null);
  const [settingVal, setSettingVal] = useState<string | null>(null);
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  const [replicabilityHint, setReplicabilityHint] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [gcsUri, setGcsUri] = useState<string | null>(null);
  const [suggestedScript, setSuggestedScript] = useState('');
  const [nextDraft, setNextDraft] = useState<{ id: string; headline: string } | null | 'loading'>('loading');
  const [draftQueueProgress, setDraftQueueProgress] = useState<{ index: number; total: number } | null>(null);

  const [reanalyzeState, setReanalyzeState] = useState<'idle' | 'reanalyzing' | 'done' | 'error'>('idle');
  const [reanalyzeSuggestions, setReanalyzeSuggestions] = useState<ReanalyzeSuggestions | null>(null);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [pendingReanalyzeBackendData, setPendingReanalyzeBackendData] = useState<BackendClip | null>(null);

  const loadConcept = useCallback(async () => {
    if (!conceptId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        setLoadError((errData as { error?: string }).error || `HTTP ${resp.status}`);
        return;
      }
      const { concept } = (await resp.json()) as { concept: RawConcept };
      const overrides = (concept.overrides ?? {}) as ClipOverride;
      const translated = translateClipToConcept(concept.backend_data, overrides);
      const normalizedMarket = typeof overrides.market === 'string'
        ? overrides.market
        : translated.market === 'global' ? 'US' : translated.market;

      setRaw(concept);
      setIsActive(concept.is_active);
      setCreatedBy(concept.created_by ?? null);
      setCreatedByName(((concept as unknown) as { created_by_name?: string | null }).created_by_name ?? null);
      setHeadlineSv(overrides.headline_sv ?? translated.headline_sv ?? '');
      setDescriptionSv(overrides.description_sv ?? translated.description_sv ?? '');
      setWhyItWorksSv(overrides.whyItWorks_sv ?? translated.whyItWorks_sv ?? '');
      setScriptSv(overrides.script_sv ?? overrides.transcript ?? translated.script_sv ?? '');
      setSuggestedScript(translated.script_sv ?? '');
      setProductionNotesText(listToTextArea(overrides.productionNotes_sv ?? translated.productionNotes_sv));
      setWhyItFitsText(listToTextArea(overrides.whyItFits_sv ?? translated.whyItFits_sv));
      setDifficulty(typeof overrides.difficulty === 'string' ? overrides.difficulty : translated.difficulty);
      setFilmTime(typeof overrides.filmTime === 'string' ? overrides.filmTime : translated.filmTime);
      setMarket(normalizedMarket);
      setPeopleNeeded(typeof overrides.peopleNeeded === 'string' ? overrides.peopleNeeded : translated.peopleNeeded);
      setScriptMode(typeof overrides.script_mode === 'string' ? overrides.script_mode : readScriptMode(concept.backend_data, overrides));
      setSetupComplexity(readSetupComplexity(concept.backend_data, overrides));
      setSkillRequired(readSkillRequired(concept.backend_data, overrides));
      setSettingVal(readSetting(concept.backend_data, overrides));
      setBusinessTypes(
        Array.isArray(overrides.businessTypes) && overrides.businessTypes.length > 0
          ? overrides.businessTypes.filter((value) => typeof value === 'string') as string[]
          : translated.businessTypes,
      );
      setReplicabilityHint(concept.backend_data.replicability_analysis ?? null);
      setSourceUrl(concept.backend_data.url ?? concept.backend_data.source_url ?? null);
      setGcsUri(concept.backend_data.gcs_uri ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Kunde inte ladda konceptet');
    } finally {
      setLoading(false);
    }
  }, [conceptId]);

  const fetchNextDraft = useCallback(async () => {
    if (!conceptId) return;
    setNextDraft('loading');
    try {
      const { data } = await supabase
        .from('concepts')
        .select('id, overrides')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!data || data.length === 0) {
        setNextDraft(null);
        setDraftQueueProgress(null);
        return;
      }
      const currentIndex = data.findIndex((row) => row.id === conceptId);
      const nextRow = data.find((row) => row.id !== conceptId) ?? null;
      setDraftQueueProgress(currentIndex >= 0 ? { index: currentIndex + 1, total: data.length } : { index: 0, total: data.length });
      setNextDraft(
        nextRow
          ? { id: nextRow.id as string, headline: ((nextRow.overrides as Record<string, unknown>)?.headline_sv as string) || '(Inget namn)' }
          : null,
      );
    } catch {
      setNextDraft(null);
      setDraftQueueProgress(null);
    }
  }, [conceptId]);

  useEffect(() => {
    void loadConcept();
    void fetchNextDraft();
  }, [fetchNextDraft, loadConcept]);

  const handleSave = useCallback(async () => {
    if (!raw || !headlineSv.trim()) return;
    setSaving(true);
    try {
      const newOverrides: Record<string, unknown> = {
        ...(raw.overrides ?? {}),
        headline_sv: headlineSv.trim(),
        description_sv: descriptionSv.trim(),
        whyItWorks_sv: whyItWorksSv.trim(),
        script_sv: scriptSv.trim(),
        transcript: scriptSv.trim(),
        productionNotes_sv: textAreaToList(productionNotesText),
        whyItFits_sv: textAreaToList(whyItFitsText),
        difficulty,
        filmTime,
        market,
        peopleNeeded,
        script_mode: scriptMode,
        businessTypes,
        hasScript: Boolean(scriptSv.trim()),
      };
      // Nullable objective fields — write when set, explicitly delete when cleared
      // so that toggling off removes the old override value from the DB.
      if (setupComplexity) {
        newOverrides['setup_complexity'] = setupComplexity;
      } else {
        delete newOverrides['setup_complexity'];
      }
      if (skillRequired) {
        newOverrides['skill_required'] = skillRequired;
      } else {
        delete newOverrides['skill_required'];
      }
      if (settingVal) {
        newOverrides['setting'] = settingVal;
      } else {
        delete newOverrides['setting'];
      }
      const patchBody: Record<string, unknown> = { overrides: newOverrides };
      if (pendingReanalyzeBackendData) {
        patchBody['backend_data'] = pendingReanalyzeBackendData;
      }
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(patchBody),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Sparning misslyckades');
      }
      const payload = await resp.json();
      setRaw(payload.concept as RawConcept);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (pendingReanalyzeBackendData) {
        setPendingReanalyzeBackendData(null);
        setReanalyzeState('idle');
        setReanalyzeSuggestions(null);
      }
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setSaving(false);
    }
  }, [businessTypes, conceptId, descriptionSv, difficulty, filmTime, headlineSv, market, peopleNeeded, pendingReanalyzeBackendData, productionNotesText, raw, scriptMode, scriptSv, session, settingVal, setupComplexity, skillRequired, whyItFitsText, whyItWorksSv]);

  const handleTogglePublish = useCallback(async (publish: boolean) => {
    const publishReady = Boolean(headlineSv.trim()) && Boolean(scriptSv.trim() || !publish) && Boolean(difficulty && filmTime && peopleNeeded && businessTypes.length > 0);
    if (publish && !publishReady) {
      alert('Fyll i titel, manus och klassificering innan du publicerar.');
      return;
    }
    setTogglingActive(true);
    try {
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ is_active: publish }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Misslyckades');
      }
      const payload = await resp.json();
      setRaw(payload.concept as RawConcept);
      setIsActive(publish);
      void fetchNextDraft();
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setTogglingActive(false);
    }
  }, [businessTypes.length, conceptId, difficulty, fetchNextDraft, filmTime, headlineSv, peopleNeeded, scriptSv, session]);

  const handleTakeOver = useCallback(async () => {
    if (!user || createdBy === user.id) return;
    if (!confirm('Vill du ta över ägarskapet för det här konceptet?')) return;
    setTakingOver(true);
    try {
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ take_over: true }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Misslyckades');
      }
      const payload = await resp.json();
      const updated = payload.concept as RawConcept;
      setRaw(updated);
      setCreatedBy(updated.created_by ?? null);
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setTakingOver(false);
    }
  }, [conceptId, createdBy, session, user]);

  const handleReanalyze = useCallback(async () => {
    setReanalyzeState('reanalyzing');
    setReanalyzeError(null);
    setReanalyzeSuggestions(null);
    setPendingReanalyzeBackendData(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const resp = await fetch(`/api/studio/concepts/${conceptId}/reanalyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s?.access_token}` },
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const retryAfterSec = (errData as { retryAfterSeconds?: number }).retryAfterSeconds;
        const errMsg = (errData as { error?: string }).error || `HTTP ${resp.status}`;
        throw new Error(retryAfterSec ? `${errMsg}` : errMsg);
      }
      const data = await resp.json() as {
        strategy: 'full_reanalyze' | 'enrich_only';
        backend_data: BackendClip;
        suggested_overrides: Record<string, unknown>;
        enrich_failed?: boolean;
      };
      const newBd = data.backend_data;
      const sug = data.suggested_overrides;
      // Build suggestions exclusively from suggested_overrides — never fall back to
      // readX(backend_data). The backend's buildSuggestedOverrides already filtered out
      // keys confirmed by the CM. If a key is absent from sug it must stay null here
      // so it never appears as a "Tillämpa"-suggestion on the review page.
      const proposed: ReanalyzeSuggestions = {
        strategy: data.strategy,
        ...buildSuggestionsFromOverrides(sug),
        enrich_failed: data.enrich_failed,
      };
      setPendingReanalyzeBackendData(newBd);
      setReanalyzeSuggestions(proposed);
      setReanalyzeState('done');
    } catch (err) {
      setReanalyzeError(err instanceof Error ? err.message : 'Analysfel');
      setReanalyzeState('error');
    }
  }, [conceptId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      } else if (event.key === 'Enter' && !isActive) {
        event.preventDefault();
        void handleTogglePublish(true);
      } else if (event.key === 'ArrowRight' && nextDraft && nextDraft !== 'loading') {
        event.preventDefault();
        router.push(`/studio/concepts/${nextDraft.id}/review`);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleTogglePublish, isActive, nextDraft, router]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;
  if (loadError) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{loadError}</div>;
  if (!raw) return null;

  const displayName = headlineSv || '(Inget namn annu)';
  const hasManualScriptOverride = typeof raw.overrides?.script_sv === 'string' || typeof raw.overrides?.transcript === 'string';
  const scriptStatus = scriptSv.trim() ? (hasManualScriptOverride ? 'Redigerat manus' : 'AI-/fallbackmanus') : 'Saknar manus';
  const selectedFilmTimeGroup = filmTime ? display.filmTimeRange(filmTime).key : '';
  const checklistItems = [
    { label: 'Har titel', done: Boolean(headlineSv.trim()) },
    { label: 'Har manus', done: Boolean(scriptSv.trim()) },
    { label: 'Har klassificering', done: Boolean(difficulty && filmTime && peopleNeeded && businessTypes.length > 0) },
  ];
  const canPublish = checklistItems.every((item) => item.done);
  const lifecycleStage = isActive ? 'Publicerat' : 'Utkast';
  const isOwner = Boolean(user && createdBy && createdBy === user.id);
  const draftQueueLabel = draftQueueProgress
    ? draftQueueProgress.index > 0
      ? `${draftQueueProgress.index} av ${draftQueueProgress.total} utkast`
      : `${draftQueueProgress.total} utkast i ko`
    : null;

  const choiceButton = (active: boolean, baseColor = '#111827') => ({
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${active ? baseColor : '#e5e7eb'}`,
    background: active ? `${baseColor}18` : '#fff',
    color: active ? baseColor : '#374151',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  });

  const headlineConstraint = conceptFieldConstraints.headline_sv;
  const descriptionConstraint = conceptFieldConstraints.description_sv;
  const whyConstraint = conceptFieldConstraints.whyItWorks_sv;
  const transcriptLang = detectTranscriptLanguage(scriptSv || raw.backend_data.script?.transcript);
  const transcriptLangBadge = describeTranscriptLanguage(transcriptLang);

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link to="/studio/concepts" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}>← Tillbaka till biblioteket</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Granska koncept</h1>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: isActive ? '#dcfce7' : '#fef3c7', color: isActive ? '#166534' : '#92400e', fontSize: 12, fontWeight: 700 }}>{lifecycleStage}</span>
            {draftQueueLabel ? <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{draftQueueLabel}</span> : null}
            {createdBy ? (
              <span style={{ fontSize: 12, color: isOwner ? '#16a34a' : '#6b7280', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: isOwner ? '#16a34a' : '#9ca3af', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(createdByName || createdBy).slice(0, 1).toUpperCase()}
                </span>
                {isOwner ? 'Du äger' : `Ägare: ${createdByName || createdBy.slice(0, 8) + '…'}`}
              </span>
            ) : null}
            {!isOwner && createdBy && user ? (
              <button
                onClick={() => void handleTakeOver()}
                disabled={takingOver}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #4f46e5', background: takingOver ? '#e0e7ff' : '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 700, cursor: takingOver ? 'not-allowed' : 'pointer' }}
              >
                {takingOver ? '...' : 'Ta över'}
              </button>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{displayName}&nbsp;&middot;&nbsp;ID: {raw.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, color: '#6b7280' }}>Cmd/Ctrl+S spara · Cmd/Ctrl+Enter publicera · Cmd/Ctrl+→ nasta</div>
          {nextDraft && nextDraft !== 'loading' ? <Link to={`/studio/concepts/${nextDraft.id}/review`} style={{ display: 'inline-flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}><span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextDraft.headline}</span><span>Nasta utkast →</span></Link> : <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Inga fler utkast</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(sourceUrl || gcsUri) ? <div><div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#065f46' : '#92400e', marginBottom: 6 }}>Status: {lifecycleStage}</div><VideoPlayer videoUrl={sourceUrl ?? undefined} gcsUri={gcsUri ?? undefined} showLabel={false} /><div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>{sourceUrl ? <span style={{ fontSize: 11, color: '#9ca3af' }}>{detectPlatform(sourceUrl) ?? 'Kallvideo'}</span> : null}{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4f46e5', textDecoration: 'none' }}>Oppna video →</a> : null}</div></div> : null}

          {/* Reanalyze panel — available when a source URL or existing backend_data exists */}
          {(sourceUrl || gcsUri || raw.source === 'hagen') ? (
            <div style={{ ...cardStyle, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>AI-metadataanalys</span>
                {pendingReanalyzeBackendData ? <span style={{ fontSize: 10, color: '#059669', fontWeight: 600, background: '#ecfdf5', padding: '2px 6px', borderRadius: 999 }}>Ny analys laddad · osparad</span> : null}
              </div>

              {reanalyzeState === 'idle' || reanalyzeState === 'error' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleReanalyze()}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {sourceUrl ? 'Reanalysera video med AI' : 'Förädla metadata med AI'}
                  </button>
                  {reanalyzeState === 'error' && reanalyzeError ? (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626', lineHeight: 1.4 }}>{reanalyzeError}</div>
                  ) : null}
                </>
              ) : reanalyzeState === 'reanalyzing' ? (
                <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '8px 0' }}>
                  {sourceUrl ? 'Analyserar video… (kan ta upp till 1 min)' : 'Förädlar metadata…'}
                </div>
              ) : reanalyzeSuggestions ? (() => {
                const smLabel = scriptModeOptions.find((o) => o.key === reanalyzeSuggestions.script_mode)?.label ?? reanalyzeSuggestions.script_mode;
                const setupLabel = setupComplexityOptions.find((o) => o.key === reanalyzeSuggestions.setup_complexity)?.label;
                const skillLabel = skillRequiredOptions.find((o) => o.key === reanalyzeSuggestions.skill_required)?.label;
                const settingLabel = reviewSettingOptions.find((o) => o.key === reanalyzeSuggestions.setting)?.label;
                const currentSmLabel = scriptModeOptions.find((o) => o.key === scriptMode)?.label ?? scriptMode;
                const currentSetupLabel = setupComplexityOptions.find((o) => o.key === setupComplexity)?.label;
                const currentSkillLabel = skillRequiredOptions.find((o) => o.key === skillRequired)?.label;
                const currentSettingLabel = reviewSettingOptions.find((o) => o.key === settingVal)?.label;
                const sugPeopleLabel = peopleOptions.find((o) => o.key === reanalyzeSuggestions.peopleNeeded)?.label ?? reanalyzeSuggestions.peopleNeeded ?? null;
                const currentPeopleLabel = peopleOptions.find((o) => o.key === peopleNeeded)?.label ?? peopleNeeded ?? null;
                const sugDiffLabel = difficultyOptions.find((o) => o.key === reanalyzeSuggestions.difficulty)?.label ?? reanalyzeSuggestions.difficulty ?? null;
                const currentDiffLabel = difficultyOptions.find((o) => o.key === difficulty)?.label ?? difficulty ?? null;
                const sugFilmLabel = filmTimeGroups.find((o) => o.value === reanalyzeSuggestions.filmTime)?.label ?? reanalyzeSuggestions.filmTime ?? null;
                const currentFilmLabel = filmTime ? (filmTimeGroups.find((o) => o.value === filmTime)?.label ?? filmTime) : null;
                const sugBtLabel = reanalyzeSuggestions.businessTypes?.length
                  ? reanalyzeSuggestions.businessTypes.map((bt) => businessTypeOptions.find((o) => o.key === bt)?.label ?? bt).join(', ')
                  : null;
                const currentBtLabel = businessTypes.length
                  ? businessTypes.map((bt) => businessTypeOptions.find((o) => o.key === bt)?.label ?? bt).join(', ')
                  : null;
                const suggestions: Array<{ key: string; label: string; current: string | null; proposed: string | null; apply: () => void }> = [
                  { key: 'script_mode', label: 'Manusläge', current: currentSmLabel, proposed: smLabel ?? null, apply: () => { if (reanalyzeSuggestions.script_mode) setScriptMode(reanalyzeSuggestions.script_mode); } },
                  { key: 'setup_complexity', label: 'Setup', current: currentSetupLabel ?? null, proposed: setupLabel ?? null, apply: () => { if (reanalyzeSuggestions.setup_complexity) setSetupComplexity(reanalyzeSuggestions.setup_complexity); } },
                  { key: 'skill_required', label: 'Skicklighet', current: currentSkillLabel ?? null, proposed: skillLabel ?? null, apply: () => { if (reanalyzeSuggestions.skill_required) setSkillRequired(reanalyzeSuggestions.skill_required); } },
                  { key: 'setting', label: 'Miljö', current: currentSettingLabel ?? null, proposed: settingLabel ?? null, apply: () => { if (reanalyzeSuggestions.setting) setSettingVal(reanalyzeSuggestions.setting); } },
                  { key: 'peopleNeeded', label: 'Antal personer', current: currentPeopleLabel, proposed: sugPeopleLabel, apply: () => { if (reanalyzeSuggestions.peopleNeeded) setPeopleNeeded(reanalyzeSuggestions.peopleNeeded); } },
                  { key: 'difficulty', label: 'Svårighetsgrad', current: currentDiffLabel, proposed: sugDiffLabel, apply: () => { if (reanalyzeSuggestions.difficulty) setDifficulty(reanalyzeSuggestions.difficulty); } },
                  { key: 'filmTime', label: 'Filmtid', current: currentFilmLabel, proposed: sugFilmLabel, apply: () => { if (reanalyzeSuggestions.filmTime) setFilmTime(reanalyzeSuggestions.filmTime); } },
                  { key: 'businessTypes', label: 'Branscher', current: currentBtLabel, proposed: sugBtLabel, apply: () => { if (reanalyzeSuggestions.businessTypes?.length) setBusinessTypes(reanalyzeSuggestions.businessTypes); } },
                ];
                const hasDiff = !reanalyzeSuggestions.enrich_failed && suggestions.some((s) => s.proposed && s.proposed !== s.current);
                const _sugFields = reanalyzeSuggestions as Parameters<typeof hasApplicableSuggestions>[0];
                // True when suggested_overrides had at least one non-null field (even if values match current).
                // Distinguishes "suggestions suppressed (all confirmed)" from "suggestions present but already applied".
                const anyApplicable = !reanalyzeSuggestions.enrich_failed && hasApplicableSuggestions(_sugFields);
                const suggCount = countApplicableSuggestions(_sugFields);
                const suggState = getSuggestionState(_sugFields, reanalyzeSuggestions.enrich_failed);
                return (
                  <div>
                    {reanalyzeSuggestions.enrich_failed ? (
                      <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 6, background: '#fef3c7', fontSize: 11, color: '#92400e' }}>
                        Video analyserad — AI-förädling misslyckades. Uppdaterade videodata är redo att sparas men AI-förslag på klassificering är inte tillgängliga.
                      </div>
                    ) : null}
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{reanalyzeSuggestions.strategy === 'full_reanalyze' ? 'Fullanalys (video + AI)' : 'Förädling (AI)'}</span>
                      {suggState === 'has_suggestions' ? (
                        <span style={{ color: '#4f46e5', fontWeight: 700 }}>{suggCount} {suggCount === 1 ? 'förslag' : 'förslag'}</span>
                      ) : suggState === 'suppressed' ? (
                        <span style={{ color: '#9ca3af' }}>Inga förslag</span>
                      ) : null}
                    </div>
                    {hasDiff ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {suggestions.filter((s) => s.proposed && s.proposed !== s.current).map((s) => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{s.label}</div>
                              <div style={{ fontSize: 11, color: '#374151', marginTop: 1 }}>
                                <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{s.current ?? '—'}</span>
                                {' → '}
                                <span style={{ fontWeight: 700, color: '#4f46e5' }}>{s.proposed}</span>
                              </div>
                            </div>
                            <button type="button" onClick={s.apply} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              Tillämpa
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            if (reanalyzeSuggestions.script_mode) setScriptMode(reanalyzeSuggestions.script_mode);
                            if (reanalyzeSuggestions.setup_complexity) setSetupComplexity(reanalyzeSuggestions.setup_complexity);
                            if (reanalyzeSuggestions.skill_required) setSkillRequired(reanalyzeSuggestions.skill_required);
                            if (reanalyzeSuggestions.setting) setSettingVal(reanalyzeSuggestions.setting);
                            if (reanalyzeSuggestions.peopleNeeded) setPeopleNeeded(reanalyzeSuggestions.peopleNeeded);
                            if (reanalyzeSuggestions.difficulty) setDifficulty(reanalyzeSuggestions.difficulty);
                            if (reanalyzeSuggestions.filmTime) setFilmTime(reanalyzeSuggestions.filmTime);
                            if (reanalyzeSuggestions.businessTypes?.length) setBusinessTypes(reanalyzeSuggestions.businessTypes);
                          }}
                          style={{ width: '100%', padding: '6px', borderRadius: 8, border: '1px solid #4f46e5', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 2 }}
                        >
                          Tillämpa alla förslag
                        </button>
                      </div>
                    ) : anyApplicable ? (
                      <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 8 }}>Inga ändringar att tillämpa — formuläret är redan uppdaterat.</div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 1.5 }}>
                        Ny analysdata är redo att sparas. Inga nya klassificeringsförslag kunde tillämpas utan att röra bekräftade värden.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => void handleReanalyze()} style={{ flex: 1, padding: '5px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 11, cursor: 'pointer' }}>Kör igen</button>
                      <button type="button" onClick={() => { setReanalyzeState('idle'); setReanalyzeSuggestions(null); setPendingReanalyzeBackendData(null); }} style={{ flex: 1, padding: '5px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 11, cursor: 'pointer' }}>Stäng</button>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>Sparas med konceptet nästa gång du klickar Spara.</div>
                  </div>
                );
              })() : null}
            </div>
          ) : null}

          {replicabilityHint ? <div style={{ ...cardStyle, border: '1px solid #e5e4e1', boxShadow: 'none', overflow: 'hidden' }}><button type="button" onClick={() => setShowHint((current) => !current)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, fontWeight: 600 }}><span>Analysanteckning</span><span>{showHint ? '▲' : '▼'}</span></button>{showHint ? <div style={{ padding: '0 14px 14px', fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{replicabilityHint}</div> : null}</div> : null}
          {raw && hasSigmaSignals(raw.backend_data) ? (() => {
            const sigma = getSigma(raw.backend_data);
            const cc = sigma.content_classification;
            const rd = sigma.replicability_decomposed;
            const nf = sigma.narrative_flow;
            const pe = sigma.performer_execution;
            const ha = sigma.hook_analysis;
            const pa = sigma.payoff_analysis;
            const pp = sigma.production_polish;
            const rows: Array<{ label: string; value: string }> = [];
            if (cc?.content_type) rows.push({ label: 'Innehållstyp', value: sigmaLabel(cc.content_type) });
            if (cc?.strata_id) rows.push({ label: 'Strata', value: sigmaLabel(cc.strata_id) });
            if (cc?.service_relevance) rows.push({ label: 'Hospitality-relevans', value: sigmaLabel(cc.service_relevance) });
            if (rd?.actor_requirements?.count) rows.push({ label: 'Skådespelare', value: sigmaLabel(rd.actor_requirements.count) });
            if (rd?.actor_requirements?.skill_level) rows.push({ label: 'Skicklighet', value: sigmaLabel(rd.actor_requirements.skill_level) });
            if (rd?.environment_requirements?.backdrop_interchangeability) rows.push({ label: 'Miljökrav', value: sigmaLabel(rd.environment_requirements.backdrop_interchangeability) });
            if (rd?.environment_requirements?.setup_complexity) rows.push({ label: 'Setup', value: sigmaLabel(rd.environment_requirements.setup_complexity) });
            if (rd?.environment_requirements?.prop_dependency?.level) rows.push({ label: 'Rekvisita', value: sigmaLabel(rd.environment_requirements.prop_dependency.level) });
            if (rd?.production_requirements?.editing_skill) rows.push({ label: 'Redigering', value: sigmaLabel(rd.production_requirements.editing_skill) });
            if (rd?.production_requirements?.estimated_time) rows.push({ label: 'Tidsåtgång', value: sigmaLabel(rd.production_requirements.estimated_time) });
            if (rd?.one_to_one_copy_feasibility?.score) rows.push({ label: 'Kopierbarhet', value: `${rd.one_to_one_copy_feasibility.score}/3` });
            if (nf?.story_direction) rows.push({ label: 'Berättelse', value: sigmaLabel(nf.story_direction) });
            if (nf?.coherence_score) rows.push({ label: 'Koherens', value: `${nf.coherence_score}/5` });
            if (ha?.hook_style) rows.push({ label: 'Hook-stil', value: sigmaLabel(ha.hook_style) });
            if (pa?.payoff_type) rows.push({ label: 'Payoff-typ', value: sigmaLabel(pa.payoff_type) });
            if (pa?.substance_level?.memorability) rows.push({ label: 'Minnesvärt', value: `${pa.substance_level.memorability}/5` });
            if (pp?.polish_composite?.score) rows.push({ label: 'Polish', value: `${pp.polish_composite.score}/5` });
            if (pp?.pacing_feel) rows.push({ label: 'Tempo', value: sigmaLabel(pp.pacing_feel) });
            if (pe?.performance_dependency) rows.push({ label: 'Beroende av leverans', value: sigmaLabel(pe.performance_dependency) });
            if (rows.length === 0) return null;
            return (
              <div style={{ ...cardStyle, padding: '12px 14px', border: '1px solid #e0e7ff' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>σTaste-signaler</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{sigma.schema_version ?? 'v1.1-sigma'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                  {rows.map((row) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#6b7280' }}>{row.label}</span>
                      <span style={{ color: '#111827', fontWeight: 600, textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                {cc?.classification_reasoning ? (
                  <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#eef2ff', fontSize: 11, color: '#4338ca', lineHeight: 1.5 }}>
                    {cc.classification_reasoning}
                  </div>
                ) : null}
              </div>
            );
          })() : null}
        </div>

        <div>
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Manus / transkript</div><div style={{ fontSize: 12, color: '#6b7280' }}>Den har texten sparas som <code>script_sv</code> och anvands vidare i kundvyn.</div></div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: transcriptLangBadge.bg, color: transcriptLangBadge.color, fontSize: 12, fontWeight: 600 }}>{transcriptLangBadge.label}</span>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: scriptSv.trim() ? '#ecfdf5' : '#f3f4f6', color: scriptSv.trim() ? '#166534' : '#6b7280', fontSize: 12, fontWeight: 600 }}>{scriptStatus}</span>
              </div>
            </div>
            {scriptSv.trim() ? <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: hasManualScriptOverride ? '#eef2ff' : '#fef3c7', color: hasManualScriptOverride ? '#4338ca' : '#92400e', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{hasManualScriptOverride ? 'Detta manus ar redigerat. Du kan aterstalla till AI-/fallbackmanuset vid behov.' : 'Detta ar ett AI-/fallbackmanus. Granska och justera innan publicering.'}</span>{hasManualScriptOverride && suggestedScript ? <button type="button" onClick={() => setScriptSv(suggestedScript)} style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: 0 }}>Aterstall till AI-manus</button> : null}</div> : null}
            <textarea value={scriptSv} onChange={(event) => setScriptSv(event.target.value)} rows={16} placeholder="Manus eller rensat transkript..." style={{ ...textareaBaseStyle, border: '1px solid #c4b5fd', lineHeight: 1.7, fontFamily: 'inherit' }} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#6b7280' }}><span>{scriptStatus}</span><span>{textAreaToList(scriptSv).length} rader · {scriptSv.trim().length} tecken</span></div>
          </div>

          <div style={{ ...cardStyle, padding: 28 }}>
            {!headlineSv && !descriptionSv && !whyItWorksSv && !scriptSv ? <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>Det har konceptet saknar fortfarande svensk, anvandbar metadata. Fyll i titel och manus innan publicering.</div> : null}

            <div style={{ marginBottom: 20 }}>
              <label style={fieldLabelStyle}>Koncepttitel <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={headlineSv} onChange={(event) => setHeadlineSv(event.target.value)} placeholder="Vad heter det har konceptet?" style={{ ...inputBaseStyle, border: `1px solid ${headlineSv ? '#e5e7eb' : '#fca5a5'}` }} />
              <div style={{ marginTop: 4, fontSize: 11, color: counterColor(headlineSv.trim().length, headlineConstraint.minChars, headlineConstraint.maxChars), textAlign: 'right' }}>
                {headlineSv.trim().length} / {headlineConstraint.targetMinChars}–{headlineConstraint.targetMaxChars} tecken (max {headlineConstraint.maxChars})
              </div>
              <RegenerateField conceptId={conceptId} field="headline_sv" currentValue={headlineSv} onPick={setHeadlineSv} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={fieldLabelStyle}>Beskrivning</label>
              <textarea value={descriptionSv} onChange={(event) => setDescriptionSv(event.target.value)} placeholder="Vad handlar konceptet om? 1-2 meningar." rows={3} style={textareaBaseStyle} />
              <div style={{ marginTop: 4, fontSize: 11, color: counterColor(descriptionSv.trim().length, descriptionConstraint.minChars, descriptionConstraint.maxChars), textAlign: 'right' }}>
                {descriptionSv.trim().length} / {descriptionConstraint.targetMinChars}–{descriptionConstraint.targetMaxChars} tecken (max {descriptionConstraint.maxChars})
              </div>
              <RegenerateField conceptId={conceptId} field="description_sv" currentValue={descriptionSv} onPick={setDescriptionSv} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={fieldLabelStyle}>Varfor det funkar</label>
              <textarea value={whyItWorksSv} onChange={(event) => setWhyItWorksSv(event.target.value)} placeholder="Varfor fungerar det har formatet och vad ger det kunden?" rows={5} style={textareaBaseStyle} />
              <div style={{ marginTop: 4, fontSize: 11, color: counterColor(whyItWorksSv.trim().length, whyConstraint.minChars, whyConstraint.maxChars), textAlign: 'right' }}>
                {whyItWorksSv.trim().length} / {whyConstraint.targetMinChars}–{whyConstraint.targetMaxChars} tecken (max {whyConstraint.maxChars})
              </div>
              <RegenerateField conceptId={conceptId} field="whyItWorks_sv" currentValue={whyItWorksSv} onPick={setWhyItWorksSv} />
            </div>

            <details style={{ marginBottom: 20, border: '1px solid #f3f4f6', borderRadius: 8, padding: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>Produktionstips & Varför det passar (valfritt)</summary>
              <div style={{ marginTop: 12 }}>
                <label style={fieldLabelStyle}>Produktionstips</label>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Varje rad blir en punktlista i kundens vy. Skriv korta, handlingsbara steg.</div>
                <textarea value={productionNotesText} onChange={(event) => setProductionNotesText(event.target.value)} placeholder="En rad per steg" rows={5} style={textareaBaseStyle} />
                {getListPreview(productionNotesText).length > 0 ? <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#475569' }}>{getListPreview(productionNotesText).map((item, index) => <div key={`${item}-${index}`}>{index + 1}. {item}</div>)}</div> : null}
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={fieldLabelStyle}>Varfor det passar</label>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Varje rad blir ett argument som CM kan anvanda for att motivera konceptet till kund.</div>
                <textarea value={whyItFitsText} onChange={(event) => setWhyItFitsText(event.target.value)} placeholder="En rad per argument" rows={4} style={textareaBaseStyle} />
                {getListPreview(whyItFitsText).length > 0 ? <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#475569' }}>{getListPreview(whyItFitsText).map((item, index) => <div key={`${item}-${index}`}>{index + 1}. {item}</div>)}</div> : null}
              </div>
            </details>

            <details
              open={showClassification}
              onToggle={(event) => setShowClassification((event.target as HTMLDetailsElement).open)}
              style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20, marginBottom: 20 }}
            >
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                Klassificering {showClassification ? '' : '(satt vid upload — klicka för att ändra)'}
              </summary>
              <div style={{ display: 'grid', gap: 14, marginBottom: 16, marginTop: 12 }}>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Svarighet</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{difficultyOptions.map((option) => <button key={option.key} type="button" onClick={() => setDifficulty(option.key)} style={choiceButton(difficulty === option.key, option.color)}>{option.label}</button>)}</div></div>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Inspelningstid</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{filmTimeGroups.map((option) => <button key={option.key} type="button" onClick={() => setFilmTime(option.value)} style={choiceButton(selectedFilmTimeGroup === option.key, '#6366f1')}>{option.label}</button>)}</div></div>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Antal personer</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{peopleOptions.map((option) => <button key={option.key} type="button" onClick={() => setPeopleNeeded(option.key)} style={{ ...choiceButton(peopleNeeded === option.key, '#111827'), minWidth: 108 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{option.shortLabel}</div><div style={{ marginTop: 2, fontSize: 11, opacity: 0.82 }}>{option.label}</div></button>)}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div><label style={{ ...fieldLabelStyle, fontSize: 12 }}>Marknad</label><select value={market} onChange={(event) => setMarket(event.target.value)} style={{ ...inputBaseStyle, fontSize: 13, padding: '9px 12px' }}>{marketOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                <div><label style={{ ...fieldLabelStyle, fontSize: 12 }}>Manusstatus</label><div style={{ ...inputBaseStyle, fontSize: 13, padding: '9px 12px', background: '#fafaf9', color: scriptSv.trim() ? '#166534' : '#6b7280' }}>{scriptSv.trim() ? 'Med manus' : 'Utan manus'}</div></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Manusläge</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {scriptModeOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setScriptMode(option.key)} style={choiceButton(scriptMode === option.key, '#0f766e')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>
                  Setup <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {setupComplexityOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setSetupComplexity((c) => c === option.key ? null : option.key)} style={choiceButton(setupComplexity === option.key, '#7c3aed')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>
                  Skicklighet <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {skillRequiredOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setSkillRequired((c) => c === option.key ? null : option.key)} style={choiceButton(skillRequired === option.key, '#c2410c')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>
                  Miljö <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {reviewSettingOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setSettingVal((c) => c === option.key ? null : option.key)} style={choiceButton(settingVal === option.key, '#0369a1')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Branschtyper</div>
                  <div style={{ fontSize: 12, color: businessTypes.length >= 5 ? '#92400e' : '#6b7280', fontWeight: 700 }}>{businessTypes.length} av 5 valda</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {businessTypeOptions.map((type) => {
                    const checked = businessTypes.includes(type.key);
                    const limitReached = businessTypes.length >= 5 && !checked;
                    return <button key={type.key} type="button" disabled={limitReached} onClick={() => setBusinessTypes((current) => checked ? current.filter((value) => value !== type.key) : current.length >= 5 ? current : [...current, type.key])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 999, border: `1px solid ${checked ? type.color : '#e5e7eb'}`, background: checked ? `${type.color}14` : '#fff', cursor: limitReached ? 'not-allowed' : 'pointer', fontSize: 13, color: checked ? type.color : '#374151', opacity: limitReached ? 0.45 : 1 }}><span>{type.icon}</span><span>{type.label}</span></button>;
                  })}
                </div>
              </div>
            </details>

            <div style={{ marginBottom: 8, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
              Ändringar här uppdaterar konceptbiblioteket. Befintliga kundkopplingar ändras inte.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
              {saved ? <span style={{ fontSize: 14, color: '#10b981', fontWeight: 500 }}>✓ Sparat!</span> : null}
              <button onClick={() => void handleSave()} disabled={saving || !headlineSv.trim()} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: saving || !headlineSv.trim() ? '#9ca3af' : '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving || !headlineSv.trim() ? 'not-allowed' : 'pointer' }}>{saving ? 'Sparar...' : 'Spara'}</button>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '14px 20px', borderRadius: 10, border: `1px solid ${isActive ? '#a7f3d0' : '#fde68a'}`, background: isActive ? '#ecfdf5' : '#fffbeb', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#065f46' : '#92400e' }}>
                {isActive ? 'Publicerat i biblioteket' : 'Utkast — syns inte for kunder annu'}
              </span>
              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                {isActive ? 'Konceptet är synligt för CMs och kunder.' : 'Granska klart konceptet och tryck Publicera.'}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {checklistItems.map((item) => (
                  <span key={item.label} style={{ padding: '4px 8px', borderRadius: 999, background: item.done ? '#ecfdf5' : '#fef3c7', color: item.done ? '#166534' : '#92400e', fontSize: 12, fontWeight: 600 }}>
                    {item.done ? '✓' : '•'} {item.label}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => void handleTogglePublish(!isActive)}
                disabled={togglingActive || (!isActive && !canPublish)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: togglingActive ? '#9ca3af' : isActive ? '#ef4444' : canPublish ? '#10b981' : '#9ca3af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: togglingActive || (!isActive && !canPublish) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
              >
                {togglingActive ? '...' : isActive ? 'Avpublicera' : 'Publicera'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
