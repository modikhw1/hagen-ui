'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { VideoPlayer } from '@/components/shared/VideoPlayer';
import {
  BUDGET_VALUES,
  BUSINESS_TYPE_VALUES,
  DIFFICULTY_VALUES,
  FILM_TIME_VALUES,
  PEOPLE_VALUES,
} from '@/lib/concept-enrichment';
import { categoryOptions, display } from '@/lib/display';
import { supabase } from '@/lib/supabase/client';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

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
const budgetOptions = BUDGET_VALUES.map((key) => ({ key, label: display.budget(key).label }));
const businessTypeOptions = BUSINESS_TYPE_VALUES.map((key) => ({ key, ...display.businessType(key) }));
const marketOptions = categoryOptions.markets();

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
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  version: number;
}

export default function ConceptReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const conceptId = params?.id as string;

  const [raw, setRaw] = useState<RawConcept | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

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
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  const [replicabilityHint, setReplicabilityHint] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [gcsUri, setGcsUri] = useState<string | null>(null);
  const [suggestedScript, setSuggestedScript] = useState('');
  const [nextUnreviewed, setNextUnreviewed] = useState<{ id: string; headline: string } | null | 'loading'>('loading');
  const [reviewQueueProgress, setReviewQueueProgress] = useState<{ index: number; total: number } | null>(null);

  const loadConcept = useCallback(async () => {
    if (!conceptId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
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
      setReviewedAt(concept.reviewed_at ?? null);
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
      setEstimatedBudget(typeof overrides.estimatedBudget === 'string' ? overrides.estimatedBudget : translated.estimatedBudget);
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

  const fetchNextUnreviewed = useCallback(async () => {
    if (!conceptId) return;
    setNextUnreviewed('loading');
    try {
      const { data } = await supabase
        .from('concepts')
        .select('id, overrides')
        .eq('is_active', false)
        .is('reviewed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!data || data.length === 0) {
        setNextUnreviewed(null);
        setReviewQueueProgress(null);
        return;
      }
      const currentIndex = data.findIndex((row) => row.id === conceptId);
      const nextRow = data.find((row) => row.id !== conceptId) ?? null;
      setReviewQueueProgress(currentIndex >= 0 ? { index: currentIndex + 1, total: data.length } : { index: 0, total: data.length });
      setNextUnreviewed(
        nextRow
          ? { id: nextRow.id as string, headline: ((nextRow.overrides as Record<string, unknown>)?.headline_sv as string) || '(Inget namn)' }
          : null,
      );
    } catch {
      setNextUnreviewed(null);
      setReviewQueueProgress(null);
    }
  }, [conceptId]);

  useEffect(() => {
    void loadConcept();
    void fetchNextUnreviewed();
  }, [fetchNextUnreviewed, loadConcept]);

  const handleSave = useCallback(async () => {
    if (!raw || !headlineSv.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const canStayReviewed = Boolean(headlineSv.trim())
        && Boolean(scriptSv.trim())
        && Boolean(difficulty && filmTime && peopleNeeded && businessTypes.length > 0)
        && textAreaToList(productionNotesText).length > 0;
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
        estimatedBudget,
        businessTypes,
        hasScript: Boolean(scriptSv.trim()),
      };
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          overrides: newOverrides,
          reviewed: reviewedAt ? canStayReviewed : undefined,
          change_summary: 'Granskad i Studio',
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Sparning misslyckades');
      }
      const payload = await resp.json();
      setRaw(payload.concept as RawConcept);
      setReviewedAt((payload.concept as RawConcept).reviewed_at ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setSaving(false);
    }
  }, [businessTypes, conceptId, descriptionSv, difficulty, estimatedBudget, filmTime, headlineSv, market, peopleNeeded, productionNotesText, raw, reviewedAt, scriptSv, whyItFitsText, whyItWorksSv]);

  const handleSetReviewed = useCallback(async (reviewed: boolean) => {
    const canReview = Boolean(headlineSv.trim())
      && Boolean(scriptSv.trim())
      && Boolean(difficulty && filmTime && peopleNeeded && businessTypes.length > 0)
      && textAreaToList(productionNotesText).length > 0;

    if (reviewed && !canReview) {
      alert('Fyll i checklistan innan du markerar konceptet som review-klart.');
      return;
    }

    setTogglingActive(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ reviewed }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Misslyckades');
      }
      const payload = await resp.json();
      setRaw(payload.concept as RawConcept);
      setReviewedAt((payload.concept as RawConcept).reviewed_at ?? null);
      if (!reviewed) {
        setIsActive(false);
      }
      void fetchNextUnreviewed();
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setTogglingActive(false);
    }
  }, [businessTypes.length, conceptId, difficulty, fetchNextUnreviewed, filmTime, headlineSv, peopleNeeded, productionNotesText, scriptSv]);

  const handleToggleActive = useCallback(async (activate: boolean) => {
    const publishReady = Boolean(headlineSv.trim()) && Boolean(scriptSv.trim()) && Boolean(difficulty && filmTime && peopleNeeded && businessTypes.length > 0) && textAreaToList(productionNotesText).length > 0;
    if (activate && !publishReady) {
      alert('Fyll i checklistan innan publicering.');
      return;
    }
    if (activate && !reviewedAt) {
      alert('Markera konceptet som review-klart innan publicering.');
      return;
    }
    setTogglingActive(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ is_active: activate, reviewed: activate ? true : undefined }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Misslyckades');
      }
      const payload = await resp.json();
      setRaw(payload.concept as RawConcept);
      setIsActive(activate);
      setReviewedAt((payload.concept as RawConcept).reviewed_at ?? reviewedAt ?? null);
      void fetchNextUnreviewed();
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okant fel'}`);
    } finally {
      setTogglingActive(false);
    }
  }, [businessTypes.length, conceptId, difficulty, fetchNextUnreviewed, filmTime, headlineSv, peopleNeeded, productionNotesText, reviewedAt, scriptSv]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      } else if (event.key === 'Enter' && !isActive) {
        event.preventDefault();
        if (reviewedAt) {
          void handleToggleActive(true);
        } else {
          void handleSetReviewed(true);
        }
      } else if (event.key === 'ArrowRight' && nextUnreviewed && nextUnreviewed !== 'loading') {
        event.preventDefault();
        router.push(`/studio/concepts/${nextUnreviewed.id}/review`);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleSetReviewed, handleToggleActive, isActive, nextUnreviewed, reviewedAt, router]);

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
    { label: 'Produktionstips', done: textAreaToList(productionNotesText).length > 0 },
  ];
  const canReview = checklistItems.every((item) => item.done);
  const isReviewed = Boolean(reviewedAt);
  const canPublish = canReview && isReviewed;
  const reviewStage = isActive ? 'Published' : isReviewed ? 'Reviewed' : 'Draft';
  const reviewQueueLabel = reviewQueueProgress
    ? reviewQueueProgress.index > 0
      ? `${reviewQueueProgress.index} av ${reviewQueueProgress.total} ogranskade`
      : `${reviewQueueProgress.total} ogranskade i ko`
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

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link href="/studio/concepts" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}>← Tillbaka till biblioteket</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Granska koncept</h1>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: isActive ? '#dcfce7' : isReviewed ? '#dbeafe' : '#fef3c7', color: isActive ? '#166534' : isReviewed ? '#1d4ed8' : '#92400e', fontSize: 12, fontWeight: 700 }}>{reviewStage}</span>
            {reviewQueueLabel ? <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{reviewQueueLabel}</span> : null}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{displayName}&nbsp;&middot;&nbsp;ID: {raw.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, color: '#6b7280' }}>Cmd/Ctrl+S spara · Cmd/Ctrl+Enter publicera · Cmd/Ctrl+→ nasta</div>
          {nextUnreviewed && nextUnreviewed !== 'loading' ? <Link href={`/studio/concepts/${nextUnreviewed.id}/review`} style={{ display: 'inline-flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}><span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextUnreviewed.headline}</span><span>Nasta ogranskade →</span></Link> : <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Inga fler ogranskade koncept</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(sourceUrl || gcsUri) ? <div><div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#065f46' : isReviewed ? '#1d4ed8' : '#92400e', marginBottom: 6 }}>Status: {reviewStage}</div><VideoPlayer videoUrl={sourceUrl ?? undefined} gcsUri={gcsUri ?? undefined} showLabel={false} /><div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>{sourceUrl ? <span style={{ fontSize: 11, color: '#9ca3af' }}>{detectPlatform(sourceUrl) ?? 'Kallvideo'}</span> : null}{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4f46e5', textDecoration: 'none' }}>Oppna video →</a> : null}</div></div> : null}
          {replicabilityHint ? <div style={{ ...cardStyle, border: '1px solid #e5e4e1', boxShadow: 'none', overflow: 'hidden' }}><button type="button" onClick={() => setShowHint((current) => !current)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, fontWeight: 600 }}><span>Analysanteckning</span><span>{showHint ? '▲' : '▼'}</span></button>{showHint ? <div style={{ padding: '0 14px 14px', fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{replicabilityHint}</div> : null}</div> : null}
        </div>

        <div>
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Manus / transkript</div><div style={{ fontSize: 12, color: '#6b7280' }}>Den har texten sparas som <code>script_sv</code> och anvands vidare i kundvyn.</div></div>
              <span style={{ padding: '4px 10px', borderRadius: 999, background: scriptSv.trim() ? '#ecfdf5' : '#f3f4f6', color: scriptSv.trim() ? '#166534' : '#6b7280', fontSize: 12, fontWeight: 600 }}>{scriptStatus}</span>
            </div>
            {scriptSv.trim() ? <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: hasManualScriptOverride ? '#eef2ff' : '#fef3c7', color: hasManualScriptOverride ? '#4338ca' : '#92400e', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{hasManualScriptOverride ? 'Detta manus ar redigerat. Du kan aterstalla till AI-/fallbackmanuset vid behov.' : 'Detta ar ett AI-/fallbackmanus. Granska och justera innan publicering.'}</span>{hasManualScriptOverride && suggestedScript ? <button type="button" onClick={() => setScriptSv(suggestedScript)} style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: 0 }}>Aterstall till AI-manus</button> : null}</div> : null}
            <textarea value={scriptSv} onChange={(event) => setScriptSv(event.target.value)} rows={16} placeholder="Manus eller rensat transkript..." style={{ ...textareaBaseStyle, border: '1px solid #c4b5fd', lineHeight: 1.7, fontFamily: 'inherit' }} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#6b7280' }}><span>{scriptStatus}</span><span>{textAreaToList(scriptSv).length} rader · {scriptSv.trim().length} tecken</span></div>
          </div>

          <div style={{ ...cardStyle, padding: 28 }}>
            {!headlineSv && !descriptionSv && !whyItWorksSv && !scriptSv ? <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>Det har konceptet saknar fortfarande svensk, anvandbar metadata. Fyll i titel och manus innan publicering.</div> : null}
            <div style={{ marginBottom: 20 }}><label style={fieldLabelStyle}>Koncepttitel <span style={{ color: '#ef4444' }}>*</span></label><input type="text" value={headlineSv} onChange={(event) => setHeadlineSv(event.target.value)} placeholder="Vad heter det har konceptet?" style={{ ...inputBaseStyle, border: `1px solid ${headlineSv ? '#e5e7eb' : '#fca5a5'}` }} /></div>
            <div style={{ marginBottom: 20 }}><label style={fieldLabelStyle}>Beskrivning</label><textarea value={descriptionSv} onChange={(event) => setDescriptionSv(event.target.value)} placeholder="Vad handlar konceptet om? 1-2 meningar." rows={3} style={textareaBaseStyle} /></div>
            <div style={{ marginBottom: 20 }}><label style={fieldLabelStyle}>Varfor det funkar</label><textarea value={whyItWorksSv} onChange={(event) => setWhyItWorksSv(event.target.value)} placeholder="Varfor fungerar det har formatet och vad ger det kunden?" rows={5} style={textareaBaseStyle} /></div>
            <div style={{ marginBottom: 20 }}><label style={fieldLabelStyle}>Produktionstips</label><div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Varje rad blir en punktlista i kundens vy. Skriv korta, handlingsbara steg.</div><textarea value={productionNotesText} onChange={(event) => setProductionNotesText(event.target.value)} placeholder="En rad per steg" rows={5} style={textareaBaseStyle} />{getListPreview(productionNotesText).length > 0 ? <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#475569' }}>{getListPreview(productionNotesText).map((item, index) => <div key={`${item}-${index}`}>{index + 1}. {item}</div>)}</div> : null}</div>
            <div style={{ marginBottom: 28 }}><label style={fieldLabelStyle}>Varfor det passar</label><div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Varje rad blir ett argument som CM kan anvanda for att motivera konceptet till kund.</div><textarea value={whyItFitsText} onChange={(event) => setWhyItFitsText(event.target.value)} placeholder="En rad per argument" rows={4} style={textareaBaseStyle} />{getListPreview(whyItFitsText).length > 0 ? <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#475569' }}>{getListPreview(whyItFitsText).map((item, index) => <div key={`${item}-${index}`}>{index + 1}. {item}</div>)}</div> : null}</div>

            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Klassificering</div>
              <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Svarighet</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{difficultyOptions.map((option) => <button key={option.key} type="button" onClick={() => setDifficulty(option.key)} style={choiceButton(difficulty === option.key, option.color)}>{option.label}</button>)}</div></div>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Inspelningstid</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{filmTimeGroups.map((option) => <button key={option.key} type="button" onClick={() => setFilmTime(option.value)} style={choiceButton(selectedFilmTimeGroup === option.key, '#6366f1')}>{option.label}</button>)}</div></div>
                <div><label style={{ ...fieldLabelStyle, marginBottom: 8, fontSize: 12 }}>Antal personer</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{peopleOptions.map((option) => <button key={option.key} type="button" onClick={() => setPeopleNeeded(option.key)} style={{ ...choiceButton(peopleNeeded === option.key, '#111827'), minWidth: 108 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{option.shortLabel}</div><div style={{ marginTop: 2, fontSize: 11, opacity: 0.82 }}>{option.label}</div></button>)}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div><label style={{ ...fieldLabelStyle, fontSize: 12 }}>Marknad</label><select value={market} onChange={(event) => setMarket(event.target.value)} style={{ ...inputBaseStyle, fontSize: 13, padding: '9px 12px' }}>{marketOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                <div><label style={{ ...fieldLabelStyle, fontSize: 12 }}>Budget</label><select value={estimatedBudget} onChange={(event) => setEstimatedBudget(event.target.value)} style={{ ...inputBaseStyle, fontSize: 13, padding: '9px 12px' }}>{budgetOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                <div><label style={{ ...fieldLabelStyle, fontSize: 12 }}>Manusstatus</label><div style={{ ...inputBaseStyle, fontSize: 13, padding: '9px 12px', background: '#fafaf9', color: scriptSv.trim() ? '#166534' : '#6b7280' }}>{scriptSv.trim() ? 'Med manus' : 'Utan manus'}</div></div>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Branschtyper</div>
                <div style={{ fontSize: 12, color: businessTypes.length >= 3 ? '#92400e' : '#6b7280', fontWeight: 700 }}>{businessTypes.length} av 3 valda</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {businessTypeOptions.map((type) => {
                  const checked = businessTypes.includes(type.key);
                  const limitReached = businessTypes.length >= 3 && !checked;
                  return <button key={type.key} type="button" disabled={limitReached} onClick={() => setBusinessTypes((current) => checked ? current.filter((value) => value !== type.key) : current.length >= 3 ? current : [...current, type.key])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 999, border: `1px solid ${checked ? type.color : '#e5e7eb'}`, background: checked ? `${type.color}14` : '#fff', cursor: limitReached ? 'not-allowed' : 'pointer', fontSize: 13, color: checked ? type.color : '#374151', opacity: limitReached ? 0.45 : 1 }}><span>{type.icon}</span><span>{type.label}</span></button>;
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
              {saved ? <span style={{ fontSize: 14, color: '#10b981', fontWeight: 500 }}>✓ Sparat!</span> : null}
              <button onClick={() => void handleSave()} disabled={saving || !headlineSv.trim()} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: saving || !headlineSv.trim() ? '#9ca3af' : '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving || !headlineSv.trim() ? 'not-allowed' : 'pointer' }}>{saving ? 'Sparar...' : 'Spara'}</button>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '14px 20px', borderRadius: 10, border: `1px solid ${isActive ? '#a7f3d0' : isReviewed ? '#bfdbfe' : '#fde68a'}`, background: isActive ? '#ecfdf5' : isReviewed ? '#eff6ff' : '#fffbeb', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#065f46' : isReviewed ? '#1d4ed8' : '#92400e' }}>{isActive ? 'Publicerat i biblioteket' : isReviewed ? 'Review-klart men inte publicerat' : 'Ej publicerat - syns inte for kunder annu'}</span>
              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                {isReviewed ? `Markerat som review-klart ${reviewedAt ? new Date(reviewedAt).toLocaleString('sv-SE') : ''}` : 'Granska klart konceptet innan publicering.'}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{checklistItems.map((item) => <span key={item.label} style={{ padding: '4px 8px', borderRadius: 999, background: item.done ? '#ecfdf5' : '#fef3c7', color: item.done ? '#166534' : '#92400e', fontSize: 12, fontWeight: 600 }}>{item.done ? '✓' : '•'} {item.label}</span>)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {!isActive && isReviewed ? <button onClick={() => void handleSetReviewed(false)} disabled={togglingActive} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: togglingActive ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>Aterga till draft</button> : null}
              {!isActive && !isReviewed ? <button onClick={() => void handleSetReviewed(true)} disabled={togglingActive || !canReview} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: togglingActive ? '#9ca3af' : canReview ? '#2563eb' : '#9ca3af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: togglingActive || !canReview ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>{togglingActive ? '...' : canReview ? 'Markera som review-klar' : 'Komplettera'}</button> : null}
              <button onClick={() => void handleToggleActive(!isActive)} disabled={togglingActive || (!isActive && !canPublish)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: togglingActive ? '#9ca3af' : isActive ? '#ef4444' : canPublish ? '#10b981' : '#9ca3af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: togglingActive || (!isActive && !canPublish) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>{togglingActive ? '...' : isActive ? 'Avpublicera' : 'Publicera'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
