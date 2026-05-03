'use client';

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { GamePlanGenerateInput } from '@/lib/game-plan';
import { ReferenceInputRow } from './ReferenceInputRow';

interface GamePlanAiSheetProps {
  customerId: string;
  loading: boolean;
  initialValues: GamePlanGenerateInput;
  onClose: () => void;
  onGenerate: (input: GamePlanGenerateInput) => Promise<boolean>;
}

const TONE_PRESETS = ['Varm', 'Trygg', 'Lekfull', 'Professionell', 'Personlig', 'Lugn'] as const;

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

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        background: '#FFFFFF',
        border: '1px solid rgba(74,47,24,0.08)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9D8E7D', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#4A4239', lineHeight: 1.5 }}>
        {value}
      </div>
    </div>
  );
}

export function GamePlanAiSheet({
  customerId,
  loading,
  initialValues,
  onClose,
  onGenerate,
}: GamePlanAiSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<GamePlanGenerateInput>(initialValues);
  const [showExtraContext, setShowExtraContext] = useState(
    Boolean(initialValues.constraints.trim() || initialValues.notes.some((note) => note.trim()) || initialValues.images.length > 0)
  );
  const [showVisualReferences, setShowVisualReferences] = useState(initialValues.images.length > 0);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialValues);
    setShowExtraContext(
      Boolean(initialValues.constraints.trim() || initialValues.notes.some((note) => note.trim()) || initialValues.images.length > 0)
    );
    setShowVisualReferences(initialValues.images.length > 0);
  }, [initialValues]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleImageFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    setUploadingImages(true);
    setUploadError(null);
    setShowExtraContext(true);
    setShowVisualReferences(true);

    try {
      const uploadedImages: Array<{ url: string; caption?: string }> = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/studio-v2/customers/${customerId}/game-plan/upload-image`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || typeof data.url !== 'string' || !data.url.trim()) {
          throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Kunde inte ladda upp bilden');
        }

        uploadedImages.push({
          url: data.url,
          caption: file.name.replace(/\.[^.]+$/, ''),
        });
      }

      setForm((prev) => ({
        ...prev,
        images: [...prev.images, ...uploadedImages],
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Kunde inte ladda upp bilderna');
    } finally {
      setUploadingImages(false);
      input.value = '';
    }
  };

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

  const toneIncludes = (tone: string) => (
    form.tone.toLowerCase().split(/[,\n]/).map((part) => part.trim()).filter(Boolean).includes(tone.toLowerCase())
  );

  const toggleTone = (tone: string) => {
    setForm((prev) => {
      const currentParts = prev.tone
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (currentParts.some((part) => part.toLowerCase() === tone.toLowerCase())) {
        return {
          ...prev,
          tone: currentParts.filter((part) => part.toLowerCase() !== tone.toLowerCase()).join(', '),
        };
      }

      return {
        ...prev,
        tone: [...currentParts, tone].join(', '),
      };
    });
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
              Fokusera pa riktning, ton och referenser. Resten hamtas fran kundens profil.
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
            Stang
          </button>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: '#F8F4EE',
              border: '1px solid rgba(74,47,24,0.08)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B4423', marginBottom: 10 }}>
              Kundsammanfattning
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {form.customer_name.trim() ? <SummaryChip label="Kund" value={form.customer_name.trim()} /> : null}
              {form.platform.trim() ? <SummaryChip label="Plattform" value={form.platform.trim()} /> : null}
              {form.niche.trim() ? <SummaryChip label="Nisch" value={form.niche.trim()} /> : null}
              {form.audience.trim() ? <SummaryChip label="Malgrupp" value={form.audience.trim()} /> : null}
            </div>
          </div>

          <div>
            <FieldLabel>Fokus</FieldLabel>
            <TextareaField
              value={form.focus}
              onChange={(event) => setForm((prev) => ({ ...prev, focus: event.target.value }))}
              placeholder="Vad ska planen hjalpa kunden att gora nu?"
              style={{ minHeight: 110 }}
            />
          </div>

          <div>
            <FieldLabel>Ton</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {TONE_PRESETS.map((tone) => {
                const active = toneIncludes(tone);
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => toggleTone(tone)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: active ? '1px solid #6B4423' : '1px solid rgba(74,47,24,0.08)',
                      background: active ? '#FAF8F5' : '#FFFFFF',
                      color: active ? '#6B4423' : '#5D4D3D',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {tone}
                  </button>
                );
              })}
            </div>
            <TextareaField
              value={form.tone}
              onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))}
              placeholder="Beskriv hur innehallet ska kannas och vad det inte ska vara."
            />
          </div>

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
                + Lagg till
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
                Lagg till profiler, videos eller artiklar och skriv garna vad du gillar med dem.
              </div>
            )}
          </div>

          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(74,47,24,0.08)',
              background: '#F8F4EE',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setShowExtraContext((prev) => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                border: 'none',
                background: 'transparent',
                color: '#1A1612',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A1612' }}>
                  Extra noter
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#7D6E5D' }}>
                  Ramar, arbetsnoter och visuella referenser
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B4423' }}>
                {showExtraContext ? 'Dolj' : 'Visa'}
              </span>
            </button>

            {showExtraContext ? (
                <div style={{ display: 'grid', gap: 16, padding: '0 16px 16px' }}>
                <div>
                  <FieldLabel>Ramar</FieldLabel>
                  <TextareaField
                    value={form.constraints}
                    onChange={(event) => setForm((prev) => ({ ...prev, constraints: event.target.value }))}
                    placeholder="Vad ska vi undvika eller halla fast vid?"
                  />
                </div>

                <div>
                  <FieldLabel>Arbetsnoter</FieldLabel>
                  <TextareaField
                    value={form.notes.join('\n')}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      notes: event.target.value
                        .split('\n')
                        .map((note) => note.trim())
                        .filter(Boolean),
                    }))}
                    placeholder="Skriv en observation per rad."
                    style={{ minHeight: 96 }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <FieldLabel>Visuella referenser</FieldLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => void handleImageFiles(event)}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading || uploadingImages}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#6B4423',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: loading || uploadingImages ? 'not-allowed' : 'pointer',
                          opacity: loading || uploadingImages ? 0.6 : 1,
                          padding: 0,
                        }}
                      >
                        {uploadingImages ? 'Laddar upp...' : 'Ladda upp'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowVisualReferences((prev) => !prev)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#6B4423',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {showVisualReferences ? 'Dolj' : 'Visa'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowVisualReferences(true);
                          setForm((prev) => ({
                            ...prev,
                            images: [...prev.images, { url: '', caption: '' }],
                          }));
                        }}
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
                        + Lagg till bild
                      </button>
                    </div>
                  </div>

                  {uploadError ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.16)',
                        color: '#b91c1c',
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {uploadError}
                    </div>
                  ) : null}

                  {showVisualReferences ? (
                    form.images.length > 0 ? (
                      form.images.map((image, index) => {
                        const previewUrl = image.url.trim();
                        return (
                          <div
                            key={index}
                            style={{
                              display: 'grid',
                              gap: 10,
                              padding: 14,
                              borderRadius: 14,
                              background: '#FFFFFF',
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

                            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: previewUrl ? '80px minmax(0, 1fr)' : '1fr' }}>
                              {previewUrl ? (
                                <div
                                  style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                    border: '1px solid rgba(74,47,24,0.08)',
                                    background: '#F5F2EE',
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={previewUrl}
                                    alt={image.caption || `Referensbild ${index + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                </div>
                              ) : null}
                              <div style={{ display: 'grid', gap: 10 }}>
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
                                  placeholder="Bildlank"
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
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: 14,
                          background: '#FFFFFF',
                          border: '1px dashed rgba(74,47,24,0.16)',
                          color: '#7D6E5D',
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        Lagg till bildlankar for moodboard, skarmdumpar eller visuell riktning.
                      </div>
                    )
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !form.customer_name.trim() || !form.focus.trim()}
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
            {loading ? 'Genererar utkast...' : '✨ Generera utkast'}
          </button>
        </div>
      </div>
    </div>
  );
}
