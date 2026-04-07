'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';
import { VideoPlayer } from '@/components/shared/VideoPlayer';

function detectPlatform(url: string): string | null {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram.com')) return 'Instagram';
  return null;
}

interface RawConcept {
  id: string;
  source: string;
  backend_data: BackendClip;
  overrides: Record<string, unknown>;
  is_active: boolean;
  version: number;
}


export default function ConceptReviewPage() {
  const params = useParams();
  const conceptId = params?.id as string;

  const [raw, setRaw] = useState<RawConcept | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Editable content fields
  const [headlineSv, setHeadlineSv] = useState('');
  const [descriptionSv, setDescriptionSv] = useState('');
  const [whyItWorksSv, setWhyItWorksSv] = useState('');

  // Editable classification fields (override-first, auto-translated fallback)
  const [difficulty, setDifficulty] = useState('');
  const [market, setMarket] = useState('');
  const [peopleNeeded, setPeopleNeeded] = useState('');

  const [replicabilityHint, setReplicabilityHint] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptIsOverridden, setTranscriptIsOverridden] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [gcsUri, setGcsUri] = useState<string | null>(null);
  const [nextUnreviewed, setNextUnreviewed] = useState<{ id: string; headline: string } | null | 'loading'>('loading');

  const loadConcept = useCallback(async () => {
    if (!conceptId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        setLoadError((errData as { error?: string }).error || `HTTP ${resp.status}`);
        return;
      }
      const { concept } = (await resp.json()) as { concept: RawConcept };
      setRaw(concept);
      setIsActive(concept.is_active);

      const overrides = (concept.overrides ?? {}) as ClipOverride;
      const translated = translateClipToConcept(concept.backend_data, overrides);

      // Pre-fill editable fields from stored overrides only
      setHeadlineSv(overrides.headline_sv ?? '');
      setDescriptionSv(overrides.description_sv ?? '');
      setWhyItWorksSv(overrides.whyItWorks_sv ?? '');

      // Classification fields: prefer stored human override, fall back to auto-translation
      const rawOv = concept.overrides ?? {};
      setDifficulty(typeof rawOv.difficulty === 'string' ? rawOv.difficulty : translated.difficulty);
      setMarket(typeof rawOv.market === 'string' ? rawOv.market : translated.market);
      setPeopleNeeded(typeof rawOv.peopleNeeded === 'string' ? rawOv.peopleNeeded : translated.peopleNeeded);

      // Hint and source
      setReplicabilityHint(concept.backend_data.replicability_analysis ?? null);

      // Transcript: CM-corrected override wins over machine extraction
      const transcriptOverride = typeof rawOv.transcript === 'string' ? rawOv.transcript.trim() : null;
      const machineTranscript = concept.backend_data.script?.transcript?.trim() || null;
      const resolvedTranscript = transcriptOverride || machineTranscript;
      setTranscript(resolvedTranscript);
      setTranscriptIsOverridden(!!transcriptOverride);
      setTranscriptDraft(resolvedTranscript ?? '');

      setSourceUrl(concept.backend_data.url ?? null);
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
        .neq('id', conceptId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const row = data[0];
        setNextUnreviewed({
          id: row.id as string,
          headline:
            ((row.overrides as Record<string, unknown>)?.headline_sv as string) || '(Inget namn)',
        });
      } else {
        setNextUnreviewed(null);
      }
    } catch {
      setNextUnreviewed(null);
    }
  }, [conceptId]);

  useEffect(() => {
    void loadConcept();
    void fetchNextUnreviewed();
  }, [loadConcept, fetchNextUnreviewed]);

  const handleSave = async () => {
    if (!raw || !headlineSv.trim()) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const newOverrides: Record<string, unknown> = {
        ...(raw.overrides ?? {}),
        headline_sv: headlineSv.trim(),
        difficulty,
        market,
        peopleNeeded,
        ...(descriptionSv.trim() ? { description_sv: descriptionSv.trim() } : {}),
        ...(whyItWorksSv.trim() ? { whyItWorks_sv: whyItWorksSv.trim() } : {}),
      };

      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          overrides: newOverrides,
          change_summary: 'Granskad i Studio',
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error || 'Sparning misslyckades',
        );
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (activate: boolean) => {
    setTogglingActive(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ is_active: activate }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Misslyckades');
      }
      setIsActive(activate);
      void fetchNextUnreviewed();
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okänt fel'}`);
    } finally {
      setTogglingActive(false);
    }
  };

  const handleSaveTranscript = async () => {
    if (!raw) return;
    setSavingTranscript(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const newOverrides: Record<string, unknown> = {
        ...(raw.overrides ?? {}),
        ...(transcriptDraft.trim() ? { transcript: transcriptDraft.trim() } : {}),
      };
      const resp = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          overrides: newOverrides,
          change_summary: 'Transkript korrigerat av CM',
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Sparning misslyckades');
      }
      // Keep raw in sync so subsequent saves include the transcript override
      setRaw((prev) => (prev ? { ...prev, overrides: newOverrides } : prev));
      setTranscript(transcriptDraft.trim() || null);
      setTranscriptIsOverridden(!!transcriptDraft.trim());
      setEditingTranscript(false);
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okänt fel'}`);
    } finally {
      setSavingTranscript(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Laddar...</div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: 12 }}>{loadError}</div>
        <Link href="/studio/concepts" style={{ color: '#4f46e5', fontSize: 14 }}>
          ← Tillbaka till biblioteket
        </Link>
      </div>
    );
  }

  if (!raw) return null;

  const hasNoContent = !headlineSv && !descriptionSv && !whyItWorksSv;
  const displayName = headlineSv || '(Inget namn ännu)';

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/studio/concepts"
          style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}
        >
          ← Tillbaka till biblioteket
        </Link>
        <h1
          style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginTop: 8, marginBottom: 4 }}
        >
          Granska koncept
        </h1>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>
          {displayName}&nbsp;&middot;&nbsp;ID: {raw.id}
        </div>
      </div>

      {/* Two-column layout: reference panels left, authoring form right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Left column: sticky reference panels */}
        <div
          style={{
            position: 'sticky',
            top: 24,
            maxHeight: 'calc(100vh - 64px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Video reference */}
          {(sourceUrl || gcsUri) && (
            <div>
              <VideoPlayer
                videoUrl={sourceUrl ?? undefined}
                gcsUri={gcsUri ?? undefined}
                showLabel={false}
              />
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {sourceUrl && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {detectPlatform(sourceUrl) ?? 'Källvideo'}
                  </span>
                )}
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: '#4f46e5',
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    Öppna {detectPlatform(sourceUrl) ? `i ${detectPlatform(sourceUrl)}` : 'video'} →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Analysis hint */}
          {replicabilityHint && (
            <div
              style={{
                background: '#fafaf9',
                border: '1px solid #e5e4e1',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setShowHint(!showHint)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#9ca3af',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <span>Analysanteckning</span>
                <span style={{ fontSize: 9 }}>{showHint ? '▲' : '▼'}</span>
              </button>
              {showHint && (
                <div
                  style={{
                    padding: '0 14px 14px',
                    fontSize: 12,
                    color: '#374151',
                    lineHeight: 1.6,
                  }}
                >
                  {replicabilityHint}
                </div>
              )}
            </div>
          )}

          {/* Transcript panel */}
          <div
            style={{
              background: '#fafaf9',
              border: '1px solid #e5e4e1',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
              }}
            >
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#9ca3af',
                  textAlign: 'left',
                  padding: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <span>Transkript</span>
                {transcriptIsOverridden && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#059669',
                      background: '#d1fae5',
                      padding: '2px 5px',
                      borderRadius: 4,
                      letterSpacing: '0.03em',
                    }}
                  >
                    KORR
                  </span>
                )}
                <span style={{ fontSize: 9, marginLeft: 'auto' }}>{showTranscript ? '▲' : '▼'}</span>
              </button>
              {!editingTranscript && (
                <button
                  onClick={() => {
                    setTranscriptDraft(transcript ?? '');
                    setEditingTranscript(true);
                    setShowTranscript(true);
                  }}
                  style={{
                    marginLeft: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#4f46e5',
                    fontWeight: 500,
                    padding: '2px 4px',
                  }}
                >
                  Redigera
                </button>
              )}
            </div>

            {showTranscript && (
              <div style={{ padding: '0 14px 14px' }}>
                {editingTranscript ? (
                  <>
                    <textarea
                      value={transcriptDraft}
                      onChange={(e) => setTranscriptDraft(e.target.value)}
                      rows={10}
                      placeholder="Skriv eller klistra in det korrigerade transkriptet här..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid #c4b5fd',
                        borderRadius: 7,
                        fontSize: 12,
                        lineHeight: 1.7,
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        background: '#fff',
                      }}
                    />
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => void handleSaveTranscript()}
                        disabled={savingTranscript}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          border: 'none',
                          background: savingTranscript ? '#9ca3af' : '#4f46e5',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: savingTranscript ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {savingTranscript ? 'Sparar...' : 'Spara'}
                      </button>
                      <button
                        onClick={() => setEditingTranscript(false)}
                        disabled={savingTranscript}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #e5e7eb',
                          background: '#fff',
                          color: '#6b7280',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: savingTranscript ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </>
                ) : transcript ? (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#374151',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {transcript}
                    </div>
                    {!transcriptIsOverridden && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                        Maskinutläst — kontrollera vid osäkerhet
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                    Inget transkript — använd Redigera för att lägga till ett
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right column: authoring form + publish */}
        <div>
          {/* Main review form */}
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 28,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {hasNoContent && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 24,
                  fontSize: 13,
                  color: '#92400e',
                }}
              >
                Det här konceptet har inget svensk textinnehåll ännu. Fyll i en titel för att det ska
                vara användbart för CM.
              </div>
            )}

            {/* Koncepttitel */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: 6,
                }}
              >
                Koncepttitel <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={headlineSv}
                onChange={(e) => setHeadlineSv(e.target.value)}
                placeholder="Vad heter det här konceptet?"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: `1px solid ${headlineSv ? '#e5e7eb' : '#fca5a5'}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Beskrivning */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: 6,
                }}
              >
                Beskrivning
              </label>
              <textarea
                value={descriptionSv}
                onChange={(e) => setDescriptionSv(e.target.value)}
                placeholder="Vad handlar konceptet om? 1–2 meningar."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Varför det funkar */}
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: 6,
                }}
              >
                Varför det funkar
              </label>
              <textarea
                value={whyItWorksSv}
                onChange={(e) => setWhyItWorksSv(e.target.value)}
                placeholder="Varför fungerar det här formatet och vad ger det kunden?"
                rows={5}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Klassificering */}
            <div
              style={{
                borderTop: '1px solid #f3f4f6',
                paddingTop: 20,
                marginBottom: 28,
              }}
            >
              <div
                style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}
              >
                Klassificering
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 5,
                      fontWeight: 500,
                    }}
                  >
                    Svårighet
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      fontSize: 13,
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="easy">Lätt</option>
                    <option value="medium">Medel</option>
                    <option value="advanced">Avancerat</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 5,
                      fontWeight: 500,
                    }}
                  >
                    Marknad
                  </label>
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      fontSize: 13,
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="SE">Sverige</option>
                    <option value="US">USA</option>
                    <option value="UK">UK</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 5,
                      fontWeight: 500,
                    }}
                  >
                    Antal personer
                  </label>
                  <select
                    value={peopleNeeded}
                    onChange={(e) => setPeopleNeeded(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      fontSize: 13,
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="solo">En person</option>
                    <option value="duo">Duo</option>
                    <option value="small_team">Litet team</option>
                    <option value="team">Större team</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {saved && (
                <span style={{ fontSize: 14, color: '#10b981', fontWeight: 500 }}>✓ Sparat!</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !headlineSv.trim()}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: saving || !headlineSv.trim() ? '#9ca3af' : '#4f46e5',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving || !headlineSv.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>

          {/* Publish status */}
          <div
            style={{
              marginTop: 16,
              padding: '14px 20px',
              borderRadius: 10,
              border: `1px solid ${isActive ? '#a7f3d0' : '#fde68a'}`,
              background: isActive ? '#ecfdf5' : '#fffbeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? '#065f46' : '#92400e',
                }}
              >
                {isActive ? 'Publicerat i biblioteket' : 'Ej publicerat — syns inte för kunder ännu'}
              </span>
              {isActive && (
                <div style={{ marginTop: 4 }}>
                  <Link
                    href="/studio/concepts"
                    style={{ fontSize: 12, color: '#059669', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Tilldela en kund via biblioteket →
                  </Link>
                </div>
              )}
            </div>
            <button
              onClick={() => void handleToggleActive(!isActive)}
              disabled={togglingActive}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: togglingActive ? '#9ca3af' : isActive ? '#ef4444' : '#10b981',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: togglingActive ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {togglingActive ? '...' : isActive ? 'Avpublicera' : 'Publicera'}
            </button>
          </div>
          {/* Next unreviewed navigation */}
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              minHeight: 28,
            }}
          >
            {nextUnreviewed === 'loading' ? null : nextUnreviewed ? (
              <Link
                href={`/studio/concepts/${nextUnreviewed.id}/review`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#4f46e5',
                  textDecoration: 'none',
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid #c7d2fe',
                  background: '#eef2ff',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    fontWeight: 400,
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nextUnreviewed.headline}
                </span>
                <span>Nästa ogranskade →</span>
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                Inga fler ogranskade koncept
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
