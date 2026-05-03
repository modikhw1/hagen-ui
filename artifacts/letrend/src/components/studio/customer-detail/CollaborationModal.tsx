'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

export type CollaborationScopeId = 'medverka' | 'skriva' | 'producera' | 'skriva_medverka';

export const COLLABORATION_SCOPE_OPTIONS: Array<{
  id: CollaborationScopeId;
  label: string;
  sub: string | null;
}> = [
  { id: 'medverka', label: 'Medverka i video', sub: null },
  { id: 'skriva', label: 'Skriva sketch / manus', sub: null },
  { id: 'producera', label: 'Producera / regissera', sub: null },
  { id: 'skriva_medverka', label: 'Skriva + medverka', sub: 'LeTrend hanterar klippning & editering' },
];

export type CollaborationFormValues = {
  partner_name: string;
  collaborator_reach: string;
  collaborator_avatar_url: string;
  scope: CollaborationScopeId[];
  date: string;
  date_type: 'exact' | 'projected';
  price: string;
  confirmed: boolean;
  collaboration_note: string;
};

export const EMPTY_COLLABORATION_FORM: CollaborationFormValues = {
  partner_name: '',
  collaborator_reach: '',
  collaborator_avatar_url: '',
  scope: [],
  date: '',
  date_type: 'exact',
  price: '',
  confirmed: false,
  collaboration_note: '',
};

const BROWN = LeTrendColors.brownDark;
const CREAM = LeTrendColors.cream;

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1.5px solid ${LeTrendColors.border}`,
  fontFamily: 'inherit',
  fontSize: 12,
  color: BROWN,
  background: CREAM,
  outline: 'none',
  boxSizing: 'border-box',
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: LeTrendColors.textMuted,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ScopeCheck({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        border: `1.5px solid ${checked ? BROWN : 'rgba(74,47,24,0.25)'}`,
        background: checked ? BROWN : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6">
          <polyline points="1,3 3,5 7,1" stroke={CREAM} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export type CollaborationModalProps = {
  mode: 'create' | 'edit';
  initialValues?: Partial<CollaborationFormValues>;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: CollaborationFormValues) => Promise<void> | void;
};

export function CollaborationModal({
  mode,
  initialValues,
  saving,
  onClose,
  onSave,
}: CollaborationModalProps) {
  const [values, setValues] = React.useState<CollaborationFormValues>({
    ...EMPTY_COLLABORATION_FORM,
    ...(initialValues ?? {}),
  });

  const update = <K extends keyof CollaborationFormValues>(key: K, val: CollaborationFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const toggleScope = (id: CollaborationScopeId) => {
    setValues((prev) => ({
      ...prev,
      scope: prev.scope.includes(id) ? prev.scope.filter((s) => s !== id) : [...prev.scope, id],
    }));
  };

  const canSave = values.partner_name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    await onSave({
      ...values,
      partner_name: values.partner_name.trim(),
      collaborator_reach: values.collaborator_reach.trim(),
      collaborator_avatar_url: values.collaborator_avatar_url.trim(),
      collaboration_note: values.collaboration_note.trim(),
    });
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,12,6,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          width: 360,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 8px 32px rgba(20,12,6,0.18)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BROWN, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✦</span>
            {mode === 'create' ? 'Nytt samarbete' : 'Redigera samarbete'}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: `1px solid ${LeTrendColors.border}`,
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: LeTrendColors.textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <Section label="Profil">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {values.collaborator_avatar_url ? (
              <img
                src={values.collaborator_avatar_url}
                alt={values.partner_name || 'Profil'}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `1.5px solid ${LeTrendColors.border}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  border: `1.5px dashed rgba(74,47,24,0.25)`,
                  background: CREAM,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                  color: LeTrendColors.textMuted,
                }}
              >
                ＋
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={values.partner_name}
                onChange={(e) => update('partner_name', e.target.value)}
                placeholder="Namn"
                style={{ ...inputStyle, width: '100%' }}
              />
              <input
                type="text"
                value={values.collaborator_reach}
                onChange={(e) => update('collaborator_reach', e.target.value)}
                placeholder="Följare (t.ex. 42k)"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
          <input
            type="url"
            value={values.collaborator_avatar_url}
            onChange={(e) => update('collaborator_avatar_url', e.target.value)}
            placeholder="Avatar-URL (valfritt)"
            style={{ ...inputStyle, width: '100%', marginTop: 6 }}
          />
        </Section>

        <Section label="Scope">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {COLLABORATION_SCOPE_OPTIONS.map((o) => {
              const checked = values.scope.includes(o.id);
              return (
                <div
                  key={o.id}
                  onClick={() => toggleScope(o.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleScope(o.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${checked ? BROWN : 'rgba(74,47,24,0.1)'}`,
                    background: checked ? 'rgba(74,47,24,0.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <ScopeCheck checked={checked} />
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: BROWN }}>{o.label}</div>
                    {o.sub && <div style={{ fontSize: 9.5, color: LeTrendColors.textMuted }}>{o.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section label="Datum">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="date"
              value={values.date}
              onChange={(e) => update('date', e.target.value)}
              style={{ flex: 1, ...inputStyle }}
            />
            <select
              value={values.date_type}
              onChange={(e) => update('date_type', e.target.value as 'exact' | 'projected')}
              style={{ flex: 1, ...inputStyle, cursor: 'pointer' }}
            >
              <option value="exact">Exakt datum</option>
              <option value="projected">Projicerat tempo</option>
            </select>
          </div>
        </Section>

        <Section label="Pris">
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: LeTrendColors.textMuted,
                fontWeight: 500,
              }}
            >
              kr
            </span>
            <input
              type="number"
              min={0}
              value={values.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder="0"
              style={{ ...inputStyle, width: '100%', paddingLeft: 26 }}
            />
          </div>
        </Section>

        <Section label="Status">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['Ej bekräftat', 'Bekräftat'] as const).map((label, i) => {
              const isConfirmedOption = i === 1;
              const active = isConfirmedOption === values.confirmed;
              return (
                <div
                  key={label}
                  onClick={() => update('confirmed', isConfirmedOption)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      update('confirmed', isConfirmedOption);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: 7,
                    borderRadius: 8,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: `1.5px solid ${active ? BROWN : 'rgba(74,47,24,0.1)'}`,
                    background: active ? BROWN : 'transparent',
                    color: active ? CREAM : LeTrendColors.textMuted,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </Section>

        <Section label="Notering">
          <textarea
            value={values.collaboration_note}
            onChange={(e) => update('collaboration_note', e.target.value)}
            rows={3}
            placeholder="T.ex. överenskommet via mail 12 feb, profilen tar kontakt om logistik..."
            style={{ ...inputStyle, width: '100%', resize: 'none', lineHeight: 1.5, fontFamily: 'inherit' }}
          />
        </Section>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          style={{
            width: '100%',
            padding: 10,
            borderRadius: 9,
            background: canSave ? BROWN : LeTrendColors.textMuted,
            color: CREAM,
            border: 'none',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Sparar...' : mode === 'create' ? 'Spara samarbete' : 'Spara ändringar'}
        </button>
      </div>
    </div>
  );
}
