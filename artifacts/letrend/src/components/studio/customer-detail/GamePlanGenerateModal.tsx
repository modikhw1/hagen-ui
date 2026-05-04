'use client';

import { useEffect, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import {
  detectLinkType,
  getLinkPlatformLabel,
  normalizeHref,
} from '@/components/gameplan-editor/utils/link-helpers';
import type { GamePlanGenerateInput, GamePlanReferenceInput } from '@/lib/game-plan';

interface ReferenceGroup {
  id: string;
  context: string;
  links: Array<{ url: string; label: string }>;
}

interface GamePlanGenerateModalProps {
  customerId: string;
  loading: boolean;
  form: GamePlanGenerateInput;
  setForm: React.Dispatch<React.SetStateAction<GamePlanGenerateInput>>;
  onClose: () => void;
  onGenerate: (input: GamePlanGenerateInput) => Promise<boolean>;
}

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 10,
  border: '1px solid rgba(74,47,24,0.15)',
  fontSize: 14,
  color: '#4A4239',
  background: '#FFFFFF',
  outline: 'none',
  resize: 'vertical',
  minHeight: 80,
  boxSizing: 'border-box',
  lineHeight: 1.55,
  fontFamily: 'inherit',
};

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1612', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#7D6E5D', lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
      {children}
    </div>
  );
}

function TextareaField(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...FIELD_STYLE, ...(props.style || {}) }}
    />
  );
}

function getPlatformIcon(platform: ReturnType<typeof detectLinkType>): string {
  switch (platform) {
    case 'tiktok': return '♪';
    case 'instagram': return '◎';
    case 'youtube': return '▶';
    case 'article': return '≡';
    default: return '↗';
  }
}

function initGroupsFromReferences(refs: GamePlanReferenceInput[]): ReferenceGroup[] {
  if (refs.length === 0) return [];
  return refs.map((r, i) => ({
    id: String(Date.now()) + i,
    context: r.note || '',
    links: [{ url: r.url || '', label: r.label || '' }],
  }));
}

function flattenGroups(groups: ReferenceGroup[]): GamePlanReferenceInput[] {
  return groups.flatMap((g) =>
    g.links
      .filter((l) => l.url.trim())
      .map((l) => {
        const normalized = normalizeHref(l.url.trim());
        return {
          url: l.url.trim(),
          label: l.label.trim() || undefined,
          note: g.context.trim() || undefined,
          platform: normalized ? detectLinkType(normalized) : undefined,
        };
      })
  );
}

export function GamePlanGenerateModal({
  customerId,
  loading,
  form,
  setForm,
  onClose,
  onGenerate,
}: GamePlanGenerateModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showReferensmaterial, setShowReferensmaterial] = useState(
    form.references.length > 0 || form.images.length > 0
  );
  const [showVisualReferences, setShowVisualReferences] = useState(form.images.length > 0);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [groups, setGroups] = useState<ReferenceGroup[]>(() =>
    initGroupsFromReferences(form.references)
  );

  useEffect(() => {
    const flatRefs = flattenGroups(groups);
    setForm((prev) => ({ ...prev, references: flatRefs }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

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
    setShowReferensmaterial(true);
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
      references: flattenGroups(groups).filter((r) => r.url.trim()),
      images: form.images.filter((i) => i.url.trim()),
    });

    if (success) {
      onClose();
    }
  };

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      { id: String(Date.now()), context: '', links: [{ url: '', label: '' }] },
    ]);
  };

  const removeGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const updateGroupContext = (groupId: string, context: string) => {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, context } : g));
  };

  const addLinkToGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, links: [...g.links, { url: '', label: '' }] } : g
      )
    );
  };

  const updateLink = (groupId: string, linkIndex: number, field: 'url' | 'label', value: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              links: g.links.map((l, i) => i === linkIndex ? { ...l, [field]: value } : l),
            }
          : g
      )
    );
  };

  const removeLink = (groupId: string, linkIndex: number) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const next = g.links.filter((_, i) => i !== linkIndex);
        return next.length > 0 ? { ...g, links: next } : g;
      })
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(26, 22, 18, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderRadius: 18,
          boxShadow: '0 12px 48px rgba(107, 68, 35, 0.28)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '22px 24px 18px',
            borderBottom: '1px solid rgba(74,47,24,0.08)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            position: 'sticky',
            top: 0,
            background: '#FFFFFF',
            borderRadius: '18px 18px 0 0',
            zIndex: 1,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1612', marginBottom: 4 }}>
              AI-generera Game Plan
            </div>
            <div style={{ fontSize: 13, color: '#7D6E5D', lineHeight: 1.55 }}>
              Beskriv kunden med egna ord — AI:n skriver ett strukturerat utkast som du sedan justerar.
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              flexShrink: 0,
              border: '1px solid rgba(74,47,24,0.10)',
              background: '#F8F4EE',
              color: '#4A4239',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'grid', gap: 20 }}>

          {(form.customer_name.trim() || form.platform.trim() || form.niche.trim()) ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: '#F8F4EE',
                border: '1px solid rgba(74,47,24,0.08)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B4423', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Kundöversikt
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {form.customer_name.trim() ? (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: '#FFFFFF', border: '1px solid rgba(74,47,24,0.08)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#9D8E7D', marginRight: 4 }}>Kund</span>
                    <span style={{ color: '#4A4239' }}>{form.customer_name.trim()}</span>
                  </div>
                ) : null}
                {form.platform.trim() ? (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: '#FFFFFF', border: '1px solid rgba(74,47,24,0.08)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#9D8E7D', marginRight: 4 }}>Plattform</span>
                    <span style={{ color: '#4A4239' }}>{form.platform.trim()}</span>
                  </div>
                ) : null}
                {form.niche.trim() ? (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: '#FFFFFF', border: '1px solid rgba(74,47,24,0.08)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#9D8E7D', marginRight: 4 }}>Nisch</span>
                    <span style={{ color: '#4A4239' }}>{form.niche.trim()}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <FieldBlock
            label="Verksamhetens karaktär"
            hint="Vad gör de, hur länge har de funnits, vilken känsla utstrålar verksamheten?"
          >
            <TextareaField
              value={form.character}
              onChange={(e) => setForm((p) => ({ ...p, character: e.target.value }))}
              placeholder="T.ex. Mysig krog i Gamla Stan, 12 år gamla, känd för husmanskost och handhällt kaffe..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Personalen"
            hint="Vem syns i innehållet? Ägaren, kocken, hela teamet? Vad är deras energi och personlighet?"
          >
            <TextareaField
              value={form.people}
              onChange={(e) => setForm((p) => ({ ...p, people: e.target.value }))}
              placeholder="T.ex. Ägarparet Mia och Johan, jobbar alltid ihop. Glad, jordnära, snabb humor..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Lokal och estetik"
            hint="Beskriv miljön: ljus, material, färger, stämning. Vad ser man i bakgrunden?"
          >
            <TextareaField
              value={form.aesthetic}
              onChange={(e) => setForm((p) => ({ ...p, aesthetic: e.target.value }))}
              placeholder="T.ex. Tegelväggar, varmt ljus, öppet kök, väldig grön växt bakom bardisken..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Vad kunden vill uppnå"
            hint="Vad hoppas de på av TikTok-närvaron? Fler bordsbokningar, lokalt igenkännande, något annat?"
          >
            <TextareaField
              value={form.goals}
              onChange={(e) => setForm((p) => ({ ...p, goals: e.target.value }))}
              placeholder="T.ex. Bli den självklara afterworkplatsen för 25–35-åringar i Södermalm..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Ambitionsnivå och tillgänglighet"
            hint="Hur mycket tid kan de lägga? Är de villiga att synas själva? Vilka dagar passar bäst?"
          >
            <TextareaField
              value={form.effort_level}
              onChange={(e) => setForm((p) => ({ ...p, effort_level: e.target.value }))}
              placeholder="T.ex. Kan filma 2 gånger i veckan, helst vardagar. Ägaren är blyg men med på det..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Något som sticker ut"
            hint="Vad är det unika med just den här kunden? En signaturrätt, en ritual, en historia?"
          >
            <TextareaField
              value={form.unique}
              onChange={(e) => setForm((p) => ({ ...p, unique: e.target.value }))}
              placeholder="T.ex. De bränner sitt eget kaffe, varje måndag delar de med sig av veckans ingrediens..."
              disabled={loading}
            />
          </FieldBlock>

          <FieldBlock
            label="Målgrupp"
            hint="Vem vill de nå? Ålder, intressen, geografi — vad du vet om dem."
          >
            <TextareaField
              value={form.audience}
              onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))}
              placeholder="T.ex. Foodieintresserade 25–40 i Stockholm, följer mat-content och planerar helgutflykter..."
              disabled={loading}
            />
          </FieldBlock>

          {/* ── Referensmaterial ── */}
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
              onClick={() => setShowReferensmaterial((p) => !p)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A1612' }}>
                  Referensmaterial
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#7D6E5D' }}>
                  Profilsidor, videos, artiklar och moodboard-bilder
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B4423' }}>
                {showReferensmaterial ? 'Dölj' : 'Visa'}
              </span>
            </button>

            {showReferensmaterial ? (
              <div style={{ display: 'grid', gap: 16, padding: '0 16px 16px' }}>

                {/* ── Link groups ── */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1612' }}>Länkar</span>
                    <button
                      type="button"
                      onClick={addGroup}
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
                      + Lägg till grupp
                    </button>
                  </div>

                  {groups.length === 0 ? (
                    <div
                      style={{
                        padding: '13px 15px',
                        borderRadius: 12,
                        background: '#FFFFFF',
                        border: '1px dashed rgba(74,47,24,0.16)',
                        color: '#7D6E5D',
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      Lägg till profiler, videos eller artiklar — och skriv vad du gillar med dem.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {groups.map((group) => (
                        <ReferenceGroupCard
                          key={group.id}
                          group={group}
                          disabled={loading}
                          onContextChange={(ctx) => updateGroupContext(group.id, ctx)}
                          onAddLink={() => addLinkToGroup(group.id)}
                          onUpdateLink={(li, field, val) => updateLink(group.id, li, field, val)}
                          onRemoveLink={(li) => removeLink(group.id, li)}
                          onRemoveGroup={() => removeGroup(group.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Images ── */}
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1612' }}>Bilder</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => void handleImageFiles(e)}
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
                        onClick={() => {
                          setShowVisualReferences((p) => !p);
                          if (!showVisualReferences) {
                            setForm((p) => ({ ...p, images: [...p.images, { url: '', caption: '' }] }));
                          }
                        }}
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
                        + Länk
                      </button>
                    </div>
                  </div>

                  {uploadError ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.16)',
                        color: '#b91c1c',
                        fontSize: 12,
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
                              borderRadius: 12,
                              background: '#FFFFFF',
                              border: '1px solid rgba(74,47,24,0.08)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B4423' }}>
                                Bild {index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => setForm((p) => ({
                                  ...p,
                                  images: p.images.filter((_, i) => i !== index),
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

                            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: previewUrl ? '80px minmax(0,1fr)' : '1fr' }}>
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
                                  <img
                                    src={previewUrl}
                                    alt={image.caption || `Referensbild ${index + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                </div>
                              ) : null}
                              <div style={{ display: 'grid', gap: 10 }}>
                                <input
                                  value={image.url}
                                  onChange={(e) => setForm((p) => ({
                                    ...p,
                                    images: p.images.map((cur, i) => i === index ? { ...cur, url: e.target.value } : cur),
                                  }))}
                                  placeholder="Bildlänk (URL)"
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(74,47,24,0.12)',
                                    fontSize: 13,
                                    color: '#4A4239',
                                    background: '#FFFFFF',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                  }}
                                />
                                <input
                                  value={image.caption || ''}
                                  onChange={(e) => setForm((p) => ({
                                    ...p,
                                    images: p.images.map((cur, i) => i === index ? { ...cur, caption: e.target.value } : cur),
                                  }))}
                                  placeholder="Kort caption eller vad bilden signalerar"
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(74,47,24,0.12)',
                                    fontSize: 13,
                                    color: '#4A4239',
                                    background: '#FFFFFF',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : null
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(74,47,24,0.08)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            position: 'sticky',
            bottom: 0,
            background: '#FFFFFF',
            borderRadius: '0 0 18px 18px',
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid rgba(74,47,24,0.12)',
              background: '#FFFFFF',
              color: '#4A4239',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Stäng
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !form.customer_name.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: loading || !form.customer_name.trim()
                ? '#9D8E7D'
                : 'linear-gradient(145deg, #6B4423, #4A2F18)',
              color: '#FAF8F5',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading || !form.customer_name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Genererar utkast...' : '✨ Generera utkast'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReferenceGroupCardProps {
  group: ReferenceGroup;
  disabled: boolean;
  onContextChange: (ctx: string) => void;
  onAddLink: () => void;
  onUpdateLink: (index: number, field: 'url' | 'label', value: string) => void;
  onRemoveLink: (index: number) => void;
  onRemoveGroup: () => void;
}

function ReferenceGroupCard({
  group,
  disabled,
  onContextChange,
  onAddLink,
  onUpdateLink,
  onRemoveLink,
  onRemoveGroup,
}: ReferenceGroupCardProps) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid rgba(74,47,24,0.10)',
        background: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {/* Link rows */}
      <div style={{ padding: '12px 14px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {group.links.map((link, li) => {
            const normalizedUrl = link.url.trim() ? normalizeHref(link.url) : '';
            const platform = normalizedUrl ? detectLinkType(normalizedUrl) : 'external';
            const hasUrl = Boolean(link.url.trim());
            return (
              <span
                key={li}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: hasUrl ? '#F2EADF' : '#F8F4EE',
                  border: '1px solid rgba(74,47,24,0.10)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6B4423',
                }}
              >
                {hasUrl ? (
                  <span aria-hidden="true">{getPlatformIcon(platform)}</span>
                ) : null}
                <span style={{ color: hasUrl ? '#4A2F18' : '#9D8E7D' }}>
                  {hasUrl
                    ? (link.label.trim() || getLinkPlatformLabel(platform))
                    : `Länk ${li + 1}`}
                </span>
              </span>
            );
          })}
        </div>

        {group.links.map((link, li) => (
          <div
            key={li}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto',
              gap: 6,
              marginBottom: 8,
              alignItems: 'center',
            }}
          >
            <input
              value={link.url}
              onChange={(e) => onUpdateLink(li, 'url', e.target.value)}
              placeholder="URL"
              disabled={disabled}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(74,47,24,0.12)',
                fontSize: 12,
                color: '#4A4239',
                background: '#FAFAF9',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <input
              value={link.label}
              onChange={(e) => onUpdateLink(li, 'label', e.target.value)}
              placeholder="Rubrik (valfri)"
              disabled={disabled}
              maxLength={60}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(74,47,24,0.12)',
                fontSize: 12,
                color: '#4A4239',
                background: '#FAFAF9',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => onRemoveLink(li)}
              disabled={disabled || group.links.length <= 1}
              title="Ta bort länk"
              style={{
                border: 'none',
                background: 'transparent',
                color: group.links.length <= 1 ? '#C9B8A8' : '#B45309',
                fontSize: 14,
                fontWeight: 700,
                cursor: disabled || group.links.length <= 1 ? 'default' : 'pointer',
                padding: '4px 2px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onAddLink}
          disabled={disabled}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#6B4423',
            fontSize: 12,
            fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '0 0 10px',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          + Lägg till länk
        </button>
      </div>

      {/* Shared context */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(74,47,24,0.06)',
          background: '#FAFAF9',
        }}
      >
        <textarea
          value={group.context}
          onChange={(e) => onContextChange(e.target.value)}
          placeholder="Vad gillar du här? T.ex. skön ton, bra pacing, varm känsla..."
          disabled={disabled}
          rows={2}
          maxLength={300}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(74,47,24,0.10)',
            fontSize: 12,
            color: '#4A4239',
            background: '#FFFFFF',
            outline: 'none',
            resize: 'vertical',
            minHeight: 56,
            boxSizing: 'border-box',
            lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 14px',
          display: 'flex',
          justifyContent: 'flex-end',
          borderTop: '1px solid rgba(74,47,24,0.06)',
        }}
      >
        <button
          type="button"
          onClick={onRemoveGroup}
          disabled={disabled}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#B45309',
            fontSize: 11,
            fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Ta bort grupp
        </button>
      </div>
    </div>
  );
}
