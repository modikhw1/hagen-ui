'use client';

import { useState } from 'react';
import {
  LeTrendColors,
  LeTrendRadius,
  LeTrendShadows,
  LeTrendTypography,
  buttonStyle,
  inputStyle,
} from '@/styles/letrend-design-system';

interface UploadConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conceptId: string) => void;
}

type JsonRecord = Record<string, unknown>;

type UploadStep = 'idle' | 'uploading' | 'analyzing' | 'saving';

const STEPS: Array<{ key: Exclude<UploadStep, 'idle'>; label: string }> = [
  { key: 'uploading', label: 'Laddar upp' },
  { key: 'analyzing', label: 'Analyserar' },
  { key: 'saving', label: 'Sparar' },
];

function detectPlatform(url: string): { key: string; label: string; color: string } {
  const normalized = url.toLowerCase();

  if (normalized.includes('instagram')) {
    return { key: 'instagram', label: 'Instagram', color: '#C13584' };
  }

  if (normalized.includes('youtube') || normalized.includes('youtu.be')) {
    return { key: 'youtube', label: 'YouTube', color: '#FF0000' };
  }

  return { key: 'tiktok', label: 'TikTok', color: '#1A1612' };
}

async function readJsonResponse(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    stage?: string;
    upload?: { gcsUri?: string };
    analysis?: JsonRecord;
    concept?: { id?: string };
  };
}

function getNestedString(record: JsonRecord, path: string[]) {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return '';
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : '';
}

function getNestedRecord(record: JsonRecord, path: string[]): JsonRecord | null {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = (current as JsonRecord)[segment];
  }

  return current && typeof current === 'object' ? (current as JsonRecord) : null;
}

function getFirstNestedString(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedString(record, path);
    if (value) {
      return value;
    }
  }

  return '';
}

export function UploadConceptModal({ isOpen, onClose, onSuccess }: UploadConceptModalProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const platform = videoUrl.trim() ? detectPlatform(videoUrl) : null;
  const busy = step !== 'idle';
  const stepIndex = STEPS.findIndex((currentStep) => currentStep.key === step);

  const reset = () => {
    setVideoUrl('');
    setStep('idle');
    setError(null);
  };

  const handleClose = () => {
    if (busy) {
      return;
    }

    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!videoUrl.trim() || busy) {
      return;
    }

    setError(null);
    let analyzeStepTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      setStep('uploading');
      analyzeStepTimer = setTimeout(() => {
        setStep((current) => (current === 'uploading' ? 'analyzing' : current));
      }, 1200);

      const analyzeRes = await fetch('/api/studio/concepts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          platform: platform?.key,
        }),
      });
      const analyzePayload = await readJsonResponse(analyzeRes);
      if (!analyzeRes.ok) {
        throw new Error(analyzePayload.error || 'Upload eller analys misslyckades');
      }

      setStep('analyzing');
      const gcsUri =
        typeof analyzePayload.upload?.gcsUri === 'string' && analyzePayload.upload.gcsUri.trim()
          ? analyzePayload.upload.gcsUri.trim()
          : undefined;
      const analyzeEnvelope = analyzePayload.analysis;

      if (!analyzeEnvelope) {
        throw new Error('Analysen returnerade inget resultat.');
      }

      const analyzeData = getNestedRecord(analyzeEnvelope, ['analysis']) || analyzeEnvelope;

      if (analyzeStepTimer) {
        clearTimeout(analyzeStepTimer);
        analyzeStepTimer = null;
      }

      setStep('saving');
      const headline =
        getFirstNestedString(analyzeData, [
          ['title'],
          ['headline'],
          ['script', 'conceptCore'],
          ['content', 'topic'],
          ['content', 'keyMessage'],
          ['visual_analysis', 'content', 'keyMessage'],
        ]) || 'Nytt koncept';
      const urlSegments = videoUrl.split('/').filter(Boolean);
      const videoIdSegment =
        urlSegments[urlSegments.length - 1]?.replace(/[^a-zA-Z0-9_-]/g, '') || Date.now().toString();
      const conceptId = `clip-${videoIdSegment}`;

      const saveRes = await fetch('/api/admin/concepts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: conceptId,
          backend_data: {
            ...analyzeData,
            url: videoUrl,
            source_url: videoUrl,
            platform: platform?.key,
            ...(gcsUri ? { gcs_uri: gcsUri } : {}),
          },
          overrides: {
            headline_sv: headline,
            description_sv: getFirstNestedString(analyzeData, [
              ['content', 'keyMessage'],
              ['visual_analysis', 'content', 'keyMessage'],
            ]),
            whyItWorks_sv: getFirstNestedString(analyzeData, [
              ['script', 'humor', 'humorMechanism'],
              ['humor_analysis', 'why'],
            ]),
            script_sv: getFirstNestedString(analyzeData, [
              ['script', 'transcript'],
              ['visual_analysis', 'script', 'transcript'],
            ]),
          },
        }),
      });
      const saveData = await readJsonResponse(saveRes);
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Kunde inte spara konceptet');
      }

      reset();
      onSuccess(saveData.concept?.id || conceptId);
    } catch (err) {
      if (analyzeStepTimer) {
        clearTimeout(analyzeStepTimer);
      }
      setError(err instanceof Error ? err.message : 'Nagot gick fel');
      setStep('idle');
    }
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderRadius: LeTrendRadius.xl,
          boxShadow: LeTrendShadows.xl,
          padding: 28,
          fontFamily: LeTrendTypography.fontFamily.body,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: LeTrendTypography.fontSize['3xl'],
                fontWeight: LeTrendTypography.fontWeight.bold,
                color: LeTrendColors.textPrimary,
                fontFamily: LeTrendTypography.fontFamily.heading,
              }}
            >
              Nytt koncept
            </h3>
            <p
              style={{
                margin: '6px 0 0',
                color: LeTrendColors.textMuted,
                fontSize: LeTrendTypography.fontSize.sm,
              }}
            >
              Klistra in en video-URL for att ladda upp och analysera.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={busy}
            aria-label="Stang"
            style={{
              border: 'none',
              background: 'none',
              color: LeTrendColors.textMuted,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            x
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="url"
              placeholder="Klistra in video-URL..."
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleSubmit();
                }
              }}
              disabled={busy}
              style={{
                ...inputStyle(),
                width: '100%',
                paddingRight: platform ? 110 : undefined,
              }}
            />
            {platform ? (
              <span
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 10,
                  transform: 'translateY(-50%)',
                  background: platform.color,
                  color: '#fff',
                  borderRadius: LeTrendRadius.full,
                  padding: '4px 10px',
                  fontSize: LeTrendTypography.fontSize.xs,
                  fontWeight: LeTrendTypography.fontWeight.bold,
                }}
              >
                {platform.label}
              </span>
            ) : null}
          </div>
          <p
            style={{
              margin: '6px 0 0',
              color: LeTrendColors.textMuted,
              fontSize: LeTrendTypography.fontSize.xs,
            }}
          >
            TikTok, Instagram eller YouTube.
          </p>
        </div>

        {busy ? (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {STEPS.map((currentStep, index) => {
              const isActive = currentStep.key === step;
              const isDone = stepIndex > index;

              return (
                <div key={currentStep.key} style={{ flex: 1 }}>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 999,
                      background: isDone
                        ? LeTrendColors.success
                        : isActive
                          ? LeTrendColors.brownLight
                          : LeTrendColors.surfaceLight,
                      marginBottom: 6,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {isActive ? (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: `linear-gradient(90deg, transparent, ${LeTrendColors.cream}, transparent)`,
                          animation: 'uploadShimmer 1.4s infinite',
                          opacity: 0.45,
                        }}
                      />
                    ) : null}
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: LeTrendTypography.fontSize.xs,
                      color: isActive
                        ? LeTrendColors.brownDark
                        : isDone
                          ? LeTrendColors.success
                          : LeTrendColors.textMuted,
                      fontWeight: isActive
                        ? LeTrendTypography.fontWeight.bold
                        : LeTrendTypography.fontWeight.medium,
                    }}
                  >
                    {currentStep.label}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginBottom: 16,
              background: '#FEF2F2',
              border: `1px solid ${LeTrendColors.error}33`,
              borderRadius: LeTrendRadius.md,
              color: LeTrendColors.error,
              padding: '12px 16px',
              fontSize: LeTrendTypography.fontSize.sm,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!videoUrl.trim() || busy}
          style={{
            ...buttonStyle('primary'),
            width: '100%',
            opacity: !videoUrl.trim() || busy ? 0.55 : 1,
            cursor: !videoUrl.trim() || busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Arbetar...' : 'Ladda upp och analysera'}
        </button>

        <style>{'@keyframes uploadShimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }'}</style>
      </div>
    </div>
  );
}
