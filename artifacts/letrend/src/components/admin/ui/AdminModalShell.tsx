'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

const SIZE_WIDTH: Record<NonNullable<AdminModalShellProps['size']>, number> = {
  sm: 360,
  md: 480,
  lg: 640,
  xl: 760,
};

export interface AdminModalShellProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  disableClose?: boolean;
}

export function AdminModalShell({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  disableClose,
}: AdminModalShellProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, disableClose]);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'input,select,textarea,button,[tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !disableClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,12,6,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          width: SIZE_WIDTH[size],
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 8px 32px rgba(20,12,6,0.18)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          color: LeTrendColors.brownDark,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div
              id={titleId}
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: LeTrendColors.brownDark,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>✦</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            </div>
            {description ? (
              <div style={{ fontSize: 11.5, color: LeTrendColors.textMuted, lineHeight: 1.4 }}>{description}</div>
            ) : null}
          </div>
          {!disableClose && (
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
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
        </div>

        {children}

        {footer ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 0 }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AdminModalShell;
