'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

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
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

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
      setSourceUrl(concept.backend_data.url ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Kunde inte ladda konceptet');
    } finally {
      setLoading(false);
    }
  }, [conceptId]);

  useEffect(() => {
    void loadConcept();
  }, [loadConcept]);

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
    } catch (err) {
      alert(`Fel: ${err instanceof Error ? err.message : 'Okänt fel'}`);
    } finally {
      setTogglingActive(false);
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
    <div style={{ maxWidth: 800 }}>
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


      {/* Collapsible analysis hint */}
      {replicabilityHint && (
        <div
          style={{
            marginBottom: 24,
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
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#6b7280',
              textAlign: 'left',
            }}
          >
            <span>Analysanteckning</span>
            <span style={{ fontSize: 10 }}>{showHint ? '▲' : '▼'}</span>
          </button>
          {showHint && (
            <div
              style={{
                padding: '0 16px 16px',
                fontSize: 13,
                color: '#374151',
                lineHeight: 1.6,
              }}
            >
              {replicabilityHint}
            </div>
          )}
        </div>
      )}

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
            rows={4}
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

      {/* Source link */}
      {sourceUrl && (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}
          >
            Visa original-video →
          </a>
        </div>
      )}
    </div>
  );
}
