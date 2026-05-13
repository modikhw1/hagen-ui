'use client';

import { useEffect, useState } from 'react';
import {
  LeTrendColors,
  LeTrendRadius,
  LeTrendShadows,
  LeTrendTypography,
  buttonStyle,
  inputStyle,
} from '@/styles/letrend-design-system';
import {
  BUSINESS_TYPE_VALUES,
  DIFFICULTY_VALUES,
  FILM_TIME_VALUES,
  PEOPLE_VALUES,
} from '@/lib/concept-enrichment';
import { categoryOptions, display } from '@/lib/display';
import { getSigma, readScriptMode, readSetupComplexity, readSkillRequired, readSetting, translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride, ScriptMode, SigmaBackdrop, SigmaSetupComplexity, SigmaSkillLevel } from '@/lib/translator';

interface UploadConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conceptId: string, meta: { assignedTo: string | null }) => void;
  // preSelectedCustomerId: future task — pass customer id when opened from Kundarbete
}

interface CustomerOption {
  id: string;
  business_name: string | null;
  tiktok_handle: string | null;
}

type JsonRecord = Record<string, unknown>;

type UploadStep = 'idle' | 'analyzing' | 'enriching' | 'classifying' | 'assigning' | 'saving';

const STEPS: Array<{ key: Exclude<UploadStep, 'idle'>; label: string }> = [
  { key: 'analyzing', label: 'Laddar upp & analyserar' },
  { key: 'enriching', label: 'Förädlar' },
  { key: 'classifying', label: 'Klassificera' },
  { key: 'assigning', label: 'Tilldela' },
  { key: 'saving', label: 'Sparar' },
];

const difficultyOptions = DIFFICULTY_VALUES.map((key) => ({ key, ...display.difficulty(key) }));
const filmTimeGroups = FILM_TIME_VALUES.reduce<Array<{ key: string; label: string; value: string }>>((groups, value) => {
  const range = display.filmTimeRange(value);
  if (!groups.some((group) => group.key === range.key)) groups.push({ key: range.key, label: range.label, value });
  return groups;
}, []);
const peopleOptions = PEOPLE_VALUES.map((key) => ({ key, label: display.peopleNeeded(key).label, shortLabel: display.peopleNeededShort(key) }));
const businessTypeOptions = BUSINESS_TYPE_VALUES.map((key) => ({ key, ...display.businessType(key) }));
const marketOptions = categoryOptions.markets();

const scriptModeOptions: Array<{ key: ScriptMode; label: string }> = [
  { key: 'none', label: 'Inget manus' },
  { key: 'text_overlay', label: 'Textoverlay' },
  { key: 'short_dialogue', label: 'Kort dialog' },
  { key: 'long_dialogue', label: 'Lång dialog' },
  { key: 'visual_only', label: 'Visuellt' },
];

const setupComplexityOptions: Array<{ key: SigmaSetupComplexity; label: string }> = [
  { key: 'point_and_shoot', label: 'Point-and-shoot' },
  { key: 'basic_tripod', label: 'Stativ' },
  { key: 'multi_location', label: 'Flera platser' },
  { key: 'elaborate_staging', label: 'Scenografi' },
];

const skillRequiredOptions: Array<{ key: SigmaSkillLevel; label: string }> = [
  { key: 'anyone', label: 'Vem som helst' },
  { key: 'comfortable_on_camera', label: 'Kameravant' },
  { key: 'acting_required', label: 'Skådespel' },
  { key: 'professional', label: 'Professionell' },
];

const settingOptions: Array<{ key: SigmaBackdrop; label: string }> = [
  { key: 'any_venue', label: 'Valfri lokal' },
  { key: 'similar_venue_type', label: 'Liknande lokal' },
  { key: 'specific_setting_needed', label: 'Specifik miljö' },
];

function detectPlatform(url: string): { key: string; label: string; color: string } {
  const normalized = url.toLowerCase();
  if (normalized.includes('instagram')) return { key: 'instagram', label: 'Instagram', color: '#C13584' };
  if (normalized.includes('youtube') || normalized.includes('youtu.be')) return { key: 'youtube', label: 'YouTube', color: '#FF0000' };
  return { key: 'tiktok', label: 'TikTok', color: '#1A1612' };
}

async function readJsonResponse(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    retryAfterSeconds?: number;
    stage?: string;
    upload?: { gcsUri?: string };
    analysis?: JsonRecord;
    overrides?: Record<string, unknown>;
    concept?: { id?: string };
    ingest_run?: { id?: string };
  };
}

function getNestedRecord(record: JsonRecord, path: string[]) {
  let current: unknown = record;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) return null;
    current = (current as JsonRecord)[segment];
  }
  return current && typeof current === 'object' ? (current as JsonRecord) : null;
}

function getFirstString(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        current = null;
        break;
      }
      current = (current as JsonRecord)[segment];
    }
    if (typeof current === 'string' && current.trim()) return current.trim();
  }
  return '';
}

function slugFromVideo(videoUrl: string, fallback: string) {
  const urlSegments = videoUrl.split('/').filter(Boolean);
  return (
    urlSegments[urlSegments.length - 1]?.replace(/[^a-zA-Z0-9_-]/g, '') ||
    fallback.replace(/[^a-zA-Z0-9_-]/g, '') ||
    Date.now().toString()
  );
}

interface ClassificationDraft {
  difficulty: string;
  filmTime: string;
  market: string;
  peopleNeeded: string;
  businessTypes: string[];
  script_mode: ScriptMode;
  setup_complexity: SigmaSetupComplexity | null;
  skill_required: SigmaSkillLevel | null;
  setting: SigmaBackdrop | null;
}

export function UploadConceptModal({ isOpen, onClose, onSuccess }: UploadConceptModalProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'url' | 'classify' | 'assign'>('url');

  // Held while the user finishes step-2 classification.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingHeadline, setPendingHeadline] = useState<string>('');
  const [pendingBackend, setPendingBackend] = useState<BackendClip | null>(null);
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, unknown>>({});
  const [classification, setClassification] = useState<ClassificationDraft | null>(null);
  // Captured during analyze — used for the async v7.B humor enrichment pass.
  const [analyzedGcsUri, setAnalyzedGcsUri] = useState<string | null>(null);
  // Ingest run tracking — created before analyze, forwarded to all subsequent steps.
  const [ingestRunId, setIngestRunId] = useState<string | null>(null);

  // Phase 72: customer assignment state
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  // Phase 79: AI-utkast card collapsed by default
  const [showAiDraft, setShowAiDraft] = useState(false);

  // ALL hooks must run before any conditional return (Rules of Hooks).
  // This effect guards itself with the phase check — safe when isOpen=false
  // because phase will be 'url' (initial/reset state) in that case.
  useEffect(() => {
    if (phase !== 'assign') return;
    let cancelled = false;
    setLoadingCustomers(true);
    fetch('/api/studio-v2/customers')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data.customers ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          business_name: (c.business_name as string) || null,
          tiktok_handle: (c.tiktok_handle as string) || null,
        }));
        setCustomers(list);
      })
      .catch(() => { if (!cancelled) setCustomers([]); })
      .finally(() => { if (!cancelled) setLoadingCustomers(false); });
    return () => { cancelled = true; };
  }, [phase]);

  // Early return AFTER all hooks — opening/closing the modal will not change
  // hook call count, preventing React's hook-order runtime error.
  if (!isOpen) return null;

  // Derived values — not hooks, placed after early return so they are only
  // computed when the modal is actually open.
  const platform = videoUrl.trim() ? detectPlatform(videoUrl) : null;
  const busy = step !== 'idle';
  const stepIndex = STEPS.findIndex((currentStep) => currentStep.key === step);
  // Phase 79: scene count read-only display (positive only)
  const sceneCount = (pendingBackend?.scene_breakdown as unknown[] | undefined)?.length ?? 0;

  const reset = () => {
    setVideoUrl('');
    setStep('idle');
    setError(null);
    setPhase('url');
    setPendingId(null);
    setPendingBackend(null);
    setPendingOverrides({});
    setClassification(null);
    setPendingHeadline('');
    setAnalyzedGcsUri(null);
    setIngestRunId(null);
    setCustomers([]);
    setCustomerSearch('');
    setSelectedCustomerId(null);
    setAssignError(null);
    setShowAiDraft(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleAnalyze = async () => {
    if (!videoUrl.trim() || busy) return;
    setError(null);

    try {
      setStep('analyzing');

      // Create a persistent ingest run before the slow analyze call so we can
      // track status/stage regardless of whether the user stays on this screen.
      let runId: string | null = null;
      try {
        const runRes = await fetch('/api/studio/ingest-runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_url: videoUrl, platform: platform?.key }),
        });
        if (runRes.ok) {
          const runData = await readJsonResponse(runRes);
          runId = runData.ingest_run?.id ?? null;
          if (runId) setIngestRunId(runId);
        }
      } catch {
        // Non-fatal — ingest run creation failure must not block upload
      }

      const analyzeRes = await fetch('/api/studio/concepts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          platform: platform?.key,
          ingest_run_id: runId,
        }),
      });
      const analyzePayload = await readJsonResponse(analyzeRes);
      if (analyzeRes.status === 429) {
        const retryAfter = analyzePayload.retryAfterSeconds as number | undefined;
        const retryMsg = retryAfter ? ` Försök igen om ${retryAfter} sekunder.` : ' Försök igen om en stund.';
        throw new Error(
          analyzePayload.error ||
            `För många analyser på kort tid. Du kan ladda upp max 5 videor per minut.${retryMsg}`,
        );
      }
      if (!analyzeRes.ok) throw new Error(analyzePayload.error || 'Upload eller analys misslyckades');

      const analyzeEnvelope = analyzePayload.analysis;
      if (!analyzeEnvelope) throw new Error('Analysen returnerade inget resultat.');

      const analyzeData = getNestedRecord(analyzeEnvelope, ['analysis']) || analyzeEnvelope;
      const gcsUri =
        typeof analyzePayload.upload?.gcsUri === 'string' && analyzePayload.upload.gcsUri.trim()
          ? analyzePayload.upload.gcsUri.trim()
          : undefined;

      // Capture gcsUri so the async humor-enrich pass can use it after save.
      setAnalyzedGcsUri(gcsUri ?? null);

      const baseId = getFirstString(analyzeData, [['videoId'], ['id']]);
      const conceptId = `clip-${slugFromVideo(videoUrl, baseId)}`;
      const backendData = {
        ...analyzeData,
        id: conceptId,
        url: videoUrl,
        source_url: videoUrl,
        platform: platform?.key,
        ...(gcsUri ? { gcs_uri: gcsUri } : {}),
      } as BackendClip;

      setStep('enriching');
      const enrichRes = await fetch('/api/studio/concepts/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backend_data: backendData,
          ingest_run_id: runId,
        }),
      });
      const enrichPayload = await readJsonResponse(enrichRes);
      if (!enrichRes.ok) throw new Error(enrichPayload.error || 'Kunde inte förädla konceptet');

      const fallbackHeadline =
        getFirstString(analyzeData, [
          ['script', 'conceptCore'],
          ['content', 'topic'],
          ['content', 'keyMessage'],
          ['visual_analysis', 'content', 'headline'],
          ['visual_analysis', 'content', 'conceptCore'],
          ['visual_analysis', 'content', 'keyMessage'],
        ]) || 'Nytt koncept';

      const overrides = {
        headline_sv: fallbackHeadline,
        ...enrichPayload.overrides,
      };

      // Translate so we can prefill classification step from heuristics
      const translated = translateClipToConcept(backendData);
      const sigma = getSigma(backendData);
      const rd = sigma.replicability_decomposed;
      setPendingId(conceptId);
      setPendingHeadline((overrides.headline_sv as string) || translated.headline_sv || 'Nytt koncept');
      setPendingBackend(backendData);
      setPendingOverrides(overrides);
      setClassification({
        difficulty: translated.difficulty,
        filmTime: translated.filmTime,
        market: translated.market === 'global' ? 'US' : translated.market,
        peopleNeeded: translated.peopleNeeded,
        businessTypes: translated.businessTypes.slice(0, 5),
        script_mode: readScriptMode(backendData, overrides as ClipOverride),
        setup_complexity: readSetupComplexity(backendData, overrides as ClipOverride),
        skill_required: readSkillRequired(backendData, overrides as ClipOverride),
        setting: readSetting(backendData, overrides as ClipOverride),
      });
      setPhase('classify');
      setStep('classifying');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nagot gick fel';
      setError(
        message.toLowerCase().includes('tog for lang tid')
          ? `${message} Forsok igen med samma URL eller prova igen om en stund.`
          : message,
      );
      setStep('idle');
    }
  };

  const handleProceedToAssign = () => {
    if (!classification || classification.businessTypes.length === 0) return;
    setPhase('assign');
    setStep('assigning');
  };

  const buildOverrides = () => {
    if (!classification) return pendingOverrides;
    return {
      ...pendingOverrides,
      difficulty: classification.difficulty,
      filmTime: classification.filmTime,
      market: classification.market,
      peopleNeeded: classification.peopleNeeded,
      businessTypes: classification.businessTypes,
      script_mode: classification.script_mode,
      ...(classification.setup_complexity ? { setup_complexity: classification.setup_complexity } : {}),
      ...(classification.skill_required ? { skill_required: classification.skill_required } : {}),
      ...(classification.setting ? { setting: classification.setting } : {}),
    };
  };

  const saveConceptToLibrary = async (): Promise<string> => {
    const overrides = buildOverrides();
    const saveRes = await fetch('/api/admin/concepts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pendingId,
        backend_data: pendingBackend,
        overrides,
        is_active: true,
        ingest_run_id: ingestRunId,
      }),
    });
    const saveData = await readJsonResponse(saveRes);
    if (!saveRes.ok) throw new Error(saveData.error || 'Kunde inte spara konceptet');
    const id = saveData.concept?.id || pendingId!;

    // Fire v7.B humor enrichment as fire-and-forget background request.
    const scriptHumor = (pendingBackend?.script as Record<string, unknown> | undefined)?.['humor'] as Record<string, unknown> | undefined;
    const isHumorous = scriptHumor?.['isHumorous'] === true;
    if (isHumorous && analyzedGcsUri) {
      fetch('/api/studio/concepts/humor-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          gcsUri: analyzedGcsUri,
          ingest_run_id: ingestRunId,
        }),
      }).catch(() => {});
    }

    return id;
  };

  const handleSaveToLibrary = async () => {
    if (!pendingId || !pendingBackend || !classification) return;
    setError(null);
    setAssignError(null);
    setStep('saving');
    try {
      const id = await saveConceptToLibrary();
      reset();
      onSuccess(id, { assignedTo: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nagot gick fel';
      setError(message);
      setStep('assigning');
    }
  };

  const handleSaveAndAssign = async () => {
    if (!pendingId || !pendingBackend || !classification || !selectedCustomerId) return;
    setError(null);
    setAssignError(null);
    setStep('saving');
    try {
      const id = await saveConceptToLibrary();

      const assignRes = await fetch(`/api/studio-v2/customers/${selectedCustomerId}/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // feed_order: null → lands in "Nästa att göra" (unscheduled), not at position 1
        body: JSON.stringify({ concept_id: id, feed_order: null, ingest_run_id: ingestRunId }),
      });
      if (!assignRes.ok) {
        const assignData = await assignRes.json().catch(() => ({}));
        throw new Error((assignData as { error?: string }).error || 'Kunde inte tilldela koncept till kund');
      }

      reset();
      onSuccess(id, { assignedTo: selectedCustomerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nagot gick fel';
      setAssignError(message);
      setStep('assigning');
    }
  };

  const selectedFilmTimeGroup = classification?.filmTime ? display.filmTimeRange(classification.filmTime).key : '';
  const choiceButton = (active: boolean, baseColor = '#111827') => ({
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${active ? baseColor : '#e5e7eb'}`,
    background: active ? `${baseColor}18` : '#fff',
    color: active ? baseColor : '#374151',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 24 }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: '100%', maxWidth: (phase === 'classify' || phase === 'assign') ? 640 : 480, background: '#fff', borderRadius: LeTrendRadius.xl, boxShadow: LeTrendShadows.xl, padding: 28, fontFamily: LeTrendTypography.fontFamily.body, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: LeTrendTypography.fontSize['3xl'], fontWeight: LeTrendTypography.fontWeight.bold, color: LeTrendColors.textPrimary, fontFamily: LeTrendTypography.fontFamily.heading }}>
              {phase === 'assign' ? 'Tilldela koncept' : phase === 'classify' ? 'Klassificera koncept' : 'Nytt koncept'}
            </h3>
            <p style={{ margin: '6px 0 0', color: LeTrendColors.textMuted, fontSize: LeTrendTypography.fontSize.sm }}>
              {phase === 'assign'
                ? `Välj en kund för "${pendingHeadline}" eller spara till biblioteket.`
                : phase === 'classify'
                  ? `Slutför klassificeringen av "${pendingHeadline}" innan du sparar.`
                  : 'Klistra in en video-URL för att ladda upp och analysera.'}
            </p>
          </div>
          <button onClick={handleClose} disabled={busy && phase !== 'classify'} aria-label="Stang" style={{ border: 'none', background: 'none', color: LeTrendColors.textMuted, cursor: (busy && phase !== 'classify') ? 'not-allowed' : 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>
            x
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {STEPS.map((currentStep, index) => {
            const isActive = currentStep.key === step;
            const isDone = stepIndex > index;
            return (
              <div key={currentStep.key} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 999, background: isDone ? LeTrendColors.success : isActive ? LeTrendColors.brownLight : LeTrendColors.surfaceLight, marginBottom: 6 }} />
                <div style={{ textAlign: 'center', fontSize: 11, color: isActive ? LeTrendColors.brownDark : isDone ? LeTrendColors.success : LeTrendColors.textMuted, fontWeight: isActive || isDone ? 700 : 500 }}>
                  {currentStep.label}
                </div>
              </div>
            );
          })}
        </div>

        {phase === 'url' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  placeholder="Klistra in video-URL..."
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void handleAnalyze(); }}
                  disabled={busy}
                  style={{ ...inputStyle(), width: '100%', paddingRight: platform ? 110 : undefined }}
                />
                {platform ? (
                  <span style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', background: platform.color, color: '#fff', borderRadius: LeTrendRadius.full, padding: '4px 10px', fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.bold }}>
                    {platform.label}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '6px 0 0', color: LeTrendColors.textMuted, fontSize: LeTrendTypography.fontSize.xs }}>TikTok, Instagram eller YouTube.</p>
            </div>

            {busy ? (
              <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: LeTrendRadius.md, background: LeTrendColors.surface, color: LeTrendColors.textSecondary, fontSize: LeTrendTypography.fontSize.xs }}>
                Analys tar vanligtvis 15-30 sekunder. Lat fonstret vara oppet medan videon behandlas.
              </div>
            ) : null}

            {error ? (
              <div style={{ marginBottom: 16, background: '#FEF2F2', border: `1px solid ${LeTrendColors.error}33`, borderRadius: LeTrendRadius.md, color: LeTrendColors.error, padding: '12px 16px', fontSize: LeTrendTypography.fontSize.sm }}>
                {error}
              </div>
            ) : null}

            <button
              onClick={() => void handleAnalyze()}
              disabled={!videoUrl.trim() || busy}
              style={{ ...buttonStyle('primary'), width: '100%', opacity: !videoUrl.trim() || busy ? 0.55 : 1, cursor: !videoUrl.trim() || busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Arbetar...' : 'Analysera och fortsätt →'}
            </button>
          </>
        ) : null}

        {phase === 'classify' && classification ? (
          <>
            <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Svårighet</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {difficultyOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, difficulty: option.key } : c)} style={choiceButton(classification.difficulty === option.key, option.color)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Inspelningstid</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {filmTimeGroups.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, filmTime: option.value } : c)} style={choiceButton(selectedFilmTimeGroup === option.key, '#6366f1')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Antal personer</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {peopleOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, peopleNeeded: option.key } : c)} style={{ ...choiceButton(classification.peopleNeeded === option.key, '#111827'), minWidth: 90 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{option.shortLabel}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Marknad</div>
                <select value={classification.market} onChange={(e) => setClassification((c) => c ? { ...c, market: e.target.value } : c)} style={{ ...inputStyle(), fontSize: 13, padding: '8px 12px', width: '50%' }}>
                  {marketOptions.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Branschtyper (max 5)</div>
                  <div style={{ fontSize: 11, color: classification.businessTypes.length >= 5 ? '#92400e' : '#6b7280', fontWeight: 700 }}>{classification.businessTypes.length} av 5</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {businessTypeOptions.map((type) => {
                    const checked = classification.businessTypes.includes(type.key);
                    const limitReached = classification.businessTypes.length >= 5 && !checked;
                    return (
                      <button
                        key={type.key}
                        type="button"
                        disabled={limitReached}
                        onClick={() => setClassification((c) => {
                          if (!c) return c;
                          const next = checked
                            ? c.businessTypes.filter((v) => v !== type.key)
                            : c.businessTypes.length >= 5 ? c.businessTypes : [...c.businessTypes, type.key];
                          return { ...c, businessTypes: next };
                        })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 999, border: `1px solid ${checked ? type.color : '#e5e7eb'}`, background: checked ? `${type.color}14` : '#fff', cursor: limitReached ? 'not-allowed' : 'pointer', fontSize: 12, color: checked ? type.color : '#374151', opacity: limitReached ? 0.45 : 1 }}
                      >
                        <span>{type.icon}</span>
                        <span>{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Manusläge</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {scriptModeOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, script_mode: option.key } : c)} style={choiceButton(classification.script_mode === option.key, '#0f766e')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Setup <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {setupComplexityOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, setup_complexity: c.setup_complexity === option.key ? null : option.key } : c)} style={choiceButton(classification.setup_complexity === option.key, '#7c3aed')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Skicklighet <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {skillRequiredOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, skill_required: c.skill_required === option.key ? null : option.key } : c)} style={choiceButton(classification.skill_required === option.key, '#c2410c')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Miljö <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>(AI-förslag)</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {settingOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => setClassification((c) => c ? { ...c, setting: c.setting === option.key ? null : option.key } : c)} style={choiceButton(classification.setting === option.key, '#0369a1')}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error ? (
              <div style={{ marginBottom: 16, background: '#FEF2F2', border: `1px solid ${LeTrendColors.error}33`, borderRadius: LeTrendRadius.md, color: LeTrendColors.error, padding: '12px 16px', fontSize: LeTrendTypography.fontSize.sm }}>
                {error}
              </div>
            ) : null}

            {/* AI-utkast (collapsible, collapsed by default) */}
            <div style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #e0e7ff', background: '#eef2ff', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setShowAiDraft((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    AI-utkast
                  </span>
                  {sceneCount > 0 ? (
                    <span style={{ fontSize: 10, color: '#818cf8', background: '#e0e7ff', borderRadius: 999, padding: '2px 7px', fontWeight: 600 }}>
                      AI hittade {sceneCount} scener
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                  {showAiDraft ? 'Dölj ↑' : 'Visa AI-utkast ↓'}
                </span>
              </button>
              {showAiDraft ? (
                <div style={{ padding: '0 16px 12px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b', marginBottom: 4, lineHeight: 1.35 }}>
                    {(pendingOverrides.headline_sv as string | undefined) || pendingHeadline || '—'}
                  </div>
                  {typeof pendingOverrides.description_sv === 'string' && (pendingOverrides.description_sv as string).trim() ? (
                    <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.55 }}>
                      {pendingOverrides.description_sv as string}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 11, color: '#818cf8', marginTop: 8, fontStyle: 'italic' }}>
                    Rubrik och beskrivning kan redigeras i biblioteket efter att du sparat.
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setPhase('url'); setStep('idle'); }} style={{ ...buttonStyle('primary'), background: '#fff', color: LeTrendColors.textPrimary, border: '1px solid #e5e7eb' }}>
                ← Tillbaka
              </button>
              <button
                onClick={handleProceedToAssign}
                disabled={classification.businessTypes.length === 0}
                style={{ ...buttonStyle('primary'), opacity: classification.businessTypes.length === 0 ? 0.55 : 1, cursor: classification.businessTypes.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                Nästa →
              </button>
            </div>
          </>
        ) : null}

        {phase === 'assign' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                Vem är det här till?
              </div>
              <input
                type="text"
                placeholder="Sök kund..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ ...inputStyle(), width: '100%', marginBottom: 12 }}
              />
              {loadingCustomers ? (
                <div style={{ fontSize: 12, color: LeTrendColors.textMuted, padding: '12px 0' }}>
                  Laddar kunder...
                </div>
              ) : customers.length === 0 ? (
                <div style={{ fontSize: 12, color: LeTrendColors.textMuted, padding: '12px 0', fontStyle: 'italic' }}>
                  Du har inga tilldelade kunder.
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {customers
                    .filter((c) => {
                      if (!customerSearch.trim()) return true;
                      const q = customerSearch.toLowerCase();
                      return (c.business_name?.toLowerCase().includes(q)) ||
                        (c.tiktok_handle?.toLowerCase().includes(q));
                    })
                    .map((c) => {
                      const isSelected = selectedCustomerId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCustomerId(isSelected ? null : c.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: LeTrendRadius.md,
                            border: `1.5px solid ${isSelected ? LeTrendColors.brownDark : '#e5e7eb'}`,
                            background: isSelected ? '#faf5f0' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: LeTrendColors.brownDark }}>
                              {c.business_name || '(Namnlös)'}
                            </div>
                            {c.tiktok_handle && (
                              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 2 }}>
                                @{c.tiktok_handle}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <span style={{ fontSize: 16, color: LeTrendColors.brownDark }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {assignError && (
              <div style={{ marginBottom: 12, background: '#FEF2F2', border: `1px solid ${LeTrendColors.error}33`, borderRadius: LeTrendRadius.md, color: LeTrendColors.error, padding: '10px 14px', fontSize: 12 }}>
                {assignError}
              </div>
            )}
            {error && (
              <div style={{ marginBottom: 12, background: '#FEF2F2', border: `1px solid ${LeTrendColors.error}33`, borderRadius: LeTrendRadius.md, color: LeTrendColors.error, padding: '10px 14px', fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', marginBottom: 8 }}>
              Sparade koncept aktiveras direkt i biblioteket.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setPhase('classify'); setStep('classifying'); setAssignError(null); }}
                style={{ ...buttonStyle('primary'), background: '#fff', color: LeTrendColors.textPrimary, border: '1px solid #e5e7eb' }}
              >
                ← Tillbaka
              </button>
              <button
                onClick={() => void handleSaveToLibrary()}
                disabled={step === 'saving'}
                style={{ ...buttonStyle('primary'), background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.brownLight}`, opacity: step === 'saving' ? 0.55 : 1 }}
              >
                {step === 'saving' ? 'Sparar...' : 'Spara och aktivera'}
              </button>
              <button
                onClick={() => void handleSaveAndAssign()}
                disabled={step === 'saving' || !selectedCustomerId}
                style={{ ...buttonStyle('primary'), opacity: (step === 'saving' || !selectedCustomerId) ? 0.55 : 1, cursor: (step === 'saving' || !selectedCustomerId) ? 'not-allowed' : 'pointer' }}
              >
                {step === 'saving' ? 'Sparar...' : 'Spara, aktivera och tilldela →'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
