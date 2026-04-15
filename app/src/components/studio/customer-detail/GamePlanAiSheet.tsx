'use client';

import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { GamePlanGenerateInput } from '@/lib/game-plan';
import { ReferenceInputRow } from './ReferenceInputRow';

interface GamePlanAiSheetProps {
  loading: boolean;
  initialValues: GamePlanGenerateInput;
  onClose: () => void;
  onGenerate: (input: GamePlanGenerateInput) => Promise<boolean>;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 6,
        color: '#5D4D3D',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </label>
  );
}

function InputField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid rgba(74,47,24,0.15)',
        fontSize: 14,
        color: '#4A4239',
        background: '#FFFFFF',
        outline: 'none',
        boxSizing: 'border-box',
        ...(props.style || {}),
      }}
    />
  );
}

function TextareaField(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid rgba(74,47,24,0.15)',
        fontSize: 14,
        color: '#4A4239',
        background: '#FFFFFF',
        outline: 'none',
        resize: 'vertical',
        minHeight: 92,
        boxSizing: 'border-box',
        ...(props.style || {}),
      }}
    />
  );
}

export function GamePlanAiSheet({
  loading,
  initialValues,
  onClose,
  onGenerate,
}: GamePlanAiSheetProps) {
  const [form, setForm] = useState<GamePlanGenerateInput>(initialValues);
  const [showMoreContext, setShowMoreContext] = useState(false);
  const [showVisualReferences, setShowVisualReferences] = useState(initialValues.images.length > 0);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const profileSummary = [
    form.customer_name.trim(),
    form.platform.trim(),
    form.niche.trim(),
    form.audience.trim(),
  ].filter(Boolean);

  const handleSubmit = async () => {
    if (loading) return;

    const success = await onGenerate({
      ...form,
      references: form.references.filter((reference) => reference.url.trim()),
      images: form.images.filter((image) => image.url.trim()),
      notes: form.notes.filter((note) => note.trim()),
    });

    if (success) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(26, 22, 18, 0.24)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={handleClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(560px, 100vw)',
          height: '100%',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          boxShadow: '0 8px 32px rgba(107, 68, 35, 0.25)',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1612', marginBottom: 6 }}>
              Generera utkast
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#7D6E5D' }}>
              Skriv riktning, ton och referenser. Vi bygger ett första utkast som du sedan kan redigera fritt.
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              border: '1px solid rgba(74,47,24,0.08)',
              background: '#FFFFFF',
              color: '#1A1612',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Stäng
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              background: '#F8F4EE',
              border: '1px solid rgba(74,47,24,0.08)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B4423', marginBottom: 8 }}>
              Kundprofil
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#4A4239' }}>
              {profileSummary.length > 0 ? profileSummary.join(' • ') : 'Ingen kundkontext hittades än.'}
            </div>
            <button
              type="button"
              onClick={() => setShowMoreContext((prev) => !prev)}
              style={{
                marginTop: 10,
                border: 'none',
                background: 'transparent',
                color: '#6B4423',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showMoreContext ? 'Dölj mer kontext' : 'Justera mer kontext'}
            </button>
          </div>

          <div>
            <FieldLabel>Fokus</FieldLabel>
            <TextareaField
              value={form.focus}
              onChange={(event) => setForm((prev) => ({ ...prev, focus: event.target.value }))}
              placeholder="Vad ska planen hjälpa kunden att göra nu?"
            />
          </div>

          <div>
            <FieldLabel>Ton</FieldLabel>
            <TextareaField
              value={form.tone}
              onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))}
              placeholder="Hur ska innehållet kännas? Vad ska det inte vara?"
            />
          </div>

          {showMoreContext ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <FieldLabel>Kundnamn</FieldLabel>
                <InputField
                  value={form.customer_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))}
                  placeholder="Kundnamn"
                />
              </div>

              <div>
                <FieldLabel>Nisch / bransch</FieldLabel>
                <InputField
                  value={form.niche}
                  onChange={(event) => setForm((prev) => ({ ...prev, niche: event.target.value }))}
                  placeholder="Till exempel hudvård, restaurang, B2B"
                />
              </div>

              <div>
                <FieldLabel>Målgrupp</FieldLabel>
                <InputField
                  value={form.audience}
                  onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
                  placeholder="Vilka ska vi prata till?"
                />
              </div>

              <div>
                <FieldLabel>Plattform</FieldLabel>
                <InputField
                  value={form.platform}
                  onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
                  placeholder="TikTok"
                />
              </div>

              <div>
                <FieldLabel>Ramar</FieldLabel>
                <TextareaField
                  value={form.constraints}
                  onChange={(event) => setForm((prev) => ({ ...prev, constraints: event.target.value }))}
                  placeholder="Vad ska vi undvika eller hålla fast vid?"
                />
              </div>
            </div>
          ) : null}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <FieldLabel>Referenser</FieldLabel>
              <button
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  references: [...prev.references, { url: '', label: '', note: '' }],
                }))}
                disabled={loading}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6B4423',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  padding: 0,
                }}
              >
                Lägg till referens
              </button>
            </div>

            {form.references.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {form.references.map((reference, index) => (
                  <ReferenceInputRow
                    key={index}
                    index={index}
                    reference={reference}
                    onChange={(next) => setForm((prev) => ({
                      ...prev,
                      references: prev.references.map((current, currentIndex) => (
                        currentIndex === index ? next : current
                      )),
                    }))}
                    onRemove={() => setForm((prev) => ({
                      ...prev,
                      references: prev.references.filter((_, currentIndex) => currentIndex !== index),
                    }))}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: '#F8F4EE',
                  border: '1px dashed rgba(74,47,24,0.16)',
                  color: '#7D6E5D',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Lägg till profiler, videos eller artiklar och skriv gärna varför de känns rätt. Det är här flöden som
                “den här profilen har en skön ton” blir användbara för AI:n.
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <FieldLabel>Extra noter</FieldLabel>
              <button
                type="button"
                onClick={() => setShowVisualReferences((prev) => !prev)}
                disabled={loading}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6B4423',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  padding: 0,
                }}
              >
                {showVisualReferences ? 'Dölj bilder' : 'Visa bilder'}
              </button>
            </div>
            <TextareaField
              value={form.notes.join('\n')}
              onChange={(event) => setForm((prev) => ({
                ...prev,
                notes: event.target.value
                  .split('\n')
                  .map((note) => note.trim())
                  .filter(Boolean),
              }))}
              placeholder="Skriv en observation per rad. T.ex. Kunden ska kännas mänsklig, undvik för polerad tonalitet."
              style={{ minHeight: 110 }}
            />
          </div>

          {showVisualReferences ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <FieldLabel>Visuella referenser</FieldLabel>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    images: [...prev.images, { url: '', caption: '' }],
                  }))}
                  disabled={loading}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#6B4423',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    padding: 0,
                  }}
                >
                  Lägg till bild
                </button>
              </div>

              {form.images.length > 0 ? (
                form.images.map((image, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'grid',
                      gap: 10,
                      padding: 14,
                      borderRadius: 14,
                      background: '#F8F4EE',
                      border: '1px solid rgba(74,47,24,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B4423' }}>
                        Bild {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({
                          ...prev,
                          images: prev.images.filter((_, currentIndex) => currentIndex !== index),
                        }))}
                        disabled={loading}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#B45309',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.6 : 1,
                          padding: 0,
                        }}
                      >
                        Ta bort
                      </button>
                    </div>

                    <InputField
                      value={image.url}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        images: prev.images.map((current, currentIndex) => (
                          currentIndex === index
                            ? { ...current, url: event.target.value }
                            : current
                        )),
                      }))}
                      placeholder="Bildlänk"
                    />
                    <InputField
                      value={image.caption || ''}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        images: prev.images.map((current, currentIndex) => (
                          currentIndex === index
                            ? { ...current, caption: event.target.value }
                            : current
                        )),
                      }))}
                      placeholder="Kort caption eller vad bilden signalerar"
                    />
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#F8F4EE',
                    border: '1px dashed rgba(74,47,24,0.16)',
                    color: '#7D6E5D',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  Lägg till bildlänkar om du vill ge AI:n moodboard, färgkänsla eller annan visuell riktning.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !form.customer_name.trim()}
            style={{
              width: '100%',
              padding: '14px 18px',
              border: 'none',
              borderRadius: 14,
              background: loading ? '#9D8E7D' : 'linear-gradient(145deg, #6B4423, #4A2F18)',
              color: '#FAF8F5',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Genererar utkast...' : 'Generera'}
          </button>
        </div>
      </div>
    </div>
  );
}
