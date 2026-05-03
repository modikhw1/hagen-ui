import type React from 'react';
import { LeTrendColors } from '@/styles/letrend-design-system';

export const adminModalInputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1.5px solid ${LeTrendColors.border}`,
  fontFamily: 'inherit',
  fontSize: 12,
  color: LeTrendColors.brownDark,
  background: '#FAF8F5',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

export const adminModalLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: LeTrendColors.textMuted,
};

export const adminModalSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

export const adminModalPrimaryButtonStyle = (
  enabled: boolean = true,
  tone: 'default' | 'danger' = 'default',
): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 9,
  background: enabled
    ? tone === 'danger'
      ? LeTrendColors.error
      : LeTrendColors.brownDark
    : LeTrendColors.textMuted,
  color: '#FAF8F5',
  border: 'none',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'not-allowed',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 34,
});

export const adminModalSecondaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 9,
  background: 'transparent',
  color: LeTrendColors.brownDark,
  border: `1.5px solid ${LeTrendColors.border}`,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 34,
};

export const adminModalAlertStyle = (
  tone: 'info' | 'warning' | 'danger' = 'info',
): React.CSSProperties => {
  const palettes = {
    info: { bg: 'rgba(74,47,24,0.05)', border: 'rgba(74,47,24,0.15)', color: LeTrendColors.brownDark },
    warning: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.25)', color: '#92400e' },
    danger: { bg: 'rgba(197,48,48,0.08)', border: 'rgba(197,48,48,0.25)', color: '#9b1c1c' },
  };
  const p = palettes[tone];
  return {
    background: p.bg,
    border: `1px solid ${p.border}`,
    color: p.color,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 11.5,
    lineHeight: 1.4,
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  };
};

// Tailwind class strings for AdminFormDialog children that already use Tailwind
export const ADMIN_MODAL_INPUT_CLS =
  'w-full rounded-lg border-[1.5px] border-[rgba(74,47,24,0.08)] bg-[#FAF8F5] px-2.5 py-2 text-xs text-[#4A2F18] outline-none transition-colors focus:border-[rgba(74,47,24,0.25)]';

export const ADMIN_MODAL_LABEL_CLS =
  'text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9D8E7D]';
