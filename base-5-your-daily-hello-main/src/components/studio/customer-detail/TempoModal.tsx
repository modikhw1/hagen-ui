'use client';

import React from 'react';
import { TEMPO_PRESETS } from '@/lib/feed-planner-utils';
import { LeTrendColors } from '@/styles/letrend-design-system';

const DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

type TempoModalProps = {
  isOpen: boolean;
  tempoWeekdays: number[];
  onClose: () => void;
  onTempoWeekdaysChange: (weekdays: number[]) => Promise<void>;
};

export const TempoModal = React.memo(function TempoModal({
  isOpen,
  tempoWeekdays,
  onClose,
  onTempoWeekdaysChange,
}: TempoModalProps) {
  if (!isOpen) return null;

  const tempoSortedKey = [...tempoWeekdays].sort().join(',');
  const matchedPreset = TEMPO_PRESETS.find(
    (preset) => [...preset.weekdays].sort().join(',') === tempoSortedKey
  );
  const tempoLabel = tempoWeekdays.length === 0
    ? 'Ingen projektion'
    : matchedPreset
      ? `~${matchedPreset.label}`
      : `~${tempoWeekdays.map((day) => DAY_LABELS[day]).join('/')}`;

  const toggleWeekday = (day: number) => {
    const next = tempoWeekdays.includes(day)
      ? tempoWeekdays.filter((currentDay) => currentDay !== day)
      : [...tempoWeekdays, day].sort((left, right) => left - right);
    void onTempoWeekdaysChange(next);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(26,22,18,0.32)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(480px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#4A2F18' }}>Postningsrytm</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', color: LeTrendColors.textMuted }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Förinställningar
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {TEMPO_PRESETS.map((preset) => {
            const isActive = [...preset.weekdays].sort().join(',') === tempoSortedKey;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => void onTempoWeekdaysChange(preset.weekdays)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? '#4A2F18' : 'rgba(74,47,24,0.18)'}`,
                  background: isActive ? '#4A2F18' : 'transparent',
                  color: isActive ? 'white' : LeTrendColors.textMuted,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: LeTrendColors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Anpassade dagar
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {DAY_LABELS.map((label, index) => {
            const active = tempoWeekdays.includes(index);
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleWeekday(index)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: `1px solid ${active ? '#4A2F18' : 'rgba(74,47,24,0.18)'}`,
                  background: active ? '#4A2F18' : 'transparent',
                  color: active ? 'white' : LeTrendColors.textMuted,
                  fontSize: 11,
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {label.slice(0, 2)}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic', opacity: 0.7 }}>
          {tempoLabel}
        </div>
      </div>
    </div>
  );
});
